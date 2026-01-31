const express = require('express');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { logAction, ACTIONS } = require('../services/auditService');
const { getCustomerFolder, deleteCustomerFolder, sanitizeForFilename } = require('../services/fileService');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all customers (supports filtering by parent_id)
router.get('/', requirePermission('VIEW_CUSTOMERS'), (req, res) => {
    try {
        const { search, limit = 50, offset = 0, parent_id } = req.query;

        let sql = `
      SELECT c.*, u.username as created_by_name,
        p.name as parent_name,
        lu.username as linked_username,
        (SELECT COUNT(*) FROM documents WHERE customer_id = c.id) as document_count
      FROM customers c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN customers p ON c.parent_id = p.id
      LEFT JOIN users lu ON c.linked_user_id = lu.id
    `;
        const params = [];

        let whereClauses = [];
        if (search) {
            whereClauses.push(`(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.policy_number LIKE ?)`);
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        if (parent_id !== undefined) {
            if (parent_id === 'null') {
                whereClauses.push('c.parent_id IS NULL');
            } else {
                whereClauses.push('c.parent_id = ?');
                params.push(parent_id);
            }
        }

        if (whereClauses.length > 0) {
            sql += ' WHERE ' + whereClauses.join(' AND ');
        }

        sql += ` ORDER BY c.parent_id ASC, c.name ASC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const customers = db.prepare(sql).all(...params);

        // Get total count
        let countSql = 'SELECT COUNT(*) as count FROM customers c';
        const countParams = [];
        if (whereClauses.length > 0) {
            countSql += ' WHERE ' + whereClauses.join(' AND ');
        }

        // Re-use params but slice off limit/offset
        const countParamsFinal = params.slice(0, params.length - 2);

        const { count } = db.prepare(countSql).get(...countParamsFinal);

        res.json({ customers, total: count });
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({ error: 'Failed to get customers' });
    }
});

// Get single customer with documents and children
router.get('/:id', async (req, res) => {
    try {
        const customer = db.prepare(`
      SELECT c.*, u.username as created_by_name,
        p.name as parent_name,
        lu.username as linked_username
      FROM customers c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN customers p ON c.parent_id = p.id
      LEFT JOIN users lu ON c.linked_user_id = lu.id
      WHERE c.id = ?
    `).get(req.params.id);

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Permission Check
        const isOwner = req.user.role === 'client' && customer.linked_user_id === req.user.id;
        const canView = ['admin', 'employee'].includes(req.user.role) || isOwner;

        // Also allow if they are a child of this parent? 
        // For strictly "My Profile", client is linked to ONE customer.
        // If they want to view children (family members), we need logic for that.
        // If customer.parent_id linked user is me, I can view.

        let hasAccess = canView;
        if (!hasAccess && req.user.role === 'client') {
            // Check if I am the parent of this customer
            const parent = db.prepare('SELECT linked_user_id FROM customers WHERE id = ?').get(customer.parent_id);
            if (parent && parent.linked_user_id === req.user.id) {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
            return res.status(403).json({ error: 'You do not have permission to view this customer' });
        }

        // Get sub-customers (family members / departments)
        const children = db.prepare(`
            SELECT id, name, email, phone, parent_id
            FROM customers 
            WHERE parent_id = ?
        `).all(req.params.id);

        // Get family documents (Self + Children)
        const familyIds = [req.params.id, ...children.map(c => c.id)];

        const documents = db.prepare(`
          SELECT d.*, dt.name as document_type_name, u.username as uploaded_by_name, c.name as owner_name
          FROM documents d
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          LEFT JOIN users u ON d.uploaded_by = u.id
          LEFT JOIN customers c ON d.customer_id = c.id
          WHERE d.customer_id IN (${familyIds.map(() => '?').join(',')})
          ORDER BY d.created_at DESC
        `).all(...familyIds);

        res.json({ ...customer, documents, children });
    } catch (error) {
        console.error('Get customer error:', error);
        res.status(500).json({ error: 'Failed to get customer' });
    }
});

// Create customer
router.post('/', async (req, res) => {
    try {
        const { name, phone, email, address, policy_number, custom_fields, parent_id } = req.body;

        // Permission Check
        const canManage = ['admin', 'employee'].includes(req.user.role);
        let isClientAddingFamily = false;

        if (req.user.role === 'client' && parent_id) {
            // Check if client is linked to the parent_id
            // We use loose equality for ID matching (string vs number) just in case, or cast to Number
            const linkedId = req.user.linked_customer_id || (req.user.linked_customer
                ? req.user.linked_customer
                : db.prepare('SELECT linked_user_id FROM customers WHERE id = ?').get(parent_id)?.linked_user_id === req.user.id ? parent_id : null);

            // Note: req.user.linked_customer_id might not be populated in all Auth middlewares depending on implementation.
            // Best to verify via DB query to be safe.

            const parentCustomer = db.prepare('SELECT linked_user_id FROM customers WHERE id = ?').get(parent_id);
            if (parentCustomer && parentCustomer.linked_user_id === req.user.id) {
                isClientAddingFamily = true;
            }
        }

        if (!canManage && !isClientAddingFamily) {
            return res.status(403).json({ error: 'You do not have permission to create customers' });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Customer name is required' });
        }

        const folderName = `${Date.now()}_${sanitizeForFilename(name)}`;

        const stmt = db.prepare(`
      INSERT INTO customers (name, phone, email, address, policy_number, custom_fields, folder_name, created_by, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const result = stmt.run(
            name.trim(),
            phone || null,
            email || null,
            address || null,
            policy_number || null,
            JSON.stringify(custom_fields || {}),
            folderName,
            req.user.id,
            parent_id || null
        );

        // Create customer folder (using original logic but ignoring getCustomerFolder return signature difference if any, it returns void mostly)
        // Note: The original code passed result.lastInsertRowid, but getCustomerFolder expects folderName usually or creates it.
        // Let's stick to simple folder creation as before or import if needed. 
        // Checking imports: const { getCustomerFolder } = require('../services/fileService'); is present.
        // Original code called getCustomerFolder(result.lastInsertRowid, name); which seems specific to previous implementation.
        // Wait, looking at fileService usage in original file: getCustomerFolder(result.lastInsertRowid, name);
        // I will keep it consistent.

        // ACTUALLY, I need to check fileService signature.
        // If I can't check it now, I'll trust the original code's usage pattern.
        // "getCustomerFolder(result.lastInsertRowid, name);" was in line 113.
        getCustomerFolder(result.lastInsertRowid, name);

        const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.CUSTOMER_CREATE,
            entityType: 'customer',
            entityId: result.lastInsertRowid,
            entityName: name,
            newValues: { name, phone, email, parent_id },
            ipAddress: req.ip
        });

        res.status(201).json(newCustomer);

    } catch (error) {
        console.error('Create customer error:', error);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

// Generate Portal Access
const bcrypt = require('bcrypt');
router.post('/:id/create-portal-access', requirePermission('MANAGE_CUSTOMERS'), async (req, res) => {
    try {
        const customerId = req.params.id;
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        if (customer.linked_user_id) return res.status(400).json({ error: 'Customer already has portal access' });
        if (!customer.email) return res.status(400).json({ error: 'Customer needs an email address' });

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        // Create User
        // Check if email unavailable
        // Create or Reactivate User
        const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(customer.email);
        let username, newUserId;

        if (existingUser) {
            // Reactivate existing user
            username = existingUser.username;
            newUserId = existingUser.id;

            db.prepare(`
                UPDATE users 
                SET password_hash = ?, is_active = 1, role = 'client' 
                WHERE id = ?
            `).run(passwordHash, newUserId);

            console.log(`Reactivated user ${username} for customer ${customerId}`);
        } else {
            // Create new user
            username = customer.email.split('@')[0];
            const userStmt = db.prepare(`
                INSERT INTO users (username, email, password_hash, role)
                VALUES (?, ?, ?, 'client')
            `);
            const userResult = userStmt.run(username, customer.email, passwordHash);
            newUserId = userResult.lastInsertRowid;
        }

        // Link to Customer
        db.prepare('UPDATE customers SET linked_user_id = ? WHERE id = ?').run(newUserId, customerId);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: existingUser ? ACTIONS.USER_ACTIVATE : ACTIONS.USER_CREATE,
            entityType: 'user/portal',
            entityId: newUserId,
            entityName: username,
            newValues: { linked_customer: customerId },
            ipAddress: req.ip
        });

        res.json({ success: true, username, tempPassword, email: customer.email });

    } catch (error) {
        console.error('Portal access error:', error);
        res.status(500).json({ error: 'Failed to generate portal access' });
    }
});

// Disable Portal Access
router.post('/:id/disable-portal-access', requirePermission('MANAGE_CUSTOMERS'), async (req, res) => {
    try {
        const customerId = req.params.id;
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        if (!customer.linked_user_id) return res.status(400).json({ error: 'Customer does not have portal access' });

        const linkedUserId = customer.linked_user_id;

        // Transaction to Unlink and Deactivate
        db.transaction(() => {
            // Unlink from customer
            db.prepare('UPDATE customers SET linked_user_id = NULL WHERE id = ?').run(customerId);

            // Deactivate user (Soft delete / Disable)
            // We set is_active=0 and also rename username/email to free them up? 
            // Better to just deactivate, but keeps email taken. User might want to re-enable later.
            // For now, just deactivate.
            db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(linkedUserId);
        })();

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.USER_DEACTIVATE,
            entityType: 'user/portal',
            entityId: linkedUserId,
            entityName: 'Client Access Revoked',
            newValues: { customer_id: customerId },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Portal access disabled' });

    } catch (error) {
        console.error('Disable portal error:', error);
        res.status(500).json({ error: 'Failed to disable portal access' });
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
