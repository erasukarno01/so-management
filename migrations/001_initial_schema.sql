-- Migration: 001_initial_schema.sql
-- Description: Base schema for SO Management system
-- Created: 2026-06-03

-- =====================================================
-- CUSTOMERS Table
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    delivery_type_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    code TEXT
);

-- =====================================================
-- DELIVERY_TYPES Table
-- =====================================================
CREATE TABLE IF NOT EXISTS delivery_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT,
    code TEXT
);

-- =====================================================
-- CUSTOMER_DESTINATIONS Table
-- =====================================================
CREATE TABLE IF NOT EXISTS customer_destinations (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    delivery_types TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    dest_code TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- =====================================================
-- PRODUCTS Table
-- =====================================================
CREATE TABLE IF NOT EXISTS product_master (
    id TEXT PRIMARY KEY,
    part_number TEXT NOT NULL,
    model_code TEXT NOT NULL,
    prefix TEXT NOT NULL,
    box_capacity INTEGER NOT NULL DEFAULT 1,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================
-- USERS Table
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT,
    role TEXT,
    password TEXT,
    created_at TEXT,
    updated_at TEXT,
    last_login TEXT,
    password_plain TEXT
);

-- =====================================================
-- SALES_ORDERS Table
-- =====================================================
CREATE TABLE IF NOT EXISTS sales_orders (
    id TEXT PRIMARY KEY,
    so_number TEXT NOT NULL UNIQUE,
    customer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    destination_id TEXT,
    destination_name TEXT,
    delivery_date TEXT NOT NULL,
    bucket_no TEXT,
    delivery_destination TEXT,
    delivery_type TEXT NOT NULL,
    remark TEXT,
    primary_item_number TEXT,
    total_qty_plan INTEGER NOT NULL DEFAULT 0,
    total_qty_actual INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- =====================================================
-- SO_ITEMS Table
-- =====================================================
CREATE TABLE IF NOT EXISTS so_items (
    id TEXT PRIMARY KEY,
    so_id TEXT NOT NULL,
    item_number TEXT NOT NULL,
    model_code TEXT NOT NULL,
    qty_plan INTEGER NOT NULL DEFAULT 0,
    qty_actual INTEGER NOT NULL DEFAULT 0,
    delivery_schedule TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (so_id) REFERENCES sales_orders(id)
);

-- =====================================================
-- Supporting Tables
-- =====================================================
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    so_id TEXT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    severity TEXT NOT NULL DEFAULT 'warning',
    sla_minutes INTEGER NOT NULL DEFAULT 60,
    escalated INTEGER NOT NULL DEFAULT 0,
    escalated_at TEXT,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS delivery_batches (
    id TEXT PRIMARY KEY,
    so_item_id TEXT NOT NULL,
    item_card_barcode TEXT NOT NULL,
    qty_total INTEGER NOT NULL,
    qty_scanned INTEGER NOT NULL DEFAULT 0,
    boxes_required INTEGER NOT NULL,
    boxes_completed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_boxes (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    box_number INTEGER NOT NULL,
    box_label TEXT NOT NULL,
    qty_capacity INTEGER NOT NULL,
    qty_actual INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    sealed_at TEXT,
    sealed_by TEXT,
    FOREIGN KEY (batch_id) REFERENCES delivery_batches(id)
);

CREATE TABLE IF NOT EXISTS scanned_units (
    id TEXT PRIMARY KEY,
    box_id TEXT NOT NULL,
    qr_code TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    model_code TEXT NOT NULL,
    prefix_valid INTEGER NOT NULL DEFAULT 1,
    scanned_at TEXT NOT NULL,
    scanned_by TEXT NOT NULL,
    FOREIGN KEY (box_id) REFERENCES delivery_boxes(id)
);

CREATE TABLE IF NOT EXISTS delivery_amend_requests (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    so_number TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_by TEXT NOT NULL,
    requested_by_name TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_by_name TEXT,
    reviewed_at TEXT,
    review_note TEXT
);

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

CREATE TABLE IF NOT EXISTS so_locks (
    so_id TEXT PRIMARY KEY,
    claimed_by TEXT NOT NULL,
    claimed_by_name TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permission_matrix (
    module TEXT PRIMARY KEY,
    sort_order INTEGER NOT NULL,
    admin INTEGER NOT NULL DEFAULT 0,
    ppic INTEGER NOT NULL DEFAULT 0,
    warehouse INTEGER NOT NULL DEFAULT 0,
    qc INTEGER NOT NULL DEFAULT 0,
    viewer INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS integration_webhooks (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    target_url TEXT NOT NULL,
    secret TEXT,
    payload_template TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    timeout_ms INTEGER NOT NULL DEFAULT 5000,
    last_status INTEGER,
    last_error TEXT,
    last_sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);