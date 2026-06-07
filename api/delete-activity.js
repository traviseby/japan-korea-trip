// Vercel serverless function to delete an activity row from a Coda doc

export default async function handler(req, res) {
  console.log('delete-activity called, method:', req.method);

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl, rowId, token } = req.body;
  console.log('docUrl:', docUrl, 'rowId:', rowId, 'hasToken:', !!token);

  if (!docUrl || !rowId) {
    return res.status(400).json({ error: 'Missing docUrl or rowId' });
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

  const docId = parseDocId(docUrl);
  if (!docId) {
    return res.status(400).json({ error: 'Invalid Coda doc URL' });
  }

  const headers = {
    'Authorization': `Bearer ${CODA_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    const tablesResp = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables`, { headers });
    if (!tablesResp.ok) {
      throw new Error(`Failed to fetch tables: ${tablesResp.status}`);
    }

    const tablesData = await tablesResp.json();
    const activitiesTable = tablesData.items.find(t => t.name === 'All activities');
    if (!activitiesTable) {
      throw new Error('Activities table "All activities" not found in doc');
    }

    const tableId = encodeURIComponent(activitiesTable.id);
    const encodedRowId = encodeURIComponent(rowId);
    const deleteUrl = `https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/rows/${encodedRowId}`;
    console.log('Deleting row:', deleteUrl);

    const deleteRowResp = await fetch(deleteUrl, { method: 'DELETE', headers });

    // Coda queues deletions and returns 202 Accepted
    if (!deleteRowResp.ok) {
      const errorText = await deleteRowResp.text();
      console.error('Coda API error:', errorText);
      throw new Error(`Failed to delete row: ${deleteRowResp.status} - ${errorText}`);
    }

    console.log('Row deleted successfully:', rowId);

    return res.status(200).json({
      success: true,
      message: 'Activity deleted successfully',
      rowId
    });
  } catch (error) {
    console.error('Error deleting activity:', error);
    return res.status(500).json({
      error: error.message || 'Failed to delete activity from Coda'
    });
  }
}
