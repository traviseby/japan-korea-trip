/* Supertrip — companion app logic
 * Vanilla JS. Reads from window.DATA. Single source of truth: filterState.
 */
(function(){
  'use strict';
  // Make D a Proxy that always forwards to window.DATA (so it updates when we load new trip data)
  const D = new Proxy({}, {
    get(target, prop) {
      return window.DATA?.[prop];
    }
  });
  const APP_VERSION = '2.72';
  const UNSCHEDULED_DAY = 0;

  // ─── App Mode (Plan vs Travel) ────────────────────────────────────────────
  function getAppMode() {
    // Force travel mode - Plan mode hidden during development
    return 'travel';
    // return localStorage.getItem('jk26.appMode') || 'travel';
  }
  function setAppMode(mode) {
    localStorage.setItem('jk26.appMode', mode);
    updateTabBarForMode();
    
    // If switching to plan mode, show About tab
    if (mode === 'plan') {
      // Hide all travel tabs
      $$('.tab-pane:not(.plan-screen)').forEach(t => t.classList.remove('active'));
      // Show plan-about tab
      const aboutTab = $('#plan-about');
      if (aboutTab) {
        aboutTab.classList.add('active');
      }
      // Activate about button in plan tabbar
      $$('.plan-tabbar button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.planTab === 'about') {
          btn.classList.add('active');
        }
      });
      // Render About tab content
      if (window.PlanMode) {
        window.PlanMode.renderAboutTab();
      }
    } else {
      // Hide all plan screens
      $$('.plan-screen').forEach(s => s.classList.remove('active'));
      // Show default travel tab (today)
      switchTab('today');
    }
  }

  // ─── Date / day resolution ────────────────────────────────────────────────
  const TODAY = new Date(); // real device clock
  function currentDay() {
    if (!D.trip?.start || !D.days?.length) return 1;
    const start = new Date(D.trip.start + 'T00:00:00');
    const end   = new Date(D.trip.end   + 'T23:59:59');
    if (TODAY < start) return 1;
    if (TODAY > end)   return D.days.length;
    const day = Math.floor((TODAY - start) / (24*3600*1000)) + 1;
    return Math.max(1, Math.min(D.days.length, day));
  }

  // ─── State ────────────────────────────────────────────────────────────────
  const state = {
    tab: 'today',
    todayDay: 1,
    region: null,             // map city key for Map tab — set later
    sheet: null,              // current activity id shown in sheet
    hotelSheet: null,         // hotel object shown in sheet, or null
    flightSheet: null,        // flight object shown in sheet, or null
    eventSheet: null,         // booked event object shown in sheet, or null
    carRentalSheet: null,   // car rental object shown in sheet, or null
    fullscreenMap: null,      // day number, or null
    location: null,           // {lat,lng} from geolocation, or null
    searching: false,         // filter-bar search mode on Map + Activities
    searchingBookings: false, // filter-bar search mode on Bookings
    filterTray: null,          // 'day' | 'time' | 'type' | null
    pickTray: null             // single-select picker open from edit form
  };

  // Shared filter state — single source of truth for Map + Activities
  const filterState = {
    day: [],
    timeOfDay: [],
    category: [],
    search: ''
  };
  window.filterState = filterState;

  const bookingsFilterState = {
    type: [],
    day: [],
    search: ''
  };
  window.bookingsFilterState = bookingsFilterState;

  // ─── Persistence (per device, localStorage) ───────────────────────────────
  const STORAGE = {
    activityChecks:  'jk26.activityChecks.v1',
    todoChecks:      'jk26.todoChecks.v1'
  };
  function loadSet(key){
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
  }
  function saveSet(key, set){
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
  }
  const checkedActs  = loadSet(STORAGE.activityChecks);
  const checkedTodos = loadSet(STORAGE.todoChecks);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function el(tag, attrs, ...children){
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs){
      const v = attrs[k];
      if (v == null || v === false) continue; // skip null/undefined/false attrs
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const sk in v){
          if (sk.startsWith('--')) e.style.setProperty(sk, v[sk]);
          else e.style[sk] = v[sk];
        }
      }
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    }
    for (const c of children.flat()){
      if (c == null || c === false) continue;
      e.appendChild(c.nodeType ? c : document.createTextNode(c));
    }
    return e;
  }
  function fmtDate(iso){
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function shortDate(iso){
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function catEmoji(catName){ return (D.categories[catName] || {}).emoji || '📍'; }
  function todEmoji(tod){
    const t = D.timesOfDay.find(t => t.id === tod);
    return t ? t.emoji : '•';
  }
  function iconChipParts(icon, text) {
    if (!icon) return [text];
    return [
      el('span', { class: 'chip-ico', 'aria-hidden': 'true' }, icon),
      text
    ];
  }
  function iconBadge(className, icon, text, attrs = {}) {
    return el('span', { class: className, ...attrs }, ...iconChipParts(icon, text));
  }
  function timeOrder(t){
    return { 'Morning': 0, 'Afternoon': 1, 'Evening': 2, 'Late Night': 3 }[t] ?? 9;
  }
  function isUnscheduledDay(dayNum){ return dayNum === UNSCHEDULED_DAY; }
  function hasUnscheduledActivities(){
    return (D.activities || []).some(a => isUnscheduledDay(a.day));
  }
  function sortActivityDays(days){
    return [...days].sort((a, b) => {
      if (isUnscheduledDay(a)) return -1;
      if (isUnscheduledDay(b)) return 1;
      return a - b;
    });
  }
  function sortActivities(a, b){
    if (isUnscheduledDay(a.day) && !isUnscheduledDay(b.day)) return -1;
    if (!isUnscheduledDay(a.day) && isUnscheduledDay(b.day)) return 1;
    return a.day - b.day || timeOrder(a.time) - timeOrder(b.time);
  }
  function dayFilterLabel(dayNum){
    if (isUnscheduledDay(dayNum)) return 'Unscheduled';
    const d = D.byDay[dayNum];
    return d ? `Day ${dayNum} \u00b7 ${shortDate(d.date)}` : `Day ${dayNum}`;
  }
  function dayAccent(dayNum){
    if (isUnscheduledDay(dayNum)) return '#666666';
    return D.byDay[dayNum]?.color || '#666666';
  }
  function haversine(a, b){
    const R = 6371; // km
    const toRad = x => x * Math.PI/180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function activityCenter(day){
    const acts = (D.dayActivities[day] || []).filter(a => a.lat && a.lng);
    if (!acts.length) {
      // Fallback to day coordinates if available
      const dayData = D.byDay[day];
      if (dayData && dayData.lat != null && dayData.lng != null) {
        return { lat: dayData.lat, lng: dayData.lng };
      }
      return null; // No valid coordinates available
    }
    const sum = acts.reduce((s,a) => ({lat: s.lat + a.lat, lng: s.lng + a.lng}), {lat:0,lng:0});
    return { lat: sum.lat / acts.length, lng: sum.lng / acts.length };
  }

  // ─── Filtered dataset (for Map + Activities) ──────────────────────────────
  function filteredActivities(options = {}){
    const forMap = options.forMap === true;
    const q = filterState.search.trim().toLowerCase();
    const allTimes = !filterState.timeOfDay.length;
    return D.activities.filter(a => {
      const unscheduled = isUnscheduledDay(a.day);

      if (filterState.day.length && !filterState.day.includes(a.day)) {
        // Unscheduled ideas aren't tied to an itinerary day — still show them
        // on the map whenever the time filter is "All Times".
        if (!(forMap && unscheduled && allTimes)) return false;
      }

      if (filterState.timeOfDay.length) {
        if (unscheduled) return false;
        if (!filterState.timeOfDay.includes(a.time)) return false;
      }

      if (filterState.category.length && !filterState.category.includes(a.cat)) return false;
      if (q && !((a.name + ' ' + (a.desc||'')).toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function anyFilterActive(){
    return filterState.day.length || filterState.timeOfDay.length || filterState.category.length || filterState.search;
  }

  // ─── Pin icon factory (Leaflet) ───────────────────────────────────────────
  function pinIcon(category, color){
    // Emoji is rendered as an SVG <text> element so it lives in the same
    // coordinate space as the balloon — no risk of stacking-context issues.
    const html = `
      <svg class="pin" viewBox="0 0 32 40" width="38" height="48" aria-hidden="true">
        <path d="M16 2 C8 2 2 8 2 15 C2 22 8 26 16 38 C24 26 30 22 30 15 C30 8 24 2 16 2 Z"
              fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="16" cy="15" r="10" fill="#ffffff"/>
        <text x="16" y="15" text-anchor="middle" dominant-baseline="central" font-size="13">${catEmoji(category)}</text>
      </svg>`;
    return L.divIcon({ className: 'pin-wrap', html, iconSize: [38, 48], iconAnchor: [19, 46], popupAnchor: [0, -46] });
  }
  function locationIcon(){
    return L.divIcon({ className: 'loc-wrap', html: '<div class="location-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
  }

  // ─── Weather (Open-Meteo) ─────────────────────────────────────────────────
  const weatherCache = {};
  function weatherCoords(day){
    if (day.lat != null && day.lng != null && !isNaN(day.lat) && !isNaN(day.lng)) {
      return { lat: day.lat, lng: day.lng };
    }
    return activityCenter(day.n);
  }
  async function fetchWeather(day){
    if (weatherCache[day.n] !== undefined) return weatherCache[day.n];

    const coords = weatherCoords(day);
    if (!coords) {
      weatherCache[day.n] = null;
      return null;
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current_weather=true&temperature_unit=fahrenheit`;
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw 0;
      const j = await res.json();
      const cw = j.current_weather;
      weatherCache[day.n] = { temp: Math.round(cw.temperature), code: cw.weathercode };
      return weatherCache[day.n];
    } catch {
      weatherCache[day.n] = null;
      return null;
    }
  }
  function weatherIcon(code){
    // WMO codes — simplified
    if (code === 0) return '☀️';
    if ([1,2,3].includes(code)) return '⛅';
    if ([45,48].includes(code)) return '🌫️';
    if ([51,53,55,61,63,65,80,81,82].includes(code)) return '🌧️';
    if ([71,73,75,85,86].includes(code)) return '❄️';
    if ([95,96,99].includes(code)) return '⛈️';
    return '☁️';
  }

  // ─── Render: TODAY tab ────────────────────────────────────────────────────
  let leafletMini = null, leafletFull = null, leafletSheet = null, leafletFullscreen = null;

  function syncHeroTitleLayout(hero){
    if (!hero) return;
    const nameEl = hero.querySelector('.day-num .name');
    if (!nameEl) return;
    hero.classList.remove('hero--long-title');
    const lineHeight = parseFloat(getComputedStyle(nameEl).lineHeight);
    if (!lineHeight) return;
    const lines = Math.round(nameEl.scrollHeight / lineHeight);
    if (lines >= 3) hero.classList.add('hero--long-title');
  }

  function renderToday(){
    const day = D.byDay?.[state.todayDay] || D.days?.[0];
    if (!day) return;
    const root = $('#tab-today .scroll');
    root.style.transition = '';
    root.style.transform = '';
    root.style.opacity = '';
    root.innerHTML = '';
    root.style.setProperty('--day-accent', day.color);

    // Pinned Itinerary header: title + day-pill row (sits above the scroll)
    const bar = $('#itinerary-bar');
    const prevPillScroll = bar.querySelector('.chips')?.scrollLeft ?? null;
    bar.innerHTML = '';
    bar.style.setProperty('--day-accent', day.color);
    bar.appendChild(buildLargeTitle('Itinerary',
      el('div', { class: 'iti-chevrons' },
        el('button', { class: 'iti-chev toolbar-btn', disabled: day.n === 1 ? '' : null, 'aria-label': 'Previous day', onclick: () => navTo(day.n - 1) }, tabIcon('chev-left')),
        el('button', { class: 'iti-chev toolbar-btn', disabled: day.n === D.days.length ? '' : null, 'aria-label': 'Next day', onclick: () => navTo(day.n + 1) }, tabIcon('chev-right'))
      )
    ));
    bar.appendChild(buildItineraryPills(day, prevPillScroll));

    // Hero
    const hero = el('div', { class: 'hero', style: { '--day-accent': day.color } },
     el('div', { class: 'img', style: { backgroundImage: `url('${day.hero}')` } }),
      el('div', { class: 'scrim' }),
      el('div', { class: 'day-color-bar', style: { background: day.color } }),
      el('div', { class: 'top' },
        el('div', { class: 'flag' }, day.flag),
        el('div', { class: 'weather', id: 'weather-' + day.n })
      ),
      el('div', { class: 'label-block' },
        el('div', { class: 'meta' }, fmtDate(day.date) + ' · ' + day.loc),
        el('div', { class: 'day-num' },
          el('div', { class: 'num' }, String(day.n).padStart(2, '0')),
          el('div', { class: 'name' }, day.title)
        )
      )
    );
    root.appendChild(hero);
    requestAnimationFrame(() => syncHeroTitleLayout(hero));

    // Async weather
    fetchWeather(day).then(w => {
      const wEl = $('#weather-' + day.n);
      if (!wEl) return;
      if (!w) { wEl.style.display = 'none'; return; }
      wEl.innerHTML = `<span class="ico">${weatherIcon(w.code)}</span><span class="temp">${w.temp}°F</span>`;
      requestAnimationFrame(() => wEl.classList.add('weather--ready'));
    });

    // Description (expandable)
    if (day.desc && day.desc.trim()) {
      const descSection = el('div', { class: 'section tight' },
        el('div', { class: 'section-head' },
          el('h3', null, 'Description')
        )
      );
      root.appendChild(descSection);
      const descCard = buildDayDescription(day);
      if (descCard) root.appendChild(descCard);
    }

    // Flight card if travel day
    const flight = (D.flights || []).find(f => f.day === day.n || f.date === day.date);
    if (flight){
      const section = el('div', { class: 'section tight' },
        el('div', { class: 'section-head' },
          el('h3', null, 'Today\u2019s Flight')
        )
      );
      root.appendChild(section);
      root.appendChild(buildFlightCard(flight, day));
    }

    // Hotel cards if check-in day
    const checkInHotels = (D.hotels || []).filter(h => h.startDate === day.date);
    if (checkInHotels.length){
      const section = el('div', { class: 'section tight' },
        el('div', { class: 'section-head' },
          el('h3', null, checkInHotels.length === 1 ? 'Check-in Today' : 'Check-ins Today')
        )
      );
      root.appendChild(section);
      checkInHotels.forEach(h => root.appendChild(buildHotelCard(h, day)));
    }

    // Booked events on this calendar date
    const dayEvents = eventsForDay(day);
    if (dayEvents.length){
      const section = el('div', { class: 'section tight' },
        el('div', { class: 'section-head' },
          el('h3', null, dayEvents.length === 1 ? 'Today\u2019s Ticket' : 'Today\u2019s Tickets')
        )
      );
      root.appendChild(section);
      dayEvents.forEach(ev => root.appendChild(buildEventCard(ev, day)));
    }

    // Car rentals on pick-up day
    const dayCarRentals = carRentalsForDay(day);
    if (dayCarRentals.length){
      const section = el('div', { class: 'section tight' },
        el('div', { class: 'section-head' },
          el('h3', null, dayCarRentals.length === 1 ? 'Car Rental Today' : 'Car Rentals Today')
        )
      );
      root.appendChild(section);
      dayCarRentals.forEach(cr => root.appendChild(buildCarRentalCard(cr, day)));
    }

    // Mini map
    const acts = (D.dayActivities[day.n] || []).filter(a => a.lat && a.lng);
    const mapSection = el('div', { class: 'section tight' },
      el('div', { class: 'section-head' },
        el('h3', null, 'Today\u2019s activities'),
        el('div', { class: 'right' }, acts.length + (acts.length === 1 ? ' stop' : ' stops'))
      )
    );
    root.appendChild(mapSection);
    const miniWrap = el('div', { class: 'mini-map', id: 'mini-map-wrap', onclick: () => {
      // Open the Map tab with this day's filter + region applied so it pans
      // to today's stops instead of dropping you on Tokyo.
      filterState.day = [day.n];
      filterState.timeOfDay = [];
      filterState.category = [];
      filterState.search = '';
      state.searching = false;
      state.region = mapCityForDay(day);
      switchTab('map');
    } });
    miniWrap.appendChild(el('div', { id: 'map-mini' }));
    root.appendChild(miniWrap);

    setTimeout(() => buildMiniMap(day, acts), 30);

    // Activity list grouped by time of day
    const groups = ['Morning','Afternoon','Evening','Late Night'];
    const grouped = {};
    (D.dayActivities[day.n] || [])
      .sort((a,b) => timeOrder(a.time) - timeOrder(b.time))
      .forEach(a => (grouped[a.time] = grouped[a.time] || []).push(a));

    groups.forEach(g => {
      if (!grouped[g] || grouped[g].length === 0) return;
      root.appendChild(el('div', { class: 'tod-head' },
        el('span', null, g),
        el('span', { class: 'line' })
      ));
      grouped[g].forEach(a => {
        root.appendChild(buildActivityRow(a, day));
      });
    });

    // Notes card
    if (day.notes){
      const notes = el('div', { class: 'notes' },
        el('div', { class: 'notes-head' }, 'Notes'),
        el('div', { class: 'body' }, day.notes)
      );
      root.appendChild(el('div', { class: 'section tight' }));
      root.appendChild(notes);
    }

    // Day navigation is in the sticky Itinerary bar at top — no buildDayNav here.

    root.appendChild(el('div', { class: 'bottom-pad' }));
  }

  function buildOfflineCard(){
    const regions = getOfflineRegions();
    const estimate = regions.length ? generateTileURLs(regions).length : 0;
    const estMB = Math.round(estimate * 25 / 1024); // ~25KB per tile (PNG, mid-detail)
    const areaLabel = offlineRegionsLabel(regions);
    const desc = regions.length
      ? `Cache map tiles for ${areaLabel} so maps work in airplane mode. About ${estimate.toLocaleString()} tiles, roughly ${estMB} MB.`
      : 'Add activities with map coordinates to this trip before downloading tiles for offline use.';
    const card = el('div', { class: 'offline-card', id: 'offline-card' },
      el('div', { class: 'oc-head' },
        el('div', { class: 'oc-headline' }, 'Offline maps'),
        el('span', { class: 'oc-status', id: 'dl-status' }, '\u2014')
      ),
      el('div', { class: 'oc-desc' }, desc),
      el('div', { class: 'oc-progress' },
        el('div', { class: 'oc-progress-fill', id: 'dl-fill' })
      ),
      el('div', { class: 'oc-label', id: 'dl-label' }, regions.length ? 'Tap below when you\u2019re on wifi.' : 'No mappable locations in this trip yet.'),
      el('button', {
        class: 'oc-btn secondary',
        id: 'dl-btn',
        disabled: !regions.length,
        onclick: downloadOfflineMaps
      }, 'Download for offline')
    );
    setTimeout(refreshCacheStatus, 50);
    return card;
  }

  function buildResetCard(){
    const card = el('div', { class: 'offline-card reset-card' },
      el('div', { class: 'oc-head' },
        el('div', { class: 'oc-headline' }, 'Reset App'),
        el('span', { class: 'oc-status', id: 'reset-status' }, '')
      ),
      el('div', { class: 'oc-desc' }, 'Removes all trips, clears progress, and returns to the welcome screen. This cannot be undone.'),
      el('button', { class: 'oc-btn reset-btn', id: 'reset-btn', onclick: confirmReset }, 'Reset App')
    );
    return card;
  }

  const TRIP_DATA_CACHE_PREFIX = 'jk26.tripData.v2.';

  function getTrips(){
    const stored = localStorage.getItem('jk26.trips');
    if (stored) {
      try {
        const trips = JSON.parse(stored);
        // Ensure all trips have required fields (migration for existing trips)
        let needsSave = false;
        trips.forEach(trip => {
          // Fix icon if it's an object or missing
          if (!trip.icon || typeof trip.icon !== 'string') {
            trip.icon = '✈️';
            needsSave = true;
          }
          if (!trip.docName) {
            trip.docName = trip.name;
            needsSave = true;
          }
        });
        // Save if we made any fixes
        if (needsSave) {
          localStorage.setItem('jk26.trips', JSON.stringify(trips));
        }
        return trips;
      } catch (e) {
        return [];
      }
    }
    // Migrate old single doc URL to new trips array
    const oldUrl = localStorage.getItem('jk26.codaDocUrl');
    if (oldUrl) {
      const trips = [{ name: 'My Trip', url: oldUrl, icon: '✈️', docName: 'My Trip', active: true }];
      localStorage.setItem('jk26.trips', JSON.stringify(trips));
      localStorage.removeItem('jk26.codaDocUrl');
      return trips;
    }
    return [];
  }

  function saveTrips(trips){
    localStorage.setItem('jk26.trips', JSON.stringify(trips));
  }

  function getActiveTrip(){
    const trips = getTrips();
    return trips.find(t => t.active) || trips[0] || null;
  }

  function normalizeTripUrl(url){
    return url.split('#')[0].split('?')[0];
  }

  function isHttpUrl(str){
    if (!str || typeof str !== 'string') return false;
    const s = str.trim();
    if (!/^https?:\/\//i.test(s)) return false;
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function getTripDayCount(tripUrl){
    const normalized = normalizeTripUrl(tripUrl);
    const active = getActiveTrip();
    if (active && normalizeTripUrl(active.url) === normalized && window.DATA?.days?.length) {
      return window.DATA.days.length;
    }
    try {
      const cached = localStorage.getItem(`${TRIP_DATA_CACHE_PREFIX}${normalized}`);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.days?.length) return data.days.length;
      }
    } catch {}
    return null;
  }

  function tripDayCountLabel(tripUrl){
    const count = getTripDayCount(tripUrl);
    if (!count) return '';
    return `${count} day${count === 1 ? '' : 's'}`;
  }

  async function setActiveTrip(tripUrl){
    const trip = getTrips().find(t => t.url === tripUrl);
    if (!trip) return;
    
    const trips = getTrips();
    trips.forEach(t => t.active = (t.url === tripUrl));
    saveTrips(trips);
    
    // Set flag to force fresh fetch on next load
    localStorage.setItem('jk26.justSwitched', 'true');
    
    // Clear ALL cached trip data to force fresh fetch
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(key => {
      if (key.startsWith('jk26.tripData.')) {
        console.log('Clearing cache:', key);
        localStorage.removeItem(key);
      }
    });
    
    // Update URL with doc parameter before reload
    const docId = extractDocId(tripUrl);
    const docParam = docId || tripUrl;
    const newUrl = window.location.pathname + '?doc=' + encodeURIComponent(docParam);
    window.location.href = newUrl;
  }

  function rebuildActivityIndexes(){
    if (!window.DATA) return;
    window.DATA.byId = {};
    (window.DATA.activities || []).forEach(a => { window.DATA.byId[a.id] = a; });
    window.DATA.dayActivities = {};
    (window.DATA.activities || []).forEach(a => {
      (window.DATA.dayActivities[a.day] = window.DATA.dayActivities[a.day] || []).push(a);
    });
    rebuildMapCityIndex();
  }

  let mapCityIndex = null;

  const NON_CITY_LOCS = /^(travel|transit|en route|airport|flight|transfer|connection)$/i;

  function mapCityLabel(loc){
    const s = String(loc || '').replace(/\s+/g, ' ').trim();
    if (!s || NON_CITY_LOCS.test(s)) return null;
    return s;
  }

  function mapCityKey(label){
    return String(label || '').trim().toLowerCase();
  }

  function rebuildMapCityIndex(){
    if (!window.DATA?.days) {
      mapCityIndex = null;
      return;
    }

    const groups = new Map();
    [...(D.days || [])].sort((a, b) => a.n - b.n).forEach(day => {
      if (!isDestinationDay(day)) return;
      const label = mapCityLabel(day.loc);
      if (!label) return;
      const key = mapCityKey(label);
      if (!groups.has(key)) groups.set(key, { key, label, lats: [], lngs: [], order: day.n });
      const group = groups.get(key);
      activitiesForDay(day.n).forEach(a => {
        if (isFlightOrTransit(a)) return;
        const lat = normalizeCoord(a.lat);
        const lng = normalizeCoord(a.lng);
        if (lat == null || lng == null) return;
        group.lats.push(lat);
        group.lngs.push(lng);
      });
    });

    const cities = Array.from(groups.values())
      .filter(g => g.lats.length > 0)
      .map(g => ({
        key: g.key,
        label: g.label,
        lat: g.lats.reduce((sum, v) => sum + v, 0) / g.lats.length,
        lng: g.lngs.reduce((sum, v) => sum + v, 0) / g.lngs.length,
        order: g.order
      }))
      .sort((a, b) => a.order - b.order);

    mapCityIndex = {
      cities,
      byKey: Object.fromEntries(cities.map(c => [c.key, c]))
    };
  }

  function getDestinationCities(){
    return mapCityIndex?.cities || [];
  }

  function nearestMapCity(lat, lng, maxKm = 150){
    const cities = getDestinationCities();
    if (!cities.length || lat == null || lng == null) return null;
    let best = null;
    let bestDist = Infinity;
    cities.forEach(c => {
      const dist = haversine({ lat, lng }, { lat: c.lat, lng: c.lng });
      if (dist < bestDist) {
        bestDist = dist;
        best = c.key;
      }
    });
    return bestDist <= maxKm ? best : null;
  }

  function activityCityKey(a){
    if (!a) return null;
    const lat = normalizeCoord(a.lat);
    const lng = normalizeCoord(a.lng);
    if (lat == null || lng == null) return null;

    if (!isUnscheduledDay(a.day)) {
      const day = D.byDay[a.day];
      const label = mapCityLabel(day?.loc);
      if (label) return mapCityKey(label);
    }

    return nearestMapCity(lat, lng, 250);
  }

  function mapCityForDay(day){
    if (!day) return null;
    const label = mapCityLabel(day.loc);
    if (label) return mapCityKey(label);

    const acts = activitiesForDay(day.n).filter(a => hasMapCoordinates(a) && !isFlightOrTransit(a));
    if (!acts.length) return null;
    const lat = acts.reduce((sum, a) => sum + normalizeCoord(a.lat), 0) / acts.length;
    const lng = acts.reduce((sum, a) => sum + normalizeCoord(a.lng), 0) / acts.length;
    return nearestMapCity(lat, lng, 250);
  }

  function nearestMapCityToUser(maxKm = 150){
    if (!state.location) return null;
    return nearestMapCity(state.location.lat, state.location.lng, maxKm);
  }

  function normalizeCoord(val){
    if (val == null || val === '') return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  }

  // Major airport coordinates for flight route maps
  const AIRPORT_COORDS = {
    // US West Coast (Alaska Airlines major hubs)
    'SEA': [47.4502, -122.3088],   // Seattle-Tacoma (Alaska hub)
    'PAE': [47.9063, -122.2816],   // Paine Field (Everett, WA)
    'PDX': [45.5887, -122.5975],   // Portland (Alaska hub)
    'SFO': [37.6213, -122.3790],   // San Francisco
    'SJC': [37.3639, -121.9289],   // San Jose
    'OAK': [37.7214, -122.2208],   // Oakland
    'LAX': [33.9416, -118.4085],   // Los Angeles (Alaska hub)
    'BUR': [34.2007, -118.3587],   // Burbank
    'ONT': [34.0560, -117.6012],   // Ontario CA
    'SNA': [33.6757, -117.8681],   // Orange County
    'SAN': [32.7338, -117.1933],   // San Diego (Alaska hub)
    'SMF': [38.6954, -121.5908],   // Sacramento
    'FAT': [36.7762, -119.7181],   // Fresno
    'SBA': [34.4262, -119.8403],   // Santa Barbara
    'PSP': [33.8297, -116.5067],   // Palm Springs
    'RNO': [39.4991, -119.7681],   // Reno
    'BOI': [43.5644, -116.2228],   // Boise
    'GEG': [47.6199, -117.5339],   // Spokane
    'MSO': [46.9163, -114.0906],   // Missoula
    'BZN': [45.7769, -111.1530],   // Bozeman
    'BIL': [45.8077, -108.5430],   // Billings
    'EUG': [44.1246, -123.2119],   // Eugene
    'MFR': [42.3742, -122.8735],   // Medford
    'RDM': [44.2541, -121.1497],   // Redmond/Bend
    'PSC': [46.2647, -119.1191],   // Pasco/Tri-Cities
    'LAS': [36.0840, -115.1537],   // Las Vegas
    'PHX': [33.4342, -112.0080],   // Phoenix
    'TUS': [32.1161, -110.9410],   // Tucson
    'ABQ': [35.0402, -106.6092],   // Albuquerque
    
    // Alaska
    'ANC': [61.1743, -149.9962],   // Anchorage (Alaska hub)
    'FAI': [64.8151, -147.8563],   // Fairbanks
    'JNU': [58.3550, -134.5764],   // Juneau
    'KTN': [55.3556, -131.7139],   // Ketchikan
    'SIT': [57.0471, -135.3616],   // Sitka
    'CDV': [60.4918, -145.4776],   // Cordova
    'BET': [60.7798, -161.8381],   // Bethel
    'ADK': [51.8779, -176.6460],   // Adak Island
    'DUT': [53.9005, -166.5439],   // Dutch Harbor
    'OME': [64.5122, -165.4453],   // Nome
    'OTZ': [66.8847, -162.5985],   // Kotzebue
    'PSG': [56.8017, -132.9451],   // Petersburg
    'WRG': [56.4843, -132.3698],   // Wrangell
    'YAK': [59.5033, -139.6604],   // Yakutat
    
    // Hawaii (Alaska Airlines destinations)
    'HNL': [21.3187, -157.9225],   // Honolulu
    'OGG': [20.8986, -156.4306],   // Maui (Kahului)
    'KOA': [19.7388, -156.0456],   // Kona
    'LIH': [21.9760, -159.3389],   // Kauai (Lihue)
    'ITO': [19.7214, -155.0481],   // Hilo
    
    // US East Coast (Alaska Airlines destinations)
    'BOS': [42.3656, -71.0096],    // Boston
    'JFK': [40.6413, -73.7781],    // New York JFK
    'LGA': [40.7769, -73.8740],    // New York LaGuardia
    'EWR': [40.6895, -74.1745],    // Newark
    'PHL': [39.8729, -75.2437],    // Philadelphia
    'DCA': [38.8521, -77.0377],    // Washington Reagan
    'IAD': [38.9531, -77.4565],    // Washington Dulles
    'BWI': [39.1774, -76.6684],    // Baltimore
    'ATL': [33.6407, -84.4277],    // Atlanta
    'MCO': [28.4312, -81.3081],    // Orlando
    'TPA': [27.9755, -82.5332],    // Tampa
    'MIA': [25.7959, -80.2870],    // Miami
    'FLL': [26.0742, -80.1506],    // Fort Lauderdale
    'PBI': [26.6832, -80.0956],    // West Palm Beach
    'RDU': [35.8776, -78.7875],    // Raleigh-Durham
    'CLT': [35.2140, -80.9431],    // Charlotte
    'BNA': [36.1245, -86.6782],    // Nashville
    'MSY': [29.9934, -90.2580],    // New Orleans
    
    // US Central (Alaska Airlines destinations)
    'ORD': [41.9742, -87.9073],    // Chicago O'Hare
    'MDW': [41.7868, -87.7522],    // Chicago Midway
    'DEN': [39.8561, -104.6737],   // Denver
    'DFW': [32.8998, -97.0403],    // Dallas/Fort Worth
    'AUS': [30.1975, -97.6664],    // Austin
    'IAH': [29.9902, -95.3368],    // Houston
    'MSP': [44.8848, -93.2223],    // Minneapolis
    'DTW': [42.2162, -83.3554],    // Detroit
    'STL': [38.7487, -90.3700],    // St. Louis
    'MCI': [39.2976, -94.7139],    // Kansas City
    'SLC': [40.7899, -111.9791],   // Salt Lake City
    
    // Mexico (Alaska Airlines destinations)
    'PVR': [20.6801, -105.2544],   // Puerto Vallarta
    'CZM': [20.5224, -86.9256],    // Cozumel
    'CUN': [21.0365, -86.8771],    // Cancun
    'SJD': [23.1518, -109.7211],   // Los Cabos
    'ZIH': [17.6016, -101.4608],   // Ixtapa/Zihuatanejo
    'ZLO': [19.1448, -104.5589],   // Manzanillo
    'GDL': [20.5218, -103.3116],   // Guadalajara
    'MEX': [19.4363, -99.0721],    // Mexico City
    'MZT': [23.1614, -106.2658],   // Mazatlan
    
    // Central America & Caribbean (Alaska Airlines)
    'BZE': [17.5392, -88.3082],    // Belize City
    'LIR': [10.5933, -85.5444],    // Liberia, Costa Rica
    'SJO': [9.9939, -84.2088],     // San Jose, Costa Rica
    
    // Canada (Alaska Airlines destinations)
    'YVR': [49.1967, -123.1815],   // Vancouver
    'YYZ': [43.6777, -79.6248],    // Toronto
    'YUL': [45.4657, -73.7455],    // Montreal
    'YYC': [51.1225, -114.0133],   // Calgary
    'YEG': [53.3097, -113.5800],   // Edmonton
    'YLW': [49.9561, -119.3778],   // Kelowna
    'YYJ': [48.6469, -123.4258],   // Victoria
    
    // Asia - Japan
    'NRT': [35.7648, 139.7966],    // Tokyo Narita
    'HND': [35.5494, 139.7798],    // Tokyo Haneda
    'KIX': [34.4273, 135.2440],    // Osaka Kansai
    'ITM': [34.7855, 135.4381],    // Osaka Itami
    'NGO': [34.8584, 136.8049],    // Nagoya
    'FUK': [33.5859, 130.4511],    // Fukuoka
    'CTS': [42.7752, 141.6920],    // Sapporo
    
    // Asia - Korea
    'ICN': [37.4602, 126.4407],    // Seoul Incheon
    'GMP': [37.5583, 126.7906],    // Seoul Gimpo
    'PUS': [35.1795, 128.9382],    // Busan
    
    // Asia - China
    'PVG': [31.1443, 121.8083],    // Shanghai Pudong
    'PEK': [40.0801, 116.5846],    // Beijing Capital
    'HKG': [22.3080, 113.9185],    // Hong Kong
    'CAN': [23.3924, 113.2988],    // Guangzhou
    
    // Asia - Southeast Asia
    'SIN': [1.3644, 103.9915],     // Singapore
    'BKK': [13.6900, 100.7501],    // Bangkok
    'MNL': [14.5086, 121.0198],    // Manila
    'SGN': [10.8188, 106.6519],    // Ho Chi Minh City
    'HAN': [21.2212, 105.8072],    // Hanoi
    
    // Asia - Other
    'TPE': [25.0797, 121.2342],    // Taipei
    'DEL': [28.5562, 77.1000],     // Delhi
    'BOM': [19.0896, 72.8656],     // Mumbai
    
    // Europe
    'LHR': [51.4700, -0.4543],     // London Heathrow
    'LGW': [51.1537, -0.1821],     // London Gatwick
    'CDG': [49.0097, 2.5479],      // Paris Charles de Gaulle
    'FRA': [50.0379, 8.5622],      // Frankfurt
    'AMS': [52.3105, 4.7683],      // Amsterdam
    'MAD': [40.4983, -3.5676],     // Madrid
    'BCN': [41.2974, 2.0833],      // Barcelona
    'FCO': [41.8003, 12.2389],     // Rome
    'MUC': [48.3538, 11.7861],     // Munich
    'ZRH': [47.4647, 8.5492],      // Zurich
    
    // Oceania
    'SYD': [-33.9461, 151.1772],   // Sydney
    'MEL': [-37.6690, 144.8410],   // Melbourne
    'AKL': [-37.0082, 174.7850],   // Auckland
  };

  function getAirportCoords(code){
    if (!code) return null;
    const c = String(code).trim().toUpperCase();
    return AIRPORT_COORDS[c] || null;
  }

  async function fetchFlightStatus(flight) {
    if (!flight.flightNum && !flight.number) return null;

    try {
      const params = new URLSearchParams();

      // Use flightNum which contains the full IATA code (e.g., "OZ1035", "AA300")
      if (flight.flightNum) {
        params.append('flightIata', flight.flightNum);
      } else if (flight.number) {
        // Fallback: try to extract IATA code from number field
        // number field is formatted like "Asiana OZ1035"
        const match = flight.number.match(/([A-Z]{2}\d+)/);
        if (match) {
          params.append('flightIata', match[1]);
        } else {
          params.append('flightNumber', flight.number);
        }
      }

      if (flight.from) params.append('depIata', flight.from);
      if (flight.to) params.append('arrIata', flight.to);

      const url = `/api/flight-data?${params.toString()}`;
      console.log('Fetching flight status:', {
        flightNum: flight.flightNum,
        number: flight.number,
        from: flight.from,
        to: flight.to,
        url: url,
        params: Object.fromEntries(params)
      });

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Flight status API error:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText
        });
        return null;
      }

      const data = await response.json();
      console.log('Flight status data received:', data);
      return data;
    } catch (error) {
      console.error('Error fetching flight status:', error);
      return null;
    }
  }

  function buildFlightStatusBadge(status) {
    if (!status) return null;

    const statusMap = {
      'scheduled': { label: 'Scheduled', class: 'status-scheduled' },
      'active': { label: 'En Route', class: 'status-active' },
      'en-route': { label: 'En Route', class: 'status-active' },
      'landed': { label: 'Landed', class: 'status-landed' },
      'cancelled': { label: 'Cancelled', class: 'status-cancelled' },
      'incident': { label: 'Incident', class: 'status-incident' },
      'diverted': { label: 'Diverted', class: 'status-diverted' }
    };

    const statusInfo = statusMap[status.toLowerCase()] || { label: status, class: 'status-unknown' };

    return el('span', { class: `flight-status-badge ${statusInfo.class}` }, statusInfo.label);
  }

  function buildFlightLiveInfo(flightData) {
    if (!flightData) return null;

    const result = {
      statusRow: null,
      statusBadge: null,
      liveRow: null,
      delayInfo: null,
      gateInfo: null,
      liveMarkerData: null
    };

    // Status badge (for overlay) and row (for table fallback)
    if (flightData.status) {
      result.statusBadge = buildFlightStatusBadge(flightData.status);
      const statusCell = el('td');
      statusCell.appendChild(buildFlightStatusBadge(flightData.status));
      result.statusRow = el('tr', null, el('th', null, 'Status'), statusCell);
    }

    // Live position row for table (if in flight)
    const statusLower = (flightData.status || '').toLowerCase();
    if (flightData.live && (statusLower === 'active' || statusLower === 'en-route')) {
      const parts = [];

      if (flightData.live.altitude) {
        parts.push(`${(flightData.live.altitude / 1000).toFixed(1)}k ft`);
      }
      if (flightData.live.speed) {
        parts.push(`${flightData.live.speed} mph`);
      }

      if (parts.length) {
        result.liveRow = el('tr', null, el('th', null, 'Live Position'), el('td', null, parts.join(' · ')));
      }
      
      result.liveMarkerData = flightData.live;
    }

    // Delays (keep as meta line)
    const delays = [];
    if (flightData.departure?.delay && flightData.departure.delay > 0) {
      delays.push(`Dep: +${flightData.departure.delay} min`);
    }
    if (flightData.arrival?.delay && flightData.arrival.delay > 0) {
      delays.push(`Arr: +${flightData.arrival.delay} min`);
    }
    if (delays.length) {
      const delayClass = (flightData.departure?.delay > 15 || flightData.arrival?.delay > 15) ? 'status-delayed' : 'status-minor-delay';
      result.delayInfo = el('div', { class: `sheet-meta-line ${delayClass}` }, `⏱️ ${delays.join(' · ')}`);
    }
    
    // Gates and terminals (keep as meta line)
    const gateInfoParts = [];
    if (flightData.departure?.gate) {
      gateInfoParts.push(`Dep Gate: ${flightData.departure.gate}`);
    }
    if (flightData.departure?.terminal) {
      gateInfoParts.push(`Terminal: ${flightData.departure.terminal}`);
    }
    if (flightData.arrival?.gate) {
      gateInfoParts.push(`Arr Gate: ${flightData.arrival.gate}`);
    }
    if (flightData.arrival?.terminal && !flightData.departure?.terminal) {
      gateInfoParts.push(`Terminal: ${flightData.arrival.terminal}`);
    }
    if (gateInfoParts.length) {
      result.gateInfo = el('div', { class: 'flight-gates' }, gateInfoParts.join(' · '));
    }
    
    return result;
  }

  function hasMapCoordinates(a){
    return normalizeCoord(a.lat) != null && normalizeCoord(a.lng) != null;
  }

  function removeActivityFromLocalData(rowId){
    if (!window.DATA?.activities) return;
    window.DATA.activities = window.DATA.activities.filter(a => a.id !== rowId);
    rebuildActivityIndexes();
  }

  function currentTab(){
    const pane = document.querySelector('.tab-pane.active');
    if (pane?.id?.startsWith('tab-')) return pane.id.slice(4);
    return state.tab;
  }

  let activeTripLoadProgress = null;

  // Milestones align with supertrip-loader caption bands (weights sum to 1.0).
  const LOAD_PROGRESS = {
    INIT: 0.04,
    DOC_INFO_START: 0.08,
    DOC_CONNECTED: 0.16,
    TRIP_SAVED: 0.20,
    FETCH_START: 0.22,
    ITINERARY: 0.36,
    FLIGHTS: 0.58,
    HOTELS: 0.78,
    ACTIVITIES: 0.92,
    PREPARE_APP: 0.96,
    DONE: 1.0,
  };

  function createSupertripLoader({ id = 'loader' } = {}) {
    clearTripLoadOverlays();
    document.getElementById(id)?.remove();

    const loaderEl = document.createElement('supertrip-loader');
    loaderEl.id = id;
    document.body.appendChild(loaderEl);
    loaderEl.progress = LOAD_PROGRESS.INIT;

    let completeResolve;
    let onComplete;
    let stagedParseTimer = 0;
    const completePromise = new Promise(resolve => { completeResolve = resolve; });

    onComplete = () => {
      loaderEl.style.transition = 'opacity .6s';
      loaderEl.style.opacity = '0';
      setTimeout(() => {
        loaderEl.remove();
        if (activeTripLoadProgress === api) activeTripLoadProgress = null;
        completeResolve();
      }, 700);
    };
    loaderEl.addEventListener('complete', onComplete, { once: true });

    const api = {
      el: loaderEl,

      setProgress(value) {
        const p = value > 1 ? value / 100 : value;
        loaderEl.progress = Math.max(loaderEl.progress || 0, Math.min(1, p));
      },

      markTripDataParsed(tripData) {
        clearTimeout(stagedParseTimer);
        const steps = [
          [LOAD_PROGRESS.ITINERARY, Array.isArray(tripData?.days) && tripData.days.length > 0],
          [LOAD_PROGRESS.FLIGHTS, Array.isArray(tripData?.flights) && tripData.flights.length > 0],
          [LOAD_PROGRESS.HOTELS, Array.isArray(tripData?.hotels) && tripData.hotels.length > 0],
          [LOAD_PROGRESS.ACTIVITIES, Array.isArray(tripData?.activities) && tripData.activities.length > 0],
        ].filter(([, ok]) => ok);

        if (!steps.length) {
          api.setProgress(LOAD_PROGRESS.ITINERARY);
          return;
        }

        let i = 0;
        const tick = () => {
          api.setProgress(steps[i][0]);
          i += 1;
          if (i < steps.length) {
            stagedParseTimer = setTimeout(tick, 450);
          }
        };
        tick();
      },

      async complete() {
        api.setProgress(LOAD_PROGRESS.DONE);
        await completePromise;
      },

      remove() {
        clearTimeout(stagedParseTimer);
        loaderEl.removeEventListener('complete', onComplete);
        loaderEl.remove();
        if (activeTripLoadProgress === api) activeTripLoadProgress = null;
      },
    };

    activeTripLoadProgress = api;
    return api;
  }

  async function fetchTripDataWithProgress(body, { signal, onProgress } = {}) {
    const res = await fetch('/api/fetch-trip-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: true }),
      signal
    });

    if (res.status === 501) {
      return { localDev: true };
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('ndjson')) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Failed to fetch trip data');
      }
      const tripData = await res.json();
      onProgress?.(LOAD_PROGRESS.ACTIVITIES, 'complete');
      return tripData;
    }

    if (!res.ok) {
      let errMsg = `Failed to fetch trip data (${res.status})`;
      try {
        const reader = res.body?.getReader();
        if (reader) {
          const chunk = await reader.read();
          const text = new TextDecoder().decode(chunk.value || new Uint8Array());
          const line = text.split('\n').find(Boolean);
          if (line) errMsg = JSON.parse(line).error || errMsg;
        }
      } catch {}
      throw new Error(errMsg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let tripData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (msg.type === 'progress' && typeof msg.value === 'number') {
          onProgress?.(msg.value, msg.stage);
        } else if (msg.type === 'done') {
          tripData = msg.data;
        } else if (msg.type === 'error') {
          throw new Error(msg.error || 'Failed to fetch trip data');
        }
      }
    }

    if (!tripData) {
      throw new Error('Trip data stream ended before completion');
    }

    return tripData;
  }

  function createTripLoadProgress(opts = {}) {
    return createSupertripLoader(opts);
  }

  function getDemoTripData(){
    const source = window.DEMO_TRIP_DATA;
    if (!source) return null;
    return JSON.parse(JSON.stringify(source));
  }

  function applyDemoTripData(opts = {}){
    const demo = getDemoTripData();
    if (!demo) return false;
    applyTripData(demo, opts);
    return true;
  }

  function stripCodaFence(s) {
    if (s == null) return '';
    return String(s).replace(/```/g, '').trim();
  }

  function flightTripLabel(fromCity, toCity) {
    const from = String(fromCity || '').trim();
    const to = String(toCity || '').trim();
    if (from && to) return `${from} → ${to}`;
    return from || to || '';
  }

  function averageCoords(items){
    const valid = (items || []).filter(x =>
      x?.lat != null && x?.lng != null && !isNaN(x.lat) && !isNaN(x.lng)
    );
    if (!valid.length) return null;
    return {
      lat: valid.reduce((sum, x) => sum + x.lat, 0) / valid.length,
      lng: valid.reduce((sum, x) => sum + x.lng, 0) / valid.length
    };
  }

  function backfillDayCoords(data){
    (data.days || []).forEach(d => {
      if (d.lat != null && d.lng != null && !isNaN(d.lat) && !isNaN(d.lng)) return;
      const dayNum = d.n;
      const coords =
        averageCoords((data.activities || []).filter(a => a.day === dayNum)) ||
        averageCoords((data.hotels || []).filter(h => h.day === dayNum)) ||
        averageCoords((data.events || []).filter(e => e.day === dayNum)) ||
        averageCoords((data.carRentals || []).filter(cr => cr.day === dayNum));
      if (coords) {
        d.lat = coords.lat;
        d.lng = coords.lng;
      }
    });
  }

  function enrichTripData(data){
    if (!Array.isArray(data.events)) data.events = [];
    if (!Array.isArray(data.carRentals)) data.carRentals = [];
    (data.flights || []).forEach(f => {
      if (!f.day && f.date) {
        f.day = data.days?.find(d => d.date === f.date)?.n ?? null;
      }
      for (const key of ['airline', 'flightNum', 'from', 'to', 'fromCity', 'toCity', 'bookingCode']) {
        if (typeof f[key] === 'string') f[key] = stripCodaFence(f[key]);
      }
      if (f.airline || f.flightNum) {
        f.number = `${f.airline ? f.airline.split(' ')[0] : ''} ${f.flightNum || ''}`.trim();
      }
      f.trip = flightTripLabel(f.fromCity, f.toCity) || stripCodaFence(f.trip);
    });
    (data.carRentals || []).forEach(cr => {
      if (!cr.day && cr.pickupDate) {
        cr.day = data.days?.find(d => d.date === cr.pickupDate)?.n ?? null;
      }
    });
    backfillDayCoords(data);
  }

  function refreshVisibleTab() {
    const tab = state.tab;
    if (tab === 'today') renderToday();
    else if (tab === 'map') renderMapTab();
    else if (tab === 'activities') renderActivitiesTab();
    else if (tab === 'settings') renderSettingsTab();
  }

  function persistTripDataCache() {
    const activeTrip = getTrips().find(t => t.active);
    if (!activeTrip || !window.DATA) return;
    const normalizedUrl = activeTrip.url.split('#')[0].split('?')[0];
    try {
      localStorage.setItem(`${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`, JSON.stringify(window.DATA));
    } catch (e) {
      console.warn('Failed to persist trip cache:', e);
    }
  }

  function afterTripRecordPatch(collection, record) {
    if (collection === 'activities') rebuildActivityIndexes();
    if (collection === 'flights') {
      if (record.airline || record.flightNum) {
        record.number = `${record.airline ? record.airline.split(' ')[0] : ''} ${record.flightNum || ''}`.trim();
      }
      if (record.date) record.day = window.DATA.days?.find(d => d.date === record.date)?.n ?? null;
      record.trip = flightTripLabel(record.fromCity, record.toCity);
    }
    if (collection === 'events' && record.date) {
      record.day = window.DATA.days?.find(d => d.date === record.date)?.n ?? null;
    }
    if (collection === 'carRentals' && record.pickupDate) {
      record.day = window.DATA.days?.find(d => d.date === record.pickupDate)?.n ?? null;
    }
  }

  function getTripRecord(collection, rowId) {
    return (window.DATA?.[collection] || []).find(x => x.id === rowId) || null;
  }

  function patchTripRecord(collection, rowId, patch) {
    const list = window.DATA?.[collection];
    if (!Array.isArray(list)) return null;
    const idx = list.findIndex(x => x.id === rowId);
    if (idx < 0) return null;
    const snapshot = { ...list[idx] };
    Object.assign(list[idx], patch);
    afterTripRecordPatch(collection, list[idx]);
    return { collection, rowId, snapshot };
  }

  function insertTripRecord(collection, record) {
    if (!window.DATA[collection]) window.DATA[collection] = [];
    window.DATA[collection].push(record);
    afterTripRecordPatch(collection, record);
    return { collection, rowId: record.id, snapshot: null };
  }

  function restoreTripRecord({ collection, rowId, snapshot }) {
    const list = window.DATA?.[collection];
    if (!Array.isArray(list)) return;
    const idx = list.findIndex(x => x.id === rowId);
    if (snapshot == null) {
      if (idx >= 0) list.splice(idx, 1);
    } else if (idx >= 0) {
      list[idx] = { ...snapshot };
    } else {
      list.push({ ...snapshot });
    }
    const record = list.find(x => x.id === rowId);
    if (record) afterTripRecordPatch(collection, record);
    else if (collection === 'activities') rebuildActivityIndexes();
  }

  function dayForTripRecord(collection, record) {
    if (!record) return null;
    if (collection === 'events' || collection === 'flights') {
      return window.DATA.days?.find(d => d.date === record.date) || null;
    }
    if (collection === 'hotels') {
      return window.DATA.days?.find(d => d.date === record.startDate) || null;
    }
    if (collection === 'carRentals') {
      return window.DATA.days?.find(d => d.date === record.pickupDate) || null;
    }
    if (collection === 'activities') {
      return window.DATA.byDay?.[record.day] || null;
    }
    return null;
  }

  async function syncTripRecordEdit({
    applyLocal,
    apiCall,
    hideEditSheet,
    reopenDetail,
    savedDay,
    successToast,
    failToast,
    submitBtn,
    submitBtnLabel = 'Update'
  }) {
    let rollback = null;
    try {
      rollback = applyLocal();
      if (!rollback?.rowId) throw new Error('Record not found');
      persistTripDataCache();
      hideEditSheet();
      refreshVisibleTab();
      const updated = getTripRecord(rollback.collection, rollback.rowId);
      const day = savedDay || dayForTripRecord(rollback.collection, updated);
      if (updated && reopenDetail) reopenDetail(updated, day);

      await apiCall();
      persistTripDataCache();
      toast(successToast);
    } catch (err) {
      console.error(err);
      if (rollback) {
        restoreTripRecord(rollback);
        persistTripDataCache();
        refreshVisibleTab();
        const restored = getTripRecord(rollback.collection, rollback.rowId);
        if (restored && reopenDetail) reopenDetail(restored, savedDay);
      }
      toast(failToast);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtnLabel;
      }
    }
  }

  function applyTripData(tripData, opts = {}){
    window.DATA = tripData;
    enrichTripData(window.DATA);

    // Build lookup objects (same as data.js does)
    window.DATA.byId = {};
    (window.DATA.activities || []).forEach(a => { window.DATA.byId[a.id] = a; });
    window.DATA.byDay = {};
    (window.DATA.days || []).forEach(d => { window.DATA.byDay[d.n] = d; });
    rebuildActivityIndexes();

    if (opts.preserveUi) return;

    // Reset UI state for the new trip
    state.todayDay = currentDay();
    state.tab = 'today';
    state.region = null;
    state.sheet = null;
    state.hotelSheet = null;
    state.flightSheet = null;
    state.eventSheet = null;
    state.carRentalSheet = null;
    state.fullscreenMap = null;
    state.searching = false;
    state.filterTray = null;
    filterState.day = [];
    filterState.timeOfDay = [];
    filterState.category = [];
  }

  async function loadTripData(docUrl, fromCache = true, token = null, opts = {}){
    const showLoader = !opts.preserveUi;
    try {
      // Normalize URL by removing fragments/query params for consistent cache keys
      const normalizedUrl = docUrl.split('#')[0].split('?')[0];
      console.log('loadTripData called with:', { docUrl, normalizedUrl, fromCache, hasToken: !!token });
      let tripData;
      
      // Try to load from cache first
      if (fromCache) {
        const cacheKey = `${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`;
        console.log('Checking cache for key:', cacheKey);
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            tripData = JSON.parse(cached);
            if (tripDataNeedsRefresh(tripData)) {
              console.warn('Cached trip data is stale, refetching');
              localStorage.removeItem(cacheKey);
              tripData = null;
            } else {
              console.log('Loaded trip data from cache for:', tripData.trip?.title || 'Unknown');
              applyTripData(tripData, opts);
              finalizeAppAfterTripLoad(opts.preserveUi ? state.tab : undefined);
              return;
            }
          } catch (e) {
            console.warn('Failed to parse cached trip data');
            localStorage.removeItem(cacheKey);
            tripData = null;
          }
        } else {
          console.log('No cached data found');
        }
      }
      
      // If not in cache or cache disabled, fetch from API
      if (!tripData) {
        if (showLoader) {
          if (!activeTripLoadProgress) createSupertripLoader({ id: 'loader' });
          activeTripLoadProgress.setProgress(LOAD_PROGRESS.FETCH_START);
        }
        
        // Add timeout to fetch (30 seconds max)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const body = { docUrl };
        if (token) {
          body.token = token;
        }
        
        try {
          const streamed = await fetchTripDataWithProgress(body, {
            signal: controller.signal,
            onProgress: (value) => activeTripLoadProgress?.setProgress(value)
          });
          clearTimeout(timeoutId);

          if (streamed?.localDev) {
            console.warn('API not available (local dev mode), using demo trip data');
            tripData = getDemoTripData();
            if (!tripData) {
              throw new Error('No demo data available.');
            }
            toast('Demo data mode');
          } else {
            tripData = streamed;
            console.log('Fetched trip data:', tripData.trip?.title || 'Unknown', 'Days:', tripData.days?.length);
            const cacheKey = `${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`;
            localStorage.setItem(cacheKey, JSON.stringify(tripData));
            console.log('Cached trip data with key:', cacheKey);
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            throw new Error('Request timed out after 30 seconds. The server may be slow or experiencing issues.');
          }
          throw fetchErr;
        }
      }
      
      if (!tripData) {
        console.error('No trip data available!');
        throw new Error('Failed to load trip data');
      }
      
      console.log('Setting window.DATA to:', tripData.trip?.title || 'Unknown');
      applyTripData(tripData, opts);
      if (activeTripLoadProgress && showLoader) {
        activeTripLoadProgress.setProgress(LOAD_PROGRESS.PREPARE_APP);
      }
      finalizeAppAfterTripLoad(opts.preserveUi ? state.tab : undefined);
      if (activeTripLoadProgress && showLoader) {
        await activeTripLoadProgress.complete();
      }

      if (showLoader && tripDataReady()) {
        toast('Trip loaded');
      }
    } catch (err) {
      console.error('Failed to load trip data:', err);
      activeTripLoadProgress?.remove();
      
      // Show user-friendly error message
      let errorMsg = 'Trip couldn\u2019t load';
      if (err.message.includes('deployment')) {
        errorMsg = 'Waiting for API\u2026';
      } else if (err.message.includes('CODA_TOKEN')) {
        errorMsg = 'Docs token needed';
      } else if (err.message.includes('not found')) {
        errorMsg = 'Trip not found';
      }
      
      toast(errorMsg);
      
      // Re-throw so caller can handle it
      throw err;
    }
  }
  
  // Initialize trip data on page load
  async function initTripData(){
    console.log('🔍 initTripData called. URL:', window.location.href);
    console.log('🔍 URL search params:', window.location.search);
    console.log('🔍 URL pathname:', window.location.pathname);
    console.log('🔍 URL hash:', window.location.hash);
    
    // Demo mode for previewing token UI
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'token') {
      showTokenUIDemo();
      return;
    }

    const docParam = urlParams.get('doc');
    
    let trips = getTrips();
    
    // Clean up broken/partial trips, but keep any trip matching the current ?doc= param
    const cleanedTrips = trips.filter(t => {
      if (docParam) {
        let docUrl = docParam;
        if (!docParam.startsWith('http')) {
          docUrl = `https://coda.io/d/_d${docParam}`;
        }
        const tripDocId = extractDocId(t.url);
        const paramDocId = extractDocId(docUrl);
        if (tripDocId === paramDocId || t.url === docUrl || t.url === docParam) {
          return true;
        }
      }
      // Keep trips that have a real name (not default placeholders)
      if (t.name && t.name !== 'Untitled Trip' && t.name !== 'My Trip') {
        return true;
      }
      // Keep if it has a token (even if name is placeholder)
      if (t.token) {
        return true;
      }
      // Remove broken entries
      console.log('🗑️ Removing broken trip entry:', t);
      return false;
    });
    
    if (cleanedTrips.length !== trips.length) {
      console.log(`✨ Cleaned ${trips.length - cleanedTrips.length} broken trip(s)`);
      saveTrips(cleanedTrips);
      trips = cleanedTrips;
    }
    
    // Check for URL parameter to auto-load a doc
    console.log('🔍 Extracted doc param:', docParam);
    console.log('🔍 Number of trips:', trips.length);
    
    // First, check if we have any trips at all
    if (trips.length === 0 && !docParam) {
      // No trips and no doc param - show onboarding
      showOnboarding();
      return;
    }
    
    if (docParam) {
      console.log('🔗 Found doc param:', docParam);
      
      // Convert to full URL if it's just an ID
      let docUrl = docParam;
      if (!docParam.startsWith('http')) {
        // Coda URLs use the format: https://coda.io/d/Doc-Name_dID or https://coda.io/d/_dID
        docUrl = `https://coda.io/d/_d${docParam}`;
        console.log('📝 Converted doc ID to URL:', docUrl);
      }
      
      // Check if this trip already exists in saved trips
      const existingTrip = trips.find(t => {
        const tripDocId = extractDocId(t.url);
        const paramDocId = extractDocId(docUrl);
        const match = tripDocId === paramDocId || t.url === docUrl;
        console.log(`🔍 Comparing trip "${t.name}": tripUrl="${t.url}", tripDocId="${tripDocId}", paramDocId="${paramDocId}", match=${match}`);
        return match;
      });
      
      console.log('🔍 Existing trip found:', existingTrip ? existingTrip.name : 'none');
      console.log('🔍 Total trips in storage:', trips.length);
      
      if (existingTrip) {
        console.log('✅ Trip already exists, loading normally (keeping ?doc= in URL)');
        // Trip already exists, just load it normally (don't auto-load again)
        // Make sure this trip is active
        if (!existingTrip.active) {
          trips.forEach(t => t.active = (t.url === existingTrip.url));
          saveTrips(trips);
        }
        
        // Ensure the doc param stays in the URL (re-add if needed to normalize format)
        const currentDocParam = urlParams.get('doc');
        const docId = extractDocId(existingTrip.url);
        const normalizedDocParam = docId || existingTrip.url;
        
        if (currentDocParam !== normalizedDocParam) {
          const newUrl = window.location.pathname + '?doc=' + encodeURIComponent(normalizedDocParam) + window.location.hash;
          console.log('🔄 Normalizing doc param in URL:', newUrl);
          window.history.replaceState({}, '', newUrl);
        }
        
        // Continue to normal trip loading below
      } else {
        console.log('🚀 Trip not found, auto-loading from URL param');
        // Mark that we're in auto-load mode
        sessionStorage.setItem('autoLoadInProgress', 'true');
        
        // Auto-load from URL parameter (adds the trip)
        await autoLoadFromUrl(docParam);
        
        sessionStorage.removeItem('autoLoadInProgress');
        return;
      }
    }
    
    // Check if we just completed an auto-load (in case of unexpected reload)
    if (sessionStorage.getItem('autoLoadInProgress')) {
      console.log('⚠️ Auto-load was interrupted by page reload');
      sessionStorage.removeItem('autoLoadInProgress');
    }

    let tripToLoad = getActiveTrip();
    
    // If no active trip but we have trips, something is wrong
    if (!tripToLoad && trips.length > 0) {
      console.log('⚠️ No active trip found, setting first trip as active');
      trips[0].active = true;
      saveTrips(trips);
      tripToLoad = getActiveTrip();
    }
    
    // Check current URL state (it may have changed during processing)
    const currentUrlParams = new URLSearchParams(window.location.search);
    const currentDocParam = currentUrlParams.get('doc');
    console.log('🔍 Current doc param after processing:', currentDocParam);
    console.log('🔍 Active trip:', tripToLoad?.url);
    
    // If we have an active trip but no doc param in URL, add it (but don't trigger auto-load)
    if (tripToLoad && !currentDocParam) {
      const docId = extractDocId(tripToLoad.url);
      const docParamToAdd = docId || tripToLoad.url;
      // Query string must come BEFORE hash
      const newUrl = window.location.pathname + '?doc=' + encodeURIComponent(docParamToAdd) + window.location.hash;
      console.log('📌 Adding doc param to URL:', newUrl);
      window.history.replaceState({}, '', newUrl);
    } else if (tripToLoad && currentDocParam) {
      console.log('✅ Doc param already in URL, no changes needed');
    }
    
    if (tripToLoad && tripToLoad.url) {
      // Check if we just switched trips - if so, force fresh fetch
      const justSwitched = localStorage.getItem('jk26.justSwitched');
      const useCache = !justSwitched;
      
      if (justSwitched) {
        console.log('Just switched trips - forcing fresh fetch');
        localStorage.removeItem('jk26.justSwitched');
      }

      try {
        // Load the active trip's data (pass token if available)
        await loadTripData(tripToLoad.url, useCache, tripToLoad.token || null);
      } catch (err) {
        console.error('Failed to load trip data on init:', err);
        
        // Remove loading overlay if it exists
        activeTripLoadProgress?.remove();
        
        if (applyDemoTripData()) {
          finalizeAppAfterTripLoad('today');
        }

        const banner = el('div', {
          style: {
            position: 'fixed',
            top: 'env(safe-area-inset-top)',
            left: '0',
            right: '0',
            background: '#ff6b6b',
            color: 'white',
            padding: '12px 20px',
            textAlign: 'center',
            fontSize: '14px',
            fontWeight: '600',
            zIndex: '9999',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }
        }, `Couldn\u2019t load ${tripToLoad.name || 'your trip'}. Showing sample data \u2014 try Sync in Settings.`);
        
        document.body.appendChild(banner);
        
        // Auto-hide after 10 seconds
        setTimeout(() => banner.remove(), 10000);
      }
    }
  }

  async function addTrip(name, url, icon = null, docName = null, token = null){
    const trips = getTrips();
    
    // Check if trip with same doc ID already exists (prevents duplicates with different URL formats)
    const newDocId = extractDocId(url);
    const existingTrip = trips.find(t => {
      const existingDocId = extractDocId(t.url);
      return existingDocId === newDocId || t.url === url;
    });
    
    if (existingTrip) {
      console.log('⚠️ Trip already exists:', existingTrip.name);
      // Update token if provided
      if (token) {
        existingTrip.token = token;
      }
      // Don't add duplicate, just make it active and return true
      trips.forEach(t => t.active = (t.url === existingTrip.url));
      saveTrips(trips);
      return true;
    }
    
    // Set all trips to inactive, make new one active
    trips.forEach(t => t.active = false);
    const newTrip = { 
      name, 
      url, 
      icon: icon || '✈️', 
      docName: docName || name,
      active: true 
    };
    
    // Only add token if provided
    if (token) {
      newTrip.token = token;
    }
    
    trips.push(newTrip);
    saveTrips(trips);
    return true;
  }

  async function fetchDocInfo(docUrl, token = null){
    try {
      const body = { docUrl };
      if (token) {
        body.token = token;
      }
      
      const res = await fetch('/api/doc-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      // Handle local dev (501)
      if (res.status === 501) {
        console.warn('API not available (local dev mode), using defaults');
        return { name: 'My Trip', icon: '✈️' };
      }

      // Handle unauthorized (need token)
      if (res.status === 403 || res.status === 404 || res.status === 401) {
        console.warn('Doc access denied - may need authentication');
        return null;
      }

      if (!res.ok) {
        throw new Error(`Failed to fetch doc info: ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      console.error('Error fetching doc info:', err);
      return null;
    }
  }

  async function removeTrip(tripUrl){
    let trips = getTrips();
    const index = trips.findIndex(t => t.url === tripUrl);
    if (index === -1) return;
    
    const wasActive = trips[index].active;
    
    // Clear cached data for this trip
    localStorage.removeItem(`${TRIP_DATA_CACHE_PREFIX}${tripUrl}`);
    
    trips.splice(index, 1);
    
    // If removed trip was active, make the first remaining trip active
    if (wasActive && trips.length > 0) {
      trips[0].active = true;
      saveTrips(trips);
      // Load the new active trip's data (pass token if available)
      try {
        await loadTripData(trips[0].url, false, trips[0].token || null);
      } catch (err) {
        console.error('Failed to load next trip after removal:', err);
        toast('No trips available');
      }
    } else {
      saveTrips(trips);
      if (trips.length === 0) {
        // No trips left, reload to show default data
        location.reload();
      }
    }
  }

  function usesSwipeDelete(){
    return window.matchMedia('(hover: none), (pointer: coarse)').matches;
  }

  const TAP_MOVE_PX = 14;
  const TAP_SCROLL_PX = 3;
  const GHOST_CLICK_MS = 450;

  function getScrollParent(el){
    let node = el.parentElement;
    while (node && node !== document.body) {
      const { overflowY } = getComputedStyle(node);
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
          node.scrollHeight > node.clientHeight + 1) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  // Ignore taps that follow touch movement or list scrolling (common on mobile flicks).
  function attachScrollSafeTap(el, onTap){
    let startX = null;
    let startY = null;
    let moved = false;
    let sawScroll = false;
    let scrollEl = null;
    let startScrollTop = 0;
    let blockClickUntil = 0;

    const onScroll = () => { sawScroll = true; };

    const resetTouch = () => {
      scrollEl?.removeEventListener('scroll', onScroll, true);
      startX = startY = null;
      scrollEl = null;
      moved = false;
      sawScroll = false;
    };

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      moved = false;
      sawScroll = false;
      scrollEl = getScrollParent(el);
      startScrollTop = scrollEl?.scrollTop ?? 0;
      scrollEl?.addEventListener('scroll', onScroll, { passive: true, capture: true });
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (startX == null) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > TAP_MOVE_PX || Math.abs(dy) > TAP_MOVE_PX) moved = true;
    }, { passive: true });

    const finishTouch = (e) => {
      if (startX == null) return;
      const scrollDelta = scrollEl ? Math.abs(scrollEl.scrollTop - startScrollTop) : 0;
      const tap = !moved && !sawScroll && scrollDelta < TAP_SCROLL_PX;
      resetTouch();
      blockClickUntil = Date.now() + GHOST_CLICK_MS;
      if (!tap) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      onTap(e);
    };

    el.addEventListener('touchend', finishTouch, { passive: false });
    el.addEventListener('touchcancel', finishTouch, { passive: false });

    el.addEventListener('click', (e) => {
      if (Date.now() < blockClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onTap(e);
    });
  }

  function setSwipeContainerState(container, { open = false, revealing = false } = {}){
    if (!container) return;
    container.classList.toggle('is-swipe-open', open);
    container.classList.toggle('is-revealing', revealing);
  }

  function closeOpenSwipeRows(exceptRow){
    $$('.swipe-delete-row').forEach(row => {
      if (row === exceptRow) return;
      row.style.transition = 'transform 0.2s ease-out';
      row.style.transform = 'translateX(0)';
      delete row.dataset.swipeOpen;
      setSwipeContainerState(row.closest('.swipe-delete-container'));
    });
  }

  function attachSwipeDeleteHandlers({ container, row, onTap }){
    let touchStartX = 0;
    let touchStartY = 0;
    let currentX = 0;
    let isDragging = false;
    let isVerticalScroll = false;
    let touchMoved = false;
    let sawScroll = false;
    let scrollEl = null;
    let startScrollTop = 0;

    const onScroll = () => { sawScroll = true; };

    const clearScrollWatch = () => {
      scrollEl?.removeEventListener('scroll', onScroll, true);
      scrollEl = null;
      sawScroll = false;
    };

    row.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isDragging = false;
      isVerticalScroll = false;
      touchMoved = false;
      sawScroll = false;
      scrollEl = getScrollParent(row);
      startScrollTop = scrollEl?.scrollTop ?? 0;
      scrollEl?.addEventListener('scroll', onScroll, { passive: true, capture: true });
      row.style.transition = 'none';
    }, { passive: true });

    row.addEventListener('touchmove', (e) => {
      if (isVerticalScroll) return;

      const touchX = e.touches[0].clientX;
      const touchY = e.touches[0].clientY;
      const deltaX = touchX - touchStartX;
      const deltaY = touchY - touchStartY;

      if (Math.abs(deltaX) > TAP_MOVE_PX || Math.abs(deltaY) > TAP_MOVE_PX) {
        touchMoved = true;
      }

      if (!isDragging && Math.abs(deltaY) > Math.abs(deltaX)) {
        isVerticalScroll = true;
        return;
      }

      if (deltaX < 0) {
        isDragging = true;
        closeOpenSwipeRows(row);
        setSwipeContainerState(container, { revealing: true, open: !!row.dataset.swipeOpen });
        currentX = Math.max(deltaX, -80);
        row.style.transform = `translateX(${currentX}px)`;
        e.preventDefault();
      } else if (row.dataset.swipeOpen && deltaX > 0) {
        isDragging = true;
        setSwipeContainerState(container, { revealing: true, open: true });
        currentX = Math.min(0, -80 + deltaX);
        row.style.transform = `translateX(${currentX}px)`;
        e.preventDefault();
      }
    }, { passive: false });

    const finishTouch = async () => {
      row.style.transition = 'transform 0.2s ease-out';
      const scrollDelta = scrollEl ? Math.abs(scrollEl.scrollTop - startScrollTop) : 0;
      const scrolled = sawScroll || scrollDelta >= TAP_SCROLL_PX;
      clearScrollWatch();

      if (!isDragging) {
        if (row.dataset.swipeOpen) {
          delete row.dataset.swipeOpen;
          row.style.transform = 'translateX(0)';
          setSwipeContainerState(container);
          return;
        }
        if (onTap && !touchMoved && !isVerticalScroll && !scrolled) await onTap();
        return;
      }

      if (currentX < -40) {
        row.style.transform = 'translateX(-80px)';
        row.dataset.swipeOpen = '1';
        currentX = -80;
        setSwipeContainerState(container, { open: true });
      } else {
        row.style.transform = 'translateX(0)';
        delete row.dataset.swipeOpen;
        currentX = 0;
        setSwipeContainerState(container);
      }

      isDragging = false;
    };

    row.addEventListener('touchend', finishTouch, { passive: true });
    row.addEventListener('touchcancel', finishTouch, { passive: true });
  }

  async function removeActivity(a){
    const trips = getTrips();
    const activeTrip = trips.find(t => t.active);
    if (!activeTrip) {
      toast('Select a trip to continue');
      return;
    }

    try {
      const body = { docUrl: activeTrip.url, rowId: a.id };
      if (activeTrip.token) body.token = activeTrip.token;

      const res = await fetch('/api/delete-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Failed to delete activity');

      const normalizedUrl = activeTrip.url.split('#')[0].split('?')[0];
      localStorage.removeItem(`${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`);
      removeActivityFromLocalData(a.id);
      try {
        localStorage.setItem(
          `${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`,
          JSON.stringify(window.DATA)
        );
      } catch {}

      if (state.sheet === a.id) closeSheet();
      const tab = currentTab();
      if (tab === 'activities') renderActivitiesList();
      else syncFilters();
      switchTab(tab);
      toast(`Removed ${a.name}`);
    } catch (err) {
      console.error('Error deleting activity:', err);
      toast('Couldn\u2019t delete activity');
    }
  }

  function buildTripsCard(){
    const trips = getTrips();
    const activeTrip = getActiveTrip();
    
    const card = el('div', { class: 'offline-card' },
      el('div', { class: 'oc-head' },
        el('div', { class: 'oc-headline' }, 'Trips'),
        el('span', { class: 'oc-status' }, trips.length === 0 ? 'No trips' : `${trips.length} trip${trips.length > 1 ? 's' : ''}`)
      ),
      el('div', { class: 'oc-desc' }, 'Select a trip to view its itinerary.')
    );

    // List of existing trips as inline select controls
    if (trips.length > 0) {
      const tripsList = el('div', { class: 'trips-select-list', style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } });
      const showBorders = trips.length > 1;
      
      trips.forEach(trip => {
        const container = el('div', { class: 'trip-swipe-container swipe-delete-container' });

        const deleteBtn = el('button', {
          type: 'button',
          class: 'swipe-delete-action',
          onclick: async (e) => {
            e.stopPropagation();
            if (confirm(`Remove "${trip.name}"?`)) {
              await removeTrip(trip.url);
              toast('Trip removed');
            }
          }
        }, 'Delete');

        const desktopDeleteBtn = el('button', {
          type: 'button',
          class: 'swipe-desktop-delete',
          'aria-label': `Remove ${trip.name}`,
          onclick: async (e) => {
            e.stopPropagation();
            if (confirm(`Remove "${trip.name}"?`)) {
              await removeTrip(trip.url);
              toast('Trip removed');
            }
          }
        }, '×');

        const tripRow = el('div', {
          class: 'trip-select-item swipe-delete-row' +
            (trip.active ? ' selected' : '') +
            (showBorders ? ' has-border' : ''),
          'data-trip-url': trip.url
        },
          el('div', {
            style: {
              fontSize: '24px',
              marginRight: '12px',
              flexShrink: '0',
              lineHeight: '1'
            }
          }, trip.icon || '✈️'),
          el('div', { style: { flex: '1', minWidth: 0 } },
            el('div', { style: { fontWeight: '500', fontSize: '15px', color: 'var(--fg)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, trip.name),
            el('div', { class: 'trip-doc-name', style: { fontSize: '12px', color: 'var(--fg-mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, tripDayCountLabel(trip.url))
          ),
          desktopDeleteBtn
        );

        if (usesSwipeDelete()) {
          attachSwipeDeleteHandlers({
            container,
            row: tripRow,
            onTap: async () => {
              if (!trip.active && trips.length > 1) await setActiveTrip(trip.url);
            }
          });
        } else {
          tripRow.addEventListener('click', async () => {
            if (!trip.active && trips.length > 1) await setActiveTrip(trip.url);
          });
        }

        container.appendChild(deleteBtn);
        container.appendChild(tripRow);
        tripsList.appendChild(container);
      });
      card.appendChild(tripsList);
    }

    // Add new trip button and collapsible form
    const addSection = el('div', { style: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' } });
    
    const addButton = el('button', { 
      class: 'oc-btn',
      id: 'show-add-trip-btn',
      style: { width: '100%', display: 'block' },
      onclick: () => {
        const form = $('#add-trip-form');
        const showBtn = $('#show-add-trip-btn');
        
        form.style.display = 'block';
        showBtn.style.display = 'none';
      }
    }, 'Add New Trip');
    
    const formButtonRow = el('div', {
      style: { display: 'flex', gap: '8px', marginTop: '8px' }
    });
    
    const cancelButton = el('button', {
      class: 'oc-btn secondary',
      id: 'cancel-add-trip-btn',
      style: { flex: '1' },
      onclick: () => {
        const form = $('#add-trip-form');
        const showBtn = $('#show-add-trip-btn');
        form.style.display = 'none';
        showBtn.style.display = 'block';
        // Clear inputs
        $('#trip-url-input').value = '';
        // Hide token request UI if visible
        const tokenSection = $('#token-request-section');
        if (tokenSection) tokenSection.style.display = 'none';
      }
    }, 'Cancel');
    
    const submitButton = el('button', { 
      class: 'oc-btn',
      id: 'add-trip-submit-btn',
      style: { flex: '1' },
      onclick: async () => {
        const urlInput = $('#trip-url-input');
        const tokenInput = $('#trip-token-input');
        const submitBtn = $('#add-trip-submit-btn');
        const showBtn = $('#show-add-trip-btn');
        const tokenSection = $('#token-request-section');
        const url = urlInput.value.trim();
        const userToken = tokenInput ? tokenInput.value.trim() : '';
        
        if (!url) {
          alert('Please paste a Supertrip doc URL');
          return;
        }
        
        try {
          // Try to fetch doc info (first with main token, then with user token if provided)
          submitBtn.disabled = true;
          submitBtn.textContent = 'Fetching doc info...';
          
          let docInfo = await fetchDocInfo(url, userToken);
          
          // If we got a 403/404 and no user token provided yet, show token request
          if (!docInfo && !userToken) {
            // Show full-screen token request UI
            const tokenScreen = el('div', {
              id: 'token-request-screen',
              style: {
                position: 'fixed',
                inset: '0',
                background: 'var(--bg)',
                zIndex: '10000',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'auto'
              }
            },
              // Header with back button
              el('div', {
                style: {
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }
              },
                el('button', {
                  id: 'token-back-btn',
                  style: {
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    padding: '0',
                    color: 'var(--primary)',
                    lineHeight: '1'
                  }
                }, '←'),
                el('div', {
                  style: {
                    fontSize: '18px',
                    fontWeight: '600',
                    color: 'var(--fg)'
                  }
                }, 'Back')
              ),
              // Content
              el('div', {
                style: {
                  flex: '1',
                  padding: '24px 20px',
                  maxWidth: '600px',
                  margin: '0 auto',
                  width: '100%'
                }
              },
                el('div', {
                  style: {
                    fontSize: '24px',
                    fontWeight: '600',
                    color: 'var(--fg)',
                    marginBottom: '16px'
                  }
                }, 'API Token Required'),
                el('div', {
                  style: {
                    fontSize: '15px',
                    color: 'var(--fg)',
                    marginBottom: '20px',
                    lineHeight: '1.5'
                  }
                }, 'This Coda doc is private. To access it, you need to generate an API token:'),
                el('ol', {
                  style: {
                    fontSize: '14px',
                    marginBottom: '20px',
                    paddingLeft: '24px',
                    color: 'var(--fg)',
                    lineHeight: '1.8'
                  }
                },
                  el('li', { style: { marginBottom: '12px' } }, 'Go to ', (() => {
                    const link = el('a', {
                      href: 'https://coda.io/account',
                      target: '_blank',
                      style: { color: '#60A5FA', textDecoration: 'none' }
                    }, 'coda.io/account');
                    link.onmouseenter = () => { link.style.textDecoration = 'underline'; };
                    link.onmouseleave = () => { link.style.textDecoration = 'none'; };
                    return link;
                  })()),
                  el('li', { style: { marginBottom: '12px' } }, 'Click "Generate API token"'),
                  el('li', { style: { marginBottom: '12px' } }, 'Name it (e.g., "Trip App")'),
                  el('li', { style: { marginBottom: '12px' } },
                    el('strong', null, 'Click "Add a restriction"'),
                    ' and paste this doc URL:',
                    el('div', {
                      style: {
                        marginTop: '8px',
                        marginLeft: '-24px',
                        padding: '10px',
                        background: 'var(--surface-2)',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }
                    },
                      el('div', {
                        style: {
                          flex: '1',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          wordBreak: 'break-all',
                          color: 'var(--fg)'
                        }
                      }, url),
                      (() => {
                        const btn = el('button', {
                          onclick: () => {
                            navigator.clipboard.writeText(url);
                            const btn = event.target.closest('button');
                            const originalContent = btn.innerHTML;
                            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                            setTimeout(() => { btn.innerHTML = originalContent; }, 1500);
                          },
                          style: {
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            fontSize: '16px',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: '0'
                          }
                        });
                        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                        return btn;
                      })()
                    )
                  ),
                  el('li', { style: { marginBottom: '12px' } }, 'Click "Generate API token"'),
                  el('li', { style: { marginBottom: '12px' } }, 'Copy the token and paste it below')
                ),
                el('div', {
                  style: {
                    marginBottom: '12px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--fg)'
                  }
                }, 'Paste your API token:'),
                el('input', {
                  type: 'text',
                  id: 'trip-token-input',
                  placeholder: 'Paste your Coda API token here',
                  style: {
                    width: '100%',
                    padding: '14px',
                    background: 'var(--bg)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'white',
                    borderImage: 'none',
                    borderRadius: '8px',
                    color: 'var(--fg)',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box'
                  }
                }),
                el('button', {
                  id: 'token-continue-btn',
                  style: {
                    width: '100%',
                    marginTop: '20px',
                    padding: '16px',
                    background: 'white',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'black',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }
                }, 'Continue')
              )
            );
            
            document.body.appendChild(tokenScreen);
            
            // Handle back button
            $('#token-back-btn').onclick = () => {
              tokenScreen.remove();
            };
            
            // Handle continue button
            $('#token-continue-btn').onclick = async () => {
              const tokenInput = $('#trip-token-input');
              const token = tokenInput.value.trim();
              
              if (!token) {
                alert('Please paste your API token');
                return;
              }
              
              tokenScreen.remove();
              
              // Retry with token
              submitBtn.disabled = true;
              submitBtn.textContent = 'Authenticating...';
              
              try {
                docInfo = await fetchDocInfo(url, token);
                
                if (!docInfo) {
                  throw new Error('Could not access this document with the provided token. Please check your token and try again.');
                }
                
                // Continue with the token
                userToken = token;
                
                // Re-trigger the submit flow
                const icon = docInfo?.icon && typeof docInfo.icon === 'string' ? docInfo.icon : '✈️';
                const tripName = docInfo?.name || 'Untitled Trip';
                
                if (await addTrip(tripName, url, icon, tripName, userToken)) {
                  urlInput.value = '';
                  $('#add-trip-form').style.display = 'none';
                  showBtn.style.display = 'block';
                  
                  await loadTripData(url, false, userToken);
                  
                  const docId = extractDocId(url);
                  const docParam = docId || url;
                  const newUrl = window.location.pathname + '?doc=' + encodeURIComponent(docParam);
                  window.history.replaceState({}, '', newUrl);
                  
                  toast('New trip added');
                }
                
                submitBtn.textContent = 'Add Trip';
                submitBtn.disabled = false;
              } catch (err) {
                console.error('Failed with token:', err);
                submitBtn.textContent = 'Add Trip';
                submitBtn.disabled = false;
                toast('Error: ' + err.message);
              }
            };
            
            return;
          }
          
          // If still no doc info, show error
          if (!docInfo) {
            throw new Error('Could not access this document. Check your token and try again.');
          }
          
          // Ensure icon is a string, not an object
          let icon = '✈️';
          if (docInfo?.icon && typeof docInfo.icon === 'string') {
            icon = docInfo.icon;
          }
          const tripName = docInfo?.name || 'Untitled Trip';
          
          submitBtn.textContent = 'Add Trip';
          submitBtn.disabled = false;
          
          if (await addTrip(tripName, url, icon, tripName, userToken)) {
            urlInput.value = '';
            if (tokenInput) tokenInput.value = '';
            $('#add-trip-form').style.display = 'none';
            if (tokenSection) tokenSection.style.display = 'none';
            showBtn.style.display = 'block';
            
            // Load the trip data since it's now active
            await loadTripData(url, false);
            
            // Update URL with doc parameter (makes it easy to share)
            const docId = extractDocId(url);
            const docParam = docId || url;
            const newUrl = window.location.pathname + '?doc=' + encodeURIComponent(docParam);
            window.history.replaceState({}, '', newUrl);
            
            toast('New trip added');
          }
        } catch (err) {
          console.error('Failed to add trip:', err);
          submitBtn.textContent = 'Add Trip';
          submitBtn.disabled = false;
          toast('Trip not found');
        }
      }
    }, 'Add Trip');
    
    formButtonRow.appendChild(cancelButton);
    formButtonRow.appendChild(submitButton);
    
    const addForm = el('div', { 
      id: 'add-trip-form',
      style: { display: 'none', marginTop: '12px' } 
    },
      el('input', {
        type: 'text',
        id: 'trip-url-input',
        placeholder: 'Paste Superhuman Doc URL',
        style: { 
          width: '100%', 
          padding: '10px', 
          marginBottom: '8px',
          background: 'var(--bg)', 
          border: '1px solid var(--border)', 
          borderRadius: '6px',
          color: 'var(--fg)'
        }
      }),
      formButtonRow
    );
    
    addSection.appendChild(addButton);
    addSection.appendChild(addForm);
    card.appendChild(addSection);
    
    return card;
  }

  function buildSyncCard(){
    const activeTrip = getActiveTrip();
    const desc = activeTrip 
      ? `Fetch the latest updates from "${activeTrip.name}". The app will automatically refresh.`
      : 'Add a trip above to enable syncing.';
    
    const card = el('div', { class: 'offline-card' },
      el('div', { class: 'oc-head' },
        el('div', { class: 'oc-headline' }, 'Sync from Superhuman Docs'),
        el('span', { class: 'oc-status', id: 'sync-status' }, activeTrip ? 'Ready' : 'No trip')
      ),
      el('div', { class: 'oc-desc' }, desc),
      el('button', { 
        class: 'oc-btn secondary', 
        id: 'sync-btn', 
        onclick: triggerCodaSync,
        disabled: !activeTrip
      }, 'Sync now')
    );
    return card;
  }

  function buildRefreshCard(){
    const card = el('div', { class: 'offline-card' },
      el('div', { class: 'oc-head' },
        el('div', { class: 'oc-headline' }, 'Refresh app'),
        el('span', { class: 'oc-status' }, '')
      ),
      el('div', { class: 'oc-desc' }, 'Reload the app to see the latest changes and updates.'),
      el('button', { class: 'oc-btn secondary', onclick: () => location.reload() }, 'Refresh now')
    );
    return card;
  }

  async function triggerCodaSync(){
    const btn = $('#sync-btn');
    const status = $('#sync-status');
    if (!btn || !status) return;
    
    const activeTrip = getActiveTrip();
    if (!activeTrip) {
      toast('No trips available');
      return;
    }
    const docUrl = activeTrip.url;

    btn.disabled = true;
    btn.textContent = 'Syncing...';

    try {
      // Clear cached data for this trip to force fresh fetch
      localStorage.removeItem(`${TRIP_DATA_CACHE_PREFIX}${docUrl}`);

      // Fetch fresh data from Coda (pass token if available)
      await loadTripData(docUrl, false, activeTrip.token || null, { preserveUi: true });

      toast('Syncing\u2026');
      
      // Reload the app to display fresh data
      setTimeout(() => location.reload(), 500);
    } catch (err){
      console.error('Sync error:', err);
      status.textContent = 'Error';
      btn.textContent = 'Sync now';
      btn.disabled = false;
      toast('Error: ' + err.message);
    }
  }

  function resetCountLabel(){
    const n = checkedActs.size + checkedTodos.size;
    if (!n) return 'nothing checked';
    return `${n} checked`;
  }
  let resetArmed = false;
  let resetArmTimer = null;
  function confirmReset(){
    const btn = $('#reset-btn');
    if (!btn) return;
    if (!resetArmed){
      resetArmed = true;
      btn.classList.add('armed');
      btn.textContent = 'Tap again to confirm';
      clearTimeout(resetArmTimer);
      resetArmTimer = setTimeout(() => {
        resetArmed = false;
        btn.classList.remove('armed');
        btn.textContent = 'Reset App';
      }, 3500);
      return;
    }
    clearTimeout(resetArmTimer);
    resetArmed = false;
    
    // Clear all app data
    checkedActs.clear();
    checkedTodos.clear();
    saveSet(STORAGE.activityChecks, checkedActs);
    saveSet(STORAGE.todoChecks, checkedTodos);
    
    // Clear all trips and cached trip data
    const trips = getTrips();
    trips.forEach(trip => {
      localStorage.removeItem(`${TRIP_DATA_CACHE_PREFIX}${trip.url}`);
    });
    localStorage.removeItem('jk26.trips');
    localStorage.removeItem('jk26.dismissedUpdate');
    
    // Show onboarding screen
    showOnboarding();
    
    toast('App reset');
    // Re-render whichever tab is visible so the UI reflects the reset.
    if (state.tab === 'today') renderToday();
    if (state.tab === 'activities') renderActivitiesTab();
    toast('Progress reset');
  }

  function buildLargeTitle(title, right){
    let rightEl;
    if (!right) rightEl = el('span');
    else if (right.classList?.contains('lt-title-actions') || right.classList?.contains('iti-chevrons')) rightEl = right;
    else rightEl = el('div', { class: 'lt-title-actions' }, right);
    return el('div', { class: 'lt-title with-status' },
      el('h2', null, title),
      rightEl
    );
  }

  function buildItineraryPills(day, prevScrollLeft){
    const wrap = el('div', { class: 'lt-sticky' });
    const pills = el('div', { class: 'chips chips-single day-pills' });
    D.days.forEach(d => {
      const p = el('button', {
        class: 'chip day-pill' + (d.n === day.n ? ' active' : ''),
        style: { '--day-accent': d.color },
        onclick: () => navTo(d.n)
      }, `Day ${d.n} \u00b7 ${shortDate(d.date)}`);
      pills.appendChild(p);
    });
    wrap.appendChild(pills);
    // Seed the new chips with the previous scroll position so the smooth
    // scroll animates FROM where the user was, not from the start.
    if (typeof prevScrollLeft === 'number'){
      requestAnimationFrame(() => { pills.scrollLeft = prevScrollLeft; });
    }
    setTimeout(() => {
      const active = wrap.querySelector('.day-pill.active');
      if (active && pills) {
        const target = active.offsetLeft + active.offsetWidth / 2 - pills.clientWidth / 2;
        pills.scrollTo({ left: target, behavior: 'smooth' });
      }
    }, 30);
    return wrap;
  }

  function buildDayDescription(day){
    const desc = day.desc.trim();
    if (!desc) return null;

    const id = `day-desc-${day.n}`;
    const maxLines = 3;
    
    const body = el('div', { class: 'day-desc-body', id: id }, desc);
    const expandBtn = el('button', { 
      class: 'day-desc-expand',
      onclick: function(e) {
        const bodyEl = document.getElementById(id);
        const isExpanded = bodyEl.classList.contains('expanded');
        if (isExpanded) {
          bodyEl.classList.remove('expanded');
          this.textContent = 'more';
        } else {
          bodyEl.classList.add('expanded');
          this.textContent = 'less';
        }
      }
    }, 'more');
    
    return el('div', { class: 'day-desc-card' },
      body,
      expandBtn
    );
  }

  function formatFlightTime(t){
    return t && String(t).trim() ? String(t).trim() : '';
  }

  function formatFlightCost(cost){
    if (cost == null || cost === '') return '';
    const n = Number(cost);
    if (!Number.isFinite(n)) return '';
    return `$${n.toFixed(n % 1 ? 2 : 0)}`;
  }

  const RECEIPT_IMAGE_RE = /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i;
  const RECEIPT_PDF_RE = /\.pdf$/i;

  function receiptKind(filename){
    const name = String(filename || '').trim();
    if (RECEIPT_IMAGE_RE.test(name)) return 'image';
    if (RECEIPT_PDF_RE.test(name)) return 'pdf';
    return 'unknown';
  }

  function receiptViewLabel(kind){
    if (kind === 'image') return 'View Image';
    if (kind === 'pdf') return 'View PDF';
    return 'View Receipt';
  }

  function openExternalReceipt(url){
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  function sheetActionsClass(count) {
    if (count <= 1) return 'sheet-actions single';
    if (count === 3) return 'sheet-actions triple';
    return 'sheet-actions';
  }

  function buildReceiptActionButton(url, filename, { secondary = false } = {}){
    const kind = receiptKind(filename);
    const label = receiptViewLabel(kind);
    const className = 'btn' + (secondary ? ' secondary' : '');
    if (kind === 'image') {
      return el('button', {
        class: className,
        type: 'button',
        onclick: () => openReceiptImageSheet(url, filename)
      }, label);
    }
    return el('a', {
      class: className,
      href: url,
      target: '_blank',
      rel: 'noopener'
    }, label);
  }

  function ensureReceiptImageSheetDom(){
    const root = $('#app') || $('.phone-fullscreen') || document.body;
    let backdrop = $('#receipt-image-backdrop');
    let sheet = $('#receipt-image-sheet');
    if (!backdrop) {
      backdrop = el('div', { id: 'receipt-image-backdrop', class: 'sheet-backdrop sheet-stack-3' });
      root.appendChild(backdrop);
    }
    if (!sheet) {
      sheet = el('div', { id: 'receipt-image-sheet', class: 'sheet sheet-stack-3 receipt-image-sheet' });
      root.appendChild(sheet);
    }
    return { sheet, backdrop };
  }

  function hideReceiptImageSheet(){
    const sheet = $('#receipt-image-sheet');
    const backdrop = $('#receipt-image-backdrop');
    if (!sheet || !backdrop) return;
    if (sheet.__receiptZoomCleanup) {
      sheet.__receiptZoomCleanup();
      sheet.__receiptZoomCleanup = null;
    }
    clearSheetDragStyles(sheet);
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    backdrop.onclick = null;
    sheet.innerHTML = '';
  }

  function attachReceiptPinchZoom(viewport, stage, img){
    let scale = 1;
    let minScale = 1;
    let maxScale = 4;
    let tx = 0;
    let ty = 0;
    let viewW = 0;
    let viewH = 0;
    let natW = 0;
    let natH = 0;
    const pointers = new Map();
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let panStartX = 0;
    let panStartY = 0;
    let panOriginTx = 0;
    let panOriginTy = 0;

    function measure(){
      viewW = viewport.clientWidth;
      viewH = viewport.clientHeight;
    }

    function clampPan(){
      const w = natW * scale;
      const h = natH * scale;
      if (w <= viewW) tx = (viewW - w) / 2;
      else tx = Math.min(0, Math.max(viewW - w, tx));
      if (h <= viewH) ty = (viewH - h) / 2;
      else ty = Math.min(0, Math.max(viewH - h, ty));
    }

    function applyTransform(){
      clampPan();
      stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    function fitToViewport(){
      measure();
      natW = img.naturalWidth;
      natH = img.naturalHeight;
      if (!natW || !natH || !viewW || !viewH) return;
      img.style.width = `${natW}px`;
      img.style.height = `${natH}px`;
      minScale = Math.min(viewW / natW, viewH / natH);
      maxScale = minScale * 5;
      scale = minScale;
      tx = (viewW - natW * scale) / 2;
      ty = (viewH - natH * scale) / 2;
      applyTransform();
    }

    function pointerDistance(a, b){
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function zoomAroundMidpoint(nextScale, mx, my){
      const prevScale = scale;
      scale = Math.min(maxScale, Math.max(minScale, nextScale));
      const ratio = scale / prevScale;
      tx = mx - (mx - tx) * ratio;
      ty = my - (my - ty) * ratio;
      applyTransform();
    }

    function onPointerDown(e){
      viewport.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOriginTx = tx;
        panOriginTy = ty;
      } else if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinchStartDist = pointerDistance(pts[0], pts[1]);
        pinchStartScale = scale;
      }
    }

    function onPointerMove(e){
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        const d = pointerDistance(pts[0], pts[1]);
        if (pinchStartDist > 0) {
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          const rect = viewport.getBoundingClientRect();
          zoomAroundMidpoint(pinchStartScale * (d / pinchStartDist), midX - rect.left, midY - rect.top);
        }
      } else if (pointers.size === 1) {
        tx = panOriginTx + (e.clientX - panStartX);
        ty = panOriginTy + (e.clientY - panStartY);
        applyTransform();
      }
    }

    function onPointerUp(e){
      pointers.delete(e.pointerId);
      try { viewport.releasePointerCapture(e.pointerId); } catch {}
      if (pointers.size === 1) {
        const remaining = [...pointers.values()][0];
        panStartX = remaining.x;
        panStartY = remaining.y;
        panOriginTx = tx;
        panOriginTy = ty;
      }
    }

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);
    const onResize = () => fitToViewport();
    window.addEventListener('resize', onResize);
    img.addEventListener('load', fitToViewport);
    if (img.complete) fitToViewport();

    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);
    };
  }

  function openReceiptImageSheet(url, filename){
    const { sheet, backdrop } = ensureReceiptImageSheetDom();
    if (sheet.__receiptZoomCleanup) {
      sheet.__receiptZoomCleanup();
      sheet.__receiptZoomCleanup = null;
    }
    sheet.innerHTML = '';

    sheet.appendChild(el('div', { class: 'handle' }));
    sheet.appendChild(el('div', { class: 'sheet-nav' },
      el('div', { class: 'sheet-nav-spacer' }),
      el('div', { class: 'sheet-nav-actions' },
        buildSheetCloseButton(hideReceiptImageSheet)
      )
    ));

    const viewport = el('div', { class: 'receipt-zoom-viewport' });
    const stage = el('div', { class: 'receipt-zoom-stage' });
    const status = el('div', { class: 'receipt-zoom-status' }, 'Loading…');
    const img = el('img', {
      class: 'receipt-zoom-img',
      src: url,
      alt: 'Receipt',
      draggable: 'false'
    });
    img.addEventListener('load', () => { status.style.display = 'none'; });
    img.addEventListener('error', () => {
      status.textContent = 'Couldn\u2019t load image';
      status.classList.add('error');
    });
    stage.appendChild(img);
    viewport.appendChild(stage);
    viewport.appendChild(status);
    sheet.appendChild(viewport);
    sheet.appendChild(el('div', { class: 'receipt-image-actions' },
      el('button', {
        class: 'btn secondary',
        type: 'button',
        onclick: () => openExternalReceipt(url)
      }, 'Open in Browser')
    ));

    sheet.__receiptZoomCleanup = attachReceiptPinchZoom(viewport, stage, img);

    backdrop.classList.add('open');
    backdrop.onclick = hideReceiptImageSheet;
    requestAnimationFrame(() => sheet.classList.add('open'));
  }

  function buildFlightCard(f, day){
    const depart = formatFlightTime(f.depart);
    const arrive = formatFlightTime(f.arrive);
    const card = el('div', {
      class: 'flight-card',
      role: 'button',
      tabindex: '0',
      'aria-label': `${f.trip || f.number}, ${f.from} to ${f.to}`
    },
      el('div', { class: 'fc-top' },
        el('span', null, f.airline),
        el('span', null, f.number)
      ),
      el('div', { class: 'fc-row' },
        el('div', { class: 'fc-airport' }, f.from),
        el('div', { class: 'fc-plane' },
          el('span', { class: 'line l' }),
          el('span', null, '✈'),
          el('span', { class: 'line r' })
        ),
        el('div', { class: 'fc-airport right' }, f.to)
      ),
      el('div', { class: 'fc-times' },
        el('div', { class: 'time' + (depart ? '' : ' muted') }, depart || '—'),
        el('div', { class: 'time' + (arrive ? '' : ' muted') }, arrive || '—')
      ),
      el('div', { class: 'fc-cities' },
        el('div', null, f.fromCity),
        el('div', null, f.toCity)
      )
    );
    attachScrollSafeTap(card, () => openFlightSheet(f, day));
    return card;
  }

  const PLACE_ENRICH_CACHE_KEY = 'trip-place-enrich-v2';
  const placeEnrichInflight = new Map();
  const placeEnrichSessionMiss = new Set();

  function placeEnrichRecordKey(kind, record) {
    return `${kind}:${record?.id || record?.name || 'unknown'}`;
  }

  function readPlaceEnrichCacheStore() {
    try {
      return JSON.parse(localStorage.getItem(PLACE_ENRICH_CACHE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function writePlaceEnrichCacheStore(store) {
    try {
      localStorage.setItem(PLACE_ENRICH_CACHE_KEY, JSON.stringify(store));
    } catch (e) {
      console.warn('Failed to persist place enrich cache:', e);
    }
  }

  function getCachedPlaceEnrichment(kind, record) {
    const key = placeEnrichRecordKey(kind, record);
    const hit = readPlaceEnrichCacheStore()[key];
    return hit?.enriched ? hit : null;
  }

  function setCachedPlaceEnrichment(kind, record, data) {
    const key = placeEnrichRecordKey(kind, record);
    if (data?.enriched) {
      placeEnrichSessionMiss.delete(key);
      const store = readPlaceEnrichCacheStore();
      store[key] = data;
      writePlaceEnrichCacheStore(store);
      return;
    }
    if (data?.reason === 'not_found') {
      placeEnrichSessionMiss.add(key);
    }
  }

  async function fetchPlaceEnrichmentFromApi(kind, record) {
    const resp = await fetch('/api/places-enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        name: record.name,
        address: record.address || record.meetupAddress || '',
        city: record.city || '',
        lat: record.lat,
        lng: record.lng
      })
    });
    if (!resp.ok) return { enriched: false, reason: 'http_error' };
    return resp.json();
  }

  function requestPlaceEnrichment(kind, record, onReady) {
    const key = placeEnrichRecordKey(kind, record);
    const cached = getCachedPlaceEnrichment(kind, record);
    if (cached) {
      onReady(cached);
      return;
    }
    if (placeEnrichSessionMiss.has(key)) {
      onReady({ enriched: false, reason: 'not_found' });
      return;
    }
    if (placeEnrichInflight.has(key)) {
      placeEnrichInflight.get(key).then(onReady);
      return;
    }
    const pending = fetchPlaceEnrichmentFromApi(kind, record)
      .then(data => {
        setCachedPlaceEnrichment(kind, record, data);
        placeEnrichInflight.delete(key);
        return data;
      })
      .catch(() => {
        placeEnrichInflight.delete(key);
        return { enriched: false, reason: 'network_error' };
      });
    placeEnrichInflight.set(key, pending);
    pending.then(onReady);
  }

  function formatReviewCount(count) {
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(n);
  }

  function buildCardRating(enrichment) {
    const rating = Number(enrichment?.rating);
    if (!Number.isFinite(rating)) return null;
    const countText = formatReviewCount(enrichment.reviewCount);
    return el('div', { class: 'card-rating' },
      el('span', { class: 'rating-star', 'aria-hidden': 'true' }, '★'),
      el('span', null, rating.toFixed(1)),
      countText ? el('span', { class: 'rating-count' }, `(${countText} reviews)`) : null
    );
  }

  function fmtTicketDate(iso, time) {
    if (!iso) return time || '';
    const d = new Date(iso + 'T12:00:00');
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayMonth = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const parts = [`${weekday} ${dayMonth}`];
    if (time) parts.push(time);
    return parts.join(' · ');
  }

  function hotelCardMetaParts(h) {
    const nightsText = h.nights === 1 ? '1 night' : `${h.nights} nights`;
    const parts = [];
    if (h.city) parts.push(h.city);
    if (h.startDate) parts.push(`${nightsText} from ${fmtDate(h.startDate)}`);
    else if (h.nights) parts.push(nightsText);
    return parts;
  }

  function buildCardImage(photoUrl, alt, className) {
    const img = el('img', {
      class: className || 'card-image',
      src: photoUrl,
      alt: alt || '',
      loading: 'lazy',
      decoding: 'async'
    });
    return img;
  }

  function buildPhotoCarousel(photoUrls, alt) {
    if (!Array.isArray(photoUrls) || photoUrls.length === 0) return null;
    
    const state = { currentIndex: 0 };
    const carousel = el('div', { class: 'photo-carousel' });
    const track = el('div', { class: 'photo-carousel-track' });
    
    photoUrls.forEach((url, i) => {
      const img = el('img', {
        class: 'hero-photo',
        src: url,
        alt: alt || '',
        loading: i === 0 ? 'eager' : 'lazy',
        decoding: 'async'
      });
      track.appendChild(img);
    });
    
    carousel.appendChild(track);
    
    if (photoUrls.length > 1) {
      const indicators = el('div', { class: 'photo-indicators' });
      
      let touchStartX = 0;
      let touchCurrentX = 0;
      let isDragging = false;
      
      const updateCarousel = (index) => {
        state.currentIndex = index;
        track.style.transform = `translateX(-${index * 100}%)`;
        indicators.querySelectorAll('.photo-dot').forEach((dot, i) => {
          dot.classList.toggle('active', i === index);
        });
      };
      
      photoUrls.forEach((_, i) => {
        const dot = el('div', { 
          class: 'photo-dot' + (i === 0 ? ' active' : ''),
          'data-index': i
        });
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          updateCarousel(i);
        });
        indicators.appendChild(dot);
      });
      carousel.appendChild(indicators);
      
      carousel.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchCurrentX = touchStartX;
        isDragging = true;
        track.style.transition = 'none';
      });
      
      carousel.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        touchCurrentX = e.touches[0].clientX;
        const diff = touchCurrentX - touchStartX;
        const currentOffset = -state.currentIndex * carousel.offsetWidth;
        track.style.transform = `translateX(${currentOffset + diff}px)`;
      });
      
      carousel.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        track.style.transition = 'transform 0.3s ease-out';
        
        const diff = touchCurrentX - touchStartX;
        const threshold = carousel.offsetWidth * 0.2;
        
        if (diff < -threshold && state.currentIndex < photoUrls.length - 1) {
          updateCarousel(state.currentIndex + 1);
        } else if (diff > threshold && state.currentIndex > 0) {
          updateCarousel(state.currentIndex - 1);
        } else {
          updateCarousel(state.currentIndex);
        }
      });
    }
    
    return carousel;
  }

  function mountHotelCardContent(card, h, enrichment, onPhotoError) {
    card.replaceChildren();
    const metaText = hotelCardMetaParts(h).join(' · ');
    const hasPhoto = !!enrichment?.photoUrl;

    card.classList.toggle('hotel-card--airbnb', hasPhoto);
    card.classList.toggle('hotel-card--fallback', !hasPhoto);

    if (hasPhoto) {
      const imageWrap = el('div', { class: 'card-image-wrap' });
      const img = buildCardImage(enrichment.photoUrl, h.name);
      if (onPhotoError) img.addEventListener('error', onPhotoError, { once: true });
      imageWrap.appendChild(img);
      if (metaText) {
        imageWrap.appendChild(el('div', { class: 'hotel-meta-overlay' }, metaText));
      }
      card.appendChild(imageWrap);
      const body = el('div', { class: 'card-content' },
        el('div', { class: 'hc-name' }, h.name)
      );
      const rating = buildCardRating(enrichment);
      if (rating) body.appendChild(rating);
      card.appendChild(body);
      return;
    }

    const iconRail = el('div', { class: 'card-fallback-rail', 'aria-hidden': 'true' }, '🏨');
    const body = el('div', { class: 'card-content' },
      el('div', { class: 'hc-name' }, h.name),
      metaText ? el('div', { class: 'hc-meta hc-meta--plain' }, metaText) : null
    );
    card.appendChild(el('div', { class: 'card-fallback-row' }, iconRail, body));
  }

  function mountEventCardContent(card, ev, enrichment, onPhotoError) {
    card.replaceChildren();
    const hasPhoto = !!enrichment?.photoUrl;
    const ticketWhen = fmtTicketDate(ev.date, ev.time);

    card.classList.toggle('event-card--ticket', !hasPhoto);
    card.classList.toggle('event-card--fallback', !hasPhoto);
    card.classList.toggle('event-card--airbnb', hasPhoto);

    if (hasPhoto) {
      const imageWrap = el('div', { class: 'card-image-wrap' });
      const img = buildCardImage(enrichment.photoUrl, ev.name);
      if (onPhotoError) img.addEventListener('error', onPhotoError, { once: true });
      imageWrap.appendChild(img);
      if (ticketWhen) {
        imageWrap.appendChild(el('div', { class: 'hotel-meta-overlay' }, ticketWhen));
      }
      card.appendChild(imageWrap);

      const bodyChildren = [
        el('div', { class: 'ec-name' }, ev.name)
      ];
      const rating = buildCardRating(enrichment);
      if (rating) bodyChildren.push(rating);
      card.appendChild(el('div', { class: 'card-content' }, ...bodyChildren));
      return;
    }

    const fallbackBody = [
      el('div', { class: 'ec-name' }, ev.name)
    ];
    if (ticketWhen) {
      fallbackBody.push(el('div', { class: 'ec-meta ec-meta--plain' }, ticketWhen));
    }

    const iconRail = el('div', { class: 'card-fallback-rail', 'aria-hidden': 'true' }, '🎟️');
    card.appendChild(el('div', { class: 'card-fallback-row' },
      iconRail,
      el('div', { class: 'card-content' }, ...fallbackBody)
    ));
  }

  function buildHotelCard(h, day){
    const metaParts = hotelCardMetaParts(h);
    const enrichment = getCachedPlaceEnrichment('hotel', h);
    const card = el('div', {
      class: 'hotel-card',
      role: 'button',
      tabindex: '0',
      'aria-label': `${h.name}, ${metaParts.join(', ')}`
    });

    const onPhotoError = () => {
      mountHotelCardContent(card, h, { ...enrichment, photoUrl: null });
    };
    mountHotelCardContent(card, h, enrichment, onPhotoError);

    if (!enrichment?.photoUrl) {
      requestPlaceEnrichment('hotel', h, data => {
        if (!card.isConnected) return;
        if (data?.photoUrl) {
          mountHotelCardContent(card, h, data, onPhotoError);
        }
      });
    }

    attachScrollSafeTap(card, () => openHotelSheet(h, day));
    return card;
  }

  const EVENT_PROVIDERS = ['Klook', 'GetYourGuide', 'Viator', 'Direct', 'Other'];

  function parseClockTimeSeconds(str){
    if (!str) return null;
    const m = String(str).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 3600 + min * 60;
  }

  function eventTimeOrder(t){
    return parseClockTimeSeconds(t) ?? 99999;
  }

  function formatEventTimeRange(ev){
    if (ev.time && ev.endTime) return `${ev.time} – ${ev.endTime}`;
    return ev.time || ev.endTime || '';
  }

  function eventsForDay(day){
    return (D.events || [])
      .filter(e => e.date === day.date)
      .sort((a, b) => eventTimeOrder(a.time) - eventTimeOrder(b.time) || a.name.localeCompare(b.name));
  }

  function eventCardMeta(ev){
    const parts = [];
    if (ev.date) parts.push(fmtDate(ev.date));
    if (ev.time) parts.push(ev.time);
    if (ev.provider) parts.push(ev.provider);
    return parts.join(' · ') || 'Ticket';
  }

  function buildEventCard(ev, day){
    const card = el('div', {
      class: 'event-card',
      role: 'button',
      tabindex: '0',
      'aria-label': `${ev.name}, ${eventCardMeta(ev)}`
    });

    const enrichment = getCachedPlaceEnrichment('event', ev);
    const onPhotoError = () => {
      mountEventCardContent(card, ev, { ...enrichment, photoUrl: null });
    };
    mountEventCardContent(card, ev, enrichment, onPhotoError);

    if (!enrichment?.photoUrl) {
      requestPlaceEnrichment('event', ev, data => {
        if (!card.isConnected) return;
        if (data?.photoUrl) {
          mountEventCardContent(card, ev, data, onPhotoError);
        }
      });
    }

    attachScrollSafeTap(card, () => openEventSheet(ev, day));
    return card;
  }

  const CAR_RENTAL_PROVIDERS = ['Priceline', 'Direct', 'Other', 'Hertz', 'Enterprise', 'Avis', 'Budget', 'National', 'Alamo', 'Dollar', 'Thrifty', 'Sixt', 'Europcar'];

  function carRentalsForDay(day){
    return (D.carRentals || [])
      .filter(cr => cr.pickupDate === day.date)
      .sort((a, b) => eventTimeOrder(a.pickupTime) - eventTimeOrder(b.pickupTime));
  }

  function carRentalTitle(cr){
    return cr.name || cr.provider || cr.carType || 'Car rental';
  }

  function carRentalTimeRange(cr){
    if (cr.pickupTime && cr.returnTime) return `${cr.pickupTime} – ${cr.returnTime}`;
    return cr.pickupTime || cr.returnTime || '';
  }

  function carRentalRoute(cr){
    const pickup = (cr.address || '').split(',')[0].trim();
    const ret = (cr.returnAddress || '').split(',')[0].trim();
    if (pickup && ret && pickup !== ret) return `${pickup} → ${ret}`;
    return pickup || ret || '';
  }

  function carRentalCardMeta(cr){
    const parts = [];
    if (cr.pickupDate) parts.push(fmtDate(cr.pickupDate));
    if (cr.pickupTime) parts.push(cr.pickupTime);
    if (cr.carType) parts.push(cr.carType);
    return parts.join(' · ') || 'Car rental';
  }

  function buildCarRentalCard(cr, day){
    const card = el('div', {
      class: 'car-rental-card',
      role: 'button',
      tabindex: '0',
      'aria-label': `${carRentalTitle(cr)}, ${carRentalCardMeta(cr)}`
    },
      el('div', { class: 'card-fallback-row' },
        el('div', { class: 'card-fallback-rail', 'aria-hidden': 'true' }, '🚗'),
        el('div', { class: 'card-content' },
          el('div', { class: 'crc-name' }, carRentalTitle(cr)),
          el('div', { class: 'crc-meta crc-meta--plain' }, carRentalCardMeta(cr))
        )
      )
    );
    attachScrollSafeTap(card, () => openCarRentalSheet(cr, day));
    return card;
  }

  function isCarRentalInKorea(cr, day){
    if (day?.country === 'KR') return true;
    if (day?.country === 'JP') return false;
    const lat = normalizeCoord(cr.lat);
    const lng = normalizeCoord(cr.lng);
    if (lat == null || lng == null) return false;
    return lat >= 33 && lat <= 39.6 && lng >= 124.5 && lng <= 132.1;
  }

  function buildCarRentalDirectionsUrl(cr, day){
    const lat = normalizeCoord(cr.lat);
    const lng = normalizeCoord(cr.lng);
    if (lat != null && lng != null) {
      return buildDirectionsUrlForPoint({
        lat, lng, name: carRentalTitle(cr), inKorea: isCarRentalInKorea(cr, day)
      });
    }
    const addr = (cr.address || '').trim();
    if (!addr) return null;
    if (isCarRentalInKorea(cr, day)) {
      return `https://map.naver.com/v5/search/${encodeURIComponent(addr)}`;
    }
    return `https://maps.google.com/?q=${encodeURIComponent(addr)}`;
  }

  function isEventInKorea(ev, day){
    if (day?.country === 'KR') return true;
    if (day?.country === 'JP') return false;
    const addr = (ev.meetupAddress || '').toLowerCase();
    if (addr.includes('seoul') || addr.includes('korea')) return true;
    if (addr.includes('tokyo') || addr.includes('japan') || addr.includes('sapporo')) return false;
    return day?.country === 'KR';
  }

  function buildEventDirectionsUrl(ev, day){
    const lat = normalizeCoord(ev.lat);
    const lng = normalizeCoord(ev.lng);
    if (lat != null && lng != null) {
      return buildDirectionsUrlForPoint({
        lat, lng, name: ev.name, inKorea: isEventInKorea(ev, day)
      });
    }
    const addr = (ev.meetupAddress || '').trim();
    if (!addr) return null;
    if (isEventInKorea(ev, day)) {
      return `https://map.naver.com/v5/search/${encodeURIComponent(addr)}`;
    }
    return `https://maps.google.com/?q=${encodeURIComponent(addr)}`;
  }

  function formatEventCost(cost){
    if (cost == null || cost === '') return '';
    const n = Number(cost);
    if (!Number.isFinite(n)) return '';
    return `$${n.toFixed(n % 1 ? 2 : 0)}`;
  }

  function isHotelInKorea(h, day){
    if (day?.country === 'KR') return true;
    if (day?.country === 'JP') return false;
    const lat = normalizeCoord(h.lat);
    const lng = normalizeCoord(h.lng);
    if (lat == null || lng == null) return false;
    return lat >= 33 && lat <= 39.6 && lng >= 124.5 && lng <= 132.1;
  }

  function buildDirectionsUrlForPoint({ lat, lng, name, inKorea }){
    if (lat == null || lng == null) return '#';
    if (inKorea) {
      const label = encodeURIComponent((name || 'Destination').trim());
      return `https://map.naver.com/v5/directions/-/${lng},${lat},${label}/walking`;
    }
    return `https://maps.google.com/?saddr=My+Location&daddr=${lat},${lng}`;
  }

  function buildHotelDirectionsUrl(h, day){
    const lat = normalizeCoord(h.lat);
    const lng = normalizeCoord(h.lng);
    if (lat != null && lng != null) {
      return buildDirectionsUrlForPoint({
        lat, lng, name: h.name, inKorea: isHotelInKorea(h, day)
      });
    }
    if (h.address) {
      return `https://maps.google.com/?q=${encodeURIComponent(h.address.trim())}`;
    }
    return null;
  }

  function isActivityInKorea(a){
    if (!a) return false;
    if (!isUnscheduledDay(a.day)) {
      const country = D.byDay[a.day]?.country;
      if (country === 'KR') return true;
      if (country === 'JP') return false;
    }
    const lat = normalizeCoord(a.lat);
    const lng = normalizeCoord(a.lng);
    if (lat == null || lng == null) return false;
    // South Korea approximate bounding box (fallback for unscheduled / missing country)
    return lat >= 33 && lat <= 39.6 && lng >= 124.5 && lng <= 132.1;
  }

  function buildDirectionsUrl(a){
    return buildDirectionsUrlForPoint({
      lat: normalizeCoord(a.lat),
      lng: normalizeCoord(a.lng),
      name: a.name,
      inKorea: isActivityInKorea(a)
    });
  }

  function buildActivityRow(a, day){
    const id = a.id;
    const checked = checkedActs.has(id);
    const row = el('div', {
      class: 'act-row' + (checked ? ' done' : ''),
      style: { '--day-accent': day.color },
      'data-id': id
    },
      el('div', { class: 'act-emoji' }, catEmoji(a.cat))
    );

    const actBody = el('div', { class: 'act-body' },
      el('div', { class: 'act-name' }, a.name),
      el('div', { class: 'act-meta' }, a.cat)
    );
    attachScrollSafeTap(actBody, (e) => {
      e.stopPropagation();
      openSheet(a);
    });

    const checkbox = el('div', { class: 'checkbox' }, svgCheck());
    attachScrollSafeTap(checkbox, (e) => {
      e.stopPropagation();
      toggleAct(id, row);
    });

    row.appendChild(actBody);
    row.appendChild(checkbox);
    return row;
  }

  function svgCheck(){
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS(ns, 'polyline');
    p.setAttribute('points', '4 12 10 18 20 6');
    svg.appendChild(p);
    return svg;
  }

  function toggleAct(id, row){
    if (checkedActs.has(id)) { checkedActs.delete(id); row.classList.remove('done'); }
    else { checkedActs.add(id); row.classList.add('done'); }
    saveSet(STORAGE.activityChecks, checkedActs);
  }

  function buildDayNav(day){
    const wrap = el('div', { class: 'day-nav' });
    const chev = el('div', { class: 'chevrons' });
    const prev = el('button', { class: 'chev', disabled: day.n === 1 ? '' : null, onclick: () => navTo(day.n - 1) }, '‹');
    const next = el('button', { class: 'chev', disabled: day.n === D.days.length ? '' : null, onclick: () => navTo(day.n + 1) }, '›');
    chev.append(prev, next);
    wrap.append(chev);

    const pills = el('div', { class: 'day-pills' });
    D.days.forEach(d => {
      const p = el('button', {
        class: 'day-pill' + (d.n === day.n ? ' active' : ''),
        style: { '--day-accent': d.color },
        onclick: () => navTo(d.n)
      },
        el('span', { class: 'pn' }, 'Day ' + d.n),
        el('span', { class: 'pd' }, shortDate(d.date).replace(' ', '\u00a0'))
      );
      pills.appendChild(p);
    });
    wrap.appendChild(pills);
    return wrap;
  }

  function scrollActiveDayPill(){
    const active = $('#tab-today .day-pill.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function navTo(n, opts = {}){
    if (n < 1 || n > D.days.length) return;
    const old = state.todayDay;
    const forward = n > old;
    state.todayDay = n;

    if (opts.fromSwipe) {
      renderToday();
      const r2 = $('#tab-today .scroll');
      const w = r2.offsetWidth || document.documentElement.clientWidth;
      r2.style.transition = 'none';
      r2.style.transform = `translateX(${forward ? w : -w}px)`;
      r2.style.opacity = '1';
      requestAnimationFrame(() => {
        r2.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease';
        r2.style.transform = 'translateX(0)';
        r2.style.opacity = '1';
        setTimeout(() => { r2.style.transition = ''; }, 340);
      });
      scrollActiveDayPill();
      return;
    }

    const root = $('#tab-today .scroll');
    root.style.transition = 'transform .22s ease, opacity .22s ease';
    root.style.transform = `translateX(${forward ? -20 : 20}px)`;
    root.style.opacity = '0';
    setTimeout(() => {
      renderToday();
      const r2 = $('#tab-today .scroll');
      r2.style.transition = 'none';
      r2.style.transform = `translateX(${forward ? 20 : -20}px)`;
      r2.style.opacity = '0';
      requestAnimationFrame(() => {
        r2.style.transition = 'transform .25s ease, opacity .25s ease';
        r2.style.transform = 'translateX(0)';
        r2.style.opacity = '1';
      });
      scrollActiveDayPill();
    }, 180);
  }

  // ─── Mini-map (Today tab) ─────────────────────────────────────────────────
  function buildMiniMap(day, acts){
    const node = $('#map-mini');
    if (!node) return;
    if (leafletMini) { leafletMini.remove(); leafletMini = null; }

    // Filter out activities without valid coordinates
    const validActs = acts.filter(a => a.lat != null && a.lng != null && !isNaN(a.lat) && !isNaN(a.lng));
    if (validActs.length === 0) return; // No valid coordinates, don't show map

    let center = activityCenter(day.n);
    // If center is invalid, use first valid activity
    if (!center || center.lat == null || center.lng == null) {
      if (validActs.length > 0) {
        center = { lat: validActs[0].lat, lng: validActs[0].lng };
      } else {
        return; // Can't show map without coordinates
      }
    }
    
    leafletMini = L.map(node, {
      center: [center.lat, center.lng], zoom: 12,
      zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, tap: false
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 18, subdomains: 'abcd'
    }).addTo(leafletMini);

    const markers = [];
    validActs.forEach(a => {
      const m = L.marker([a.lat, a.lng], { icon: pinIcon(a.cat, day.color) }).addTo(leafletMini);
      markers.push(m);
    });
    if (markers.length > 1){
      const g = L.featureGroup(markers);
      leafletMini.fitBounds(g.getBounds(), { padding: [20,20], maxZoom: 13 });
    }
  }

  // ─── Render: MAP tab ──────────────────────────────────────────────────────
  function renderMapTab(){
    requestMapGeolocation();
    renderFilterBar('map');
    buildRegionSelector(); // Dynamically build region selector based on trip data
    const node = $('#map-full');
    // Hide the map container until it's fully built + sized, so the user
    // never sees the brief mid-render position jump (initial center → setView,
    // or invalidateSize fixing tile positions after the pane gains size).
    if (node) node.classList.add('is-settling');
    // Wait two RAFs so the now-active tab pane has a final laid-out size
    // before Leaflet measures the container.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const refitAfterResize = buildFullMap();
      if (leafletFull) {
        leafletFull.invalidateSize({ animate: false, pan: false });
        if (refitAfterResize) snapFullMapToPins();
      }
      // One more frame lets tiles position with the corrected size before reveal.
      requestAnimationFrame(() => {
        const n = $('#map-full');
        if (n) n.classList.remove('is-settling');
      });
    }));
  }
  
  function isFlightOrTransit(a){
    const cat = (a.cat || '').trim().toLowerCase();
    return /flight|transit/.test(cat);
  }

  function activitiesForDay(dayNum){
    return D.dayActivities?.[dayNum] || (D.activities || []).filter(a => a.day === dayNum);
  }

  // A destination day has real stops — not just a departure/connection airport.
  function isDestinationDay(day){
    if (!day) return false;
    return activitiesForDay(day.n).some(a =>
      a.lat != null && a.lng != null && !isNaN(a.lat) && !isNaN(a.lng) && !isFlightOrTransit(a)
    );
  }

  function activityInMapRegion(a, region){
    if (!region) return true;
    if (isFlightOrTransit(a)) return false;
    if (!hasMapCoordinates(a)) return false;
    return activityCityKey(a) === region;
  }

  function buildRegionSelector(){
    const segmented = $('#segmented');
    if (!segmented) return;
    
    // Safety check: ensure we have data
    if (!D || !D.byDay || !D.activities) {
      console.warn('🗺️ buildRegionSelector: No trip data available');
      segmented.style.display = 'none';
      return;
    }

    const cities = getDestinationCities();
    console.log('🗺️ Destination cities:', cities.map(c => c.label));

    // If only one city or no cities, hide the selector
    if (cities.length <= 1) {
      segmented.style.display = 'none';
      if (cities.length === 1) {
        state.region = cities[0].key;
      } else {
        state.region = null; // Show all
      }
      return;
    }
    
    // Multiple cities - show selector
    segmented.style.display = 'flex';
    segmented.innerHTML = '';
    
    cities.forEach((city, index) => {
      const btn = el('button', {
        'data-region': city.key,
        class: index === 0 ? 'active' : '',
        onclick: () => {
          state.region = city.key;
          buildFullMap();
        }
      }, city.label);
      segmented.appendChild(btn);
    });
    
    if (!state.region || !cities.some(c => c.key === state.region)) {
      state.region = cities[0].key;
    }
    
    console.log('🗺️ buildRegionSelector set region to:', state.region);
  }
  let fullMapMarkers = [];
  let lastMapRegion = null;

  function snapFullMapToPins(){
    if (!leafletFull) return false;
    const pinMarkers = fullMapMarkers.filter(m => m._icon && m._icon.querySelector('.pin'));
    if (!pinMarkers.length) return false;
    const g = L.featureGroup(pinMarkers);
    leafletFull.fitBounds(g.getBounds(), { padding: [60, 30], maxZoom: 13, animate: false });
    return true;
  }

  function buildFullMap(){
    const node = $('#map-full');
    if (!node) return;
    
    // Safety check: ensure we have data
    if (!D || !D.activities || !D.byDay) {
      console.warn('🗺️ buildFullMap: No trip data available');
      return;
    }

    let region = state.region;
    
    // If no region is set and we have a selector, default to first region
    if (!region) {
      const segmented = $('#segmented');
      const firstBtn = segmented && segmented.querySelector('button');
      if (firstBtn) {
        region = firstBtn.dataset.region;
        state.region = region;
        console.log('🗺️ buildFullMap defaulting to first region:', region);
      }
    }
    
    console.log('🗺️ buildFullMap rendering with region:', region);
    
    const fa = filteredActivities({ forMap: true });
    let inRegion = region ? fa.filter(a => activityInMapRegion(a, region)) : fa.filter(hasMapCoordinates);
    
    console.log(`🗺️ Showing ${inRegion.length} activities on map for region:`, region);

    // Calculate default center and zoom from activities
    let defaultCenter, defaultZoom;
    
    // If user is near activities, center on them
    if (state.location && inRegion.length > 0) {
      const nearbyActivities = inRegion.filter(a => {
        const lat = normalizeCoord(a.lat);
        const lng = normalizeCoord(a.lng);
        if (lat == null || lng == null) return false;
        const dist = Math.sqrt(
          Math.pow(lat - state.location.lat, 2) +
          Math.pow(lng - state.location.lng, 2)
        );
        return dist < 1; // Within ~1 degree (~100km)
      });
      
      if (nearbyActivities.length > 0) {
        defaultCenter = [state.location.lat, state.location.lng];
        defaultZoom = 13;
      }
    }
    
    // Otherwise, calculate center from activities
    if (!defaultCenter && inRegion.length > 0) {
      const lats = inRegion.map(a => normalizeCoord(a.lat));
      const lngs = inRegion.map(a => normalizeCoord(a.lng));
      const avgLat = lats.reduce((sum, lat) => sum + lat, 0) / lats.length;
      const avgLng = lngs.reduce((sum, lng) => sum + lng, 0) / lngs.length;
      defaultCenter = [avgLat, avgLng];
      defaultZoom = 11;
    } else {
      // Fallback: center of world
      defaultCenter = [20, 0];
      defaultZoom = 2;
    }

    if (!leafletFull){
      try {
        leafletFull = L.map(node, {
          center: defaultCenter, zoom: defaultZoom,
          zoomControl: false, attributionControl: true,
          fadeAnimation: false, zoomAnimation: false
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 18, subdomains: 'abcd',
          attribution: '© OpenStreetMap, © CARTO'
        }).addTo(leafletFull);
        leafletFull.invalidateSize({ animate: false, pan: false });
      } catch (e) {
        console.error('🗺️ Error initializing map:', e);
        return;
      }
    } else {
      try {
        // Make sure Leaflet knows the current container size BEFORE we change
        // the view or add markers — otherwise a later invalidateSize() can
        // shift tiles visibly.
        leafletFull.invalidateSize({ animate: false, pan: false });
      } catch (e) {
        console.error('🗺️ Error invalidating map size:', e);
        // Map might be in a bad state, try to reinitialize
        leafletFull = null;
        buildFullMap();
        return;
      }
    }

    try {
      fullMapMarkers.forEach(m => leafletFull.removeLayer(m));
      fullMapMarkers = [];

      inRegion.forEach(a => {
        const lat = normalizeCoord(a.lat);
        const lng = normalizeCoord(a.lng);
        if (lat == null || lng == null) return;
        const color = dayAccent(a.day);
        const m = L.marker([lat, lng], { icon: pinIcon(a.cat, color) }).addTo(leafletFull);
        m.on('click', () => openSheet(a));
        fullMapMarkers.push(m);
      });
      if (state.location){
        const lm = L.marker([state.location.lat, state.location.lng], { icon: locationIcon() }).addTo(leafletFull);
        fullMapMarkers.push(lm);
      }
    } catch (e) {
      console.error('🗺️ Error adding map markers:', e);
      return;
    }

    const regionChanged = lastMapRegion !== region;
    lastMapRegion = region;
    let refitAfterResize = false;

    try {
      if (anyFilterActive() && inRegion.length){
        // Filtered view: fit bounds to the filtered pins (no animation — we're
        // still inside the "settling" window, the user shouldn't see motion).
        const g = L.featureGroup(fullMapMarkers.filter(m => m._icon && m._icon.querySelector('.pin')));
        if (g.getLayers().length){
          leafletFull.fitBounds(g.getBounds(), { padding: [60, 30], maxZoom: 13, animate: false });
          refitAfterResize = true;
        }
      } else if (regionChanged){
        // Region changed or first load — frame all pins in the region.
        if (!snapFullMapToPins()) {
          leafletFull.setView(defaultCenter, defaultZoom, { animate: false });
        }
        refitAfterResize = true;
      }
    } catch (e) {
      console.error('🗺️ Error adjusting map bounds:', e);
    }

    // segmented active state
    $$('#segmented button').forEach(b => b.classList.toggle('active', b.dataset.region === region));
    return refitAfterResize;
  }

  function renderFilterBar(tab){
    const wrap = $('#filter-bar-' + tab);
    if (!wrap) return;
    wrap.innerHTML = '';
    
    // Right slot: Reset button (if filters active) or Plus button (to add activity)
    let rightSlot;
    if (anyFilterActive()) {
      rightSlot = el('button', { class: 'reset', onclick: resetFilters }, 'Reset');
    } else {
      rightSlot = buildAddActivityButton();
    }
    
    wrap.appendChild(buildLargeTitle(tab === 'map' ? 'Map' : 'Activities', rightSlot));
    wrap.appendChild(buildFilterChipRow(tab));
  }

  function summaryChip(label, active, onclick, icon){
    const c = el('button', { class: 'chip chip-summary' + (active ? ' active' : ''), onclick },
      el('span', { class: 'chip-label' }, ...iconChipParts(icon, label)),
      svgIcon('chevron-down')
    );
    return c;
  }
  function tabIcon(name){
    if (name === 'edit') {
      return el('span', { class: 'tab-icon tab-icon--edit', 'aria-hidden': 'true' }, '✎');
    }
    const icons = {
      'chev-left': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
      'chev-right': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
      'close': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      'plus': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    };
    const wrap = el('span', { class: 'tab-icon', 'aria-hidden': 'true' });
    wrap.innerHTML = icons[name] || '';
    return wrap;
  }

  function svgIcon(name){
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    if (name === 'search'){
      const c = document.createElementNS(ns,'circle'); c.setAttribute('cx','11'); c.setAttribute('cy','11'); c.setAttribute('r','7'); svg.appendChild(c);
      const l = document.createElementNS(ns,'line'); l.setAttribute('x1','20'); l.setAttribute('y1','20'); l.setAttribute('x2','16.5'); l.setAttribute('y2','16.5'); svg.appendChild(l);
    } else if (name === 'chevron-down'){
      svg.setAttribute('width', '11'); svg.setAttribute('height', '11');
      const p = document.createElementNS(ns,'polyline'); p.setAttribute('points', '6 9 12 15 18 9'); svg.appendChild(p);
    } else if (name === 'calendar'){
      svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', '3'); rect.setAttribute('y', '4');
      rect.setAttribute('width', '18'); rect.setAttribute('height', '18');
      rect.setAttribute('rx', '2');
      svg.appendChild(rect);
      const line1 = document.createElementNS(ns, 'line');
      line1.setAttribute('x1', '16'); line1.setAttribute('y1', '2');
      line1.setAttribute('x2', '16'); line1.setAttribute('y2', '6');
      svg.appendChild(line1);
      const line2 = document.createElementNS(ns, 'line');
      line2.setAttribute('x1', '8'); line2.setAttribute('y1', '2');
      line2.setAttribute('x2', '8'); line2.setAttribute('y2', '6');
      svg.appendChild(line2);
      const line3 = document.createElementNS(ns, 'line');
      line3.setAttribute('x1', '3'); line3.setAttribute('y1', '10');
      line3.setAttribute('x2', '21'); line3.setAttribute('y2', '10');
      svg.appendChild(line3);
    }
    return svg;
  }

  // ─── Filter tray (bottom sheet for picking a filter value) ──────────────
  function openFilterTray(kind){
    const tray = $('#filter-tray');
    const backdrop = $('#filter-tray-backdrop');
    const prevKind = state.filterTray;
    const prevList = tray.querySelector('.tray-list');
    const savedScroll = (prevKind === kind && prevList) ? prevList.scrollTop : 0;
    state.filterTray = kind;
    tray.innerHTML = '';

    tray.appendChild(el('div', { class: 'handle' }));
    tray.appendChild(buildSheetCloseButton(closeFilterTray));

    let title, options, currentArray, onPick;
    if (kind === 'day'){
      title = 'Filter by day';
      currentArray = filterState.day;
      options = [{ value: null, label: 'All Days', sub: 'Show every day' }]
        .concat(hasUnscheduledActivities() ? [{
          value: UNSCHEDULED_DAY,
          label: 'Unscheduled',
          sub: 'Not on itinerary yet'
        }] : [])
        .concat(D.days.map(d => ({
          value: d.n,
          label: `Day ${d.n}`,
          sub: `${shortDate(d.date)} \u00b7 ${d.loc} \u00b7 ${d.title}`,
          color: d.color
        })));
      onPick = (v) => {
        if (v === null) {
          filterState.day = [];
        } else {
          const idx = filterState.day.indexOf(v);
          if (idx >= 0) filterState.day.splice(idx, 1);
          else filterState.day.push(v);
        }
        openFilterTray(kind);
        syncFilters();
      };
    } else if (kind === 'time'){
      title = 'Filter by time of day';
      currentArray = filterState.timeOfDay;
      options = [{ value: null, label: 'All Times', sub: 'Morning through Late Night' }]
        .concat(D.timesOfDay.map(t => ({ value: t.id, label: t.id, sub: '', emoji: t.emoji })));
      onPick = (v) => {
        if (v === null) {
          filterState.timeOfDay = [];
        } else {
          const idx = filterState.timeOfDay.indexOf(v);
          if (idx >= 0) filterState.timeOfDay.splice(idx, 1);
          else filterState.timeOfDay.push(v);
        }
        openFilterTray(kind);
        syncFilters();
      };
    } else if (kind === 'type'){
      title = 'Filter by category';
      currentArray = filterState.category;
      options = [{ value: null, label: 'All Types', sub: 'Every category' }]
        .concat(Object.values(D.categories).map(c => ({ value: c.label, label: c.label, sub: '', emoji: c.emoji })));
      onPick = (v) => {
        if (v === null) {
          filterState.category = [];
        } else {
          const idx = filterState.category.indexOf(v);
          if (idx >= 0) filterState.category.splice(idx, 1);
          else filterState.category.push(v);
        }
        openFilterTray(kind);
        syncFilters();
      };
    }

    tray.appendChild(el('div', { class: 'tray-title' }, title));
    const list = el('div', { class: 'tray-list' });
    options.forEach(opt => {
      const selected = opt.value === null ? currentArray.length === 0 : currentArray.includes(opt.value);
      // One leader column: colored dot OR emoji OR bullet — all align in the
      // same horizontal position regardless of which kind of filter we're picking.
      let leader;
      if (opt.color)        leader = el('span', { class: 'tray-leader tray-dot', style: { background: opt.color } });
      else if (opt.emoji)   leader = el('span', { class: 'tray-leader tray-emoji' }, opt.emoji);
      else if (opt.value == null) leader = el('span', { class: 'tray-leader tray-emoji' }, '\u2022');
      else                  leader = el('span', { class: 'tray-leader' });
      const row = el('button', { class: 'tray-row' + (selected ? ' selected' : ''), onclick: () => onPick(opt.value) },
        leader,
        el('div', { class: 'tray-text' },
          el('div', { class: 'tray-label' }, opt.label),
          opt.sub ? el('div', { class: 'tray-sub' }, opt.sub) : null
        ),
        selected ? (() => {
          const c = el('span', { class: 'tray-check' });
          c.appendChild(svgCheck());
          return c;
        })() : el('span')
      );
      list.appendChild(row);
    });
    tray.appendChild(list);
    if (savedScroll) list.scrollTop = savedScroll;
    tray.appendChild(el('div', { class: 'bottom-pad' }));

    backdrop.classList.add('open');
    requestAnimationFrame(() => tray.classList.add('open'));
  }
  function closeFilterTray(){
    state.filterTray = null;
    state.pickTray = null;
    clearSheetDragStyles($('#filter-tray'));
    $('#filter-tray').classList.remove('open');
    $('#filter-tray-backdrop').classList.remove('open');
  }

  function openPickTray({ title, options, value, onPick }){
    state.pickTray = true;
    state.filterTray = null;
    const tray = $('#filter-tray');
    const backdrop = $('#filter-tray-backdrop');
    tray.innerHTML = '';

    tray.appendChild(el('div', { class: 'handle' }));
    tray.appendChild(buildSheetCloseButton(closeFilterTray));
    tray.appendChild(el('div', { class: 'tray-title' }, title));

    const list = el('div', { class: 'tray-list' });
    options.forEach(opt => {
      const selected = opt.value === value;
      let leader;
      if (opt.color)      leader = el('span', { class: 'tray-leader tray-dot', style: { background: opt.color } });
      else if (opt.emoji) leader = el('span', { class: 'tray-leader tray-emoji' }, opt.emoji);
      else                leader = el('span', { class: 'tray-leader tray-emoji' }, '\u2022');
      list.appendChild(el('button', {
        class: 'tray-row' + (selected ? ' selected' : ''),
        onclick: () => {
          onPick(opt.value);
          closeFilterTray();
        }
      },
        leader,
        el('div', { class: 'tray-text' },
          el('div', { class: 'tray-label' }, opt.label),
          opt.sub ? el('div', { class: 'tray-sub' }, opt.sub) : null
        ),
        selected ? (() => {
          const c = el('span', { class: 'tray-check' });
          c.appendChild(svgCheck());
          return c;
        })() : el('span')
      ));
    });
    tray.appendChild(list);
    tray.appendChild(el('div', { class: 'bottom-pad' }));

    backdrop.classList.add('open');
    requestAnimationFrame(() => tray.classList.add('open'));
  }

  let syncDebounce = null;
  function debouncedSync(){
    // Triggered by typing in the search input — do NOT re-render the filter
    // bar (that would destroy the input and reset the caret).
    clearTimeout(syncDebounce);
    syncDebounce = setTimeout(() => {
      if (state.tab === 'map') buildFullMap();
      if (state.tab === 'activities') renderActivitiesList(/*skipBar*/ true);
    }, 180);
  }
  function resetFilters(){
    filterState.day = [];
    filterState.timeOfDay = [];
    filterState.category = [];
    filterState.search = '';
    state.searching = false;
    syncFilters();
  }
  function focusSearchInput(){
    const barId = state.tab === 'activities' ? '#filter-bar-activities' : '#filter-bar-map';
    const input = document.querySelector(`${barId} .search-row input`);
    if (input) input.focus({ preventScroll: true });
  }
  function syncFilters(opts){
    // Always re-render the filter bar (and Activities list header) so chip
    // states, Reset button, and search-mode toggle stay in sync. Typing in
    // the search input bypasses this via debouncedSync().
    renderFilterBar('map');
    if (state.tab === 'activities' && opts && opts.focusSearch) {
      renderActivitiesFilterBar();
    }
    if (opts && opts.focusSearch) focusSearchInput();
    if (state.tab === 'map') buildFullMap();
    if (state.tab === 'activities') {
      renderActivitiesList(!!(opts && opts.focusSearch));
    }
  }

  // ─── Render: ACTIVITIES tab ───────────────────────────────────────────────
  function renderActivitiesTab(){
    renderActivitiesList();
  }

  function renderActivitiesFilterBar(){
    const bar = $('#filter-bar-activities');
    bar.innerHTML = '';
    let rightSlot;
    if (anyFilterActive()) {
      rightSlot = el('button', { class: 'reset', onclick: resetFilters }, 'Reset');
    } else {
      rightSlot = buildAddActivityButton();
    }
    bar.appendChild(buildLargeTitle('Activities', rightSlot));
    bar.appendChild(buildFilterChipRow('activities'));
  }
  function renderActivitiesList(skipBar){
    if (!skipBar) renderActivitiesFilterBar();

    const root = $('#activities-list');
    root.innerHTML = '';

    const fa = filteredActivities();
    if (!fa.length){
      const pieces = [];
      if (filterState.day.length) pieces.push(filterState.day.length === 1 ? dayFilterLabel(filterState.day[0]) : `${filterState.day.length} days`);
      if (filterState.timeOfDay.length) pieces.push(filterState.timeOfDay.length === 1 ? filterState.timeOfDay[0] : `${filterState.timeOfDay.length} times`);
      if (filterState.category.length) pieces.push(filterState.category.length === 1 ? filterState.category[0] : `${filterState.category.length} types`);
      if (filterState.search) pieces.push(`"${filterState.search}"`);
      root.appendChild(el('div', { class: 'empty-state' },
        el('div', { class: 'em' }, 'No activities match.'),
        el('div', { class: 'filters' }, pieces.length ? 'Active filters: ' + pieces.join(' · ') : 'Try adjusting your filters.')
      ));
      return;
    }
    const flat = filterState.day.length || filterState.search;
    if (flat){
      fa.sort(sortActivities).forEach(a => {
        root.appendChild(buildFullRow(a, true));
      });
    } else {
      sortActivityDays([...new Set(fa.map(a => a.day))]).forEach(dn => {
        if (isUnscheduledDay(dn)) {
          root.appendChild(buildUnscheduledDayHeader());
          fa.filter(a => a.day === dn).sort((a, b) => timeOrder(a.time) - timeOrder(b.time) || a.name.localeCompare(b.name)).forEach(a => {
            root.appendChild(buildFullRow(a, false));
          });
          return;
        }
        const d = D.byDay[dn];
        root.appendChild(el('div', { class: 'day-header', style: { '--day-accent': d.color } },
          el('span', { class: 'day-num' }, 'Day ' + d.n),
          el('span', { class: 'day-date' }, shortDate(d.date)),
          el('span', { class: 'day-loc' }, d.loc)
        ));
        fa.filter(a => a.day === dn).sort((a,b) => timeOrder(a.time) - timeOrder(b.time)).forEach(a => {
          root.appendChild(buildFullRow(a, false));
        });
      });
    }
  }

  function buildUnscheduledDayHeader(){
    return el('div', { class: 'day-header day-header-unscheduled', style: { '--day-accent': 'var(--fg-mute)' } },
      el('span', { class: 'day-num' }, 'Unscheduled'),
      el('span', { class: 'day-date' }, 'Add date to include')
    );
  }

  // Build a chip row used in the sticky lt-sticky wrapper (Activities tab) or
  // in the legacy filter-bar (Map tab).
  function buildFilterChipRow(tab){
    const wrap = el('div', { class: 'lt-sticky' });

    if (state.searching){
      const input = el('input', {
        type: 'search',
        placeholder: 'Search activities',
        enterkeyhint: 'search',
        value: filterState.search,
        oninput: (e) => { filterState.search = e.target.value; debouncedSync(); }
      });
      const row = el('div', { class: 'search-row' },
        el('div', { class: 'search' },
          svgIcon('search'),
          input,
          el('button', {
            class: 'search-close',
            'aria-label': 'Close search',
            onclick: () => { state.searching = false; filterState.search = ''; syncFilters(); }
          }, '\u2715')
        )
      );
      wrap.appendChild(row);
      return wrap;
    }

    const chips = el('div', { class: 'chips chips-single' });

    chips.appendChild(el('button', {
      class: 'chip chip-icon',
      'aria-label': 'Search',
      onclick: () => { state.searching = true; syncFilters({ focusSearch: true }); }
    }, svgIcon('search')));

    chips.appendChild(summaryChip(
      filterState.day.length === 0 ? 'All Days' : 
        filterState.day.length === 1 ? dayFilterLabel(filterState.day[0]) :
        `${filterState.day.length} Days`,
      filterState.day.length > 0,
      () => openFilterTray('day')
    ));
    chips.appendChild(summaryChip(
      filterState.timeOfDay.length === 0 ? 'All Times' :
        filterState.timeOfDay.length === 1 ? filterState.timeOfDay[0] :
        `${filterState.timeOfDay.length} Times`,
      filterState.timeOfDay.length > 0,
      () => openFilterTray('time'),
      filterState.timeOfDay.length === 1 ? todEmoji(filterState.timeOfDay[0]) : null
    ));
    chips.appendChild(summaryChip(
      filterState.category.length === 0 ? 'All Types' :
        filterState.category.length === 1 ? filterState.category[0] :
        `${filterState.category.length} Types`,
      filterState.category.length > 0,
      () => openFilterTray('type'),
      filterState.category.length === 1 ? catEmoji(filterState.category[0]) : null
    ));

    wrap.appendChild(chips);
    return wrap;
  }
  function openActivity(a){
    if (isUnscheduledDay(a.day)) openEditActivitySheet(a);
    else openSheet(a);
  }

  function buildFullRow(a, showDayBadge){
    const unscheduled = isUnscheduledDay(a.day);
    const d = unscheduled ? null : D.byDay[a.day];
    const accent = dayAccent(a.day);
    const firstSentence = (a.desc || '').split(/(?<=[.!?])\s/)[0] || '';
    
    // Build metadata text with dots (category first, then time)
    const metaParts = [];
    if (a.category) metaParts.push(a.category);
    if (a.time) metaParts.push(a.time);
    const metaText = metaParts.join(' · ');
    
    const checked = checkedActs.has(a.id);
    const row = el('div', {
      class: 'list-row' + (checked ? ' checked' : ''),
      onclick: (e) => {
        if (e.target.closest('input[type=checkbox]')) return;
        openActivity(a);
      }
    },
      el('label', { class: 'list-check-label' },
        el('input', {
          type: 'checkbox',
          checked,
          onchange: (e) => {
            if (e.target.checked) checkedActs.add(a.id);
            else checkedActs.delete(a.id);
            saveSet(STORAGE.activityChecks, checkedActs);
            e.target.closest('.list-row').classList.toggle('checked', e.target.checked);
          }
        }),
        el('span', { class: 'checkmark' })
      ),
      el('div', { class: 'list-body' },
        el('div', { class: 'list-title' }, a.name),
        firstSentence ? el('div', { class: 'list-desc' }, firstSentence) : null,
        showDayBadge ? el('div', { class: 'list-badges' },
          el('span', {
            class: 'badge day-badge',
            style: { '--day-accent': accent, background: accent }
          }, unscheduled ? 'Unscheduled' : 'Day ' + d.n),
          metaText ? el('span', { class: 'list-meta' }, metaText) : null
        ) : (metaText ? el('div', { class: 'list-meta' }, metaText) : null)
      )
    );
    return row;
  }

  // ─── Bookings Tab ─────────────────────────────────────────────────────────
  function renderBookingsTab(){
    renderBookingsList();
  }

  function renderBookingsFilterBar(){
    const bar = $('#filter-bar-bookings');
    bar.innerHTML = '';
    let rightSlot;
    if (anyBookingsFilterActive()) {
      rightSlot = el('button', { class: 'reset', onclick: resetBookingsFilters }, 'Reset');
    }
    bar.appendChild(buildLargeTitle('Bookings', rightSlot));
    bar.appendChild(buildBookingsFilterChipRow());
  }

  function renderBookingsList(skipBar){
    if (!skipBar) renderBookingsFilterBar();

    const root = $('#bookings-list');
    root.innerHTML = '';

    const fb = filteredBookings();
    if (!fb.length){
      const pieces = [];
      if (bookingsFilterState.type.length) pieces.push(bookingsFilterState.type.length === 1 ? bookingsFilterState.type[0] : `${bookingsFilterState.type.length} types`);
      if (bookingsFilterState.day.length) pieces.push(bookingsFilterState.day.length === 1 ? dayFilterLabel(bookingsFilterState.day[0]) : `${bookingsFilterState.day.length} days`);
      if (bookingsFilterState.search) pieces.push(`"${bookingsFilterState.search}"`);
      root.appendChild(el('div', { class: 'empty-state' },
        el('div', { class: 'em' }, 'No bookings match.'),
        el('div', { class: 'filters' }, pieces.length ? 'Active filters: ' + pieces.join(' · ') : 'Try adjusting your filters.')
      ));
      return;
    }

    // Group by type
    const types = ['Flights', 'Hotels', 'Tickets', 'Rental Cars'];
    types.forEach(type => {
      const items = fb.filter(b => b.type === type).sort(compareBookings);
      if (!items.length) return;

      // Type header
      root.appendChild(el('div', { class: 'booking-type-header', style: { '--type-accent': bookingTypeColor(type) } },
        el('span', { class: 'type-name' }, type)
      ));

      // Cards
      items.forEach((item) => {
        // Attach click handler with navigation context
        const day = D.days?.find(d => d.n === item.dayNum);
        const allBookingsIndex = fb.indexOf(item);
        attachScrollSafeTap(item.card, () => {
          const navContext = {
            bookings: fb,
            currentIndex: allBookingsIndex
          };
          if (item.type === 'Flights') openFlightSheet(item.record, day, navContext);
          else if (item.type === 'Hotels') openHotelSheet(item.record, day, navContext);
          else if (item.type === 'Tickets') openEventSheet(item.record, day, navContext);
          else if (item.type === 'Rental Cars') openCarRentalSheet(item.record, day, navContext);
        });
        root.appendChild(item.card);
      });
    });
  }

  function buildBookingsFilterChipRow(){
    const wrap = el('div', { class: 'lt-sticky' });

    if (state.searchingBookings){
      const input = el('input', {
        type: 'search',
        placeholder: 'Search bookings',
        enterkeyhint: 'search',
        value: bookingsFilterState.search,
        oninput: (e) => { bookingsFilterState.search = e.target.value; debouncedSyncBookings(); }
      });
      const row = el('div', { class: 'search-row' },
        el('div', { class: 'search' },
          svgIcon('search'),
          input,
          el('button', {
            class: 'search-close',
            'aria-label': 'Close search',
            onclick: () => { state.searchingBookings = false; bookingsFilterState.search = ''; syncBookingsFilters(); }
          }, '\u2715')
        )
      );
      wrap.appendChild(row);
      return wrap;
    }

    const chips = el('div', { class: 'chips chips-single' });

    chips.appendChild(el('button', {
      class: 'chip chip-icon',
      'aria-label': 'Search',
      onclick: () => { state.searchingBookings = true; syncBookingsFilters({ focusSearch: true }); }
    }, svgIcon('search')));

    chips.appendChild(summaryChip(
      bookingsFilterState.day.length === 0 ? 'All Days' : 
        bookingsFilterState.day.length === 1 ? dayFilterLabel(bookingsFilterState.day[0]) :
        `${bookingsFilterState.day.length} Days`,
      bookingsFilterState.day.length > 0,
      () => openBookingsFilterTray('day')
    ));
    chips.appendChild(summaryChip(
      bookingsFilterState.type.length === 0 ? 'All Types' : 
        bookingsFilterState.type.length === 1 ? bookingsFilterState.type[0] :
        `${bookingsFilterState.type.length} Types`,
      bookingsFilterState.type.length > 0,
      () => openBookingsFilterTray('type'),
      bookingsFilterState.type.length === 1 ? bookingTypeEmoji(bookingsFilterState.type[0]) : null
    ));

    wrap.appendChild(chips);
    return wrap;
  }

  function bookingTypeEmoji(type){
    if (type === 'Flights') return '✈️';
    if (type === 'Hotels') return '🏨';
    if (type === 'Tickets') return '🎫';
    if (type === 'Rental Cars') return '🚗';
    return '';
  }

  function bookingTypeColor(type){
    if (type === 'Flights') return '#3b82f6';
    if (type === 'Hotels') return '#8b5cf6';
    if (type === 'Tickets') return '#f59e0b';
    if (type === 'Rental Cars') return '#10b981';
    return 'var(--fg)';
  }

  function filteredBookings(){
    const all = getAllBookings();
    let result = all;

    if (bookingsFilterState.type.length){
      result = result.filter(b => bookingsFilterState.type.includes(b.type));
    }
    if (bookingsFilterState.day.length){
      result = result.filter(b => {
        if (!b.dayNum) return false;
        return bookingsFilterState.day.includes(b.dayNum);
      });
    }
    if (bookingsFilterState.search){
      const q = bookingsFilterState.search.toLowerCase();
      result = result.filter(b => {
        const text = [b.searchText || '', b.name || ''].join(' ').toLowerCase();
        return text.includes(q);
      });
    }

    return result;
  }

  function bookingDayNum(date, explicitDay){
    if (explicitDay != null) return explicitDay;
    if (!date || !D.days) return null;
    return D.days.find(d => d.date === date)?.n ?? null;
  }

  function compareBookings(a, b){
    const dateCmp = (a.sortDate || '').localeCompare(b.sortDate || '');
    if (dateCmp) return dateCmp;
    const timeCmp = eventTimeOrder(a.sortTime) - eventTimeOrder(b.sortTime);
    if (timeCmp) return timeCmp;
    return (a.name || '').localeCompare(b.name || '');
  }

  function getAllBookings(){
    const bookings = [];

    // Flights
    (D.flights || []).forEach(f => {
      bookings.push({
        type: 'Flights',
        dayNum: bookingDayNum(f.date, f.day),
        sortDate: f.date || '',
        sortTime: f.depart || '',
        card: buildFlightCard(f),
        searchText: `${f.from} ${f.to} ${f.airline} ${f.flightNum}`,
        name: `${f.from} → ${f.to}`,
        record: f
      });
    });

    // Hotels
    (D.hotels || []).forEach(h => {
      bookings.push({
        type: 'Hotels',
        dayNum: bookingDayNum(h.startDate, h.day),
        sortDate: h.startDate || '',
        sortTime: '',
        card: buildHotelCard(h),
        searchText: `${h.name} ${h.location}`,
        name: h.name,
        record: h
      });
    });

    // Events/Tickets
    (D.events || []).forEach(e => {
      bookings.push({
        type: 'Tickets',
        dayNum: bookingDayNum(e.date, e.day),
        sortDate: e.date || '',
        sortTime: e.time || '',
        card: buildEventCard(e),
        searchText: `${e.name} ${e.location}`,
        name: e.name,
        record: e
      });
    });

    // Car Rentals
    (D.carRentals || []).forEach(cr => {
      bookings.push({
        type: 'Rental Cars',
        dayNum: bookingDayNum(cr.pickupDate, cr.day),
        sortDate: cr.pickupDate || '',
        sortTime: cr.pickupTime || '',
        card: buildCarRentalCard(cr),
        searchText: `${cr.provider} ${cr.pickupLocation} ${cr.returnLocation}`,
        name: `${cr.pickupLocation} → ${cr.returnLocation}`,
        record: cr
      });
    });

    return bookings;
  }

  function anyBookingsFilterActive(){
    return bookingsFilterState.type.length > 0 || bookingsFilterState.day.length > 0 || bookingsFilterState.search;
  }

  function resetBookingsFilters(){
    bookingsFilterState.type = [];
    bookingsFilterState.day = [];
    bookingsFilterState.search = '';
    state.searchingBookings = false;
    syncBookingsFilters();
  }

  function syncBookingsFilters(opts){
    renderBookingsList();
    if (opts && opts.focusSearch) {
      setTimeout(() => {
        const input = $('#filter-bar-bookings input[type=search]');
        if (input) input.focus();
      }, 50);
    }
  }

  let debouncedSyncBookings;
  (() => {
    let timer;
    debouncedSyncBookings = () => {
      clearTimeout(timer);
      timer = setTimeout(() => syncBookingsFilters(), 350);
    };
  })();

  function openBookingsFilterTray(mode){
    const tray = $('#filter-tray');
    const backdrop = $('#filter-tray-backdrop');
    tray.innerHTML = '';

    if (mode === 'type'){
      const types = ['Flights', 'Hotels', 'Tickets', 'Rental Cars'];
      tray.appendChild(el('div', { class: 'tray-title' }, 'Filter by type'));
      const list = el('div', { class: 'tray-list' });
      types.forEach(t => {
        const selected = bookingsFilterState.type.includes(t);
        const row = el('button', { 
          class: 'tray-row' + (selected ? ' selected' : ''),
          onclick: () => {
            const idx = bookingsFilterState.type.indexOf(t);
            if (idx >= 0) bookingsFilterState.type.splice(idx, 1);
            else bookingsFilterState.type.push(t);
            openBookingsFilterTray(mode);
            syncBookingsFilters();
          }
        },
          el('span', { class: 'tray-leader tray-emoji' }, bookingTypeEmoji(t)),
          el('div', { class: 'tray-text' },
            el('div', { class: 'tray-label' }, t)
          ),
          selected ? (() => {
            const c = el('span', { class: 'tray-check' });
            c.appendChild(svgCheck());
            return c;
          })() : el('span')
        );
        list.appendChild(row);
      });
      tray.appendChild(list);
    } else if (mode === 'day'){
      tray.appendChild(el('div', { class: 'tray-title' }, 'Filter by day'));
      const list = el('div', { class: 'tray-list' });
      D.days.forEach(d => {
        const selected = bookingsFilterState.day.includes(d.n);
        const row = el('button', { 
          class: 'tray-row' + (selected ? ' selected' : ''),
          onclick: () => {
            const idx = bookingsFilterState.day.indexOf(d.n);
            if (idx >= 0) bookingsFilterState.day.splice(idx, 1);
            else bookingsFilterState.day.push(d.n);
            openBookingsFilterTray(mode);
            syncBookingsFilters();
          }
        },
          el('span', { class: 'tray-leader tray-dot', style: { background: d.color } }),
          el('div', { class: 'tray-text' },
            el('div', { class: 'tray-label' }, `Day ${d.n}`),
            el('div', { class: 'tray-sub' }, shortDate(d.date))
          ),
          selected ? (() => {
            const c = el('span', { class: 'tray-check' });
            c.appendChild(svgCheck());
            return c;
          })() : el('span')
        );
        list.appendChild(row);
      });
      tray.appendChild(list);
    }
    tray.appendChild(el('div', { class: 'bottom-pad' }));

    backdrop.classList.add('open');
    requestAnimationFrame(() => tray.classList.add('open'));
  }

  function buildFullRow(a, showDayBadge){
    const unscheduled = isUnscheduledDay(a.day);
    const d = unscheduled ? null : D.byDay[a.day];
    const accent = dayAccent(a.day);
    const firstSentence = (a.desc || '').split(/(?<=[.!?])\s/)[0] || '';
    
    // Build meta parts as plain text
    const metaParts = [];
    if (showDayBadge) {
      metaParts.push(unscheduled ? 'Unscheduled' : 'Day ' + d.n);
    }
    if (a.time) metaParts.push(a.time);
    if (a.cat) metaParts.push(a.cat);
    
    const badges = metaParts.length ? el('div', { class: 'meta' }, metaParts.join(' · ')) : null;

    const confirmDelete = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm(`Remove "${a.name}"?`)) await removeActivity(a);
    };

    const row = el('div', { class: 'full-row swipe-delete-row', style: { '--day-accent': accent } },
      el('div', { class: 'em' }, catEmoji(a.cat)),
      el('div', null,
        el('div', { class: 'name' }, a.name),
        firstSentence ? el('div', { class: 'desc' }, firstSentence) : null,
        badges
      ),
      el('button', {
        type: 'button',
        class: 'swipe-desktop-delete',
        'aria-label': `Remove ${a.name}`,
        onclick: confirmDelete
      }, '×')
    );

    const container = el('div', { class: 'act-swipe-container swipe-delete-container' });
    const deleteBtn = el('button', {
      type: 'button',
      class: 'swipe-delete-action',
      onclick: confirmDelete
    }, 'Delete');

    if (usesSwipeDelete()) {
      attachSwipeDeleteHandlers({ container, row, onTap: () => openActivity(a) });
    } else {
      attachScrollSafeTap(row, () => openActivity(a));
    }

    container.appendChild(deleteBtn);
    container.appendChild(row);
    return container;
  }

  // ─── Render: TO-DO tab (now in Plan mode) ────────────────────────────────
  function renderTodoTab(){
    const bar = $('#plan-todo-header');
    if (!bar) return;
    bar.innerHTML = '';
    bar.appendChild(buildLargeTitle('To-Do'));

    const root = $('#plan-todo-content');
    if (!root) return;
    root.innerHTML = '';

    const sections = [
      { key: 'Critical',  label: 'Critical',  cls: 'crit', color: 'var(--p-critical)' },
      { key: 'Important', label: 'Important', cls: 'imp',  color: 'var(--p-important)' },
      { key: 'Helpful',   label: 'Helpful',   cls: 'help', color: 'var(--p-helpful)' }
    ];
    sections.forEach(s => {
      const all = D.todos.filter(t => t.priority === s.key);
      const list = all.filter(t => !checkedTodos.has(t.id));
      if (!list.length) return;
      const section = el('div', { class: 'todo-section' });
      section.appendChild(el('div', { class: 'section-bar ' + s.cls },
        el('span', { class: 'pdot' }),
        el('span', null, s.label),
        el('span', { class: 'count' }, list.length + ' / ' + all.length)
      ));
      list.forEach(t => section.appendChild(buildTodoRow(t, s.color)));
      root.appendChild(section);
    });

    // Done section at the very bottom — all completed to-dos from any priority.
    const doneList = D.todos.filter(t => checkedTodos.has(t.id));
    if (doneList.length){
      const ds = el('div', { class: 'todo-section' });
      ds.appendChild(el('div', { class: 'section-bar done-bar' },
        el('span', { class: 'pdot' }),
        el('span', null, 'Done'),
        el('span', { class: 'count' }, doneList.length)
      ));
      // Sort done items by priority order, then by index in original data.
      const order = { Critical: 0, Important: 1, Helpful: 2 };
      doneList.sort((a, b) => order[a.priority] - order[b.priority]);
      doneList.forEach(t => ds.appendChild(buildTodoRow(t, 'var(--fg-mute)')));
      root.appendChild(ds);
    }

    // Done section removed — checked items now stay in place, greyed out and
    // sorted to the bottom of their priority section.

    root.appendChild(el('div', { class: 'bottom-pad' }));
  }

  // ─── Add Activity Sheet ───────────────────────────────────────────────────
  function buildAddActivityButton(){
    return el('button', {
      type: 'button',
      class: 'toolbar-btn add-btn add-activity-trigger',
      'aria-label': 'Add activity',
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        showAddActivitySheet();
      }
    }, tabIcon('plus'));
  }

  function buildClipboardPasteButton(inputId){
    const pasteIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/></svg>';
    const btn = el('button', {
      type: 'button',
      'aria-label': 'Paste from clipboard',
      style: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '4px',
        fontSize: '16px',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        flexShrink: '0',
        touchAction: 'manipulation'
      }
    });
    btn.innerHTML = pasteIcon;

    let clipboardRead = null;

    function applyText(input, text){
      if (!input || !text?.trim()) return false;
      input.value = text.trim();
      return true;
    }

    function finishPaste(input){
      if (!input) return;
      input.focus();

      if (!clipboardRead) {
        toast('Couldn\u2019t paste');
        return;
      }

      clipboardRead
        .then((text) => {
          if (!applyText(input, text)) input.focus();
        })
        .catch(() => {
          input.focus();
          toast('Couldn\u2019t paste');
        })
        .finally(() => {
          clipboardRead = null;
        });
    }

    // Start reading on touchstart so iOS keeps user activation through the Paste chip.
    btn.addEventListener('touchstart', () => {
      if (navigator.clipboard?.readText) {
        clipboardRead = navigator.clipboard.readText();
      }
    }, { passive: true });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      finishPaste(document.getElementById(inputId));
    }, { passive: false });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (clipboardRead) return;

      const input = document.getElementById(inputId);
      if (!input) return;
      input.focus();

      navigator.clipboard?.readText?.()
        .then((text) => {
          if (!applyText(input, text)) toast('Clipboard empty');
        })
        .catch(() => toast('Couldn\u2019t paste'));
    });

    return btn;
  }

  function buildSheetCloseButton(onclick, ariaLabel = 'Close'){
    return el('button', {
      class: 'close icon-close toolbar-btn',
      'aria-label': ariaLabel,
      onclick
    }, tabIcon('close'));
  }

  function ensureAddActivitySheetDom(){
    const root = $('#app') || $('.phone-fullscreen') || document.body;
    let backdrop = $('#add-activity-backdrop');
    let sheet = $('#add-activity-sheet');
    if (!backdrop) {
      backdrop = el('div', { id: 'add-activity-backdrop', class: 'sheet-backdrop' });
      root.appendChild(backdrop);
    }
    if (!sheet) {
      sheet = el('div', { id: 'add-activity-sheet', class: 'sheet' });
      root.appendChild(sheet);
    }
    return { sheet, backdrop };
  }

  function showAddActivitySheet(){
    const { sheet, backdrop } = ensureAddActivitySheetDom();
    const root = sheet;
    root.innerHTML = '';

    root.appendChild(buildSheetCloseButton(hideAddActivitySheet));
    root.appendChild(el('div', { class: 'sheet-form-header' },
      el('h2', { class: 'sheet-form-title' }, 'Add Activity')
    ));

    root.appendChild(el('div', { class: 'add-activity-container', style: { padding: '20px', paddingTop: '16px' } },
      el('p', { style: { fontSize: '14px', color: 'var(--fg-mid)', lineHeight: '1.5', marginBottom: '20px' } }, 
        'Paste a Google Maps or TripAdvisor URL to quickly add an activity to your trip.'
      ),
      
      el('div', { class: 'url-input-section' },
        el('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px',
            background: 'var(--surface-2)',
            borderRadius: '6px',
            border: '1px solid white',
            marginBottom: '12px'
          }
        },
          el('input', {
            type: 'text',
            id: 'activity-url-input',
            placeholder: 'https://maps.google.com/...',
            style: {
              flex: '1',
              minWidth: '0',
              padding: '0',
              border: 'none',
              background: 'transparent',
              color: 'var(--fg)',
              outline: 'none'
            }
          }),
          buildClipboardPasteButton('activity-url-input')
        ),
        el('button', {
          id: 'parse-url-btn',
          class: 'oc-btn',
          onclick: handleParseUrl
        }, 'Add activity')
      ),

      el('div', { id: 'parse-result', style: { marginTop: '24px' } })
    ));

    // Show sheet and backdrop
    backdrop.classList.add('open');
    requestAnimationFrame(() => sheet.classList.add('open'));
    
    // Set up backdrop click to close
    backdrop.onclick = hideAddActivitySheet;
  }

  function hideAddActivitySheet() {
    const sheet = $('#add-activity-sheet');
    const backdrop = $('#add-activity-backdrop');
    if (!sheet || !backdrop) return;

    clearSheetDragStyles(sheet);
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    backdrop.onclick = null;
  }

  const ADD_ACTIVITY_BTN_LABEL = 'Add activity';
  const ADD_ACTIVITY_BTN_BUSY = 'Adding activity...';

  function setParseUrlBtnBusy(busy){
    const btn = $('#parse-url-btn');
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? ADD_ACTIVITY_BTN_BUSY : ADD_ACTIVITY_BTN_LABEL;
  }

  async function handleParseUrl() {
    const input = $('#activity-url-input');
    const resultDiv = $('#parse-result');
    if (!input || !resultDiv) return;

    const url = input.value.trim();
    if (!url) {
      resultDiv.innerHTML = el('div', { 
        style: { padding: '16px', background: 'var(--surface-2)', borderRadius: 'var(--r)', color: 'var(--fg-mid)' }
      }, 'Please enter a URL').outerHTML;
      return;
    }

    resultDiv.innerHTML = '';
    setParseUrlBtnBusy(true);

    try {
      const parsed = await parseActivityUrl(url);
      
      if (parsed.error) {
        setParseUrlBtnBusy(false);
        toast('Invalid URL');
        openEditActivitySheetForUnparsedUrl(url, parsed);
        return;
      }

      await submitActivity(parsed, url);
    } catch (err) {
      console.error('Error parsing URL:', err);
      setParseUrlBtnBusy(false);
    }
  }

  function isGoogleMapsUrl(url) {
    return /google\.com\/maps|maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(url);
  }

  function isGoogleShareUrl(url) {
    return /share\.google(?:\.com)?\/|google\.com\/share\.google/i.test(url);
  }

  function isShortGoogleMapsUrl(url) {
    return /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url);
  }

  function normalizeActivityUrl(url) {
    const trimmed = url.trim();
    if (/^share\.google/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }

  async function resolveGoogleMapsUrl(url) {
    const res = await fetch('/api/resolve-map-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error || 'Could not resolve Google Maps URL.' };
    }
    return { name: data.name, lat: data.lat, lng: data.lng, category: null };
  }

  async function parseActivityUrl(rawUrl) {
    const url = normalizeActivityUrl(rawUrl);

    if (isGoogleShareUrl(url)) {
      return resolveGoogleMapsUrl(url);
    }

    if (isGoogleMapsUrl(url)) {
      return parseGoogleMapsUrl(url);
    }
    
    // TripAdvisor URL parsing
    if (url.includes('tripadvisor.com')) {
      return parseTripAdvisorUrl(url);
    }
    
    return { error: 'Unsupported URL format. Only Google Maps, share.google, and TripAdvisor URLs are supported.' };
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
        if (/^-?\d+\.?\d*,-?\d+\.?\d*/.test(name)) {
          name = null;
        }
      }
    }

    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return { error: 'Could not extract coordinates from Google Maps URL.' };
    }

    return { name, lat, lng, category: null };
  }

  async function parseGoogleMapsUrl(url) {
    if (isShortGoogleMapsUrl(url)) {
      return resolveGoogleMapsUrl(url);
    }

    const local = parseGoogleMapsUrlFromString(url);
    if (!local.error) return local;

    return resolveGoogleMapsUrl(url);
  }

  function parseTripAdvisorUrl(url) {
    // TripAdvisor URLs typically have the place name in the path
    // e.g., https://www.tripadvisor.com/Attraction_Review-g60763-d104675-Reviews-Central_Park-New_York_City_New_York.html
    
    let name;
    const nameMatch = url.match(/Reviews-([^-]+)-/);
    if (nameMatch) {
      name = nameMatch[1].replace(/_/g, ' ');
    }

    // TripAdvisor doesn't include coordinates in URLs
    // We'd need to fetch the page or use an API
    return {
      error: 'TripAdvisor URLs require fetching the page to extract location data.',
      name
    };
  }

  function openEditActivitySheetForUnparsedUrl(url, parsed = {}){
    hideAddActivitySheet();
    openEditActivitySheet({
      id: null,
      day: UNSCHEDULED_DAY,
      time: '',
      cat: parsed.category || '',
      name: parsed.name || '',
      desc: '',
      url,
      lat: parsed.lat ?? null,
      lng: parsed.lng ?? null
    }, 'Add Activity');
  }

  async function submitActivity(parsed, url) {
    const trips = getTrips();
    const activeTrip = trips.find(t => t.active);
    
    if (!activeTrip) {
      toast('Select a trip to continue');
      setParseUrlBtnBusy(false);
      return;
    }

    setParseUrlBtnBusy(true);
    toast('Updating Doc');

    try {
      const name = (parsed.name || '').trim() || 'Untitled activity';
      const body = {
        docUrl: activeTrip.url,
        activity: {
          name,
          lat: parsed.lat,
          lng: parsed.lng,
          category: parsed.category,
          url: url
        }
      };
      
      // Include token if available
      if (activeTrip.token) {
        body.token = activeTrip.token;
      }
      
      const res = await fetch('/api/add-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to add activity');
      }

      const rowId = payload.rowId;
      const normalizedUrl = activeTrip.url.split('#')[0].split('?')[0];
      localStorage.removeItem(`${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`);

      hideAddActivitySheet();
      openEditActivitySheet(
        resolveAddedActivity({ rowId, name, url, parsed }),
        'Activity Added'
      );

      const savedTab = state.tab;
      try {
        await loadTripData(activeTrip.url, false, activeTrip.token || null, { preserveUi: true });
        switchTab(savedTab);
      } catch (reloadErr) {
        console.warn('Added to Coda but failed to refresh trip data:', reloadErr);
      }

    } catch (err) {
      console.error('Error adding activity:', err);
      toast('Couldn\u2019t add activity');
    } finally {
      setParseUrlBtnBusy(false);
    }
  }

  // ─── Edit Activity Sheet ──────────────────────────────────────────────────
  let editActivityDraft = null;

  function activityToDraft(a){
    return {
      rowId: a.id || null,
      day: a.day,
      time: a.time || '',
      cat: a.cat || '',
      name: a.name || '',
      desc: a.desc || '',
      url: a.url || '',
      lat: a.lat != null && !isNaN(a.lat) ? String(a.lat) : '',
      lng: a.lng != null && !isNaN(a.lng) ? String(a.lng) : ''
    };
  }

  function coordsRoughlyEqual(a, b) {
    if (a == null || b == null) return true;
    return Math.abs(Number(a) - Number(b)) < 1e-4;
  }

  function findAddedActivity({ rowId, name, url, lat, lng }) {
    if (rowId) {
      const byId = D.byId?.[rowId] || (D.activities || []).find(a => a.id === rowId);
      if (byId) return byId;
    }

    const candidates = (D.activities || []).filter(a => a.name === name);
    const match = candidates.find(a =>
      (!url || a.url === url || !a.url) &&
      coordsRoughlyEqual(a.lat, lat) &&
      coordsRoughlyEqual(a.lng, lng)
    ) || candidates.find(a => isUnscheduledDay(a.day))
      || candidates[0];

    return match || null;
  }

  function buildAddedActivityFromParsed({ rowId, name, url, parsed }) {
    return {
      id: rowId || null,
      day: UNSCHEDULED_DAY,
      time: '',
      cat: parsed.category || '',
      name,
      desc: '',
      url,
      lat: parsed.lat ?? null,
      lng: parsed.lng ?? null
    };
  }

  function resolveAddedActivity({ rowId, name, url, parsed }) {
    return findAddedActivity({ rowId, name, url, lat: parsed.lat, lng: parsed.lng })
      || buildAddedActivityFromParsed({ rowId, name, url, parsed });
  }

  function editTimeLabel(time){ return time || 'None'; }
  function editCatLabel(cat){ return cat || 'None'; }
  function editTimeEmoji(time){ return time ? todEmoji(time) : null; }
  function editCatEmoji(cat){ return cat ? catEmoji(cat) : null; }

  function updateEditPickerLabel(labelId, text, emoji){
    const textEl = $(`#${labelId}-text`);
    if (textEl) textEl.textContent = text;
    const emojiEl = $(`#${labelId}-emoji`);
    if (emojiEl) {
      emojiEl.textContent = emoji || '';
      emojiEl.style.display = emoji ? 'inline' : 'none';
    }
  }

  function ensureEditActivitySheetDom(){
    const root = $('#app') || $('.phone-fullscreen') || document.body;
    let backdrop = $('#edit-activity-backdrop');
    let sheet = $('#edit-activity-sheet');
    if (!backdrop) {
      backdrop = el('div', { id: 'edit-activity-backdrop', class: 'sheet-backdrop sheet-stack-2' });
      root.appendChild(backdrop);
    }
    if (!sheet) {
      sheet = el('div', { id: 'edit-activity-sheet', class: 'sheet sheet-stack-2' });
      root.appendChild(sheet);
    }
    return { sheet, backdrop };
  }

  function hideEditActivitySheet(){
    const sheet = $('#edit-activity-sheet');
    const backdrop = $('#edit-activity-backdrop');
    if (!sheet || !backdrop) return;
    clearSheetDragStyles(sheet);
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    backdrop.onclick = null;
    editActivityDraft = null;
  }

  function openEditDayPicker(){
    if (!editActivityDraft) return;
    openPickTray({
      title: 'Date',
      value: editActivityDraft.day,
      options: [{ value: UNSCHEDULED_DAY, label: 'Unscheduled', sub: 'Not on itinerary yet' }]
        .concat((D.days || []).map(d => ({
          value: d.n,
          label: `Day ${d.n}`,
          sub: `${shortDate(d.date)} \u00b7 ${d.loc} \u00b7 ${d.title}`,
          color: d.color
        }))),
      onPick: (value) => {
        editActivityDraft.day = value;
        updateEditPickerLabel('edit-day-label', dayFilterLabel(value));
      }
    });
  }

  function openEditTimePicker(){
    if (!editActivityDraft) return;
    openPickTray({
      title: 'Time of day',
      value: editActivityDraft.time,
      options: [{ value: '', label: 'None', sub: 'No time set' }]
        .concat((D.timesOfDay || []).map(t => ({ value: t.id, label: t.id, sub: '', emoji: t.emoji }))),
      onPick: (value) => {
        editActivityDraft.time = value;
        updateEditPickerLabel('edit-time-label', editTimeLabel(value), editTimeEmoji(value));
      }
    });
  }

  function openEditTypePicker(){
    if (!editActivityDraft) return;
    openPickTray({
      title: 'Type',
      value: editActivityDraft.cat,
      options: [{ value: '', label: 'None', sub: 'No category' }]
        .concat(Object.values(D.categories || {}).map(c => ({ value: c.label, label: c.label, sub: '', emoji: c.emoji }))),
      onPick: (value) => {
        editActivityDraft.cat = value;
        updateEditPickerLabel('edit-type-label', editCatLabel(value), editCatEmoji(value));
      }
    });
  }

  function buildEditPickerField(label, labelId, displayValue, onOpen, emoji){
    return el('div', { class: 'edit-field' },
      el('label', { class: 'edit-label' }, label),
      el('button', { type: 'button', class: 'edit-picker-btn', onclick: onOpen },
        el('span', { class: 'edit-picker-value' },
          el('span', {
            id: `${labelId}-emoji`,
            class: 'edit-picker-emoji',
            style: { display: emoji ? 'inline' : 'none' }
          }, emoji || ''),
          el('span', { id: `${labelId}-text` }, displayValue)
        ),
        svgIcon('chevron-down')
      )
    );
  }

  function openEditActivitySheet(a, title = 'Edit Activity'){
    editActivityDraft = activityToDraft(a);
    const { sheet, backdrop } = ensureEditActivitySheetDom();
    const draft = editActivityDraft;
    const isNew = !draft.rowId;
    sheet.innerHTML = '';

    sheet.appendChild(buildSheetCloseButton(hideEditActivitySheet));
    sheet.appendChild(el('div', { class: 'sheet-form-header' },
      el('h2', { class: 'sheet-form-title' }, title)
    ));

    const form = el('div', { class: 'edit-activity-container' },
      buildEditPickerField('Date', 'edit-day-label', dayFilterLabel(draft.day), openEditDayPicker),
      buildEditPickerField('Time of day', 'edit-time-label', editTimeLabel(draft.time), openEditTimePicker, editTimeEmoji(draft.time)),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-activity-name' }, 'Name'),
        el('input', {
          type: 'text',
          id: 'edit-activity-name',
          class: 'edit-input',
          value: draft.name,
          oninput: (e) => { draft.name = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-activity-desc' }, 'Description'),
        el('textarea', {
          id: 'edit-activity-desc',
          class: 'edit-textarea',
          oninput: (e) => { draft.desc = e.target.value; }
        }, draft.desc)
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-activity-url' }, 'More info URL'),
        el('input', {
          type: 'url',
          id: 'edit-activity-url',
          class: 'edit-input',
          value: draft.url,
          placeholder: 'https://...',
          oninput: (e) => { draft.url = e.target.value; }
        })
      ),
      buildEditPickerField('Type', 'edit-type-label', editCatLabel(draft.cat), openEditTypePicker, editCatEmoji(draft.cat)),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-activity-lat' }, 'Latitude'),
        el('input', {
          type: 'text',
          id: 'edit-activity-lat',
          class: 'edit-input',
          value: draft.lat,
          placeholder: '35.6896',
          oninput: (e) => { draft.lat = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-activity-lng' }, 'Longitude'),
        el('input', {
          type: 'text',
          id: 'edit-activity-lng',
          class: 'edit-input',
          value: draft.lng,
          placeholder: '139.6917',
          oninput: (e) => { draft.lng = e.target.value; }
        })
      )
    );
    sheet.appendChild(form);
    sheet.appendChild(el('div', { class: 'edit-sheet-actions' },
      el('button', {
        id: 'edit-activity-submit',
        class: 'oc-btn',
        onclick: submitUpdateActivity
      }, isNew ? 'Add' : 'Update')
    ));

    backdrop.classList.add('open');
    backdrop.onclick = hideEditActivitySheet;
    requestAnimationFrame(() => sheet.classList.add('open'));
  }

  async function submitUpdateActivity(){
    const draft = editActivityDraft;
    if (!draft) return;

    const trips = getTrips();
    const activeTrip = trips.find(t => t.active);
    if (!activeTrip) {
      toast('Select a trip to continue');
      return;
    }

    const name = draft.name.trim();
    if (!name) {
      toast('Enter activity name');
      return;
    }

    const latStr = draft.lat.trim();
    const lngStr = draft.lng.trim();
    const lat = latStr === '' ? null : parseFloat(latStr);
    const lng = lngStr === '' ? null : parseFloat(lngStr);
    if ((latStr && isNaN(lat)) || (lngStr && isNaN(lng))) {
      toast('Lat & long must be numbers');
      return;
    }

    const btn = $('#edit-activity-submit');
    const isNew = !draft.rowId;
    if (btn) {
      btn.disabled = true;
      btn.textContent = isNew ? 'Adding...' : 'Updating...';
    }

    const date = isUnscheduledDay(draft.day) ? null : (D.byDay[draft.day]?.date || null);
    let rowId = draft.rowId;
    const dayNum = isUnscheduledDay(draft.day) ? UNSCHEDULED_DAY : draft.day;
    const activityPatch = {
      name,
      desc: draft.desc.trim(),
      url: draft.url.trim(),
      lat,
      lng,
      cat: draft.cat || null,
      time: draft.time || null,
      day: dayNum
    };

    try {
      if (!rowId) {
        toast('Updating Doc');
        const addBody = {
          docUrl: activeTrip.url,
          activity: {
            name,
            lat,
            lng,
            category: draft.cat || null,
            url: draft.url.trim()
          }
        };
        if (activeTrip.token) addBody.token = activeTrip.token;

        const addRes = await fetch('/api/add-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(addBody)
        });
        const addPayload = await addRes.json().catch(() => ({}));
        if (!addRes.ok) throw new Error(addPayload.error || 'Failed to add activity');
        rowId = addPayload.rowId;
        draft.rowId = rowId;
      }

      await syncTripRecordEdit({
        applyLocal: () => {
          if (!getTripRecord('activities', rowId)) {
            return insertTripRecord('activities', { id: rowId, ...activityPatch });
          }
          return patchTripRecord('activities', rowId, activityPatch);
        },
        apiCall: async () => {
          const body = {
            docUrl: activeTrip.url,
            rowId,
            activity: {
              name,
              desc: activityPatch.desc,
              url: activityPatch.url,
              lat,
              lng,
              category: draft.cat || null,
              time: draft.time || null,
              date
            }
          };
          if (activeTrip.token) body.token = activeTrip.token;
          const res = await fetch('/api/update-activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload.error || 'Failed to update activity');
        },
        hideEditSheet: hideEditActivitySheet,
        reopenDetail: openSheet,
        savedDay: null,
        successToast: isNew ? 'Activity added' : 'Activity updated',
        failToast: isNew ? 'Couldn\u2019t add activity' : 'Couldn\u2019t update activity',
        submitBtn: btn,
        submitBtnLabel: isNew ? 'Add' : 'Update'
      });
    } catch (err) {
      console.error('Error updating activity:', err);
      toast(isNew ? 'Couldn\u2019t add activity' : 'Couldn\u2019t update activity');
      if (btn) {
        btn.disabled = false;
        btn.textContent = isNew ? 'Add' : 'Update';
      }
    }
  }

  // ─── Edit Hotel Sheet ─────────────────────────────────────────────────────
  let editHotelDraft = null;
  let editHotelDay = null;

  function resolveHotelRecord(h){
    if (!h) return null;
    if (h.id) return h;
    return (D.hotels || []).find(x =>
      x.id &&
      x.name === h.name &&
      x.startDate === h.startDate &&
      x.roomType === h.roomType
    ) || h;
  }

  async function ensureHotelRecord(h){
    let hotel = resolveHotelRecord(h);
    if (hotel?.id) return hotel;

    const activeTrip = getTrips().find(t => t.active);
    if (!activeTrip) return hotel;

    const normalizedUrl = activeTrip.url.split('#')[0].split('?')[0];
    localStorage.removeItem(`${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`);
    toast('Refreshing trip\u2026');
    try {
      await loadTripData(activeTrip.url, false, activeTrip.token || null, { preserveUi: true });
      hotel = resolveHotelRecord(h);
    } catch (err) {
      console.warn('Failed to refresh trip for hotel edit:', err);
    }
    return hotel;
  }

  function hotelToDraft(h){
    return {
      rowId: h.id || null,
      name: h.name || '',
      city: h.city || '',
      startDate: h.startDate || '',
      endDate: h.endDate || '',
      roomType: h.roomType || '',
      address: h.address || '',
      bookingCode: h.bookingCode || '',
      cost: h.cost || '',
      lat: h.lat != null && !isNaN(h.lat) ? String(h.lat) : '',
      lng: h.lng != null && !isNaN(h.lng) ? String(h.lng) : ''
    };
  }

  function uniqueHotelValues(field){
    return [...new Set((D.hotels || []).map(h => h[field]).filter(Boolean))];
  }

  function hotelDateLabel(date){ return date ? fmtDate(date) : 'None'; }

  function hotelNightsBetween(startDate, endDate){
    if (!startDate || !endDate) return 0;
    const ms = new Date(endDate + 'T12:00:00') - new Date(startDate + 'T12:00:00');
    return Math.max(0, Math.round(ms / 86400000));
  }

  function hotelDatePickerOptions(minDate){
    return (D.days || [])
      .filter(d => !minDate || d.date >= minDate)
      .map(d => ({
        value: d.date,
        label: fmtDate(d.date),
        sub: `Day ${d.n} · ${d.loc}`,
        color: d.color
      }));
  }

  function ensureEditHotelSheetDom(){
    const root = $('#app') || $('.phone-fullscreen') || document.body;
    let backdrop = $('#edit-hotel-backdrop');
    let sheet = $('#edit-hotel-sheet');
    if (!backdrop) {
      backdrop = el('div', { id: 'edit-hotel-backdrop', class: 'sheet-backdrop sheet-stack-2' });
      root.appendChild(backdrop);
    }
    if (!sheet) {
      sheet = el('div', { id: 'edit-hotel-sheet', class: 'sheet sheet-stack-2' });
      root.appendChild(sheet);
    }
    return { sheet, backdrop };
  }

  function hideEditHotelSheet(){
    const sheet = $('#edit-hotel-sheet');
    const backdrop = $('#edit-hotel-backdrop');
    if (!sheet || !backdrop) return;
    clearSheetDragStyles(sheet);
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    backdrop.onclick = null;
    editHotelDraft = null;
    editHotelDay = null;
  }

  function openEditHotelNamePicker(){
    if (!editHotelDraft) return;
    openPickTray({
      title: 'Hotel',
      value: editHotelDraft.name,
      options: uniqueHotelValues('name').map(name => ({ value: name, label: name, sub: '', emoji: '🏨' })),
      onPick: (value) => {
        editHotelDraft.name = value;
        updateEditPickerLabel('edit-hotel-name-label', value || 'None');
      }
    });
  }

  function openEditHotelCityPicker(){
    if (!editHotelDraft) return;
    openPickTray({
      title: 'City',
      value: editHotelDraft.city,
      options: uniqueHotelValues('city').map(city => ({ value: city, label: city, sub: '' })),
      onPick: (value) => {
        editHotelDraft.city = value;
        updateEditPickerLabel('edit-hotel-city-label', value || 'None');
      }
    });
  }

  function openEditHotelStartPicker(){
    if (!editHotelDraft) return;
    openPickTray({
      title: 'Check-in',
      value: editHotelDraft.startDate,
      options: hotelDatePickerOptions(),
      onPick: (value) => {
        editHotelDraft.startDate = value;
        if (editHotelDraft.endDate && editHotelDraft.endDate < value) {
          editHotelDraft.endDate = value;
          updateEditPickerLabel('edit-hotel-end-label', hotelDateLabel(value));
        }
        updateEditPickerLabel('edit-hotel-start-label', hotelDateLabel(value));
      }
    });
  }

  function openEditHotelEndPicker(){
    if (!editHotelDraft) return;
    openPickTray({
      title: 'Check-out',
      value: editHotelDraft.endDate,
      options: hotelDatePickerOptions(editHotelDraft.startDate),
      onPick: (value) => {
        editHotelDraft.endDate = value;
        updateEditPickerLabel('edit-hotel-end-label', hotelDateLabel(value));
      }
    });
  }

  async function openEditHotelSheet(h, day){
    const hotel = await ensureHotelRecord(h);
    if (!hotel?.id) {
      toast('Couldn\u2019t load hotel for editing');
      return;
    }
    editHotelDay = day || null;
    editHotelDraft = hotelToDraft(hotel);
    const { sheet, backdrop } = ensureEditHotelSheetDom();
    const draft = editHotelDraft;
    sheet.innerHTML = '';

    sheet.appendChild(buildSheetCloseButton(hideEditHotelSheet));
    sheet.appendChild(el('div', { class: 'sheet-form-header' },
      el('h2', { class: 'sheet-form-title' }, 'Edit Hotel')
    ));

    const form = el('div', { class: 'edit-activity-container' },
      buildEditPickerField('Hotel', 'edit-hotel-name-label', draft.name || 'None', openEditHotelNamePicker, '🏨'),
      buildEditPickerField('City', 'edit-hotel-city-label', draft.city || 'None', openEditHotelCityPicker),
      buildEditPickerField('Check-in', 'edit-hotel-start-label', hotelDateLabel(draft.startDate), openEditHotelStartPicker),
      buildEditPickerField('Check-out', 'edit-hotel-end-label', hotelDateLabel(draft.endDate), openEditHotelEndPicker),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-hotel-room' }, 'Room type'),
        el('input', {
          type: 'text',
          id: 'edit-hotel-room',
          class: 'edit-input',
          value: draft.roomType,
          oninput: (e) => { draft.roomType = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-hotel-address' }, 'Address'),
        el('input', {
          type: 'text',
          id: 'edit-hotel-address',
          class: 'edit-input',
          value: draft.address,
          oninput: (e) => { draft.address = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-hotel-booking-code' }, 'Booking code'),
        el('input', {
          type: 'text',
          id: 'edit-hotel-booking-code',
          class: 'edit-input',
          value: draft.bookingCode,
          oninput: (e) => { draft.bookingCode = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-hotel-cost' }, 'Cost (USD)'),
        el('input', {
          type: 'text',
          id: 'edit-hotel-cost',
          class: 'edit-input',
          value: draft.cost,
          placeholder: '150',
          oninput: (e) => { draft.cost = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-hotel-lat' }, 'Latitude'),
        el('input', {
          type: 'text',
          id: 'edit-hotel-lat',
          class: 'edit-input',
          value: draft.lat,
          placeholder: '35.6896',
          oninput: (e) => { draft.lat = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-hotel-lng' }, 'Longitude'),
        el('input', {
          type: 'text',
          id: 'edit-hotel-lng',
          class: 'edit-input',
          value: draft.lng,
          placeholder: '139.6917',
          oninput: (e) => { draft.lng = e.target.value; }
        })
      )
    );
    sheet.appendChild(form);
    sheet.appendChild(el('div', { class: 'edit-sheet-actions' },
      el('button', {
        id: 'edit-hotel-submit',
        class: 'oc-btn',
        onclick: submitUpdateHotel
      }, 'Update')
    ));

    backdrop.classList.add('open');
    backdrop.onclick = hideEditHotelSheet;
    requestAnimationFrame(() => sheet.classList.add('open'));
  }

  async function submitUpdateHotel(){
    const draft = editHotelDraft;
    if (!draft) return;

    const trips = getTrips();
    const activeTrip = trips.find(t => t.active);
    if (!activeTrip) {
      toast('Select a trip to continue');
      return;
    }

    if (!draft.rowId) {
      toast('Hotel can\u2019t be edited');
      return;
    }

    const name = draft.name.trim();
    if (!name) {
      toast('Select a hotel');
      return;
    }

    const latStr = draft.lat.trim();
    const lngStr = draft.lng.trim();
    const lat = latStr === '' ? null : parseFloat(latStr);
    const lng = lngStr === '' ? null : parseFloat(lngStr);
    if ((latStr && isNaN(lat)) || (lngStr && isNaN(lng))) {
      toast('Lat & long must be numbers');
      return;
    }

    const btn = $('#edit-hotel-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
    }

    const nights = hotelNightsBetween(draft.startDate, draft.endDate);
    const savedDay = editHotelDay;
    const rowId = draft.rowId;
    const hotelPatch = {
      name,
      city: draft.city || '',
      startDate: draft.startDate || '',
      endDate: draft.endDate || '',
      nights,
      roomType: draft.roomType.trim(),
      address: draft.address.trim(),
      bookingCode: draft.bookingCode.trim(),
      cost: draft.cost.trim(),
      lat,
      lng
    };

    await syncTripRecordEdit({
      applyLocal: () => patchTripRecord('hotels', rowId, hotelPatch),
      apiCall: async () => {
        const body = { docUrl: activeTrip.url, rowId, type: 'hotel', data: hotelPatch };
        if (activeTrip.token) body.token = activeTrip.token;
        const res = await fetch('/api/update-record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Failed to update hotel');
      },
      hideEditSheet: hideEditHotelSheet,
      reopenDetail: openHotelSheet,
      savedDay,
      successToast: 'Hotel updated',
      failToast: 'Couldn\u2019t update hotel',
      submitBtn: btn,
      submitBtnLabel: 'Update'
    });
  }

  // Emoji prefixes for To-Do types — uses Activity-category emoji where the
  // type maps cleanly; new categories get their own glyph.
  const TODO_TYPE_EMOJI = {
    'Tickets':        '🎟️',
    'Tour':           '🗺️',
    'Event Planning': '🎆',
    'Transit':        '🚅',
    'Restaurant':     '🍜',
    'Travel setup':   '📱',
    'Activity':       '✨',
    'Shopping':       '🛍️',
    'Logistics':      '📋',
    'Packing':        '🧳'
  };

  function buildTodoRow(t, color){
    const done = checkedTodos.has(t.id);
    const typeEmoji = TODO_TYPE_EMOJI[t.type] || '\u2022';
    const row = el('div', { class: 'todo-row' + (done ? ' done' : ''), style: { '--p-color': color } },
      el('div', { class: 'checkbox', onclick: () => toggleTodo(t.id) }, svgCheck()),
      el('div', { class: 'body' },
        el('div', { class: 't-name' }, t.item),
        el('div', { class: 't-meta' },
          el('span', { class: 't-day' }, t.day),
          el('span', { class: 't-type' },
            el('span', { class: 't-type-em' }, typeEmoji),
            el('span', null, t.type)
          )
        )
      ),
      t.link ? el('a', {
        class: 'book-btn' + (t.priority === 'Critical' ? ' crit' : ''),
        href: t.link, target: '_blank', rel: 'noopener'
      }, 'Book →') : el('span')
    );
    return row;
  }
  function toggleTodo(id){
    if (checkedTodos.has(id)) checkedTodos.delete(id); else checkedTodos.add(id);
    saveSet(STORAGE.todoChecks, checkedTodos);
    renderTodoTab();
  }

  // ─── Activity detail sheet ────────────────────────────────────────────────
  function sortedActivityIds(){
    // Stable order: unscheduled first, then by day, then by time-of-day bucket, then by original index.
    return D.activities
      .map((a, i) => ({ id: a.id, day: a.day, t: timeOrder(a.time), i }))
      .sort((x, y) => {
        if (isUnscheduledDay(x.day) && !isUnscheduledDay(y.day)) return -1;
        if (!isUnscheduledDay(x.day) && isUnscheduledDay(y.day)) return 1;
        return x.day - y.day || x.t - y.t || x.i - y.i;
      })
      .map(o => o.id);
  }
  function adjacentActivity(currentId, delta){
    const ids = sortedActivityIds();
    const i = ids.indexOf(currentId);
    if (i < 0) return null;
    const j = i + delta;
    if (j < 0 || j >= ids.length) return null;
    return D.byId[ids[j]];
  }

  function activityWalkOverlayText(a) {
    if (!state.location || a.lat == null || a.lng == null) return null;
    const km = haversine(state.location, { lat: a.lat, lng: a.lng });
    const walkMin = Math.round(km / 5 * 60);
    return `${walkMin} min · ${km.toFixed(1)} km`;
  }

  function splitActivityDesc(desc) {
    const lines = String(desc || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (lines.length <= 1) return { summary: lines[0] || '', notes: [] };
    return { summary: lines[0], notes: lines.slice(1) };
  }

  function activityItineraryParts(a, d, unscheduled) {
    const parts = [];
    // Category and icon first
    if (a.cat) parts.push(`${a.icon || ''} ${a.cat}`.trim());
    // Then day and time
    if (unscheduled) parts.push('Unscheduled');
    else if (d) parts.push('Day ' + d.n);
    if (a.time) parts.push(a.time);
    return parts;
  }

  function buildActivitySheetBody(a, d, unscheduled, enrichment, hasGooglePhoto) {
    const body = el('div', { class: 'sheet-body sheet-body--activity' });
    body.appendChild(el('h2', { class: 'sheet-title' }, a.name));

    const rating = buildCardRating(enrichment);
    const itineraryParts = activityItineraryParts(a, d, unscheduled);
    
    // Google rating or fallback meta line
    if (hasGooglePhoto && rating) {
      rating.classList.add('sheet-rating');
      body.appendChild(rating);
    } else if (!hasGooglePhoto && itineraryParts.length) {
      // Fallback: show category/time meta under title
      body.appendChild(el('div', { class: 'sheet-meta-line' }, itineraryParts.join(' · ')));
    }

    const { summary, notes } = splitActivityDesc(a.desc);
    if (summary) {
      body.appendChild(el('div', { class: 'sheet-desc' }, el('p', null, summary)));
    }

    // Location map card (only for A ★ variant with Google photo)
    if (hasGooglePhoto && hasMapCoordinates(a)) {
      const mapCard = el('div', { class: 'sheet-map-card sheet-map-card--activity', 'aria-label': 'Activity location map' },
        el('div', { id: 'activity-sheet-map' }),
        el('div', { class: 'sheet-map-pin sheet-map-pin--activity' })
      );
      
      const overlayText = activityWalkOverlayText(a);
      if (overlayText) {
        const walkChip = el('div', { class: 'sheet-map-overlay' }, overlayText);
        mapCard.appendChild(walkChip);
      }
      
      body.appendChild(mapCard);
    }

    if (notes.length) {
      const notesBlock = el('div', { class: 'sheet-notes' },
        el('div', { class: 'notes-label' }, 'NOTES'),
        ...notes.map(note => el('p', null, note))
      );
      body.appendChild(notesBlock);
    }

    return body;
  }

  function mountActivitySheetHero(a, d, unscheduled, enrichment) {
    const hasPhoto = !!enrichment?.photoUrl;
    const itineraryParts = activityItineraryParts(a, d, unscheduled);

    if (hasPhoto) {
      // A ★ - Google photo hero with carousel and category pill
      const heroWrap = el('div', { class: 'hero-wrap' });
      const photoUrls = enrichment.photoUrls || [enrichment.photoUrl];
      const carousel = buildPhotoCarousel(photoUrls, a.name);
      
      if (carousel) {
        heroWrap.appendChild(carousel);
      } else {
        const heroImg = el('img', { class: 'hero-photo', src: enrichment.photoUrl, alt: a.name });
        heroWrap.appendChild(heroImg);
      }
      
      if (itineraryParts.length) {
        const categoryPill = el('div', { class: 'hero-meta-pill' }, itineraryParts.join(' · '));
        heroWrap.appendChild(categoryPill);
      }
      
      return { heroWrap, mode: 'photo' };
    }

    // B - Map fallback hero with walk chip
    if (hasMapCoordinates(a)) {
      const heroWrap = el('div', { class: 'hero-wrap' });
      const mapHero = el('div', { class: 'hero-map', id: 'activity-hero-map' });
      heroWrap.appendChild(mapHero);
      
      const overlayText = activityWalkOverlayText(a);
      if (overlayText) {
        const walkChip = el('div', { class: 'hero-meta-pill' }, overlayText);
        heroWrap.appendChild(walkChip);
      }
      
      return { heroWrap, mode: 'map' };
    }

    return null;
  }

  function initActivitySheetMap(a, accent, hasGooglePhoto) {
    if (leafletSheet) { leafletSheet.remove(); leafletSheet = null; }
    
    // Check for location map card (A ★ variant) or hero map (B fallback)
    const mapCardNode = $('#activity-sheet-map');
    const heroMapNode = $('#activity-hero-map');
    const node = mapCardNode || heroMapNode;
    if (!node) return;
    
    leafletSheet = L.map(node, {
      center: [a.lat, a.lng], zoom: hasGooglePhoto ? 14 : 13,
      zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      touchZoom: false, boxZoom: false, keyboard: false, tap: false
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd'
    }).addTo(leafletSheet);
    L.marker([a.lat, a.lng], { icon: pinIcon(a.cat, accent) }).addTo(leafletSheet);
  }

  function hydrateActivitySheetEnrichment(sheet, a, enrichment) {
    if (state.sheet !== a.id) return;
    const heroWrap = sheet.querySelector('.sheet-hero-wrap');
    const body = sheet.querySelector('.sheet-body--activity');
    if (!heroWrap || !body || !enrichment?.photoUrl) return;

    if (heroWrap.classList.contains('sheet-hero-wrap--map')) {
      if (leafletSheet) { leafletSheet.remove(); leafletSheet = null; }
      const overlay = heroWrap.querySelector('.sheet-hero-overlay');
      const overlayText = overlay?.textContent || '';
      heroWrap.replaceChildren();
      heroWrap.classList.remove('sheet-hero-wrap--map');
      heroWrap.appendChild(buildCardImage(enrichment.photoUrl, a.name, 'sheet-hero-photo'));
      if (overlayText) heroWrap.appendChild(el('div', { class: 'sheet-hero-overlay' }, overlayText));
    }

    if (!body.querySelector('.sheet-rating')) {
      const rating = buildCardRating(enrichment);
      if (rating) {
        rating.classList.add('sheet-rating');
        const title = body.querySelector('.sheet-title');
        title?.insertAdjacentElement('afterend', rating);
      }
    }
  }

  function openSheet(a){
    state.hotelSheet = null;
    state.flightSheet = null;
    state.eventSheet = null;
    state.carRentalSheet = null;
    state.sheet = a.id;
    const backdrop = $('#sheet-backdrop');
    const sheet = $('#sheet');
    sheet.innerHTML = '';

    const unscheduled = isUnscheduledDay(a.day);
    const d = unscheduled ? null : D.byDay[a.day];
    const accent = dayAccent(a.day);
    const prev = adjacentActivity(a.id, -1);
    const next = adjacentActivity(a.id, +1);
    sheet.appendChild(el('div', { class: 'handle' }));
    // Sheet header chrome (chevrons + close), pinned above the map
    sheet.appendChild(el('div', { class: 'sheet-nav' },
      el('button', { class: 'sheet-chev toolbar-btn', disabled: prev ? null : '', 'aria-label': 'Previous activity', onclick: () => prev && openSheet(prev) }, tabIcon('chev-left')),
      el('button', { class: 'sheet-chev toolbar-btn', disabled: next ? null : '', 'aria-label': 'Next activity', onclick: () => next && openSheet(next) }, tabIcon('chev-right')),
      el('div', { class: 'sheet-nav-actions' },
      el('button', {
        class: 'toolbar-btn',
        'aria-label': 'Edit activity',
        onclick: () => openEditActivitySheet(a)
      }, tabIcon('edit')),
        buildSheetCloseButton(closeSheet)
      )
    ));

    const cachedEnrichment = getCachedPlaceEnrichment('activity', a);
    const hasGooglePhoto = !!cachedEnrichment?.photoUrl;
    const heroResult = mountActivitySheetHero(a, d, unscheduled, cachedEnrichment);
    const body = buildActivitySheetBody(a, d, unscheduled, cachedEnrichment, hasGooglePhoto);
    
    if (heroResult) {
      body.insertBefore(heroResult.heroWrap, body.firstChild);
    }
    
    sheet.appendChild(body);

    const infoUrl = isHttpUrl(a.url) ? a.url.trim() : '';
    const actionButtons = [];
    
    if (infoUrl){
      actionButtons.push(el('a', { class: 'btn secondary', href: infoUrl, target: '_blank', rel: 'noopener' }, 'More Info'));
    }
    actionButtons.push(el('a', {
      class: 'btn',
      href: buildDirectionsUrl(a),
      target: '_blank', rel: 'noopener'
    }, 'Get Directions'));
    
    const actions = el('div', { class: sheetActionsClass(actionButtons.length) }, ...actionButtons);
    sheet.appendChild(actions);

    backdrop.classList.add('open');
    requestAnimationFrame(() => sheet.classList.add('open'));

    // Initialize maps
    setTimeout(() => {
      if (hasMapCoordinates(a)) {
        initActivitySheetMap(a, accent, hasGooglePhoto);
      }
    }, 100);

    requestPlaceEnrichment('activity', a, (data) => {
      if (data?.enriched) hydrateActivitySheetEnrichment(sheet, a, data);
    });
  }

  function resolveFlightRecord(f){
    if (!f) return null;
    if (f.id) return f;
    return (D.flights || []).find(x =>
      x.id &&
      x.trip === f.trip &&
      x.date === f.date &&
      x.number === f.number
    ) || f;
  }

  async function ensureFlightRecord(f){
    let flight = resolveFlightRecord(f);
    if (flight?.id) return flight;

    const activeTrip = getTrips().find(t => t.active);
    if (!activeTrip) return flight;

    const normalizedUrl = activeTrip.url.split('#')[0].split('?')[0];
    localStorage.removeItem(`${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`);
    toast('Refreshing trip\u2026');
    try {
      await loadTripData(activeTrip.url, false, activeTrip.token || null, { preserveUi: true });
      flight = resolveFlightRecord(f);
    } catch (err) {
      console.warn('Failed to refresh trip for flight edit:', err);
    }
    return flight;
  }

  async function fetchFlightReceiptUrl(rowId){
    const activeTrip = getTrips().find(t => t.active);
    if (!activeTrip) return '';

    try {
      const body = { docUrl: activeTrip.url, rowId, type: 'flight' };
      if (activeTrip.token) body.token = activeTrip.token;
      const res = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return '';
      return isHttpUrl(payload.url) ? payload.url.trim() : '';
    } catch (err) {
      console.warn('Failed to resolve flight receipt URL:', err);
      return '';
    }
  }

  async function openFlightSheet(f, day, navContext){
    state.sheet = null;
    state.hotelSheet = null;
    state.eventSheet = null;
    state.carRentalSheet = null;
    f = resolveFlightRecord(f);
    state.flightSheet = f;
    const backdrop = $('#sheet-backdrop');
    const sheet = $('#sheet');
    sheet.innerHTML = '';

    const accent = day?.color || dayAccent(day?.n) || '#8b5cf6';
    let receiptUrl = isHttpUrl(f.receiptUrl) ? f.receiptUrl.trim() : '';
    if (!receiptUrl && f.receipt && f.id) {
      receiptUrl = await fetchFlightReceiptUrl(f.id);
      if (receiptUrl) f.receiptUrl = receiptUrl;
    }
    const costText = formatFlightCost(f.cost);
    const depart = formatFlightTime(f.depart);
    const arrive = formatFlightTime(f.arrive);

    // Get airport coords
    const fromCoords = getAirportCoords(f.from);
    const toCoords = getAirportCoords(f.to);
    console.log('Flight coords:', { from: f.from, to: f.to, fromCoords, toCoords });

    sheet.appendChild(el('div', { class: 'handle' }));
    
    // Build navigation - both chevrons on left like activity sheet
    const navChildren = [];
    
    if (navContext) {
      const hasPrev = navContext.currentIndex > 0;
      const hasNext = navContext.currentIndex < navContext.bookings.length - 1;
      
      // Left chevron
      navChildren.push(el('button', {
        class: 'sheet-chev toolbar-btn',
        disabled: hasPrev ? null : '',
        'aria-label': 'Previous booking',
        onclick: () => {
          if (!hasPrev) return;
          const prev = navContext.bookings[navContext.currentIndex - 1];
          const prevDay = D.days?.find(d => d.n === prev.dayNum);
          const newContext = { ...navContext, currentIndex: navContext.currentIndex - 1 };
          if (prev.type === 'Flights') openFlightSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Hotels') openHotelSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Tickets') openEventSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Rental Cars') openCarRentalSheet(prev.record, prevDay, newContext);
        }
      }, tabIcon('chev-left')));
      
      // Right chevron
      navChildren.push(el('button', {
        class: 'sheet-chev toolbar-btn',
        disabled: hasNext ? null : '',
        'aria-label': 'Next booking',
        onclick: () => {
          if (!hasNext) return;
          const next = navContext.bookings[navContext.currentIndex + 1];
          const nextDay = D.days?.find(d => d.n === next.dayNum);
          const newContext = { ...navContext, currentIndex: navContext.currentIndex + 1 };
          if (next.type === 'Flights') openFlightSheet(next.record, nextDay, newContext);
          else if (next.type === 'Hotels') openHotelSheet(next.record, nextDay, newContext);
          else if (next.type === 'Tickets') openEventSheet(next.record, nextDay, newContext);
          else if (next.type === 'Rental Cars') openCarRentalSheet(next.record, nextDay, newContext);
        }
      }, tabIcon('chev-right')));
    }
    
    // Right side actions
    navChildren.push(el('div', { class: 'sheet-nav-actions' },
      el('button', {
        class: 'toolbar-btn',
        'aria-label': 'Edit flight',
        onclick: () => openEditFlightSheet(f, day)
      }, tabIcon('edit')),
      buildSheetCloseButton(closeSheet)
    ));
    
    sheet.appendChild(el('div', { class: 'sheet-nav' }, ...navChildren));

    const body = el('div', { class: 'sheet-body' });

    // Flight route map hero - only show if we have valid coordinates
    const hasValidCoords = fromCoords && toCoords &&
                          typeof fromCoords[0] === 'number' &&
                          typeof fromCoords[1] === 'number' &&
                          typeof toCoords[0] === 'number' &&
                          typeof toCoords[1] === 'number';

    let heroWrap = null;
    let statusPillContainer = null;
    if (hasValidCoords) {
      heroWrap = el('div', { class: 'hero-wrap' });
      const mapHero = el('div', { class: 'flight-hero-map', id: 'flight-hero-map', 'aria-label': 'Flight route map' });
      heroWrap.appendChild(mapHero);
      // Create empty status pill container (will be populated when flight status loads)
      statusPillContainer = el('div', { class: 'hero-meta-pill', style: 'display: none;' });
      heroWrap.appendChild(statusPillContainer);
      body.appendChild(heroWrap);
    }

    body.appendChild(el('h2', { class: 'sheet-title' }, `${f.from} → ${f.to}`));
    
    // Airline and flight number meta
    const airlineParts = [];
    if (f.airline) airlineParts.push(f.airline);
    if (f.number) airlineParts.push(f.number);
    if (airlineParts.length) {
      body.appendChild(el('div', { class: 'sheet-meta-line' }, airlineParts.join(' ')));
    }

    // Labeled table
    const table = el('table', { class: 'sheet-facts' });
    if (depart && f.date) {
      const departFull = `${depart} · ${f.from}${f.fromCity ? ' · ' + f.fromCity : ''} · ${fmtDate(f.date).split(',')[0]}`;
      table.appendChild(el('tr', null, el('th', null, 'Depart'), el('td', null, departFull)));
    }
    if (arrive) {
      const arriveDate = f.arriveDate || f.date;
      const arriveFull = `${arrive} · ${f.to}${f.toCity ? ' · ' + f.toCity : ''}${arriveDate ? ' · ' + fmtDate(arriveDate).split(',')[0] : ''}`;
      table.appendChild(el('tr', null, el('th', null, 'Arrive'), el('td', null, arriveFull)));
    }
    if (f.bookingCode) {
      table.appendChild(el('tr', null, el('th', null, 'Booking Code'), el('td', null, f.bookingCode)));
    }
    if (costText) {
      table.appendChild(el('tr', null, el('th', null, 'Cost'), el('td', null, costText)));
    }
    if (table.children.length) body.appendChild(table);
    
    // Container for extra meta info (delays, gates) - will be populated async
    const extraMetaContainer = el('div', { class: 'flight-extra-meta' });
    body.appendChild(extraMetaContainer);
    
    // Fetch live flight status
    fetchFlightStatus(f).then(flightData => {
      if (flightData) {
        const liveInfo = buildFlightLiveInfo(flightData);
        if (liveInfo) {
          // Add status badge to the pre-created pill container
          if (liveInfo.statusBadge && statusPillContainer) {
            statusPillContainer.appendChild(liveInfo.statusBadge);
            statusPillContainer.style.display = '';
            console.log('Added status badge to pill container:', flightData.status);
          }
          
          // Add live position row at the TOP of the table (if exists)
          if (liveInfo.liveRow) {
            const firstRow = table.firstChild;
            table.insertBefore(liveInfo.liveRow, firstRow);
          }
          
          // Add delay and gate info below table
          if (liveInfo.delayInfo) {
            extraMetaContainer.appendChild(liveInfo.delayInfo);
          }
          if (liveInfo.gateInfo) {
            extraMetaContainer.appendChild(liveInfo.gateInfo);
          }
          
          // Update map with live position if available
          if (liveInfo.liveMarkerData && leafletSheet) {
            const bearing = window.flightRouteBearing || 0;
            const liveMarker = L.marker([liveInfo.liveMarkerData.latitude, liveInfo.liveMarkerData.longitude], {
              icon: L.divIcon({
                className: 'flight-live-marker',
                html: `<div style="transform: rotate(${bearing}deg); font-size: 24px; line-height: 1;">✈️</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })
            }).addTo(leafletSheet);
            
            // Pan map to show live position
            leafletSheet.panTo([liveInfo.liveMarkerData.latitude, liveInfo.liveMarkerData.longitude]);
          }
        }
      }
    }).catch(err => {
      console.error('Failed to fetch flight status:', err);
    });

    // Notes
    if (f.notes) {
      body.appendChild(el('div', { class: 'sheet-notes' },
        el('div', { class: 'notes-label' }, 'NOTES'),
        el('p', null, f.notes)
      ));
    }

    sheet.appendChild(body);

    // Single View Receipt button
    if (receiptUrl) {
      sheet.appendChild(el('div', { class: 'sheet-actions single' },
        buildReceiptActionButton(receiptUrl, f.receipt)
      ));
    }

    backdrop.classList.add('open');
    requestAnimationFrame(() => sheet.classList.add('open'));

    // Initialize flight route map
    if (hasValidCoords) {
      setTimeout(() => {
        const mapNode = $('#flight-hero-map');
        if (!mapNode || leafletSheet) return;

        // Adjust longitude for routes that cross the date line
        let toLng = toCoords[1];
        const lngDiffRaw = toCoords[1] - fromCoords[1];
        
        // If the route spans more than 180 degrees, we're going the long way
        // Adjust to take the shorter path
        if (lngDiffRaw > 180) {
          toLng = toCoords[1] - 360;
        } else if (lngDiffRaw < -180) {
          toLng = toCoords[1] + 360;
        }

        // Calculate distance for arc height
        const latDiff = Math.abs(toCoords[0] - fromCoords[0]);
        const lngDiff = Math.abs(toLng - fromCoords[1]);
        const maxDiff = Math.max(latDiff, lngDiff);
        
        // Initialize map without center/zoom - will use fitBounds later
        leafletSheet = L.map(mapNode, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          touchZoom: false,
          boxZoom: false,
          keyboard: false,
          tap: false
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          subdomains: 'abcd'
        }).addTo(leafletSheet);

        // Arc path - curve perpendicular to flight direction
        const arcPoints = [];
        const steps = 50;
        const arcHeight = Math.max(maxDiff * 0.15, 2); // Arc height scales with distance
        
        // If mostly north-south, arc east-west; if mostly east-west, arc north-south
        const isNorthSouth = latDiff > lngDiff;
        
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const lat = fromCoords[0] + (toCoords[0] - fromCoords[0]) * t;
          const lng = fromCoords[1] + (toLng - fromCoords[1]) * t;
          const arcOffset = Math.sin(t * Math.PI) * arcHeight;
          
          if (isNorthSouth) {
            // North-south flight: arc sideways (east-west)
            arcPoints.push([lat, lng + arcOffset]);
          } else {
            // East-west flight: arc up/down (north-south)
            arcPoints.push([lat + arcOffset, lng]);
          }
        }
        
        L.polyline(arcPoints, {
          color: accent,
          weight: 2,
          dashArray: '6 4',
          opacity: 0.8
        }).addTo(leafletSheet);

        // Airport markers
        const fromIcon = L.divIcon({
          html: `<div class="flight-airport-marker">
            <div class="flight-airport-code">${f.from}</div>
            <div class="flight-airport-label">${f.fromCity || f.from}</div>
          </div>`,
          className: '',
          iconSize: [60, 40],
          iconAnchor: [30, 20]
        });
        const toIcon = L.divIcon({
          html: `<div class="flight-airport-marker">
            <div class="flight-airport-code">${f.to}</div>
            <div class="flight-airport-label">${f.toCity || f.to}</div>
          </div>`,
          className: '',
          iconSize: [60, 40],
          iconAnchor: [30, 20]
        });
        
        L.marker(fromCoords, { icon: fromIcon }).addTo(leafletSheet);
        L.marker([toCoords[0], toLng], { icon: toIcon }).addTo(leafletSheet);
        
        // Store bearing calculation for live plane rotation
        window.flightRouteBearing = Math.atan2(
          toLng - fromCoords[1],
          toCoords[0] - fromCoords[0]
        ) * (180 / Math.PI);
        
        // Fit bounds after map container is properly sized
        setTimeout(() => {
          leafletSheet.invalidateSize();
          const bounds = L.latLngBounds([fromCoords, [toCoords[0], toLng]]);
          leafletSheet.fitBounds(bounds, { 
            padding: [20, 20],
            maxZoom: 7
          });
          console.log('Map fitted to bounds:', { route: `${f.from}-${f.to}`, bounds: bounds.toBBoxString() });
        }, 150);
      }, 100);
    }
  }

  // ─── Edit Flight Sheet ──────────────────────────────────────────────────────
  let editFlightDraft = null;
  let editFlightDay = null;

  function flightToDraft(f){
    return {
      rowId: f.id || null,
      airline: f.airline || '',
      flightNum: f.flightNum || '',
      from: f.from || '',
      to: f.to || '',
      fromCity: f.fromCity || '',
      toCity: f.toCity || '',
      date: f.date || '',
      arriveDate: f.arriveDate || '',
      depart: f.depart || '',
      arrive: f.arrive || '',
      bookingCode: f.bookingCode || '',
      cost: f.cost != null && f.cost !== '' ? String(f.cost) : ''
    };
  }

  function ensureEditFlightSheetDom(){
    const root = $('#app') || $('.phone-fullscreen') || document.body;
    let backdrop = $('#edit-flight-backdrop');
    let sheet = $('#edit-flight-sheet');
    if (!backdrop) {
      backdrop = el('div', { id: 'edit-flight-backdrop', class: 'sheet-backdrop sheet-stack-2' });
      root.appendChild(backdrop);
    }
    if (!sheet) {
      sheet = el('div', { id: 'edit-flight-sheet', class: 'sheet sheet-stack-2' });
      root.appendChild(sheet);
    }
    return { sheet, backdrop };
  }

  function hideEditFlightSheet(){
    const sheet = $('#edit-flight-sheet');
    const backdrop = $('#edit-flight-backdrop');
    if (!sheet || !backdrop) return;
    clearSheetDragStyles(sheet);
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    backdrop.onclick = null;
    editFlightDraft = null;
    editFlightDay = null;
  }

  function openEditFlightDatePicker(){
    if (!editFlightDraft) return;
    openPickTray({
      title: 'Date',
      value: editFlightDraft.date,
      options: hotelDatePickerOptions(),
      onPick: (value) => {
        editFlightDraft.date = value;
        updateEditPickerLabel('edit-flight-date-label', hotelDateLabel(value));
      }
    });
  }

  async function openEditFlightSheet(f, day){
    const flight = await ensureFlightRecord(f);
    if (!flight?.id) {
      toast('Couldn\u2019t load flight for editing');
      return;
    }
    editFlightDay = day || null;
    editFlightDraft = flightToDraft(flight);
    const { sheet, backdrop } = ensureEditFlightSheetDom();
    const draft = editFlightDraft;
    sheet.innerHTML = '';

    sheet.appendChild(buildSheetCloseButton(hideEditFlightSheet));
    sheet.appendChild(el('div', { class: 'sheet-form-header' },
      el('h2', { class: 'sheet-form-title' }, 'Edit Flight')
    ));

    const form = el('div', { class: 'edit-activity-container' },
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-flight-airline' }, 'Airline'),
        el('input', {
          type: 'text',
          id: 'edit-flight-airline',
          class: 'edit-input',
          value: draft.airline,
          oninput: (e) => { draft.airline = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-flight-number' }, 'Flight #'),
        el('input', {
          type: 'text',
          id: 'edit-flight-number',
          class: 'edit-input',
          value: draft.flightNum,
          oninput: (e) => { draft.flightNum = e.target.value; }
        })
      ),
      buildEditPickerField('Depart date', 'edit-flight-date-label', hotelDateLabel(draft.date), openEditFlightDatePicker),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-flight-from-code' }, 'Departure code'),
        el('input', {
          type: 'text',
          id: 'edit-flight-from-code',
          class: 'edit-input',
          value: draft.from,
          oninput: (e) => { draft.from = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-flight-from-city' }, 'Depart city'),
        el('input', {
          type: 'text',
          id: 'edit-flight-from-city',
          class: 'edit-input',
          value: draft.fromCity,
          oninput: (e) => { draft.fromCity = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-flight-depart' }, 'Depart time'),
        el('input', {
          type: 'text',
          id: 'edit-flight-depart',
          class: 'edit-input',
          value: draft.depart,
          placeholder: '1:30 PM',
          oninput: (e) => { draft.depart = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-flight-to-code' }, 'Arrival code'),
        el('input', {
          type: 'text',
          id: 'edit-flight-to-code',
          class: 'edit-input',
          value: draft.to,
          oninput: (e) => { draft.to = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-flight-to-city' }, 'Arrive city'),
        el('input', {
          type: 'text',
          id: 'edit-flight-to-city',
          class: 'edit-input',
          value: draft.toCity,
          oninput: (e) => { draft.toCity = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-flight-arrive' }, 'Arrive time'),
        el('input', {
          type: 'text',
          id: 'edit-flight-arrive',
          class: 'edit-input',
          value: draft.arrive,
          placeholder: '4:00 PM',
          oninput: (e) => { draft.arrive = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-flight-cost' }, 'Cost (USD)'),
        el('input', {
          type: 'text',
          id: 'edit-flight-cost',
          class: 'edit-input',
          value: draft.cost,
          oninput: (e) => { draft.cost = e.target.value; }
        })
      )
    );
    sheet.appendChild(form);
    sheet.appendChild(el('div', { class: 'edit-sheet-actions' },
      el('button', {
        id: 'edit-flight-submit',
        class: 'oc-btn',
        onclick: submitUpdateFlight
      }, 'Update')
    ));

    backdrop.classList.add('open');
    backdrop.onclick = hideEditFlightSheet;
    requestAnimationFrame(() => sheet.classList.add('open'));
  }

  async function submitUpdateFlight(){
    const draft = editFlightDraft;
    if (!draft) return;

    const activeTrip = getTrips().find(t => t.active);
    if (!activeTrip) {
      toast('Select a trip to continue');
      return;
    }
    if (!draft.rowId) {
      toast('Flight can\u2019t be edited');
      return;
    }

    const costStr = draft.cost.trim();
    let cost = null;
    if (costStr !== '') {
      cost = parseFloat(costStr);
      if (isNaN(cost)) {
        toast('Cost must be a number');
        return;
      }
    }

    const btn = $('#edit-flight-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
    }

    const savedDay = editFlightDay;
    const rowId = draft.rowId;
    const flightPatch = {
      airline: draft.airline.trim(),
      flightNum: draft.flightNum.trim(),
      from: draft.from.trim(),
      to: draft.to.trim(),
      fromCity: draft.fromCity.trim(),
      toCity: draft.toCity.trim(),
      date: draft.date || '',
      arriveDate: draft.arriveDate || '',
      depart: draft.depart.trim(),
      arrive: draft.arrive.trim(),
      bookingCode: draft.bookingCode.trim(),
      cost
    };

    await syncTripRecordEdit({
      applyLocal: () => patchTripRecord('flights', rowId, flightPatch),
      apiCall: async () => {
        const body = { docUrl: activeTrip.url, rowId, type: 'flight', data: flightPatch };
        if (activeTrip.token) body.token = activeTrip.token;
        const res = await fetch('/api/update-record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Failed to update flight');
      },
      hideEditSheet: hideEditFlightSheet,
      reopenDetail: openFlightSheet,
      savedDay,
      successToast: 'Flight updated',
      failToast: 'Couldn\u2019t update flight',
      submitBtn: btn,
      submitBtnLabel: 'Update'
    });
  }

  async function openHotelSheet(h, day, navContext){
    state.sheet = null;
    state.flightSheet = null;
    state.eventSheet = null;
    state.carRentalSheet = null;
    h = resolveHotelRecord(h);
    state.hotelSheet = h;
    const backdrop = $('#sheet-backdrop');
    const sheet = $('#sheet');
    if (!backdrop || !sheet) {
      console.error('Sheet elements not found');
      return;
    }
    sheet.innerHTML = '';

    const accent = day?.color || dayAccent(day?.n) || '#8b5cf6';
    const nightsText = h.nights === 1 ? '1 night' : `${h.nights} nights`;
    const lat = normalizeCoord(h.lat);
    const lng = normalizeCoord(h.lng);
    const hasCoords = lat != null && lng != null;
    const directionsUrl = buildHotelDirectionsUrl(h, day);

    // Try to get Google photo
    const cachedEnrichment = getCachedPlaceEnrichment('hotel', h);
    const hasGooglePhoto = cachedEnrichment?.photoUrl;

    // Request enrichment if not cached (but we don't need to do anything with it here)
    if (!cachedEnrichment && h.name) {
      requestPlaceEnrichment('hotel', h, () => {});
    }

    sheet.appendChild(el('div', { class: 'handle' }));
    
    // Build navigation - both chevrons on left like activity sheet
    const navChildren = [];
    
    if (navContext) {
      const hasPrev = navContext.currentIndex > 0;
      const hasNext = navContext.currentIndex < navContext.bookings.length - 1;
      
      // Left chevron
      navChildren.push(el('button', {
        class: 'sheet-chev toolbar-btn',
        disabled: hasPrev ? null : '',
        'aria-label': 'Previous booking',
        onclick: () => {
          if (!hasPrev) return;
          const prev = navContext.bookings[navContext.currentIndex - 1];
          const prevDay = D.days?.find(d => d.n === prev.dayNum);
          const newContext = { ...navContext, currentIndex: navContext.currentIndex - 1 };
          if (prev.type === 'Flights') openFlightSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Hotels') openHotelSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Tickets') openEventSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Rental Cars') openCarRentalSheet(prev.record, prevDay, newContext);
        }
      }, tabIcon('chev-left')));
      
      // Right chevron
      navChildren.push(el('button', {
        class: 'sheet-chev toolbar-btn',
        disabled: hasNext ? null : '',
        'aria-label': 'Next booking',
        onclick: () => {
          if (!hasNext) return;
          const next = navContext.bookings[navContext.currentIndex + 1];
          const nextDay = D.days?.find(d => d.n === next.dayNum);
          const newContext = { ...navContext, currentIndex: navContext.currentIndex + 1 };
          if (next.type === 'Flights') openFlightSheet(next.record, nextDay, newContext);
          else if (next.type === 'Hotels') openHotelSheet(next.record, nextDay, newContext);
          else if (next.type === 'Tickets') openEventSheet(next.record, nextDay, newContext);
          else if (next.type === 'Rental Cars') openCarRentalSheet(next.record, nextDay, newContext);
        }
      }, tabIcon('chev-right')));
    }
    
    // Right side actions
    navChildren.push(el('div', { class: 'sheet-nav-actions' },
      el('button', {
        class: 'toolbar-btn',
        'aria-label': 'Edit hotel',
        onclick: () => openEditHotelSheet(h, day)
      }, tabIcon('edit')),
      buildSheetCloseButton(closeSheet)
    ));
    
    sheet.appendChild(el('div', { class: 'sheet-nav' }, ...navChildren));

    const body = el('div', { class: 'sheet-body' });

    // Build date pill content (used in hero and fallback meta)
    const dateParts = [];
    if (h.startDate && h.endDate) {
      dateParts.push(`${fmtDate(h.startDate).split(',')[0]} → ${fmtDate(h.endDate).split(',')[0]}`);
    }
    if (nightsText) dateParts.push(nightsText);
    if (h.city) dateParts.push(h.city);

    // Hero section - Google photo or map fallback
    if (hasGooglePhoto || hasCoords) {
      const heroWrap = el('div', { class: 'hero-wrap' });
      const datePill = dateParts.length ? el('div', { class: 'hero-meta-pill' }, dateParts.join(' · ')) : null;

      if (hasGooglePhoto) {
        // A ★ - Google photo hero with carousel
        const photoUrls = cachedEnrichment.photoUrls || [cachedEnrichment.photoUrl];
        const carousel = buildPhotoCarousel(photoUrls, h.name);
        if (carousel) {
          heroWrap.appendChild(carousel);
        } else {
          const heroImg = el('img', { class: 'hero-photo', src: cachedEnrichment.photoUrl, alt: h.name });
          heroWrap.appendChild(heroImg);
        }
        if (datePill) heroWrap.appendChild(datePill);
      } else if (hasCoords) {
        // B - Map fallback hero
        const mapHero = el('div', { class: 'hero-map', id: 'hotel-hero-map' });
        heroWrap.appendChild(mapHero);
        
        // Walk chip on map
        if (state.location) {
          const km = haversine(state.location, { lat, lng });
          const walkMin = Math.round(km / 5 * 60);
          const walkChip = el('div', { class: 'hero-meta-pill' }, `${walkMin} min · ${km.toFixed(1)} km`);
          heroWrap.appendChild(walkChip);
        }
      }

      body.appendChild(heroWrap);
    }

    body.appendChild(el('h2', { class: 'sheet-title' }, h.name));

    // Google rating or fallback meta line
    if (hasGooglePhoto && cachedEnrichment.rating) {
      const ratingEl = el('div', { class: 'sheet-rating' },
        el('span', { class: 'star' }, '★'),
        ` ${cachedEnrichment.rating} `,
        cachedEnrichment.reviewCount ? el('span', { class: 'count' }, `(${formatReviewCount(cachedEnrichment.reviewCount)} reviews)`) : null
      );
      body.appendChild(ratingEl);
    } else if (!hasGooglePhoto && dateParts.length) {
      // Fallback: show date meta under title
      body.appendChild(el('div', { class: 'sheet-meta-line' }, dateParts.join(' · ')));
    }

    // Description (if from Google or notes)
    if (cachedEnrichment?.description) {
      body.appendChild(el('div', { class: 'sheet-desc' }, el('p', null, cachedEnrichment.description)));
    }

    // Labeled table
    const table = el('table', { class: 'sheet-facts' });
    if (h.roomType) {
      table.appendChild(el('tr', null, el('th', null, 'Room'), el('td', null, h.roomType)));
    }
    if (h.address) {
      table.appendChild(el('tr', null, el('th', null, 'Address'), el('td', null, h.address)));
    }
    if (h.bookingCode) {
      table.appendChild(el('tr', null, el('th', null, 'Booking Code'), el('td', null, h.bookingCode)));
    }
    if (h.cost != null) {
      const costText = typeof h.cost === 'number' ? `$${h.cost.toFixed(0)}` : String(h.cost);
      table.appendChild(el('tr', null, el('th', null, 'Cost'), el('td', null, costText)));
    }
    if (table.children.length) body.appendChild(table);

    // Location map card (only for A ★ variant)
    if (hasGooglePhoto && hasCoords) {
      const mapCard = el('div', { class: 'sheet-map-card', 'aria-label': 'Hotel location map' },
        el('div', { id: 'hotel-sheet-map' }),
        el('div', { class: 'sheet-map-pin' })
      );
      
      if (state.location) {
        const km = haversine(state.location, { lat, lng });
        const walkMin = Math.round(km / 5 * 60);
        const walkChip = el('div', { class: 'sheet-map-overlay' }, `${walkMin} min · ${km.toFixed(1)} km`);
        mapCard.appendChild(walkChip);
      }
      
      body.appendChild(mapCard);
    }

    sheet.appendChild(body);

    // Action buttons
    const actionButtons = [];
    if (h.receiptUrl && isHttpUrl(h.receiptUrl)) {
      actionButtons.push(buildReceiptActionButton(h.receiptUrl, h.receipt, { secondary: true }));
    } else if (h.receipt) {
      actionButtons.push(el('div', { class: 'btn secondary disabled' }, 'View Receipt'));
    }
    
    const mapsUrl = hasCoords ? (isHotelInKorea(h, day)
      ? `https://map.naver.com/v5/search/${encodeURIComponent(h.name)}`
      : `https://maps.google.com/?q=${encodeURIComponent(h.name)}`)
      : null;
    if (mapsUrl) {
      actionButtons.push(el('a', { class: 'btn secondary', href: mapsUrl, target: '_blank', rel: 'noopener' }, 'Open in Maps'));
    }
    
    if (directionsUrl) {
      actionButtons.push(el('a', { class: 'btn', href: directionsUrl, target: '_blank', rel: 'noopener' }, 'Get Directions'));
    }
    
    if (actionButtons.length) {
      const actions = el('div', { class: sheetActionsClass(actionButtons.length) }, ...actionButtons);
      sheet.appendChild(actions);
    }

    backdrop.classList.add('open');
    requestAnimationFrame(() => sheet.classList.add('open'));

    // Initialize maps
    if (hasCoords) {
      setTimeout(() => {
        if (hasGooglePhoto) {
          // Location map card
          const mapNode = $('#hotel-sheet-map');
          if (mapNode && !leafletSheet) {
            leafletSheet = L.map(mapNode, {
              center: [lat, lng], zoom: 14,
              zoomControl: false, attributionControl: false,
              dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
              touchZoom: false, boxZoom: false, keyboard: false, tap: false
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
              subdomains: 'abcd'
            }).addTo(leafletSheet);
            L.marker([lat, lng], { icon: pinIcon('Hotel', accent) }).addTo(leafletSheet);
          }
        } else {
          // Hero map for fallback variant
          const heroMapNode = $('#hotel-hero-map');
          if (heroMapNode && !leafletSheet) {
            leafletSheet = L.map(heroMapNode, {
              center: [lat, lng], zoom: 13,
              zoomControl: false, attributionControl: false,
              dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
              touchZoom: false, boxZoom: false, keyboard: false, tap: false
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
              subdomains: 'abcd'
            }).addTo(leafletSheet);
          }
        }
      }, 100);
    }
  }

  function resolveEventRecord(ev){
    if (!ev) return null;
    if (ev.id) return ev;
    return (D.events || []).find(x =>
      x.id &&
      x.name === ev.name &&
      x.date === ev.date &&
      x.time === ev.time
    ) || ev;
  }

  async function ensureEventRecord(ev){
    let event = resolveEventRecord(ev);
    if (event?.id) return event;

    const activeTrip = getTrips().find(t => t.active);
    if (!activeTrip) return event;

    const normalizedUrl = activeTrip.url.split('#')[0].split('?')[0];
    localStorage.removeItem(`${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`);
    toast('Refreshing trip\u2026');
    try {
      await loadTripData(activeTrip.url, false, activeTrip.token || null, { preserveUi: true });
      event = resolveEventRecord(ev);
    } catch (err) {
      console.warn('Failed to refresh trip for event edit:', err);
    }
    return event;
  }

  async function openEventSheet(ev, day, navContext){
    state.sheet = null;
    state.hotelSheet = null;
    state.flightSheet = null;
    state.carRentalSheet = null;
    ev = resolveEventRecord(ev);
    state.eventSheet = ev;
    const backdrop = $('#sheet-backdrop');
    const sheet = $('#sheet');
    if (!backdrop || !sheet) {
      console.error('Sheet elements not found');
      return;
    }
    sheet.innerHTML = '';

    const accent = day?.color || dayAccent(day?.n) || '#8b5cf6';
    const directionsUrl = buildEventDirectionsUrl(ev, day);
    const infoUrl = isHttpUrl(ev.moreInfo) ? ev.moreInfo.trim() : '';
    let receiptUrl = isHttpUrl(ev.receiptUrl) ? ev.receiptUrl.trim() : '';
    if (!receiptUrl && ev.receipt && ev.id) {
      receiptUrl = await fetchEventReceiptUrl(ev.id);
      if (receiptUrl) ev.receiptUrl = receiptUrl;
    }
    const costText = formatEventCost(ev.cost);
    const lat = normalizeCoord(ev.lat);
    const lng = normalizeCoord(ev.lng);
    const hasCoords = lat != null && lng != null;

    // Try to get Google photo
    const cachedEnrichment = getCachedPlaceEnrichment('event', ev);
    const hasGooglePhoto = cachedEnrichment?.photoUrl;

    // Request enrichment if not cached (but we don't need to do anything with it here)
    if (!cachedEnrichment && ev.name) {
      requestPlaceEnrichment('event', ev, () => {});
    }

    sheet.appendChild(el('div', { class: 'handle' }));
    
    // Build navigation - both chevrons on left like activity sheet
    const navChildren = [];
    
    if (navContext) {
      const hasPrev = navContext.currentIndex > 0;
      const hasNext = navContext.currentIndex < navContext.bookings.length - 1;
      
      // Left chevron
      navChildren.push(el('button', {
        class: 'sheet-chev toolbar-btn',
        disabled: hasPrev ? null : '',
        'aria-label': 'Previous booking',
        onclick: () => {
          if (!hasPrev) return;
          const prev = navContext.bookings[navContext.currentIndex - 1];
          const prevDay = D.days?.find(d => d.n === prev.dayNum);
          const newContext = { ...navContext, currentIndex: navContext.currentIndex - 1 };
          if (prev.type === 'Flights') openFlightSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Hotels') openHotelSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Tickets') openEventSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Rental Cars') openCarRentalSheet(prev.record, prevDay, newContext);
        }
      }, tabIcon('chev-left')));
      
      // Right chevron
      navChildren.push(el('button', {
        class: 'sheet-chev toolbar-btn',
        disabled: hasNext ? null : '',
        'aria-label': 'Next booking',
        onclick: () => {
          if (!hasNext) return;
          const next = navContext.bookings[navContext.currentIndex + 1];
          const nextDay = D.days?.find(d => d.n === next.dayNum);
          const newContext = { ...navContext, currentIndex: navContext.currentIndex + 1 };
          if (next.type === 'Flights') openFlightSheet(next.record, nextDay, newContext);
          else if (next.type === 'Hotels') openHotelSheet(next.record, nextDay, newContext);
          else if (next.type === 'Tickets') openEventSheet(next.record, nextDay, newContext);
          else if (next.type === 'Rental Cars') openCarRentalSheet(next.record, nextDay, newContext);
        }
      }, tabIcon('chev-right')));
    }
    
    // Right side actions
    navChildren.push(el('div', { class: 'sheet-nav-actions' },
      el('button', {
        class: 'toolbar-btn',
        'aria-label': 'Edit ticket',
        onclick: () => openEditEventSheet(ev, day)
      }, tabIcon('edit')),
      buildSheetCloseButton(closeSheet)
    ));
    
    sheet.appendChild(el('div', { class: 'sheet-nav' }, ...navChildren));

    const body = el('div', { class: 'sheet-body' });

    // Build time pill content (used in hero and fallback meta)
    const timeParts = [];
    if (ev.date) timeParts.push(fmtDate(ev.date).split(',')[0]);
    const timeRange = formatEventTimeRange(ev);
    if (timeRange) timeParts.push(timeRange);
    if (ev.provider) timeParts.push(ev.provider);

    // Hero section - Google photo or map fallback
    if (hasGooglePhoto || hasCoords) {
      const heroWrap = el('div', { class: 'hero-wrap' });
      const timePill = timeParts.length ? el('div', { class: 'hero-meta-pill' }, timeParts.join(' · ')) : null;

      if (hasGooglePhoto) {
        // A ★ - Google photo hero with carousel
        const photoUrls = cachedEnrichment.photoUrls || [cachedEnrichment.photoUrl];
        const carousel = buildPhotoCarousel(photoUrls, ev.name);
        if (carousel) {
          heroWrap.appendChild(carousel);
        } else {
          const heroImg = el('img', { class: 'hero-photo', src: cachedEnrichment.photoUrl, alt: ev.name });
          heroWrap.appendChild(heroImg);
        }
        if (timePill) heroWrap.appendChild(timePill);
      } else if (hasCoords) {
        // B - Map fallback hero
        const mapHero = el('div', { class: 'hero-map', id: 'event-hero-map' });
        heroWrap.appendChild(mapHero);
        
        // Walk chip on map
        if (state.location) {
          const km = haversine(state.location, { lat, lng });
          const walkMin = Math.round(km / 5 * 60);
          const walkChip = el('div', { class: 'hero-meta-pill' }, `${walkMin} min · ${km.toFixed(1)} km`);
          heroWrap.appendChild(walkChip);
        }
      }

      body.appendChild(heroWrap);
    }

    body.appendChild(el('h2', { class: 'sheet-title' }, ev.name));

    // Google rating or fallback meta line
    if (hasGooglePhoto && cachedEnrichment.rating) {
      const ratingEl = el('div', { class: 'sheet-rating' },
        el('span', { class: 'star' }, '★'),
        ` ${cachedEnrichment.rating} `,
        cachedEnrichment.reviewCount ? el('span', { class: 'count' }, `(${formatReviewCount(cachedEnrichment.reviewCount)} reviews)`) : null
      );
      body.appendChild(ratingEl);
    } else if (!hasGooglePhoto && timeParts.length) {
      // Fallback: show time meta under title
      body.appendChild(el('div', { class: 'sheet-meta-line' }, timeParts.join(' · ')));
    }

    // Description (if from Google or notes)
    if (cachedEnrichment?.description) {
      body.appendChild(el('div', { class: 'sheet-desc' }, el('p', null, cachedEnrichment.description)));
    } else if (ev.notes) {
      body.appendChild(el('div', { class: 'sheet-desc' }, el('p', null, ev.notes)));
    }

    // Labeled table
    const table = el('table', { class: 'sheet-facts' });
    if (ev.provider) {
      table.appendChild(el('tr', null, el('th', null, 'Provider'), el('td', null, ev.provider)));
    }
    if (ev.date || timeRange) {
      const timeLine = [ev.date ? fmtDate(ev.date) : null, timeRange].filter(Boolean).join(' · ');
      table.appendChild(el('tr', null, el('th', null, 'Time'), el('td', null, timeLine)));
    }
    if (ev.meetupAddress) {
      table.appendChild(el('tr', null, el('th', null, 'Meetup'), el('td', null, ev.meetupAddress)));
    }
    if (ev.bookingRef) {
      table.appendChild(el('tr', null, el('th', null, 'Booking Ref'), el('td', null, ev.bookingRef)));
    }
    if (costText) {
      table.appendChild(el('tr', null, el('th', null, 'Cost'), el('td', null, costText)));
    }
    if (table.children.length) body.appendChild(table);

    // Location map card (only for A ★ variant)
    if (hasGooglePhoto && hasCoords) {
      const mapCard = el('div', { class: 'sheet-map-card sheet-map-card--ticket', 'aria-label': 'Event location map' },
        el('div', { id: 'event-sheet-map' }),
        el('div', { class: 'sheet-map-pin sheet-map-pin--ticket' })
      );
      
      if (state.location) {
        const km = haversine(state.location, { lat, lng });
        const walkMin = Math.round(km / 5 * 60);
        const walkChip = el('div', { class: 'sheet-map-overlay' }, `${walkMin} min · ${km.toFixed(1)} km`);
        mapCard.appendChild(walkChip);
      }
      
      body.appendChild(mapCard);
    }

    sheet.appendChild(body);

    // Action buttons - Directions always on right
    const actionButtons = [];
    if (receiptUrl) {
      actionButtons.push(buildReceiptActionButton(receiptUrl, ev.receipt, { secondary: true }));
    }
    if (infoUrl) {
      actionButtons.push(el('a', { class: 'btn secondary', href: infoUrl, target: '_blank', rel: 'noopener' }, 'More Info'));
    }
    if (directionsUrl) {
      actionButtons.push(el('a', { class: 'btn', href: directionsUrl, target: '_blank', rel: 'noopener' }, 'Get Directions'));
    }
    
    if (actionButtons.length) {
      const actions = el('div', { class: sheetActionsClass(actionButtons.length) }, ...actionButtons);
      sheet.appendChild(actions);
    }

    backdrop.classList.add('open');
    requestAnimationFrame(() => sheet.classList.add('open'));

    // Initialize maps
    if (hasCoords) {
      setTimeout(() => {
        if (hasGooglePhoto) {
          // Location map card
          const mapNode = $('#event-sheet-map');
          if (mapNode && !leafletSheet) {
            leafletSheet = L.map(mapNode, {
              center: [lat, lng], zoom: 14,
              zoomControl: false, attributionControl: false,
              dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
              touchZoom: false, boxZoom: false, keyboard: false, tap: false
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
              subdomains: 'abcd'
            }).addTo(leafletSheet);
            L.marker([lat, lng], { icon: pinIcon('Ticket', accent) }).addTo(leafletSheet);
          }
        } else {
          // Hero map for fallback variant
          const heroMapNode = $('#event-hero-map');
          if (heroMapNode && !leafletSheet) {
            leafletSheet = L.map(heroMapNode, {
              center: [lat, lng], zoom: 13,
              zoomControl: false, attributionControl: false,
              dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
              touchZoom: false, boxZoom: false, keyboard: false, tap: false
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
              subdomains: 'abcd'
            }).addTo(leafletSheet);
          }
        }
      }, 100);
    }
  }

  async function fetchEventReceiptUrl(rowId){
    const activeTrip = getTrips().find(t => t.active);
    if (!activeTrip) return '';

    try {
      const body = { docUrl: activeTrip.url, rowId, type: 'event' };
      if (activeTrip.token) body.token = activeTrip.token;
      const res = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return '';
      return isHttpUrl(payload.url) ? payload.url.trim() : '';
    } catch (err) {
      console.warn('Failed to resolve event receipt URL:', err);
      return '';
    }
  }

  // ─── Edit Event Sheet ─────────────────────────────────────────────────────
  let editEventDraft = null;
  let editEventDay = null;

  function eventToDraft(ev){
    return {
      rowId: ev.id || null,
      name: ev.name || '',
      provider: ev.provider || '',
      bookingRef: ev.bookingRef || '',
      date: ev.date || '',
      time: ev.time || '',
      endTime: ev.endTime || '',
      meetupAddress: ev.meetupAddress || '',
      notes: ev.notes || '',
      cost: ev.cost != null && ev.cost !== '' ? String(ev.cost) : '',
      moreInfo: ev.moreInfo || ''
    };
  }

  function uniqueEventValues(field){
    return [...new Set((D.events || []).map(e => e[field]).filter(Boolean))];
  }

  function eventDateLabel(date){ return date ? fmtDate(date) : 'None'; }

  function ensureEditEventSheetDom(){
    const root = $('#app') || $('.phone-fullscreen') || document.body;
    let backdrop = $('#edit-event-backdrop');
    let sheet = $('#edit-event-sheet');
    if (!backdrop) {
      backdrop = el('div', { id: 'edit-event-backdrop', class: 'sheet-backdrop sheet-stack-2' });
      root.appendChild(backdrop);
    }
    if (!sheet) {
      sheet = el('div', { id: 'edit-event-sheet', class: 'sheet sheet-stack-2' });
      root.appendChild(sheet);
    }
    return { sheet, backdrop };
  }

  function hideEditEventSheet(){
    const sheet = $('#edit-event-sheet');
    const backdrop = $('#edit-event-backdrop');
    if (!sheet || !backdrop) return;
    clearSheetDragStyles(sheet);
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    backdrop.onclick = null;
    editEventDraft = null;
    editEventDay = null;
  }

  function openEditEventProviderPicker(){
    if (!editEventDraft) return;
    openPickTray({
      title: 'Provider',
      value: editEventDraft.provider,
      options: EVENT_PROVIDERS.map(name => ({ value: name, label: name, sub: '' })),
      onPick: (value) => {
        editEventDraft.provider = value;
        updateEditPickerLabel('edit-event-provider-label', value || 'None');
      }
    });
  }

  function openEditEventDatePicker(){
    if (!editEventDraft) return;
    openPickTray({
      title: 'Date',
      value: editEventDraft.date,
      options: hotelDatePickerOptions(),
      onPick: (value) => {
        editEventDraft.date = value;
        updateEditPickerLabel('edit-event-date-label', eventDateLabel(value));
      }
    });
  }

  async function openEditEventSheet(ev, day){
    const event = await ensureEventRecord(ev);
    if (!event?.id) {
      toast('Couldn\u2019t load event for editing');
      return;
    }
    editEventDay = day || null;
    editEventDraft = eventToDraft(event);
    const { sheet, backdrop } = ensureEditEventSheetDom();
    const draft = editEventDraft;
    sheet.innerHTML = '';

    sheet.appendChild(buildSheetCloseButton(hideEditEventSheet));
    sheet.appendChild(el('div', { class: 'sheet-form-header' },
      el('h2', { class: 'sheet-form-title' }, 'Edit Ticket')
    ));

    const form = el('div', { class: 'edit-activity-container' },
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-event-name' }, 'Name'),
        el('input', {
          type: 'text',
          id: 'edit-event-name',
          class: 'edit-input',
          value: draft.name,
          oninput: (e) => { draft.name = e.target.value; }
        })
      ),
      buildEditPickerField('Provider', 'edit-event-provider-label', draft.provider || 'None', openEditEventProviderPicker),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-event-booking-ref' }, 'Booking reference'),
        el('input', {
          type: 'text',
          id: 'edit-event-booking-ref',
          class: 'edit-input',
          value: draft.bookingRef,
          oninput: (e) => { draft.bookingRef = e.target.value; }
        })
      ),
      buildEditPickerField('Date', 'edit-event-date-label', eventDateLabel(draft.date), openEditEventDatePicker),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-event-time' }, 'Time'),
        el('input', {
          type: 'text',
          id: 'edit-event-time',
          class: 'edit-input',
          value: draft.time,
          placeholder: '1:00 PM',
          oninput: (e) => { draft.time = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-event-meetup' }, 'Address'),
        el('input', {
          type: 'text',
          id: 'edit-event-meetup',
          class: 'edit-input',
          value: draft.meetupAddress,
          oninput: (e) => { draft.meetupAddress = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-event-notes' }, 'Notes'),
        el('textarea', {
          id: 'edit-event-notes',
          class: 'edit-input edit-textarea',
          rows: '3',
          oninput: (e) => { draft.notes = e.target.value; }
        }, draft.notes)
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-event-cost' }, 'Cost (USD)'),
        el('input', {
          type: 'text',
          id: 'edit-event-cost',
          class: 'edit-input',
          value: draft.cost,
          placeholder: '93.33',
          oninput: (e) => { draft.cost = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-event-more-info' }, 'More info URL'),
        el('input', {
          type: 'url',
          id: 'edit-event-more-info',
          class: 'edit-input',
          value: draft.moreInfo,
          oninput: (e) => { draft.moreInfo = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-event-end-time' }, 'End time'),
        el('input', {
          type: 'text',
          id: 'edit-event-end-time',
          class: 'edit-input',
          value: draft.endTime,
          placeholder: '1:30 PM',
          oninput: (e) => { draft.endTime = e.target.value; }
        })
      )
    );
    sheet.appendChild(form);
    sheet.appendChild(el('div', { class: 'edit-sheet-actions' },
      el('button', {
        id: 'edit-event-submit',
        class: 'oc-btn',
        onclick: submitUpdateEvent
      }, 'Update')
    ));

    backdrop.classList.add('open');
    backdrop.onclick = hideEditEventSheet;
    requestAnimationFrame(() => sheet.classList.add('open'));
  }

  async function submitUpdateEvent(){
    const draft = editEventDraft;
    if (!draft) return;

    const trips = getTrips();
    const activeTrip = trips.find(t => t.active);
    if (!activeTrip) {
      toast('Select a trip to continue');
      return;
    }

    if (!draft.rowId) {
      toast('Event can\u2019t be edited');
      return;
    }

    const name = draft.name.trim();
    if (!name) {
      toast('Enter an event name');
      return;
    }

    const costStr = draft.cost.trim();
    let cost = null;
    if (costStr !== '') {
      cost = parseFloat(costStr);
      if (isNaN(cost)) {
        toast('Cost must be a number');
        return;
      }
    }

    const btn = $('#edit-event-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
    }

    const savedDay = editEventDay;
    const rowId = draft.rowId;
    const eventPatch = {
      name,
      provider: draft.provider || '',
      bookingRef: draft.bookingRef.trim(),
      date: draft.date || '',
      time: draft.time.trim(),
      endTime: draft.endTime.trim(),
      meetupAddress: draft.meetupAddress.trim(),
      notes: draft.notes.trim(),
      cost,
      moreInfo: draft.moreInfo.trim()
    };

    await syncTripRecordEdit({
      applyLocal: () => patchTripRecord('events', rowId, eventPatch),
      apiCall: async () => {
        const body = { docUrl: activeTrip.url, rowId, type: 'event', data: eventPatch };
        if (activeTrip.token) body.token = activeTrip.token;
        const res = await fetch('/api/update-record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Failed to update event');
      },
      hideEditSheet: hideEditEventSheet,
      reopenDetail: openEventSheet,
      savedDay,
      successToast: 'Event updated',
      failToast: 'Couldn\u2019t update event',
      submitBtn: btn,
      submitBtnLabel: 'Update'
    });
  }

  function resolveCarRentalRecord(cr){
    if (!cr) return null;
    if (cr.id) return cr;
    return (D.carRentals || []).find(x =>
      x.id &&
      x.pickupDate === cr.pickupDate &&
      x.provider === cr.provider &&
      x.carType === cr.carType
    ) || cr;
  }

  async function ensureCarRentalRecord(cr){
    let rental = resolveCarRentalRecord(cr);
    if (rental?.id) return rental;

    const activeTrip = getTrips().find(t => t.active);
    if (!activeTrip) return rental;

    const normalizedUrl = activeTrip.url.split('#')[0].split('?')[0];
    localStorage.removeItem(`${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`);
    toast('Refreshing trip\u2026');
    try {
      await loadTripData(activeTrip.url, false, activeTrip.token || null, { preserveUi: true });
      rental = resolveCarRentalRecord(cr);
    } catch (err) {
      console.warn('Failed to refresh trip for car rental edit:', err);
    }
    return rental;
  }

  async function fetchCarRentalReceiptUrl(rowId){
    const activeTrip = getTrips().find(t => t.active);
    if (!activeTrip) return '';

    try {
      const body = { docUrl: activeTrip.url, rowId, type: 'carRental' };
      if (activeTrip.token) body.token = activeTrip.token;
      const res = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return '';
      return isHttpUrl(payload.url) ? payload.url.trim() : '';
    } catch (err) {
      console.warn('Failed to resolve car rental receipt URL:', err);
      return '';
    }
  }

  async function openCarRentalSheet(cr, day, navContext){
    state.sheet = null;
    state.hotelSheet = null;
    state.flightSheet = null;
    state.eventSheet = null;
    cr = resolveCarRentalRecord(cr);
    state.carRentalSheet = cr;
    const backdrop = $('#sheet-backdrop');
    const sheet = $('#sheet');
    sheet.innerHTML = '';

    const accent = day?.color || dayAccent(day?.n) || '#8b5cf6';
    const directionsUrl = buildCarRentalDirectionsUrl(cr, day);
    let receiptUrl = isHttpUrl(cr.receiptUrl) ? cr.receiptUrl.trim() : '';
    if (!receiptUrl && cr.receipt && cr.id) {
      receiptUrl = await fetchCarRentalReceiptUrl(cr.id);
      if (receiptUrl) cr.receiptUrl = receiptUrl;
    }
    const costText = formatEventCost(cr.cost);
    const lat = normalizeCoord(cr.lat);
    const lng = normalizeCoord(cr.lng);
    const hasCoords = lat != null && lng != null;

    sheet.appendChild(el('div', { class: 'handle' }));
    
    // Build navigation - both chevrons on left like activity sheet
    const navChildren = [];
    
    if (navContext) {
      const hasPrev = navContext.currentIndex > 0;
      const hasNext = navContext.currentIndex < navContext.bookings.length - 1;
      
      // Left chevron
      navChildren.push(el('button', {
        class: 'sheet-chev toolbar-btn',
        disabled: hasPrev ? null : '',
        'aria-label': 'Previous booking',
        onclick: () => {
          if (!hasPrev) return;
          const prev = navContext.bookings[navContext.currentIndex - 1];
          const prevDay = D.days?.find(d => d.n === prev.dayNum);
          const newContext = { ...navContext, currentIndex: navContext.currentIndex - 1 };
          if (prev.type === 'Flights') openFlightSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Hotels') openHotelSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Tickets') openEventSheet(prev.record, prevDay, newContext);
          else if (prev.type === 'Rental Cars') openCarRentalSheet(prev.record, prevDay, newContext);
        }
      }, tabIcon('chev-left')));
      
      // Right chevron
      navChildren.push(el('button', {
        class: 'sheet-chev toolbar-btn',
        disabled: hasNext ? null : '',
        'aria-label': 'Next booking',
        onclick: () => {
          if (!hasNext) return;
          const next = navContext.bookings[navContext.currentIndex + 1];
          const nextDay = D.days?.find(d => d.n === next.dayNum);
          const newContext = { ...navContext, currentIndex: navContext.currentIndex + 1 };
          if (next.type === 'Flights') openFlightSheet(next.record, nextDay, newContext);
          else if (next.type === 'Hotels') openHotelSheet(next.record, nextDay, newContext);
          else if (next.type === 'Tickets') openEventSheet(next.record, nextDay, newContext);
          else if (next.type === 'Rental Cars') openCarRentalSheet(next.record, nextDay, newContext);
        }
      }, tabIcon('chev-right')));
    }
    
    // Right side actions
    navChildren.push(el('div', { class: 'sheet-nav-actions' },
      el('button', {
        class: 'toolbar-btn',
        'aria-label': 'Edit car rental',
        onclick: () => openEditCarRentalSheet(cr, day)
      }, tabIcon('edit')),
      buildSheetCloseButton(closeSheet)
    ));
    
    sheet.appendChild(el('div', { class: 'sheet-nav' }, ...navChildren));

    const body = el('div', { class: 'sheet-body' });

    // Map hero with walk chip
    if (hasCoords) {
      const heroWrap = el('div', { class: 'hero-wrap' });
      const mapHero = el('div', { class: 'hero-map', id: 'car-hero-map' });
      heroWrap.appendChild(mapHero);
      
      // Walk chip on map
      if (state.location) {
        const km = haversine(state.location, { lat, lng });
        const walkMin = Math.round(km / 5 * 60);
        const walkChip = el('div', { class: 'hero-meta-pill' }, `${walkMin} min · ${km.toFixed(1)} km`);
        heroWrap.appendChild(walkChip);
      }
      
      body.appendChild(heroWrap);
    }

    body.appendChild(el('h2', { class: 'sheet-title' }, carRentalTitle(cr)));
    
    // Build time meta line
    const timeParts = [];
    if (cr.pickupDate && cr.pickupTime) {
      timeParts.push(`${fmtDate(cr.pickupDate).split(',')[0]} · ${cr.pickupTime}`);
    } else if (cr.pickupDate) {
      timeParts.push(fmtDate(cr.pickupDate).split(',')[0]);
    }
    if (cr.returnDate && cr.returnTime) {
      timeParts.push(`${fmtDate(cr.returnDate).split(',')[0]} · ${cr.returnTime}`);
    } else if (cr.returnDate) {
      timeParts.push(fmtDate(cr.returnDate).split(',')[0]);
    }
    if (timeParts.length) {
      body.appendChild(el('div', { class: 'sheet-meta-line' }, timeParts.join(' → ')));
    }

    // Description (from notes)
    if (cr.notes) {
      body.appendChild(el('div', { class: 'sheet-desc' }, el('p', null, cr.notes)));
    }

    // Labeled table
    const table = el('table', { class: 'sheet-facts' });
    if (cr.pickupDate && cr.pickupTime) {
      table.appendChild(el('tr', null, el('th', null, 'Pick-up'), el('td', null, `${fmtDate(cr.pickupDate).split(',')[0]} · ${cr.pickupTime}`)));
    }
    if (cr.returnDate && cr.returnTime) {
      table.appendChild(el('tr', null, el('th', null, 'Return'), el('td', null, `${fmtDate(cr.returnDate).split(',')[0]} · ${cr.returnTime}`)));
    }
    if (cr.address) {
      table.appendChild(el('tr', null, el('th', null, 'Location'), el('td', null, cr.address)));
    }
    if (cr.returnAddress) {
      table.appendChild(el('tr', null, el('th', null, 'Return Address'), el('td', null, cr.returnAddress)));
    }
    if (cr.bookingCode) {
      table.appendChild(el('tr', null, el('th', null, 'Booking Code'), el('td', null, cr.bookingCode)));
    }
    if (costText) {
      table.appendChild(el('tr', null, el('th', null, 'Cost'), el('td', null, costText)));
    }
    if (table.children.length) body.appendChild(table);

    sheet.appendChild(body);

    // Action buttons - Directions always on right
    const actionButtons = [];
    if (receiptUrl) {
      actionButtons.push(buildReceiptActionButton(receiptUrl, cr.receipt, { secondary: true }));
    }
    if (directionsUrl) {
      actionButtons.push(el('a', { class: 'btn', href: directionsUrl, target: '_blank', rel: 'noopener' }, 'Get Directions'));
    }
    
    if (actionButtons.length) {
      const actions = el('div', { class: sheetActionsClass(actionButtons.length) }, ...actionButtons);
      sheet.appendChild(actions);
    }

    backdrop.classList.add('open');
    requestAnimationFrame(() => sheet.classList.add('open'));

    // Initialize hero map
    if (hasCoords) {
      setTimeout(() => {
        const heroMapNode = $('#car-hero-map');
        if (heroMapNode && !leafletSheet) {
          leafletSheet = L.map(heroMapNode, {
            center: [lat, lng], zoom: 13,
            zoomControl: false, attributionControl: false,
            dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
            touchZoom: false, boxZoom: false, keyboard: false, tap: false
          });
          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd'
          }).addTo(leafletSheet);
        }
      }, 100);
    }
  }

  // ─── Edit Car Rental Sheet ────────────────────────────────────────────────
  let editCarRentalDraft = null;
  let editCarRentalDay = null;

  function carRentalToDraft(cr){
    return {
      rowId: cr.id || null,
      provider: cr.provider || '',
      bookingCode: cr.bookingCode || '',
      pickupDate: cr.pickupDate || '',
      pickupTime: cr.pickupTime || '',
      returnDate: cr.returnDate || '',
      returnTime: cr.returnTime || '',
      address: cr.address || '',
      returnAddress: cr.returnAddress || '',
      carType: cr.carType || '',
      notes: cr.notes || '',
      cost: cr.cost != null && cr.cost !== '' ? String(cr.cost) : '',
      lat: cr.lat != null && !isNaN(cr.lat) ? String(cr.lat) : '',
      lng: cr.lng != null && !isNaN(cr.lng) ? String(cr.lng) : ''
    };
  }

  function ensureEditCarRentalSheetDom(){
    const root = $('#app') || $('.phone-fullscreen') || document.body;
    let backdrop = $('#edit-car-rental-backdrop');
    let sheet = $('#edit-car-rental-sheet');
    if (!backdrop) {
      backdrop = el('div', { id: 'edit-car-rental-backdrop', class: 'sheet-backdrop sheet-stack-2' });
      root.appendChild(backdrop);
    }
    if (!sheet) {
      sheet = el('div', { id: 'edit-car-rental-sheet', class: 'sheet sheet-stack-2' });
      root.appendChild(sheet);
    }
    return { sheet, backdrop };
  }

  function hideEditCarRentalSheet(){
    const sheet = $('#edit-car-rental-sheet');
    const backdrop = $('#edit-car-rental-backdrop');
    if (!sheet || !backdrop) return;
    clearSheetDragStyles(sheet);
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    backdrop.onclick = null;
    editCarRentalDraft = null;
    editCarRentalDay = null;
  }

  function openEditCarRentalProviderPicker(){
    if (!editCarRentalDraft) return;
    openPickTray({
      title: 'Provider',
      value: editCarRentalDraft.provider,
      options: CAR_RENTAL_PROVIDERS.map(name => ({ value: name, label: name, sub: '' })),
      onPick: (value) => {
        editCarRentalDraft.provider = value;
        updateEditPickerLabel('edit-car-rental-provider-label', value || 'None');
      }
    });
  }

  function openEditCarRentalPickupDatePicker(){
    if (!editCarRentalDraft) return;
    openPickTray({
      title: 'Pick-up date',
      value: editCarRentalDraft.pickupDate,
      options: hotelDatePickerOptions(),
      onPick: (value) => {
        editCarRentalDraft.pickupDate = value;
        if (editCarRentalDraft.returnDate && editCarRentalDraft.returnDate < value) {
          editCarRentalDraft.returnDate = value;
          updateEditPickerLabel('edit-car-rental-return-date-label', hotelDateLabel(value));
        }
        updateEditPickerLabel('edit-car-rental-pickup-date-label', hotelDateLabel(value));
      }
    });
  }

  function openEditCarRentalReturnDatePicker(){
    if (!editCarRentalDraft) return;
    openPickTray({
      title: 'Return date',
      value: editCarRentalDraft.returnDate,
      options: hotelDatePickerOptions(editCarRentalDraft.pickupDate),
      onPick: (value) => {
        editCarRentalDraft.returnDate = value;
        updateEditPickerLabel('edit-car-rental-return-date-label', hotelDateLabel(value));
      }
    });
  }

  async function openEditCarRentalSheet(cr, day){
    const rental = await ensureCarRentalRecord(cr);
    if (!rental?.id) {
      toast('Couldn\u2019t load car rental for editing');
      return;
    }
    editCarRentalDay = day || null;
    editCarRentalDraft = carRentalToDraft(rental);
    const { sheet, backdrop } = ensureEditCarRentalSheetDom();
    const draft = editCarRentalDraft;
    sheet.innerHTML = '';

    sheet.appendChild(buildSheetCloseButton(hideEditCarRentalSheet));
    sheet.appendChild(el('div', { class: 'sheet-form-header' },
      el('h2', { class: 'sheet-form-title' }, 'Edit Car Rental')
    ));

    const form = el('div', { class: 'edit-activity-container' },
      buildEditPickerField('Provider', 'edit-car-rental-provider-label', draft.provider || 'None', openEditCarRentalProviderPicker),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-car-rental-booking' }, 'Booking code'),
        el('input', {
          type: 'text',
          id: 'edit-car-rental-booking',
          class: 'edit-input',
          value: draft.bookingCode,
          oninput: (e) => { draft.bookingCode = e.target.value; }
        })
      ),
      buildEditPickerField('Pick-up date', 'edit-car-rental-pickup-date-label', hotelDateLabel(draft.pickupDate), openEditCarRentalPickupDatePicker),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-car-rental-pickup-time' }, 'Pick-up time'),
        el('input', {
          type: 'text',
          id: 'edit-car-rental-pickup-time',
          class: 'edit-input',
          value: draft.pickupTime,
          placeholder: '9:00 AM',
          oninput: (e) => { draft.pickupTime = e.target.value; }
        })
      ),
      buildEditPickerField('Return date', 'edit-car-rental-return-date-label', hotelDateLabel(draft.returnDate), openEditCarRentalReturnDatePicker),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-car-rental-return-time' }, 'Return time'),
        el('input', {
          type: 'text',
          id: 'edit-car-rental-return-time',
          class: 'edit-input',
          value: draft.returnTime,
          placeholder: '5:00 PM',
          oninput: (e) => { draft.returnTime = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-car-rental-address' }, 'Pick-up address'),
        el('input', {
          type: 'text',
          id: 'edit-car-rental-address',
          class: 'edit-input',
          value: draft.address,
          oninput: (e) => { draft.address = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-car-rental-return-address' }, 'Return address'),
        el('input', {
          type: 'text',
          id: 'edit-car-rental-return-address',
          class: 'edit-input',
          value: draft.returnAddress,
          oninput: (e) => { draft.returnAddress = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-car-rental-car-type' }, 'Car type'),
        el('input', {
          type: 'text',
          id: 'edit-car-rental-car-type',
          class: 'edit-input',
          value: draft.carType,
          oninput: (e) => { draft.carType = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-car-rental-notes' }, 'Notes'),
        el('textarea', {
          id: 'edit-car-rental-notes',
          class: 'edit-input edit-textarea',
          rows: '3',
          oninput: (e) => { draft.notes = e.target.value; }
        }, draft.notes)
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-car-rental-cost' }, 'Cost (USD)'),
        el('input', {
          type: 'text',
          id: 'edit-car-rental-cost',
          class: 'edit-input',
          value: draft.cost,
          placeholder: '220',
          oninput: (e) => { draft.cost = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-car-rental-lat' }, 'Latitude'),
        el('input', {
          type: 'text',
          id: 'edit-car-rental-lat',
          class: 'edit-input',
          value: draft.lat,
          placeholder: '35.2564',
          oninput: (e) => { draft.lat = e.target.value; }
        })
      ),
      el('div', { class: 'edit-field' },
        el('label', { class: 'edit-label', for: 'edit-car-rental-lng' }, 'Longitude'),
        el('input', {
          type: 'text',
          id: 'edit-car-rental-lng',
          class: 'edit-input',
          value: draft.lng,
          placeholder: '139.1547',
          oninput: (e) => { draft.lng = e.target.value; }
        })
      )
    );
    sheet.appendChild(form);
    sheet.appendChild(el('div', { class: 'edit-sheet-actions' },
      el('button', {
        id: 'edit-car-rental-submit',
        class: 'oc-btn',
        onclick: submitUpdateCarRental
      }, 'Update')
    ));

    backdrop.classList.add('open');
    backdrop.onclick = hideEditCarRentalSheet;
    requestAnimationFrame(() => sheet.classList.add('open'));
  }

  async function submitUpdateCarRental(){
    const draft = editCarRentalDraft;
    if (!draft) return;

    const trips = getTrips();
    const activeTrip = trips.find(t => t.active);
    if (!activeTrip) {
      toast('Select a trip to continue');
      return;
    }

    if (!draft.rowId) {
      toast('Car rental can\u2019t be edited');
      return;
    }

    const costStr = draft.cost.trim();
    let cost = null;
    if (costStr !== '') {
      cost = parseFloat(costStr);
      if (isNaN(cost)) {
        toast('Cost must be a number');
        return;
      }
    }

    const latStr = draft.lat.trim();
    const lngStr = draft.lng.trim();
    const lat = latStr === '' ? null : parseFloat(latStr);
    const lng = lngStr === '' ? null : parseFloat(lngStr);
    if ((latStr && isNaN(lat)) || (lngStr && isNaN(lng))) {
      toast('Lat & long must be numbers');
      return;
    }

    const btn = $('#edit-car-rental-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
    }

    const savedDay = editCarRentalDay;
    const rowId = draft.rowId;
    const rentalPatch = {
      provider: draft.provider || '',
      bookingCode: draft.bookingCode.trim(),
      pickupDate: draft.pickupDate || '',
      pickupTime: draft.pickupTime.trim(),
      returnDate: draft.returnDate || '',
      returnTime: draft.returnTime.trim(),
      address: draft.address.trim(),
      returnAddress: draft.returnAddress.trim(),
      carType: draft.carType.trim(),
      notes: draft.notes.trim(),
      cost,
      lat,
      lng
    };

    await syncTripRecordEdit({
      applyLocal: () => patchTripRecord('carRentals', rowId, rentalPatch),
      apiCall: async () => {
        const body = { docUrl: activeTrip.url, rowId, type: 'carRental', data: rentalPatch };
        if (activeTrip.token) body.token = activeTrip.token;
        const res = await fetch('/api/update-record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Failed to update car rental');
      },
      hideEditSheet: hideEditCarRentalSheet,
      reopenDetail: openCarRentalSheet,
      savedDay,
      successToast: 'Car rental updated',
      failToast: 'Couldn\u2019t update car rental',
      submitBtn: btn,
      submitBtnLabel: 'Update'
    });
  }

  function closeSheet(){
    const backdrop = $('#sheet-backdrop');
    const sheet = $('#sheet');
    clearSheetDragStyles(sheet);
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    state.sheet = null;
    state.hotelSheet = null;
    state.flightSheet = null;
    state.eventSheet = null;
    state.carRentalSheet = null;
    if (leafletSheet){ setTimeout(() => { try { leafletSheet.remove(); } catch{} leafletSheet = null; }, 350); }
  }

  function clearSheetDragStyles(sheet){
    if (!sheet) return;
    sheet.classList.remove('is-dismissing');
    sheet.style.transition = '';
    sheet.style.transform = '';
  }

  // Swipe down to dismiss bottom sheets — follows the finger, then closes or snaps back.
  function attachBottomSheetDismiss(selector, onClose){
    const sheet = $(selector);
    if (!sheet || sheet.__dismissBound) return;
    sheet.__dismissBound = true;

    const HEADER_DRAG = '.handle, .sheet-nav, .sheet-form-header, .tray-title, .sheet-form-title';
    const SCROLL_DRAG = '.tray-list, .sheet-scroll, .sheet-body, .add-activity-container';

    let startY = 0;
    let dy = 0;
    let dragging = false;
    let armed = false;
    let scrollEl = null;

    function isHeaderTarget(target){
      return !!target.closest(HEADER_DRAG);
    }

    function scrollContainer(target){
      return target.closest(SCROLL_DRAG);
    }

    function isInteractiveTarget(target){
      return !!target.closest('input, textarea, select, button, a, .leaflet-container, #map-sheet');
    }

    function canStartDismiss(target){
      if (isInteractiveTarget(target)) return false;
      if (isHeaderTarget(target)) return true;
      const scroller = scrollContainer(target);
      if (scroller) return scroller.scrollTop <= 0;
      return !!target.closest('.sheet-actions, .sheet-desc, .distance, .map-wrap, .bottom-pad');
    }

    function resetDragStyles(animate){
      clearSheetDragStyles(sheet);
      if (animate) {
        sheet.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)';
        sheet.style.transform = '';
        setTimeout(() => { sheet.style.transition = ''; }, 340);
      }
      dragging = false;
      dy = 0;
      armed = false;
      scrollEl = null;
    }

    function dismissSheet(){
      const h = sheet.getBoundingClientRect().height || window.innerHeight;
      sheet.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
      sheet.style.transform = `translateY(${h + 24}px)`;
      setTimeout(() => {
        clearSheetDragStyles(sheet);
        onClose();
      }, 280);
    }

    sheet.addEventListener('touchstart', e => {
      if (!sheet.classList.contains('open') || e.touches.length !== 1) return;
      if (!canStartDismiss(e.target)) return;
      scrollEl = scrollContainer(e.target);
      startY = e.touches[0].clientY;
      armed = true;
      dragging = false;
      dy = 0;
    }, { passive: true });

    sheet.addEventListener('touchmove', e => {
      if (!armed || !sheet.classList.contains('open')) return;
      const y = e.touches[0].clientY;
      const delta = y - startY;

      if (!dragging) {
        if (delta <= 0) return;
        if (scrollEl && scrollEl.scrollTop > 0 && !isHeaderTarget(e.target)) {
          armed = false;
          return;
        }
        dragging = true;
        sheet.style.transition = 'none';
        sheet.classList.add('is-dismissing');
      }

      dy = Math.max(0, delta);
      sheet.style.transform = `translateY(${dy}px)`;
      e.preventDefault();
    }, { passive: false });

    sheet.addEventListener('touchend', () => {
      if (!armed) return;
      const h = sheet.getBoundingClientRect().height || 400;
      const threshold = Math.min(90, h * 0.16);

      if (dragging && dy >= threshold) dismissSheet();
      else if (dragging) resetDragStyles(true);

      armed = false;
      dragging = false;
      scrollEl = null;
    }, { passive: true });

    sheet.addEventListener('touchcancel', () => {
      if (dragging) resetDragStyles(true);
      armed = false;
      scrollEl = null;
    }, { passive: true });
  }

  function attachAllBottomSheetDismiss(){
    attachBottomSheetDismiss('#sheet', closeSheet);
    attachBottomSheetDismiss('#filter-tray', closeFilterTray);
    attachBottomSheetDismiss('#add-activity-sheet', hideAddActivitySheet);
    attachBottomSheetDismiss('#edit-activity-sheet', hideEditActivitySheet);
    attachBottomSheetDismiss('#edit-hotel-sheet', hideEditHotelSheet);
    attachBottomSheetDismiss('#edit-event-sheet', hideEditEventSheet);
    attachBottomSheetDismiss('#edit-flight-sheet', hideEditFlightSheet);
    attachBottomSheetDismiss('#receipt-image-sheet', hideReceiptImageSheet);
  }

  // Block pinch-zoom on fixed UI (Safari ignores touch-action for pinch).
  function attachFilterBarPinchLock(){
    if (document.documentElement.__filterBarPinchLocked) return;
    document.documentElement.__filterBarPinchLocked = true;
    const PINCH_LOCK = '.filter-bar, .sheet, .sheet-backdrop';
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length < 2) return;
      if (e.target.closest(PINCH_LOCK)) e.preventDefault();
    }, { passive: false });
  }

  // Swipe-anywhere day navigation on the Today scroll
  function attachTodaySwipe(){
    const scroll = $('#tab-today .scroll');
    if (!scroll || scroll.__swipeBound) return;
    scroll.__swipeBound = true;

    let startX = null;
    let startY = null;
    let locked = null;
    let dragging = false;
    let currentX = 0;

    function canGoPrev(){ return state.todayDay > 1; }
    function canGoNext(){ return state.todayDay < (D.days?.length || 1); }

    const SWIPE_LOCK_PX = 10;
    const SWIPE_ARM_PX = 40;

    // Dead zone, then 1:1 catch-up with the finger (like pull-to-refresh).
    function swipeDragOffset(rawDx){
      const sign = rawDx < 0 ? -1 : rawDx > 0 ? 1 : 0;
      const abs = Math.abs(rawDx);
      if (abs <= SWIPE_ARM_PX) return 0;
      return sign * (abs - SWIPE_ARM_PX);
    }

    function visualSwipeX(rawDx){
      let x = swipeDragOffset(rawDx);
      if (x > 0 && !canGoPrev()) x *= 0.22;
      if (x < 0 && !canGoNext()) x *= 0.22;
      return x;
    }

    function setDragTransform(x, animate){
      const w = scroll.offsetWidth || document.documentElement.clientWidth;
      scroll.style.transition = animate
        ? 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease'
        : 'none';
      scroll.style.transform = `translateX(${x}px)`;
      scroll.style.opacity = String(1 - Math.min(Math.abs(x) / (w * 0.55), 1) * 0.18);
    }

    function resetDrag(animate){
      scroll.classList.remove('is-swiping');
      if (animate) setDragTransform(0, true);
      else {
        scroll.style.transition = 'none';
        scroll.style.transform = 'translateX(0)';
        scroll.style.opacity = '1';
      }
      if (animate) {
        setTimeout(() => {
          scroll.style.transition = '';
          scroll.style.opacity = '';
        }, 360);
      } else {
        scroll.style.opacity = '';
      }
      dragging = false;
      currentX = 0;
    }

    function finishSwipe(direction){
      const w = scroll.offsetWidth || document.documentElement.clientWidth;
      const target = direction === 'next' ? state.todayDay + 1 : state.todayDay - 1;
      setDragTransform(direction === 'next' ? -w : w, true);
      scroll.style.opacity = '0';
      scroll.classList.remove('is-swiping');
      dragging = false;
      setTimeout(() => navTo(target, { fromSwipe: true }), 220);
    }

    scroll.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      locked = null;
      dragging = false;
      currentX = 0;
      scroll.style.transition = 'none';
    }, { passive: true });

    scroll.addEventListener('touchmove', e => {
      if (startX == null) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (locked == null && Math.abs(dx) + Math.abs(dy) > SWIPE_LOCK_PX) {
        locked = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'x' : 'y';
      }

      if (locked === 'x') {
        currentX = visualSwipeX(dx);
        if (Math.abs(dx) >= SWIPE_ARM_PX) {
          if (!dragging) {
            dragging = true;
            scroll.classList.add('is-swiping');
          }
          setDragTransform(currentX, false);
          e.preventDefault();
        }
      }
    }, { passive: false });

    scroll.addEventListener('touchend', e => {
      if (startX == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const w = scroll.offsetWidth || document.documentElement.clientWidth;
      const threshold = Math.min(80, w * 0.22) + SWIPE_ARM_PX;

      if (locked === 'x' && dragging) {
        if (dx <= -threshold && canGoNext()) finishSwipe('next');
        else if (dx >= threshold && canGoPrev()) finishSwipe('prev');
        else resetDrag(true);
      }

      startX = null;
      startY = null;
      locked = null;
    }, { passive: true });

    scroll.addEventListener('touchcancel', () => {
      if (dragging) resetDrag(true);
      startX = null;
      startY = null;
      locked = null;
    }, { passive: true });
  }

  // ─── Fullscreen day map (opened from Today mini-map) ──────────────────────
  function openFullscreenMap(dayN){
    state.fullscreenMap = dayN;
    const root = $('#fullscreen-map');
    root.classList.add('open');
    const d = D.byDay[dayN];
    $('#fm-title').textContent = `Day ${d.n} · ${d.loc}`;
    $('#fm-title').style.setProperty('--day-accent', d.color);

    setTimeout(() => {
      const node = $('#map-fullscreen');
      if (leafletFullscreen) { leafletFullscreen.remove(); leafletFullscreen = null; }
      const center = activityCenter(d.n);
      leafletFullscreen = L.map(node, {
        center: [center.lat, center.lng], zoom: 12, zoomControl: true, attributionControl: true
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', attribution: '© OpenStreetMap, © CARTO'
      }).addTo(leafletFullscreen);
      const acts = (D.dayActivities[d.n] || []).filter(a => a.lat && a.lng);
      const markers = [];
      acts.forEach(a => {
        const m = L.marker([a.lat, a.lng], { icon: pinIcon(a.cat, d.color) }).addTo(leafletFullscreen);
        m.on('click', () => openSheet(a));
        markers.push(m);
      });
      if (markers.length > 1){
        const g = L.featureGroup(markers);
        leafletFullscreen.fitBounds(g.getBounds(), { padding: [60,40] });
      }
    }, 50);
  }
  function closeFullscreenMap(){
    state.fullscreenMap = null;
    $('#fullscreen-map').classList.remove('open');
  }

  // ─── Geolocation ──────────────────────────────────────────────────────────
  let mapGeolocateRequested = false;

  function tryGeolocate(){
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const city = nearestMapCityToUser();
        if (state.region == null && city) state.region = city;
        if (state.tab === 'map') buildFullMap();
      },
      _err => {},
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60_000 }
    );
  }

  function requestMapGeolocation(){
    if (mapGeolocateRequested) return;
    mapGeolocateRequested = true;
    tryGeolocate();
  }

  // ─── Settings overlay ─────────────────────────────────────────────────────
  // ─── Render: SETTINGS tab ─────────────────────────────────────────────────
  function renderSettingsTab(){
    const header = $('#settings-header');
    header.innerHTML = '';
    header.appendChild(buildLargeTitle('Settings'));

    const root = $('#settings-content');
    root.innerHTML = '';
    // root.appendChild(buildAppModeCard()); // Hidden - Plan mode in development
    root.appendChild(buildTripsCard());
    root.appendChild(buildOfflineCard());
    root.appendChild(buildSyncCard());
    root.appendChild(buildResetCard());
    root.appendChild(el('div', { class: 'settings-section-head' }, 'About'));
    root.appendChild(el('div', { class: 'settings-about' },
      el('div', null, 'Supertrip'),
      el('div', { class: 'sub' }, 'Created by TJ Eby'),
      el('div', { class: 'sub', style: 'margin-top: 8px; opacity: 0.6;' }, `Version ${APP_VERSION}`)
    ));
    root.appendChild(el('div', { class: 'bottom-pad' }));
    setTimeout(refreshCacheStatus, 60);
  }

  function buildAppModeCard(){
    const currentMode = getAppMode();
    return el('div', { class: 'offline-card mode-card' },
      el('div', { class: 'mode-card-header' },
        el('div', { class: 'oc-left' },
          el('div', { class: 'oc-icon' }, '🎯'),
          el('div', null,
            el('div', { class: 'oc-title' }, 'App Mode'),
            el('div', { class: 'oc-desc' }, 'Switch between planning and traveling')
          )
        )
      ),
      el('div', { class: 'mode-segment', style: { marginTop: '12px' } },
        el('button', {
          class: currentMode === 'plan' ? 'active' : '',
          onclick: () => {
            setAppMode('plan');
            renderSettingsTab();
          }
        }, 'Plan'),
        el('button', {
          class: currentMode === 'travel' ? 'active' : '',
          onclick: () => {
            setAppMode('travel');
            renderSettingsTab();
          }
        }, 'Travel')
      )
    );
  }

  function updateTabBarForMode(){
    const mode = getAppMode();
    const travelTabbar = $('.travel-tabbar');
    const planTabbar = $('.plan-tabbar');

    if (travelTabbar && planTabbar) {
      if (mode === 'plan') {
        travelTabbar.style.display = 'none';
        planTabbar.style.display = 'flex';
      } else {
        travelTabbar.style.display = 'grid';
        planTabbar.style.display = 'none';
        $$('.plan-screen').forEach(s => s.classList.remove('active'));
      }
    }
  }

  function fitMapToVisibleActivities(){
    if (!leafletFull) return;
    const pinMarkers = fullMapMarkers.filter(m => m._icon && m._icon.querySelector('.pin'));
    if (!pinMarkers.length) return;
    const g = L.featureGroup(pinMarkers);
    leafletFull.flyToBounds(g.getBounds(), { padding: [60, 30], maxZoom: 13, duration: 0.8 });
  }

  function locateMe(){
    const btn = $('#locate-me');
    if (btn) btn.classList.add('loading');
    if (!('geolocation' in navigator)){
      if (btn) btn.classList.remove('loading');
      toast('Current location unavailable');
      // Re-fit to visible pins so the user gets a useful default.
      if (state.tab === 'map'){ buildFullMap(); setTimeout(fitMapToVisibleActivities, 100); }
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (state.tab === 'map'){
          const city = nearestMapCityToUser();
          if (city){
            state.region = city;
            buildFullMap();
            setTimeout(() => {
              if (leafletFull) leafletFull.flyTo([state.location.lat, state.location.lng], 14, { duration: 0.8 });
            }, 100);
          } else {
            // User is far from any trip city — frame visible activities instead.
            buildFullMap();
            setTimeout(fitMapToVisibleActivities, 100);
            toast('Showing all activities');
          }
        }
        if (btn) btn.classList.remove('loading');
      },
      err => {
        if (btn) btn.classList.remove('loading');
        const msgs = {
          1: 'Location not shared',
          2: 'Couldn\u2019t get location',
          3: 'Location timed out'
        };
        toast(msgs[err.code] || 'Location unavailable');
        if (state.tab === 'map'){ buildFullMap(); setTimeout(fitMapToVisibleActivities, 100); }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  // Tiny ephemeral toast (used by locate-me errors)
  function toast(msg){
    let t = $('#toast');
    if (!t){
      t = el('div', { id: 'toast', class: 'toast' });
      document.querySelector('.phone-fullscreen').appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  function switchTab(tab){
    state.tab = tab;
    $$('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
    $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'today') renderToday();
    if (tab === 'map') renderMapTab();
    if (tab === 'activities') renderActivitiesTab();
    if (tab === 'bookings') renderBookingsTab();
    if (tab === 'settings') renderSettingsTab();
    // give Leaflet a kick after the pane becomes visible
    setTimeout(() => { try { if (leafletFull) leafletFull.invalidateSize(); if (leafletMini) leafletMini.invalidateSize(); } catch{} }, 100);
  }

  // ─── Online / offline ─────────────────────────────────────────────────────
  function updateOnline(){
    const b = $('#offline-banner');
    if (!navigator.onLine) b.classList.add('show');
    else b.classList.remove('show');
  }
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);

  // ─── Offline tile precache ────────────────────────────────────────────────
  const TILE_ZOOMS = [10, 11, 12, 13];
  const OFFLINE_CLUSTER_DEG = 8; // ~800 km — keeps JP/KR separate, merges one metro area

  function hasMapCoord(p){
    return p && p.lat != null && p.lng != null && !isNaN(p.lat) && !isNaN(p.lng);
  }

  function getTripMapPoints(){
    const points = [];
    (D.activities || []).forEach(a => {
      if (hasMapCoord(a)) points.push({ lat: a.lat, lng: a.lng });
    });
    (D.hotels || []).forEach(h => {
      if (hasMapCoord(h)) points.push({ lat: h.lat, lng: h.lng });
    });
    (D.carRentals || []).forEach(cr => {
      if (hasMapCoord(cr)) points.push({ lat: cr.lat, lng: cr.lng });
    });
    return points;
  }

  function boundsFromPoints(points, padding = 0.06){
    if (!points.length) return null;
    let n = -90, s = 90, w = 180, e = -180;
    points.forEach(p => {
      n = Math.max(n, p.lat);
      s = Math.min(s, p.lat);
      w = Math.min(w, p.lng);
      e = Math.max(e, p.lng);
    });
    if (n === s) { n += padding; s -= padding; }
    if (e === w) { e += padding; w -= padding; }
    return {
      n: Math.min(90, n + padding),
      s: Math.max(-90, s - padding),
      w: Math.max(-180, w - padding),
      e: Math.min(180, e + padding)
    };
  }

  function clusterMapPoints(points, threshold = OFFLINE_CLUSTER_DEG){
    const clusters = [];
    points.forEach(p => {
      let placed = false;
      for (const cluster of clusters) {
        const cLat = cluster.reduce((sum, pt) => sum + pt.lat, 0) / cluster.length;
        const cLng = cluster.reduce((sum, pt) => sum + pt.lng, 0) / cluster.length;
        const dist = Math.hypot(p.lat - cLat, p.lng - cLng);
        if (dist < threshold) {
          cluster.push(p);
          placed = true;
          break;
        }
      }
      if (!placed) clusters.push([p]);
    });
    return clusters;
  }

  function getOfflineRegions(){
    const points = getTripMapPoints();
    if (!points.length) return [];
    return clusterMapPoints(points).map((cluster, index) => ({
      name: `area-${index + 1}`,
      bounds: boundsFromPoints(cluster, 0.06)
    })).filter(r => r.bounds);
  }

  function offlineRegionsLabel(regions){
    if (!regions.length) return 'this trip';
    if (regions.length === 1) return 'your trip locations';
    return `${regions.length} areas in this trip`;
  }

  function lon2tile(lon, z){ return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
  function lat2tile(lat, z){
    return Math.floor((1 - Math.log(Math.tan(lat * Math.PI/180) + 1/Math.cos(lat * Math.PI/180))/Math.PI)/2 * Math.pow(2, z));
  }

  function generateTileURLs(regions){
    const boxes = regions || getOfflineRegions();
    const urls = [];
    const subdomains = ['a','b','c','d'];
    boxes.forEach(r => {
      TILE_ZOOMS.forEach(z => {
        const x0 = lon2tile(r.bounds.w, z);
        const x1 = lon2tile(r.bounds.e, z);
        const y0 = lat2tile(r.bounds.n, z);
        const y1 = lat2tile(r.bounds.s, z);
        for (let x = x0; x <= x1; x++){
          for (let y = y0; y <= y1; y++){
            const s = subdomains[(x + y) % subdomains.length];
            urls.push(`https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`);
          }
        }
      });
    });
    return urls;
  }

  let sw = null;
  function registerSW(){
    if (!('serviceWorker' in navigator)){
      const s = $('#dl-status'); if (s) s.textContent = 'Not supported';
      return;
    }
    navigator.serviceWorker.register('sw.js').then(reg => {
      const s = $('#dl-status'); if (s) s.textContent = 'Ready';
      sw = reg.active || reg.installing || reg.waiting;
      navigator.serviceWorker.ready.then(r => {
        (r.active || sw)?.postMessage({
          type: 'precache-shell',
          urls: ['./', 'index.html', 'styles.css', 'app.js', 'demo-data.js']
        });
        refreshCacheStatus();
      });
    }).catch(err => {
      console.warn('Service worker registration failed:', err);
      const s = $('#dl-status'); if (s) s.textContent = 'SW failed';
      const lbl = $('#dl-label');
      if (lbl) lbl.textContent = 'Service worker unavailable here — host the app on a real URL (not file://) to enable offline.';
      const btn = $('#dl-btn'); if (btn) btn.disabled = true;
    });

    navigator.serviceWorker.addEventListener('message', e => {
      const d = e.data || {};
      if (d.type === 'update-available'){
        // Show a small banner once per update; ignore tile/image cache updates.
        const url = (d.url || '').toLowerCase();
        if (url.endsWith('demo-data.js') || url.endsWith('app.js') || url.endsWith('styles.css') || url.endsWith('.html')){
          showUpdateBanner();
        }
      }
      if (d.type === 'precache-progress'){
        const pct = Math.round(d.done / d.total * 100);
        const fill = $('#dl-fill'); const lbl = $('#dl-label');
        if (fill) fill.style.width = pct + '%';
        if (lbl)  lbl.textContent  = `Downloading… ${d.done.toLocaleString()} / ${d.total.toLocaleString()} tiles`;
      }
      if (d.type === 'precache-done'){
        const fill = $('#dl-fill'); const lbl = $('#dl-label'); const btn = $('#dl-btn');
        const status = $('#dl-status');
        if (fill) fill.style.width = '100%';
        if (lbl)  lbl.textContent  = `Saved ${d.done.toLocaleString()} map tiles for offline use ✓`;
        if (btn)  { btn.textContent = 'Re-download'; btn.disabled = false; }
        if (status) status.textContent = `${d.done.toLocaleString()} tiles cached`;
        refreshCacheStatus();
      }
      if (d.type === 'cache-status'){
        const s = $('#dl-status');
        if (s) s.textContent = d.tiles ? `${d.tiles.toLocaleString()} tiles cached` : 'Not downloaded yet';
      }
    });
  }

  function postSW(msg){
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      (reg.active || reg.installing || reg.waiting)?.postMessage(msg);
    });
  }

  function downloadOfflineMaps(){
    const regions = getOfflineRegions();
    if (!regions.length) {
      const lbl = $('#dl-label');
      if (lbl) lbl.textContent = 'No activity locations found — add coordinates in Coda first.';
      return;
    }
    const urls = generateTileURLs(regions);
    const btn = $('#dl-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Downloading…'; }
    const fill = $('#dl-fill'); const lbl = $('#dl-label');
    if (fill) fill.style.width = '0%';
    if (lbl)  lbl.textContent  = `Preparing ${urls.length.toLocaleString()} tiles…`;
    postSW({ type: 'precache-tiles', urls });
  }

  function refreshCacheStatus(){ postSW({ type: 'cache-status' }); }

  // ─── Update banner ────────────────────────────────────────────────────────
  let _updateBannerShown = false;
  function showUpdateBanner(){
    if (_updateBannerShown) return;
    _updateBannerShown = true;
    const root = document.querySelector('.phone-fullscreen');
    if (!root) return;
    const banner = el('div', { class: 'update-banner', id: 'update-banner' },
      el('button', { class: 'ub-dismiss', 'aria-label': 'Dismiss', onclick: (e) => {
        e.stopPropagation();
        // Mark this version as dismissed so it doesn't show again
        if (D.trip?.lastGenerated) {
          localStorage.setItem('jk26.dismissedUpdate', D.trip.lastGenerated);
        }
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 300);
      } }, '\u2715'),
      el('span', { class: 'ub-dot' }),
      el('span', { class: 'ub-text' }, 'New trip updates available'),
      el('button', { class: 'ub-action', onclick: () => {
        // Mark this version as dismissed before reloading
        if (D.trip?.lastGenerated) {
          localStorage.setItem('jk26.dismissedUpdate', D.trip.lastGenerated);
        }
        banner.classList.remove('show');
        setTimeout(() => location.reload(), 300);
      } }, 'Refresh')
    );
    root.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('show'));
  }

  // ─── Auto-check for updates ───────────────────────────────────────────────
  async function checkForUpdates(){
    try {
      // Extract current data.js generation timestamp from the comment
      const currentTimestamp = D.trip?.lastGenerated;
      if (!currentTimestamp) return; // Skip check if no timestamp in current data
      
      // Check if user already dismissed this version
      const dismissedVersion = localStorage.getItem('jk26.dismissedUpdate');
      if (dismissedVersion === currentTimestamp) return;
      
      // Fetch the latest data.js from GitHub to check timestamp
      const res = await fetch('https://raw.githubusercontent.com/traviseby/japan-korea-trip/main/data.js', {
        cache: 'no-cache'
      });
      if (!res.ok) return;
      
      const text = await res.text();
      const match = text.match(/\/\/ Generated (.+)/);
      if (!match) return;
      
      const remoteTimestamp = match[1];
      // Compare ISO timestamp strings (they sort correctly as strings)
      if (remoteTimestamp > currentTimestamp){
        showUpdateBanner();
      }
    } catch (err){
      console.log('Update check failed:', err);
    }
  }

  // ─── Onboarding ───────────────────────────────────────────────────────────
  function hideAppShell(){
    const app = $('#app');
    if (app) app.style.display = 'none';
  }

  function showAppShell(){
    const app = $('#app');
    if (app) app.style.removeProperty('display'); // restore CSS flex layout
  }

  function showOnboarding(){
    // Hide the main app
    hideAppShell();
    
    // Create onboarding screen
    const onboarding = el('div', {
      id: 'onboarding',
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        zIndex: '9999'
      }
    },
      el('div', { style: { fontSize: '48px', marginBottom: '20px' } }, '✈️'),
      el('h1', { style: { fontSize: '24px', fontWeight: '600', color: 'var(--fg)', marginBottom: '12px', textAlign: 'center' } }, 'Welcome to Supertrip'),
      el('p', { style: { fontSize: '15px', color: 'var(--fg-mid)', marginBottom: '32px', textAlign: 'center', maxWidth: '400px' } }, 'Get Started by adding a link to your trip Doc'),
      
      el('div', { style: { width: '100%', maxWidth: '400px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '20px' } },
        el('label', { style: { display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--fg)', marginBottom: '8px' } }, 'Superhuman Doc URL'),
        el('input', {
          type: 'text',
          id: 'onboarding-url-input',
          placeholder: 'https://docs.superhuman.com/d/...',
          style: {
            width: '100%',
            padding: '12px',
            marginBottom: '20px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--fg)',
            boxSizing: 'border-box'
          }
        }),
        
        el('button', {
          id: 'onboarding-submit-btn',
          class: 'oc-btn',
          style: {
            width: '100%',
            padding: '14px',
            fontSize: '16px',
            fontWeight: '600',
            background: '#f4f3f0',
            color: '#0a0a0a',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer'
          },
          onclick: () => {
            const urlInput = $('#onboarding-url-input');
            const url = urlInput.value.trim();
            if (!url) {
              alert('Please paste a Supertrip doc URL');
              return;
            }

            // Redirect with ?doc= — let autoLoadFromUrl fetch the name and load data
            const docParam = extractDocId(url) || url;
            window.location.href = window.location.pathname + '?doc=' + encodeURIComponent(docParam);
          }
        }, 'Add Trip')
      )
    );
    
    document.body.appendChild(onboarding);
  }
  
  function hideOnboarding(){
    const onboarding = $('#onboarding');
    if (onboarding) onboarding.remove();
    showAppShell();
    $$('.plan-screen').forEach(s => s.classList.remove('active'));
  }

  function extractDocId(input) {
    if (!input) return null;
    // Match pattern like: https://coda.io/d/Orlando-Trip_dnmnstSTNl1
    // or https://docs.superhuman.com/d/My-Doc_dABC123
    const urlMatch = input.match(/_d([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    // If it's already just an ID (no slashes or colons), return it
    if (!input.includes('/') && !input.includes(':')) return input;
    return null;
  }

  function showAutoLoadTokenScreen(docUrl) {
    return new Promise((resolve, reject) => {
      $('#autoload-token-overlay')?.remove();

      const overlay = el('div', {
        id: 'autoload-token-overlay',
        style: {
          position: 'fixed',
          inset: '0',
          zIndex: '2147483647',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        },
      },
        el('div', {
          style: {
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--bg)',
          },
        },
          el('button', {
            id: 'autoload-back-btn',
            style: {
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              color: 'var(--primary)',
              lineHeight: '1',
            },
          }, '\u2190'),
          el('div', {
            style: { fontSize: '18px', fontWeight: '600', color: 'var(--fg)' },
          }, 'Back')
        ),
        el('div', {
          style: {
            flex: '1',
            padding: '24px 20px',
            maxWidth: '600px',
            margin: '0 auto',
            width: '100%',
          },
        },
          el('div', {
            style: {
              fontSize: '24px',
              fontWeight: '600',
              color: 'var(--fg)',
              marginBottom: '16px',
            },
          }, 'API Token Required'),
          el('div', {
            style: {
              fontSize: '15px',
              color: 'var(--fg)',
              marginBottom: '20px',
              lineHeight: '1.5',
            },
          }, 'This Coda doc is private. To access it, you need to generate an API token:'),
          el('ol', {
            style: {
              fontSize: '14px',
              marginBottom: '20px',
              paddingLeft: '24px',
              color: 'var(--fg)',
              lineHeight: '1.8',
            },
          },
            el('li', { style: { marginBottom: '12px' } }, 'Go to ', (() => {
              const link = el('a', {
                href: 'https://coda.io/account',
                target: '_blank',
                style: { color: '#60A5FA', textDecoration: 'none' },
              }, 'coda.io/account');
              link.onmouseenter = () => { link.style.textDecoration = 'underline'; };
              link.onmouseleave = () => { link.style.textDecoration = 'none'; };
              return link;
            })()),
            el('li', { style: { marginBottom: '12px' } }, 'Click "Generate API token"'),
            el('li', { style: { marginBottom: '12px' } }, 'Name it (e.g., "Trip App")'),
            el('li', { style: { marginBottom: '12px' } },
              el('strong', null, 'Click "Add a restriction"'),
              ' and paste this doc URL:',
              el('div', {
                style: {
                  marginTop: '8px',
                  marginLeft: '-24px',
                  padding: '10px',
                  background: 'var(--surface-2)',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                },
              },
                el('div', {
                  style: {
                    flex: '1',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    color: 'var(--fg)',
                  },
                }, docUrl),
                (() => {
                  const btn = el('button', {
                    onclick: () => {
                      navigator.clipboard.writeText(docUrl);
                      const copyBtn = event.target.closest('button');
                      const originalContent = copyBtn.innerHTML;
                      copyBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                      setTimeout(() => { copyBtn.innerHTML = originalContent; }, 1500);
                    },
                    style: {
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      fontSize: '16px',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: '0',
                    },
                  });
                  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                  return btn;
                })()
              )
            ),
            el('li', { style: { marginBottom: '12px' } }, 'Click "Generate API token"'),
            el('li', { style: { marginBottom: '12px' } }, 'Copy the token and paste it below')
          ),
          el('div', {
            style: {
              marginBottom: '12px',
              fontSize: '14px',
              fontWeight: '500',
              color: 'var(--fg)',
            },
          }, 'Paste your API token:'),
          el('input', {
            type: 'text',
            id: 'autoload-token-input',
            placeholder: 'Paste your Coda API token here',
            style: {
              width: '100%',
              padding: '14px',
              background: 'var(--bg)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'white',
              borderImage: 'none',
              borderRadius: '8px',
              color: 'var(--fg)',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            },
          }),
          el('button', {
            id: 'autoload-submit-btn',
            style: {
              width: '100%',
              marginTop: '20px',
              padding: '16px',
              background: 'white',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'black',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
            },
          }, 'Continue')
        )
      );

      document.body.appendChild(overlay);

      $('#autoload-submit-btn').onclick = () => {
        const token = $('#autoload-token-input').value.trim();
        if (!token) {
          alert('Please paste your API token');
          return;
        }
        overlay.remove();
        resolve(token);
      };

      $('#autoload-back-btn').onclick = () => {
        overlay.remove();
        reject(new Error('User cancelled authentication'));
      };
    });
  }

  async function autoLoadFromUrl(docParam) {
    console.log('🚀 Starting auto-load for:', docParam);
    
    // If docParam is just an ID (not a full URL), construct the URL
    let docUrl = docParam;
    if (!docParam.startsWith('http')) {
      // It's just a doc ID, construct the full URL with _d prefix
      // Coda format: https://coda.io/d/_dID
      docUrl = `https://coda.io/d/_d${docParam}`;
      console.log('📝 Converted doc ID to URL:', docUrl);
    }
    
    // Hide any existing onboarding or app content
    const existingOnboarding = $('#onboarding');
    if (existingOnboarding) existingOnboarding.style.display = 'none';
    hideAppShell();
    
    const loader = createSupertripLoader({ id: 'loader' });
    console.log('✅ Loading overlay added');

    try {
      // Fetch doc info to get the name and icon
      console.log('📡 Fetching doc info...');
      loader.setProgress(LOAD_PROGRESS.DOC_INFO_START);
      let docInfo = await fetchDocInfo(docUrl);
      console.log('📄 Doc info received:', docInfo);
      
      // If doc is private, show token request UI
      if (!docInfo) {
        console.log('🔒 Doc requires authentication - showing token UI');
        
        // First, check if there's already a partial trip saved and remove it
        const existingTrips = getTrips();
        const partialTripIndex = existingTrips.findIndex(t => {
          const tripDocId = extractDocId(t.url);
          const paramDocId = extractDocId(docUrl);
          return (tripDocId === paramDocId || t.url === docUrl) && 
                 (!t.name || t.name === 'Untitled Trip' || t.name === 'My Trip');
        });
        if (partialTripIndex !== -1) {
          console.log('🗑️ Removing existing partial trip before showing token UI');
          existingTrips.splice(partialTripIndex, 1);
          saveTrips(existingTrips);
        }
        
        const userToken = await showAutoLoadTokenScreen(docUrl);
        
        console.log('🔑 User provided token, retrying...');
        loader.setProgress(LOAD_PROGRESS.DOC_INFO_START);
        
        // Retry with user token
        docInfo = await fetchDocInfo(docUrl, userToken);
        
        if (!docInfo) {
          throw new Error('Could not access this document with the provided token. Please check your token and try again.');
        }
        
        // Store the token with the trip (will be added below)
        window.__autoLoadToken = userToken;
        loader.setProgress(LOAD_PROGRESS.DOC_CONNECTED);
      } else {
        loader.setProgress(LOAD_PROGRESS.DOC_CONNECTED);
      }

      const tripName = docInfo.name || 'My Trip';
      console.log('🎫 Trip name:', tripName);

      // Add the trip
      const trip = {
        id: Date.now().toString(),
        url: docUrl,
        name: tripName,
        icon: docInfo.icon || '✈️',
        docName: docInfo.name || tripName,
        active: true
      };
      
      // Add token if user provided one
      if (window.__autoLoadToken) {
        trip.token = window.__autoLoadToken;
        delete window.__autoLoadToken; // Clean up
      }

      loader.setProgress(LOAD_PROGRESS.TRIP_SAVED);
      const trips = getTrips();
      // Set all existing trips to inactive
      trips.forEach(t => t.active = false);
      trips.push(trip);
      saveTrips(trips);
      console.log('💾 Trip saved:', trip);

      // Load the trip data (this can take 20-60 seconds for first load)
      console.log('📦 Loading trip data...');
      loader.setProgress(LOAD_PROGRESS.FETCH_START);
      
      // Increase timeout to 90 seconds for auto-load
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      
      const fetchBody = { docUrl };
      if (trip.token) {
        fetchBody.token = trip.token;
      }
      
      try {
        const tripData = await fetchTripDataWithProgress(fetchBody, {
          signal: controller.signal,
          onProgress: (value) => loader.setProgress(value)
        });
        clearTimeout(timeoutId);

        if (tripData?.localDev) {
          throw new Error('No data available. Deploy to Vercel to test dynamic data loading.');
        }
        
        // Save to cache
        const normalizedUrl = docUrl.split('#')[0].split('?')[0];
        const cacheKey = `${TRIP_DATA_CACHE_PREFIX}${normalizedUrl}`;
        localStorage.setItem(cacheKey, JSON.stringify(tripData));
        
        applyTripData(tripData);
        console.log('✅ Trip data loaded');
        loader.setProgress(LOAD_PROGRESS.PREPARE_APP);
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          throw new Error('Loading took too long. The trip has been saved - please refresh the page to try again.');
        }
        throw fetchErr;
      }

      finalizeAppAfterTripLoad('today');
      await loader.complete();
      toast('Trip loaded');
      console.log('🎉 Auto-load complete!');
    } catch (error) {
      console.error('❌ Auto-load failed:', error);
      loader?.remove();

      // Show error with more helpful message
      const errorMsg = error.message || 'Could not load trip data';
      
      // Check if user cancelled authentication
      if (errorMsg.includes('cancelled authentication')) {
        console.log('User cancelled, showing onboarding');
        window.history.replaceState({}, '', window.location.pathname);
        showOnboarding();
        return;
      }
      
      toast(errorMsg);
      
      // Clean up any partially created trips if this was an auth failure
      const trips = getTrips();
      let docUrlToCheck = docParam;
      if (!docParam.startsWith('http')) {
        docUrlToCheck = `https://coda.io/d/_d${docParam}`;
      }
      
      // Find and remove any "Untitled Trip" entries for this doc (partial saves)
      const untitledIndex = trips.findIndex(t => {
        const tripDocId = extractDocId(t.url);
        const paramDocId = extractDocId(docUrlToCheck);
        return (tripDocId === paramDocId || t.url === docUrlToCheck) && 
               (!t.name || t.name === 'Untitled Trip' || t.name === 'My Trip');
      });
      
      if (untitledIndex !== -1) {
        console.log('🗑️ Removing partial trip save');
        trips.splice(untitledIndex, 1);
        saveTrips(trips);
      }
      
      const tripExists = trips.some(t => {
        const tripDocId = extractDocId(t.url);
        const paramDocId = extractDocId(docUrlToCheck);
        return tripDocId === paramDocId;
      });
      
      if (!tripExists) {
        console.log('🗑️ Removing doc param - new trip auto-load failed');
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        console.log('✅ Keeping doc param - trip exists in storage');
      }
      
      // If trip was saved, continue with normal loading
      if (trips.length > 0) {
        console.log('Trip exists, loading what we have...');
        showAppShell();
        switchTab('settings'); // Show settings so user can try sync
      } else {
        showOnboarding();
      }
    }
  }
  
  function showTokenUIDemo() {
    // Demo mode to preview the token UI
    const demoUrl = 'https://coda.io/d/_dABCDEF123456';
    
    const tokenScreen = el('div', {
      id: 'token-demo-screen',
      style: {
        position: 'fixed',
        inset: '0',
        background: 'var(--bg)',
        zIndex: '10000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto'
      }
    },
      // Header with back button
      el('div', {
        style: {
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }
      },
        el('button', {
          onclick: () => {
            window.location.href = window.location.pathname;
          },
          style: {
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '0',
            color: 'var(--primary)',
            lineHeight: '1'
          }
        }, '←'),
        el('div', {
          style: {
            fontSize: '18px',
            fontWeight: '600',
            color: 'var(--fg)'
          }
        }, 'Back')
      ),
      // Content
      el('div', {
        style: {
          flex: '1',
          padding: '24px 20px',
          maxWidth: '600px',
          margin: '0 auto',
          width: '100%'
        }
      },
        el('div', {
          style: {
            fontSize: '24px',
            fontWeight: '600',
            color: 'var(--fg)',
            marginBottom: '16px'
          }
        }, 'API Token Required'),
        el('div', {
          style: {
            fontSize: '15px',
            color: 'var(--fg)',
            marginBottom: '20px',
            lineHeight: '1.5'
          }
        }, 'This Coda doc is private. To access it, you need to generate an API token:'),
        el('ol', {
          style: {
            fontSize: '14px',
            marginBottom: '20px',
            paddingLeft: '24px',
            color: 'var(--fg)',
            lineHeight: '1.8'
          }
        },
          el('li', { style: { marginBottom: '12px' } }, 'Go to ', (() => {
            const link = el('a', {
              href: 'https://coda.io/account',
              target: '_blank',
              style: { color: '#60A5FA', textDecoration: 'none' }
            }, 'coda.io/account');
            link.onmouseenter = () => { link.style.textDecoration = 'underline'; };
            link.onmouseleave = () => { link.style.textDecoration = 'none'; };
            return link;
          })()),
          el('li', { style: { marginBottom: '12px' } }, 'Click "Generate API token"'),
          el('li', { style: { marginBottom: '12px' } }, 'Name it (e.g., "Trip App")'),
          el('li', { style: { marginBottom: '12px' } },
            el('strong', null, 'Click "Add a restriction"'),
            ' and paste this doc URL:',
            el('div', {
              style: {
                marginTop: '8px',
                marginLeft: '-24px',
                padding: '10px',
                background: 'var(--surface-2)',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }
            },
              el('div', {
                style: {
                  flex: '1',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  color: 'var(--fg)'
                }
              }, demoUrl),
              (() => {
                const btn = el('button', {
                  onclick: () => {
                    navigator.clipboard.writeText(demoUrl);
                    const btn = event.target.closest('button');
                    const originalContent = btn.innerHTML;
                    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                    setTimeout(() => { btn.innerHTML = originalContent; }, 1500);
                  },
                  style: {
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    fontSize: '16px',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: '0'
                  }
                });
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                return btn;
              })()
            )
          ),
          el('li', { style: { marginBottom: '12px' } }, 'Click "Generate API token"'),
          el('li', { style: { marginBottom: '12px' } }, 'Copy the token and paste it below')
        ),
        el('div', {
          style: {
            marginTop: '10px',
            marginBottom: '12px',
            fontSize: '15px',
            fontWeight: '500',
            color: 'var(--fg)'
          }
        }, 'Paste your API token:'),
        el('input', {
          type: 'text',
          placeholder: 'Paste your Coda API token here',
          style: {
            width: '100%',
            padding: '14px',
            background: 'var(--bg)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'white',
            borderImage: 'none',
            borderRadius: '8px',
            color: 'var(--fg)',
            fontFamily: 'monospace',
            boxSizing: 'border-box'
          }
        }),
        el('button', {
          onclick: () => alert('This is a demo preview - button is not functional'),
          style: {
            width: '100%',
            marginTop: '20px',
            padding: '16px',
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'black',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer'
          }
        }, 'Continue'),
        el('div', {
          style: {
            marginTop: '20px',
            padding: '12px',
            background: 'rgba(255, 165, 0, 0.1)',
            border: '1px solid rgba(255, 165, 0, 0.3)',
            borderRadius: '8px',
            fontSize: '13px',
            color: 'var(--fg)',
            textAlign: 'center'
          }
        }, '👀 Demo Mode - This is a preview of the token UI')
      )
    );
    
    document.body.appendChild(tokenScreen);
  }
  
  function isValidTripData(data){
    return !!(data?.days?.length && data?.trip);
  }

  function tripDataNeedsRefresh(data){
    if (!isValidTripData(data)) return true;
    if (!Array.isArray(data.events)) return true;
    if (!Array.isArray(data.carRentals)) return true;
    const flights = data.flights || [];
    if (flights.length && flights.some(f => !f.id)) return true;
    if (flights.length && flights.some(f => f.date && !f.depart && !f.arrive)) return true;
    if (flights.length && flights.some(f => (f.fromCity || f.date) && !f.from && !f.to && !f.trip)) return true;
    const hotels = data.hotels || [];
    if (hotels.length && hotels.some(h => !h.id)) return true;
    const events = data.events || [];
    if (events.length && events.some(e => !e.id)) return true;
    const carRentals = data.carRentals || [];
    if (carRentals.length && carRentals.some(cr => !cr.id)) return true;
    return false;
  }

  function tripDataReady(){
    return isValidTripData(window.DATA) && !!window.DATA.byDay;
  }

  function clearTripLoadOverlays(){
    activeTripLoadProgress?.remove();
    $('#loader')?.remove();
    $('#trip-loading')?.remove();
    $('#auto-load-overlay')?.remove();
    $('#autoload-token-overlay')?.remove();
  }

  function finalizeAppAfterTripLoad(tab){
    hideOnboarding();
    showAppShell();
    $$('.plan-screen').forEach(s => s.classList.remove('active'));
    if (!tripDataReady()) {
      console.warn('finalizeAppAfterTripLoad: trip data not ready yet');
      switchTab('settings');
      return;
    }
    const nextTab = tab || state.tab || 'today';
    state.tab = nextTab;
    switchTab(nextTab);
  }

  function render(){
    // Re-render current tab
    switchTab(state.tab);
  }

  // ─── Wire up ──────────────────────────────────────────────────────────────
  function attachIosKeyboardZoomFix(){
    document.addEventListener('focusout', (e) => {
      if (!e.target.matches('input, textarea, select')) return;
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // tab bar
    $$('.tabbar button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    // Update tab bar based on app mode
    updateTabBarForMode();
    // Add activity button (event delegation since button is dynamically created)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.add-activity-trigger')) {
        showAddActivitySheet();
      }
    });
    // Note: segmented control (map regions) is now dynamically generated in buildRegionSelector()
    // Locate-me buttons (Map tab + fullscreen day map)
    const locateBtn = $('#locate-me');
    if (locateBtn) locateBtn.addEventListener('click', locateMe);
    const fmLocate = $('#fm-locate');
    if (fmLocate) fmLocate.addEventListener('click', () => {
      if (!('geolocation' in navigator)) return;
      fmLocate.classList.add('loading');
      navigator.geolocation.getCurrentPosition(
        pos => {
          state.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (leafletFullscreen){
            leafletFullscreen.flyTo([state.location.lat, state.location.lng], 14, { duration: 0.8 });
            // Add / move location marker
            if (window.__fmLocMarker) leafletFullscreen.removeLayer(window.__fmLocMarker);
            window.__fmLocMarker = L.marker([state.location.lat, state.location.lng], { icon: locationIcon() }).addTo(leafletFullscreen);
          }
          fmLocate.classList.remove('loading');
        },
        _err => { fmLocate.classList.remove('loading'); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
    // sheet
    $('#sheet-backdrop').addEventListener('click', closeSheet);
    attachAllBottomSheetDismiss();
    attachFilterBarPinchLock();
    attachIosKeyboardZoomFix();
    attachTodaySwipe();
    // fullscreen map back
    $('#fm-back').addEventListener('click', closeFullscreenMap);
    // filter tray
    $('#filter-tray-backdrop').addEventListener('click', closeFilterTray);
    // initial
    updateOnline();
    registerSW();
    checkForUpdates();
    initTripData().then(() => {
      const onboarding = $('#onboarding');
      if (onboarding && onboarding.style.display !== 'none') return;
      if (getTrips().length > 0 && tripDataReady()) {
        const mode = getAppMode();
        if (mode === 'plan') {
          $$('.tab-pane:not(.plan-screen)').forEach(t => t.classList.remove('active'));
          const aboutTab = $('#plan-about');
          if (aboutTab) aboutTab.classList.add('active');
          if (window.PlanMode) window.PlanMode.renderAboutTab();
        } else {
          finalizeAppAfterTripLoad('today');
        }
      }
    });
  });

  // Export for Plan Mode
  window.TravelMode = {
    renderTodoTab
  };
})();
