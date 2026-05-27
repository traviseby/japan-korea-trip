// Vercel serverless function to trigger Coda sync
// No auth needed - keeps the GitHub token secure server-side

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_WORKFLOW_TOKEN;
  if (!GITHUB_TOKEN) {
    console.error('Missing GITHUB_WORKFLOW_TOKEN env var');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch(
      'https://api.github.com/repos/traviseby/japan-korea-trip/actions/workflows/sync-from-coda.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ref: 'main' })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Failed to trigger sync',
        details: errorText 
      });
    }

    return res.status(200).json({ 
      success: true,
      message: 'Sync triggered successfully. Check back in ~1 minute for updates.'
    });
  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
