/**
 * Migration script: Old Delivery System -> New SO Management
 *
 * Source: C:/Delivery_System/data/delivery.db
 * Target: c:/so_management/data/production.db
 *
 * Run: node scripts/migrate-old-db.js
 */

const path = require('path');

const OLD_DB = 'c:/so_management/data/old_database/delivery.db';
const NEW_DB = 'c:/so_management/data/production.db';

const oldDb = require('better-sqlite3')(OLD_DB);
const newDb = require('better-sqlite3')(NEW_DB);

console.log('='.repeat(60));
console.log('Migration: Old Delivery System -> New SO Management');
console.log('='.repeat(60));
console.log();

let stats = {
  ordersMigrated: 0,
  ordersSkipped: 0,
  itemsMigrated: 0,
  itemsSkipped: 0,
  productsMigrated: 0,
  productsSkipped: 0,
  customersMigrated: 0,
  customersSkipped: 0,
};

try {
  // ============================================
  // 1. Migrate customers
  // ============================================
  console.log('[1/4] Migrating customers...');
  const oldCustomers = oldDb.prepare('SELECT * FROM customers').all();

  for (const c of oldCustomers) {
    const exists = newDb.prepare('SELECT id FROM customers WHERE id = ?').get(c.id);
    if (exists) {
      stats.customersSkipped++;
      continue;
    }

    newDb.prepare(`
      INSERT INTO customers (id, name, code, is_active, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run(c.id, c.name, c.name.substring(0, 3).toUpperCase());
    stats.customersMigrated++;
  }
  console.log(`  Migrated: ${stats.customersMigrated} | Skipped: ${stats.customersSkipped}`);

  // ============================================
  // 2. Migrate sales_orders (from purchase_orders)
  // ============================================
  console.log('[2/4] Migrating sales_orders...');
  const oldOrders = oldDb.prepare('SELECT * FROM purchase_orders').all();
  const orderIdMap = new Map();

  for (const o of oldOrders) {
    const exists = newDb.prepare('SELECT id FROM sales_orders WHERE id = ?').get(o.id);
    if (exists) {
      stats.ordersSkipped++;
      orderIdMap.set(o.id, o.id);
      continue;
    }

    const soId = o.id;

    // Map valid delivery_type or default to Non Regular
    const validTypes = ['Regular', 'CKD', 'Non Regular'];
    const deliveryType = validTypes.includes(o.delivery_type) ? o.delivery_type : 'Non Regular';

    newDb.prepare(`
      INSERT INTO sales_orders (
        id, so_number, customer_id, customer_name,
        delivery_date, bucket_no, delivery_destination, delivery_type,
        primary_item_number, total_qty_plan, total_qty_actual,
        status, remark, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      soId,
      o.po_number || o.id,
      o.customer_id || 'old-customer',
      o.customer_name || 'IYM',
      o.delivery_date ? o.delivery_date.substring(0, 10) : '',
      o.bucket_no || '',
      o.delivery_destination || '',
      deliveryType,
      o.primary_item_number || '',
      o.total_qty_plan || 0,
      o.total_qty_actual || 0,
      o.status || 'PENDING',
      o.remark || '',
      o.created_at || new Date().toISOString()
    );

    orderIdMap.set(o.id, soId);
    stats.ordersMigrated++;
    console.log(`  + ${o.po_number} -> ${soId.substring(0, 30)}...`);
  }
  console.log(`  Migrated: ${stats.ordersMigrated} | Skipped: ${stats.ordersSkipped}`);

  // ============================================
  // 3. Migrate so_items (from po_items)
  // ============================================
  console.log('[3/4] Migrating so_items...');
  const oldItems = oldDb.prepare('SELECT * FROM po_items').all();

  for (const item of oldItems) {
    const exists = newDb.prepare('SELECT id FROM so_items WHERE id = ?').get(item.id);
    if (exists) {
      stats.itemsSkipped++;
      continue;
    }

    const soId = orderIdMap.get(item.po_id) || item.po_id;

    newDb.prepare(`
      INSERT INTO so_items (
        id, so_id, item_number, model_code,
        qty_plan, qty_actual, delivery_schedule, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      item.id,
      soId,
      item.item_number || '',
      item.model_code || '',
      item.qty_plan || 0,
      item.qty_actual || 0,
      item.delivery_schedule || '{}'
    );
    stats.itemsMigrated++;
  }
  console.log(`  Migrated: ${stats.itemsMigrated} | Skipped: ${stats.itemsSkipped}`);

  // ============================================
  // 4. Migrate product_master
  // ============================================
  console.log('[4/4] Migrating product_master...');
  const oldProducts = oldDb.prepare('SELECT * FROM product_master').all();

  for (const p of oldProducts) {
    const exists = newDb.prepare('SELECT id FROM product_master WHERE id = ?').get(p.id);
    if (exists) {
      stats.productsSkipped++;
      continue;
    }

    newDb.prepare(`
      INSERT INTO product_master (
        id, part_number, model_code, prefix,
        box_capacity, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      p.id,
      p.part_number,
      p.model_code,
      p.prefix,
      p.box_capacity || 10,
      p.description || ''
    );
    stats.productsMigrated++;
  }
  console.log(`  Migrated: ${stats.productsMigrated} | Skipped: ${stats.productsSkipped}`);

  // ============================================
  // Summary
  // ============================================
  console.log();
  console.log('='.repeat(60));
  console.log('Migration Complete!');
  console.log('='.repeat(60));
  console.log();
  console.log('Summary:');
  console.log(`  customers:     +${stats.customersMigrated}  ~${stats.customersSkipped} skipped`);
  console.log(`  sales_orders:   +${stats.ordersMigrated}  ~${stats.ordersSkipped} skipped`);
  console.log(`  so_items:      +${stats.itemsMigrated}  ~${stats.itemsSkipped} skipped`);
  console.log(`  product_master:+${stats.productsMigrated}  ~${stats.productsSkipped} skipped`);
  console.log();

} catch (err) {
  console.error();
  console.error('ERROR:', err.message);
  console.error();
  console.error('Migration failed. Check error above.');
  process.exit(1);
} finally {
  oldDb.close();
  newDb.close();
}