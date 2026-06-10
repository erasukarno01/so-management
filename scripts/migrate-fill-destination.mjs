// Migration script: Fill NULL destination_id in sales_orders
import db from '../src/server/db/index.js';
import logger from '../src/server/utils/logger.js';

console.log('=== Migration: Fill NULL destination_id in sales_orders ===\n');

// Mapping kode singkatan ke destination
const destMapping = {
  'SRJ': { id: '2385', name: 'SURAJPUR', code: '2385' },
  'CHN': { id: '2S85', name: 'CHENNAI', code: '2S85' },
  'SJP': { id: '2385', name: 'SURAJPUR', code: '2385' },
  'SJPR': { id: '2385', name: 'SURAJPUR', code: '2385' },
  'CHN1': { id: '2S85', name: 'CHENNAI', code: '2S85' },
  'CHN2': { id: '2S85', name: 'CHENNAI', code: '2S85' },
  'CHE': { id: '2S85', name: 'CHENNAI', code: '2S85' },
};

// Count NULL records before
const beforeCount = db.prepare('SELECT COUNT(*) as cnt FROM sales_orders WHERE destination_id IS NULL').get();
console.log(`Records with NULL destination_id BEFORE: ${beforeCount.cnt}\n`);

// Get all records with NULL
const nullRecords = db.prepare('SELECT id, so_number, customer_name, destination_name FROM sales_orders WHERE destination_id IS NULL').all();

let updated = 0;
let skipped = 0;

for (const record of nullRecords) {
  const soId = record.id;

  // Extract destination code from ID pattern: CUSTOMER-DESTCODE-...
  const parts = soId.split('-');
  if (parts.length >= 2) {
    const destCode = parts[1];
    const mapping = destMapping[destCode];

    if (mapping) {
      // Update the record
      db.prepare(`
        UPDATE sales_orders
        SET destination_id = ?,
            destination_name = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(mapping.id, mapping.name, soId);

      console.log(`  Updated: ${soId} -> ${mapping.name} (${mapping.id})`);
      updated++;
    } else {
      console.log(`  SKIPPED (no mapping): ${soId} [dest_code: ${destCode}]`);
      skipped++;
    }
  } else {
    console.log(`  SKIPPED (invalid format): ${soId}`);
    skipped++;
  }
}

// Count NULL records after
const afterCount = db.prepare('SELECT COUNT(*) as cnt FROM sales_orders WHERE destination_id IS NULL').get();
console.log(`\nRecords with NULL destination_id AFTER: ${afterCount.cnt}`);
console.log(`Total updated: ${updated}`);
console.log(`Total skipped: ${skipped}`);

// Show sample updated records
console.log('\n=== Sample updated records ===');
const samples = db.prepare('SELECT id, so_number, customer_name, destination_id, destination_name FROM sales_orders WHERE destination_id IS NOT NULL ORDER BY updated_at DESC LIMIT 5').all();
samples.forEach(s => console.log(`  ${s.id}`));

db.close();
console.log('\n=== Migration complete ===');
