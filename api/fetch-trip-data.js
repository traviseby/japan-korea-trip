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
        url.searchParams.set('valueFormat', 'simpleWithArrays');
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
      return str.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '').trim();
    }

    // Build days array
    const days = itnRows.map(row => {
      const v = row.values;
      return {
        date: v[ITN_MAP['Date']] || '',
        overview: v[ITN_MAP['Overview']] || '',
        location: v[ITN_MAP['Location']] || '',
        notes: v[ITN_MAP['Notes']] || '',
        imageUrl: v[ITN_MAP['Image']] || '',
        desc: stripFence(v[ITN_MAP['Description']] || '')
      };
    });

    // Build activities array
    const activities = actRows.map(row => {
      const v = row.values;
      return {
        date: v[ACT_MAP['Date']] || '',
        timeOfDay: v[ACT_MAP['Time of Day']] || '',
        activity: v[ACT_MAP['Activity']] || '',
        description: v[ACT_MAP['Description']] || '',
        moreInfo: v[ACT_MAP['More Info']] || '',
        category: v[ACT_MAP['Category']] || ''
      };
    });

    // Build todos array
    const todos = todoRows.map(row => {
      const v = row.values;
      return {
        priority: v[TODO_MAP['Priority']] || '',
        item: v[TODO_MAP['Item']] || '',
        type: v[TODO_MAP['Type']] || '',
        day: v[TODO_MAP['Day']] || '',
        whenToBook: v[TODO_MAP['When to Book']] || '',
        link: v[TODO_MAP['Link']] || '',
        why: v[TODO_MAP['Why']] || '',
        rec: v[TODO_MAP['Rec']] || ''
      };
    });

    // Build flights array
    const flights = flRows.map(row => {
      const v = row.values;
      return {
        trip: v[FL_MAP['Trip']] || '',
        airline: v[FL_MAP['Airline']] || '',
        fromCode: v[FL_MAP['From (code)']] || '',
        toCode: v[FL_MAP['To (code)']] || '',
        number: v[FL_MAP['Flight #']] || '',
        date: v[FL_MAP['Date']] || '',
        fromCity: v[FL_MAP['From']] || '',
        departTime: v[FL_MAP['Depart Time']] || '',
        toCity: v[FL_MAP['To']] || '',
        arriveTime: v[FL_MAP['Arrive Time']] || '',
        terminal: v[FL_MAP['Terminal']] || '',
        arriveNext: v[FL_MAP['Arrive Next Day']] ? 'Yes' : ''
      };
    });

    // Calculate trip metadata
    const allDates = days.map(d => d.date).filter(Boolean);
    const tripStart = allDates.length > 0 ? allDates[0] : '';
    const tripEnd = allDates.length > 0 ? allDates[allDates.length - 1] : '';

    // Build categories and timesOfDay
    const categories = {
      'Food': '🍜',
      'Temple': '⛩️',
      'Hotel': '🏨',
      'Transit': '🚆',
      'Culture': '🎭',
      'Nature': '🌿',
      'Sightseeing': '📍',
      'Shopping': '🛍️',
      'Entertainment': '🎟️',
      'Wellness': '💆',
      'Flight': '✈️'
    };

    const timesOfDay = ['Morning', 'Afternoon', 'Evening', 'Late Night'];

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
