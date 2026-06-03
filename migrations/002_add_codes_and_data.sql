-- Migration: 002_add_codes_and_data.sql
-- Description: Add code columns to customers, delivery_types, and seed initial data
-- Created: 2026-06-03

-- =====================================================
-- ADD CODE COLUMNS
-- =====================================================
ALTER TABLE customers ADD COLUMN code TEXT;
ALTER TABLE delivery_types ADD COLUMN code TEXT;

-- =====================================================
-- SEED DELIVERY TYPES
-- =====================================================
INSERT INTO delivery_types (id, name, sort_order, is_active, code, created_at) VALUES
    ('dt-1', 'Non Regular', 1, 1, 'DT-01', datetime('now')),
    ('dt-2', 'Regular', 2, 1, 'DT-02', datetime('now')),
    ('dt-3', 'CKD', 3, 1, 'DT-03', datetime('now'));

-- =====================================================
-- SEED CUSTOMERS
-- =====================================================
INSERT INTO customers (id, name, code, is_active, created_at, updated_at, delivery_type_id) VALUES
    ('CUST-001', 'IYM', 'CUST-001', 1, datetime('now'), datetime('now'), 'dt-2'),
    ('CUST-002', 'CHAO LONG TAIWAN', 'CUST-002', 1, datetime('now'), datetime('now'), 'dt-1');

-- =====================================================
-- SEED DESTINATIONS (with type codes)
-- Format: delivery_types is JSON array of {name, code}
-- =====================================================
INSERT INTO customer_destinations (id, customer_id, code, name, is_default, delivery_types, created_at, updated_at) VALUES
    ('dest-chennai', 'CUST-001', '2S85', 'Chennai', 1,
     '[{"name":"Regular","code":"2S85"},{"name":"CKD","code":"9962"}]',
     datetime('now'), datetime('now')),
    ('dest-surajpur', 'CUST-001', '2385', 'Surajpur', 0,
     '[{"name":"Regular","code":"9101"},{"name":"CKD","code":"9201"}]',
     datetime('now'), datetime('now'));