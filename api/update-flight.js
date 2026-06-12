// Vercel serverless function to update a flight row in a Coda doc

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl, rowId, flight, token } = req.body;
  if (!docUrl || !rowId || !flight) {
    return res.status(400).json({ error: 'Missing docUrl, rowId, or flight data' });
  }

  const CODA_TOKEN = token || process.env.CODA_TOKEN;
  if (!CODA_TOKEN) {
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
        Authorization: `Bearer ${CODA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    if (!tablesResp.ok) throw new Error(`Failed to fetch tables: ${tablesResp.status}`);

    const flightsTable = (await tablesResp.json()).items.find(t => t.name === 'All Flights' || t.name === 'All flights');
    if (!flightsTable) throw new Error('Flights table "All Flights" not found in doc');

    const colsResp = await fetch(
      `https://coda.io/apis/v1/docs/${docId}/tables/${flightsTable.id}/columns`,
      {
        headers: {
          Authorization: `Bearer ${CODA_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    if (!colsResp.ok) throw new Error(`Failed to fetch columns: ${colsResp.status}`);

    const columns = {};
    for (const col of (await colsResp.json()).items) {
      columns[col.name] = col.id;
    }

    const cells = [];

    const airlineCol = colId(columns, 'Airline');
    if (airlineCol) cells.push({ column: airlineCol, value: flight.airline || '' });

    const fromCodeCol = colId(columns, 'Departure Code', 'Code', 'From Code', 'From (code)');
    if (fromCodeCol) cells.push({ column: fromCodeCol, value: flight.from || '' });

    const flightNumCol = colId(columns, 'Flight #', 'Flight Number');
    if (flightNumCol) cells.push({ column: flightNumCol, value: flight.flightNum || '' });

    const dateCol = colId(columns, 'Depart Date', 'Date');
    if (dateCol) cells.push({ column: dateCol, value: flight.date || '' });

    const fromCityCol = colId(columns, 'Depart City', 'From');
    if (fromCityCol) cells.push({ column: fromCityCol, value: flight.fromCity || '' });

    const departCol = colId(columns, 'Depart Time', 'Departure');
    if (departCol) cells.push({ column: departCol, value: parseClockTimeToCoda(flight.depart) });

    const toCityCol = colId(columns, 'Arrive City', 'To');
    if (toCityCol) cells.push({ column: toCityCol, value: flight.toCity || '' });

    const arriveCol = colId(columns, 'Arrive Time', 'Arrival');
    if (arriveCol) cells.push({ column: arriveCol, value: parseClockTimeToCoda(flight.arrive) });

    const toCodeCol = colId(columns, 'Arrival Code', 'Dest code', 'To (code)', 'To Code');
    if (toCodeCol) cells.push({ column: toCodeCol, value: flight.to || '' });

    const arriveDateCol = colId(columns, 'Arrival Date');
    if (arriveDateCol && flight.arriveDate) {
      cells.push({ column: arriveDateCol, value: flight.arriveDate });
    }

    const bookingCodeCol = colId(columns, 'Booking Code');
    if (bookingCodeCol && flight.bookingCode != null) {
      cells.push({ column: bookingCodeCol, value: flight.bookingCode || '' });
    }

    const costCol = colId(columns, 'Cost');
    if (costCol) {
      cells.push({
        column: costCol,
        value: flight.cost != null && flight.cost !== '' ? Number(flight.cost) : ''
      });
    }

    const updateUrl = `https://coda.io/apis/v1/docs/${docId}/tables/${encodeURIComponent(flightsTable.id)}/rows/${encodeURIComponent(rowId)}`;
    const updateRowResp = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CODA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ row: { cells } })
    });

    if (!updateRowResp.ok) {
      const errorText = await updateRowResp.text();
      throw new Error(`Failed to update row: ${updateRowResp.status} - ${errorText}`);
    }

    return res.status(200).json({ success: true, message: 'Flight updated successfully', rowId });
  } catch (error) {
    console.error('Error updating flight:', error);
    return res.status(500).json({ error: error.message || 'Failed to update flight in Coda' });
  }
}
