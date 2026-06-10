// Migration script to fix NULL values and non-standard formats in sales_orders
// Run with: node scripts/migrate-fix-sales-orders.cjs

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// PRODUCTION DATABASE
const DB_PATH = process.env.DB_PATH || 'C:/so_management/data/production.db';

const db = new Database(DB_PATH, { timeout: 30000 });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('=== Sales Orders Data Fix ===\n');

//1. Check for NULL/invalid delivery_date
console.log('1. Checking delivery_date format...');
const invalidDates = db.prepare(`
  SELECT id, so_number, delivery_date, customer_name
  FROM sales_orders
  WHERE delivery_date IS NULL
     OR delivery_date = ''
     OR delivery_date NOT LIKE '____-__-__'
     OR delivery_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
`).all();

if (invalidDates.length > 0) {
  console.log(`   Found ${invalidDates.length} records with invalid delivery_date:`);
  invalidDates.forEach(r => console.log(`   - ${r.so_number}: "${r.delivery_date}"`));
} else {
  console.log('   OK - All delivery_date values are valid');
}

// 2. Check for invalid delivery_type
console.log('\n2. Checking delivery_type values...');
const validTypes = ['Regular', 'CKD', 'Non Regular'];
const invalidTypes = db.prepare(`
  SELECT id, so_number, delivery_type
  FROM sales_orders
  WHERE delivery_type NOT IN ('Regular', 'CKD', 'Non Regular')
     OR delivery_type IS NULL
     OR delivery_type = ''
`).all();

if (invalidTypes.length > 0) {
  console.log(`   Found ${invalidTypes.length} records with invalid delivery_type:`);
  invalidTypes.forEach(r => console.log(`   - ${r.so_number}: "${r.delivery_type}"`));
} else {
  console.log('   OK - All delivery_type values are valid');
}

// 3. Check for invalid status
console.log('\n3. Checking status values...');
const invalidStatuses = db.prepare(`
  SELECT id, so_number, status
  FROM sales_orders
  WHERE status NOT IN ('PENDING', 'PARTIAL', 'COMPLETED')
     OR status IS NULL
     OR status = ''
`).all();

if (invalidStatuses.length > 0) {
  console.log(`   Found ${invalidStatuses.length} records with invalid status:`);
  invalidStatuses.forEach(r => console.log(`   - ${r.so_number}: "${r.status}"`));
} else {
  console.log('   OK - All status values are valid');
}

// 4. Check for NULL customer_id or customer_name
console.log('\n4. Checking customer_id and customer_name...');
const invalidCustomers = db.prepare(`
  SELECT id, so_number, customer_id, customer_name
  FROM sales_orders
  WHERE customer_id IS NULL
     OR customer_id = ''
     OR customer_name IS NULL
     OR customer_name = ''
`).all();

if (invalidCustomers.length > 0) {
  console.log(`   Found ${invalidCustomers.length} records with NULL/empty customer:`);
  invalidCustomers.forEach(r => console.log(`   - ${r.so_number}: customer_id="${r.customer_id}", customer_name="${r.customer_name}"`));
} else {
  console.log('   OK - All customer data is valid');
}

// 5. Check for bucket_no format
console.log('\n5. Checking bucket_no format...');
const invalidBuckets = db.prepare(`
  SELECT id, so_number, bucket_no, delivery_date
  FROM sales_orders
  WHERE bucket_no IS NOT NULL
 AND bucket_no != ''
    AND bucket_no NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
`).all();

if (invalidBuckets.length > 0) {
  console.log(`   Found ${invalidBuckets.length} records with invalid bucket_no format:`);
  invalidBuckets.forEach(r => console.log(`   - ${r.so_number}: "${r.bucket_no}"`));
} else {
  console.log('   OK - All bucket_no values are valid');
}

// 6. Check for missing destination data
console.log('\n6. Checking destination data...');
const missingDestinations = db.prepare(`
  SELECT id, so_number, destination_id, destination_name, delivery_destination
  FROM sales_orders
  WHERE (destination_id IS NULL OR destination_id = '')
    AND (destination_name IS NULL OR destination_name = '')
    AND (delivery_destination IS NULL OR delivery_destination = '')
`).all();

if (missingDestinations.length > 0) {
  console.log(`   Found ${missingDestinations.length} records with missing destination data:`);
  missingDestinations.forEach(r => console.log(`   - ${r.so_number}`));
} else {
  console.log('   OK - All destination data is valid');
}

// 7. Summary of total issues
console.log('\n=== Summary ===');
const totalIssues = invalidDates.length + invalidTypes.length + invalidStatuses.length +
                   invalidCustomers.length + invalidBuckets.length + missingDestinations.length;
console.log(`Total issues found: ${totalIssues}`);

// 8. Apply Fixes
console.log('\n=== Applying Fixes ===\n');

let fixCount = 0;

// Fix invalid delivery_date - set to today
if (invalidDates.length > 0) {
  console.log(`Fixing ${invalidDates.length} invalid delivery_date...`);
  const today = new Date().toISOString().split('T')[0];
  const fixDates = db.prepare(`
    UPDATE sales_orders
    SET delivery_date = ?,
        updated_at = datetime('now')
    WHERE delivery_date IS NULL
       OR delivery_date = ''
       OR delivery_date NOT LIKE '____-__-__'
       OR delivery_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
  `).run(today);
  fixCount += fixDates.changes;
  console.log(`   Fixed ${fixDates.changes} records`);
}

// Fix invalid delivery_type - set to 'Non Regular'
if (invalidTypes.length > 0) {
  console.log(`Fixing ${invalidTypes.length} invalid delivery_type...`);
  const fixTypes = db.prepare(`
    UPDATE sales_orders
    SET delivery_type = 'Non Regular',
        updated_at = datetime('now')
    WHERE delivery_type NOT IN ('Regular', 'CKD', 'Non Regular')
       OR delivery_type IS NULL
       OR delivery_type = ''
  `).run();
  fixCount += fixTypes.changes;
  console.log(`   Fixed ${fixTypes.changes} records`);
}

// Fix invalid status - set to 'PENDING'
if (invalidStatuses.length > 0) {
  console.log(`Fixing ${invalidStatuses.length} invalid status...`);
  const fixStatuses = db.prepare(`
    UPDATE sales_orders
    SET status = 'PENDING',
        updated_at = datetime('now')
    WHERE status NOT IN ('PENDING', 'PARTIAL', 'COMPLETED')
       OR status IS NULL
       OR status = ''
  `).run();
  fixCount += fixStatuses.changes;
  console.log(`   Fixed ${fixStatuses.changes} records`);
}

// Fix missing customer data - need manual review
if (invalidCustomers.length > 0) {
  console.log(`\nWARNING: ${invalidCustomers.length} records have missing customer data - manual review required`);
  invalidCustomers.forEach(r => {
    console.log(`   - ${r.so_number} (id: ${r.id})`);
  });
}

// Fix invalid bucket_no format - regenerate from delivery_date
if (invalidBuckets.length > 0) {
  console.log(`\nFixing ${invalidBuckets.length} invalid bucket_no format...`);
  const allOrders = db.prepare('SELECT id, delivery_date, bucket_no FROM sales_orders').all();
  let bucketFixCount = 0;

  for (const order of allOrders) {
    const bucketNo = order.bucket_no;
    if (bucketNo && !bucketNo.match(/^\d{4}-\d{2}$/)) {
      // Try to fix format
      const match = bucketNo.match(/^(\d{4})[-\s]?(\d{1,2})$/);
      if (match) {
        const fixedBucket = match[1] + '-' + String(Number(match[2])).padStart(2, '0');
        db.prepare('UPDATE sales_orders SET bucket_no = ?, updated_at = datetime(\'now\') WHERE id = ?').run(fixedBucket, order.id);
        bucketFixCount++;
      }
    }
  }
  fixCount += bucketFixCount;
  console.log(`   Fixed ${bucketFixCount} bucket_no formats`);
}

// Fix missing destination data - set to 'Unknown'
if (missingDestinations.length > 0) {
  console.log(`Fixing ${missingDestinations.length} missing destination data...`);
  const fixDests = db.prepare(`
    UPDATE sales_orders
    SET destination_name = 'Unknown',
        delivery_destination = 'Unknown',
        updated_at = datetime('now')
    WHERE (destination_id IS NULL OR destination_id = '')
      AND (destination_name IS NULL OR destination_name = '')
      AND (delivery_destination IS NULL OR delivery_destination = '')
  `).run();
  fixCount += fixDests.changes;
  console.log(`   Fixed ${fixDests.changes} records`);
}

console.log(`\n=== Total records fixed: ${fixCount} ===`);

// 9. Show current data stats
console.log('\n=== Current Data Stats ===');
const stats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN delivery_date IS NULL OR delivery_date = '' THEN 1 ELSE 0 END) as null_dates,
    SUM(CASE WHEN delivery_type NOT IN ('Regular', 'CKD', 'Non Regular') OR delivery_type IS NULL THEN 1 ELSE 0 END) as null_types,
    SUM(CASE WHEN status NOT IN ('PENDING', 'PARTIAL', 'COMPLETED') OR status IS NULL THEN 1 ELSE 0 END) as null_statuses,
    SUM(CASE WHEN customer_id IS NULL OR customer_id = '' THEN 1 ELSE 0 END) as null_customers,
    SUM(CASE WHEN bucket_no IS NULL OR bucket_no = '' THEN 1 ELSE 0 END) as null_buckets
  FROM sales_orders
`).get();

console.log(`Total records: ${stats.total}`);
console.log(`NULL/empty delivery_date: ${stats.null_dates}`);
console.log(`Invalid delivery_type: ${stats.null_types}`);
console.log(`Invalid status: ${stats.null_statuses}`);
console.log(`NULL/empty customer_id: ${stats.null_customers}`);
console.log(`NULL/empty bucket_no: ${stats.null_buckets}`);

// 10. Show sample of current data
console.log('\n=== Sample Data (first 5) ===');
const samples = db.prepare('SELECT id, so_number, customer_name, delivery_date, delivery_type, status, bucket_no FROM sales_orders LIMIT 5').all();
samples.forEach(s => {
  console.log(`- ${s.so_number}: ${s.customer_name}, ${s.delivery_date}, ${s.delivery_type}, ${s.status}, bucket: ${s.bucket_no}`);
});

console.log('\n=== Migration Complete ===');
db.close();
process.exit(0);
