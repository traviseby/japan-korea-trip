// Resolve Google Maps short links (maps.app.goo.gl, goo.gl/maps) and extract place data.

function isGoogleMapsUrl(url) {
  return /google\.com\/maps|maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(url);
}

function parseGoogleMapsUrlFromString(url) {
  let lat;
  let lng;
  let name;

  const pinMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (pinMatch) {
    lat = parseFloat(pinMatch[1]);
    lng = parseFloat(pinMatch[2]);
  }

  if (lat == null || lng == null) {
    const coordMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lng = parseFloat(coordMatch[2]);
    }
  }

  const placeMatch = url.match(/\/place\/([^/?@]+)/);
  if (placeMatch) {
    name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
  }

  if (lat == null || lng == null) {
    const queryMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (queryMatch) {
      lat = parseFloat(queryMatch[1]);
      lng = parseFloat(queryMatch[2]);
    }
  }

  if (!name) {
    const nameMatch = url.match(/[?&]q=([^&@]+)/);
    if (nameMatch) {
      name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      if (/^-?\d+\.?\d*,-?\d+\.?\d*/.test(name)) name = null;
    }
  }

  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { error: 'Could not extract coordinates from Google Maps URL.' };
  }

  return { name: name || null, lat, lng };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url' });
  }

  const trimmed = url.trim();
  if (!isGoogleMapsUrl(trimmed)) {
    return res.status(400).json({ error: 'Not a Google Maps URL' });
  }

  try {
    let finalUrl = trimmed;

    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(trimmed)) {
      const resp = await fetch(trimmed, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Supertrip/1.0)',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      if (!resp.ok && resp.status !== 200) {
        throw new Error(`Failed to resolve short URL: ${resp.status}`);
      }

      finalUrl = resp.url || trimmed;
    }

    const parsed = parseGoogleMapsUrlFromString(finalUrl);
    if (parsed.error) {
      return res.status(422).json({ error: parsed.error, resolvedUrl: finalUrl });
    }

    return res.status(200).json({
      ...parsed,
      resolvedUrl: finalUrl
    });
  } catch (error) {
    console.error('resolve-map-url error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to resolve Google Maps URL'
    });
  }
}
