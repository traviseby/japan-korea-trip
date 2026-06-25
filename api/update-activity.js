// Vercel serverless function to update an activity row in a Coda doc

export default async function handler(req, res) {
  console.log('update-activity called, method:', req.method);

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl, rowId, activity, token } = req.body;
  console.log('docUrl:', docUrl, 'rowId:', rowId, 'hasToken:', !!token);
  console.log('activity:', activity);

  if (!docUrl || !rowId || !activity) {
    return res.status(400).json({ error: 'Missing docUrl, rowId, or activity data' });
  }

  const activityName = String(activity.name || '').trim();
  if (!activityName) {
    return res.status(400).json({ error: 'Activity name is required' });
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
    const activitiesTable = tablesData.items.find(t => t.name === 'All activities');
    if (!activitiesTable) {
      throw new Error('Activities table "All activities" not found in doc');
    }

    const colsResp = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables/${activitiesTable.id}/columns`, {
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

    console.log('Available columns:', Object.keys(columns));

    const activityCol = colId(columns, 'Activity', 'Name');
    if (!activityCol) {
      throw new Error('Activities table is missing a Name (or Activity) column');
    }

    const cells = [{ column: activityCol, value: activityName }];

    const descCol = colId(columns, 'Description');
    if (descCol) {
      cells.push({ column: descCol, value: activity.desc || '' });
    }

    const dateCol = colId(columns, 'Date');
    if (dateCol) {
      cells.push({ column: dateCol, value: activity.date || '' });
    }

    const timeCol = colId(columns, 'Time of Day');
    if (timeCol) {
      cells.push({ column: timeCol, value: activity.time || '' });
    }

    const categoryCol = colId(columns, 'Category');
    if (categoryCol) {
      cells.push({ column: categoryCol, value: activity.category || '' });
    }

    const latCol = colId(columns, 'Latitude');
    if (latCol) {
      cells.push({ column: latCol, value: activity.lat != null ? activity.lat : '' });
    }

    const lngCol = colId(columns, 'Longitude');
    if (lngCol) {
      cells.push({ column: lngCol, value: activity.lng != null ? activity.lng : '' });
    }

    const addressCol = colId(columns, 'Address', 'Location');
    if (addressCol) {
      cells.push({ column: addressCol, value: activity.address || '' });
    }

    const urlCol = colId(columns, 'More Info', 'URL', 'Link');
    if (urlCol) {
      cells.push({ column: urlCol, value: activity.url || '' });
    }

    console.log('Updating row with cells:', cells);

    const tableId = encodeURIComponent(activitiesTable.id);
    const encodedRowId = encodeURIComponent(rowId);
    const updateUrl = `https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/rows/${encodedRowId}`;
    console.log('Updating row:', updateUrl);

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

    const result = await updateRowResp.json();
    console.log('Row updated successfully:', result);

    return res.status(200).json({
      success: true,
      message: 'Activity updated successfully',
      rowId
    });
  } catch (error) {
    console.error('Error updating activity:', error);
    return res.status(500).json({
      error: error.message || 'Failed to update activity in Coda'
    });
  }
}
