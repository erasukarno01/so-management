// schema.js - Database schema definitions

export const SCHEMA = `
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','ppic','warehouse','qc','viewer')),
    password TEXT NOT NULL DEFAULT 'changeme',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT
  );

  -- Customers table
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    delivery_type_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Product master table
  CREATE TABLE IF NOT EXISTS product_master (
    id TEXT PRIMARY KEY,
    part_number TEXT NOT NULL,
    model_code TEXT NOT NULL,
    prefix TEXT NOT NULL,
    box_capacity INTEGER NOT NULL DEFAULT 10,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Sales orders table
  CREATE TABLE IF NOT EXISTS sales_orders (
    id TEXT PRIMARY KEY,
    so_number TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    destination_id TEXT,
    destination_name TEXT,
    delivery_date TEXT NOT NULL,
    bucket_no TEXT DEFAULT '',
    delivery_destination TEXT DEFAULT '',
    delivery_type TEXT NOT NULL DEFAULT 'Non Regular' CHECK(delivery_type IN ('Regular','CKD','Non Regular')),
    remark TEXT DEFAULT '',
    primary_item_number TEXT DEFAULT '',
    total_qty_plan INTEGER NOT NULL DEFAULT 0,
    total_qty_actual INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PARTIAL','COMPLETED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Customer destinations
  CREATE TABLE IF NOT EXISTS customer_destinations (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type_name TEXT NOT NULL DEFAULT 'Regular',
    code TEXT NOT NULL,
    type_code TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  );

  -- SO items
  CREATE TABLE IF NOT EXISTS so_items (
    id TEXT PRIMARY KEY,
    so_id TEXT NOT NULL,
    item_number TEXT NOT NULL,
    model_code TEXT NOT NULL,
    qty_plan INTEGER NOT NULL DEFAULT 0,
    qty_actual INTEGER NOT NULL DEFAULT 0,
    delivery_schedule TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (so_id) REFERENCES sales_orders(id) ON DELETE CASCADE
  );

  -- Delivery batches
  CREATE TABLE IF NOT EXISTS delivery_batches (
    id TEXT PRIMARY KEY,
    so_item_id TEXT NOT NULL,
    item_card_barcode TEXT NOT NULL,
    qty_total INTEGER NOT NULL DEFAULT 0,
    qty_scanned INTEGER NOT NULL DEFAULT 0,
    boxes_required INTEGER NOT NULL DEFAULT 0,
    boxes_completed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS','COMPLETED')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    created_by TEXT NOT NULL,
    FOREIGN KEY (so_item_id) REFERENCES so_items(id) ON DELETE CASCADE
  );

  -- Delivery boxes
  CREATE TABLE IF NOT EXISTS delivery_boxes (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    box_number INTEGER NOT NULL,
    box_label TEXT NOT NULL,
    qty_capacity INTEGER NOT NULL DEFAULT 0,
    qty_actual INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','SEALED')),
    sealed_at TEXT,
    sealed_by TEXT,
    FOREIGN KEY (batch_id) REFERENCES delivery_batches(id) ON DELETE CASCADE
  );

  -- Scanned units
  CREATE TABLE IF NOT EXISTS scanned_units (
    id TEXT PRIMARY KEY,
    box_id TEXT NOT NULL,
    qr_code TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    model_code TEXT NOT NULL,
    prefix_valid INTEGER NOT NULL DEFAULT 1,
    scanned_at TEXT NOT NULL,
    scanned_by TEXT NOT NULL,
    FOREIGN KEY (box_id) REFERENCES delivery_boxes(id) ON DELETE CASCADE
  );

  -- Alerts
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    so_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('DELAY','QTY_MISMATCH','DUPLICATE','PREFIX_MISMATCH')),
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('critical','warning','info')),
    sla_minutes INTEGER NOT NULL DEFAULT 120,
    escalated INTEGER NOT NULL DEFAULT 0,
    escalated_at TEXT,
    resolved_at TEXT,
    FOREIGN KEY (so_id) REFERENCES sales_orders(id) ON DELETE SET NULL
  );

  -- Webhooks
  CREATE TABLE IF NOT EXISTS integration_webhooks (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    target_url TEXT NOT NULL,
    secret TEXT,
    payload_template TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    timeout_ms INTEGER NOT NULL DEFAULT 5000,
    last_status INTEGER,
    last_error TEXT,
    last_sent_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- SO locks
  CREATE TABLE IF NOT EXISTS so_locks (
    so_id TEXT PRIMARY KEY,
    claimed_by TEXT NOT NULL,
    claimed_by_name TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (so_id) REFERENCES sales_orders(id) ON DELETE CASCADE
  );

  -- Amend requests
  CREATE TABLE IF NOT EXISTS delivery_amend_requests (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    so_number TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
    requested_by TEXT NOT NULL,
    requested_by_name TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_by_name TEXT,
    reviewed_at TEXT,
    review_note TEXT,
    FOREIGN KEY (batch_id) REFERENCES delivery_batches(id) ON DELETE CASCADE
  );

  -- Audit logs
  CREATE TABLE IF NOT EXISTS so_audit_logs (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    scope TEXT NOT NULL,
    count INTEGER,
    actor_user_id TEXT,
    actor_name TEXT
  );

  -- Role permissions
  CREATE TABLE IF NOT EXISTS role_permission_matrix (
    module TEXT PRIMARY KEY,
    sort_order INTEGER NOT NULL DEFAULT 0,
    admin INTEGER NOT NULL DEFAULT 0,
    ppic INTEGER NOT NULL DEFAULT 0,
    warehouse INTEGER NOT NULL DEFAULT 0,
    qc INTEGER NOT NULL DEFAULT 0,
    viewer INTEGER NOT NULL DEFAULT 0
  );

  -- Delivery types
  CREATE TABLE IF NOT EXISTS delivery_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export const INDEXES = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_scanned_units_qr_code_unique ON scanned_units(qr_code);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_scanned_units_serial_number_unique ON scanned_units(serial_number);
  CREATE INDEX IF NOT EXISTS idx_so_locks_expires_at ON so_locks(expires_at);
  CREATE INDEX IF NOT EXISTS idx_delivery_amend_requests_status ON delivery_amend_requests(status);
  CREATE INDEX IF NOT EXISTS idx_so_audit_logs_at ON so_audit_logs(at DESC);
  CREATE INDEX IF NOT EXISTS idx_integration_webhooks_event_type ON integration_webhooks(event_type);
  CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
  CREATE INDEX IF NOT EXISTS idx_sales_orders_delivery_date ON sales_orders(delivery_date);
  CREATE INDEX IF NOT EXISTS idx_alerts_is_read ON alerts(is_read);
`;

export function initializeSchema(db) {
  db.exec(SCHEMA);
  db.exec(INDEXES);
}

export default initializeSchema;