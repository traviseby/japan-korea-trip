// Vercel serverless function to fetch trip data from Coda doc on-demand
// Returns the same data structure that sync.mjs generates, but as JSON
const FETCH_TRIP_DATA_VERSION = '2026-07-16-sort-days';

export default async function handler(req, res) {
  console.log('fetch-trip-data called, method:', req.method, 'version:', FETCH_TRIP_DATA_VERSION);
  
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

  const stream = !!req.body?.stream;

  try {
    const writeLine = stream
      ? (obj) => { if (!res.writableEnded) res.write(`${JSON.stringify(obj)}\n`); }
      : () => {};
    const report = (stage, value) => writeLine({ type: 'progress', stage, value });

    if (stream) {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
    }

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
      itinerary: ['Itinerary'],
      activities: ['All activities'],
      todos: ['To do list'],
      flights: ['All Flights', 'All flights'],
      hotels: ['All Hotels'],
      events: ['All Tickets', 'All Events'],
      carRentals: ['All Car Rentals']
    };

    function findTable(items, names) {
      const candidates = Array.isArray(names) ? names : [names];
      for (const name of candidates) {
        const table = items.find(t => t.name === name);
        if (table) return table;
      }
      for (const name of candidates) {
        const lower = name.toLowerCase();
        const table = items.find(t => t.name.toLowerCase() === lower);
        if (table) return table;
      }
      return null;
    }

    for (const [key, names] of Object.entries(TABLE_NAMES)) {
      const table = findTable(tablesData.items, names);
      if (!table) {
        const tried = (Array.isArray(names) ? names : [names]).join(', ');
        const available = tablesData.items.map(t => t.name).join(', ');
        throw new Error(`Table not found (tried: ${tried}). Available: ${available}`);
      }
      tables[key] = table.id;
    }

    report('tables', 0.26);

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

    function extractSlateText(node) {
      if (!node) return '';
      if (typeof node.text === 'string') return node.text;
      if (Array.isArray(node.children)) {
        // If children are "Line" elements (Slate paragraphs/list items), join with newlines
        const hasLineChildren = node.children.some(child => child?.type === 'Line');
        if (hasLineChildren) {
          return node.children.map(extractSlateText).filter(Boolean).join('\n');
        }
        // Otherwise just concatenate text
        return node.children.map(extractSlateText).join('');
      }
      return '';
    }

    function cellNumber(v) {
      if (v == null) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'object' && typeof v.scalar === 'number') return v.scalar;
      const n = parseInt(cellText(v), 10);
      return Number.isFinite(n) ? n : null;
    }

    function cellCoord(v) {
      const n = cellNumber(v);
      return n == null ? null : n;
    }

    function warnMissingColumns(tableName, colMap, requiredNames) {
      const missing = requiredNames.filter(name => !colMap[name]);
      if (missing.length) {
        console.warn(`[${tableName}] Missing expected columns: ${missing.join(', ')}`);
      }
      return missing;
    }

    function todoDayLabel(v, todoMap, activities, days) {
      const activityCell = v[todoMap['Activity']];
      const activityId = activityCell?.identifier
        || (typeof activityCell === 'string' ? activityCell : null);
      if (activityId) {
        const act = activities.find(a => a.id === activityId);
        if (act?.day) return `Day ${act.day}`;
      }
      const ideal = cellText(v[todoMap['Ideal Reservation Time']]);
      if (ideal) return ideal;
      const why = cellText(v[todoMap['Why It Matters'] ?? todoMap['Why']]);
      const dayMatch = why.match(/\bDay\s+(\d+)\b/i);
      if (dayMatch) return `Day ${dayMatch[1]}`;
      return cellText(v[todoMap['When to Book / Do'] ?? todoMap['When to Book']]) || '';
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
        if (v.type === 'slate' && v.root) return extractSlateText(v.root).trim();
        if (typeof v.display === 'string') return stripFence(v.display);
        if (typeof v.formattedValue === 'string') return stripFence(v.formattedValue);
        if (typeof v.name === 'string') return stripFence(v.name);
        if (typeof v.value === 'string') return stripFence(v.value);
        if (typeof v.url === 'string') return v.url;
      }
      return stripFence(String(v));
    }

    function cellCost(v) {
      if (v == null || v === '') return null;
      if (typeof v === 'number') return v;
      if (typeof v === 'object') {
        if (typeof v.scalar === 'number') return v.scalar;
        if (typeof v.value === 'number') return v.value;
      }
      const n = parseFloat(String(v));
      return Number.isFinite(n) ? n : null;
    }

    function cellReceipt(v) {
      if (!v) return { name: '', url: '' };
      const items = Array.isArray(v) ? v : [v];
      for (const item of items) {
        if (typeof item === 'string' && item) return { name: item, url: '' };
        if (item && typeof item === 'object') {
          const name = item.name || '';
          const url = typeof item.url === 'string' ? item.url : '';
          if (url) return { name: name || 'Receipt', url };
          if (name) return { name, url: '' };
        }
      }
      return { name: '', url: '' };
    }

    function fmtTimeSeconds(sec) {
      if (typeof sec !== 'number' || !Number.isFinite(sec)) return '';
      const s = ((sec % 86400) + 86400) % 86400;
      const h24 = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    function parseClockString(str) {
      if (!str) return null;
      const s = stripFence(String(str)).trim();
      const iso = s.match(/T(\d{1,2}):(\d{2})(?::\d{2})?/);
      if (iso) return parseInt(iso[1], 10) * 3600 + parseInt(iso[2], 10) * 60;
      const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (m12) {
        let h = parseInt(m12[1], 10);
        const min = parseInt(m12[2], 10);
        const ampm = m12[3].toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return h * 3600 + min * 60;
      }
      const m24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (m24) return parseInt(m24[1], 10) * 3600 + parseInt(m24[2], 10) * 60;
      return null;
    }

    function cellTimeDisplay(v) {
      if (v == null || v === '') return '';
      if (typeof v === 'number') return fmtTimeSeconds(v);
      if (typeof v === 'string') {
        const sec = parseClockString(v);
        if (sec != null) return fmtTimeSeconds(sec);
        const cleaned = stripFence(v);
        if (cleaned && !/^\d{4}-\d{2}-\d{2}T/.test(cleaned)) return cleaned;
        return '';
      }
      if (typeof v === 'object') {
        if (typeof v.seconds === 'number') return fmtTimeSeconds(v.seconds);
        for (const key of ['formatted', 'display', 'formattedValue', 'input', 'name']) {
          if (typeof v[key] !== 'string') continue;
          const sec = parseClockString(v[key]);
          if (sec != null) return fmtTimeSeconds(sec);
        }
        for (const key of ['formatted', 'display', 'formattedValue']) {
          const cleaned = stripFence(v[key]);
          if (cleaned) return cleaned;
        }
      }
      return '';
    }

    function moreInfoFromCell(v) {
      if (v == null) return '';
      if (typeof v === 'object' && typeof v.url === 'string') return stripFence(v.url);
      return cellText(v);
    }

    // Column ids from the original trip template — used when a column is renamed in Coda
    // but still maps to the same id (see sync.mjs ACT fallbacks).
    const ACT_TEMPLATE_IDS = {
      date: 'c-K7xOu63CvF',
      timeOfDay: 'c-NhewZvUbdQ',
      activity: 'c-WNA7XAkEYm',
      description: 'c-hFjRSpkKWQ',
      moreInfo: 'c-OOu-mpFiAD',
      category: 'c-vAMQo8XJAc',
      address: 'c-K-ELDiAS2l',
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
      const skip = /date|time of day|category|lat|long|address|description|more info|url|link|notes|emoji|priority|duration|cost|tips|tip|city/i;
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
    const evtCols = await fetchColumns(tables.events);
    const carCols = await fetchColumns(tables.carRentals);

    const ITN_MAP = buildColumnMap(itnCols);
    const ACT_MAP = buildColumnMap(actCols);
    const TODO_MAP = buildColumnMap(todoCols);
    const FL_MAP = buildColumnMap(flCols);
    const HTL_MAP = buildColumnMap(htlCols);
    const EVT_MAP = buildColumnMap(evtCols);
    const CAR_MAP = buildColumnMap(carCols);

    warnMissingColumns('Itinerary', ITN_MAP, ['Date', 'Title', 'Day', 'Overview', 'Location', 'Notes', 'Image URL', 'Description']);
    warnMissingColumns('All activities', ACT_MAP, ['Date', 'Time of Day', 'Description', 'Category', 'More Info']);
    if (!ACT_MAP['Name'] && !ACT_MAP['Activity']) {
      console.warn('[All activities] Missing expected columns: Name');
    }
    warnMissingColumns('To do list', TODO_MAP, ['Priority', 'Item', 'Type', 'When to Book / Do', 'Reservation Link', 'Why It Matters', 'My Recommendation']);
    warnMissingColumns('All Flights', FL_MAP, ['Airline', 'Flight #', 'Depart Date', 'Depart City', 'Arrive City', 'Departure Code', 'Arrival Code', 'Receipt']);
    warnMissingColumns('All Hotels', HTL_MAP, ['Name', 'City', 'Start Date', 'End Date', 'Address', 'Latitude', 'Longitude']);
    warnMissingColumns('All Tickets', EVT_MAP, ['Name', 'Provider', 'Date', 'Start Time', 'Address', 'Receipt']);
    warnMissingColumns('All Car Rentals', CAR_MAP, ['Provider', 'Pick-up Date', 'Pick-up Time', 'Return Date', 'Address', 'Car Type']);

    report('columns', 0.30);

    // Helper to fetch rows with pagination
    async function fetchAllRows(tableId, valueFormat = 'simple', sortBy = null) {
      let allRows = [];
      let pageToken = null;
      
      do {
        const url = new URL(`https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/rows`);
        url.searchParams.set('useColumnNames', 'false');
        url.searchParams.set('valueFormat', valueFormat);
        if (sortBy) url.searchParams.set('sortBy', sortBy);
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

    // Fetch all rows — report progress as each table finishes.
    const rowBuckets = {};
    await Promise.all([
      ['itinerary', tables.itinerary, 'simple', 0.36],
      ['flights', tables.flights, 'rich', 0.58],
      ['hotels', tables.hotels, 'simple', 0.78],
      ['events', tables.events, 'rich', 0.85],
      ['carRentals', tables.carRentals, 'rich', 0.88],
      ['activities', tables.activities, 'rich', 0.92, 'natural'],
      ['todos', tables.todos, 'simple', null],
    ].map(async ([key, tableId, valueFormat, progressValue, sortBy]) => {
      rowBuckets[key] = await fetchAllRows(tableId, valueFormat, sortBy);
      if (progressValue != null) report(key, progressValue);
    }));

    const itnRows = rowBuckets.itinerary;
    const actRows = rowBuckets.activities;
    const todoRows = rowBuckets.todos;
    const flRows = rowBuckets.flights;
    const htlRows = rowBuckets.hotels;
    const evtRows = rowBuckets.events;
    const carRows = rowBuckets.carRentals;

    report('parsing', 0.94);

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
      let s = typeof cell === 'string' ? cell : cell?.value;
      if (typeof s === 'string') {
        s = stripFence(s);
        const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
        if (isoMatch) return isoMatch[1];
        const d = new Date(s);
        if (isFinite(d)) return d.toISOString().slice(0, 10);
      }
      return null;
    }

    const FL_TEMPLATE_IDS = {
      airline: 'c-0zYwnaPiLh',
      fromCode: 'c-cAehzbeRgZ',
      toCode: 'c-XaRMQUIlCB',
      number: 'c-4j5mHMi2lp',
      date: 'c-zi1_WL4Z5_',
      fromCity: 'c-0PM_8S1PJ1',
      departTime: 'c-QDdLu0WGdF',
      toCity: 'c-gwntR7jmva',
      arriveTime: 'c-FZuDLcOtcn',
      arriveDate: 'c-7VGJFVjGCi',
      receipt: 'c-O8VedL3PU4',
      cost: 'c-tuKKd6A0D8',
      bookingCode: 'c-FXStD-KBA2'
    };
    const EVT_TEMPLATE_IDS = {
      time: 'c-ZVDsJccngI',
      endTime: 'c-xiG4Fcu5H3'
    };
    const CAR_TEMPLATE_IDS = {
      provider: 'c-PS-TKGxgsQ',
      bookingCode: 'c-lrtyYT4qXg',
      pickupDate: 'c-orqKRPUA30',
      pickupTime: 'c-c52yNMQgbK',
      returnDate: 'c-dFfzC0AzGn',
      returnTime: 'c--Lw3065zU4',
      address: 'c-tHw5yKk5VZ',
      returnAddress: 'c-wlAzyfxacy',
      carType: 'c-pMZjbHr5Dz',
      cost: 'c-3qSW1C1Fpy',
      notes: 'c-x0lUlyXl3F',
      receipt: 'c-meN57e8B_8',
      latitude: 'c-ISU8SvVMeQ',
      longitude: 'c-EJvsYxIQMw'
    };

    function resolveCarCol(map, templateKey, ...names) {
      return mapCol(map, ...names) || CAR_TEMPLATE_IDS[templateKey] || null;
    }

    function resolveFlCol(map, templateKey, ...names) {
      return mapCol(map, ...names) || FL_TEMPLATE_IDS[templateKey] || null;
    }

    function flightTripLabel(fromCity, toCity) {
      const from = String(fromCity || '').trim();
      const to = String(toCity || '').trim();
      if (from && to) return `${from} → ${to}`;
      return from || to || '';
    }

    // Helper to extract airport code from city name
    function deriveAirportCode(city) {
      if (!city) return '';
      const match = city.match(/\(([A-Z]{3})\)/);
      return match ? match[1] : '';
    }

    // Generic color palette for days
    const COLORS = ['#5c6f87', '#1e6a9a', '#8e44ad', '#c0392b', '#b25a14', '#0e7560', '#c56c94', '#2980b9', '#16a085', '#d35400', '#7f8c8d'];

    // Build days array (Coda row order is not chronological — sort by day number)
    const days = itnRows.map((row, index) => {
      const v = row.values;
      const overviewText = cellText(v[ITN_MAP['Overview']]);
      const title = cellText(v[ITN_MAP['Title']]) || overviewText.replace(/^Day \d+:\s*/, '');
      const dayNum = cellNumber(v[ITN_MAP['Day']])
        ?? parseInt(overviewText.match(/Day (\d+)/)?.[1] ?? (index + 1), 10);
      const overview = overviewText || (dayNum && title ? `Day ${dayNum}: ${title}` : '');
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
    }).sort((a, b) => (a.n || 0) - (b.n || 0) || String(a.date).localeCompare(String(b.date)));

    // Resolve activity column ids (handles renamed Coda columns + template fallbacks)
    const ACT = {
      date: resolveCol(ACT_MAP, actCols, 'date', ['Date'], actRows),
      timeOfDay: resolveCol(ACT_MAP, actCols, 'timeOfDay', ['Time of Day'], actRows),
      activity: inferActivityCol(actCols, actRows) || resolveCol(ACT_MAP, actCols, 'activity', ['Name', 'Activity', 'Place', 'Title', /^activity/i], actRows),
      description: resolveCol(ACT_MAP, actCols, 'description', ['Description', 'Desc', 'Notes', /^description/i], actRows),
      moreInfo: resolveCol(ACT_MAP, actCols, 'moreInfo', ['More Info', 'URL', 'Link', 'Website', /^more info/i], actRows),
      category: resolveCol(ACT_MAP, actCols, 'category', ['Category'], actRows),
      address: resolveCol(ACT_MAP, actCols, 'address', ['Address', 'Location'], actRows),
      latitude: resolveCol(ACT_MAP, actCols, 'latitude', ['Latitude', 'Lat'], actRows),
      longitude: resolveCol(ACT_MAP, actCols, 'longitude', ['Longitude', 'Lng', 'Long'], actRows),
      tips: resolveCol(ACT_MAP, actCols, 'tips', ['Tips', 'Tip'], actRows)
    };

    // Build activities array
    const UNSCHEDULED_DAY = 0;
    const activities = actRows.map((row, order) => {
      const v = row.values;
      const actDate = cellToDate(v[ACT.date]);
      const activity = {
        id: row.id,
        order,
        time: cellText(v[ACT.timeOfDay]?.name || v[ACT.timeOfDay]),
        name: cellText(v[ACT.activity]),
        desc: cellText(v[ACT.description]),
        url: moreInfoFromCell(v[ACT.moreInfo]),
        cat: cellText(v[ACT.category]?.name || v[ACT.category]),
        address: cellText(v[ACT.address]),
        lat: cellCoord(v[ACT.latitude]),
        lng: cellCoord(v[ACT.longitude]),
        tips: cellText(v[ACT.tips])
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
        day: todoDayLabel(v, TODO_MAP, activities, days),
        whenToBook: String(v[TODO_MAP['When to Book / Do'] ?? TODO_MAP['When to Book']] || ''),
        link: String(v[TODO_MAP['Reservation Link'] ?? TODO_MAP['Link']]?.url || v[TODO_MAP['Reservation Link'] ?? TODO_MAP['Link']] || ''),
        why: String(v[TODO_MAP['Why It Matters'] ?? TODO_MAP['Why']] || ''),
        rec: String(v[TODO_MAP['My Recommendation'] ?? TODO_MAP['Recommendation'] ?? TODO_MAP['Rec']] || '')
      };
    });

    // Build flights array
    const flights = flRows.map(row => {
      const v = row.values;
      const airline = cellText(v[resolveFlCol(FL_MAP, 'airline', 'Airline')]);
      const flightNum = cellText(v[resolveFlCol(FL_MAP, 'number', 'Flight #', 'Flight Number')]);
      const departCityCol = resolveFlCol(FL_MAP, 'fromCity', 'Depart City', 'From');
      const arriveCityCol = resolveFlCol(FL_MAP, 'toCity', 'Arrive City', 'To');
      const fromCodeCol = resolveFlCol(FL_MAP, 'fromCode', 'Departure Code', 'Code', 'From (code)', 'From Code');
      const toCodeCol = resolveFlCol(FL_MAP, 'toCode', 'Arrival Code', 'Dest code', 'To (code)', 'To Code');
      const fromCity = cellText(v[departCityCol]);
      const toCity = cellText(v[arriveCityCol]);
      const dateCol = resolveFlCol(FL_MAP, 'date', 'Depart Date', 'Date');
      const flightDate = cellToDate(v[dateCol]) || '';
      const dayNum = days.find(d => d.date === flightDate)?.n || null;
      const receipt = cellReceipt(v[resolveFlCol(FL_MAP, 'receipt', 'Receipt')]);
      const departTimeCol = resolveFlCol(FL_MAP, 'departTime', 'Depart Time', 'Departure');
      const arriveTimeCol = resolveFlCol(FL_MAP, 'arriveTime', 'Arrive Time', 'Arrival');

      return {
        id: row.id,
        trip: flightTripLabel(fromCity, toCity),
        airline: airline,
        flightNum: flightNum,
        number: `${airline ? airline.split(' ')[0] : ''} ${flightNum}`.trim(),
        from: cellText(v[fromCodeCol]) || deriveAirportCode(fromCity),
        to: cellText(v[toCodeCol]) || deriveAirportCode(toCity),
        fromCity: fromCity,
        toCity: toCity,
        date: flightDate,
        arriveDate: cellToDate(v[resolveFlCol(FL_MAP, 'arriveDate', 'Arrival Date')]) || '',
        day: dayNum,
        depart: cellTimeDisplay(v[departTimeCol]),
        arrive: cellTimeDisplay(v[arriveTimeCol]),
        bookingCode: cellText(v[resolveFlCol(FL_MAP, 'bookingCode', 'Booking Code')]),
        cost: cellCost(v[resolveFlCol(FL_MAP, 'cost', 'Cost')]),
        receipt: receipt.name,
        receiptUrl: receipt.url
      };
    });

    const hotels = htlRows.map(row => {
      const v = row.values;
      const receipt = cellReceipt(v[HTL_MAP['Receipt']]);
      return {
        id: row.id,
        name: cellText(v[HTL_MAP['Name'] ?? HTL_MAP['Hotel Name']]),
        city: v[HTL_MAP['City']]?.name || String(v[HTL_MAP['City']] || ''),
        startDate: cellToDate(v[HTL_MAP['Start Date']]) || '',
        endDate: cellToDate(v[HTL_MAP['End Date']]) || '',
        nights: cellNumber(v[HTL_MAP['Nights']]) ?? 0,
        roomType: String(v[HTL_MAP['Room Type']] || ''),
        address: String(v[HTL_MAP['Address']] || ''),
        bookingCode: cellText(v[HTL_MAP['Booking Code'] ?? HTL_MAP['Confirmation']]),
        cost: cellCost(v[HTL_MAP['Cost'] ?? HTL_MAP['Price']]),
        receipt: receipt.name,
        receiptUrl: receipt.url,
        lat: cellCoord(v[HTL_MAP['Latitude']] ?? v[HTL_MAP['Lat']]),
        lng: cellCoord(v[HTL_MAP['Longitude']] ?? v[HTL_MAP['Lng']])
      };
    });

    const events = evtRows.map(row => {
      const v = row.values;
      const date = cellToDate(v[EVT_MAP['Date']]) || '';
      const dayNum = days.find(d => d.date === date)?.n || null;
      const timeCol = mapCol(EVT_MAP, 'Start Time', 'Time', 'Start time') || EVT_TEMPLATE_IDS.time;
      const endTimeCol = mapCol(EVT_MAP, 'End Time', 'End time') || EVT_TEMPLATE_IDS.endTime;
      const addressCol = mapCol(EVT_MAP, 'Address', 'Meet-up Address');
      const receipt = cellReceipt(v[EVT_MAP['Receipt']]);
      return {
        id: row.id,
        name: cellText(v[EVT_MAP['Name']]),
        provider: cellText(v[EVT_MAP['Provider']]?.name || v[EVT_MAP['Provider']]),
        bookingRef: cellText(v[EVT_MAP['Booking Code'] ?? EVT_MAP['Booking Reference']]),
        date,
        day: dayNum,
        time: cellTimeDisplay(v[timeCol]),
        endTime: cellTimeDisplay(v[endTimeCol]),
        meetupAddress: cellText(v[addressCol]),
        lat: cellCoord(v[EVT_MAP['Latitude']]),
        lng: cellCoord(v[EVT_MAP['Longitude']]),
        notes: cellText(v[EVT_MAP['Notes']]),
        cost: cellCost(v[EVT_MAP['Cost']]),
        receipt: receipt.name,
        receiptUrl: receipt.url,
        moreInfo: moreInfoFromCell(v[EVT_MAP['More Info']])
      };
    });

    const carRentals = carRows.map(row => {
      const v = row.values;
      const pickupDate = cellToDate(v[resolveCarCol(CAR_MAP, 'pickupDate', 'Pick-up Date', 'Pickup Date')]) || '';
      const dayNum = days.find(d => d.date === pickupDate)?.n || null;
      const receipt = cellReceipt(v[resolveCarCol(CAR_MAP, 'receipt', 'Receipt')]);
      return {
        id: row.id,
        provider: cellText(v[resolveCarCol(CAR_MAP, 'provider', 'Provider')]?.name || v[resolveCarCol(CAR_MAP, 'provider', 'Provider')]),
        bookingCode: cellText(v[resolveCarCol(CAR_MAP, 'bookingCode', 'Booking Code')]),
        pickupDate,
        pickupTime: cellTimeDisplay(v[resolveCarCol(CAR_MAP, 'pickupTime', 'Pick-up Time', 'Pickup Time')]),
        returnDate: cellToDate(v[resolveCarCol(CAR_MAP, 'returnDate', 'Return Date')]) || '',
        returnTime: cellTimeDisplay(v[resolveCarCol(CAR_MAP, 'returnTime', 'Return Time')]),
        address: cellText(v[resolveCarCol(CAR_MAP, 'address', 'Address', 'Pick-up Address')]),
        returnAddress: cellText(v[resolveCarCol(CAR_MAP, 'returnAddress', 'Return Address')]),
        carType: cellText(v[resolveCarCol(CAR_MAP, 'carType', 'Car Type')]),
        cost: cellCost(v[resolveCarCol(CAR_MAP, 'cost', 'Cost')]),
        notes: cellText(v[resolveCarCol(CAR_MAP, 'notes', 'Notes')]),
        receipt: receipt.name,
        receiptUrl: receipt.url,
        lat: cellCoord(v[resolveCarCol(CAR_MAP, 'latitude', 'Latitude', 'Lat')]),
        lng: cellCoord(v[resolveCarCol(CAR_MAP, 'longitude', 'Longitude', 'Lng')]),
        day: dayNum
      };
    });

    function averageCoords(items) {
      const valid = items.filter(x => x.lat != null && x.lng != null);
      if (!valid.length) return null;
      return {
        lat: valid.reduce((sum, x) => sum + x.lat, 0) / valid.length,
        lng: valid.reduce((sum, x) => sum + x.lng, 0) / valid.length
      };
    }

    const dayByNum = Object.fromEntries(days.map(d => [d.n, d]));
    const { fillMissingCoords } = await import('./_geocode.js');

    function activityGeocodeQuery(a) {
      if (a.address) return a.address;
      const parts = [a.name];
      const day = dayByNum[a.day];
      if (day?.loc) parts.push(day.loc);
      return parts.filter(Boolean).join(', ');
    }

    await fillMissingCoords(activities, activityGeocodeQuery);
    await fillMissingCoords(hotels, h => {
      if (h.address) return h.address;
      return [h.name, h.city].filter(Boolean).join(', ');
    });
    await fillMissingCoords(events, e => e.meetupAddress || e.name || '');
    await fillMissingCoords(carRentals, cr => cr.address || cr.returnAddress || '');

    days.forEach(d => {
      if (d.lat != null && d.lng != null) return;
      const dayNum = d.n;
      const coords =
        averageCoords(activities.filter(a => a.day === dayNum)) ||
        averageCoords(hotels.filter(h => h.day === dayNum)) ||
        averageCoords(events.filter(e => e.day === dayNum)) ||
        averageCoords(carRentals.filter(cr => cr.day === dayNum));
      if (coords) {
        d.lat = coords.lat;
        d.lng = coords.lng;
      }
    });

    // Calculate trip metadata from chronological dates (not Coda row order)
    const allDates = days.map(d => d.date).filter(Boolean).sort();
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
      events,
      carRentals,
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

    if (stream) {
      writeLine({ type: 'done', data: payload });
      return res.end();
    }

    return res.status(200).json(payload);

  } catch (error) {
    console.error('Error fetching trip data:', error);
    console.error('Error stack:', error.stack);
    if (stream && !res.writableEnded) {
      res.write(`${JSON.stringify({ type: 'error', error: error.message || 'Failed to fetch trip data' })}\n`);
      return res.end();
    }
    return res.status(500).json({ 
      error: 'Failed to fetch trip data',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
