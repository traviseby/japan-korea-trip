// Vercel serverless function to update an event row in a Coda doc

export default async function handler(req, res) {
  console.log('update-event called, method:', req.method);

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl, rowId, event, token } = req.body;
  console.log('docUrl:', docUrl, 'rowId:', rowId, 'hasToken:', !!token);

  if (!docUrl || !rowId || !event) {
    return res.status(400).json({ error: 'Missing docUrl, rowId, or event data' });
  }

  const eventName = String(event.name || '').trim();
  if (!eventName) {
    return res.status(400).json({ error: 'Event name is required' });
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

  function parseClockTimeToCoda(timeStr) {
    if (!timeStr || !String(timeStr).trim()) return '';
    const s = String(timeStr).trim();
    const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m12) {
      let h = parseInt(m12[1], 10);
      const min = m12[2];
      const ampm = m12[3].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${min}:00`;
    }
    const m24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m24) {
      return `${String(parseInt(m24[1], 10)).padStart(2, '0')}:${m24[2]}:${m24[3] || '00'}`;
    }
    return s;
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
    const eventsTable = tablesData.items.find(t => t.name === 'All Tickets' || t.name === 'All Events');
    if (!eventsTable) {
      throw new Error('Tickets table "All Tickets" not found in doc');
    }

    const colsResp = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables/${eventsTable.id}/columns`, {
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

    const nameCol = colId(columns, 'Name');
    if (nameCol) cells.push({ column: nameCol, value: eventName });

    const providerCol = colId(columns, 'Provider');
    if (providerCol) cells.push({ column: providerCol, value: event.provider || '' });

    const bookingCol = colId(columns, 'Booking Code', 'Booking Reference');
    if (bookingCol) cells.push({ column: bookingCol, value: event.bookingRef || '' });

    const dateCol = colId(columns, 'Date');
    if (dateCol) cells.push({ column: dateCol, value: event.date || '' });

    const timeCol = colId(columns, 'Start Time', 'Time', 'Start time');
    if (timeCol) cells.push({ column: timeCol, value: parseClockTimeToCoda(event.time) });

    const endTimeCol = colId(columns, 'End Time', 'End time');
    if (endTimeCol) cells.push({ column: endTimeCol, value: parseClockTimeToCoda(event.endTime) });

    const meetupCol = colId(columns, 'Address', 'Meet-up Address');
    if (meetupCol) cells.push({ column: meetupCol, value: event.meetupAddress || '' });

    const latCol = colId(columns, 'Latitude');
    if (latCol) cells.push({ column: latCol, value: event.lat != null ? event.lat : '' });

    const lngCol = colId(columns, 'Longitude');
    if (lngCol) cells.push({ column: lngCol, value: event.lng != null ? event.lng : '' });

    const notesCol = colId(columns, 'Notes');
    if (notesCol) cells.push({ column: notesCol, value: event.notes || '' });

    const costCol = colId(columns, 'Cost');
    if (costCol) {
      cells.push({
        column: costCol,
        value: event.cost != null && event.cost !== '' ? Number(event.cost) : ''
      });
    }

    const moreInfoCol = colId(columns, 'More Info');
    if (moreInfoCol) cells.push({ column: moreInfoCol, value: event.moreInfo || '' });

    const tableId = encodeURIComponent(eventsTable.id);
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
      message: 'Event updated successfully',
      rowId
    });
  } catch (error) {
    console.error('Error updating event:', error);
    return res.status(500).json({
      error: error.message || 'Failed to update event in Coda'
    });
  }
}
