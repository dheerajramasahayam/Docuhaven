const express = require('express');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { logAction, ACTIONS } = require('../services/auditService');
const { getCustomerFolder, deleteCustomerFolder, sanitizeForFilename } = require('../services/fileService');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all customers
router.get('/', requirePermission('VIEW_CUSTOMERS'), (req, res) => {
    try {
        const { search, limit = 50, offset = 0 } = req.query;

        let sql = `
      SELECT c.*, u.username as created_by_name,
        (SELECT COUNT(*) FROM documents WHERE customer_id = c.id) as document_count
      FROM customers c
      LEFT JOIN users u ON c.created_by = u.id
    `;
        const params = [];

        if (search) {
            sql += ` WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.policy_number LIKE ?`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        sql += ` ORDER BY c.name ASC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const customers = db.prepare(sql).all(...params);

        // Get total count
        let countSql = 'SELECT COUNT(*) as count FROM customers';
        const countParams = [];
        if (search) {
            countSql += ` WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? OR policy_number LIKE ?`;
            const searchPattern = `%${search}%`;
            countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }
        const { count } = db.prepare(countSql).get(...countParams);

        res.json({ customers, total: count });
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({ error: 'Failed to get customers' });
    }
});

// Get single customer with documents
router.get('/:id', requirePermission('VIEW_CUSTOMERS'), (req, res) => {
    try {
        const customer = db.prepare(`
      SELECT c.*, u.username as created_by_name
      FROM customers c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = ?
    `).get(req.params.id);

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Get customer documents
        const documents = db.prepare(`
      SELECT d.*, dt.name as document_type_name, u.username as uploaded_by_name
      FROM documents d
      LEFT JOIN document_types dt ON d.document_type_id = dt.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.customer_id = ?
      ORDER BY d.created_at DESC
    `).all(req.params.id);

        res.json({ ...customer, documents });
    } catch (error) {
        console.error('Get customer error:', error);
        res.status(500).json({ error: 'Failed to get customer' });
    }
});

// Create customer
router.post('/', requirePermission('MANAGE_CUSTOMERS'), (req, res) => {
    try {
        const { name, phone, email, address, policy_number, custom_fields } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Customer name is required' });
        }

        const folderName = `${Date.now()}_${sanitizeForFilename(name)}`;

        const stmt = db.prepare(`
      INSERT INTO customers (name, phone, email, address, policy_number, custom_fields, folder_name, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const result = stmt.run(
            name.trim(),
            phone || null,
            email || null,
            address || null,
            policy_number || null,
            JSON.stringify(custom_fields || {}),
            folderName,
            req.user.id
        );

        // Create customer folder
        getCustomerFolder(result.lastInsertRowid, name);

        const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.CUSTOMER_CREATE,
            entityType: 'customer',
            entityId: result.lastInsertRowid,
            entityName: name,
            newValues: { name, phone, email, address, policy_number },
            ipAddress: req.ip
        });

        res.status(201).json(newCustomer);

    } catch (error) {
        console.error('Create customer error:', error);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

// Update customer
router.put('/:id', requirePermission('MANAGE_CUSTOMERS'), (req, res) => {
    try {
        const { name, phone, email, address, policy_number, custom_fields } = req.body;
        const customerId = req.params.id;

        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Customer name is required' });
        }

        const oldValues = {
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            policy_number: customer.policy_number
        };

        db.prepare(`
      UPDATE customers 
      SET name = ?, phone = ?, email = ?, address = ?, policy_number = ?, custom_fields = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
            name.trim(),
            phone || null,
            email || null,
            address || null,
            policy_number || null,
            JSON.stringify(custom_fields || {}),
            customerId
        );

        const updatedCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.CUSTOMER_UPDATE,
            entityType: 'customer',
            entityId: parseInt(customerId),
            entityName: name,
            oldValues,
            newValues: { name, phone, email, address, policy_number },
            ipAddress: req.ip
        });

        res.json(updatedCustomer);

    } catch (error) {
        console.error('Update customer error:', error);
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

// Delete customer
router.delete('/:id', requirePermission('MANAGE_CUSTOMERS'), (req, res) => {
    try {
        const customerId = req.params.id;

        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Delete customer folder and all documents
        deleteCustomerFolder(customerId, customer.name);

        // Delete from database (cascade will delete documents)
        db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.CUSTOMER_DELETE,
            entityType: 'customer',
            entityId: parseInt(customerId),
            entityName: customer.name,
            oldValues: { name: customer.name, phone: customer.phone, email: customer.email },
            ipAddress: req.ip
        });

        res.json({ message: 'Customer deleted successfully' });

    } catch (error) {
        console.error('Delete customer error:', error);
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});

module.exports = router;
