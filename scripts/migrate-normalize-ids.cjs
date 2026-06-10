/**
 * Migration script: Normalize all IDs to UUID format
 *
 * Keep original values: qr_code, serial_number, model_code, prefix_valid, scanned_at, scanned_by
 * Update all IDs and foreign keys to UUID format
 *
 * Run: node scripts/migrate-normalize-ids.cjs
 */

const DB = 'c:/so_management/data/production.db';
const db = require('better-sqlite3')(DB);

// Disable foreign keys for migration
db.pragma('foreign_keys = OFF');

console.log('='.repeat(60));
console.log('Migration: Normalize All IDs to UUID Format');
console.log('='.repeat(60));
console.log();

let stats = {
  batchesUpdated: 0,
  boxesUpdated: 0,
  unitsUpdated: 0,
};

const batchIdMap = new Map();  // old batch_id -> new batch_id
const boxIdMap = new Map();     // old box_id -> new box_id

try {
  // ============================================
  // 1. Normalize delivery_batches IDs
  // ============================================
  console.log('[1/3] Normalizing delivery_batches IDs...');
  const batches = db.prepare('SELECT * FROM delivery_batches').all();

  for (const batch of batches) {
    // Check if already UUID format
    if (batch.id.includes('-') && batch.id.length === 36) {
      console.log(`  Skipping batch ${batch.id} (already UUID)`);
      batchIdMap.set(batch.id, batch.id);  // Map to itself
      continue;
    }

    const newBatchId = require('crypto').randomUUID();
    batchIdMap.set(batch.id, newBatchId);

    // Update batch with new ID
    db.prepare(`
      UPDATE delivery_batches
      SET id = ?
      WHERE id = ?
    `).run(newBatchId, batch.id);

    stats.batchesUpdated++;
    console.log(`  ${batch.id} -> ${newBatchId}`);
  }
  console.log(`  Updated: ${stats.batchesUpdated} batches`);
  console.log();

  // ============================================
  // 2. Normalize delivery_boxes IDs and batch_id
  // ============================================
  console.log('[2/3] Normalizing delivery_boxes IDs...');
  const boxes = db.prepare('SELECT * FROM delivery_boxes').all();

  for (const box of boxes) {
    // Check if already UUID format
    if (box.id.includes('-') && box.id.length === 36) {
      console.log(`  Skipping box ${box.id} (already UUID)`);
      boxIdMap.set(box.id, box.id);  // Map to itself
      continue;
    }

    const newBoxId = require('crypto').randomUUID();
    const newBatchId = batchIdMap.get(box.batch_id) || box.batch_id;

    boxIdMap.set(box.id, newBoxId);

    // Update box with new ID and new batch_id
    db.prepare(`
      UPDATE delivery_boxes
      SET id = ?, batch_id = ?
      WHERE id = ?
    `).run(newBoxId, newBatchId, box.id);

    stats.boxesUpdated++;
    console.log(`  ${box.id} -> ${newBoxId} (batch: ${box.batch_id} -> ${newBatchId})`);
  }
  console.log(`  Updated: ${stats.boxesUpdated} boxes`);
  console.log();

  // ============================================
  // 3. Normalize scanned_units IDs and box_id
  // ============================================
  console.log('[3/3] Normalizing scanned_units IDs and box_id...');
  const units = db.prepare('SELECT * FROM scanned_units').all();

  for (const unit of units) {
    const newBoxId = boxIdMap.get(unit.box_id) || unit.box_id;
    let newUnitId = unit.id;

    // Check if unit ID already UUID format
    const isUnitUuid = unit.id.includes('-') && unit.id.length === 36;
    if (!isUnitUuid) {
      newUnitId = require('crypto').randomUUID();
    }

    // Update unit with new ID and new box_id
    db.prepare(`
      UPDATE scanned_units
      SET id = ?, box_id = ?
      WHERE id = ?
    `).run(newUnitId, newBoxId, unit.id);

    stats.unitsUpdated++;
    console.log(`  ${unit.id} -> ${newUnitId} (box_id: ${unit.box_id} -> ${newBoxId})`);
  }
  console.log(`  Updated: ${stats.unitsUpdated} scanned_units`);
  console.log();

  // ============================================
  // Summary
  // ============================================
  console.log('='.repeat(60));
  console.log('Migration Complete!');
  console.log('='.repeat(60));
  console.log();
  console.log('Summary:');
  console.log(`  delivery_batches:  ${stats.batchesUpdated} IDs normalized`);
  console.log(`  delivery_boxes:     ${stats.boxesUpdated} IDs normalized`);
  console.log(`  scanned_units:     ${stats.unitsUpdated} box_ids normalized`);
  console.log();
  console.log('Data preserved (unchanged):');
  console.log('  - qr_code, serial_number, model_code, prefix_valid');
  console.log('  - scanned_at, scanned_by');
  console.log();

} catch (err) {
  console.error();
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
}