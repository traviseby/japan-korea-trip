// Proxy Google Places photo media so the API key stays server-side.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'missing_key' });
  }

  const photo = String(req.query.photo || '').trim();
  if (!photo || !photo.startsWith('places/')) {
    return res.status(400).json({ error: 'invalid_photo' });
  }

  const maxHeight = Math.min(Math.max(parseInt(req.query.maxHeight, 10) || 480, 120), 800);
  const url = `https://places.googleapis.com/v1/${photo}/media?maxHeightPx=${maxHeight}&key=${apiKey}`;

  try {
    const response = await fetch(url, {
      headers: { 'X-Goog-Api-Key': apiKey },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'photo_fetch_failed' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('places-photo error:', error);
    return res.status(502).json({ error: 'photo_proxy_failed' });
  }
}
