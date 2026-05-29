// Populates Latitude/Longitude columns in Coda Activities table
// Run with: node populate-coda-coordinates.mjs
import 'dotenv/config';

const CODA_TOKEN = process.env.CODA_TOKEN;
if (!CODA_TOKEN) {
  console.error('Missing CODA_TOKEN env var');
  process.exit(1);
}

const DOC_ID = 'JMxdg1mRFk';
const TABLE_ID = 'grid-okRQmyti4u';
const LAT_COL = 'c-1oOmaseFGM';
const LNG_COL = 'c-tmpeKQQks2';

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

// Update rows in batches of 100
const rowIds = Object.keys(ACTIVITY_LATLNG);
const BATCH_SIZE = 100;

for (let i = 0; i < rowIds.length; i += BATCH_SIZE) {
  const batch = rowIds.slice(i, i + BATCH_SIZE);
  const rows = batch.map(rowId => {
    const [lat, lng] = ACTIVITY_LATLNG[rowId];
    return {
      rowId,
      cells: [
        { column: LAT_COL, value: lat },
        { column: LNG_COL, value: lng }
      ]
    };
  });

  console.log(`Updating batch ${Math.floor(i / BATCH_SIZE) + 1}: rows ${i + 1}-${Math.min(i + BATCH_SIZE, rowIds.length)}`);
  
  const res = await fetch(`https://coda.io/apis/v1/docs/${DOC_ID}/tables/${TABLE_ID}/rows`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${CODA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ rows })
  });

  if (!res.ok) {
    console.error(`Batch failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  console.log(`✓ Batch complete`);
}

console.log(`\n✅ Successfully updated all ${rowIds.length} activities with coordinates!`);
