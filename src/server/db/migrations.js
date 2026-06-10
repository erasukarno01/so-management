// migrations.js - Database migrations
import logger from '../utils/logger.js';

export function runMigrations(db) {
  logger.info('Running database migrations...');

  // Migration: Add remark column
  safeExec(db, "ALTER TABLE sales_orders ADD COLUMN remark TEXT DEFAULT ''", 'remark column to sales_orders');

  // Migration: Validate and fix delivery_type values
  migrateDeliveryTypes(db);

  // Migration: Add last_login column
  safeExec(db, "ALTER TABLE users ADD COLUMN last_login TEXT", 'last_login column to users');

  // Migration: Add password_plain column
  safeExec(db, "ALTER TABLE users ADD COLUMN password_plain TEXT", 'password_plain column to users');

  // Migration: Populate password_plain for existing users
  migratePasswords(db);

  // Migration: Add destination columns
  safeExec(db, "ALTER TABLE sales_orders ADD COLUMN destination_id TEXT", 'destination_id to sales_orders');
  safeExec(db, "ALTER TABLE sales_orders ADD COLUMN destination_name TEXT", 'destination_name to sales_orders');

  // Migration: Add delivery_types to customer_destinations
  safeExec(db, "ALTER TABLE customer_destinations ADD COLUMN delivery_types TEXT DEFAULT '[\"Regular\",\"CKD\",\"Non Regular\"]'", 'delivery_types to customer_destinations');

  // Migration: Add created_by to delivery_batches
  safeExec(db, "ALTER TABLE delivery_batches ADD COLUMN created_by TEXT", 'created_by to delivery_batches');

  // Migration: Add created_at to product_master (may not exist in older tables)
  safeExec(db, "ALTER TABLE product_master ADD COLUMN created_at TEXT", 'created_at to product_master');

  // Migration: Add code column to customers
  safeExec(db, "ALTER TABLE customers ADD COLUMN code TEXT", 'code column to customers');

  // Migration: Restructure customer_destinations - add type_name and type_code, drop delivery_types
  migrateDestinationStructure(db);

  // Migration: Update destination_name to proper case
  migrateDestinationNameCase(db);

  logger.info('Migrations complete');
}

function safeExec(db, sql, description) {
  try {
    db.exec(sql);
    logger.info(`Migration: ${description} added`);
  } catch (e) {
    // Column may already exist or table issue, ignore
  }
}

function migrateDestinationStructure(db) {
  try {
    // Check if new columns exist
    const tableInfo = db.prepare("PRAGMA table_info(customer_destinations)").all();
    const hasTypeName = tableInfo.some(col => col.name === 'type_name');
    const hasTypeCode = tableInfo.some(col => col.name === 'type_code');

    if (!hasTypeName) {
      db.exec("ALTER TABLE customer_destinations ADD COLUMN type_name TEXT NOT NULL DEFAULT 'Regular'");
      logger.info('Migration: type_name column added');
    }

    if (!hasTypeCode) {
      db.exec("ALTER TABLE customer_destinations ADD COLUMN type_code TEXT NOT NULL DEFAULT ''");
      logger.info('Migration: type_code column added');
    }

    // Migrate existing data: for each destination with delivery_types, create separate records
    try {
      const destinations = db.prepare("SELECT * FROM customer_destinations WHERE delivery_types IS NOT NULL").all();

      for (const dest of destinations) {
        let types = [];
        try {
          types = JSON.parse(dest.delivery_types || '[]');
        } catch {
          types = ['Regular'];
        }

        // For each type, create a separate record if it doesn't exist
        for (const typeName of types) {
          // Check if this destination+type combo already exists
          const existing = db.prepare(
            "SELECT id FROM customer_destinations WHERE customer_id = ? AND name = ? AND type_name = ?"
          ).get(dest.customer_id, dest.name, typeName);

          if (!existing) {
            const newId = require('uuid').v4();
            db.prepare(
              "INSERT INTO customer_destinations (id, customer_id, name, type_name, code, type_code, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
            ).run(newId, dest.customer_id, dest.name, typeName, dest.code, dest.code, dest.is_default);
          }
        }
      }
      logger.info(`Migration: restructured ${destinations.length} destinations`);
    } catch (e) {
      logger.warn('Migration: destination structure migration skipped', e.message);
    }
  } catch (e) {
    logger.warn('Migration: destination structure skipped', e.message);
  }
}

function migrateDeliveryTypes(db) {
  try {
    const validTypes = ['Regular', 'CKD', 'Non Regular'];
    const stmt = db.prepare("SELECT id, delivery_type, remark FROM sales_orders WHERE delivery_type NOT IN (?, ?, ?)");
    const rows = stmt.all('Regular', 'CKD', 'Non Regular');

    if (rows.length > 0) {
      const updateStmt = db.prepare("UPDATE sales_orders SET remark = ?, delivery_type = 'Non Regular' WHERE id = ?");
      for (const row of rows) {
        const newRemark = row.remark ? `${row.remark}; ${row.delivery_type}` : row.delivery_type;
        updateStmt.run(newRemark, row.id);
      }
      logger.info(`Migration: fixed ${rows.length} invalid delivery_type values`);
    }
  } catch (e) {
    logger.warn('Migration: delivery_type validation skipped', e.message);
  }
}

function migratePasswords(db) {
  try {
    const usersWithoutPlain = db.prepare("SELECT id, username FROM users WHERE password_plain IS NULL").all();
    if (usersWithoutPlain.length > 0) {
      logger.info(`Migrating ${usersWithoutPlain.length} existing users to add password_plain...`);
      const updateStmt = db.prepare("UPDATE users SET password_plain = ? WHERE id = ?");
      for (const user of usersWithoutPlain) {
        updateStmt.run(user.username + '123', user.id);
      }
      logger.info('Migration complete: existing users password_plain populated');
    }
  } catch (e) {
    logger.warn('Migration for password_plain skipped:', e.message);
  }
}

function toProperCase(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function migrateDestinationNameCase(db) {
  try {
    // Update destination_name in sales_orders to proper case
    const rows = db.prepare("SELECT id, destination_name FROM sales_orders WHERE destination_name IS NOT NULL AND destination_name != ''").all();

    if (rows.length > 0) {
      const updateStmt = db.prepare("UPDATE sales_orders SET destination_name = ? WHERE id = ?");
      for (const row of rows) {
        const properName = toProperCase(row.destination_name);
        if (properName !== row.destination_name) {
          updateStmt.run(properName, row.id);
        }
      }
      logger.info(`Migration: updated ${rows.length} destination_name to proper case`);
    }

    // Also update customer_destinations name to proper case
    const destRows = db.prepare("SELECT id, name FROM customer_destinations WHERE name IS NOT NULL AND name != ''").all();
    if (destRows.length > 0) {
      const updateDestStmt = db.prepare("UPDATE customer_destinations SET name = ? WHERE id = ?");
      for (const row of destRows) {
        const properName = toProperCase(row.name);
        if (properName !== row.name) {
          updateDestStmt.run(properName, row.id);
        }
      }
      logger.info(`Migration: updated ${destRows.length} customer_destinations name to proper case`);
    }
  } catch (e) {
    logger.warn('Migration: destination name case skipped', e.message);
  }
}

export default runMigrations;