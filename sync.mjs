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
const DOC = 'JMxdg1mRFk';

const TABLES = {
  itinerary:  'grid-PJ65RQ3-wp',
  activities: 'grid-okRQmyti4u',
  todos:      'grid-s8eMJHic23',
  flights:    'grid-RCHSsWTcX-'
};

// Itinerary column IDs (Coda)
const ITN = {
  date:     'c-z0sjOYlzr_',
  overview: 'c-82EtXiid8b',
  location: 'c-Rau3re8Ruw',
  morning:  'c-5_TVnWBUEA',
  afternoon:'c-H7lvfl48II',
  evening:  'c-8pHRFZ82UL',
  notes:    'c-4eW8mULlU8',
  imageUrl: 'c--8ucXZYkAF'
};

// Activities column IDs
const ACT = {
  date:        'c-K7xOu63CvF',
  timeOfDay:   'c-NhewZvUbdQ',
  activity:    'c-WNA7XAkEYm',
  description: 'c-6VLWareh3p',
  moreInfo:    'c-OOu-mpFiAD',
  category:    'c-vAMQo8XJAc'
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

// Activity-level lat/lng, keyed by Coda row ID.
// (Extracted from the original data.js — never need to update unless adding
// brand-new activities not in Coda yet.)
const ACTIVITY_LATLNG = {
  'i-lrv4IIsiIR': [47.4502, -122.3088], 'i-re_ngHfBWS': [35.7720, 140.3929],
  'i-9kRwfKyBbi': [35.6896, 139.7006], 'i-n-P40d4FSl': [35.6948, 139.7029],
  'i-32BTP_fDqH': [35.6938, 139.7036], 'i-2qZ9Di2qQx': [35.6936, 139.7020],
  'i-Jz8vj-6614': [35.6595, 139.6993], 'i-JVeWTHnEQ8': [35.6537, 139.7892],
  'i-iMrm2_OrHC': [35.6575, 139.7000], 'i-Orql9IYLzk': [35.6583, 139.7032],
  'i-ruIk0cdX3P': [35.6594, 139.7008], 'i-Ierm_-B8R-': [35.6611, 139.6986],
  'i-ZjwuWxqHYx': [35.6608, 139.6982], 'i-GUL18oPGCO': [35.6595, 139.7005],
  'i-_WgQ0dE0Q9': [35.6608, 139.7019], 'i-y5Zhd8OOYN': [35.6586, 139.7028],
  'i-b-IRRhfhMn': [35.6620, 139.6995], 'i-gZPqox2KKD': [35.6852, 139.7100],
  'i-mJIgvrk7Wq': [35.6764, 139.6993], 'i-_-3Pi0IfLo': [35.6720, 139.6948],
  'i-jqZ8KuRY8u': [35.6702, 139.7027], 'i-qs0WepQIh1': [35.6716, 139.7028],
  'i-fS88CRUT6x': [35.6712, 139.7030], 'i-FtRPI0JIP_': [35.6705, 139.7032],
  'i-OhY3sfiTgf': [35.6710, 139.7040], 'i-LU2WXccA-x': [35.6662, 139.7124],
  'i-IyCmMmYS82': [35.6660, 139.7126], 'i-IJ-dYPBVEf': [35.6909, 139.6950],
  'i-zgez79OhcK': [35.7106, 139.8003], 'i-9h2Kg1XIlR': [35.6909, 139.6950],
  'i-JBLckUFDMS': [35.6918, 139.7044], 'i-0f0ig4MGiw': [35.6920, 139.6985],
  'i-0LHtpvMsdJ': [35.6907, 139.7038], 'i-hQfacRLoxX': [35.6883, 139.7016],
  'i-8VO7I4hSzY': [35.6940, 139.7032], 'i-J1i-hxAYbg': [35.6939, 139.7045],
  'i-Xr_dsqkpZO': [35.6929, 139.6998], 'i-jut0l5gzTY': [35.6939, 139.7041],
  'i-i-CtvsMHPT': [35.6947, 139.7053], 'i-0Fj-eR5QBT': [35.6938, 139.7050],
  'i-nNfuyJL49r': [35.6944, 139.7039], 'i-cvQzZnNOWV': [35.6940, 139.7035],
  'i-CmayqPx6tT': [35.6655, 139.7707], 'i-ui5hHqWIFC': [35.7148, 139.7967],
  'i-Tgbsi29qjT': [35.7140, 139.7965], 'i-a1qlx4v9I7': [35.7148, 139.7967],
  'i-1KpEwmULDZ': [35.7128, 139.7960], 'i-hUeZsz7uRa': [35.7022, 139.7745],
  'i-8TIxleQllM': [35.7008, 139.7710], 'i-VYtjLlVvzX': [35.7019, 139.7749],
  'i-mhN62Sexuc': [35.7025, 139.7732], 'i-9XZjHmqeyQ': [35.7018, 139.7732],
  'i-1VyIcr1d3I': [35.7028, 139.7745], 'i-mmKmNqwC-_': [35.6975, 139.7935],
  'i-rdusEXGcOp': [35.6614, 139.6677], 'i-tQcq9on3LL': [35.6614, 139.6680],
  'i-hvc20BWnsy': [35.6618, 139.6675], 'i-f1qnnpVo6D': [35.6610, 139.6672],
  'i-eZdWpycC8l': [35.6615, 139.6678], 'i-903AacUi0O': [35.6918, 139.7044],
  'i-At9VjPoAap': [35.6909, 139.7006], 'i-Z1jAHI4xLc': [35.2473, 139.0306],
  'i-M4CkHMmzf3': [35.2473, 139.0306], 'i-bgvqONpQot': [35.2473, 139.0306],
  'i-zWzNBUlv63': [35.2473, 139.0306], 'i-Or1-Hn9Dqu': [35.2380, 139.0270],
  'i--BrGN810dN': [35.2049, 139.0250], 'i-kyPAyNrhdj': [35.2046, 139.0252],
  'i-h_DRVYAR8-': [35.2412, 139.0186], 'i-L389J1yA-Y': [35.2412, 139.0186],
  'i-pvwFLIrOXf': [35.2462, 139.0489], 'i-hxDbX6ugME': [35.2473, 139.0306],
  'i-NgQtEc-w3-': [35.2473, 139.0306], 'i-TeF5_Wr6Nl': [35.2473, 139.0306],
  'i-6vGpGL9b96': [35.3956, 138.7325], 'i-HT1_g6yY82': [35.5494, 139.7798],
  'i-bc6cwFtD_X': [35.5494, 139.7798], 'i-ct_Tckm16A': [37.9586, 126.6779],
  'i-UChosLN3vK': [37.9559, 126.6764], 'i-FOrzqLUX6v': [37.9362, 126.7011],
  'i-3_-eoZBo-N': [37.9170, 126.6800], 'i-RhwFVSMcCU': [37.8961, 126.6816],
  'i-0pRGSqAPjt': [37.5346, 126.9942], 'i-nlozLYaUEC': [37.5794, 126.9910],
  'i--w30LIFn7-': [37.5810, 126.9930], 'i-AX6yo4ZBbN': [37.5826, 126.9836],
  'i-E7cC_n1hl9': [37.5240, 126.9803], 'i-f3e9rBuiFl': [37.5704, 127.0011],
  'i-cu_e8v1GG1': [37.5703, 127.0008], 'i-ZzrLa--N6R': [37.5128, 126.9408],
  'i-DAe2gLQC8u': [37.5128, 126.9408], 'i-A-36Z5k15a': [37.5665, 127.0093],
  'i-p91rpKI_UF': [37.5118, 127.0593], 'i-JoNKJtOYjq': [37.5117, 127.0593],
  'i-J9nJjiE1N3': [37.5125, 127.1025], 'i-MNOcr2Kjac': [37.4979, 127.0276],
  'i-VqmSd89Prb': [37.5588, 126.9777], 'i-Ko78YXp5vQ': [37.5590, 126.9777],
  'i-ANeqdbRXJP': [37.5512, 126.9882], 'i-LHg7btGl9t': [37.5497, 126.9876],
  'i-aI5jA3xL3S': [37.5563, 126.9237], 'i-k_O1ElbDg0': [37.5560, 126.9240],
  'i-f2L0TniNQ8': [37.5563, 126.9237], 'i-qLnartkx9p': [37.5546, 126.9224],
  'i-DL7o8Yybnw': [37.4602, 126.4407], 'i-aoSVhVQBZo': [37.4602, 126.4407]
};

// ── Coda fetch helper ──────────────────────────────────────────────────────
async function fetchAllRows(tableId){
  const out = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({ limit: '200', useColumnNames: 'false', valueFormat: 'rich' });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://coda.io/apis/v1/docs/${DOC}/tables/${tableId}/rows?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`Coda ${tableId}: ${res.status} ${await res.text()}`);
    const body = await res.json();
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

function dateISO(epoch){ return new Date(epoch * 1000).toISOString().slice(0, 10); }

// ── Main ───────────────────────────────────────────────────────────────────
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
    const epoch = v[ITN.date]?.epoch;
    if (!epoch) return null;
    const iso = dateISO(epoch);
    const dayNum = parseInt(v[ITN.overview].match(/Day (\d+)/)?.[1] ?? '0', 10);
    const meta = DAY_META[dayNum] || {};
    const locName = (v[ITN.location]?.name || '').replace(/^[^\w]+\s*/, '').trim();
    return {
      n: dayNum,
      date: iso,
      title: v[ITN.overview].replace(/^Day \d+:\s*/, ''),
      loc: meta.locOverride || locName,
      country: meta.country,
      flag: meta.flag,
      lat: meta.lat,
      lng: meta.lng,
      color: meta.color,
      overview: v[ITN.overview],
      notes: v[ITN.notes] || '',
      hero: v[ITN.imageUrl] || ''
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.n - b.n);

// — Activities
const activities = actRows.map(r => {
  const v = r.values;
  const id = r.id;
  const dateEpoch = v[ACT.date]?.epoch;
  if (!dateEpoch) return null;
  const dayDate = dateISO(dateEpoch);
  const day = days.find(d => d.date === dayDate)?.n;
  const [lat, lng] = ACTIVITY_LATLNG[id] || [null, null];
  return {
    id,
    day,
    time: v[ACT.timeOfDay]?.name || '',
    name: v[ACT.activity],
    desc: v[ACT.description] || '',
    url:  v[ACT.moreInfo] || '',
    cat:  v[ACT.category]?.name || '',
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
    date:     v[FL.date]?.epoch ? dateISO(v[FL.date].epoch) : '',
    depart:   fmtTimeSeconds(v[FL.departTime]?.seconds),
    arrive:   fmtTimeSeconds(v[FL.arriveTime]?.seconds)
  };
});

// ── Generate data.js ───────────────────────────────────────────────────────
const out = `// Auto-generated by sync.mjs — do not edit by hand.
// Source: Coda doc dJMxdg1mRFk. Run \`node sync.mjs\` to regenerate.
// Generated ${new Date().toISOString()}
window.DATA = ${JSON.stringify({ trip: { title: "Japan & Korea 2026", start: "2026-07-22", end: "2026-08-05" }, days, activities, todos, flights }, null, 2)};
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
