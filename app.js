/* Japan & Korea 2026 — companion app logic
 * Vanilla JS. Reads from window.DATA. Single source of truth: filterState.
 */
(function(){
  'use strict';
  const D = window.DATA;
  const APP_VERSION = '1.22';

  // ─── Date / day resolution ────────────────────────────────────────────────
  const TODAY = new Date(); // real device clock
  function currentDay() {
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
    todayDay: currentDay(),
    region: null,             // 'JP' or 'KR' for Map tab — set later
    sheet: null,              // current activity id shown in sheet
    fullscreenMap: null,      // day number, or null
    location: null,           // {lat,lng} from geolocation, or null
    searching: false,         // filter-bar search mode on Map + Activities
    filterTray: null          // 'day' | 'time' | 'type' | null
  };

  // Shared filter state — single source of truth for Map + Activities
  const filterState = {
    day: [],
    timeOfDay: [],
    category: [],
    search: ''
  };
  window.filterState = filterState;

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
  function timeOrder(t){
    return { 'Morning': 0, 'Afternoon': 1, 'Evening': 2, 'Late Night': 3 }[t] ?? 9;
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
    if (!acts.length) return { lat: D.byDay[day].lat, lng: D.byDay[day].lng };
    const sum = acts.reduce((s,a) => ({lat: s.lat + a.lat, lng: s.lng + a.lng}), {lat:0,lng:0});
    return { lat: sum.lat / acts.length, lng: sum.lng / acts.length };
  }

  // ─── Filtered dataset (for Map + Activities) ──────────────────────────────
  function filteredActivities(){
    const q = filterState.search.trim().toLowerCase();
    return D.activities.filter(a => {
      if (filterState.day.length && !filterState.day.includes(a.day)) return false;
      if (filterState.timeOfDay.length && !filterState.timeOfDay.includes(a.time)) return false;
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
  async function fetchWeather(day){
    if (weatherCache[day.n] !== undefined) return weatherCache[day.n];
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${day.lat}&longitude=${day.lng}&current_weather=true&temperature_unit=fahrenheit`;
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

  function renderToday(){
    const day = D.byDay[state.todayDay];
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
        el('button', { class: 'iti-chev', disabled: day.n === 1 ? '' : null, 'aria-label': 'Previous day', onclick: () => navTo(day.n - 1) }, '\u2039'),
        el('button', { class: 'iti-chev', disabled: day.n === D.days.length ? '' : null, 'aria-label': 'Next day', onclick: () => navTo(day.n + 1) }, '\u203a')
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
        el('div', { class: 'weather', id: 'weather-' + day.n },
          el('span', { class: 'ico' }, '·'),
          el('span', { class: 'temp' }, '—')
        )
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

    // Async weather
    fetchWeather(day).then(w => {
      const wEl = $('#weather-' + day.n);
      if (!wEl) return;
      if (!w) { wEl.style.display = 'none'; return; }
      wEl.innerHTML = `<span class="ico">${weatherIcon(w.code)}</span><span class="temp">${w.temp}°F</span>`;
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
    const flight = D.flights.find(f => f.day === day.n);
    if (flight){
      const section = el('div', { class: 'section tight' },
        el('div', { class: 'section-head' },
          el('h3', null, 'Today\u2019s Flight')
        )
      );
      root.appendChild(section);
      root.appendChild(buildFlightCard(flight));
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
      state.region = day.country; // 'JP' or 'KR' — flips the segmented control
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
        el('div', { class: 'notes-head' }, '📝 Notes'),
        el('div', { class: 'body' }, day.notes)
      );
      root.appendChild(el('div', { class: 'section tight' }));
      root.appendChild(notes);
    }

    // Day navigation is in the sticky Itinerary bar at top — no buildDayNav here.

    root.appendChild(el('div', { class: 'bottom-pad' }));
  }

  function buildOfflineCard(){
    const estimate = generateTileURLs().length;
    const estMB = Math.round(estimate * 25 / 1024); // ~25KB per tile (PNG, mid-detail)
    const card = el('div', { class: 'offline-card', id: 'offline-card' },
      el('div', { class: 'oc-head' },
        el('div', { class: 'oc-headline' }, 'Offline maps'),
        el('span', { class: 'oc-status', id: 'dl-status' }, '\u2014')
      ),
      el('div', { class: 'oc-desc' }, `Cache Tokyo, Hakone, Fuji & Seoul map tiles so the maps work in airplane mode. About ${estimate.toLocaleString()} tiles, roughly ${estMB} MB.`),
      el('div', { class: 'oc-progress' },
        el('div', { class: 'oc-progress-fill', id: 'dl-fill' })
      ),
      el('div', { class: 'oc-label', id: 'dl-label' }, 'Tap below when you\u2019re on wifi.'),
      el('button', { class: 'oc-btn secondary', id: 'dl-btn', onclick: downloadOfflineMaps }, 'Download for offline')
    );
    setTimeout(refreshCacheStatus, 50);
    return card;
  }

  function buildResetCard(){
    const card = el('div', { class: 'offline-card reset-card' },
      el('div', { class: 'oc-head' },
        el('div', { class: 'oc-headline' }, 'Reset progress'),
        el('span', { class: 'oc-status', id: 'reset-status' }, resetCountLabel())
      ),
      el('div', { class: 'oc-desc' }, 'Unchecks every completed activity and to-do. Offline map tiles and other settings are not affected.'),
      el('button', { class: 'oc-btn reset-btn', id: 'reset-btn', onclick: confirmReset }, 'Reset checked items')
    );
    return card;
  }

  // ─── Trip Management ──────────────────────────────────────────────────────
  function getTrips(){
    const stored = localStorage.getItem('jk26.trips');
    if (stored) {
      try {
        const trips = JSON.parse(stored);
        // Ensure all trips have required fields (migration for existing trips)
        trips.forEach(trip => {
          if (!trip.icon) trip.icon = '📄';
          if (!trip.docName) trip.docName = trip.name;
        });
        return trips;
      } catch (e) {
        return [];
      }
    }
    // Migrate old single doc URL to new trips array
    const oldUrl = localStorage.getItem('jk26.codaDocUrl');
    if (oldUrl) {
      const trips = [{ name: 'My Trip', url: oldUrl, icon: '📄', docName: 'My Trip', active: true }];
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

  function setActiveTrip(tripUrl){
    const trips = getTrips();
    trips.forEach(t => t.active = (t.url === tripUrl));
    saveTrips(trips);
  }

  async function addTrip(name, url, icon = null, docName = null){
    const trips = getTrips();
    // Check if URL already exists
    if (trips.some(t => t.url === url)) {
      alert('This trip URL is already added');
      return false;
    }
    // Set all trips to inactive, make new one active
    trips.forEach(t => t.active = false);
    trips.push({ 
      name, 
      url, 
      icon: icon || '📄', 
      docName: docName || name,
      active: true 
    });
    saveTrips(trips);
    return true;
  }

  async function fetchDocInfo(docUrl){
    try {
      const res = await fetch('/api/doc-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docUrl })
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch doc info: ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      console.error('Error fetching doc info:', err);
      return null;
    }
  }

  function removeTrip(tripUrl){
    let trips = getTrips();
    const index = trips.findIndex(t => t.url === tripUrl);
    if (index === -1) return;
    
    const wasActive = trips[index].active;
    trips.splice(index, 1);
    
    // If removed trip was active, make the first remaining trip active
    if (wasActive && trips.length > 0) {
      trips[0].active = true;
    }
    
    saveTrips(trips);
  }

  function buildTripsCard(){
    const trips = getTrips();
    const activeTrip = getActiveTrip();
    
    const card = el('div', { class: 'offline-card' },
      el('div', { class: 'oc-head' },
        el('div', { class: 'oc-headline' }, 'Trips'),
        el('span', { class: 'oc-status' }, trips.length === 0 ? 'No trips' : `${trips.length} trip${trips.length > 1 ? 's' : ''}`)
      ),
      el('div', { class: 'oc-desc' }, 'Manage your Coda trip documents. Select a trip to view its itinerary.')
    );

    // List of existing trips as inline select controls
    if (trips.length > 0) {
      const tripsList = el('div', { class: 'trips-select-list', style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } });
      const showBorders = trips.length > 1;
      
      trips.forEach(trip => {
        // Container for swipe-to-delete
        const container = el('div', { 
          class: 'trip-swipe-container',
          style: { 
            position: 'relative', 
            overflow: 'hidden',
            borderRadius: '8px'
          } 
        });
        
        // Check if device supports touch
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Delete button (revealed on swipe for touch, or on hover for desktop)
        const deleteBtn = el('div', {
          class: 'trip-delete-action',
          style: {
            position: 'absolute',
            right: '0',
            top: '0',
            bottom: '0',
            width: '80px',
            background: '#ff3b30',
            display: isTouchDevice ? 'flex' : 'none', // Hide on desktop by default
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: '600',
            fontSize: '14px',
            cursor: 'pointer',
            zIndex: '0'
          },
          onclick: () => {
            if (confirm(`Remove "${trip.name}"?`)) {
              removeTrip(trip.url);
              renderSettingsTab();
              toast(`Removed ${trip.name}`);
            }
          }
        }, 'Delete');
        
        // Desktop delete button (hidden on touch devices)
        const desktopDeleteBtn = !isTouchDevice ? el('button', {
          class: 'trip-desktop-delete',
          style: {
            marginLeft: '12px',
            padding: '6px 10px',
            fontSize: '22px',
            background: 'transparent',
            border: 'none',
            borderRadius: '4px',
            color: 'var(--fg-mid)',
            cursor: 'pointer',
            lineHeight: '1',
            transition: 'all 0.15s',
            opacity: '0',
            pointerEvents: 'none'
          },
          onclick: (e) => {
            e.stopPropagation();
            if (confirm(`Remove "${trip.name}"?`)) {
              removeTrip(trip.url);
              renderSettingsTab();
              toast(`Removed ${trip.name}`);
            }
          }
        }, '×') : null;
        
        // Trip row (swipeable on touch, hoverable on desktop)
        const tripRow = el('div', { 
          class: 'trip-select-item' + (trip.active ? ' selected' : ''),
          style: { 
            display: 'flex', 
            alignItems: 'center', 
            padding: '12px',
            background: trip.active ? 'rgba(255,255,255,0.05)' : 'var(--bg)',
            border: showBorders ? `2px solid ${trip.active ? 'rgba(255,255,255,0.3)' : 'var(--border)'}` : '2px solid transparent',
            borderRadius: '8px',
            cursor: trips.length > 1 ? 'pointer' : 'default',
            transition: 'transform 0.2s ease-out, background 0.2s',
            position: 'relative',
            touchAction: 'pan-y',
            zIndex: '1',
            boxSizing: 'border-box',
            transform: 'translateX(0)' // Ensure starting position
          }
        },
          el('div', { 
            style: { 
              fontSize: '24px', 
              marginRight: '12px',
              flexShrink: '0',
              lineHeight: '1'
            } 
          }, trip.icon || '📄'),
          el('div', { style: { flex: '1', minWidth: 0 } },
            el('div', { style: { fontWeight: '500', fontSize: '15px', color: 'var(--fg)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, trip.name),
            el('div', { style: { fontSize: '12px', color: 'var(--fg-mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, trip.docName || trip.name)
          ),
          desktopDeleteBtn
        );
        
        // Add hover effect for desktop delete button
        if (!isTouchDevice && desktopDeleteBtn) {
          tripRow.addEventListener('mouseenter', () => {
            desktopDeleteBtn.style.opacity = '1';
            desktopDeleteBtn.style.pointerEvents = 'auto';
          });
          tripRow.addEventListener('mouseleave', () => {
            desktopDeleteBtn.style.opacity = '0';
            desktopDeleteBtn.style.pointerEvents = 'none';
          });
        }
        
        // Swipe gesture handling (only for touch devices)
        if (isTouchDevice) {
          let touchStartX = 0;
          let touchStartY = 0;
          let currentX = 0;
          let isDragging = false;
          let isVerticalScroll = false;
          
          tripRow.addEventListener('touchstart', (e) => {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          isDragging = false;
          isVerticalScroll = false;
          tripRow.style.transition = 'none';
        }, { passive: true });
        
        tripRow.addEventListener('touchmove', (e) => {
          if (isVerticalScroll) return;
          
          const touchX = e.touches[0].clientX;
          const touchY = e.touches[0].clientY;
          const deltaX = touchX - touchStartX;
          const deltaY = touchY - touchStartY;
          
          // Determine if this is a vertical scroll (let it pass through)
          if (!isDragging && Math.abs(deltaY) > Math.abs(deltaX)) {
            isVerticalScroll = true;
            return;
          }
          
          // Only allow left swipe
          if (deltaX < 0) {
            isDragging = true;
            currentX = Math.max(deltaX, -80); // Max swipe of 80px (delete button width)
            tripRow.style.transform = `translateX(${currentX}px)`;
            e.preventDefault();
          }
        });
        
        tripRow.addEventListener('touchend', () => {
          if (!isDragging) {
            // Treat as a click
            if (!trip.active && trips.length > 1) {
              setActiveTrip(trip.url);
              renderSettingsTab();
              toast(`Switched to ${trip.name}`);
            }
            return;
          }
          
          tripRow.style.transition = 'transform 0.2s ease-out';
          
          // If swiped more than halfway, keep it open
          if (currentX < -40) {
            tripRow.style.transform = 'translateX(-80px)';
          } else {
            // Snap back
            tripRow.style.transform = 'translateX(0)';
          }
          
            isDragging = false;
          });
          
          // Close swipe on tap outside
          tripRow.addEventListener('click', (e) => {
            if (currentX < -40) {
              e.preventDefault();
              e.stopPropagation();
              tripRow.style.transition = 'transform 0.2s ease-out';
              tripRow.style.transform = 'translateX(0)';
              currentX = 0;
            }
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
    
    const buttonRow = el('div', { 
      id: 'add-trip-buttons',
      style: { display: 'flex', gap: '8px' } 
    });
    
    const addButton = el('button', { 
      class: 'oc-btn',
      id: 'show-add-trip-btn',
      style: { flex: '1' },
      onclick: () => {
        const form = $('#add-trip-form');
        const btnRow = $('#add-trip-buttons');
        const showBtn = $('#show-add-trip-btn');
        const cancelBtn = $('#cancel-add-trip-btn');
        
        if (form.style.display === 'none') {
          form.style.display = 'block';
          showBtn.textContent = '+ Add New Trip';
          cancelBtn.style.display = 'block';
        } else {
          form.style.display = 'none';
          cancelBtn.style.display = 'none';
          // Clear inputs
          $('#trip-name-input').value = '';
          $('#trip-url-input').value = '';
        }
      }
    }, '+ Add New Trip');
    
    const cancelButton = el('button', {
      class: 'oc-btn secondary',
      id: 'cancel-add-trip-btn',
      style: { flex: '1', display: 'none' },
      onclick: () => {
        const form = $('#add-trip-form');
        const cancelBtn = $('#cancel-add-trip-btn');
        form.style.display = 'none';
        cancelBtn.style.display = 'none';
        // Clear inputs
        $('#trip-name-input').value = '';
        $('#trip-url-input').value = '';
      }
    }, 'Cancel');
    
    buttonRow.appendChild(addButton);
    buttonRow.appendChild(cancelButton);
    
    const addForm = el('div', { 
      id: 'add-trip-form',
      style: { display: 'none', marginTop: '12px' } 
    },
      el('input', {
        type: 'text',
        id: 'trip-name-input',
        placeholder: 'Trip name (e.g., "Orlando 2026")',
        style: { 
          width: '100%', 
          padding: '10px', 
          marginBottom: '8px',
          background: 'var(--bg)', 
          border: '1px solid var(--border)', 
          borderRadius: '6px',
          color: 'var(--fg)',
          fontSize: '14px'
        }
      }),
      el('input', {
        type: 'text',
        id: 'trip-url-input',
        placeholder: 'Paste Coda doc URL',
        style: { 
          width: '100%', 
          padding: '10px', 
          marginBottom: '8px',
          background: 'var(--bg)', 
          border: '1px solid var(--border)', 
          borderRadius: '6px',
          color: 'var(--fg)',
          fontSize: '14px'
        }
      }),
      el('button', { 
        class: 'oc-btn',
        id: 'add-trip-submit-btn',
        style: { width: '100%' },
        onclick: async () => {
          const nameInput = $('#trip-name-input');
          const urlInput = $('#trip-url-input');
          const submitBtn = $('#add-trip-submit-btn');
          const cancelBtn = $('#cancel-add-trip-btn');
          const name = nameInput.value.trim();
          const url = urlInput.value.trim();
          
          if (!url) {
            alert('Please paste a Coda doc URL');
            return;
          }
          
          // Fetch doc info to get icon and doc name
          submitBtn.disabled = true;
          submitBtn.textContent = 'Fetching doc info...';
          
          const docInfo = await fetchDocInfo(url);
          const icon = docInfo?.icon || '📄';
          const docName = docInfo?.name || name || 'Untitled Trip';
          const tripName = name || docName;
          
          submitBtn.textContent = 'Add Trip';
          submitBtn.disabled = false;
          
          if (await addTrip(tripName, url, icon, docName)) {
            nameInput.value = '';
            urlInput.value = '';
            $('#add-trip-form').style.display = 'none';
            cancelBtn.style.display = 'none';
            renderSettingsTab();
            toast(`Added ${tripName}`);
          }
        }
      }, 'Add Trip')
    );
    
    addSection.appendChild(buttonRow);
    addSection.appendChild(addForm);
    card.appendChild(addSection);
    
    return card;
  }

  function buildSyncCard(){
    const activeTrip = getActiveTrip();
    const desc = activeTrip 
      ? `Pull the latest itinerary updates from "${activeTrip.name}". Takes about 1 minute. Changes will appear after refreshing.`
      : 'Add a trip above to enable syncing.';
    
    const card = el('div', { class: 'offline-card' },
      el('div', { class: 'oc-head' },
        el('div', { class: 'oc-headline' }, 'Sync from Coda'),
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
      toast('Please add a trip first in Settings');
      return;
    }
    const docUrl = activeTrip.url;

    btn.disabled = true;
    btn.textContent = 'Syncing...';
    status.textContent = 'Triggering...';

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docUrl })
      });

      const data = await res.json();

      if (!res.ok){
        throw new Error(data.error || `Sync failed with status ${res.status}`);
      }

      status.textContent = 'Sync started!';
      btn.textContent = 'Sync now';
      btn.disabled = false;
      toast(`Syncing ${activeTrip.name}! Check back in ~1 minute for updates.`);
    } catch (err){
      console.error('Sync error:', err);
      status.textContent = 'Error';
      btn.textContent = 'Sync now';
      btn.disabled = false;
      toast('Sync failed: ' + err.message);
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
        btn.textContent = 'Reset checked items';
      }, 3500);
      return;
    }
    clearTimeout(resetArmTimer);
    resetArmed = false;
    checkedActs.clear();
    checkedTodos.clear();
    saveSet(STORAGE.activityChecks, checkedActs);
    saveSet(STORAGE.todoChecks, checkedTodos);
    btn.classList.remove('armed');
    btn.textContent = 'Reset checked items';
    const status = $('#reset-status');
    if (status) status.textContent = resetCountLabel();
    // Re-render whichever tab is visible so the UI reflects the reset.
    if (state.tab === 'today') renderToday();
    if (state.tab === 'activities') renderActivitiesTab();
    if (state.tab === 'todo') renderTodoTab();
    toast('Progress reset');
  }

  function buildLargeTitle(title, right){
    return el('div', { class: 'lt-title with-status' },
      el('h2', null, title),
      right || el('span')
    );
  }

  function buildItineraryPills(day, prevScrollLeft){
    const wrap = el('div', { class: 'lt-sticky' });
    const pills = el('div', { class: 'chips chips-single day-pills' });
    D.days.forEach(d => {
      if (d.n === 11) pills.appendChild(el('div', { class: 'day-pill-sep' }, '\ud83c\uddef\ud83c\uddf5\u2192\ud83c\uddf0\ud83c\uddf7'));
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

  function buildFlightCard(f){
    return el('div', { class: 'flight-card' },
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
        el('div', { class: 'time' }, f.depart),
        el('div', { class: 'time' }, f.arrive)
      ),
      el('div', { class: 'fc-cities' },
        el('div', null, f.fromCity),
        el('div', null, f.toCity)
      )
    );
  }

  function buildActivityRow(a, day){
    const id = a.id;
    const checked = checkedActs.has(id);
    const row = el('div', { class: 'act-row' + (checked ? ' done' : ''), style: { '--day-accent': day.color }, 'data-id': id },
      el('div', { class: 'act-emoji' }, catEmoji(a.cat)),
      el('div', { class: 'act-body', onclick: (e) => { e.stopPropagation(); openSheet(a); } },
        el('div', { class: 'act-name' }, a.name),
        el('div', { class: 'act-meta' }, `${a.time} · ${a.cat}`)
      ),
      el('div', { class: 'checkbox', onclick: (e) => { e.stopPropagation(); toggleAct(id, row); } },
        svgCheck()
      )
    );
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
      if (d.n === 11) pills.appendChild(el('div', { class: 'day-pill-sep' }, '🇯🇵→🇰🇷'));
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

  function navTo(n){
    if (n < 1 || n > D.days.length) return;
    const old = state.todayDay;
    state.todayDay = n;
    // simple slide transition
    const root = $('#tab-today .scroll');
    root.style.transition = 'transform .22s ease, opacity .22s ease';
    root.style.transform = `translateX(${n > old ? -20 : 20}px)`;
    root.style.opacity = '0';
    setTimeout(() => {
      renderToday();
      const r2 = $('#tab-today .scroll');
      r2.style.transition = 'none';
      r2.style.transform = `translateX(${n > old ? 20 : -20}px)`;
      r2.style.opacity = '0';
      requestAnimationFrame(() => {
        r2.style.transition = 'transform .25s ease, opacity .25s ease';
        r2.style.transform = 'translateX(0)';
        r2.style.opacity = '1';
      });
      // scroll active pill into view
      const active = $('#tab-today .day-pill.active');
      if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 180);
  }

  // ─── Mini-map (Today tab) ─────────────────────────────────────────────────
  function buildMiniMap(day, acts){
    const node = $('#map-mini');
    if (!node) return;
    if (leafletMini) { leafletMini.remove(); leafletMini = null; }

    const center = activityCenter(day.n);
    leafletMini = L.map(node, {
      center: [center.lat, center.lng], zoom: 12,
      zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, tap: false
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 18, subdomains: 'abcd'
    }).addTo(leafletMini);

    const markers = [];
    acts.forEach(a => {
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
    renderFilterBar('map');
    const node = $('#map-full');
    // Hide the map container until it's fully built + sized, so the user
    // never sees the brief mid-render position jump (initial center → setView,
    // or invalidateSize fixing tile positions after the pane gains size).
    if (node) node.classList.add('is-settling');
    // Wait two RAFs so the now-active tab pane has a final laid-out size
    // before Leaflet measures the container.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      buildFullMap();
      if (leafletFull) leafletFull.invalidateSize({ animate: false, pan: false });
      // One more frame lets tiles position with the corrected size before reveal.
      requestAnimationFrame(() => {
        const n = $('#map-full');
        if (n) n.classList.remove('is-settling');
      });
    }));
  }
  let fullMapMarkers = [];
  let lastMapRegion = null;
  function buildFullMap(){
    const node = $('#map-full');
    if (!node) return;

    const region = state.region || 'JP';
    const fa = filteredActivities();
    const inBounds = (a) => {
      if (region === 'JP') return a.lng > 128 && a.lng < 150 && a.lat > 24 && a.lat < 46;
      if (region === 'KR') return a.lng > 124 && a.lng < 132 && a.lat > 33 && a.lat < 39;
      return true;
    };
    const inRegion = fa.filter(inBounds);

    // Compute the desired default view UP FRONT, so we can pass it as the
    // initial center/zoom on first construction — avoids the "create at default
    // → setView to target" two-step that caused the visible jump.
    const inUserJP = state.location && state.location.lat > 24 && state.location.lat < 46 && state.location.lng > 128 && state.location.lng < 150;
    const inUserKR = state.location && state.location.lat > 33 && state.location.lat < 39 && state.location.lng > 124 && state.location.lng < 132;
    let defaultCenter, defaultZoom;
    if ((region === 'JP' && inUserJP) || (region === 'KR' && inUserKR)){
      defaultCenter = [state.location.lat, state.location.lng]; defaultZoom = 13;
    } else if (region === 'JP'){
      defaultCenter = [35.6896, 139.6995]; defaultZoom = 11; // Tokyo
    } else {
      defaultCenter = [37.5665, 126.9780]; defaultZoom = 11; // Seoul
    }

    if (!leafletFull){
      leafletFull = L.map(node, {
        center: defaultCenter, zoom: defaultZoom,
        zoomControl: false, attributionControl: true,
        fadeAnimation: false, zoomAnimation: false
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 18, subdomains: 'abcd',
        attribution: '© OpenStreetMap, © CARTO'
      }).addTo(leafletFull);
    } else {
      // Make sure Leaflet knows the current container size BEFORE we change
      // the view or add markers — otherwise a later invalidateSize() can
      // shift tiles visibly.
      leafletFull.invalidateSize({ animate: false, pan: false });
    }

    fullMapMarkers.forEach(m => leafletFull.removeLayer(m));
    fullMapMarkers = [];

    inRegion.forEach(a => {
      const d = D.byDay[a.day];
      const m = L.marker([a.lat, a.lng], { icon: pinIcon(a.cat, d.color) }).addTo(leafletFull);
      m.on('click', () => openSheet(a));
      fullMapMarkers.push(m);
    });
    if (state.location){
      const lm = L.marker([state.location.lat, state.location.lng], { icon: locationIcon() }).addTo(leafletFull);
      fullMapMarkers.push(lm);
    }

    const regionChanged = lastMapRegion !== region;
    lastMapRegion = region;

    if (anyFilterActive() && inRegion.length){
      // Filtered view: fit bounds to the filtered pins (no animation — we're
      // still inside the "settling" window, the user shouldn't see motion).
      const g = L.featureGroup(fullMapMarkers.filter(m => m._icon && m._icon.querySelector('.pin')));
      if (g.getLayers().length){
        leafletFull.fitBounds(g.getBounds(), { padding: [60, 30], maxZoom: 13, animate: false });
      }
    } else if (regionChanged){
      // Region changed (e.g. user tapped JP↔KR) — snap to the new region.
      // First-time construction already used defaultCenter/Zoom, so no
      // setView is needed in that case.
      leafletFull.setView(defaultCenter, defaultZoom, { animate: false });
    }

    // segmented active state
    $$('#segmented button').forEach(b => b.classList.toggle('active', b.dataset.region === region));
  }

  function renderFilterBar(tab){
    const wrap = $('#filter-bar-' + tab);
    if (!wrap) return;
    wrap.innerHTML = '';
    const rightSlot = anyFilterActive() ? el('button', { class: 'reset', onclick: resetFilters }, 'Reset') : null;
    wrap.appendChild(buildLargeTitle(tab === 'map' ? 'Map' : 'Activities', rightSlot));
    wrap.appendChild(buildFilterChipRow(tab));
  }

  function summaryChip(label, active, onclick){
    const c = el('button', { class: 'chip chip-summary' + (active ? ' active' : ''), onclick },
      el('span', { class: 'chip-label' }, label),
      svgIcon('chevron-down')
    );
    return c;
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
    }
    return svg;
  }

  // ─── Filter tray (bottom sheet for picking a filter value) ──────────────
  function openFilterTray(kind){
    state.filterTray = kind;
    const tray = $('#filter-tray');
    const backdrop = $('#filter-tray-backdrop');
    tray.innerHTML = '';

    tray.appendChild(el('div', { class: 'handle' }));
    tray.appendChild(el('button', { class: 'close', onclick: closeFilterTray }, '\u2715'));

    let title, options, currentArray, onPick;
    if (kind === 'day'){
      title = 'Filter by day';
      currentArray = filterState.day;
      options = [{ value: null, label: 'All Days', sub: 'Show every day' }]
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
    tray.appendChild(el('div', { class: 'bottom-pad' }));

    backdrop.classList.add('open');
    requestAnimationFrame(() => tray.classList.add('open'));
  }
  function closeFilterTray(){
    state.filterTray = null;
    $('#filter-tray').classList.remove('open');
    $('#filter-tray-backdrop').classList.remove('open');
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
  function syncFilters(){
    // Always re-render the filter bar (and Activities list header) so chip
    // states, Reset button, and search-mode toggle stay in sync. Typing in
    // the search input bypasses this via debouncedSync().
    renderFilterBar('map');
    if (state.tab === 'map') buildFullMap();
    if (state.tab === 'activities') renderActivitiesList();
  }

  // ─── Render: ACTIVITIES tab ───────────────────────────────────────────────
  function renderActivitiesTab(){
    renderActivitiesList();
  }

  function renderActivitiesList(skipBar){
    if (!skipBar){
      // Pinned header (title + chips) above the scroll
      const bar = $('#filter-bar-activities');
      bar.innerHTML = '';
      bar.appendChild(buildLargeTitle('Activities',
        anyFilterActive() ? el('button', { class: 'reset', onclick: resetFilters }, 'Reset') : null
      ));
      bar.appendChild(buildFilterChipRow('activities'));
    }

    const root = $('#activities-list');
    root.innerHTML = '';

    const fa = filteredActivities();
    if (!fa.length){
      const pieces = [];
      if (filterState.day.length) pieces.push(filterState.day.length === 1 ? `Day ${filterState.day[0]}` : `${filterState.day.length} days`);
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
      fa.sort((a,b) => a.day - b.day || timeOrder(a.time) - timeOrder(b.time)).forEach(a => {
        root.appendChild(buildFullRow(a, true));
      });
    } else {
      const days = [...new Set(fa.map(a => a.day))].sort((a,b)=>a-b);
      days.forEach(dn => {
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

  // Build a chip row used in the sticky lt-sticky wrapper (Activities tab) or
  // in the legacy filter-bar (Map tab).
  function buildFilterChipRow(tab){
    const wrap = el('div', { class: 'lt-sticky' });

    if (state.searching){
      const input = el('input', {
        type: 'search',
        placeholder: 'Search activities',
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
      setTimeout(() => input.focus(), 50);
      return wrap;
    }

    const chips = el('div', { class: 'chips chips-single' });

    chips.appendChild(el('button', {
      class: 'chip chip-icon',
      'aria-label': 'Search',
      onclick: () => { state.searching = true; syncFilters(); }
    }, svgIcon('search')));

    chips.appendChild(summaryChip(
      filterState.day.length === 0 ? 'All Days' : 
        filterState.day.length === 1 ? `Day ${filterState.day[0]} \u00b7 ${shortDate(D.byDay[filterState.day[0]].date)}` :
        `${filterState.day.length} Days`,
      filterState.day.length > 0,
      () => openFilterTray('day')
    ));
    chips.appendChild(summaryChip(
      filterState.timeOfDay.length === 0 ? 'All Times' :
        filterState.timeOfDay.length === 1 ? (D.timesOfDay.find(t => t.id === filterState.timeOfDay[0]).emoji + ' ' + filterState.timeOfDay[0]) :
        `${filterState.timeOfDay.length} Times`,
      filterState.timeOfDay.length > 0,
      () => openFilterTray('time')
    ));
    chips.appendChild(summaryChip(
      filterState.category.length === 0 ? 'All Types' :
        filterState.category.length === 1 ? (catEmoji(filterState.category[0]) + ' ' + filterState.category[0]) :
        `${filterState.category.length} Types`,
      filterState.category.length > 0,
      () => openFilterTray('type')
    ));

    wrap.appendChild(chips);
    return wrap;
  }
  function buildFullRow(a, showDayBadge){
    const d = D.byDay[a.day];
    const firstSentence = (a.desc || '').split(/(?<=[.!?])\s/)[0] || '';
    const badges = el('div', { class: 'badges' });
    if (showDayBadge) badges.appendChild(el('span', { class: 'badge day-badge', style: { '--day-accent': d.color, background: d.color } }, 'Day ' + d.n));
    badges.appendChild(el('span', { class: 'badge' }, todEmoji(a.time) + ' ' + a.time));
    badges.appendChild(el('span', { class: 'badge' }, catEmoji(a.cat) + ' ' + a.cat));

    return el('div', { class: 'full-row', style: { '--day-accent': d.color }, onclick: () => openSheet(a) },
      el('div', { class: 'em' }, catEmoji(a.cat)),
      el('div', null,
        el('div', { class: 'name' }, a.name),
        firstSentence ? el('div', { class: 'desc' }, firstSentence) : null,
        badges
      )
    );
  }

  // ─── Render: TO-DO tab ────────────────────────────────────────────────────
  function renderTodoTab(){
    const bar = $('#todo-header');
    bar.innerHTML = '';
    bar.appendChild(buildLargeTitle('To-Do'));

    const root = $('#todo-content');
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
    // Stable order: by day, then by time-of-day bucket, then by original index.
    return D.activities
      .map((a, i) => ({ id: a.id, day: a.day, t: timeOrder(a.time), i }))
      .sort((x, y) => x.day - y.day || x.t - y.t || x.i - y.i)
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

  function openSheet(a){
    state.sheet = a.id;
    const backdrop = $('#sheet-backdrop');
    const sheet = $('#sheet');
    sheet.innerHTML = '';

    const d = D.byDay[a.day];
    const prev = adjacentActivity(a.id, -1);
    const next = adjacentActivity(a.id, +1);
    sheet.appendChild(el('div', { class: 'handle' }));
    // Sheet header chrome (chevrons + close), pinned above the map
    sheet.appendChild(el('div', { class: 'sheet-nav' },
      el('button', { class: 'sheet-chev', disabled: prev ? null : '', 'aria-label': 'Previous activity', onclick: () => prev && openSheet(prev) }, '\u2039'),
      el('button', { class: 'sheet-chev', disabled: next ? null : '', 'aria-label': 'Next activity', onclick: () => next && openSheet(next) }, '\u203a'),
      el('div', { style: { flex: '1' } }),
      el('button', { class: 'close', onclick: closeSheet }, '\u2715')
    ));

    // map at top
    const mapWrap = el('div', { class: 'map-wrap' }, el('div', { id: 'map-sheet' }));
    sheet.appendChild(mapWrap);

    // distance / walk / transit (if we have geolocation, compute straight-line)
    const distRow = el('div', { class: 'distance' });
    if (state.location){
      const km = haversine(state.location, { lat: a.lat, lng: a.lng });
      const walkMin = Math.round(km / 5 * 60); // 5 km/h
      const transitMin = Math.round(km / 25 * 60); // 25 km/h avg
      distRow.appendChild(el('div', { class: 'dist-pill' }, '🚶 ', el('span', { class: 'v' }, walkMin + ' min')));
      distRow.appendChild(el('div', { class: 'dist-pill' }, '🚇 ', el('span', { class: 'v' }, transitMin + ' min')));
      distRow.appendChild(el('div', { class: 'dist-pill' }, '↔ ', el('span', { class: 'v' }, km.toFixed(1) + ' km')));
    } else {
      distRow.appendChild(el('div', { class: 'dist-pill', style: { color: 'var(--fg-mute)' } }, 'Enable location for travel times'));
    }
    sheet.appendChild(distRow);

    const body = el('div', { class: 'sheet-body' });
    body.appendChild(el('h2', { class: 'sheet-title' }, a.name));
    const badges = el('div', { class: 'sheet-badges' },
      el('span', { class: 'b', style: { background: d.color, color: '#fff', borderColor: 'transparent' } }, 'Day ' + d.n),
      el('span', { class: 'b' }, todEmoji(a.time) + ' ' + a.time),
      el('span', { class: 'b' }, catEmoji(a.cat) + ' ' + a.cat)
    );
    body.appendChild(badges);
    body.appendChild(el('div', { class: 'sheet-desc' }, a.desc || ''));
    sheet.appendChild(body);

    const actions = el('div', { class: 'sheet-actions' + (a.url ? '' : ' single') },
      el('a', {
        class: 'btn',
        href: `https://maps.google.com/?saddr=My+Location&daddr=${a.lat},${a.lng}`,
        target: '_blank', rel: 'noopener'
      }, 'Get Directions')
    );
    if (a.url){
      actions.appendChild(el('a', { class: 'btn secondary', href: a.url, target: '_blank', rel: 'noopener' }, 'More Info'));
    }
    sheet.appendChild(actions);
    sheet.appendChild(el('div', { class: 'bottom-pad' }));

    backdrop.classList.add('open');
    requestAnimationFrame(() => sheet.classList.add('open'));

    // Build mini map after slide-up
    setTimeout(() => {
      if (leafletSheet) { leafletSheet.remove(); leafletSheet = null; }
      const node = $('#map-sheet');
      leafletSheet = L.map(node, {
        center: [a.lat, a.lng], zoom: 14,
        zoomControl: false, attributionControl: false,
        dragging: true, scrollWheelZoom: false
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd'
      }).addTo(leafletSheet);
      L.marker([a.lat, a.lng], { icon: pinIcon(a.cat, d.color) }).addTo(leafletSheet);
      if (state.location){
        L.marker([state.location.lat, state.location.lng], { icon: locationIcon() }).addTo(leafletSheet);
        const dashed = L.polyline([[state.location.lat, state.location.lng], [a.lat, a.lng]], {
          color: '#bfb', weight: 1.5, dashArray: '4 4', opacity: 0.6
        }).addTo(leafletSheet);
        leafletSheet.fitBounds(dashed.getBounds(), { padding: [30,30] });
      }
    }, 380);
  }
  function closeSheet(){
    const backdrop = $('#sheet-backdrop');
    const sheet = $('#sheet');
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    state.sheet = null;
    if (leafletSheet){ setTimeout(() => { try { leafletSheet.remove(); } catch{} leafletSheet = null; }, 350); }
  }

  // Swipe-anywhere day navigation on the Today scroll
  function attachTodaySwipe(){
    const scroll = $('#tab-today .scroll');
    if (!scroll || scroll.__swipeBound) return;
    scroll.__swipeBound = true;
    let startX = null, startY = null, locked = null;
    scroll.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      locked = null;
    }, { passive: true });
    scroll.addEventListener('touchmove', e => {
      if (startX == null) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (locked == null && Math.abs(dx) + Math.abs(dy) > 8){
        locked = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : 'y';
      }
    }, { passive: true });
    scroll.addEventListener('touchend', e => {
      if (startX == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (locked === 'x' && adx > 60 && ady < 50){
        if (dx < 0) navTo(state.todayDay + 1);
        else        navTo(state.todayDay - 1);
      }
      startX = null; startY = null; locked = null;
    }, { passive: true });
  }

  // Swipe-to-dismiss for sheet
  function attachSheetGestures(){
    const sheet = $('#sheet');
    let startY = null, dy = 0;
    sheet.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      // only start drag if touch is in the upper drag region
      const rect = sheet.getBoundingClientRect();
      if (t.clientY - rect.top > 80) return;
      startY = t.clientY; dy = 0;
      sheet.style.transition = 'none';
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
      if (startY == null) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
      if (startY == null) return;
      sheet.style.transition = '';
      if (dy > 80) closeSheet();
      else sheet.style.transform = '';
      startY = null;
    });
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
  function tryGeolocate(){
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const distJP = haversine(state.location, { lat: 35.68, lng: 139.7 });
        const distKR = haversine(state.location, { lat: 37.55, lng: 126.97 });
        if (state.region == null) state.region = distJP < distKR ? 'JP' : 'KR';
      },
      _err => {},
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60_000 }
    );
  }

  // ─── Settings overlay ─────────────────────────────────────────────────────
  // ─── Render: SETTINGS tab ─────────────────────────────────────────────────
  function renderSettingsTab(){
    const header = $('#settings-header');
    header.innerHTML = '';
    header.appendChild(buildLargeTitle('Settings'));

    const root = $('#settings-content');
    root.innerHTML = '';
    root.appendChild(buildTripsCard());
    root.appendChild(buildOfflineCard());
    root.appendChild(buildSyncCard());
    root.appendChild(buildRefreshCard());
    root.appendChild(buildResetCard());
    root.appendChild(el('div', { class: 'settings-section-head' }, 'About'));
    root.appendChild(el('div', { class: 'settings-about' },
      el('div', null, 'Japan & Korea 2026'),
      el('div', { class: 'sub' }, 'Eby family trip companion \u00b7 Jul 22 \u2013 Aug 5'),
      el('div', { class: 'sub', style: 'margin-top: 8px; opacity: 0.6;' }, `Version ${APP_VERSION}`)
    ));
    root.appendChild(el('div', { class: 'bottom-pad' }));
    setTimeout(refreshCacheStatus, 60);
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
      toast('Location not available — showing all activities');
      // Re-fit to visible pins so the user gets a useful default.
      if (state.tab === 'map'){ buildFullMap(); setTimeout(fitMapToVisibleActivities, 100); }
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (state.tab === 'map'){
          const inJP = state.location.lng > 128 && state.location.lng < 150 && state.location.lat > 24 && state.location.lat < 46;
          const inKR = state.location.lng > 124 && state.location.lng < 132 && state.location.lat > 33 && state.location.lat < 39;
          if (inJP || inKR){
            state.region = inJP ? 'JP' : 'KR';
            buildFullMap();
            setTimeout(() => {
              if (leafletFull) leafletFull.flyTo([state.location.lat, state.location.lng], 14, { duration: 0.8 });
            }, 100);
          } else {
            // User is somewhere else in the world — flying to them would dump
            // the user in an empty map far from any pin. Instead, drop the
            // user-location marker and frame the visible activities.
            buildFullMap();
            setTimeout(fitMapToVisibleActivities, 100);
            toast('You\u2019re not in Japan or Korea — showing all activities');
          }
        }
        if (btn) btn.classList.remove('loading');
      },
      err => {
        if (btn) btn.classList.remove('loading');
        const msgs = {
          1: 'Location permission denied — showing all activities',
          2: 'Couldn\u2019t get your location — showing all activities',
          3: 'Location request timed out — showing all activities'
        };
        toast(msgs[err.code] || 'Location unavailable — showing all activities');
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
    if (tab === 'todo') renderTodoTab();
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
  // Bounding boxes for the four regions we'll cache tiles for.
  const REGIONS = [
    { name: 'Tokyo',  bounds: { n: 35.83, s: 35.50, w: 139.55, e: 139.92 } },
    { name: 'Hakone', bounds: { n: 35.30, s: 35.15, w: 138.95, e: 139.10 } },
    { name: 'Fuji',   bounds: { n: 35.43, s: 35.32, w: 138.69, e: 138.80 } },
    { name: 'Seoul',  bounds: { n: 37.70, s: 37.45, w: 126.80, e: 127.18 } }
  ];
  const TILE_ZOOMS = [10, 11, 12, 13];

  function lon2tile(lon, z){ return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
  function lat2tile(lat, z){
    return Math.floor((1 - Math.log(Math.tan(lat * Math.PI/180) + 1/Math.cos(lat * Math.PI/180))/Math.PI)/2 * Math.pow(2, z));
  }

  function generateTileURLs(){
    const urls = [];
    const subdomains = ['a','b','c','d'];
    REGIONS.forEach(r => {
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
          urls: ['./', 'trip-app.html', 'styles.css', 'app.js', 'data.js']
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
        if (url.endsWith('data.js') || url.endsWith('app.js') || url.endsWith('styles.css') || url.endsWith('.html')){
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
        if (fill) fill.style.width = '100%';
        if (lbl)  lbl.textContent  = `Saved ${d.done.toLocaleString()} map tiles for offline use ✓`;
        if (btn)  { btn.textContent = 'Re-download'; btn.disabled = false; }
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
    const urls = generateTileURLs();
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

  // ─── Wire up ──────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // tab bar
    $$('.tabbar button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    // segmented (map)
    $$('#segmented button').forEach(b => b.addEventListener('click', () => {
      state.region = b.dataset.region;
      buildFullMap();
    }));
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
    attachSheetGestures();
    attachTodaySwipe();
    // fullscreen map back
    $('#fm-back').addEventListener('click', closeFullscreenMap);
    // filter tray
    $('#filter-tray-backdrop').addEventListener('click', closeFilterTray);
    // initial
    tryGeolocate();
    updateOnline();
    registerSW();
    checkForUpdates();
    switchTab('today');
  });
})();
