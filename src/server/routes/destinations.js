import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get destinations for a customer
router.get('/customer/:customerId', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    const destinations = db.prepare(
      'SELECT * FROM customer_destinations WHERE customer_id = ? ORDER BY is_default DESC, name ASC, type_name ASC'
    ).all(req.params.customerId);
    res.json(destinations);
  } catch (error) {
    logger.error('Get destinations error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch destinations' } });
  }
});

// Get all destinations
router.get('/', authenticateToken, authorizeRoles('admin'), (req, res) => {
  try {
    const destinations = db.prepare(`
      SELECT cd.*, c.name as customer_name
      FROM customer_destinations cd
      LEFT JOIN customers c ON cd.customer_id = c.id
      ORDER BY c.name, cd.name, cd.type_name
    `).all();
    res.json(destinations);
  } catch (error) {
    logger.error('Get all destinations error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch destinations' } });
  }
});

// Get destination by ID
router.get('/:id', authenticateToken, authorizeRoles('admin', 'ppic'), (req, res) => {
  try {
    const destination = db.prepare(`
      SELECT cd.*, c.name as customer_name
      FROM customer_destinations cd
      LEFT JOIN customers c ON cd.customer_id = c.id
      WHERE cd.id = ?
    `).get(req.params.id);

    if (!destination) {
      return res.status(404).json({ error: { message: 'Destination not found' } });
    }
    res.json(destination);
  } catch (error) {
    logger.error('Get destination error:', error);
    res.status(500).json({ error: { message: 'Failed to fetch destination' } });
  }
});

// Create destination (with specific type)
router.post('/', authenticateToken, authorizeRoles('admin'), (req, res) => {
  try {
    const { customer_id, name, type_name, code, type_code, is_default } = req.body;

    if (!customer_id || !name || !type_name) {
      return res.status(400).json({ error: { message: 'Customer ID, name, and type name are required' } });
    }

    const validTypes = ['Regular', 'CKD', 'Non Regular'];
    if (!validTypes.includes(type_name)) {
      return res.status(400).json({ error: { message: 'Invalid type name' } });
    }

    const customer = db.prepare('SELECT id FROM customers WHERE id = ? AND is_active = 1').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: { message: 'Customer not found' } });
    }

    if (is_default) {
      // Reset other defaults for this customer+name+type combo
      db.prepare('UPDATE customer_destinations SET is_default = 0 WHERE customer_id = ? AND name = ? AND type_name = ?')
        .run(customer_id, name, type_name);
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO customer_destinations (id, customer_id, name, type_name, code, type_code, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, customer_id, name, type_name, code || '', type_code || '', is_default ? 1 : 0, now, now);

    logger.info('Destination created', { id, customer_id, name, type_name, code, type_code, createdBy: req.user.username });
    const newDest = db.prepare('SELECT * FROM customer_destinations WHERE id = ?').get(id);
    res.status(201).json(newDest);
  } catch (error) {
    logger.error('Create destination error:', error);
    res.status(500).json({ error: { message: 'Failed to create destination' } });
  }
});

// Update destination
router.patch('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const { name, type_name, code, type_code, is_default } = req.body;

    const dest = db.prepare('SELECT * FROM customer_destinations WHERE id = ?').get(id);
    if (!dest) {
      return res.status(404).json({ error: { message: 'Destination not found' } });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (type_name !== undefined) { updates.push('type_name = ?'); values.push(type_name); }
    if (code !== undefined) { updates.push('code = ?'); values.push(code); }
    if (type_code !== undefined) { updates.push('type_code = ?'); values.push(type_code); }
    if (is_default !== undefined) {
      if (is_default) {
        // Reset other defaults for this customer+name+type combo
        db.prepare('UPDATE customer_destinations SET is_default = 0 WHERE customer_id = ? AND name = ? AND type_name = ?')
          .run(dest.customer_id, dest.name, dest.type_name);
      }
      updates.push('is_default = ?');
      values.push(is_default ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: { message: 'No fields to update' } });
    }

    const now = new Date().toISOString();
    updates.push('updated_at = ?');
    values.push(now);
    values.push(id); // Add id for WHERE clause
    db.prepare('UPDATE customer_destinations SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);

    logger.info('Destination updated', { id, updatedBy: req.user.username });
    const updated = db.prepare('SELECT * FROM customer_destinations WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    logger.error('Update destination error:', error, { message: error.message, stack: error.stack });
    res.status(500).json({ error: { message: 'Failed to update destination', details: error.message } });
  }
});

// Delete destination
router.delete('/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const dest = db.prepare('SELECT * FROM customer_destinations WHERE id = ?').get(id);
    if (!dest) {
      return res.status(404).json({ error: { message: 'Destination not found' } });
    }

    db.prepare('DELETE FROM customer_destinations WHERE id = ?').run(id);
    logger.info('Destination deleted', { id, name: dest.name, type: dest.type_name, deletedBy: req.user.username });
    res.json({ message: 'Destination deleted successfully' });
  } catch (error) {
    logger.error('Delete destination error:', error);
    res.status(500).json({ error: { message: 'Failed to delete destination' } });
  }
});

// Set as default destination
router.post('/:id/set-default', authenticateToken, authorizeRoles('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const dest = db.prepare('SELECT * FROM customer_destinations WHERE id = ?').get(id);
    if (!dest) {
      return res.status(404).json({ error: { message: 'Destination not found' } });
    }

    // Reset other defaults for this customer+name+type combo
    db.prepare('UPDATE customer_destinations SET is_default = 0 WHERE customer_id = ? AND name = ? AND type_name = ?')
      .run(dest.customer_id, dest.name, dest.type_name);
    db.prepare('UPDATE customer_destinations SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);

    logger.info('Destination set as default', { id, customer_id: dest.customer_id });
    res.json({ message: 'Destination set as default successfully' });
  } catch (error) {
    logger.error('Set default error:', error);
    res.status(500).json({ error: { message: 'Failed to set default' } });
  }
});

export default router;