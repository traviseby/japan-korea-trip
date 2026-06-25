// Shared geocoding for trip sync — Google Places (preferred) or Nominatim fallback.

const NOMINATIM_UA = 'Supertrip/1.0 (https://supertrip-mobile.vercel.app)';
let lastNominatimAt = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocodeWithGoogle(textQuery, apiKey) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.location'
    },
    body: JSON.stringify({ textQuery, maxResultCount: 1 })
  });

  if (!response.ok) return null;

  const data = await response.json();
  const loc = data.places?.[0]?.location;
  if (!loc || loc.latitude == null || loc.longitude == null) return null;

  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function geocodeWithNominatim(query) {
  const elapsed = Date.now() - lastNominatimAt;
  if (elapsed < 1100) await sleep(1100 - elapsed);

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const resp = await fetch(url, { headers: { 'User-Agent': NOMINATIM_UA } });
  lastNominatimAt = Date.now();

  if (!resp.ok) return null;

  const results = await resp.json();
  if (!Array.isArray(results) || !results.length) return null;

  const lat = parseFloat(results[0].lat);
  const lng = parseFloat(results[0].lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

export async function geocodeAddress(query) {
  const text = String(query || '').trim();
  if (!text) return null;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (apiKey) {
    const hit = await geocodeWithGoogle(text, apiKey);
    if (hit) return hit;
  }

  return geocodeWithNominatim(text);
}

export async function fillMissingCoords(items, buildQuery) {
  const cache = new Map();
  for (const item of items) {
    if (item.lat != null && item.lng != null) continue;
    const query = buildQuery(item);
    if (!query) continue;

    if (!cache.has(query)) {
      cache.set(query, await geocodeAddress(query));
    }
    const coords = cache.get(query);
    if (coords) {
      item.lat = coords.lat;
      item.lng = coords.lng;
    }
  }
}
