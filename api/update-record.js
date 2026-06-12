// Vercel serverless function to update records in Coda (handles hotels, flights, events, and car rentals)

export default async function handler(req, res) {
  console.log('update-record called, method:', req.method);

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl, rowId, type, data, token } = req.body;
  console.log('docUrl:', docUrl, 'rowId:', rowId, 'type:', type, 'hasToken:', !!token);

  if (!docUrl || !rowId || !type || !data) {
    return res.status(400).json({ error: 'Missing docUrl, rowId, type, or data' });
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

  const TABLE_CONFIGS = {
    hotel: { 
      names: ['All Hotels'], 
      label: 'Hotels',
      requiredField: 'name',
      requiredLabel: 'Hotel name'
    },
    flight: { 
      names: ['All Flights', 'All flights'], 
      label: 'Flights',
      requiredField: null
    },
    event: { 
      names: ['All Tickets', 'All Events'], 
      label: 'Tickets',
      requiredField: 'name',
      requiredLabel: 'Event name'
    },
    carRental: { 
      names: ['All Car Rentals'], 
      label: 'Car rentals',
      requiredField: null
    }
  };

  const config = TABLE_CONFIGS[type];
  if (!config) {
    return res.status(400).json({ error: `Invalid type: ${type}. Must be hotel, flight, event, or carRental` });
  }

  // Validate required fields
  if (config.requiredField) {
    const value = String(data[config.requiredField] || '').trim();
    if (!value) {
      return res.status(400).json({ error: `${config.requiredLabel} is required` });
    }
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

    const tables = (await tablesResp.json()).items;
    const table = tables.find(t => config.names.includes(t.name));
    if (!table) {
      throw new Error(`${config.label} table not found in doc (tried: ${config.names.join(', ')})`);
    }

    const colsResp = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables/${table.id}/columns`, {
      headers: {
        'Authorization': `Bearer ${CODA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!colsResp.ok) {
      throw new Error(`Failed to fetch columns: ${colsResp.status}`);
    }

    const columns = {};
    for (const col of (await colsResp.json()).items) {
      columns[col.name] = col.id;
    }

    const cells = [];

    // Build cells based on type
    if (type === 'hotel') {
      const nameCol = colId(columns, 'Name', 'Hotel Name');
      if (nameCol) cells.push({ column: nameCol, value: data.name || '' });

      const cityCol = colId(columns, 'City');
      if (cityCol) cells.push({ column: cityCol, value: data.city || '' });

      const startCol = colId(columns, 'Start Date');
      if (startCol) cells.push({ column: startCol, value: data.startDate || '' });

      const endCol = colId(columns, 'End Date');
      if (endCol) cells.push({ column: endCol, value: data.endDate || '' });

      const nightsCol = colId(columns, 'Nights');
      if (nightsCol && data.nights != null) {
        cells.push({ column: nightsCol, value: data.nights });
      }

      const roomCol = colId(columns, 'Room Type');
      if (roomCol) cells.push({ column: roomCol, value: data.roomType || '' });

      const addressCol = colId(columns, 'Address');
      if (addressCol) cells.push({ column: addressCol, value: data.address || '' });

      const latCol = colId(columns, 'Latitude');
      if (latCol) cells.push({ column: latCol, value: data.lat != null ? data.lat : '' });

      const lngCol = colId(columns, 'Longitude');
      if (lngCol) cells.push({ column: lngCol, value: data.lng != null ? data.lng : '' });

    } else if (type === 'flight') {
      const airlineCol = colId(columns, 'Airline');
      if (airlineCol) cells.push({ column: airlineCol, value: data.airline || '' });

      const fromCodeCol = colId(columns, 'Departure Code', 'Code', 'From Code', 'From (code)');
      if (fromCodeCol) cells.push({ column: fromCodeCol, value: data.from || '' });

      const flightNumCol = colId(columns, 'Flight #', 'Flight Number');
      if (flightNumCol) cells.push({ column: flightNumCol, value: data.flightNum || '' });

      const dateCol = colId(columns, 'Depart Date', 'Date');
      if (dateCol) cells.push({ column: dateCol, value: data.date || '' });

      const fromCityCol = colId(columns, 'Depart City', 'From');
      if (fromCityCol) cells.push({ column: fromCityCol, value: data.fromCity || '' });

      const departTimeCol = colId(columns, 'Depart Time', 'Departure');
      if (departTimeCol) cells.push({ column: departTimeCol, value: parseClockTimeToCoda(data.depart) });

      const toCodeCol = colId(columns, 'Arrival Code', 'Dest code', 'To Code', 'To (code)');
      if (toCodeCol) cells.push({ column: toCodeCol, value: data.to || '' });

      const toCityCol = colId(columns, 'Arrive City', 'To');
      if (toCityCol) cells.push({ column: toCityCol, value: data.toCity || '' });

      const arriveTimeCol = colId(columns, 'Arrive Time', 'Arrival');
      if (arriveTimeCol) cells.push({ column: arriveTimeCol, value: parseClockTimeToCoda(data.arrive) });

      const arriveDateCol = colId(columns, 'Arrival Date');
      if (arriveDateCol) cells.push({ column: arriveDateCol, value: data.arriveDate || '' });

      const bookingCodeCol = colId(columns, 'Booking Code');
      if (bookingCodeCol) cells.push({ column: bookingCodeCol, value: data.bookingCode || '' });

      const costCol = colId(columns, 'Cost');
      if (costCol) {
        cells.push({
          column: costCol,
          value: data.cost != null && data.cost !== '' ? Number(data.cost) : ''
        });
      }

    } else if (type === 'event') {
      const nameCol = colId(columns, 'Name');
      if (nameCol) cells.push({ column: nameCol, value: data.name || '' });

      const providerCol = colId(columns, 'Provider');
      if (providerCol) cells.push({ column: providerCol, value: data.provider || '' });

      const bookingCol = colId(columns, 'Booking Code', 'Booking Reference');
      if (bookingCol) cells.push({ column: bookingCol, value: data.bookingRef || '' });

      const dateCol = colId(columns, 'Date');
      if (dateCol) cells.push({ column: dateCol, value: data.date || '' });

      const timeCol = colId(columns, 'Start Time', 'Time', 'Start time');
      if (timeCol) cells.push({ column: timeCol, value: parseClockTimeToCoda(data.time) });

      const endTimeCol = colId(columns, 'End Time', 'End time');
      if (endTimeCol) cells.push({ column: endTimeCol, value: parseClockTimeToCoda(data.endTime) });

      const meetupCol = colId(columns, 'Address', 'Meet-up Address');
      if (meetupCol) cells.push({ column: meetupCol, value: data.meetupAddress || '' });

      const latCol = colId(columns, 'Latitude');
      if (latCol) cells.push({ column: latCol, value: data.lat != null ? data.lat : '' });

      const lngCol = colId(columns, 'Longitude');
      if (lngCol) cells.push({ column: lngCol, value: data.lng != null ? data.lng : '' });

      const notesCol = colId(columns, 'Notes');
      if (notesCol) cells.push({ column: notesCol, value: data.notes || '' });

      const costCol = colId(columns, 'Cost');
      if (costCol) {
        cells.push({
          column: costCol,
          value: data.cost != null && data.cost !== '' ? Number(data.cost) : ''
        });
      }

      const moreInfoCol = colId(columns, 'More Info');
      if (moreInfoCol) cells.push({ column: moreInfoCol, value: data.moreInfo || '' });

    } else if (type === 'carRental') {
      const providerCol = colId(columns, 'Provider');
      if (providerCol) cells.push({ column: providerCol, value: data.provider || '' });

      const bookingCol = colId(columns, 'Booking Code');
      if (bookingCol) cells.push({ column: bookingCol, value: data.bookingCode || '' });

      const pickupDateCol = colId(columns, 'Pick-up Date', 'Pickup Date');
      if (pickupDateCol) cells.push({ column: pickupDateCol, value: data.pickupDate || '' });

      const pickupTimeCol = colId(columns, 'Pick-up Time', 'Pickup Time');
      if (pickupTimeCol) cells.push({ column: pickupTimeCol, value: parseClockTimeToCoda(data.pickupTime) });

      const returnDateCol = colId(columns, 'Return Date');
      if (returnDateCol) cells.push({ column: returnDateCol, value: data.returnDate || '' });

      const returnTimeCol = colId(columns, 'Return Time');
      if (returnTimeCol) cells.push({ column: returnTimeCol, value: parseClockTimeToCoda(data.returnTime) });

      const addressCol = colId(columns, 'Address', 'Pick-up Address');
      if (addressCol) cells.push({ column: addressCol, value: data.address || '' });

      const returnAddressCol = colId(columns, 'Return Address');
      if (returnAddressCol) cells.push({ column: returnAddressCol, value: data.returnAddress || '' });

      const carTypeCol = colId(columns, 'Car Type');
      if (carTypeCol) cells.push({ column: carTypeCol, value: data.carType || '' });

      const latCol = colId(columns, 'Latitude', 'Lat');
      if (latCol) cells.push({ column: latCol, value: data.lat != null ? data.lat : '' });

      const lngCol = colId(columns, 'Longitude', 'Lng');
      if (lngCol) cells.push({ column: lngCol, value: data.lng != null ? data.lng : '' });

      const notesCol = colId(columns, 'Notes');
      if (notesCol) cells.push({ column: notesCol, value: data.notes || '' });

      const costCol = colId(columns, 'Cost');
      if (costCol) {
        cells.push({
          column: costCol,
          value: data.cost != null && data.cost !== '' ? Number(data.cost) : ''
        });
      }
    }

    const tableId = encodeURIComponent(table.id);
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
      message: `${config.label.slice(0, -1)} updated successfully`,
      rowId
    });
  } catch (error) {
    console.error(`Error updating ${type}:`, error);
    return res.status(500).json({
      error: error.message || `Failed to update ${type} in Coda`
    });
  }
}
