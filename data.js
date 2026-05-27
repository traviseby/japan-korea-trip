// All trip data — read from Coda doc "Japan & Korea Trip" (dJMxdg1mRFk).
// This is the only block that needs to change when the trip updates.
window.DATA = {
  trip: {
    title: "Japan & Korea 2026",
    start: "2026-07-22",
    end:   "2026-08-05",
    party: ["TJ", "Ann", "Travis (17)", "Eli (14)"]
  },

  // Day color mapping (per spec). Day 1 (travel) uses a neutral graphite.
  days: [
    { n: 1,  date: "2026-07-22", title: "Flight to Japan",         loc: "Travel",  country: "JP", flag: "🇯🇵", lat: 47.4502, lng: -122.3088, color: "#5c6f87", overview: "Day 1: Flight to Japan", notes: "Cross dateline; arrive July 23. Flight AS 823 departs Seattle 1:30 PM. In-flight meals provided — no planning needed." },
    { n: 2,  date: "2026-07-23", title: "Tokyo Arrival",           loc: "Tokyo",   country: "JP", flag: "🇯🇵", lat: 35.6896, lng: 139.6995, color: "#1e6a9a", overview: "Day 2: Tokyo Arrival", notes: "Keep first night intentionally light for jet lag recovery. Narita Express to Shinjuku takes ~90 mins. MIMARU is a short walk from Shinjuku Station. Kabukicho and convenience stores are open late — perfect for a low-key first night." },
    { n: 3,  date: "2026-07-24", title: "Modern Tokyo & Shibuya",  loc: "Tokyo",   country: "JP", flag: "🇯🇵", lat: 35.6580, lng: 139.7016, color: "#8e44ad", overview: "Day 3: Modern Tokyo & Shibuya", notes: "Reserve teamLab Planets and Shibuya Sky in advance — both sell out. RURU SHIBUYA has no reservations; arrive close to 11 AM. Shibuya Sky best at sunset — book 6–6:45 PM slot." },
    { n: 4,  date: "2026-07-25", title: "Harajuku & Fireworks",    loc: "Tokyo",   country: "JP", flag: "🇯🇵", lat: 35.6702, lng: 139.7027, color: "#c0392b", overview: "Day 4: Harajuku & Fireworks", notes: "Outdoor activities front-loaded before peak heat. Shinjuku Gyoen open 9 AM. Bring cooling towels and water for the fireworks — crowds and heat are intense. Arrive at viewing area by 4–5 PM. Fireworks begin ~7 PM." },
    { n: 5,  date: "2026-07-26", title: "Shinjuku Nightlife",      loc: "Tokyo",   country: "JP", flag: "🇯🇵", lat: 35.6938, lng: 139.7036, color: "#b25a14", overview: "Day 5: Shinjuku Nightlife", notes: "Sleep in — recovery day after fireworks. Night food tour 5:30–7:30 PM; book in advance. Kura Sushi: use their app to avoid waits. Keep evening flexible after the tour." },
    { n: 6,  date: "2026-07-27", title: "Traditional Tokyo",       loc: "Tokyo",   country: "JP", flag: "🇯🇵", lat: 35.7148, lng: 139.7967, color: "#0e7560", overview: "Day 6: Traditional Tokyo", notes: "Outdoor Asakusa front-loaded — finish Senso-ji and Nakamise by noon before peak heat. Tsukiji vendors sell out by midday. Akihabara afternoon is air-conditioned heat refuge." },
    { n: 7,  date: "2026-07-28", title: "Sumo & Shimokitazawa",    loc: "Tokyo",   country: "JP", flag: "🇯🇵", lat: 35.6614, lng: 139.6677, color: "#1e7d42", overview: "Day 7: Sumo & Shimokitazawa", notes: "Sumo practice is hardest experience to book — confirm in advance. Shimokitazawa best after 5 PM when cooler. Pack tonight for Hakone." },
    { n: 8,  date: "2026-07-29", title: "Tokyo to Hakone",         loc: "Hakone",  country: "JP", flag: "🇯🇵", lat: 35.2324, lng: 139.0260, color: "#2c3e50", overview: "Day 8: Tokyo to Hakone", notes: "Backpacks only — no luggage forwarding needed. Romancecar departs Shinjuku — reserve seats in advance. Check in to Ten-yu by 4 PM. Kaiseki dinner 7:30 PM." },
    { n: 9,  date: "2026-07-30", title: "Relaxed Hakone Day",      loc: "Hakone",  country: "JP", flag: "🇯🇵", lat: 35.2324, lng: 139.0260, color: "#6c3483", overview: "Day 9: Relaxed Hakone Day", notes: "Outdoor lakeside in the morning, ropeway and Owakudani after — both ~1000m and cooler. Open-Air Museum has shaded sections; closes 5 PM. Back by 4–5 PM for onsen. Owakudani may close if volcanic activity is elevated." },
    { n: 10, date: "2026-07-31", title: "Hakone to Korea",         loc: "Travel",  country: "JP", flag: "🇯🇵", lat: 35.3956, lng: 138.7325, color: "#3a6ea5", overview: "Day 10: Hakone to Korea", notes: "Depart Hakone by 11 AM. Fuji Subaru Line vehicle fee at the gate. Coin lockers at 5th Station — bring 100-yen coins. Hakone→Fuji ~1.5h, 1h at top, ~2.5h to Haneda. Flight HND→ICN departs 8:15 PM." },
    { n: 11, date: "2026-08-01", title: "DMZ Adventure",           loc: "Seoul",   country: "KR", flag: "🇰🇷", lat: 37.9586, lng: 126.6779, color: "#c0392b", overview: "Day 11: DMZ Adventure", notes: "Bring passports — required for JSA entry. Book through reputable operator well in advance. Full day — departs Seoul 7–8 AM. JSA access can be restricted on short notice." },
    { n: 12, date: "2026-08-02", title: "Palaces & Museums",       loc: "Seoul",   country: "KR", flag: "🇰🇷", lat: 37.5794, lng: 126.9910, color: "#b53124", overview: "Day 12: Palaces & Museums", notes: "Secret Garden requires advance reservation — limited daily slots, book immediately. Changdeokgung opens 9 AM. Bukchon Hanok Village best before tour groups arrive — be respectful, people live there." },
    { n: 13, date: "2026-08-03", title: "Fish Market & Sky Views", loc: "Seoul",   country: "KR", flag: "🇰🇷", lat: 37.5128, lng: 126.9408, color: "#922b21", overview: "Day 13: Fish Market & Sky Views", notes: "Noryangjin best very early (6–8 AM) for the freshest selection and auction atmosphere. Seoul Sky — book sunset slot in advance. Gangnam dinner — lively but pricier." },
    { n: 14, date: "2026-08-04", title: "Markets & Hongdae",       loc: "Seoul",   country: "KR", flag: "🇰🇷", lat: 37.5563, lng: 126.9237, color: "#a93226", overview: "Day 14: Markets & Hongdae", notes: "Namdaemun opens early; best before noon. N Seoul Tower by cable car or walk up Namsan. Hongdae most vibrant after 8 PM — great farewell night. Last day for souvenir shopping." },
    { n: 15, date: "2026-08-05", title: "Journey Home",            loc: "Travel",  country: "KR", flag: "🇰🇷", lat: 37.4602, lng: 126.4407, color: "#7b241c", overview: "Day 15: Journey Home", notes: "Flight AS 172 departs ICN 7:35 PM — arrive Incheon by 4:30 PM (allow 3+ hours). Incheon has excellent shopping and food in the terminal. Check luggage weight — Japan/Korea shopping adds up fast." }
  ],

  // Per-day hero images. Curated free Unsplash photos that match the day's theme.
  // (In production these would come from the Coda Image URL column.)
  heroes: {
    1:  "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&auto=format&fit=crop&q=70",
    2:  "https://images.unsplash.com/photo-1554797589-7241bb691973?w=900&auto=format&fit=crop&q=70",
    3:  "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=900&auto=format&fit=crop&q=70",
    4:  "https://images.unsplash.com/photo-1528164344705-47542687000d?w=900&auto=format&fit=crop&q=70",
    5:  "https://images.unsplash.com/photo-1554797589-7241bb691973?w=900&auto=format&fit=crop&q=70",
    6:  "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=900&auto=format&fit=crop&q=70",
    7:  "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=900&auto=format&fit=crop&q=70",
    8:  "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=900&auto=format&fit=crop&q=70",
    9:  "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=900&auto=format&fit=crop&q=70",
    10: "https://images.unsplash.com/photo-1578637387939-43c525550085?w=900&auto=format&fit=crop&q=70",
    11: "https://images.unsplash.com/photo-1538485399081-7191377e8241?w=900&h=600&auto=format&fit=crop&crop=top&q=70",
    12: "https://images.unsplash.com/photo-1538485399081-7191377e8241?w=900&auto=format&fit=crop&q=70",
    13: "https://images.unsplash.com/photo-1538669715315-155098f0fb1d?w=900&auto=format&fit=crop&q=70",
    14: "https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=900&auto=format&fit=crop&q=70",
    15: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&auto=format&fit=crop&q=70"
  },

  // Flights, from the All flights table (+ the HND→ICN leg called out in the itinerary on Day 10).
  flights: [
    { day: 1,  airline: "Alaska Airlines",  number: "AS 823", from: "SEA", to: "NRT", fromCity: "Seattle",       toCity: "Tokyo (Narita)",  depart: "13:30", arrive: "16:00+1", date: "2026-07-22" },
    { day: 10, airline: "Korean Air",       number: "KE 2708",from: "HND", to: "ICN", fromCity: "Tokyo (Haneda)",toCity: "Seoul (Incheon)", depart: "20:15", arrive: "22:50",   date: "2026-07-31" },
    { day: 15, airline: "Alaska Airlines",  number: "AS 172", from: "ICN", to: "SEA", fromCity: "Seoul (Incheon)", toCity: "Seattle",      depart: "19:35", arrive: "14:05",   date: "2026-08-05" }
  ],

  // Category metadata — emoji + label, per spec.
  categories: {
    "Food":     { emoji: "🍜", label: "Food" },
    "Shopping":         { emoji: "🛍️", label: "Shopping" },
    "Entertainment":    { emoji: "🎮", label: "Entertainment" },
    "Temple":  { emoji: "⛩️", label: "Temple" },
    "Nature":   { emoji: "🌿", label: "Nature" },
    "Flight":           { emoji: "✈️", label: "Flight" },
    "Transit":  { emoji: "🚅", label: "Transit" },
    "Hotel":  { emoji: "🏨", label: "Hotel" },
    "Sightseeing":      { emoji: "📍", label: "Sightseeing" },
    "Culture":{ emoji: "🏯", label: "Culture" },
    "Wellness":         { emoji: "♨️", label: "Wellness" }
  },

  timesOfDay: [
    { id: "Morning",    emoji: "🌅" },
    { id: "Afternoon",  emoji: "☀️" },
    { id: "Evening",    emoji: "🌙" },
    { id: "Late Night", emoji: "🌃" }
  ],

  // All ~106 activities, with hand-placed lat/lng for the map.
  // Format: { id, day, time, name, desc, url, cat, lat, lng }
  activities: [
    // Day 1 — Travel
    { id: "lrv4IIsiIR", day:1, time:"Afternoon",  name:"Alaska/Hawaiian Flight to Tokyo", desc:"Begin your transpacific journey to Japan with an overnight international flight crossing the International Date Line.", url:"https://www.alaskaair.com/", cat:"Flight", lat:47.4502, lng:-122.3088 },

    // Day 2 — Tokyo Arrival
    { id: "re_ngHfBWS", day:2, time:"Afternoon",  name:"Arrive Narita Airport", desc:"Land in Japan and experience your first taste of Tokyo energy at Narita Airport.", url:"https://www.narita-airport.jp/en/", cat:"Flight", lat:35.7720, lng:140.3929 },
    { id: "9kRwfKyBbi", day:2, time:"Afternoon",  name:"Narita Express to Shinjuku", desc:"Ride Japan's famously efficient Narita Express into central Tokyo.", url:"https://www.jreast.co.jp/multi/en/nex/", cat:"Transit", lat:35.6896, lng:139.7006 },
    { id: "n-P40d4FSl", day:2, time:"Evening",    name:"Kabukicho Walk", desc:"Wander through glowing neon streets, arcades, tiny bars, and bustling entertainment alleys in Shinjuku's iconic nightlife district.", url:"https://www.gotokyo.org/en/destinations/western-tokyo/shinjuku/index.html", cat:"Sightseeing", lat:35.6948, lng:139.7029 },
    { id: "32BTP_fDqH", day:2, time:"Evening",    name:"First Ramen Dinner", desc:"Your first authentic Tokyo ramen experience after arriving in Japan.", url:"https://www.timeout.com/tokyo/restaurants/best-ramen-in-shinjuku", cat:"Food", lat:35.6938, lng:139.7036 },
    { id: "2qZ9Di2qQx", day:2, time:"Late Night", name:"Convenience Store Snack Run", desc:"Explore Japanese convenience stores filled with incredible snacks, desserts, drinks, and bizarre seasonal treats.", url:"https://livejapan.com/en/article-a0000688/", cat:"Food", lat:35.6936, lng:139.7020 },

    // Day 3 — Modern Tokyo & Shibuya
    { id: "Jz8vj-6614", day:3, time:"Morning",    name:"FLIPPER'S Soufflé Pancakes", desc:"Start the morning with Tokyo's famous fluffy soufflé pancakes.", url:"https://flippers-pancake.jp/", cat:"Food", lat:35.6595, lng:139.6993 },
    { id: "JVeWTHnEQ8", day:3, time:"Afternoon",  name:"teamLab Planets TOKYO", desc:"Step barefoot into one of the world's most immersive digital art museums where entire rooms react to your movement with light, water, sound, and projection mapping.", url:"https://www.teamlab.art/e/planets/", cat:"Entertainment", lat:35.6537, lng:139.7892 },
    { id: "iMrm2_OrHC", day:3, time:"Afternoon",  name:"RURU SHIBUYA", desc:"A uniquely atmospheric café tucked on the 2nd floor of Shibuya Sakura Stage, famous for its stunning \"water table\" concept where desserts and drinks appear to float above a bed of pebbles in a shallow pool.", url:"https://maps.app.goo.gl/TosocKzN5RqZwAiQ6", cat:"Food", lat:35.6575, lng:139.7000 },
    { id: "Orql9IYLzk", day:3, time:"Afternoon",  name:"Pepper PARLOR", desc:"Futuristic robot café experience with interactive robot servers and playful technology-driven dining.", url:"https://www.pepperparlor.com/", cat:"Food", lat:35.6583, lng:139.7032 },
    { id: "ruIk0cdX3P", day:3, time:"Afternoon",  name:"Nintendo TOKYO", desc:"Explore Nintendo's flagship Tokyo store filled with exclusive merchandise, gaming displays, and themed collectibles.", url:"https://www.nintendo.co.jp/officialstore/", cat:"Shopping", lat:35.6594, lng:139.7008 },
    { id: "Ierm_-B8R-", day:3, time:"Afternoon",  name:"PARCO Shopping", desc:"Explore Tokyo's trendiest shopping complex filled with gaming, anime, fashion, and pop culture stores.", url:"https://shibuya.parco.jp/", cat:"Shopping", lat:35.6611, lng:139.6986 },
    { id: "ZjwuWxqHYx", day:3, time:"Evening",    name:"Tokyu Hands Shibuya", desc:"A legendary multi-floor department store packed with gadgets, stationery, craft supplies, travel gear, beauty products, and all manner of bizarre and useful Japanese novelty items.", url:"https://shibuya.hands.net/", cat:"Shopping", lat:35.6608, lng:139.6982 },
    { id: "GUL18oPGCO", day:3, time:"Evening",    name:"Shibuya Crossing", desc:"Experience the world's most famous pedestrian crossing amid Tokyo's dazzling neon skyline.", url:"https://www.gotokyo.org/en/spot/59/index.html", cat:"Sightseeing", lat:35.6595, lng:139.7005 },
    { id: "_WgQ0dE0Q9", day:3, time:"Evening",    name:"Giant Parfait Café", desc:"Enjoy absurdly over-the-top Japanese dessert creations towering with fruit, cream, and ice cream.", url:"https://www.timeout.com/tokyo/restaurants/best-parfaits-in-tokyo", cat:"Food", lat:35.6608, lng:139.7019 },
    { id: "y5Zhd8OOYN", day:3, time:"Evening",    name:"Shibuya Sky", desc:"Soar above Tokyo atop one of the city's most spectacular observation decks suspended high above Shibuya Crossing. The open-air rooftop offers breathtaking 360-degree views.", url:"https://www.shibuya-scramble-square.com/sky/", cat:"Sightseeing", lat:35.6586, lng:139.7028 },
    { id: "b-IRRhfhMn", day:3, time:"Evening",    name:"Shibuya Wandering", desc:"Explore side streets, neon alleys, music shops, arcades, and hidden cafés around Shibuya.", url:"https://www.gotokyo.org/en/destinations/western-tokyo/shibuya/index.html", cat:"Sightseeing", lat:35.6620, lng:139.6995 },

    // Day 4 — Harajuku & Fireworks
    { id: "gZPqox2KKD", day:4, time:"Morning",    name:"Shinjuku Gyoen", desc:"One of Tokyo's most beautiful national gardens, combining Japanese, French, and English garden styles across 58 hectares. A rare peaceful escape from the energy of Shinjuku.", url:"https://www.env.go.jp/garden/shinjukugyoen/english/index.html", cat:"Nature", lat:35.6852, lng:139.7100 },
    { id: "mJIgvrk7Wq", day:4, time:"Morning",    name:"Meiji Shrine", desc:"Hidden within a massive forest in the center of Tokyo, Meiji Shrine feels worlds away from the city's neon energy. Massive torii gates, shaded gravel pathways, towering cedar trees, and peaceful shrine buildings.", url:"https://www.meijijingu.or.jp/en/", cat:"Temple", lat:35.6764, lng:139.6993 },
    { id: "_-3Pi0IfLo", day:4, time:"Morning",    name:"Yoyogi Park", desc:"A vast, forested park just a short walk from Harajuku and Meiji Shrine. On weekends it comes alive with street performers, musicians, cosplayers, picnickers.", url:"https://www.gotokyo.org/en/spot/35/index.html", cat:"Nature", lat:35.6720, lng:139.6948 },
    { id: "jqZ8KuRY8u", day:4, time:"Morning",    name:"Harajuku Exploration", desc:"Wander through Tokyo's colorful youth-fashion district filled with quirky shops and pop culture energy.", url:"https://www.gotokyo.org/en/destinations/western-tokyo/harajuku/index.html", cat:"Sightseeing", lat:35.6702, lng:139.7027 },
    { id: "qs0WepQIh1", day:4, time:"Afternoon",  name:"Takeshita Street", desc:"Dive into Harajuku's iconic street lined with crepe stands, candy shops, and playful fashion boutiques.", url:"https://www.gotokyo.org/en/spot/41/index.html", cat:"Shopping", lat:35.6716, lng:139.7028 },
    { id: "fS88CRUT6x", day:4, time:"Afternoon",  name:"Hedgehog Café HARRY", desc:"Relax at one of Tokyo's whimsical animal cafés featuring adorable hedgehogs.", url:"https://www.harinezumi-cafe.com/english", cat:"Entertainment", lat:35.6712, lng:139.7030 },
    { id: "FtRPI0JIP_", day:4, time:"Afternoon",  name:"Harajuku Street Snacks & Crepes", desc:"Sample iconic Japanese crepes and trendy street snacks while wandering Harajuku.", url:"https://www.timeout.com/tokyo/restaurants/best-crepes-in-harajuku", cat:"Food", lat:35.6705, lng:139.7032 },
    { id: "OhY3sfiTgf", day:4, time:"Afternoon",  name:"Purikura Photo Booth", desc:"Quintessentially Japanese photo booths — take group photos, then decorate with stickers, stamps, digital backgrounds, and cute filters before printing wallet-sized strips.", url:"https://www.google.com/search?q=Purikura+photo+booth+Shibuya+Harajuku", cat:"Entertainment", lat:35.6710, lng:139.7040 },
    { id: "LU2WXccA-x", day:4, time:"Afternoon",  name:"KUOE KYOTO Omotesando", desc:"A boutique watch brand originally from Kyoto, now with a Tokyo outpost on Omotesando boulevard. Beautifully crafted Japanese watches with interchangeable straps and distinct artisan aesthetic.", url:"https://linktr.ee/kuoe_kyoto", cat:"Shopping", lat:35.6662, lng:139.7124 },
    { id: "IyCmMmYS82", day:4, time:"Afternoon",  name:"Omotesando Wandering", desc:"Explore stylish tree-lined boulevards filled with luxury architecture and hidden cafés.", url:"https://www.gotokyo.org/en/destinations/western-tokyo/omotesando/index.html", cat:"Sightseeing", lat:35.6660, lng:139.7126 },
    { id: "IJ-dYPBVEf", day:4, time:"Afternoon",  name:"Hotel Recharge Break", desc:"Return to the hotel for showers, rest, and AC before fireworks crowds.", url:"", cat:"Hotel", lat:35.6909, lng:139.6950 },
    { id: "zgez79OhcK", day:4, time:"Evening",    name:"Sumida River Fireworks Festival", desc:"One of Japan's oldest and most famous fireworks festivals. Tens of thousands of fireworks erupt over the Sumida River while the Tokyo skyline glows in the background.", url:"https://en.japantravel.com/tokyo/sumidagawa-fireworks-festival/24685", cat:"Entertainment", lat:35.7106, lng:139.8003 },

    // Day 5 — Shinjuku Nightlife
    { id: "9h2Kg1XIlR", day:5, time:"Morning",    name:"Sleep In & Relaxed Brunch", desc:"Slow recovery morning after fireworks night.", url:"", cat:"Hotel", lat:35.6909, lng:139.6950 },
    { id: "JBLckUFDMS", day:5, time:"Afternoon",  name:"Isetan Shinjuku Depachika", desc:"Graze through one of Tokyo's most legendary basement food halls featuring incredible desserts, sushi, wagyu, and pastries.", url:"https://www.mistore.jp/store/shinjuku.html", cat:"Food", lat:35.6918, lng:139.7044 },
    { id: "0f0ig4MGiw", day:5, time:"Afternoon",  name:"Yodobashi Camera Shinjuku", desc:"Explore towering electronics megastores filled with gadgets, cameras, toys, gaming gear, and tech.", url:"https://www.yodobashi.com/ec/store/0018/", cat:"Shopping", lat:35.6920, lng:139.6985 },
    { id: "0LHtpvMsdJ", day:5, time:"Afternoon",  name:"Bic Camera Shinjuku", desc:"A massive multi-floor electronics megastore in East Shinjuku with an attached Uniqlo. Cameras, phones, gaming, watches, appliances, toys, anime figures.", url:"https://www.biccamera.com/bc/tenpo/BCT0018/index.jsp", cat:"Shopping", lat:35.6907, lng:139.7038 },
    { id: "hQfacRLoxX", day:5, time:"Afternoon",  name:"Onitsuka Tiger Shinjuku South", desc:"The flagship Onitsuka Tiger store in Tokyo. Widest selection of styles in the city. Prices roughly half of US retail with tax-free shopping using your passport.", url:"https://www.onitsukatiger.com/jp/ja-jp", cat:"Shopping", lat:35.6883, lng:139.7016 },
    { id: "8VO7I4hSzY", day:5, time:"Evening",    name:"Guided Shinjuku Night Food Tour", desc:"Explore hidden alleys, yakitori bars, lantern-lit streets, and local eateries with a guide.", url:"https://www.getyourguide.com/tokyo-l193/tokyo-shinjuku-food-tour-t190779/", cat:"Food", lat:35.6940, lng:139.7032 },
    { id: "J1i-hxAYbg", day:5, time:"Evening",    name:"Kura Sushi Dinner", desc:"Enjoy conveyor-belt sushi with touchscreen ordering and prize games perfect for families.", url:"https://www.kurasushi.co.jp/en/", cat:"Food", lat:35.6939, lng:139.7045 },
    { id: "Xr_dsqkpZO", day:5, time:"Evening",    name:"Omoide Yokocho (Piss Alley)", desc:"Wander atmospheric lantern-lit alleyways packed with tiny yakitori bars and smoky food stalls.", url:"https://www.gotokyo.org/en/spot/44/index.html", cat:"Food", lat:35.6929, lng:139.6998 },
    { id: "jut0l5gzTY", day:5, time:"Evening",    name:"Golden Gai", desc:"Explore Tokyo's iconic maze of miniature bars and nightlife alleys.", url:"https://www.gotokyo.org/en/spot/63/index.html", cat:"Food", lat:35.6939, lng:139.7041 },
    { id: "i-CtvsMHPT", day:5, time:"Evening",    name:"Shinjuku Batting Center", desc:"Experience classic Japanese urban batting cages glowing beneath neon lights.", url:"https://www.timeout.com/tokyo/things-to-do/shinjuku-batting-center", cat:"Entertainment", lat:35.6947, lng:139.7053 },
    { id: "0Fj-eR5QBT", day:5, time:"Evening",    name:"Retro Arcades", desc:"Dive into nostalgic Japanese gaming culture with multi-floor retro arcades.", url:"https://www.timeout.com/tokyo/things-to-do/best-game-centres-in-tokyo", cat:"Entertainment", lat:35.6938, lng:139.7050 },
    { id: "nNfuyJL49r", day:5, time:"Late Night", name:"Don Quijote", desc:"Explore Tokyo's chaotic late-night discount megastore packed with bizarre Japanese products and souvenirs.", url:"https://www.donki.com/en/", cat:"Shopping", lat:35.6944, lng:139.7039 },
    { id: "cvQzZnNOWV", day:5, time:"Late Night", name:"Free Tokyo Wandering", desc:"Keep the night intentionally open for spontaneous discoveries and memorable moments.", url:"", cat:"Sightseeing", lat:35.6940, lng:139.7035 },

    // Day 6 — Traditional Tokyo
    { id: "CmayqPx6tT", day:6, time:"Morning",    name:"Tsukiji Outer Market", desc:"Sample sushi, wagyu skewers, tamagoyaki, and famous Tokyo street food at one of Japan's legendary food markets.", url:"https://www.tsukiji.or.jp/english/", cat:"Food", lat:35.6655, lng:139.7707 },
    { id: "ui5hHqWIFC", day:6, time:"Morning",    name:"Guided Asakusa Food & Culture Tour", desc:"Explore historic Tokyo with local storytelling, hidden alleys, and traditional food culture.", url:"https://www.getyourguide.com/tokyo-l193/asakusa-cultural-walking-food-tour-t450345/", cat:"Culture", lat:35.7148, lng:139.7967 },
    { id: "Tgbsi29qjT", day:6, time:"Morning",    name:"Asakusa Viral Street Food", desc:"The narrow lanes surrounding Nakamise Shopping Street and Senso-ji are packed with vendors selling Tokyo's most iconic and social-media-famous street snacks — ningyo-yaki, tamagoyaki, melon pan, strawberry daifuku.", url:"", cat:"Food", lat:35.7140, lng:139.7965 },
    { id: "a1qlx4v9I7", day:6, time:"Morning",    name:"Senso-ji Temple", desc:"Tokyo's oldest and most famous Buddhist temple at the heart of historic Asakusa. Enter through the massive Kaminarimon Gate beneath its giant red lantern.", url:"https://www.senso-ji.jp/english/", cat:"Temple", lat:35.7148, lng:139.7967 },
    { id: "1KpEwmULDZ", day:6, time:"Morning",    name:"Nakamise Street", desc:"Browse traditional snack stalls and souvenir shops leading toward Senso-ji Temple.", url:"https://www.gotokyo.org/en/spot/15/index.html", cat:"Shopping", lat:35.7128, lng:139.7960 },
    { id: "hUeZsz7uRa", day:6, time:"Evening",    name:"Akihabara", desc:"Tokyo's legendary electric town where anime culture, retro gaming, giant arcades, collectible figures, capsule toys, electronics stores, and glowing neon signage combine into sensory overload in the best way.", url:"https://www.gotokyo.org/en/destinations/eastern-tokyo/akihabara/index.html", cat:"Sightseeing", lat:35.7022, lng:139.7745 },
    { id: "8TIxleQllM", day:6, time:"Evening",    name:"Super Potato Akihabara", desc:"The most famous retro video game store in Japan. Multi-floor pilgrimage for any gaming fan, with vintage consoles and cartridges from Famicom to PlayStation. Top floor has a working retro arcade.", url:"https://www.superpotato.com/", cat:"Shopping", lat:35.7008, lng:139.7710 },
    { id: "VYtjLlVvzX", day:6, time:"Evening",    name:"Yodobashi Akihabara", desc:"One of the largest electronics retail complexes in the world, with eight interconnected floors covering cameras, gaming, audio, drones, watches, toys, hobby supplies.", url:"https://www.yodobashi-akiba.com/", cat:"Shopping", lat:35.7019, lng:139.7749 },
    { id: "mhN62Sexuc", day:6, time:"Evening",    name:"Retro Arcades in Akihabara", desc:"Explore multi-floor gaming arcades packed with rhythm games, claw machines, and retro classics.", url:"https://www.timeout.com/tokyo/things-to-do/best-game-centres-in-tokyo", cat:"Entertainment", lat:35.7025, lng:139.7732 },
    { id: "9XZjHmqeyQ", day:6, time:"Evening",    name:"Capsule Toy Megastores", desc:"Browse giant gachapon stores filled with collectible capsule toys.", url:"https://livejapan.com/en/article-a0005044/", cat:"Shopping", lat:35.7018, lng:139.7732 },
    { id: "1VyIcr1d3I", day:6, time:"Evening",    name:"Gachapon Department Store", desc:"Experience Japan's massive capsule toy culture with thousands of machines under one roof.", url:"https://bandainamco-am.co.jp/others/gashapon-bandai-officialshop/", cat:"Shopping", lat:35.7028, lng:139.7745 },

    // Day 7 — Sumo & Shimokitazawa
    { id: "mmKmNqwC-_", day:7, time:"Morning",    name:"Sumo Stable Practice", desc:"Watch authentic sumo wrestlers train during an intimate morning practice session.", url:"https://www.getyourguide.com/tokyo-l193/tokyo-sumo-morning-practice-tour-t245223/", cat:"Culture", lat:35.6975, lng:139.7935 },
    { id: "rdusEXGcOp", day:7, time:"Afternoon",  name:"Shimokitazawa Exploration", desc:"Wander Tokyo's coolest indie neighborhood filled with vintage fashion, cafés, vinyl shops, and creative culture.", url:"https://www.gotokyo.org/en/destinations/western-tokyo/shimokitazawa/index.html", cat:"Sightseeing", lat:35.6614, lng:139.6677 },
    { id: "tQcq9on3LL", day:7, time:"Afternoon",  name:"Village Vanguard Shimokitazawa", desc:"A wonderfully chaotic pop-culture store crammed with books, manga, band merchandise, novelty items, weird snacks, quirky toys, and Japanese oddities.", url:"https://www.village-v.co.jp/", cat:"Shopping", lat:35.6614, lng:139.6680 },
    { id: "hvc20BWnsy", day:7, time:"Afternoon",  name:"Vintage Shopping", desc:"Explore Tokyo's famous secondhand fashion and collectible stores.", url:"https://tokyocheapo.com/shopping-2/vintage-shopping-shimokitazawa/", cat:"Shopping", lat:35.6618, lng:139.6675 },
    { id: "f1qnnpVo6D", day:7, time:"Afternoon",  name:"Indie Cafés", desc:"Relax in cozy hidden cafés scattered throughout Shimokitazawa.", url:"https://www.timeout.com/tokyo/restaurants/best-cafes-in-shimokitazawa", cat:"Food", lat:35.6610, lng:139.6672 },
    { id: "eZdWpycC8l", day:7, time:"Afternoon",  name:"Vinyl Record Stores", desc:"Browse iconic Japanese record shops filled with rare vinyl and music memorabilia.", url:"https://tokyocheapo.com/shopping-2/best-record-stores-in-tokyo/", cat:"Shopping", lat:35.6615, lng:139.6678 },
    { id: "903AacUi0O", day:7, time:"Evening",    name:"Final Tokyo Dinner", desc:"Celebrate your final evening in Tokyo before heading to Hakone.", url:"", cat:"Food", lat:35.6918, lng:139.7044 },

    // Day 8 — Tokyo to Hakone
    { id: "At9VjPoAap", day:8, time:"Morning",    name:"Romancecar / Hakone Transit", desc:"Leave Tokyo behind and journey toward Hakone's mountain landscapes.", url:"https://www.odakyu.jp/english/romancecar/", cat:"Transit", lat:35.6909, lng:139.7006 },
    { id: "Z1jAHI4xLc", day:8, time:"Afternoon",  name:"Hakone Kowakien Ten-yu Check-In", desc:"Arrive at one of Hakone's most luxurious modern ryokan resorts where traditional Japanese hospitality meets stunning mountain scenery. Expansive open-air onsen overlooking forested hills.", url:"https://www.ten-yu.com/en/", cat:"Hotel", lat:35.2473, lng:139.0306 },
    { id: "M4CkHMmzf3", day:8, time:"Evening",    name:"Onsen Experience", desc:"Relax in traditional Japanese hot spring baths overlooking Hakone's mountains.", url:"https://www.japan-guide.com/e/e2292.html", cat:"Wellness", lat:35.2473, lng:139.0306 },
    { id: "bgvqONpQot", day:8, time:"Evening",    name:"Kaiseki Dinner", desc:"Enjoy a beautifully prepared multi-course Japanese seasonal dinner experience.", url:"https://www.japan-guide.com/e/e2043.html", cat:"Food", lat:35.2473, lng:139.0306 },

    // Day 9 — Relaxed Hakone
    { id: "zWzNBUlv63", day:9, time:"Morning",    name:"Ryokan Breakfast", desc:"Experience a traditional Japanese ryokan breakfast.", url:"", cat:"Food", lat:35.2473, lng:139.0306 },
    { id: "Or1-Hn9Dqu", day:9, time:"Morning",    name:"Hakone Tea House Experience", desc:"Slow down with matcha tea and wagashi sweets in a peaceful Hakone tea house or garden setting.", url:"https://www.hakone.or.jp/5580", cat:"Culture", lat:35.2380, lng:139.0270 },
    { id: "-BrGN810dN", day:9, time:"Afternoon",  name:"Hakone Shrine", desc:"Nestled beside Lake Ashi beneath towering cedar trees, Hakone Shrine is one of Japan's most atmospheric spiritual sites. The iconic red torii gate rises from the lake.", url:"https://www.hakoneshrine.or.jp/english/", cat:"Temple", lat:35.2049, lng:139.0250 },
    { id: "kyPAyNrhdj", day:9, time:"Afternoon",  name:"Lake Ashi Cruise", desc:"Cruise across scenic Lake Ashi with possible Mount Fuji views.", url:"https://www.hakone-kankosen.co.jp/foreign/en/", cat:"Sightseeing", lat:35.2046, lng:139.0252 },
    { id: "h_DRVYAR8-", day:9, time:"Afternoon",  name:"Hakone Ropeway", desc:"Float above volcanic valleys and steaming sulfur vents.", url:"https://www.hakoneropeway.co.jp/foreign/en/", cat:"Sightseeing", lat:35.2412, lng:139.0186 },
    { id: "L389J1yA-Y", day:9, time:"Afternoon",  name:"Owakudani", desc:"Explore Hakone's volcanic valley famous for black eggs and geothermal activity.", url:"https://www.japan-guide.com/e/e5202.html", cat:"Nature", lat:35.2412, lng:139.0186 },
    { id: "pvwFLIrOXf", day:9, time:"Afternoon",  name:"Hakone Open-Air Museum", desc:"Explore one of Japan's most beautiful sculpture museums surrounded by mountain scenery.", url:"https://www.hakone-oam.or.jp/en/", cat:"Entertainment", lat:35.2462, lng:139.0489 },
    { id: "hxDbX6ugME", day:9, time:"Evening",    name:"Onsen Relaxation", desc:"Enjoy another peaceful evening soaking in hot springs.", url:"", cat:"Wellness", lat:35.2473, lng:139.0306 },
    { id: "NgQtEc-w3-", day:9, time:"Evening",    name:"Ryokan Dinner", desc:"Experience another refined Japanese ryokan dining experience.", url:"", cat:"Food", lat:35.2473, lng:139.0306 },

    // Day 10 — Hakone to Korea
    { id: "TeF5_Wr6Nl", day:10, time:"Morning",   name:"Final Hakone Morning", desc:"Enjoy one last slow morning in the mountains before traveling onward.", url:"", cat:"Hotel", lat:35.2473, lng:139.0306 },
    { id: "6vGpGL9b96", day:10, time:"Morning",   name:"Mt. Fuji 5th Station", desc:"A spectacular detour on the way from Hakone to Haneda Airport. The Fuji Subaru Line climbs to 2,305m on the north side of Mt. Fuji. On a clear day the views are jaw-dropping.", url:"https://www.fujisan-climb.jp/en/", cat:"Nature", lat:35.3956, lng:138.7325 },
    { id: "HT1_g6yY82", day:10, time:"Afternoon", name:"Transit to Haneda Airport", desc:"Return from the mountains to Tokyo for your evening international flight.", url:"https://tokyo-haneda.com/en/", cat:"Transit", lat:35.5494, lng:139.7798 },
    { id: "bc6cwFtD_X", day:10, time:"Evening",   name:"Flight to Seoul", desc:"Begin the Korea portion of your adventure.", url:"https://www.koreanair.com/", cat:"Flight", lat:35.5494, lng:139.7798 },

    // Day 11 — DMZ
    { id: "ct_Tckm16A", day:11, time:"Morning",   name:"DMZ Tour", desc:"Journey to the Korean Demilitarized Zone for one of the trip's most powerful historical experiences.", url:"https://www.getyourguide.com/seoul-l197/from-seoul-dmz-half-or-full-day-tour-t123456/", cat:"Culture", lat:37.9586, lng:126.6779 },
    { id: "UChosLN3vK", day:11, time:"Morning",   name:"Joint Security Area", desc:"View one of the world's most tense and historic borders.", url:"https://english.visitkorea.or.kr/", cat:"Culture", lat:37.9559, lng:126.6764 },
    { id: "FOrzqLUX6v", day:11, time:"Afternoon", name:"3rd Tunnel", desc:"Descend into the underground infiltration tunnel near the North Korean border.", url:"https://english.visitkorea.or.kr/", cat:"Culture", lat:37.9362, lng:126.7011 },
    { id: "3_-eoZBo-N", day:11, time:"Afternoon", name:"Observatory", desc:"Peer across the border into North Korea.", url:"https://english.visitkorea.or.kr/", cat:"Sightseeing", lat:37.9170, lng:126.6800 },
    { id: "RhwFVSMcCU", day:11, time:"Afternoon", name:"Dorasan Station", desc:"Visit the symbolic final train station before North Korea.", url:"https://english.visitkorea.or.kr/", cat:"Culture", lat:37.8961, lng:126.6816 },
    { id: "0pRGSqAPjt", day:11, time:"Evening",   name:"Itaewon Korean BBQ", desc:"Celebrate the evening with authentic Korean BBQ in Seoul's international district.", url:"https://www.timeout.com/seoul/restaurants/best-korean-bbq-restaurants-in-seoul", cat:"Food", lat:37.5346, lng:126.9942 },

    // Day 12 — Palaces & Museums
    { id: "nlozLYaUEC", day:12, time:"Morning",   name:"Changdeokgung Palace", desc:"Widely considered Seoul's most beautiful royal palace, Changdeokgung blends elegant Joseon Dynasty architecture with stunning natural surroundings. A UNESCO World Heritage Site.", url:"https://eng.cdg.go.kr/", cat:"Culture", lat:37.5794, lng:126.9910 },
    { id: "-w30LIFn7-",day:12, time:"Morning",   name:"Secret Garden", desc:"Wander tranquil royal gardens hidden behind Changdeokgung Palace.", url:"https://eng.cdg.go.kr/", cat:"Nature", lat:37.5810, lng:126.9930 },
    { id: "AX6yo4ZBbN", day:12, time:"Afternoon", name:"Bukchon Hanok Village", desc:"Explore preserved traditional Korean homes along scenic hillside streets.", url:"https://english.visitseoul.net/attractions/Bukchon-Hanok-Village_/378", cat:"Culture", lat:37.5826, lng:126.9836 },
    { id: "E7cC_n1hl9", day:12, time:"Afternoon", name:"National Museum of Korea", desc:"Discover Korea's extraordinary history and cultural treasures.", url:"https://www.museum.go.kr/site/eng/home", cat:"Culture", lat:37.5240, lng:126.9803 },
    { id: "f3e9rBuiFl", day:12, time:"Evening",   name:"Gwangjang Market", desc:"Experience one of Seoul's most famous traditional food markets.", url:"https://english.visitseoul.net/markets/Gwangjang-Market_/376", cat:"Food", lat:37.5704, lng:127.0011 },
    { id: "cu_e8v1GG1", day:12, time:"Evening",   name:"Korean BBQ Dinner", desc:"Enjoy another classic Korean dining experience.", url:"https://www.timeout.com/seoul/restaurants/best-korean-bbq-restaurants-in-seoul", cat:"Food", lat:37.5703, lng:127.0008 },

    // Day 13 — Fish Market & Sky Views
    { id: "ZzrLa--N6R", day:13, time:"Morning",   name:"Noryangjin Fish Market", desc:"Experience Seoul's legendary seafood market and early morning auctions.", url:"https://english.visitseoul.net/markets/Noryangjin-Fisheries-Wholesale-Market_/382", cat:"Food", lat:37.5128, lng:126.9408 },
    { id: "DAe2gLQC8u", day:13, time:"Morning",   name:"Tuna Auction", desc:"Watch the excitement of Korea's famous seafood auction culture.", url:"https://english.visitseoul.net/", cat:"Culture", lat:37.5128, lng:126.9408 },
    { id: "A-36Z5k15a", day:13, time:"Afternoon", name:"Dongdaemun Design Plaza", desc:"Explore Seoul's futuristic architectural landmark and design center.", url:"https://www.ddp.or.kr/?menuno=240", cat:"Sightseeing", lat:37.5665, lng:127.0093 },
    { id: "p91rpKI_UF", day:13, time:"Afternoon", name:"COEX Mall", desc:"Wander one of Asia's largest underground malls.", url:"https://www.coex.co.kr/blog/venue/coex-mall/", cat:"Shopping", lat:37.5118, lng:127.0593 },
    { id: "JoNKJtOYjq", day:13, time:"Afternoon", name:"Starfield Library", desc:"Located inside COEX Mall, Starfield Library is one of Seoul's most visually striking public spaces featuring enormous multi-story bookshelves rising dramatically toward the ceiling.", url:"https://www.starfield.co.kr/coexmall/main/main.do", cat:"Sightseeing", lat:37.5117, lng:127.0593 },
    { id: "J9nJjiE1N3", day:13, time:"Evening",   name:"Seoul Sky", desc:"Enjoy panoramic skyline views from one of the tallest buildings in Korea.", url:"https://seoulsky.lotteworld.com/en/main/index.do", cat:"Sightseeing", lat:37.5125, lng:127.1025 },
    { id: "MNOcr2Kjac", day:13, time:"Evening",   name:"Gangnam Dinner", desc:"Experience Seoul's modern upscale district made famous worldwide.", url:"https://english.visitseoul.net/gangnam", cat:"Food", lat:37.4979, lng:127.0276 },

    // Day 14 — Markets & Hongdae
    { id: "VqmSd89Prb", day:14, time:"Morning",   name:"Namdaemun Market", desc:"Explore Korea's oldest and largest traditional market.", url:"https://english.visitseoul.net/markets/Namdaemun-Market_/375", cat:"Shopping", lat:37.5588, lng:126.9777 },
    { id: "Ko78YXp5vQ", day:14, time:"Morning",   name:"Korean Street Food", desc:"Sample iconic Korean snacks and market foods.", url:"https://www.timeout.com/seoul/restaurants/best-street-food-in-seoul", cat:"Food", lat:37.5590, lng:126.9777 },
    { id: "ANeqdbRXJP", day:14, time:"Afternoon", name:"N Seoul Tower", desc:"Ride above Seoul for incredible city and mountain views.", url:"https://www.nseoultower.co.kr/eng/", cat:"Sightseeing", lat:37.5512, lng:126.9882 },
    { id: "LHg7btGl9t", day:14, time:"Afternoon", name:"Namsan Park", desc:"Wander scenic walking trails surrounding Seoul's iconic tower.", url:"https://english.visitseoul.net/parks/Namsan-Park_/364", cat:"Nature", lat:37.5497, lng:126.9876 },
    { id: "aI5jA3xL3S", day:14, time:"Evening",   name:"Hongdae Exploration", desc:"Experience Seoul's youthful nightlife district filled with live music, cafés, shopping, and performers.", url:"https://english.visitseoul.net/hongdae", cat:"Sightseeing", lat:37.5563, lng:126.9237 },
    { id: "k_O1ElbDg0", day:14, time:"Evening",   name:"Live Music & Nightlife", desc:"Enjoy Hongdae's famous creative energy and nightlife atmosphere.", url:"https://www.timeout.com/seoul/music/best-live-music-venues-in-seoul", cat:"Entertainment", lat:37.5560, lng:126.9240 },
    { id: "f2L0TniNQ8", day:14, time:"Evening",   name:"Souvenir Shopping", desc:"Pick up final gifts, snacks, and souvenirs before returning home.", url:"", cat:"Shopping", lat:37.5563, lng:126.9237 },

    // Day 15 — Journey Home
    { id: "qLnartkx9p", day:15, time:"Morning",   name:"Hotel Checkout", desc:"Final departure preparations before heading to the airport.", url:"", cat:"Hotel", lat:37.5546, lng:126.9224 },
    { id: "DL7o8Yybnw", day:15, time:"Afternoon", name:"Incheon Airport Departure", desc:"Depart Korea for your return flight home.", url:"https://www.airport.kr/ap/en/index.do", cat:"Flight", lat:37.4602, lng:126.4407 },
    { id: "aoSVhVQBZo", day:15, time:"Evening",   name:"Return Flight to Seattle", desc:"Fly home after an unforgettable Japan and Korea adventure.", url:"https://www.alaskaair.com/", cat:"Flight", lat:37.4602, lng:126.4407 }
  ],

  // 29 to-dos from the To-do list table, grouped by priority.
  todos: [
    // Critical (red)
    { id:"R7G7LTEut-", priority:"Critical", item:"teamLab Planets TOKYO",                    type:"Tickets",        day:"July 24",     whenToBook:"NOW",                     link:"https://www.teamlab.art/e/planets/",       why:"Summer slots sell out quickly",                                       rec:"Book ASAP" },
    { id:"F6Jtonjv7E", priority:"Critical", item:"Shibuya Sky",                              type:"Tickets",        day:"July 24",     whenToBook:"NOW",                     link:"https://www.shibuya-scramble-square.com/sky/", why:"Sunset/night slots are hardest to get",                            rec:"Prioritize this reservation" },
    { id:"V522RR3Cen", priority:"Critical", item:"Sumo Stable Practice",                     type:"Tour",           day:"July 28",     whenToBook:"NOW",                     link:"https://www.getyourguide.com/",            why:"Hardest experience to secure",                                          rec:"Book immediately" },
    { id:"V7LcbkANHf", priority:"Critical", item:"DMZ / JSA Tour",                           type:"Tour",           day:"Aug 1",       whenToBook:"NOW",                     link:"https://www.getyourguide.com/",            why:"Access changes often",                                                  rec:"Book highly rated operator" },
    { id:"xRmg-qixSD", priority:"Critical", item:"Shinjuku night food tour",                 type:"Tour",           day:"July 26",     whenToBook:"Next few weeks",          link:"https://www.getyourguide.com/",            why:"Great recovery-day guided experience",                                  rec:"Probably your best 'insider Tokyo' night" },
    { id:"IbEydHNeUF", priority:"Critical", item:"Asakusa guided food/culture tour",         type:"Tour",           day:"July 27",     whenToBook:"Next few weeks",          link:"https://www.getyourguide.com/",            why:"Adds huge value to traditional Tokyo",                                  rec:"Small-group local guide recommended" },
    { id:"dLTH6crVhh", priority:"Critical", item:"Sumida River Fireworks viewing strategy",  type:"Event Planning", day:"July 25",     whenToBook:"NOW",                     link:"https://www.getyourguide.com/",            why:"Crowds and heat are intense",                                           rec:"Consider reserved seating/rooftop" },
    { id:"9QxksNLX_z", priority:"Critical", item:"Romancecar / Hakone train seats",          type:"Transit",        day:"July 29",     whenToBook:"2–4 weeks before",        link:"https://www.odakyu.jp/english/romancecar/",  why:"Summer seats fill",                                                   rec:"Reserve family seats together" },
    { id:"OwODpLyzhJ", priority:"Critical", item:"Changdeokgung Secret Garden",              type:"Tickets",        day:"Aug 2",       whenToBook:"NOW",                     link:"https://eng.cdg.go.kr/",                   why:"Limited daily entry slots — fills up fast in summer",                   rec:"Book immediately" },
    { id:"cQT8XGUQN3", priority:"Critical", item:"Hakone Ten-yu kaiseki dinner",             type:"Restaurant",     day:"July 29",     whenToBook:"At time of hotel booking",link:"https://www.ten-yu.com/en/",               why:"Typically pre-arranged with your stay package — confirm at booking",    rec:"Confirm dinner is included" },
    { id:"k2u_F6LU9-", priority:"Critical", item:"Register for visitjapan.com",              type:"Travel setup",   day:"Before departure", whenToBook:"Before departure",   link:"https://www.vjw.digital.go.jp/main/#/vjwplo001_01action",  why:"Speeds airport immigration / customs",                            rec:"Complete a week before" },
    { id:"1FlwtfNSVI", priority:"Critical", item:"Install TikTok on phones",                 type:"Travel setup",   day:"Before departure", whenToBook:"Before departure",   link:"https://www.tiktok.com/",                  why:"Best discovery channel for current Tokyo food & spots",                 rec:"Build a follow list before you leave" },

    // Important (amber)
    { id:"rhvQdn_7VG", priority:"Important", item:"Kura Sushi",                              type:"Restaurant",     day:"July 26",     whenToBook:"Morning of or day before", link:"https://www.kurasushi.co.jp/en/",          why:"Evening waits can get long",                                          rec:"Use app or online queue" },
    { id:"4NRnsh2daH", priority:"Important", item:"FLIPPER'S Shibuya",                       type:"Restaurant",     day:"July 24",     whenToBook:"1–2 weeks before",        link:"https://flipper-s.com/",                   why:"Morning lines can get long",                                            rec:"Reserve if possible" },
    { id:"83vb_oI2OP", priority:"Important", item:"Pepper PARLOR",                           type:"Restaurant",     day:"July 24",     whenToBook:"1–2 weeks before",        link:"https://www.pepperparlor.com/",            why:"Helps keep Shibuya day smooth",                                         rec:"Nice-to-have reservation" },
    { id:"vNFvdMIxMi", priority:"Important", item:"Hedgehog Café HARRY",                     type:"Activity",       day:"July 25",     whenToBook:"1–2 weeks before",        link:"https://www.harinezumi-cafe.com/english",  why:"Small capacity",                                                        rec:"Reserve if convenient" },
    { id:"tzUW1RKhDX", priority:"Important", item:"Airport limo/private transfer",           type:"Transit",        day:"July 23",     whenToBook:"1–2 weeks before",        link:"https://webservice.limousinebus.co.jp/web/en/", why:"Easier after long flight",                                         rec:"Optional comfort upgrade" },
    { id:"MZjRXTuRdb", priority:"Important", item:"RURU SHIBUYA",                            type:"Restaurant",     day:"July 24",     whenToBook:"Walk-in only",            link:"https://maps.app.goo.gl/TosocKzN5RqZwAiQ6",why:"Only ~15 seats, closes 8 PM. Queues form quickly on weekends",          rec:"Arrive near 11 AM right after teamLab" },
    { id:"IwAhfALqhZ", priority:"Important", item:"Onitsuka Tiger Shinjuku South",           type:"Shopping",       day:"July 26",     whenToBook:"Walk-in",                 link:"https://www.onitsukatiger.com/jp/ja-jp",   why:"Notably less crowded than Omotesando — weekday or early best",          rec:"Go early afternoon before evening food tour" },
    { id:"nwUmpjokEx", priority:"Important", item:"KUOE KYOTO Omotesando",                   type:"Shopping",       day:"July 25",     whenToBook:"Walk-in",                 link:"https://linktr.ee/kuoe_kyoto",             why:"Small boutique, closes 5:30 PM. Closed Tuesdays",                       rec:"Go before 5:30 PM during Omotesando wandering" },
    { id:"W_C8yst36C", priority:"Important", item:"Mt. Fuji 5th Station road fee",           type:"Logistics",      day:"July 31",     whenToBook:"Pay at the gate",         link:"https://www.fujisan-climb.jp/en/",         why:"Fuji Subaru Line charges a vehicle fee (~2,000 yen)",                   rec:"No advance booking — pay at the gate" },

    // Helpful (yellow)
    { id:"XddZPB8IzE", priority:"Helpful",   item:"eSIM / Pocket WiFi",                      type:"Travel setup",   day:"Entire trip", whenToBook:"Before departure",        link:"https://www.airalo.com/",                  why:"Essential for navigation/transit",                                      rec:"eSIM easiest for family" },
    { id:"NwiHq1cJ3v", priority:"Helpful",   item:"Suica / IC cards setup",                  type:"Transit",        day:"Entire trip", whenToBook:"Before departure",        link:"https://www.jreast.co.jp/multi/en/pass/suica.html", why:"Makes trains effortless",                                     rec:"Add to Apple Wallet" },
    { id:"bh_Yduvs5j", priority:"Helpful",   item:"Portable battery packs",                  type:"Packing",        day:"Entire trip", whenToBook:"Before departure",        link:"https://www.amazon.com/s?k=portable+battery+pack",                  why:"Phones drain fast in Tokyo heat",                                  rec:"Ideally one per person" },
    { id:"w6Evl9gxcP", priority:"Helpful",   item:"Cooling towels / neck fans",              type:"Packing",        day:"Entire trip", whenToBook:"Before departure",        link:"https://www.amazon.com/s?k=cooling+towel",                          why:"Huge comfort upgrade",                                             rec:"Especially for fireworks" },
    { id:"YiXVjH4XqX", priority:"Helpful",   item:"UV umbrella / parasol",                   type:"Packing",        day:"Entire trip", whenToBook:"Before departure or in Japan", link:"https://www.amazon.com/s?k=uv+umbrella",                       why:"Makes July heat much easier",                                      rec:"You'll see locals using them everywhere" },
    { id:"y3MqrmrDLY", priority:"Helpful",   item:"Coin lockers at Fuji 5th Station",        type:"Logistics",      day:"July 31",     whenToBook:"No advance booking",      link:"",                                          why:"Standard 40–50L backpacks should fit. Have 100-yen coins ready",       rec:"Use lockers so you can walk freely at the summit" },
    { id:"heGjfgzEjj", priority:"Helpful",   item:"Download Google Maps offline",            type:"Travel setup",   day:"Entire trip", whenToBook:"Before departure",        link:"https://maps.google.com/",                  why:"Lifesaver in transit tunnels and rural areas",                         rec:"Download Tokyo, Hakone, and Seoul before you leave" },
    { id:"asKBXXQhie", priority:"Helpful",   item:"Hyperdia / Maps for transit",             type:"Travel setup",   day:"Entire trip", whenToBook:"Before departure",        link:"https://www.hyperdia.com/en/",              why:"Essential for navigating JR and subway connections",                   rec:"Google Maps works well in Japan — make sure it's updated" }
  ]
};

// Convenience derived structures.
(function(){
  const D = window.DATA;
  D.byId = {}; D.activities.forEach(a => D.byId[a.id] = a);
  D.byDay = {}; D.days.forEach(d => D.byDay[d.n] = d);
  D.dayActivities = {}; D.activities.forEach(a => {
    (D.dayActivities[a.day] = D.dayActivities[a.day] || []).push(a);
  });
})();
