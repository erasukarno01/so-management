import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

function normalizeDeliveryDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = String(parsed.getFullYear()).padStart(4, '0');
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function buildBucketNoFromDate(deliveryDate) {
  const normalizedDate = normalizeDeliveryDate(deliveryDate);
  if (!normalizedDate) return '';
  const year = Number(normalizedDate.slice(0, 4));
  const month = Number(normalizedDate.slice(5, 7));
  const day = Number(normalizedDate.slice(8, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12) return '';
  const bucketIndex = (month - 1) * 2 + (day <= 15 ? 1 : 2);
  return String(year) + '-' + String(bucketIndex).padStart(2, '0');
}

// Generate item card barcode format: [)>06KODE{customerCode}P{partNo}V{destCode}L{typeCode}K{soNumber}Q{qty}
function generateItemCardBarcode({ customerCode, partNumber, destCode, typeCode, soNumber, qty }) {
  const customer = (customerCode || '').toUpperCase().substring(0, 5).padEnd(5, '0');
  // Part number: 14 characters (D52H5810030080, DH7H5810000080, etc.)
  const part = (partNumber || '').toUpperCase().replace(/-/g, '').substring(0, 14).padEnd(14, '0');
  const dest = (destCode || '').toUpperCase().substring(0, 4).padEnd(4, '0');
  const type = (typeCode || '').toUpperCase().substring(0, 4).padEnd(4, '0');
  // Remove # and @ from SO number
  const so = String(soNumber || '').toUpperCase().replace(/[#@]/g, '').substring(0, 5).padStart(5, '0');
  const quantity = String(qty || 0).padStart(6, '0');
  return `[)>06KODE${customer}P${part}V${dest}L${type}K${so}Q${quantity}`;
}

// Get customer code from customers table
function getCustomerCode(customerId) {
  if (!customerId) return 'XXXXX';
  const customer = db.prepare('SELECT code FROM customers WHERE id = ?').get(customerId);
  return customer?.code || 'XXXXX';
}

// Get destination info from customer_destinations table
function getDestinationInfo(destinationId) {
  if (!destinationId) return { code: 'XXXX', typeCode: 'XXXX' };
  const dest = db.prepare('SELECT code, type_code FROM customer_destinations WHERE id = ?').get(destinationId);
  return {
    code: dest?.code || 'XXXX',
    typeCode: dest?.type_code || 'XXXX'
  };
}

// Get part number from product_master
function getPartNumber(modelCode) {
  if (!modelCode) return 'XXXX-XXXX-XXXX-XXXX';
  const product = db.prepare('SELECT part_number FROM product_master WHERE model_code = ?').get(modelCode);
  return product?.part_number || 'XXXX-XXXX-XXXX-XXXX';
}

function normalizeBucketNo(value, deliveryDate) {
  const text = String(value || '').trim();
  if (!text) return buildBucketNoFromDate(deliveryDate);
  const match = text.match(/^(\d{4})[-\s_/]?(\d{1,2})$/);
  if (!match) return buildBucketNoFromDate(deliveryDate);
  const bucketIndex = Number(match[2]);
  if (!Number.isFinite(bucketIndex) || bucketIndex < 1 || bucketIndex > 24) return buildBucketNoFromDate(deliveryDate);
  return match[1] + '-' + String(bucketIndex).padStart(2, '0');
}

// ============ MAIN ROUTES ============

// GET all sales orders (with optional grouping)
router.get('/', authenticateToken, (req, res) => {
  try {
    const { status, customer_id, from_date, to_date, search, group_by_so } = req.query;
    let query = `
      SELECT so.*, pm.model_code as model
      FROM sales_orders so
      LEFT JOIN product_master pm ON so.primary_item_number = pm.part_number
      WHERE 1=1
    `;
    const params = [];
    if (status) { query += ' AND so.status = ?'; params.push(status); }
    if (customer_id) { query += ' AND so.customer_id = ?'; params.push(customer_id); }
    if (from_date) { query += ' AND so.delivery_date >= ?'; params.push(from_date); }
    if (to_date) { query += ' AND so.delivery_date <= ?'; params.push(to_date); }
    if (search) { query += ' AND (so.so_number LIKE ? OR so.customer_name LIKE ?)'; params.push('%'+search+'%', '%'+search+'%'); }
    query += ' ORDER BY so.delivery_date ASC';

    const orders = db.prepare(query).all(...params);

    // Get first item_number for each SO to use as primary_item_number
    const soItemMap = {};
    const soIds = orders.map(o => o.id);
    if (soIds.length > 0) {
      // Fetch items in batches to avoid too many placeholders
      const batchSize = 50;
      for (let i = 0; i < soIds.length; i += batchSize) {
        const batch = soIds.slice(i, i + batchSize);
        const placeholders = batch.map(() => '?').join(',');
        const items = db.prepare(`SELECT so_id, item_number, model_code FROM so_items WHERE so_id IN (${placeholders}) ORDER BY so_id, created_at ASC`).all(...batch);
        items.forEach(item => {
          if (!soItemMap[item.so_id]) {
            soItemMap[item.so_id] = {
              primary_item_number: item.item_number,
              model: item.model_code
            };
          }
        });
      }
    }

    // Merge item data into orders
    const enrichedOrders = orders.map(order => {
      if (soItemMap[order.id]) {
        return {
          ...order,
          primary_item_number: order.primary_item_number || soItemMap[order.id].primary_item_number,
          model: order.model || soItemMap[order.id].model
        };
      }
      return order;
    });

    // Calculate urgency score for priority sorting
    // Lower score = more urgent (should appear at top)
    const now = new Date();
    const ordersWithUrgency = enrichedOrders.map(order => {
      const deliveryDate = new Date(order.delivery_date);
      const hoursUntilDelivery = (deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      const statusPriority = { 'PENDING': 0, 'PARTIAL': 1, 'COMPLETED': 2 };
      const typePriority = { 'Regular': 0, 'CKD': 1, 'Non Regular': 2 };

      return {
        ...order,
        urgency_score: (
          hoursUntilDelivery * 0.4 +                    // Delivery urgency (closer = lower)
          (statusPriority[order.status] ?? 3) * 100 +   // Status urgency
          (typePriority[order.delivery_type] ?? 3) * 10 // Type urgency
        )
      };
    });

    // Group by so_number if requested
    if (group_by_so === 'true') {
      const grouped = {};
      ordersWithUrgency.forEach(o => {
        if (!grouped[o.so_number]) {
          grouped[o.so_number] = {
            so_number: o.so_number,
            customer_id: o.customer_id,
            customer_name: o.customer_name,
            delivery_date: o.delivery_date,
            bucket_no: o.bucket_no,
            delivery_destination: o.delivery_destination,
            primary_item_number: o.primary_item_number,
            model: o.model,
            urgency_score: o.urgency_score,
            records: [],
            total_plan: 0,
            total_actual: 0,
            statuses: [],
          };
        }
        grouped[o.so_number].records.push(o);
        grouped[o.so_number].total_plan += Number(o.total_qty_plan || 0);
        grouped[o.so_number].total_actual += Number(o.total_qty_actual || 0);
        if (!grouped[o.so_number].statuses.includes(o.status)) {
          grouped[o.so_number].statuses.push(o.status);
        }
      });
      res.json(Object.values(grouped));
    } else {
      res.json(ordersWithUrgency);
    }
  } catch (error) {
    logger.error('Get sales orders error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch sales orders' } });
  }
});

// ============ ITEMS ROUTES (must be before /:id to avoid conflict) ============

// GET items for a sales order
router.get('/:id/items', authenticateToken, (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const soOwner = db.prepare('SELECT id FROM sales_orders WHERE id = ?').get(id);
    if (!soOwner) return res.status(404).json({ error: { message: 'Sales order not found' } });

    const items = db.prepare('SELECT * FROM so_items WHERE so_id = ? ORDER BY item_number ASC').all(id);
    res.json(items);
  } catch (error) {
    logger.error('Get SO items error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch items' } });
  }
});

// POST add item to sales order
router.post('/:id/items', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    const soId = decodeURIComponent(req.params.id);
    const order = db.prepare('SELECT id FROM sales_orders WHERE id = ?').get(soId);
    if (!order) return res.status(404).json({ error: { message: 'Sales order not found' } });

    const { item_number, model_code, qty_plan, delivery_schedule } = req.body;
    if (!item_number) return res.status(400).json({ error: { message: 'Item number is required' } });

    const itemId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO so_items (id, so_id, item_number, model_code, qty_plan, qty_actual, delivery_schedule, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(itemId, soId, item_number, model_code || '', qty_plan || 0, JSON.stringify(delivery_schedule || {}), now, now);

    const totalPlan = db.prepare('SELECT SUM(qty_plan) as total FROM so_items WHERE so_id = ?').get(soId);
    db.prepare('UPDATE sales_orders SET total_qty_plan = ?, updated_at = ? WHERE id = ?').run(totalPlan.total || 0, now, soId);

    logger.info('SO item added', { soId, itemId, item_number, createdBy: req.user.username });
    const newItem = db.prepare('SELECT * FROM so_items WHERE id = ?').get(itemId);
    res.status(201).json(newItem);
  } catch (error) {
    logger.error('Add SO item error:', error);
    res.status(500).json({ error: { message: 'Failed to add item' } });
  }
});

// GET sales order by ID (must be AFTER /:id/items)
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const order = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ error: { message: 'Sales order not found' } });
    const items = db.prepare('SELECT * FROM so_items WHERE so_id = ? ORDER BY item_number ASC').all(id);
    const alerts = db.prepare('SELECT * FROM alerts WHERE so_id = ? ORDER BY created_at DESC').all(id);

    // Get model from first item if available
    const firstItem = items[0];
    const model = firstItem?.model_code ||
      db.prepare('SELECT model_code FROM product_master WHERE part_number = ?').get(order.primary_item_number)?.model_code;

    res.json({ ...order, items, alerts, model });
  } catch (error) {
    logger.error('Get sales order error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch sales order' } });
  }
});

// POST create sales order
router.post('/', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    const { so_number, customer_id, customer_name, delivery_date, delivery_destination, delivery_type, remark, items, bucket_no, destination_id, destination_name, primary_item_number } = req.body;
    logger.info('Create SO received', { so_number, customer_id, customer_name, delivery_date, delivery_type, destination_id });

    // Validation
    if (!so_number) return res.status(400).json({ error: { message: 'SO Number is required' } });
    if (!customer_id) return res.status(400).json({ error: { message: 'Customer is required' } });
    if (!customer_name) return res.status(400).json({ error: { message: 'Customer name is required' } });
    if (!delivery_date) return res.status(400).json({ error: { message: 'Delivery date is required' } });
    if (!bucket_no) return res.status(400).json({ error: { message: 'Bucket No is required' } });

    const normalizedSoNumber = so_number ? so_number.trim() : '';
    const normalizedDate = normalizeDeliveryDate(delivery_date);
    if (!normalizedDate) {
      return res.status(400).json({ error: { message: 'Invalid delivery date' } });
    }

    const validTypes = ['Regular', 'CKD', 'Non Regular'];
    let normalizedType = delivery_type || '';
    let finalRemark = remark || '';

    if (!validTypes.includes(normalizedType)) {
      if (normalizedType) {
        finalRemark = finalRemark ? `${finalRemark}; ${normalizedType}` : normalizedType;
      }
      normalizedType = 'Non Regular';
    }

    // Use bucket_no from request body (manual input), no auto-generate
    const bucketNo = req.body.bucket_no || '';
    const totalQtyPlan = (items || []).reduce((sum, item) => sum + (item.qty_plan || 0), 0);
    // Generate proper SO ID format: CUSTOMER-DEST-BUCKET-YYYY-MM-#NUMBER
    const customerPrefix = customer_name?.substring(0, 3).toUpperCase() || 'SO';
    const destPrefix = destination_name ? destination_name.substring(0, 3).toUpperCase() : 'DST';
    const bucketPrefix = bucketNo ? bucketNo.replace(/[^A-Z0-9]/gi, '').substring(0, 3).toUpperCase() : 'BKT';
    const year = normalizedDate.substring(0, 4);
    const soId = `${customerPrefix}-${destPrefix}-${bucketPrefix}-${year}-${normalizedSoNumber}`;
    const now = new Date().toISOString();

    // Get primary_item_number from first item if not provided
    const primaryItem = primary_item_number || (items && items.length > 0 ? items[0].item_number : '');

    // Insert SO record with all fields
    db.prepare(`
      INSERT INTO sales_orders (id, so_number, customer_id, customer_name, delivery_date, bucket_no, delivery_destination, delivery_type, remark, total_qty_plan, total_qty_actual, status, created_at, updated_at, destination_id, destination_name, primary_item_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?, ?, ?, ?, ?)
    `).run(soId, normalizedSoNumber, customer_id, customer_name, normalizedDate, bucketNo, delivery_destination || destination_name || '', normalizedType, finalRemark, totalQtyPlan, now, now, destination_id || null, destination_name || delivery_destination || null, primaryItem);

    // Insert items using transaction
    const insertedItems = [];
    if (items && items.length > 0) {
      logger.info('Inserting items', { soId, itemCount: items.length });
      const insertItem = db.prepare(`
        INSERT INTO so_items (id, so_id, item_number, model_code, qty_plan, qty_actual, delivery_schedule, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
      `);

      const insertItemsBatch = db.transaction((itemsArray) => {
        for (const item of itemsArray) {
          if (!item.item_number) continue; // Skip items without item_number
          const itemId = uuidv4();
          insertItem.run(
            itemId,
            soId,
            item.item_number || '',
            item.model_code || '',
            item.qty_plan || 0,
            JSON.stringify(item.delivery_schedule || {}),
            now,
            now
          );
          insertedItems.push({ id: itemId, so_id: soId, ...item });
        }
      });

      insertItemsBatch(items);
    }

    // Generate item card barcode
    const customerCode = getCustomerCode(customer_id);
    const { code: destCode, typeCode } = getDestinationInfo(destination_id);
    const partNumber = primaryItem || (items?.[0]?.item_number) || '';
    const itemCardBarcode = generateItemCardBarcode({
      customerCode,
      partNumber,
      destCode,
      typeCode,
      soNumber: normalizedSoNumber.replace(/^#/, ''),
      qty: totalQtyPlan
    });

    logger.info('Sales order created', { soId, soNumber: normalizedSoNumber, itemCount: insertedItems.length, createdBy: req.user.username });
    res.status(201).json({
      id: soId,
      so_number: normalizedSoNumber,
      status: 'PENDING',
      items: insertedItems,
      total_qty_plan: totalQtyPlan,
      item_card_barcode: itemCardBarcode,
    });
  } catch (error) {
    logger.error('Create sales order error:', error);
    res.status(500).json({ error: { message: 'Failed to create sales order', details: error.message } });
  }
});

// PATCH update sales order
router.patch('/:id', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    const soId = decodeURIComponent(req.params.id);
    const { so_number, customer_id, customer_name, delivery_date, delivery_destination, delivery_type, bucket_no, remark, status, items, destination_id, destination_name, primary_item_number } = req.body;

    const order = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(soId);
    if (!order) return res.status(404).json({ error: { message: 'Sales order not found' } });

    if (so_number && so_number !== order.so_number) {
      // Check for duplicate only if actually changing
      const existing = db.prepare('SELECT id FROM sales_orders WHERE so_number = ? AND id != ? AND delivery_type = ?').get(so_number, soId, order.delivery_type);
      if (existing) return res.status(409).json({ error: { message: 'SO number already exists for this delivery type' } });
    }

    const updates = [];
    const params = [];

    if (so_number !== undefined && so_number !== order.so_number) { updates.push('so_number = ?'); params.push(so_number); }
    if (customer_id !== undefined && customer_id !== order.customer_id) { updates.push('customer_id = ?'); params.push(customer_id); }
    if (customer_name !== undefined && customer_name !== order.customer_name) { updates.push('customer_name = ?'); params.push(customer_name); }
    if (delivery_date !== undefined) {
      const normalizedDate = normalizeDeliveryDate(delivery_date);
      if (normalizedDate && normalizedDate !== order.delivery_date?.slice(0, 10)) {
        updates.push('delivery_date = ?'); params.push(normalizedDate);
        updates.push('bucket_no = ?'); params.push(normalizeBucketNo('', normalizedDate));
      }
    }
    if (delivery_destination !== undefined) { updates.push('delivery_destination = ?'); params.push(delivery_destination); }
    if (delivery_type !== undefined) { updates.push('delivery_type = ?'); params.push(delivery_type); }
    if (bucket_no !== undefined) { updates.push('bucket_no = ?'); params.push(bucket_no); }
    if (remark !== undefined) { updates.push('remark = ?'); params.push(remark); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (destination_id !== undefined) { updates.push('destination_id = ?'); params.push(destination_id); }
    if (destination_name !== undefined) { updates.push('destination_name = ?'); params.push(destination_name); }
    if (primary_item_number !== undefined) { updates.push('primary_item_number = ?'); params.push(primary_item_number); }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(soId);
      db.prepare(`UPDATE sales_orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    // Handle items update if provided
    let updatedItems = null;
    if (items !== undefined && Array.isArray(items)) {
      updatedItems = updateSoItems(soId, items);
    }

    logger.info('Sales order updated', { soId, soNumber: order.so_number, updatedBy: req.user.username });
    const updated = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(soId);
    const itemsResult = db.prepare('SELECT * FROM so_items WHERE so_id = ?').all(soId);

    res.json({
      message: 'Sales order updated successfully',
      data: updated,
      items: updatedItems || itemsResult,
    });
  } catch (error) {
    logger.error('Update sales order error:', error);
    res.status(500).json({ error: { message: 'Failed to update sales order' } });
  }
});

// PUT update sales order (legacy)
router.put('/:id', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  // Delegate to PATCH handler - reuse the same logic
  const soId = decodeURIComponent(req.params.id);
  const order = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(soId);
  if (!order) return res.status(404).json({ error: { message: 'Sales order not found' } });

  const { so_number, customer_id, delivery_date, delivery_destination, delivery_type, bucket_no, remark, status, items } = req.body;

  const updates = [];
  const params = [];

  if (so_number !== undefined) { updates.push('so_number = ?'); params.push(so_number); }
  if (customer_id !== undefined) { updates.push('customer_id = ?'); params.push(customer_id); }
  if (delivery_date !== undefined) {
    const normalizedDate = normalizeDeliveryDate(delivery_date);
    if (normalizedDate) {
      updates.push('delivery_date = ?'); params.push(normalizedDate);
      updates.push('bucket_no = ?'); params.push(normalizeBucketNo('', normalizedDate));
    }
  }
  if (delivery_destination !== undefined) { updates.push('delivery_destination = ?'); params.push(delivery_destination); }
  if (delivery_type !== undefined) { updates.push('delivery_type = ?'); params.push(delivery_type); }
  if (bucket_no !== undefined) { updates.push('bucket_no = ?'); params.push(bucket_no); }
  if (remark !== undefined) { updates.push('remark = ?'); params.push(remark); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(soId);
    db.prepare(`UPDATE sales_orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  if (items !== undefined && Array.isArray(items)) {
    updateSoItems(soId, items);
  }

  const updated = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(soId);
  const itemsResult = db.prepare('SELECT * FROM so_items WHERE so_id = ?').all(soId);

  res.json({ data: updated, items: itemsResult });
});

// DELETE sales order
router.delete('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  try {
    const soId = decodeURIComponent(req.params.id);
    const order = db.prepare('SELECT so_number FROM sales_orders WHERE id = ?').get(soId);
    if (!order) return res.status(404).json({ error: { message: 'Sales order not found' } });

    db.prepare('DELETE FROM sales_orders WHERE id = ?').run(soId);
    logger.info('Sales order deleted', { soId, soNumber: order.so_number, deletedBy: req.user.username });
    res.json({ message: 'Sales order deleted successfully' });
  } catch (error) {
    logger.error('Delete sales order error:', error);
    res.status(500).json({ error: { message: 'Failed to delete sales order' } });
  }
});

// ============ ITEM CRUD ROUTES ============

// PATCH update item
router.patch('/:soId/items/:itemId', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    const soId = decodeURIComponent(req.params.soId);
    const itemId = decodeURIComponent(req.params.itemId);
    const { item_number, model_code, qty_plan, qty_actual, delivery_schedule } = req.body;

    const item = db.prepare('SELECT * FROM so_items WHERE id = ? AND so_id = ?').get(itemId, soId);
    if (!item) return res.status(404).json({ error: { message: 'Item not found' } });

    const updates = [];
    const params = [];

    if (item_number !== undefined) { updates.push('item_number = ?'); params.push(item_number); }
    if (model_code !== undefined) { updates.push('model_code = ?'); params.push(model_code); }
    if (qty_plan !== undefined) { updates.push('qty_plan = ?'); params.push(qty_plan); }
    if (qty_actual !== undefined) { updates.push('qty_actual = ?'); params.push(qty_actual); }
    if (delivery_schedule !== undefined) { updates.push('delivery_schedule = ?'); params.push(JSON.stringify(delivery_schedule)); }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(itemId);
      db.prepare(`UPDATE so_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      const totalPlan = db.prepare('SELECT SUM(qty_plan) as total FROM so_items WHERE so_id = ?').get(soId);
      db.prepare('UPDATE sales_orders SET total_qty_plan = ?, updated_at = ? WHERE id = ?').run(totalPlan.total || 0, new Date().toISOString(), soId);
    }

    logger.info('SO item updated', { soId, itemId, updatedBy: req.user.username });
    const updated = db.prepare('SELECT * FROM so_items WHERE id = ?').get(itemId);
    res.json(updated);
  } catch (error) {
    logger.error('Update SO item error:', error);
    res.status(500).json({ error: { message: 'Failed to update item' } });
  }
});

// PUT update item
router.put('/:soId/items/:itemId', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  const soId = decodeURIComponent(req.params.soId);
  const itemId = decodeURIComponent(req.params.itemId);
  const { item_number, model_code, qty_plan, qty_actual, delivery_schedule } = req.body;

  const item = db.prepare('SELECT * FROM so_items WHERE id = ? AND so_id = ?').get(itemId, soId);
  if (!item) return res.status(404).json({ error: { message: 'Item not found' } });

  const updates = [];
  const params = [];

  if (item_number !== undefined) { updates.push('item_number = ?'); params.push(item_number); }
  if (model_code !== undefined) { updates.push('model_code = ?'); params.push(model_code); }
  if (qty_plan !== undefined) { updates.push('qty_plan = ?'); params.push(qty_plan); }
  if (qty_actual !== undefined) { updates.push('qty_actual = ?'); params.push(qty_actual); }
  if (delivery_schedule !== undefined) { updates.push('delivery_schedule = ?'); params.push(JSON.stringify(delivery_schedule)); }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(itemId);
    db.prepare(`UPDATE so_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const totalPlan = db.prepare('SELECT SUM(qty_plan) as total FROM so_items WHERE so_id = ?').get(soId);
    db.prepare('UPDATE sales_orders SET total_qty_plan = ?, updated_at = ? WHERE id = ?').run(totalPlan.total || 0, new Date().toISOString(), soId);
  }

  const updated = db.prepare('SELECT * FROM so_items WHERE id = ?').get(itemId);
  res.json(updated);
});

// DELETE item
router.delete('/:soId/items/:itemId', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    const soId = decodeURIComponent(req.params.soId);
    const itemId = decodeURIComponent(req.params.itemId);

    const item = db.prepare('SELECT * FROM so_items WHERE id = ? AND so_id = ?').get(itemId, soId);
    if (!item) return res.status(404).json({ error: { message: 'Item not found' } });

    db.prepare('DELETE FROM so_items WHERE id = ?').run(itemId);

    const totalPlan = db.prepare('SELECT SUM(qty_plan) as total FROM so_items WHERE so_id = ?').get(soId);
    db.prepare('UPDATE sales_orders SET total_qty_plan = ?, updated_at = ? WHERE id = ?').run(totalPlan.total || 0, new Date().toISOString(), soId);

    logger.info('SO item deleted', { soId, itemId, deletedBy: req.user.username });
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    logger.error('Delete SO item error:', error);
    res.status(500).json({ error: { message: 'Failed to delete item' } });
  }
});

// ============ HELPERS ============

function updateSoItems(soId, items) {
  // Delete existing items
  db.prepare('DELETE FROM so_items WHERE so_id = ?').run(soId);

  // Insert new items
  const now = new Date().toISOString();
  const insertItem = db.prepare(`
    INSERT INTO so_items (id, so_id, item_number, model_code, qty_plan, qty_actual, delivery_schedule, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `);

  const insertedItems = [];
  for (const item of items) {
    if (!item.item_number) continue;
    const itemId = uuidv4();
    insertItem.run(
      itemId,
      soId,
      item.item_number,
      item.model_code || '',
      item.qty_plan || 0,
      JSON.stringify(item.delivery_schedule || {}),
      now,
      now
    );
    insertedItems.push({ id: itemId, so_id: soId, ...item });
  }

  // Update total_qty_plan on SO
  const totalPlan = db.prepare('SELECT SUM(qty_plan) as total FROM so_items WHERE so_id = ?').get(soId);
  db.prepare('UPDATE sales_orders SET total_qty_plan = ?, updated_at = ? WHERE id = ?').run(totalPlan.total || 0, now, soId);

  return insertedItems;
}

export default router;
