import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get all customers with delivery type and destinations count
router.get('/', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    // Include all customers (both active and inactive) for edit functionality
    const customers = db.prepare(`
      SELECT
        c.*,
        dt.name as delivery_type_name,
        dt.sort_order as delivery_type_sort,
        (SELECT COUNT(*) FROM customer_destinations WHERE customer_id = c.id) as destinations_count
      FROM customers c
      LEFT JOIN delivery_types dt ON c.delivery_type_id = dt.id
      ORDER BY c.is_active DESC, dt.sort_order, c.name
    `).all();
    res.json(customers);
  } catch (error) {
    logger.error('Get customers error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch customers' } });
  }
});

// Get customers grouped by delivery type
// Each customer appears in ALL groups, destinations filtered by type
router.get('/grouped', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    const deliveryTypes = db.prepare('SELECT * FROM delivery_types WHERE is_active = 1 ORDER BY sort_order').all();
    const customers = db.prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM customer_destinations WHERE customer_id = c.id) as destinations_count
      FROM customers c
      WHERE c.is_active = 1
      ORDER BY c.name
    `).all();
    const destinations = db.prepare('SELECT * FROM customer_destinations').all();

    // Filter destinations by delivery type (matching the type in delivery_types JSON array)
    const getDestinationsForType = (customerId, typeName) => {
      return destinations.filter(d => {
        if (d.customer_id !== customerId) return false;
        // Each destination has a delivery_types JSON array
        const types = JSON.parse(d.delivery_types || '[]');
        return types.includes(typeName);
      });
    };

    // Each customer appears in ALL groups
    const result = deliveryTypes.map(type => {
      return {
        id: type.id,
        name: type.name,
        sort_order: type.sort_order,
        customers: customers.map(customer => ({
          ...customer,
          destinations: getDestinationsForType(customer.id, type.name),
          // Recalculate destinations_count for this type
          destinations_count: getDestinationsForType(customer.id, type.name).length
        }))
      };
    });

    res.json(result);
  } catch (error) {
    logger.error('Get grouped customers error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch customers' } });
  }
});

// Get hierarchical customer tree: Customer -> Destination -> Type
router.get('/tree', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    // Get all active customers
    const customers = db.prepare(`
      SELECT c.*, dt.name as delivery_type_name
      FROM customers c
      LEFT JOIN delivery_types dt ON c.delivery_type_id = dt.id
      WHERE c.is_active = 1
      ORDER BY c.name
    `).all();

    // Get all destinations (each record is a destination + type combo)
    const destinations = db.prepare(`
      SELECT cd.*, c.name as customer_name
      FROM customer_destinations cd
      JOIN customers c ON cd.customer_id = c.id
      ORDER BY c.name, cd.name, cd.type_name
    `).all();

    // Build hierarchy: Customer -> Destinations grouped by name, with type items
    const tree = customers.map(customer => {
      // Get all destinations for this customer
      const customerDests = destinations.filter(d => d.customer_id === customer.id);

      // Group by destination name for display - each dest can have multiple types
      const destGroups = {};
      customerDests.forEach(dest => {
        if (!destGroups[dest.name]) {
          destGroups[dest.name] = {
            name: dest.name,
            destCode: dest.code,
            items: []
          };
        }
        // Add each type as a separate item with its own type_code
        destGroups[dest.name].items.push({
          id: dest.id,
          type_name: dest.type_name,
          type_code: dest.type_code,
          is_default: dest.is_default
        });
      });

      // Sort items by type name
      const groupedDests = Object.values(destGroups).map(g => ({
        ...g,
        items: g.items.sort((a, b) => a.type_name.localeCompare(b.type_name))
      }));

      return {
        ...customer,
        destinations: groupedDests
      };
    });

    // Separate "Others" customers (those without destinations) from main customers
    const mainCustomers = tree.filter(c => c.destinations.length > 0);
    const otherCustomers = tree.filter(c => c.destinations.length === 0);

    res.json({
      main: mainCustomers,
      others: otherCustomers
    });
  } catch (error) {
    logger.error('Get customer tree error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch customer tree' } });
  }
});

// Get customer by ID with destinations
router.get('/:id', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    const customer = db.prepare(`
      SELECT c.*, dt.name as delivery_type_name
      FROM customers c
      LEFT JOIN delivery_types dt ON c.delivery_type_id = dt.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: { message: 'Customer not found' } });
    }

    const destinations = db.prepare('SELECT * FROM customer_destinations WHERE customer_id = ? ORDER BY is_default DESC, name ASC').all(customer.id);
    res.json({ ...customer, destinations });
  } catch (error) {
    logger.error('Get customer error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch customer' } });
  }
});

// Create customer
router.post('/', authenticateToken, authorizeRoles('admin'), (req, res) => {
  try {
    const { name, code, delivery_type_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: { message: 'Name is required' } });
    }

    const id = uuidv4();
    db.prepare('INSERT INTO customers (id, code, name, delivery_type_id, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))').run(id, code || null, name, delivery_type_id || null);

    logger.info('Customer created', { id, name, code, createdBy: req.user.username });
    const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.status(201).json(newCustomer);
  } catch (error) {
    logger.error('Create customer error:', error);
    res.status(500).json({ error: { message: 'Failed to create customer' } });
  }
});

// Update customer
router.patch('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, delivery_type_id, is_active } = req.body;

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: { message: 'Customer not found' } });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (code !== undefined) { updates.push('code = ?'); values.push(code); }
    if (delivery_type_id !== undefined) { updates.push('delivery_type_id = ?'); values.push(delivery_type_id); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: { message: 'No fields to update' } });
    }

    updates.push('updated_at = datetime(\'now\')');
    values.push(id);
    db.prepare('UPDATE customers SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);

    logger.info('Customer updated', { id, updatedBy: req.user.username });
    const updated = db.prepare('SELECT c.*, dt.name as delivery_type_name FROM customers c LEFT JOIN delivery_types dt ON c.delivery_type_id = dt.id WHERE c.id = ?').get(id);
    res.json(updated);
  } catch (error) {
    logger.error('Update customer error:', error);
    res.status(500).json({ error: { message: 'Failed to update customer' } });
  }
});

// Delete customer (soft delete)
router.delete('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: { message: 'Customer not found' } });
    }

    db.prepare('UPDATE customers SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?').run(id);
    logger.info('Customer deleted', { id, name: customer.name, deletedBy: req.user.username });
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    logger.error('Delete customer error:', error);
    res.status(500).json({ error: { message: 'Failed to delete customer' } });
  }
});

export default router;