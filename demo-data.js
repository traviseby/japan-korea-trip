// Sanitized sample trip — used only for offline/error fallback and local dev.
// No real confirmation codes, names, or booking details.
window.DEMO_TRIP_DATA = {
  trip: {
    title: 'Sample Trip',
    start: '2026-07-22',
    end: '2026-07-26',
    lastGenerated: '2026-01-01T00:00:00.000Z'
  },
  days: [
    {
      n: 1,
      date: '2026-07-22',
      title: 'Travel Day',
      loc: 'Travel',
      country: 'JP',
      flag: '🇯🇵',
      lat: 35.6896,
      lng: 139.6917,
      color: '#5c6f87',
      overview: 'Day 1: Travel Day',
      notes: 'Sample international flight. Times and numbers here are placeholders only.',
      hero: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&auto=format&fit=crop&q=70',
      desc: 'A placeholder travel day while your real itinerary loads.'
    },
    {
      n: 2,
      date: '2026-07-23',
      title: 'Tokyo Arrival',
      loc: 'Tokyo',
      country: 'JP',
      flag: '🇯🇵',
      lat: 35.6896,
      lng: 139.6917,
      color: '#1e6a9a',
      overview: 'Day 2: Tokyo Arrival',
      notes: 'Sample arrival day — explore the neighborhood and keep the pace light.',
      hero: 'https://images.unsplash.com/photo-1554797589-7241bb691973?w=900&auto=format&fit=crop&q=70',
      desc: 'Placeholder copy for a first day in Tokyo.'
    },
    {
      n: 3,
      date: '2026-07-24',
      title: 'Explore Tokyo',
      loc: 'Tokyo',
      country: 'JP',
      flag: '🇯🇵',
      lat: 35.658,
      lng: 139.7016,
      color: '#8e44ad',
      overview: 'Day 3: Explore Tokyo',
      notes: 'Sample activities below are generic and not tied to real bookings.',
      hero: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=900&auto=format&fit=crop&q=70',
      desc: 'Placeholder day for testing the app layout.'
    }
  ],
  activities: [
    {
      id: 'demo-act-1',
      day: 2,
      time: 'Afternoon',
      name: 'Sample Neighborhood Walk',
      desc: 'Placeholder activity near the hotel.',
      cat: 'Sightseeing',
      lat: 35.6938,
      lng: 139.7036,
      url: ''
    },
    {
      id: 'demo-act-2',
      day: 3,
      time: 'Morning',
      name: 'Sample Market Visit',
      desc: 'Generic morning outing.',
      cat: 'Food',
      lat: 35.7148,
      lng: 139.7967,
      url: ''
    },
    {
      id: 'demo-act-3',
      day: 3,
      time: 'Evening',
      name: 'Sample Dinner Spot',
      desc: 'Placeholder restaurant block.',
      cat: 'Food',
      lat: 35.658,
      lng: 139.7016,
      url: ''
    }
  ],
  todos: [],
  flights: [
    {
      trip: 'Home → Tokyo',
      airline: 'Sample Air',
      number: 'SA 100',
      from: 'SFO',
      to: 'NRT',
      fromCity: 'San Francisco',
      toCity: 'Tokyo (Narita)',
      date: '2026-07-22',
      depart: '10:30 AM',
      arrive: '2:45 PM'
    },
    {
      trip: 'Tokyo → Home',
      airline: 'Sample Air',
      number: 'SA 200',
      from: 'NRT',
      to: 'SFO',
      fromCity: 'Tokyo (Narita)',
      toCity: 'San Francisco',
      date: '2026-07-26',
      depart: '4:15 PM',
      arrive: '10:20 AM'
    }
  ],
  hotels: [
    {
      name: 'Sample Hotel Tokyo',
      city: 'Tokyo',
      startDate: '2026-07-23',
      endDate: '2026-07-26',
      nights: 3,
      roomType: 'Standard Twin',
      address: 'Sample Ward, Tokyo',
      lat: null,
      lng: null
    }
  ],
  events: [
    {
      id: 'demo-event-1',
      name: 'Sample Food Tour',
      provider: 'Klook',
      bookingRef: 'DEMO123',
      date: '2026-07-24',
      day: 3,
      time: '6:00 PM',
      endTime: '9:00 PM',
      meetupAddress: 'Shinjuku, Tokyo',
      notes: 'Present mobile voucher.',
      cost: null,
      receipt: '',
      receiptUrl: '',
      moreInfo: ''
    }
  ],
  carRentals: [
    {
      id: 'demo-car-rental-1',
      provider: 'Other',
      bookingCode: 'TBD',
      pickupDate: '2026-07-31',
      pickupTime: '9:00 AM',
      returnDate: '2026-07-31',
      returnTime: '5:00 PM',
      address: 'Odawara Station',
      returnAddress: 'Haneda Airport Terminal 3',
      carType: 'Compact / Intermediate',
      cost: 220,
      notes: 'One-way rental for Mt Fuji → Haneda.',
      receipt: '',
      receiptUrl: '',
      lat: 35.2564,
      lng: 139.1547,
      day: 10
    }
  ],
  categories: {
    Food: { label: 'Food', emoji: '🍜' },
    Temple: { label: 'Temple', emoji: '⛩️' },
    Hotel: { label: 'Hotel', emoji: '🏨' },
    Transit: { label: 'Transit', emoji: '🚆' },
    Culture: { label: 'Culture', emoji: '🎭' },
    Nature: { label: 'Nature', emoji: '🌿' },
    Sightseeing: { label: 'Sightseeing', emoji: '📍' },
    Shopping: { label: 'Shopping', emoji: '🛍️' },
    Entertainment: { label: 'Entertainment', emoji: '🎟️' },
    Wellness: { label: 'Wellness', emoji: '💆' },
    Flight: { label: 'Flight', emoji: '✈️' }
  },
  timesOfDay: [
    { id: 'Morning', emoji: '🌅' },
    { id: 'Afternoon', emoji: '☀️' },
    { id: 'Evening', emoji: '🌆' },
    { id: 'Late Night', emoji: '🌙' }
  ]
};
