// sync.mjs — Coda → data.js sync
//
// Pulls the four Coda tables (Itinerary, Activities, Flights, To-do) for the
// Eby family trip and regenerates `data.js`. Static metadata that Coda doesn't
// hold (lat/lng per activity, day colors, country mapping) is kept in this
// file under STATIC.
//
// Usage (one-time setup):
//   1. Generate a Coda API token at https://coda.io/account → API tokens
//      (read-only access to the trip doc is enough).
//   2. Save it locally:  echo "CODA_TOKEN=xxx" > .env  (or export as env var)
//   3. Install deps:     npm install dotenv
//   4. Run:              node sync.mjs
//   5. Commit + push     git commit -am "sync from coda" && git push
//
// The script never sends data back to Coda. Read-only.
//
// Node 18+ required (uses built-in fetch).

import { writeFile, readFile } from 'node:fs/promises';
import 'dotenv/config';

const TOKEN = process.env.CODA_TOKEN;
if (!TOKEN){
  console.error('Missing CODA_TOKEN env var. Generate at https://coda.io/account');
  process.exit(1);
}

// Extract doc ID from URL or use directly
function parseDocId(input) {
  if (!input) return null;
  // Handle full URL: https://coda.io/d/Doc-Name_dDOC_ID or https://coda.io/d/Doc-Name_dDOC_ID/Page_suPAGE_ID
  const urlMatch = input.match(/_d([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  // If it looks like a doc ID already (no slashes/protocol), use as-is
  if (!input.includes('/') && !input.includes(':')) return input;
  return null;
}

const DOC_INPUT = process.env.CODA_DOC_URL || process.env.CODA_DOC_ID || 'xcK3zPlhp7';
const DOC = parseDocId(DOC_INPUT) || DOC_INPUT;
console.log(`Using Coda doc: ${DOC}`);

// Table names we're looking for
const TABLE_NAMES = {
  itinerary:  ['Itinerary'],
  activities: ['All activities'],
  todos:      ['To do list'],
  flights:    ['All Flights', 'All flights'],
  hotels:     ['All Hotels'],
  events:     ['All Tickets', 'All Events'],
  carRentals: ['All Car Rentals']
};

function findTable(items, names) {
  const candidates = Array.isArray(names) ? names : [names];
  for (const name of candidates) {
    const table = items.find(t => t.name === name);
    if (table) return table;
  }
  for (const name of candidates) {
    const lower = name.toLowerCase();
    const table = items.find(t => t.name.toLowerCase() === lower);
    if (table) return table;
  }
  return null;
}

// Will be populated dynamically
const TABLES = {};

// Itinerary column IDs (Coda)
const ITN = {
  date:        'c-z0sjOYlzr_',
  title:       'c-Ebj2pm2HX4',
  day:         'c-npV692QpTq',
  overview:    'c-82EtXiid8b',
  location:    'c-Rau3re8Ruw',
  morning:     'c-5_TVnWBUEA',
  afternoon:   'c-H7lvfl48II',
  evening:     'c-8pHRFZ82UL',
  notes:       'c-4eW8mULlU8',
  imageUrl:    'c--8ucXZYkAF',
  description: 'c-CvEOHfZnM_'
};

// Activities column IDs
const ACT = {
  date:        'c-K7xOu63CvF',
  timeOfDay:   'c-NhewZvUbdQ',
  activity:    'c-WNA7XAkEYm',
  description: 'c-hFjRSpkKWQ',
  moreInfo:    'c-OOu-mpFiAD',
  category:    'c-vAMQo8XJAc',
  latitude:    'c-1oOmaseFGM',
  longitude:   'c-tmpeKQQks2'
};

// To-do column IDs
const TODO = {
  priority:   'c-XUp6LeK3pt',
  item:       'c-OVygmzidPW',
  type:       'c-0molH_AJeV',
  whenToBook: 'c-W3ISCaYuFs',
  link:       'c--yP_qNkDJ8',
  why:        'c-oWeEbh0W2Z',
  rec:        'c-zqX1gmo2AX',
  activity:   'c-fKTdOgx0VF',
  idealTime:  'c-fGv6Dih3P8',
  done:       'c-56dJ7xyp0T'
};

// Flight column IDs (template fallbacks when columns are renamed in Coda)
const FL = {
  name:        'c-FFSCDOxN4M',
  airline:     'c-0zYwnaPiLh',
  fromCode:    'c-cAehzbeRgZ',
  toCode:      'c-XaRMQUIlCB',
  number:      'c-4j5mHMi2lp',
  date:        'c-zi1_WL4Z5_',
  fromCity:    'c-0PM_8S1PJ1',
  departTime:  'c-QDdLu0WGdF',
  toCity:      'c-gwntR7jmva',
  arriveTime:  'c-FZuDLcOtcn',
  arriveDate:  'c-7VGJFVjGCi',
  receipt:     'c-O8VedL3PU4',
  cost:        'c-tuKKd6A0D8',
  bookingCode: 'c-FXStD-KBA2'
};

// Hotel column IDs
const HTL = {
  startDate:   'c-HB-7dqei9S',
  endDate:     'c-tHkoPDa5gh',
  city:        'c-_2f664Cq79',
  nights:      'c-p3K68bZodo',
  name:        'c-kfe-fQQW2t',
  roomType:    'c-74-Y0AFSNV',
  address:     'c-ly0cgzSx8F',
  bookingCode: 'c-PLACEHOLDER1',
  cost:        'c-PLACEHOLDER2',
  receipt:     'c-PLACEHOLDER3',
  latitude:    'c-u-FBqV6NuK',
  longitude:   'c-8OjXlM0iKN'
};

// Events column IDs
const EVT = {
  name:          'c-kiFZ0M0kjP',
  provider:      'c-_P4izwrfSt',
  bookingRef:    'c-gNJrh2O6WO',
  date:          'c-WiwlYbb4h1',
  time:          'c-ZVDsJccngI',
  meetupAddress: 'c-Hi8adBIoSJ',
  latitude:      'c-HIL10v15I_',
  longitude:     'c-y6YMQt_1Kw',
  notes:         'c-_piSqa4hWt',
  cost:          'c-C6NG8dUgfy',
  receipt:       'c-PTOUgEz_Wi',
  moreInfo:      'c-zGATbJ6tpW',
  endTime:       'c-xiG4Fcu5H3'
};

// Car rental column IDs
const CAR = {
  provider:      'c-PS-TKGxgsQ',
  bookingCode:   'c-lrtyYT4qXg',
  pickupDate:    'c-orqKRPUA30',
  pickupTime:    'c-c52yNMQgbK',
  returnDate:    'c-dFfzC0AzGn',
  returnTime:    'c--Lw3065zU4',
  address:       'c-tHw5yKk5VZ',
  returnAddress: 'c-wlAzyfxacy',
  carType:       'c-pMZjbHr5Dz',
  cost:          'c-3qSW1C1Fpy',
  notes:         'c-x0lUlyXl3F',
  receipt:       'c-meN57e8B_8',
  latitude:      'c-ISU8SvVMeQ',
  longitude:     'c-EJvsYxIQMw'
};

// Convert "Tokyo (Narita)" → "NRT". Fallback: first 3 letters of city, upper.
function deriveAirportCode(cityField){
  if (!cityField) return '';
  const m = cityField.match(/\(([^)]+)\)/);
  if (m){
    const w = m[1].trim();
    const KNOWN = { Narita: 'NRT', Haneda: 'HND', Incheon: 'ICN' };
    return KNOWN[w] || w.slice(0, 3).toUpperCase();
  }
  return cityField.slice(0, 3).toUpperCase();
}

// Convert seconds-of-day → "H:MM AM/PM"
function fmtTimeSeconds(s){
  if (typeof s !== 'number') return '';
  const h24 = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function parseClockString(str) {
  if (!str) return null;
  const s = stripFence(String(str)).trim();
  const iso = s.match(/T(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (iso) return parseInt(iso[1], 10) * 3600 + parseInt(iso[2], 10) * 60;
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const ampm = m12[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 3600 + min * 60;
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) return parseInt(m24[1], 10) * 3600 + parseInt(m24[2], 10) * 60;
  return null;
}

function cellTimeDisplay(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return fmtTimeSeconds(v);
  if (typeof v === 'string') {
    const sec = parseClockString(v);
    if (sec != null) return fmtTimeSeconds(sec);
    const cleaned = stripFence(v);
    if (cleaned && !/^\d{4}-\d{2}-\d{2}T/.test(cleaned)) return cleaned;
    return '';
  }
  if (typeof v === 'object') {
    if (typeof v.seconds === 'number') return fmtTimeSeconds(v.seconds);
    for (const key of ['formatted', 'display', 'formattedValue', 'input', 'name']) {
      if (typeof v[key] !== 'string') continue;
      const sec = parseClockString(v[key]);
      if (sec != null) return fmtTimeSeconds(sec);
    }
    for (const key of ['formatted', 'display', 'formattedValue']) {
      const cleaned = stripFence(v[key]);
      if (cleaned) return cleaned;
    }
  }
  return '';
}

function cellCost(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && typeof v.scalar === 'number') return v.scalar;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function cellReceipt(v) {
  if (!v) return { name: '', url: '' };
  const items = Array.isArray(v) ? v : [v];
  for (const item of items) {
    if (typeof item === 'string' && item) return { name: item, url: '' };
    if (item && typeof item === 'object') {
      const name = item.name || '';
      const url = typeof item.url === 'string' ? item.url : '';
      if (url) return { name: name || 'Receipt', url };
      if (name) return { name, url: '' };
    }
  }
  return { name: '', url: '' };
}

// ── Static metadata: things Coda doesn't store, kept in code ───────────────
// Day colors, country mapping, lat/lng per activity.
const DAY_META = {
  1:  { color: '#5c6f87', country: 'JP', flag: '🇯🇵', lat: 47.4502, lng: -122.3088, locOverride: 'Travel' },
  2:  { color: '#1e6a9a', country: 'JP', flag: '🇯🇵', lat: 35.6896, lng: 139.6995 },
  3:  { color: '#8e44ad', country: 'JP', flag: '🇯🇵', lat: 35.6580, lng: 139.7016 },
  4:  { color: '#c0392b', country: 'JP', flag: '🇯🇵', lat: 35.6702, lng: 139.7027 },
  5:  { color: '#b25a14', country: 'JP', flag: '🇯🇵', lat: 35.6938, lng: 139.7036 },
  6:  { color: '#0e7560', country: 'JP', flag: '🇯🇵', lat: 35.7148, lng: 139.7967 },
  7:  { color: '#1e7d42', country: 'JP', flag: '🇯🇵', lat: 35.6614, lng: 139.6677 },
  8:  { color: '#2c3e50', country: 'JP', flag: '🇯🇵', lat: 35.2324, lng: 139.0260 },
  9:  { color: '#6c3483', country: 'JP', flag: '🇯🇵', lat: 35.2324, lng: 139.0260 },
  10: { color: '#3a6ea5', country: 'JP', flag: '🇯🇵', lat: 35.3956, lng: 138.7325, locOverride: 'Travel' },
  11: { color: '#c0392b', country: 'KR', flag: '🇰🇷', lat: 37.9586, lng: 126.6779 },
  12: { color: '#b53124', country: 'KR', flag: '🇰🇷', lat: 37.5794, lng: 126.9910 },
  13: { color: '#922b21', country: 'KR', flag: '🇰🇷', lat: 37.5128, lng: 126.9408 },
  14: { color: '#a93226', country: 'KR', flag: '🇰🇷', lat: 37.5563, lng: 126.9237 },
  15: { color: '#7b241c', country: 'KR', flag: '🇰🇷', lat: 37.4602, lng: 126.4407, locOverride: 'Travel' }
};

// Activity lat/lng are now stored in Coda columns (Latitude/Longitude)
// No more hardcoded mapping needed!

// ── Coda fetch helper ──────────────────────────────────────────────────────
async function fetchAllRows(tableId, valueFormat = 'simple'){
  const out = [];
  let pageToken = null;
  do {
  const params = new URLSearchParams({ limit: '200', useColumnNames: 'false', valueFormat });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://coda.io/apis/v1/docs/${DOC}/tables/${tableId}/rows?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`Coda ${tableId}: ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (tableId === TABLES.itinerary && out.length === 0 && body.items[0]) console.log('SAMPLE ITINERARY ROW:', JSON.stringify(body.items[0], null, 2));
    out.push(...body.items);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

// Coda's rich text comes as Slate JSON. We want plain readable text.
function flattenSlate(v){
  if (typeof v === 'string') return v;
  if (!v) return '';
  if (v.type === 'slate'){
    const lines = [];
    const walk = (n) => {
      if (typeof n === 'string') { lines[lines.length-1] = (lines[lines.length-1] || '') + n; return; }
      if (n.text != null) { lines[lines.length-1] = (lines[lines.length-1] || '') + n.text; return; }
      if (n.value && n.value.name) { lines[lines.length-1] = (lines[lines.length-1] || '') + n.value.name; return; }
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.type === 'Line') { lines.push(''); }
      if (n.children) n.children.forEach(walk);
      if (n.root) walk(n.root);
    };
    walk(v);
    return lines.filter(x => x && x.trim()).join('\n');
  }
  if (v.name) return v.name;
  return '';
}

// Coda often wraps rich-text/canvas cells in triple-backticks (```text```).
// Strip them so plain consumers don't see the fences.
function stripFence(v){
  if (typeof v !== 'string') return v;
  // remove all ``` markers (Coda uses these as rich-text delimiters)
  return v.replace(/```/g, '').trim();
}

function cellNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'object' && typeof v.scalar === 'number') return v.scalar;
  const n = parseInt(cellText(v), 10);
  return Number.isFinite(n) ? n : null;
}

function cellCoord(v) {
  const n = cellNumber(v);
  return n == null ? null : n;
}

function warnMissingColumns(tableName, colMap, requiredNames) {
  const missing = requiredNames.filter(name => !colMap[name]);
  if (missing.length) {
    console.warn(`[${tableName}] Missing expected columns: ${missing.join(', ')}`);
  }
  return missing;
}

function todoDayLabel(v, todoCols, activities, days) {
  const activityCell = v[todoCols.activity];
  const activityId = activityCell?.identifier
    || (typeof activityCell === 'string' ? activityCell : null);
  if (activityId) {
    const act = activities.find(a => a.id === activityId);
    if (act?.day) return `Day ${act.day}`;
  }
  const ideal = cellText(v[todoCols.idealTime]);
  if (ideal) return ideal;
  const why = cellText(v[todoCols.why]);
  const dayMatch = why.match(/\bDay\s+(\d+)\b/i);
  if (dayMatch) return `Day ${dayMatch[1]}`;
  return cellText(v[todoCols.whenToBook]) || '';
}

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return stripFence(v);
  if (typeof v === 'number') return String(v);
  const flat = flattenSlate(v);
  if (flat) return stripFence(String(flat));
  if (typeof v === 'object' && typeof v.name === 'string') return stripFence(v.name);
  return stripFence(String(v));
}

// Convert a Coda date cell to YYYY-MM-DD, handling old (.epoch) and new (ISO string) formats.
function cellToDate(cell){
  if (!cell) return null;
  if (typeof cell === 'object' && typeof cell.epoch === 'number'){
    return new Date(cell.epoch * 1000).toISOString().slice(0, 10);
  }
  let s = typeof cell === 'string' ? cell : cell?.value;
  if (typeof s === 'string'){
    s = stripFence(s);
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    const d = new Date(s);
    if (isFinite(d)) return d.toISOString().slice(0, 10);
  }
  return null;
}

// ── Dynamic table & column lookup ──────────────────────────────────────────
async function fetchTables() {
  const res = await fetch(`https://coda.io/apis/v1/docs/${DOC}/tables`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch tables: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.items;
}

async function fetchColumns(tableId) {
  const res = await fetch(`https://coda.io/apis/v1/docs/${DOC}/tables/${tableId}/columns`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch columns for table ${tableId}: ${res.status}`);
  }
  const json = await res.json();
  return json.items;
}

// Build column name → ID mapping
function buildColumnMap(columns) {
  const map = {};
  for (const col of columns) {
    map[col.name] = col.id;
  }
  return map;
}

// ── Initialize tables & columns ────────────────────────────────────────────
console.log('Fetching tables from Coda...');
const allTables = await fetchTables();

for (const [key, names] of Object.entries(TABLE_NAMES)) {
  const table = findTable(allTables, names);
  if (!table) {
    const tried = (Array.isArray(names) ? names : [names]).join(', ');
    console.error(`Table not found (tried: ${tried}). Available tables:`, allTables.map(t => t.name));
    process.exit(1);
  }
  TABLES[key] = table.id;
  console.log(`Found table "${table.name}" → ${table.id}`);
}

// Fetch columns for each table
console.log('Fetching columns...');
const [itnCols, actCols, todoCols, flCols, htlCols, evtCols, carCols] = await Promise.all([
  fetchColumns(TABLES.itinerary),
  fetchColumns(TABLES.activities),
  fetchColumns(TABLES.todos),
  fetchColumns(TABLES.flights),
  fetchColumns(TABLES.hotels),
  fetchColumns(TABLES.events),
  fetchColumns(TABLES.carRentals)
]);

const ITN_MAP = buildColumnMap(itnCols);
const ACT_MAP = buildColumnMap(actCols);
const TODO_MAP = buildColumnMap(todoCols);
const FL_MAP = buildColumnMap(flCols);
const HTL_MAP = buildColumnMap(htlCols);
const EVT_MAP = buildColumnMap(evtCols);
const CAR_MAP = buildColumnMap(carCols);

// Update hardcoded column ID objects with dynamic lookups
// Itinerary
ITN.date = ITN_MAP['Date'] || ITN.date;
ITN.title = ITN_MAP['Title'] || ITN.title;
ITN.day = ITN_MAP['Day'] || ITN.day;
ITN.overview = ITN_MAP['Overview'] || ITN.overview;
ITN.location = ITN_MAP['Location'] || ITN.location;
ITN.morning = ITN_MAP['Morning'] || ITN.morning;
ITN.afternoon = ITN_MAP['Afternoon'] || ITN.afternoon;
ITN.evening = ITN_MAP['Evening'] || ITN.evening;
ITN.notes = ITN_MAP['Notes'] || ITN.notes;
ITN.imageUrl = ITN_MAP['Image URL'] || ITN.imageUrl;
ITN.description = ITN_MAP['Description'] || ITN.description;

// Activities
ACT.date = ACT_MAP['Date'] || ACT.date;
ACT.timeOfDay = ACT_MAP['Time of Day'] || ACT.timeOfDay;
ACT.activity = ACT_MAP['Name'] || ACT_MAP['Activity'] || ACT.activity;
ACT.description = ACT_MAP['Description'] || ACT.description;
ACT.moreInfo = ACT_MAP['More Info'] || ACT.moreInfo;
ACT.category = ACT_MAP['Category'] || ACT.category;
ACT.latitude = ACT_MAP['Latitude'] || ACT_MAP['Lat'] || ACT.latitude;
ACT.longitude = ACT_MAP['Longitude'] || ACT_MAP['Lng'] || ACT.longitude;

// To-do
TODO.priority = TODO_MAP['Priority'] || TODO.priority;
TODO.item = TODO_MAP['Item'] || TODO.item;
TODO.type = TODO_MAP['Type'] || TODO.type;
TODO.whenToBook = TODO_MAP['When to Book / Do'] || TODO_MAP['When to Book'] || TODO.whenToBook;
TODO.link = TODO_MAP['Reservation Link'] || TODO_MAP['Link'] || TODO.link;
TODO.why = TODO_MAP['Why It Matters'] || TODO_MAP['Why'] || TODO.why;
TODO.rec = TODO_MAP['My Recommendation'] || TODO_MAP['Recommendation'] || TODO.rec;
TODO.activity = TODO_MAP['Activity'] || TODO.activity;
TODO.idealTime = TODO_MAP['Ideal Reservation Time'] || TODO.idealTime;
TODO.done = TODO_MAP['Done'] || TODO.done;

// Flights
FL.name = FL_MAP['Name'] || FL_MAP['Trip'] || FL.name;
FL.airline = FL_MAP['Airline'] || FL.airline;
FL.fromCode = FL_MAP['Departure Code'] || FL_MAP['Code'] || FL_MAP['From Code'] || FL_MAP['From (code)'] || FL.fromCode;
FL.toCode = FL_MAP['Arrival Code'] || FL_MAP['Dest code'] || FL_MAP['To Code'] || FL_MAP['To (code)'] || FL.toCode;
FL.number = FL_MAP['Flight #'] || FL_MAP['Flight Number'] || FL.number;
FL.date = FL_MAP['Depart Date'] || FL_MAP['Date'] || FL.date;
FL.arriveDate = FL_MAP['Arrival Date'] || FL.arriveDate;
FL.fromCity = FL_MAP['Depart City'] || FL_MAP['From'] || FL.fromCity;
FL.departTime = FL_MAP['Depart Time'] || FL_MAP['Departure'] || FL.departTime;
FL.toCity = FL_MAP['Arrive City'] || FL_MAP['To'] || FL.toCity;
FL.arriveTime = FL_MAP['Arrive Time'] || FL_MAP['Arrival'] || FL.arriveTime;
FL.bookingCode = FL_MAP['Booking Code'] || FL.bookingCode;
FL.receipt = FL_MAP['Receipt'] || FL.receipt;
FL.cost = FL_MAP['Cost'] || FL.cost;

function flightTripLabel(fromCity, toCity) {
  const from = String(fromCity || '').trim();
  const to = String(toCity || '').trim();
  if (from && to) return `${from} → ${to}`;
  return from || to || '';
}

// Hotels
HTL.startDate = HTL_MAP['Start Date'] || HTL.startDate;
HTL.endDate = HTL_MAP['End Date'] || HTL.endDate;
HTL.city = HTL_MAP['City'] || HTL.city;
HTL.nights = HTL_MAP['Nights'] || HTL.nights;
HTL.name = HTL_MAP['Name'] || HTL_MAP['Hotel Name'] || HTL.name;
HTL.roomType = HTL_MAP['Room Type'] || HTL.roomType;
HTL.address = HTL_MAP['Address'] || HTL.address;
HTL.bookingCode = HTL_MAP['Booking Code'] || HTL_MAP['Confirmation'] || HTL.bookingCode;
HTL.cost = HTL_MAP['Cost'] || HTL_MAP['Price'] || HTL.cost;
HTL.receipt = HTL_MAP['Receipt'] || HTL.receipt;
HTL.latitude = HTL_MAP['Latitude'] || HTL_MAP['Lat'] || HTL.latitude;
HTL.longitude = HTL_MAP['Longitude'] || HTL_MAP['Lng'] || HTL.longitude;

// Events
EVT.name = EVT_MAP['Name'] || EVT.name;
EVT.provider = EVT_MAP['Provider'] || EVT.provider;
EVT.bookingRef = EVT_MAP['Booking Code'] || EVT_MAP['Booking Reference'] || EVT.bookingRef;
EVT.date = EVT_MAP['Date'] || EVT.date;
EVT.time = EVT_MAP['Start Time'] || EVT_MAP['Time'] || EVT_MAP['Start time'] || EVT.time;
EVT.meetupAddress = EVT_MAP['Address'] || EVT_MAP['Meet-up Address'] || EVT.meetupAddress;
EVT.latitude = EVT_MAP['Latitude'] || EVT.latitude;
EVT.longitude = EVT_MAP['Longitude'] || EVT.longitude;
EVT.notes = EVT_MAP['Notes'] || EVT.notes;
EVT.cost = EVT_MAP['Cost'] || EVT.cost;
EVT.receipt = EVT_MAP['Receipt'] || EVT.receipt;
EVT.moreInfo = EVT_MAP['More Info'] || EVT.moreInfo;
EVT.endTime = EVT_MAP['End Time'] || EVT_MAP['End time'] || EVT.endTime;

// Car rentals
CAR.provider = CAR_MAP['Provider'] || CAR.provider;
CAR.bookingCode = CAR_MAP['Booking Code'] || CAR.bookingCode;
CAR.pickupDate = CAR_MAP['Pick-up Date'] || CAR_MAP['Pickup Date'] || CAR.pickupDate;
CAR.pickupTime = CAR_MAP['Pick-up Time'] || CAR_MAP['Pickup Time'] || CAR.pickupTime;
CAR.returnDate = CAR_MAP['Return Date'] || CAR.returnDate;
CAR.returnTime = CAR_MAP['Return Time'] || CAR.returnTime;
CAR.address = CAR_MAP['Address'] || CAR_MAP['Pick-up Address'] || CAR.address;
CAR.returnAddress = CAR_MAP['Return Address'] || CAR.returnAddress;
CAR.carType = CAR_MAP['Car Type'] || CAR.carType;
CAR.cost = CAR_MAP['Cost'] || CAR.cost;
CAR.notes = CAR_MAP['Notes'] || CAR.notes;
CAR.receipt = CAR_MAP['Receipt'] || CAR.receipt;
CAR.latitude = CAR_MAP['Latitude'] || CAR_MAP['Lat'] || CAR.latitude;
CAR.longitude = CAR_MAP['Longitude'] || CAR_MAP['Lng'] || CAR.longitude;

warnMissingColumns('Itinerary', ITN_MAP, ['Date', 'Title', 'Day', 'Overview', 'Location', 'Notes', 'Image URL', 'Description']);
warnMissingColumns('All activities', ACT_MAP, ['Date', 'Time of Day', 'Description', 'Category', 'More Info']);
if (!ACT_MAP['Name'] && !ACT_MAP['Activity']) {
  console.warn('[All activities] Missing expected columns: Name');
}
warnMissingColumns('To do list', TODO_MAP, ['Priority', 'Item', 'Type', 'When to Book / Do', 'Reservation Link', 'Why It Matters', 'My Recommendation']);
warnMissingColumns('All Flights', FL_MAP, ['Airline', 'Flight #', 'Depart Date', 'Depart City', 'Arrive City', 'Departure Code', 'Arrival Code', 'Receipt']);
warnMissingColumns('All Hotels', HTL_MAP, ['Name', 'City', 'Start Date', 'End Date', 'Address', 'Latitude', 'Longitude']);
warnMissingColumns('All Tickets', EVT_MAP, ['Name', 'Provider', 'Date', 'Start Time', 'Address', 'Receipt']);
warnMissingColumns('All Car Rentals', CAR_MAP, ['Provider', 'Pick-up Date', 'Pick-up Time', 'Return Date', 'Address', 'Car Type']);

console.log('Column mappings complete.');

// ── Main ───────────────────────────────────────────────────────────────────
console.log('Fetching table data...');
const [itnRows, actRows, todoRows, flightRows, hotelRows, eventRows, carRentalRows] = await Promise.all([
  fetchAllRows(TABLES.itinerary),
  fetchAllRows(TABLES.activities),
  fetchAllRows(TABLES.todos),
  fetchAllRows(TABLES.flights, 'rich'),
  fetchAllRows(TABLES.hotels),
  fetchAllRows(TABLES.events, 'rich'),
  fetchAllRows(TABLES.carRentals, 'rich')
]);

// — Itinerary days, sorted by date
const days = itnRows
  .map(r => {
    const v = r.values;
    const iso = cellToDate(v[ITN.date]);
    if (!iso) return null;
    const overviewText = stripFence(v[ITN.overview] || '');
    const title = stripFence(v[ITN.title] || '') || overviewText.replace(/^Day \d+:\s*/, '');
    const dayNum = cellNumber(v[ITN.day])
      ?? parseInt(overviewText.match(/Day (\d+)/)?.[1] ?? '0', 10);
    const meta = DAY_META[dayNum] || {};
    const locName = (v[ITN.location]?.name || v[ITN.location] || '').replace(/^[^\w]+\s*/, '').trim();
    return {
      n: dayNum,
      date: iso,
      title,
      loc: meta.locOverride || locName,
      country: meta.country,
      flag: meta.flag,
      lat: meta.lat,
      lng: meta.lng,
      color: meta.color,
      overview: overviewText || (dayNum && title ? `Day ${dayNum}: ${title}` : ''),
      notes: stripFence(v[ITN.notes] || ''),
      hero: stripFence(v[ITN.imageUrl] || ''),
      desc: stripFence(v[ITN.description] || '')
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.n - b.n);

// — Activities
const UNSCHEDULED_DAY = 0;
const activities = actRows.map(r => {
  const v = r.values;
  const id = r.id;
  const dayDate = cellToDate(v[ACT.date]);
  const lat = cellCoord(v[ACT.latitude]);
  const lng = cellCoord(v[ACT.longitude]);
  const activity = {
    id,
    time: v[ACT.timeOfDay]?.name || v[ACT.timeOfDay] || '',
    name: stripFence(v[ACT.activity]),
    desc: stripFence(v[ACT.description] || ''),
    url:  stripFence(v[ACT.moreInfo] || ''),
    cat:  normalizeCategory(stripFence(v[ACT.category]?.name || v[ACT.category] || '')),
    lat, lng
  };
  if (!dayDate) return { ...activity, day: UNSCHEDULED_DAY };
  const day = days.find(d => d.date === dayDate)?.n;
  if (!day) return null;
  return { ...activity, day };
}).filter(a => a && (a.day === UNSCHEDULED_DAY || a.day));

// — To-dos and flights
const todos = todoRows.map(r => {
  const v = r.values;
  return {
    id: r.id,
    priority: (v[TODO.priority]?.name || v[TODO.priority] || '').replace(/^[^\w]+\s*/, '').trim(),
    item: v[TODO.item],
    type: v[TODO.type]?.name || v[TODO.type] || '',
    day: todoDayLabel(v, TODO, activities, days),
    whenToBook: v[TODO.whenToBook] || '',
    link: v[TODO.link]?.url || v[TODO.link] || '',
    why: v[TODO.why] || '',
    rec: v[TODO.rec] || ''
  };
});

const flights = flightRows.map(r => {
  const v = r.values;
  const flightDate = cellToDate(v[FL.date]) || '';
  const dayNum = days.find(d => d.date === flightDate)?.n || null;
  const flightNum = cellText(v[FL.number]);
  const airline = cellText(v[FL.airline]);
  const fromCity = cellText(v[FL.fromCity]);
  const toCity = cellText(v[FL.toCity]);
  const receipt = cellReceipt(v[FL.receipt]);
  return {
    id:       r.id,
    trip:     flightTripLabel(fromCity, toCity),
    airline,
    flightNum,
    number:   `${airline ? airline.split(' ')[0] : ''} ${flightNum}`.trim(),
    from:     cellText(v[FL.fromCode]) || deriveAirportCode(fromCity),
    to:       cellText(v[FL.toCode])   || deriveAirportCode(toCity),
    fromCity,
    toCity,
    date:     flightDate,
    arriveDate: cellToDate(v[FL.arriveDate]) || '',
    day:      dayNum,
    depart:   cellTimeDisplay(v[FL.departTime]),
    arrive:   cellTimeDisplay(v[FL.arriveTime]),
    bookingCode: cellText(v[FL.bookingCode]),
    cost:     cellCost(v[FL.cost]),
    receipt:  receipt.name,
    receiptUrl: receipt.url
  };
});

const hotels = hotelRows.map(r => {
  const v = r.values;
  const receipt = cellReceipt(v[HTL.receipt]);
  return {
    id:          r.id,
    name:        v[HTL.name]?.name || v[HTL.name] || '',
    city:        v[HTL.city]?.name || v[HTL.city] || '',
    startDate:   cellToDate(v[HTL.startDate]) || '',
    endDate:     cellToDate(v[HTL.endDate]) || '',
    nights:      cellNumber(v[HTL.nights]) ?? 0,
    roomType:    v[HTL.roomType] || '',
    address:     v[HTL.address] || '',
    bookingCode: cellText(v[HTL.bookingCode]),
    cost:        cellCost(v[HTL.cost]),
    receipt:     receipt.name,
    receiptUrl:  receipt.url,
    lat:         cellCoord(v[HTL.latitude]),
    lng:         cellCoord(v[HTL.longitude])
  };
});

const events = eventRows.map(r => {
  const v = r.values;
  const date = cellToDate(v[EVT.date]) || '';
  const dayNum = days.find(d => d.date === date)?.n || null;
  const receipt = cellReceipt(v[EVT.receipt]);
  return {
    id:             r.id,
    name:           v[EVT.name] || '',
    provider:       v[EVT.provider]?.name || v[EVT.provider] || '',
    bookingRef:     v[EVT.bookingRef] || '',
    date,
    day:            dayNum,
    time:           cellTimeDisplay(v[EVT.time]),
    endTime:        cellTimeDisplay(v[EVT.endTime]),
    meetupAddress:  v[EVT.meetupAddress] || '',
    lat:            cellCoord(v[EVT.latitude]),
    lng:            cellCoord(v[EVT.longitude]),
    notes:          v[EVT.notes] || '',
    cost:           cellCost(v[EVT.cost]),
    receipt:        receipt.name,
    receiptUrl:     receipt.url,
    moreInfo:       v[EVT.moreInfo]?.url || v[EVT.moreInfo] || ''
  };
});

const carRentals = carRentalRows.map(r => {
  const v = r.values;
  const pickupDate = cellToDate(v[CAR.pickupDate]) || '';
  const dayNum = days.find(d => d.date === pickupDate)?.n || null;
  const receipt = cellReceipt(v[CAR.receipt]);
  return {
    id:            r.id,
    provider:      v[CAR.provider]?.name || v[CAR.provider] || '',
    bookingCode:   cellText(v[CAR.bookingCode]),
    pickupDate,
    pickupTime:    cellTimeDisplay(v[CAR.pickupTime]),
    returnDate:    cellToDate(v[CAR.returnDate]) || '',
    returnTime:    cellTimeDisplay(v[CAR.returnTime]),
    address:       v[CAR.address] || '',
    returnAddress: v[CAR.returnAddress] || '',
    carType:       v[CAR.carType] || '',
    cost:          cellCost(v[CAR.cost]),
    notes:         v[CAR.notes] || '',
    receipt:       receipt.name,
    receiptUrl:    receipt.url,
    lat:           cellCoord(v[CAR.latitude]),
    lng:           cellCoord(v[CAR.longitude]),
    day:           dayNum
  };
});

// ── Category mapping and normalization ────────────────────────────────────
// Maps old multi-word categories from Coda to simplified single-word names
const CATEGORY_NORMALIZE = {
  'Food & Drink': 'Food',
  'Temple / Shrine': 'Temple',
  'Hotel & Lodging': 'Hotel',
  'Train / Transit': 'Transit',
  'Culture & History': 'Culture',
  'Nature & Parks': 'Nature',
  // Single-word categories stay the same
  'Sightseeing': 'Sightseeing',
  'Shopping': 'Shopping',
  'Entertainment': 'Entertainment',
  'Wellness': 'Wellness',
  'Flight': 'Flight'
};

// Normalize category name (handles both old and new format from Coda)
function normalizeCategory(cat) {
  if (!cat) return '';
  return CATEGORY_NORMALIZE[cat] || cat;
}

// ── Generate data.js ───────────────────────────────────────────────────────
// Category emoji mapping (used by catEmoji() in app.js)
const categories = {
  'Food': { label: 'Food', emoji: '🍜' },
  'Temple': { label: 'Temple', emoji: '⛩️' },
  'Hotel': { label: 'Hotel', emoji: '🏨' },
  'Transit': { label: 'Transit', emoji: '🚆' },
  'Culture': { label: 'Culture', emoji: '🎭' },
  'Nature': { label: 'Nature', emoji: '🌿' },
  'Sightseeing': { label: 'Sightseeing', emoji: '📍' },
  'Shopping': { label: 'Shopping', emoji: '🛍️' },
  'Entertainment': { label: 'Entertainment', emoji: '🎟️' },
  'Wellness': { label: 'Wellness', emoji: '💆' },
  'Flight': { label: 'Flight', emoji: '✈️' }
};

// Times of day (used by todEmoji() in app.js)
const timesOfDay = [
  { id: 'Morning', emoji: '🌅' },
  { id: 'Afternoon', emoji: '☀️' },
  { id: 'Evening', emoji: '🌆' },
  { id: 'Late Night', emoji: '🌙' }
];

const generatedAt = new Date().toISOString();
const out = `// Auto-generated by sync.mjs — do not edit by hand.
// Source: Coda doc dxcK3zPlhp7 (Japen & Korea New). Run \`node sync.mjs\` to regenerate.
// Generated ${generatedAt}
window.DATA = ${JSON.stringify({
  trip: {
    title: "Japan & Korea 2026",
    start: "2026-07-22",
    end: "2026-08-05",
    lastGenerated: generatedAt
  },
  days,
  activities,
  todos,
  flights,
  hotels,
  events,
  carRentals,
  categories,
  timesOfDay
}, null, 2)};
(function(){
  const D = window.DATA;
  D.byId = {}; D.activities.forEach(a => D.byId[a.id] = a);
  D.byDay = {}; D.days.forEach(d => D.byDay[d.n] = d);
  D.dayActivities = {}; D.activities.forEach(a => {
    (D.dayActivities[a.day] = D.dayActivities[a.day] || []).push(a);
  });
})();
`;
await writeFile('data.js', out, 'utf8');
console.log(`Wrote data.js — ${days.length} days, ${activities.length} activities, ${todos.length} todos, ${flights.length} flights, ${hotels.length} hotels, ${events.length} events, ${carRentals.length} car rentals`);
