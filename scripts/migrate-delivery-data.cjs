/**
 * Migration script: Delivery Data (batches, boxes, scanned_units)
 *
 * Source: c:/so_management/data/old_database/delivery.db
 * Target: c:/so_management/data/production.db
 *
 * Run: node scripts/migrate-delivery-data.cjs
 */

const OLD_DB = 'c:/so_management/data/old_database/delivery.db';
const NEW_DB = 'c:/so_management/data/production.db';

const oldDb = require('better-sqlite3')(OLD_DB);
const newDb = require('better-sqlite3')(NEW_DB);

console.log('='.repeat(60));
console.log('Migration: Delivery Data (Batches, Boxes, Scanned Units)');
console.log('='.repeat(60));
console.log();

let stats = {
  batchesMigrated: 0,
  batchesSkipped: 0,
  boxesMigrated: 0,
  boxesSkipped: 0,
  unitsMigrated: 0,
  unitsSkipped: 0,
};

try {
  // Build ID mapping: old po_item_id -> new so_item_id
  console.log('[Setup] Building ID mappings...');
  const poToSoItem = new Map();

  // Map po_items to so_items by matching po_id and item_number
  const oldPoItems = oldDb.prepare('SELECT id, po_id, item_number FROM po_items').all();
  const newSoItems = newDb.prepare('SELECT id, so_id, item_number FROM so_items').all();

  // Create lookup: po_item_id -> so_item_id
  for (const oldItem of oldPoItems) {
    const matching = newSoItems.find(
      newItem => newItem.so_id === oldItem.po_id && newItem.item_number === oldItem.item_number
    );
    if (matching) {
      poToSoItem.set(oldItem.id, matching.id);
    }
  }
  console.log(`  Mapped ${poToSoItem.size} po_item_id -> so_item_id`);
  console.log();

  // ============================================
  // 1. Migrate delivery_batches
  // ============================================
  console.log('[1/3] Migrating delivery_batches...');
  const oldBatches = oldDb.prepare('SELECT * FROM delivery_batches').all();

  for (const b of oldBatches) {
    const exists = newDb.prepare('SELECT id FROM delivery_batches WHERE id = ?').get(b.id);
    if (exists) {
      stats.batchesSkipped++;
      continue;
    }

    // Map po_item_id to so_item_id
    const newSoItemId = poToSoItem.get(b.po_item_id) || null;

    if (!newSoItemId) {
      console.log(`  ! Skipping batch ${b.id} - no matching so_item found for po_item: ${b.po_item_id}`);
      stats.batchesSkipped++;
      continue;
    }

    newDb.prepare(`
      INSERT INTO delivery_batches (
        id, so_item_id, item_card_barcode, qty_total, qty_scanned,
        boxes_required, boxes_completed, status, started_at, completed_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.id,
      newSoItemId,
      b.item_card_barcode || '',
      b.qty_total || 0,
      b.qty_scanned || 0,
      b.boxes_required || 0,
      b.boxes_completed || 0,
      b.status || 'IN_PROGRESS',
      b.started_at || new Date().toISOString(),
      b.completed_at || null,
      b.created_by || 'system'
    );
    stats.batchesMigrated++;
  }
  console.log(`  Migrated: ${stats.batchesMigrated} | Skipped: ${stats.batchesSkipped}`);

  // ============================================
  // 2. Migrate delivery_boxes
  // ============================================
  console.log('[2/3] Migrating delivery_boxes...');
  const oldBoxes = oldDb.prepare('SELECT * FROM delivery_boxes').all();

  // Get list of valid batch_ids in new DB
  const validBatchIds = new Set(newDb.prepare('SELECT id FROM delivery_batches').all().map(r => r.id));

  let skippedNoBatch = 0;
  for (const box of oldBoxes) {
    const exists = newDb.prepare('SELECT id FROM delivery_boxes WHERE id = ?').get(box.id);
    if (exists) {
      stats.boxesSkipped++;
      continue;
    }

    // Skip if batch doesn't exist (FK constraint)
    if (!validBatchIds.has(box.batch_id)) {
      skippedNoBatch++;
      stats.boxesSkipped++;
      continue;
    }

    newDb.prepare(`
      INSERT INTO delivery_boxes (
        id, batch_id, box_number, box_label, qty_capacity, qty_actual,
        status, sealed_at, sealed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      box.id,
      box.batch_id,
      box.box_number || 0,
      box.box_label || '',
      box.qty_capacity || 10,
      box.qty_actual || 0,
      box.status || 'OPEN',
      box.sealed_at || null,
      box.sealed_by || null
    );
    stats.boxesMigrated++;
  }
  if (skippedNoBatch > 0) {
    console.log(`  Note: ${skippedNoBatch} boxes skipped (batch not found)`);
  }
  console.log(`  Migrated: ${stats.boxesMigrated} | Skipped: ${stats.boxesSkipped}`);

  // ============================================
  // 3. Migrate scanned_units
  // ============================================
  console.log('[3/3] Migrating scanned_units...');
  const oldUnits = oldDb.prepare('SELECT * FROM scanned_units').all();

  let unitsWithMissingBox = 0;
  for (const u of oldUnits) {
    const exists = newDb.prepare('SELECT id FROM scanned_units WHERE id = ?').get(u.id);
    if (exists) {
      stats.unitsSkipped++;
      continue;
    }

    // Check if box_id exists in new DB
    const boxExists = newDb.prepare('SELECT id FROM delivery_boxes WHERE id = ?').get(u.box_id);
    if (!boxExists) {
      unitsWithMissingBox++;
      stats.unitsSkipped++;
      continue;
    }

    newDb.prepare(`
      INSERT INTO scanned_units (
        id, box_id, qr_code, serial_number, model_code,
        prefix_valid, scanned_at, scanned_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      u.id,
      u.box_id,
      u.qr_code || '',
      u.serial_number || '',
      u.model_code || '',
      u.prefix_valid || 1,
      u.scanned_at || new Date().toISOString(),
      u.scanned_by || 'system'
    );
    stats.unitsMigrated++;
  }
  if (unitsWithMissingBox > 0) {
    console.log(`  Note: ${unitsWithMissingBox} units skipped (box not found)`);
  }
  console.log(`  Migrated: ${stats.unitsMigrated} | Skipped: ${stats.unitsSkipped}`);

  // ============================================
  // Summary
  // ============================================
  console.log();
  console.log('='.repeat(60));
  console.log('Migration Complete!');
  console.log('='.repeat(60));
  console.log();
  console.log('Summary:');
  console.log(`  delivery_batches:  +${stats.batchesMigrated}  ~${stats.batchesSkipped} skipped`);
  console.log(`  delivery_boxes:   +${stats.boxesMigrated}  ~${stats.boxesSkipped} skipped`);
  console.log(`  scanned_units:    +${stats.unitsMigrated}  ~${stats.unitsSkipped} skipped`);
  console.log();

} catch (err) {
  console.error();
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  oldDb.close();
  newDb.close();
}