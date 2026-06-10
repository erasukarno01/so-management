// Migration script: Convert destination_name from CAPITAL to Proper Case
import db from '../src/server/db/index.js';

console.log('=== Migration: Convert destination_name to Proper Case ===\n');

// Helper function to convert to Proper Case
function toProperCase(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Count records before
const beforeCount = db.prepare("SELECT COUNT(*) as cnt FROM sales_orders WHERE destination_name = UPPER(destination_name) AND destination_name IS NOT NULL").get();
console.log(`Records with CAPITAL destination_name BEFORE: ${beforeCount.cnt}\n`);

// Get all unique destination names that need conversion
const capsNames = db.prepare("SELECT DISTINCT destination_name FROM sales_orders WHERE destination_name = UPPER(destination_name) AND destination_name IS NOT NULL").all();

console.log('=== Converting ===');
let updated = 0;

for (const { destination_name } of capsNames) {
  const properName = toProperCase(destination_name);

  db.prepare(`
    UPDATE sales_orders
    SET destination_name = ?,
        updated_at = datetime('now')
    WHERE destination_name = ?
  `).run(properName, destination_name);

  console.log(`  ${destination_name} -> ${properName}`);
  updated++;
}

// Show results
const afterCount = db.prepare("SELECT COUNT(*) as cnt FROM sales_orders WHERE destination_name = UPPER(destination_name) AND destination_name IS NOT NULL").get();
console.log(`\nRecords with CAPITAL destination_name AFTER: ${afterCount.cnt}`);

// Show updated samples
console.log('\n=== Sample updated records ===');
const samples = db.prepare('SELECT DISTINCT destination_name FROM sales_orders').all();
samples.forEach(s => console.log('  ' + s.destination_name));

db.close();
console.log('\n=== Migration complete ===');
