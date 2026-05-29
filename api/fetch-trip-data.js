// Vercel serverless function to fetch trip data from Coda doc on-demand
// Returns the same data structure that sync.mjs generates, but as JSON

export default async function handler(req, res) {
  console.log('fetch-trip-data called, method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl } = req.body;
  console.log('docUrl:', docUrl);
  
  if (!docUrl) {
    return res.status(400).json({ error: 'Missing docUrl' });
  }

  const CODA_TOKEN = process.env.CODA_TOKEN;
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
      flights: 'All flights'
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

    // Fetch column maps
    const itnCols = await fetchColumns(tables.itinerary);
    const actCols = await fetchColumns(tables.activities);
    const todoCols = await fetchColumns(tables.todos);
    const flCols = await fetchColumns(tables.flights);

    const ITN_MAP = buildColumnMap(itnCols);
    const ACT_MAP = buildColumnMap(actCols);
    const TODO_MAP = buildColumnMap(todoCols);
    const FL_MAP = buildColumnMap(flCols);

    // Helper to fetch rows with pagination
    async function fetchAllRows(tableId) {
      let allRows = [];
      let pageToken = null;
      
      do {
        const url = new URL(`https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/rows`);
        url.searchParams.set('useColumnNames', 'false');
        url.searchParams.set('valueFormat', 'simple');
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
    const [itnRows, actRows, todoRows, flRows] = await Promise.all([
      fetchAllRows(tables.itinerary),
      fetchAllRows(tables.activities),
      fetchAllRows(tables.todos),
      fetchAllRows(tables.flights)
    ]);

    // Helper to strip markdown code fences
    function stripFence(str) {
      if (!str) return '';
      return String(str).replace(/```/g, '').trim();
    }

    // Helper to convert Coda date to YYYY-MM-DD
    function cellToDate(cell) {
      if (!cell) return null;
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

    // Build activities array
    const activities = actRows.map(row => {
      const v = row.values;
      const actDate = cellToDate(v[ACT_MAP['Date']]);
      if (!actDate) return null;
      const day = days.find(d => d.date === actDate)?.n;
      if (!day) return null;
      
      return {
        id: row.id,
        day: day,
        time: String(v[ACT_MAP['Time of Day']]?.name || v[ACT_MAP['Time of Day']] || ''),
        name: stripFence(v[ACT_MAP['Activity']] || ''),
        desc: stripFence(v[ACT_MAP['Description']] || ''),
        url: stripFence(v[ACT_MAP['More Info']] || ''),
        cat: stripFence(v[ACT_MAP['Category']]?.name || v[ACT_MAP['Category']] || ''),
        lat: v[ACT_MAP['Latitude']] || null,
        lng: v[ACT_MAP['Longitude']] || null
      };
    }).filter(Boolean);

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
    return res.status(200).json({
      trip: {
        title: 'Trip',
        start: tripStart,
        end: tripEnd
      },
      days,
      activities,
      todos,
      flights,
      categories,
      timesOfDay,
      lastGenerated: new Date().toISOString()
    });

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
