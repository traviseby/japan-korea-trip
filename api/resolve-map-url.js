// Resolve Google Maps short links and share.google place links.

function isGoogleMapsUrl(url) {
  return /google\.com\/maps|maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(url);
}

function isGoogleShareUrl(url) {
  return /share\.google(?:\.com)?\/|google\.com\/share\.google/i.test(url);
}

function isResolvableMapUrl(url) {
  return isGoogleMapsUrl(url) || isGoogleShareUrl(url);
}

function normalizeInputUrl(url) {
  const trimmed = url.trim();
  if (/^share\.google/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
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

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

async function followRedirects(url) {
  const resp = await fetch(url, {
    redirect: 'follow',
    headers: FETCH_HEADERS
  });

  if (!resp.ok && resp.status !== 200) {
    throw new Error(`Failed to resolve URL: ${resp.status}`);
  }

  return resp.url || url;
}

function extractPlaceNameFromGoogleSearchUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('google.')) return null;

    const q = parsed.searchParams.get('q');
    if (!q || /^-?\d+\.?\d*,-?\d+\.?\d*$/.test(q)) return null;

    return decodeURIComponent(q.replace(/\+/g, ' ')).trim() || null;
  } catch {
    return null;
  }
}

async function geocodePlaceName(name) {
  const query = encodeURIComponent(name);
  const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
    headers: {
      'User-Agent': 'Supertrip/1.0 (https://supertrip-mobile.vercel.app)'
    }
  });

  if (!resp.ok) return null;

  const results = await resp.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  const hit = results[0];
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return {
    name: hit.name || name,
    lat,
    lng
  };
}

async function resolveShareGoogleUrl(url) {
  const finalUrl = await followRedirects(url);

  if (isGoogleMapsUrl(finalUrl)) {
    const parsed = parseGoogleMapsUrlFromString(finalUrl);
    if (!parsed.error) {
      return { ...parsed, resolvedUrl: finalUrl };
    }
  }

  const placeName = extractPlaceNameFromGoogleSearchUrl(finalUrl);
  if (placeName) {
    const geocoded = await geocodePlaceName(placeName);
    if (geocoded) {
      return { ...geocoded, resolvedUrl: finalUrl };
    }

    return {
      error: `Could not find coordinates for "${placeName}".`,
      resolvedUrl: finalUrl,
      name: placeName
    };
  }

  return {
    error: 'Could not resolve share.google link.',
    resolvedUrl: finalUrl
  };
}

async function resolveGoogleMapsUrl(url) {
  let finalUrl = url;

  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) {
    finalUrl = await followRedirects(url);
  }

  const parsed = parseGoogleMapsUrlFromString(finalUrl);
  if (parsed.error) {
    return { ...parsed, resolvedUrl: finalUrl };
  }

  return { ...parsed, resolvedUrl: finalUrl };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url' });
  }

  const trimmed = normalizeInputUrl(url);
  if (!isResolvableMapUrl(trimmed)) {
    return res.status(400).json({ error: 'Not a Google Maps or share link' });
  }

  try {
    const result = isGoogleShareUrl(trimmed)
      ? await resolveShareGoogleUrl(trimmed)
      : await resolveGoogleMapsUrl(trimmed);

    if (result.error) {
      return res.status(422).json({
        error: result.error,
        resolvedUrl: result.resolvedUrl,
        name: result.name || null
      });
    }

    return res.status(200).json({
      name: result.name,
      lat: result.lat,
      lng: result.lng,
      resolvedUrl: result.resolvedUrl
    });
  } catch (error) {
    console.error('resolve-map-url error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to resolve Google Maps URL'
    });
  }
}
