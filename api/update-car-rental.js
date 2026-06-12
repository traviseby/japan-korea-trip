// Vercel serverless function to update a car rental row in a Coda doc

export default async function handler(req, res) {
  console.log('update-car-rental called, method:', req.method);

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl, rowId, carRental, token } = req.body;
  console.log('docUrl:', docUrl, 'rowId:', rowId, 'hasToken:', !!token);

  if (!docUrl || !rowId || !carRental) {
    return res.status(400).json({ error: 'Missing docUrl, rowId, or carRental data' });
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
    const carTable = tablesData.items.find(t => t.name === 'All Car Rentals');
    if (!carTable) {
      throw new Error('Car rentals table "All Car Rentals" not found in doc');
    }

    const colsResp = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables/${carTable.id}/columns`, {
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

    const providerCol = colId(columns, 'Provider');
    if (providerCol) cells.push({ column: providerCol, value: carRental.provider || '' });

    const bookingCol = colId(columns, 'Booking Code');
    if (bookingCol) cells.push({ column: bookingCol, value: carRental.bookingCode || '' });

    const pickupDateCol = colId(columns, 'Pick-up Date', 'Pickup Date');
    if (pickupDateCol) cells.push({ column: pickupDateCol, value: carRental.pickupDate || '' });

    const pickupTimeCol = colId(columns, 'Pick-up Time', 'Pickup Time');
    if (pickupTimeCol) cells.push({ column: pickupTimeCol, value: parseClockTimeToCoda(carRental.pickupTime) });

    const returnDateCol = colId(columns, 'Return Date');
    if (returnDateCol) cells.push({ column: returnDateCol, value: carRental.returnDate || '' });

    const returnTimeCol = colId(columns, 'Return Time');
    if (returnTimeCol) cells.push({ column: returnTimeCol, value: parseClockTimeToCoda(carRental.returnTime) });

    const addressCol = colId(columns, 'Address', 'Pick-up Address');
    if (addressCol) cells.push({ column: addressCol, value: carRental.address || '' });

    const returnAddressCol = colId(columns, 'Return Address');
    if (returnAddressCol) cells.push({ column: returnAddressCol, value: carRental.returnAddress || '' });

    const carTypeCol = colId(columns, 'Car Type');
    if (carTypeCol) cells.push({ column: carTypeCol, value: carRental.carType || '' });

    const latCol = colId(columns, 'Latitude', 'Lat');
    if (latCol) cells.push({ column: latCol, value: carRental.lat != null ? carRental.lat : '' });

    const lngCol = colId(columns, 'Longitude', 'Lng');
    if (lngCol) cells.push({ column: lngCol, value: carRental.lng != null ? carRental.lng : '' });

    const notesCol = colId(columns, 'Notes');
    if (notesCol) cells.push({ column: notesCol, value: carRental.notes || '' });

    const costCol = colId(columns, 'Cost');
    if (costCol) {
      cells.push({
        column: costCol,
        value: carRental.cost != null && carRental.cost !== '' ? Number(carRental.cost) : ''
      });
    }

    const tableId = encodeURIComponent(carTable.id);
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
      message: 'Car rental updated successfully',
      rowId
    });
  } catch (error) {
    console.error('Error updating car rental:', error);
    return res.status(500).json({
      error: error.message || 'Failed to update car rental in Coda'
    });
  }
}
