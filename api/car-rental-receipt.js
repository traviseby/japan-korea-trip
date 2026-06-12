// Resolve a hosted URL for a car rental's Receipt attachment from Coda

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl, rowId, token } = req.body;
  if (!docUrl || !rowId) {
    return res.status(400).json({ error: 'Missing docUrl or rowId' });
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
    if (!tablesResp.ok) {
      throw new Error(`Failed to fetch tables: ${tablesResp.status}`);
    }

    const carTable = (await tablesResp.json()).items.find(t => t.name === 'All Car Rentals');
    if (!carTable) {
      throw new Error('Car rentals table "All Car Rentals" not found in doc');
    }

    const colsResp = await fetch(
      `https://coda.io/apis/v1/docs/${docId}/tables/${carTable.id}/columns`,
      {
        headers: {
          Authorization: `Bearer ${CODA_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    if (!colsResp.ok) {
      throw new Error(`Failed to fetch columns: ${colsResp.status}`);
    }

    const receiptCol = (await colsResp.json()).items.find(c => c.name === 'Receipt');
    if (!receiptCol) {
      return res.status(200).json({ name: '', url: '' });
    }

    const rowResp = await fetch(
      `https://coda.io/apis/v1/docs/${docId}/tables/${carTable.id}/rows/${encodeURIComponent(rowId)}?valueFormat=rich&useColumnNames=false`,
      {
        headers: {
          Authorization: `Bearer ${CODA_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    if (!rowResp.ok) {
      throw new Error(`Failed to fetch row: ${rowResp.status}`);
    }

    const row = await rowResp.json();
    const receipt = cellReceipt(row.values?.[receiptCol.id]);
    return res.status(200).json(receipt);
  } catch (error) {
    console.error('Error resolving car rental receipt:', error);
    return res.status(500).json({ error: error.message || 'Failed to resolve receipt URL' });
  }
}
