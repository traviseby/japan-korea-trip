// Vercel serverless function to fetch Coda doc metadata
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { docUrl } = req.body;
  
  if (!docUrl) {
    return res.status(400).json({ error: 'Missing docUrl' });
  }

  // Extract doc ID from URL
  function parseDocId(url) {
    // Match patterns like:
    // https://coda.io/d/Doc-Name_dABCD1234
    // https://coda.io/d/_dABCD1234
    // https://coda.io/d/_ABCD1234 (no 'd' prefix)
    let match = url.match(/\/d\/[^_]*_d([a-zA-Z0-9-]+)/);
    if (match) return match[1];
    
    // Try without the 'd' prefix: /d/_ABCD1234
    match = url.match(/\/d\/_([a-zA-Z0-9-]+)/);
    if (match) return match[1];
    
    // Already just an ID
    if (/^[a-zA-Z0-9-]+$/.test(url)) return url;
    return null;
  }

  const docId = parseDocId(docUrl);
  if (!docId) {
    return res.status(400).json({ error: 'Invalid Coda doc URL' });
  }

  const CODA_TOKEN = process.env.CODA_TOKEN;
  if (!CODA_TOKEN) {
    return res.status(500).json({ error: 'Server configuration error: CODA_TOKEN not set' });
  }

  try {
    // Fetch doc info from Coda API
    const response = await fetch(`https://coda.io/apis/v1/docs/${docId}`, {
      headers: {
        'Authorization': `Bearer ${CODA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Coda API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Coda API error: ${response.status}` 
      });
    }

    const data = await response.json();
    
    // Return just the info we need
    return res.status(200).json({
      name: data.name || 'Untitled',
      icon: data.icon || '✈️',
      workspace: data.workspace || null
    });

  } catch (error) {
    console.error('Error fetching doc info:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch document info',
      details: error.message 
    });
  }
}
