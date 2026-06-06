// Vercel serverless function to add an activity to a Coda doc

export default async function handler(req, res) {
  console.log('add-activity called, method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl, activity } = req.body;
  console.log('docUrl:', docUrl);
  console.log('activity:', activity);
  
  if (!docUrl || !activity) {
    return res.status(400).json({ error: 'Missing docUrl or activity data' });
  }

  if (!activity.name) {
    return res.status(400).json({ error: 'Activity name is required' });
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
    
    // Find Activities table
    const activitiesTable = tablesData.items.find(t => t.name === 'All activities');
    if (!activitiesTable) {
      throw new Error('Activities table "All activities" not found in doc');
    }

    // Fetch columns for Activities table
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

    // Build row data - only include columns that exist
    const cells = [];
    
    // Name (required)
    if (columns['Name']) {
      cells.push({
        column: columns['Name'],
        value: activity.name
      });
    }

    // Latitude
    if (activity.lat && columns['Latitude']) {
      cells.push({
        column: columns['Latitude'],
        value: activity.lat
      });
    }

    // Longitude
    if (activity.lng && columns['Longitude']) {
      cells.push({
        column: columns['Longitude'],
        value: activity.lng
      });
    }

    // Category
    if (activity.category && columns['Category']) {
      cells.push({
        column: columns['Category'],
        value: activity.category
      });
    }

    // URL
    if (activity.url && columns['URL']) {
      cells.push({
        column: columns['URL'],
        value: activity.url
      });
    }

    console.log('Adding row with cells:', cells);

    // Add row to Activities table
    const addRowResp = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables/${activitiesTable.id}/rows`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CODA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: [{
          cells: cells
        }]
      })
    });

    if (!addRowResp.ok) {
      const errorText = await addRowResp.text();
      console.error('Coda API error:', errorText);
      throw new Error(`Failed to add row: ${addRowResp.status} - ${errorText}`);
    }

    const result = await addRowResp.json();
    console.log('Row added successfully:', result);

    return res.status(200).json({ 
      success: true, 
      message: 'Activity added successfully',
      rowId: result.id
    });

  } catch (error) {
    console.error('Error adding activity:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to add activity to Coda' 
    });
  }
}
