// Migration script to fix customer_id and destination_id in sales_orders
// to match customers.id and customer_destinations.code
// Run with: node scripts/migrate-fix-so-references.cjs

const Database = require('better-sqlite3');

// PRODUCTION DATABASE
const DB_PATH = process.env.DB_PATH || 'C:/so_management/data/production.db';

const db = new Database(DB_PATH, { timeout: 30000 });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('=== Fixing Sales Orders Customer & Destination References ===\n');

// 1. Get all customers for mapping
const customers = db.prepare('SELECT id, code, name FROM customers').all();
const customerMapById = {};
const customerMapByCode = {};
const customerMapByName = {};

customers.forEach(c => {
  customerMapById[c.id] = c;
  if (c.code) customerMapByCode[c.code.toLowerCase()] = c;
  if (c.name) customerMapByName[c.name.toLowerCase()] = c;
});
console.log(`Found ${customers.length} customers`);
console.log('Customer IDs:', customers.map(c => c.id).join(', '));

// 2. Get all destinations for mapping
const destinations = db.prepare(`
  SELECT id, customer_id, name, code, type_name, type_code
  FROM customer_destinations
`).all();

// Map by various keys
const destMapByCode = {};
const destMapByName = {};
const destMapByCustomerAndName = {}; // key: customer_id|name|type_name

destinations.forEach(d => {
  if (d.code) destMapByCode[d.code] = d;
  if (d.name) destMapByName[d.name.toLowerCase()] = d;

  const key = `${d.customer_id}|${d.name}|${d.type_name}`;
  destMapByCustomerAndName[key.toLowerCase()] = d;
});
console.log(`Found ${destinations.length} destinations`);
console.log('Destination codes:', destinations.map(d => d.code).join(', '));

// 3. Get all sales orders
const salesOrders = db.prepare(`
  SELECT id, so_number, customer_id, customer_name, destination_id,
         destination_name, delivery_destination, delivery_type
  FROM sales_orders
`).all();
console.log(`Found ${salesOrders.length} sales orders\n`);

let fixedCount = 0;
let noMatchCount = 0;
let alreadyValidCount = 0;

console.log('=== Processing Sales Orders ===\n');

salesOrders.forEach(so => {
  const updates = [];
  let needsUpdate = false;

  let newCustomerId = so.customer_id;
  let newDestinationId = so.destination_id;

  // 1. Fix customer_id - try to find matching customer
  const customerValid = customerMapById[so.customer_id];

  if (!customerValid) {
    // Try to find by customer_name
    const matchedByName = customerMapByName[so.customer_name?.toLowerCase()];
    if (matchedByName) {
      newCustomerId = matchedByName.id;
      updates.push(`customer_id: "${so.customer_id}" -> "${newCustomerId}" (matched by name "${so.customer_name}")`);
      needsUpdate = true;
    }
    // Try to find by customer_id as code
    const matchedByCode = customerMapByCode[so.customer_id?.toLowerCase()];
    if (matchedByCode && !needsUpdate) {
      newCustomerId = matchedByCode.id;
      updates.push(`customer_id: "${so.customer_id}" -> "${newCustomerId}" (matched by code "${so.customer_id}")`);
      needsUpdate = true;
    }
  }

  // 2. Fix destination_id - find matching destination
  const destValid = destMapByCode[so.destination_id];

  if (!destValid) {
    // Try to find by destination_name and delivery_type
    const destNameKey = `${newCustomerId}|${so.destination_name || so.delivery_destination}|${so.delivery_type}`;
    const matchedByNameAndType = destMapByCustomerAndName[destNameKey.toLowerCase()];

    if (matchedByNameAndType) {
      newDestinationId = matchedByNameAndType.code;
      updates.push(`destination_id: "${so.destination_id}" -> "${newDestinationId}" (matched by name+type)`);
      needsUpdate = true;
    } else {
      // Try by name only
      const matchedByNameOnly = destMapByName[so.destination_name?.toLowerCase()];
      if (matchedByNameOnly) {
        newDestinationId = matchedByNameOnly.code;
        updates.push(`destination_id: "${so.destination_id}" -> "${newDestinationId}" (matched by name "${so.destination_name}")`);
        needsUpdate = true;
      }
    }
  }

  if (needsUpdate) {
    console.log(`\nSO #${so.so_number} (${so.id}):`);
    updates.forEach(u => console.log(`  - ${u}`));

    // Apply the update
    const stmt = db.prepare(`
      UPDATE sales_orders
      SET customer_id = ?,
          destination_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(newCustomerId, newDestinationId, so.id);
    fixedCount++;
  } else {
    // Check if current data is valid
    const custValid = customerMapById[so.customer_id];
    const destValid2 = destMapByCode[so.destination_id] ||
                       destinations.find(d => d.code === so.destination_id);

    if (!custValid || !destValid2) {
      console.log(`\nSO #${so.so_number} (${so.id}): NO MATCH FOUND`);
      console.log(`  - customer_id: "${so.customer_id}" (${custValid ? 'VALID' : 'INVALID - not in customers table'})`);
      console.log(`  - destination_id: "${so.destination_id}" (${destValid2 ? 'VALID' : 'INVALID - not in customer_destinations'})`);
      noMatchCount++;
    } else {
      alreadyValidCount++;
    }
  }
});

// Summary
console.log('\n=== Summary ===');
console.log(`Already valid: ${alreadyValidCount}`);
console.log(`Fixed: ${fixedCount}`);
console.log(`No match found: ${noMatchCount}`);

// Show sample of current data after fix
console.log('\n=== Sample Data After Fix ===');
const samples = db.prepare(`
  SELECT so.id, so.so_number, so.customer_id,
         c.name as customer_name_found,
         so.destination_id,
         d.name as dest_name_found, d.type_name as dest_type
  FROM sales_orders so
  LEFT JOIN customers c ON c.id = so.customer_id
  LEFT JOIN customer_destinations d ON d.code = so.destination_id
  LIMIT 10
`).all();

samples.forEach(s => {
  console.log(`\nSO #${s.so_number}:`);
  console.log(`  customer_id: ${s.customer_id} -> ${s.customer_name_found || 'NOT FOUND'}`);
  console.log(`  destination_id: ${s.destination_id} -> ${s.dest_name_found ? `${s.dest_name_found} (${s.dest_type})` : 'NOT FOUND'}`);
});

console.log('\n=== Migration Complete ===');
db.close();
process.exit(0);