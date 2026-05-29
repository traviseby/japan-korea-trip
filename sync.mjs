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

const DOC_INPUT = process.env.CODA_DOC_URL || process.env.CODA_DOC_ID || 'JMxdg1mRFk';
const DOC = parseDocId(DOC_INPUT) || DOC_INPUT;
console.log(`Using Coda doc: ${DOC}`);

// Table names we're looking for
const TABLE_NAMES = {
  itinerary:  'Itinerary',
  activities: 'All activities',
  todos:      'To do list',
  flights:    'All flights'
};

// Will be populated dynamically
const TABLES = {};

// Itinerary column IDs (Coda)
const ITN = {
  date:        'c-z0sjOYlzr_',
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
  description: 'c-6VLWareh3p',
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
  day:        'c-Le4nrdcWKt',
  whenToBook: 'c-W3ISCaYuFs',
  link:       'c--yP_qNkDJ8',
  why:        'c-oWeEbh0W2Z',
  rec:        'c-zqX1gmo2AX'
};

// Flight column IDs
const FL = {
  trip:        'c-FFSCDOxN4M',
  airline:     'c-0zYwnaPiLh',
  fromCode:    'c-cAehzbeRgZ',
  toCode:      'c-XaRMQUIlCB',
  number:      'c-4j5mHMi2lp',
  date:        'c-zi1_WL4Z5_',
  fromCity:    'c-0PM_8S1PJ1',
  departTime:  'c-QDdLu0WGdF',
  toCity:      'c-gwntR7jmva',
  arriveTime:  'c-FZuDLcOtcn'
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

// Convert seconds-of-day → "HH:MM"
function fmtTimeSeconds(s){
  if (typeof s !== 'number') return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
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
async function fetchAllRows(tableId){
  const out = [];
  let pageToken = null;
  do {
  const params = new URLSearchParams({ limit: '200', useColumnNames: 'false', valueFormat: 'simple' });
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

// Convert a Coda date cell to YYYY-MM-DD, handling old (.epoch) and new (ISO string) formats.
function cellToDate(cell){
  if (!cell) return null;
  if (typeof cell === 'object' && typeof cell.epoch === 'number'){
    return new Date(cell.epoch * 1000).toISOString().slice(0, 10);
  }
  const s = typeof cell === 'string' ? cell : cell?.value;
  if (typeof s === 'string'){
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

for (const [key, name] of Object.entries(TABLE_NAMES)) {
  const table = allTables.find(t => t.name === name);
  if (!table) {
    console.error(`Table "${name}" not found in doc. Available tables:`, allTables.map(t => t.name));
    process.exit(1);
  }
  TABLES[key] = table.id;
  console.log(`Found table "${name}" → ${table.id}`);
}

// Fetch columns for each table
console.log('Fetching columns...');
const [itnCols, actCols, todoCols, flCols] = await Promise.all([
  fetchColumns(TABLES.itinerary),
  fetchColumns(TABLES.activities),
  fetchColumns(TABLES.todos),
  fetchColumns(TABLES.flights)
]);

const ITN_MAP = buildColumnMap(itnCols);
const ACT_MAP = buildColumnMap(actCols);
const TODO_MAP = buildColumnMap(todoCols);
const FL_MAP = buildColumnMap(flCols);

// Update hardcoded column ID objects with dynamic lookups
// Itinerary
ITN.date = ITN_MAP['Date'] || ITN.date;
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
ACT.activity = ACT_MAP['Activity'] || ACT.activity;
ACT.description = ACT_MAP['Description'] || ACT.description;
ACT.moreInfo = ACT_MAP['More Info'] || ACT.moreInfo;
ACT.category = ACT_MAP['Category'] || ACT.category;

// To-do
TODO.priority = TODO_MAP['Priority'] || TODO.priority;
TODO.item = TODO_MAP['Item'] || TODO.item;
TODO.type = TODO_MAP['Type'] || TODO.type;
TODO.day = TODO_MAP['Day'] || TODO.day;
TODO.whenToBook = TODO_MAP['When to Book'] || TODO.whenToBook;
TODO.link = TODO_MAP['Link'] || TODO.link;
TODO.why = TODO_MAP['Why'] || TODO.why;
TODO.rec = TODO_MAP['Recommendation'] || TODO.rec;

// Flights
FL.trip = FL_MAP['Trip'] || FL.trip;
FL.airline = FL_MAP['Airline'] || FL.airline;
FL.fromCode = FL_MAP['From Code'] || FL.fromCode;
FL.toCode = FL_MAP['To Code'] || FL.toCode;
FL.number = FL_MAP['Flight Number'] || FL.number;
FL.date = FL_MAP['Date'] || FL.date;
FL.fromCity = FL_MAP['From'] || FL.fromCity;
FL.departTime = FL_MAP['Departure'] || FL.departTime;
FL.toCity = FL_MAP['To'] || FL.toCity;
FL.arriveTime = FL_MAP['Arrival'] || FL.arriveTime;

console.log('Column mappings complete.');

// ── Main ───────────────────────────────────────────────────────────────────
console.log('Fetching table data...');
const [itnRows, actRows, todoRows, flightRows] = await Promise.all([
  fetchAllRows(TABLES.itinerary),
  fetchAllRows(TABLES.activities),
  fetchAllRows(TABLES.todos),
  fetchAllRows(TABLES.flights)
]);

// — Itinerary days, sorted by date
const days = itnRows
  .map(r => {
    const v = r.values;
    const iso = cellToDate(v[ITN.date]);
    if (!iso) return null;
    const dayNum = parseInt(v[ITN.overview].match(/Day (\d+)/)?.[1] ?? '0', 10);
    const meta = DAY_META[dayNum] || {};
    const locName = (v[ITN.location]?.name || v[ITN.location] || '').replace(/^[^\w]+\s*/, '').trim();
    return {
      n: dayNum,
      date: iso,
      title: stripFence(v[ITN.overview]).replace(/^Day \d+:\s*/, ''),
      loc: meta.locOverride || locName,
      country: meta.country,
      flag: meta.flag,
      lat: meta.lat,
      lng: meta.lng,
      color: meta.color,
      overview: stripFence(v[ITN.overview]),
      notes: stripFence(v[ITN.notes] || ''),
      hero: stripFence(v[ITN.imageUrl] || ''),
      desc: stripFence(v[ITN.description] || '')
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.n - b.n);

// — Activities
const activities = actRows.map(r => {
  const v = r.values;
  const id = r.id;
  // Guard against rows with no Date set in Coda — skip them rather than crash.
  const dayDate = cellToDate(v[ACT.date]);
  if (!dayDate) return null;
  const day = days.find(d => d.date === dayDate)?.n;
  const lat = v[ACT.latitude] || null;
  const lng = v[ACT.longitude] || null;
  return {
    id,
    day,
     time: v[ACT.timeOfDay]?.name || v[ACT.timeOfDay] || '',
    name: stripFence(v[ACT.activity]),
    desc: stripFence(v[ACT.description] || ''),
    url:  stripFence(v[ACT.moreInfo] || ''),
    cat:  stripFence(v[ACT.category]?.name || v[ACT.category] || ''),
    lat, lng
  };
}).filter(a => a && a.day);

// — To-dos and flights
const todos = todoRows.map(r => {
  const v = r.values;
  return {
    id: r.id,
    priority: (v[TODO.priority]?.name || v[TODO.priority] || '').replace(/^[^\w]+\s*/, '').trim(),
    item: v[TODO.item],
    type: v[TODO.type]?.name || v[TODO.type] || '',
    day: v[TODO.day] || '',
    whenToBook: v[TODO.whenToBook] || '',
    link: v[TODO.link]?.url || v[TODO.link] || '',
    why: v[TODO.why] || '',
    rec: v[TODO.rec] || ''
  };
});

const flights = flightRows.map(r => {
  const v = r.values;
  const fromCity = v[FL.fromCity] || '';
  const toCity   = v[FL.toCity] || '';
  return {
    trip:     v[FL.trip] || '',
    airline:  v[FL.airline] || '',
    number:   `${v[FL.airline] ? v[FL.airline].split(' ')[0] : ''} ${v[FL.number] || ''}`.trim(),
    from:     v[FL.fromCode] || deriveAirportCode(fromCity),
    to:       v[FL.toCode]   || deriveAirportCode(toCity),
    fromCity,
    toCity,
    date:     cellToDate(v[FL.date]) || '',
    depart:   fmtTimeSeconds(v[FL.departTime]?.seconds),
    arrive:   fmtTimeSeconds(v[FL.arriveTime]?.seconds)
  };
});

// ── Generate data.js ───────────────────────────────────────────────────────
// Category emoji mapping (used by catEmoji() in app.js)
const categories = {
  'Food & Drink': { label: 'Food & Drink', emoji: '🍜' },
  'Temple / Shrine': { label: 'Temple / Shrine', emoji: '⛩️' },
  'Hotel & Lodging': { label: 'Hotel & Lodging', emoji: '🏨' },
  'Train / Transit': { label: 'Train / Transit', emoji: '🚆' },
  'Culture & History': { label: 'Culture & History', emoji: '🎭' },
  'Nature & Parks': { label: 'Nature & Parks', emoji: '🌿' },
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
// Source: Coda doc dJMxdg1mRFk. Run \`node sync.mjs\` to regenerate.
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
console.log(`Wrote data.js — ${days.length} days, ${activities.length} activities, ${todos.length} todos, ${flights.length} flights`);
