// Vercel serverless function to fetch trip data from Coda doc on-demand
// Returns the same data structure that sync.mjs generates, but as JSON

export default async function handler(req, res) {
  console.log('fetch-trip-data called, method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl, token } = req.body;
  console.log('docUrl:', docUrl, 'hasToken:', !!token);
  
  if (!docUrl) {
    return res.status(400).json({ error: 'Missing docUrl' });
  }

  // Use provided token, or fall back to main CODA_TOKEN
  const CODA_TOKEN = token || process.env.CODA_TOKEN;
  if (!CODA_TOKEN) {
    console.error('CODA_TOKEN not set in environment');
    return res.status(500).json({ error: 'Server configuration error: CODA_TOKEN not set' });
  }

  // Extract doc ID from URL
  function parseDocId(input) {
    if (!input) return null;
    const urlMatch = input.match(/_d([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    if (!input.includes('/') && !input.includes(':')) return input;
    return null;
  }

  const docId = parseDocId(docUrl);
  console.log('parsed docId:', docId);
  
  if (!docId) {
    return res.status(400).json({ error: 'Invalid Coda doc URL' });
  }

  try {
    // Fetch tables
    const tablesResp = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables`, {
      headers: {
        'Authorization': `Bearer ${CODA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!tablesResp.ok) {
      throw new Error(`Failed to fetch tables: ${tablesResp.status}`);
    }

    const tablesData = await tablesResp.json();
    const tables = {};
    
    const TABLE_NAMES = {
      itinerary: 'Itinerary',
      activities: 'All activities',
      todos: 'To do list',
      flights: 'All flights',
      hotels: 'All Hotels'
    };

    for (const [key, name] of Object.entries(TABLE_NAMES)) {
      const table = tablesData.items.find(t => t.name === name);
      if (!table) {
        throw new Error(`Table '${name}' not found in doc`);
      }
      tables[key] = table.id;
    }

    // Helper to fetch columns for a table
    async function fetchColumns(tableId) {
      const resp = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/columns`, {
        headers: {
          'Authorization': `Bearer ${CODA_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      if (!resp.ok) throw new Error(`Failed to fetch columns for ${tableId}`);
      const data = await resp.json();
      return data.items;
    }

    // Helper to build column name → ID map
    function buildColumnMap(columns) {
      const map = {};
      for (const col of columns) {
        map[col.name] = col.id;
      }
      return map;
    }

    function mapCol(map, ...names) {
      for (const name of names) {
        if (map[name]) return map[name];
      }
      return null;
    }

    function mapColLoose(map, columns, ...candidates) {
      const direct = mapCol(map, ...candidates.filter(c => typeof c === 'string'));
      if (direct) return direct;
      for (const col of columns) {
        for (const cand of candidates) {
          if (typeof cand === 'string' && col.name.toLowerCase() === cand.toLowerCase()) return col.id;
          if (cand instanceof RegExp && cand.test(col.name)) return col.id;
        }
      }
      return null;
    }

    function cellText(v) {
      if (v == null) return '';
      if (typeof v === 'string') return stripFence(v);
      if (typeof v === 'number') return String(v);
      if (typeof v === 'boolean') return String(v);
      if (Array.isArray(v)) {
        for (const item of v) {
          const t = cellText(item);
          if (t) return t;
        }
        return '';
      }
      if (typeof v === 'object') {
        if (typeof v.display === 'string') return stripFence(v.display);
        if (typeof v.formattedValue === 'string') return stripFence(v.formattedValue);
        if (typeof v.name === 'string') return stripFence(v.name);
        if (typeof v.value === 'string') return stripFence(v.value);
        if (typeof v.url === 'string') return v.url;
      }
      return stripFence(String(v));
    }

    // Column ids from the original trip template — used when a column is renamed in Coda
    // but still maps to the same id (see sync.mjs ACT fallbacks).
    const ACT_TEMPLATE_IDS = {
      date: 'c-K7xOu63CvF',
      timeOfDay: 'c-NhewZvUbdQ',
      activity: 'c-WNA7XAkEYm',
      description: 'c-6VLWareh3p',
      moreInfo: 'c-OOu-mpFiAD',
      category: 'c-vAMQo8XJAc',
      latitude: 'c-1oOmaseFGM',
      longitude: 'c-tmpeKQQks2'
    };

    function resolveCol(map, columns, templateKey, nameCandidates, actRows) {
      const candidates = [];
      const byName = mapColLoose(map, columns, ...nameCandidates);
      if (byName) candidates.push(byName);
      const templateId = ACT_TEMPLATE_IDS[templateKey];
      if (templateId) candidates.push(templateId);

      let best = null;
      let bestCount = -1;
      for (const id of [...new Set(candidates.filter(Boolean))]) {
        const count = actRows.slice(0, 25).filter(r => cellText(r.values?.[id])).length;
        if (count > bestCount) {
          best = id;
          bestCount = count;
        }
      }
      return best;
    }

    function inferActivityCol(actCols, actRows) {
      const skip = /date|time of day|category|lat|long|description|more info|url|link|notes|emoji|priority|duration|cost/i;
      let bestId = null;
      let bestScore = 0;
      for (const col of actCols) {
        if (skip.test(col.name)) continue;
        const texts = actRows
          .map(r => cellText(r.values?.[col.id]))
          .filter(t => t && t.length >= 4 && t.length < 200 && !/^https?:\/\//i.test(t));
        if (!texts.length) continue;
        const score = texts.length + texts.reduce((sum, t) => sum + Math.min(t.length, 40), 0) / 40;
        if (score > bestScore) {
          bestScore = score;
          bestId = col.id;
        }
      }
      return bestId;
    }

    // Fetch column maps
    const itnCols = await fetchColumns(tables.itinerary);
    const actCols = await fetchColumns(tables.activities);
    const todoCols = await fetchColumns(tables.todos);
    const flCols = await fetchColumns(tables.flights);
    const htlCols = await fetchColumns(tables.hotels);

    const ITN_MAP = buildColumnMap(itnCols);
    const ACT_MAP = buildColumnMap(actCols);
    const TODO_MAP = buildColumnMap(todoCols);
    const FL_MAP = buildColumnMap(flCols);
    const HTL_MAP = buildColumnMap(htlCols);

    // Helper to fetch rows with pagination
    async function fetchAllRows(tableId, valueFormat = 'simple') {
      let allRows = [];
      let pageToken = null;
      
      do {
        const url = new URL(`https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/rows`);
        url.searchParams.set('useColumnNames', 'false');
        url.searchParams.set('valueFormat', valueFormat);
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        
        const resp = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${CODA_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!resp.ok) throw new Error(`Failed to fetch rows from ${tableId}`);
        const data = await resp.json();
        allRows = allRows.concat(data.items);
        pageToken = data.nextPageToken;
      } while (pageToken);
      
      return allRows;
    }

    // Fetch all rows
    const [itnRows, actRows, todoRows, flRows, htlRows] = await Promise.all([
      fetchAllRows(tables.itinerary),
      fetchAllRows(tables.activities, 'rich'),
      fetchAllRows(tables.todos),
      fetchAllRows(tables.flights),
      fetchAllRows(tables.hotels)
    ]);

    // Helper to strip markdown code fences
    function stripFence(str) {
      if (!str) return '';
      return String(str).replace(/```/g, '').trim();
    }

    // Helper to convert Coda date to YYYY-MM-DD
    function cellToDate(cell) {
      if (!cell) return null;
      if (typeof cell === 'object' && typeof cell.epoch === 'number') {
        return new Date(cell.epoch * 1000).toISOString().slice(0, 10);
      }
      const s = typeof cell === 'string' ? cell : cell?.value;
      if (typeof s === 'string') {
        const d = new Date(s);
        if (isFinite(d)) return d.toISOString().slice(0, 10);
      }
      return null;
    }

    // Helper to format time from seconds
    function fmtTimeSeconds(sec) {
      if (!sec && sec !== 0) return '';
      const d = new Date(sec * 1000);
      const h = d.getUTCHours();
      const m = d.getUTCMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    // Helper to extract airport code from city name
    function deriveAirportCode(city) {
      if (!city) return '';
      const match = city.match(/\(([A-Z]{3})\)/);
      return match ? match[1] : '';
    }

    // Generic color palette for days
    const COLORS = ['#5c6f87', '#1e6a9a', '#8e44ad', '#c0392b', '#b25a14', '#0e7560', '#c56c94', '#2980b9', '#16a085', '#d35400', '#7f8c8d'];

    // Build days array
    const days = itnRows.map((row, index) => {
      const v = row.values;
      const overview = stripFence(v[ITN_MAP['Overview']] || '');
      const dayNum = parseInt(overview.match(/Day (\d+)/)?.[1] ?? (index + 1), 10);
      const title = overview.replace(/^Day \d+:\s*/, '');
      const locRaw = v[ITN_MAP['Location']]?.name || v[ITN_MAP['Location']] || '';
      const loc = String(locRaw).replace(/^[^\w]+\s*/, '').trim();
      
      return {
        n: dayNum,
        date: cellToDate(v[ITN_MAP['Date']]) || '',
        title: title,
        loc: loc,
        country: '',
        flag: '',
        lat: null,
        lng: null,
        color: COLORS[dayNum % COLORS.length],
        overview: overview,
        notes: stripFence(v[ITN_MAP['Notes']] || ''),
        hero: stripFence(v[ITN_MAP['Image URL']] || ''),
        desc: stripFence(v[ITN_MAP['Description']] || '')
      };
    });

    // Resolve activity column ids (handles renamed Coda columns + template fallbacks)
    const ACT = {
      date: resolveCol(ACT_MAP, actCols, 'date', ['Date'], actRows),
      timeOfDay: resolveCol(ACT_MAP, actCols, 'timeOfDay', ['Time of Day'], actRows),
      activity: inferActivityCol(actCols, actRows) || resolveCol(ACT_MAP, actCols, 'activity', ['Activity', 'Name', 'Place', 'Title', /^activity/i], actRows),
      description: resolveCol(ACT_MAP, actCols, 'description', ['Description', 'Desc', 'Notes', /^description/i], actRows),
      moreInfo: resolveCol(ACT_MAP, actCols, 'moreInfo', ['More Info', 'URL', 'Link', 'Website', /^more info/i], actRows),
      category: resolveCol(ACT_MAP, actCols, 'category', ['Category'], actRows),
      latitude: resolveCol(ACT_MAP, actCols, 'latitude', ['Latitude', 'Lat'], actRows),
      longitude: resolveCol(ACT_MAP, actCols, 'longitude', ['Longitude', 'Lng', 'Long'], actRows)
    };

    // Build activities array
    const UNSCHEDULED_DAY = 0;
    const activities = actRows.map(row => {
      const v = row.values;
      const actDate = cellToDate(v[ACT.date]);
      const activity = {
        id: row.id,
        time: cellText(v[ACT.timeOfDay]?.name || v[ACT.timeOfDay]),
        name: cellText(v[ACT.activity]),
        desc: cellText(v[ACT.description]),
        url: cellText(v[ACT.moreInfo]),
        cat: cellText(v[ACT.category]?.name || v[ACT.category]),
        lat: v[ACT.latitude] ?? null,
        lng: v[ACT.longitude] ?? null
      };
      if (!actDate) return { ...activity, day: UNSCHEDULED_DAY };
      const day = days.find(d => d.date === actDate)?.n;
      if (!day) return null;

      return { ...activity, day };
    }).filter(a => a && (a.day === UNSCHEDULED_DAY || a.day));

    // Build todos array
    const todos = todoRows.map(row => {
      const v = row.values;
      const priorityRaw = v[TODO_MAP['Priority']]?.name || v[TODO_MAP['Priority']] || '';
      const priority = String(priorityRaw).replace(/^[^\w]+\s*/, '').trim();
      return {
        id: row.id,
        priority: priority,
        item: String(v[TODO_MAP['Item']] || ''),
        type: String(v[TODO_MAP['Type']]?.name || v[TODO_MAP['Type']] || ''),
        day: String(v[TODO_MAP['Day']] || ''),
        whenToBook: String(v[TODO_MAP['When to Book']] || ''),
        link: String(v[TODO_MAP['Link']]?.url || v[TODO_MAP['Link']] || ''),
        why: String(v[TODO_MAP['Why']] || ''),
        rec: String(v[TODO_MAP['Rec']] || '')
      };
    });

    // Build flights array
    const flights = flRows.map(row => {
      const v = row.values;
      const airline = String(v[FL_MAP['Airline']] || '');
      const flightNum = String(v[FL_MAP['Flight #']] || '');
      const fromCity = String(v[FL_MAP['From']] || '');
      const toCity = String(v[FL_MAP['To']] || '');
      
      return {
        trip: String(v[FL_MAP['Trip']] || ''),
        airline: airline,
        number: `${airline ? airline.split(' ')[0] : ''} ${flightNum}`.trim(),
        from: String(v[FL_MAP['From (code)']] || '') || deriveAirportCode(fromCity),
        to: String(v[FL_MAP['To (code)']] || '') || deriveAirportCode(toCity),
        fromCity: fromCity,
        toCity: toCity,
        date: cellToDate(v[FL_MAP['Date']]) || '',
        depart: fmtTimeSeconds(v[FL_MAP['Depart Time']]?.seconds),
        arrive: fmtTimeSeconds(v[FL_MAP['Arrive Time']]?.seconds)
      };
    });

    const hotels = htlRows.map(row => {
      const v = row.values;
      return {
        name: v[HTL_MAP['Hotel Name']]?.name || String(v[HTL_MAP['Hotel Name']] || ''),
        city: v[HTL_MAP['City']]?.name || String(v[HTL_MAP['City']] || ''),
        startDate: cellToDate(v[HTL_MAP['Start Date']]) || '',
        endDate: cellToDate(v[HTL_MAP['End Date']]) || '',
        nights: v[HTL_MAP['Nights']] || 0,
        roomType: String(v[HTL_MAP['Room Type']] || ''),
        address: String(v[HTL_MAP['Address']] || ''),
        lat: v[HTL_MAP['Latitude']] || null,
        lng: v[HTL_MAP['Longitude']] || null
      };
    });

    // Calculate trip metadata
    const allDates = days.map(d => d.date).filter(Boolean);
    const tripStart = allDates.length > 0 ? allDates[0] : '';
    const tripEnd = allDates.length > 0 ? allDates[allDates.length - 1] : '';

    // Build categories and timesOfDay (match data.js structure)
    const categories = {
      'Food': { label: 'Food', emoji: '🍜' },
      'Temple': { label: 'Temple', emoji: '⛩️' },
      'Hotel': { label: 'Hotel', emoji: '🏨' },
      'Transit': { label: 'Transit', emoji: '🚆' },
      'Culture': { label: 'Culture', emoji: '🎭' },
      'Nature': { label: 'Nature', emoji: '🌿' },
      'Sightseeing': { label: 'Sightseeing', emoji: '📍' },
      'Shopping': { label: 'Shopping', emoji: '🛍️' },
      'Entertainment': { label: 'Entertainment', emoji: '🎟️' },
      'Wellness': { label: 'Wellness', emoji: '💆' },
      'Flight': { label: 'Flight', emoji: '✈️' }
    };

    const timesOfDay = [
      { id: 'Morning', emoji: '🌅' },
      { id: 'Afternoon', emoji: '☀️' },
      { id: 'Evening', emoji: '🌆' },
      { id: 'Late Night', emoji: '🌙' }
    ];

    // Return the data structure
    const payload = {
      trip: {
        title: 'Trip',
        start: tripStart,
        end: tripEnd
      },
      days,
      activities,
      todos,
      flights,
      hotels,
      categories,
      timesOfDay,
      lastGenerated: new Date().toISOString()
    };

    if (req.body.debug) {
      const sampleRow = actRows.find(r => r.id === 'i-re_ngHfBWS') || actRows[0];
      payload._debug = {
        actColumns: actCols.map(c => ({ name: c.name, id: c.id })),
        inferredActivity: ACT.activity,
        sampleValues: sampleRow?.values,
        sampleExtracted: Object.fromEntries(
          actCols.map(c => [c.name, cellText(sampleRow?.values?.[c.id])])
        )
      };
    }

    return res.status(200).json(payload);

  } catch (error) {
    console.error('Error fetching trip data:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Failed to fetch trip data',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
