export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { flightIata, flightIcao, flightNumber, depIata, arrIata, date } = req.query;

  if (!process.env.AIRLABS_API_KEY) {
    return res.status(500).json({ error: 'AirLabs API key not configured' });
  }

  if (!flightIata && !flightIcao && !flightNumber) {
    return res.status(400).json({ error: 'Flight identifier required (flightIata, flightIcao, or flightNumber)' });
  }

  try {
    // Build AirLabs API URL
    const params = new URLSearchParams({
      api_key: process.env.AIRLABS_API_KEY
    });

    // Add flight identifier (prefer IATA flight number)
    if (flightIata) {
      params.append('flight_iata', flightIata);
    } else if (flightIcao) {
      params.append('flight_icao', flightIcao);
    } else if (flightNumber) {
      params.append('flight_number', flightNumber);
    }

    // Add route filters if provided
    if (depIata) params.append('dep_iata', depIata);
    if (arrIata) params.append('arr_iata', arrIata);

    const apiUrl = `https://airlabs.co/api/v9/flight?${params.toString()}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AirLabs API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Failed to fetch flight data',
        details: errorText 
      });
    }

    const data = await response.json();

    // AirLabs returns { response: [...flights] }
    if (!data.response || data.response.length === 0) {
      return res.status(404).json({ 
        error: 'Flight not found',
        message: 'No matching flight data available. This flight may not be active yet or has already landed.'
      });
    }

    // Return the first matching flight
    const flight = data.response[0];

    // Transform to a cleaner format
    const flightData = {
      status: flight.status || 'unknown',
      updated: flight.updated || null,
      departure: {
        airport: flight.dep_iata || flight.dep_icao,
        terminal: flight.dep_terminal || null,
        gate: flight.dep_gate || null,
        scheduledTime: flight.dep_time || null,
        actualTime: flight.dep_actual || null,
        estimatedTime: flight.dep_estimated || null,
        delay: flight.dep_delayed ? parseInt(flight.dep_delayed) : null
      },
      arrival: {
        airport: flight.arr_iata || flight.arr_icao,
        terminal: flight.arr_terminal || null,
        gate: flight.arr_gate || null,
        scheduledTime: flight.arr_time || null,
        actualTime: flight.arr_actual || null,
        estimatedTime: flight.arr_estimated || null,
        delay: flight.arr_delayed ? parseInt(flight.arr_delayed) : null
      },
      aircraft: {
        registration: flight.reg_number || null,
        model: flight.aircraft_icao || null,
        modelText: flight.aircraft_name || null
      },
      airline: {
        name: flight.airline_name || null,
        iata: flight.airline_iata || null,
        icao: flight.airline_icao || null
      },
      flight: {
        iata: flight.flight_iata || null,
        icao: flight.flight_icao || null,
        number: flight.flight_number || null
      },
      live: flight.lat && flight.lng ? {
        latitude: parseFloat(flight.lat),
        longitude: parseFloat(flight.lng),
        altitude: flight.alt ? parseInt(flight.alt) : null,
        speed: flight.speed ? parseInt(flight.speed) : null,
        direction: flight.dir ? parseInt(flight.dir) : null,
        verticalSpeed: flight.v_speed ? parseInt(flight.v_speed) : null
      } : null
    };

    return res.status(200).json(flightData);

  } catch (error) {
    console.error('Flight status fetch error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
