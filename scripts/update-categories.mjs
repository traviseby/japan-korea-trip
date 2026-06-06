// One-time script to update categories in Coda docs from multi-word to single-word names
// Usage: node scripts/update-categories.mjs

import 'dotenv/config';

const TOKEN = process.env.CODA_TOKEN;
if (!TOKEN) {
  console.error('Missing CODA_TOKEN env var');
  process.exit(1);
}

// Doc IDs
const DOCS = [
  { id: 'JMxdg1mRFk', name: 'Japan & Korea Trip' },
  { id: 'nmnstSTNl1', name: 'Orlando Trip' }
];

// Category mappings (old -> new)
const CATEGORY_MAP = {
  'Food & Drink': 'Food',
  'Temple / Shrine': 'Temple',
  'Hotel & Lodging': 'Hotel',
  'Train / Transit': 'Transit',
  'Culture & History': 'Culture',
  'Nature & Parks': 'Nature'
};

async function updateDoc(docId, docName) {
  console.log(`\n📄 Processing: ${docName}`);
  
  // Get tables
  const tablesRes = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const tablesData = await tablesRes.json();
  
  // Find Activities table
  const activitiesTable = tablesData.items.find(t => t.name === 'All activities');
  if (!activitiesTable) {
    console.error(`  ❌ Activities table not found in ${docName}`);
    return;
  }
  
  const tableId = activitiesTable.id;
  console.log(`  ✓ Found Activities table: ${tableId}`);
  
  // Get columns
  const colsRes = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/columns`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const colsData = await colsRes.json();
  const categoryCol = colsData.items.find(c => c.name === 'Category');
  
  if (!categoryCol) {
    console.error(`  ❌ Category column not found`);
    return;
  }
  
  console.log(`  ✓ Found Category column: ${categoryCol.id}`);
  
  // Get all rows (in batches of 100)
  let allRows = [];
  let pageToken = null;
  
  do {
    const url = new URL(`https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/rows`);
    url.searchParams.set('valueFormat', 'simple');
    url.searchParams.set('limit', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    
    const rowsRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const rowsData = await rowsRes.json();
    
    allRows = allRows.concat(rowsData.items);
    pageToken = rowsData.nextPageToken;
  } while (pageToken);
  
  console.log(`  ✓ Retrieved ${allRows.length} activities`);
  
  // Find rows that need updating
  const rowsToUpdate = [];
  for (const row of allRows) {
    const currentCat = row.values[categoryCol.id];
    if (!currentCat) continue;
    
    const newCat = CATEGORY_MAP[currentCat];
    if (newCat) {
      rowsToUpdate.push({
        rowNumberOrId: row.id,
        updateCells: [{
          columnId: categoryCol.id,
          value: newCat
        }]
      });
    }
  }
  
  console.log(`  ℹ️  ${rowsToUpdate.length} activities need updating`);
  
  if (rowsToUpdate.length === 0) {
    console.log(`  ✓ All categories are already up to date!`);
    return;
  }
  
  // Update in batches of 100
  for (let i = 0; i < rowsToUpdate.length; i += 100) {
    const batch = rowsToUpdate.slice(i, i + 100);
    console.log(`  📝 Updating batch ${Math.floor(i/100) + 1} (${batch.length} rows)...`);
    
    const updateRes = await fetch(`https://coda.io/apis/v1/docs/${docId}/tables/${tableId}/rows`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rows: batch })
    });
    
    if (!updateRes.ok) {
      const error = await updateRes.text();
      console.error(`  ❌ Update failed: ${error}`);
      continue;
    }
    
    console.log(`  ✓ Batch ${Math.floor(i/100) + 1} updated successfully`);
    
    // Rate limit: wait 1 second between batches
    if (i + 100 < rowsToUpdate.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`  ✅ ${docName} updated successfully!`);
}

// Process both docs
async function main() {
  console.log('🚀 Starting category migration...\n');
  console.log('Old -> New mappings:');
  for (const [old, newCat] of Object.entries(CATEGORY_MAP)) {
    console.log(`  "${old}" -> "${newCat}"`);
  }
  
  for (const doc of DOCS) {
    try {
      await updateDoc(doc.id, doc.name);
    } catch (err) {
      console.error(`\n❌ Error processing ${doc.name}:`, err.message);
    }
  }
  
  console.log('\n✨ Migration complete!');
  console.log('\n📌 Next steps:');
  console.log('  1. Run: node sync.mjs');
  console.log('  2. Commit: git add -A && git commit -m "Update categories to single-word names"');
  console.log('  3. Push: git push');
}

main();
