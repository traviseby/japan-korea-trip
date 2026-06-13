// Resolve hotel/event venue photos and ratings via Google Places API (New).
// Requires GOOGLE_PLACES_API_KEY in the server environment.

function extractPhotoNames(photos) {
  if (!Array.isArray(photos) || !photos.length) return [];
  return photos.slice(0, 5).map(p => p?.name).filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ enriched: false, reason: 'missing_key' });
  }

  const { kind, name, address, city, lat, lng } = req.body || {};
  const label = String(name || '').trim();
  if (!label) {
    return res.status(400).json({ enriched: false, reason: 'missing_name' });
  }

  const textParts = [label];
  if (city) textParts.push(String(city).trim());
  if (address) textParts.push(String(address).trim());
  const textQuery = textParts.filter(Boolean).join(' ');

  const body = { textQuery, maxResultCount: 1 };
  const latNum = lat != null && lat !== '' ? Number(lat) : null;
  const lngNum = lng != null && lng !== '' ? Number(lng) : null;
  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    body.locationBias = {
      circle: {
        center: { latitude: latNum, longitude: lngNum },
        radius: 800
      }
    };
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.name,places.photos,places.rating,places.userRatingCount'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Places search failed:', response.status, detail.slice(0, 200));
      return res.status(200).json({ enriched: false, reason: 'places_error' });
    }

    const data = await response.json();
    const place = data.places?.[0];
    if (!place) {
      return res.status(200).json({ enriched: false, reason: 'not_found' });
    }

    const photoNames = extractPhotoNames(place.photos);
    const payload = {
      enriched: true,
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? null,
      photoUrl: photoNames.length
        ? `/api/places-photo?photo=${encodeURIComponent(photoNames[0])}&maxHeight=480`
        : null,
      photoUrls: photoNames.map(name => 
        `/api/places-photo?photo=${encodeURIComponent(name)}&maxHeight=480`
      )
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error('places-enrich error:', error);
    return res.status(200).json({ enriched: false, reason: 'network_error' });
  }
}
