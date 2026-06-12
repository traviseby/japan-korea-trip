// Vercel serverless function to update a hotel row in a Coda doc

export default async function handler(req, res) {
  console.log('update-hotel called, method:', req.method);

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl, rowId, hotel, token } = req.body;
  console.log('docUrl:', docUrl, 'rowId:', rowId, 'hasToken:', !!token);

  if (!docUrl || !rowId || !hotel) {
    return res.status(400).json({ error: 'Missing docUrl, rowId, or hotel data' });
  }

  const hotelName = String(hotel.name || '').trim();
  if (!hotelName) {
    return res.status(400).json({ error: 'Hotel name is required' });
  }

  const CODA_TOKEN = token || process.env.CODA_TOKEN;
  if (!CODA_TOKEN) {
    console.error('CODA_TOKEN not set in environment');
    return res.status(500).json({ error: 'Server configuration error: CODA_TOKEN not set' });
  }

  function parseDocId(input) {
    if (!input) return null;
    const urlMatch = input.match(/_d([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    if (!input.includes('/') && !input.includes(':')) return input;
    return null;
  }

  function colId(columns, ...names) {
    for (const name of names) {
      if (columns[name]) return columns[name];
    }
    return null;
  }

  const docId = parseDocId(docUrl);
  if (!docId) {
    return res.status(400).json({ error: 'Invalid Coda doc URL' });
  }

  try {
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
    const hotelsTable = tablesData.items.find(t => t.name === 'All Hotels');
    if (!hotelsTable) {
      throw new Error('Hotels table "All Hotels" not found in doc');
    }

    const colsResp = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables/${hotelsTable.id}/columns`, {
      headers: {
        'Authorization': `Bearer ${CODA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!colsResp.ok) {
      throw new Error(`Failed to fetch columns: ${colsResp.status}`);
    }

    const colsData = await colsResp.json();
    const columns = {};
    for (const col of colsData.items) {
      columns[col.name] = col.id;
    }

    const cells = [];

    const nameCol = colId(columns, 'Name', 'Hotel Name');
    if (nameCol) cells.push({ column: nameCol, value: hotelName });

    const cityCol = colId(columns, 'City');
    if (cityCol) cells.push({ column: cityCol, value: hotel.city || '' });

    const startCol = colId(columns, 'Start Date');
    if (startCol) cells.push({ column: startCol, value: hotel.startDate || '' });

    const endCol = colId(columns, 'End Date');
    if (endCol) cells.push({ column: endCol, value: hotel.endDate || '' });

    const nightsCol = colId(columns, 'Nights');
    if (nightsCol && hotel.nights != null) {
      cells.push({ column: nightsCol, value: hotel.nights });
    }

    const roomCol = colId(columns, 'Room Type');
    if (roomCol) cells.push({ column: roomCol, value: hotel.roomType || '' });

    const addressCol = colId(columns, 'Address');
    if (addressCol) cells.push({ column: addressCol, value: hotel.address || '' });

    const latCol = colId(columns, 'Latitude');
    if (latCol) cells.push({ column: latCol, value: hotel.lat != null ? hotel.lat : '' });

    const lngCol = colId(columns, 'Longitude');
    if (lngCol) cells.push({ column: lngCol, value: hotel.lng != null ? hotel.lng : '' });

    const tableId = encodeURIComponent(hotelsTable.id);
    const encodedRowId = encodeURIComponent(rowId);
    const updateUrl = `https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/rows/${encodedRowId}`;

    const updateRowResp = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CODA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ row: { cells } })
    });

    if (!updateRowResp.ok) {
      const errorText = await updateRowResp.text();
      console.error('Coda API error:', errorText);
      throw new Error(`Failed to update row: ${updateRowResp.status} - ${errorText}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Hotel updated successfully',
      rowId
    });
  } catch (error) {
    console.error('Error updating hotel:', error);
    return res.status(500).json({
      error: error.message || 'Failed to update hotel in Coda'
    });
  }
}
