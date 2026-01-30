const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { logAction, ACTIONS } = require('../services/auditService');

const router = express.Router();

// All routes require authentication and admin permission
router.use(authenticateToken);
router.use(requirePermission('MANAGE_USERS'));

// Get all users
router.get('/', (req, res) => {
    try {
        const users = db.prepare(`
      SELECT id, username, email, role, is_active, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `).all();

        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Get single user
router.get('/:id', (req, res) => {
    try {
        const user = db.prepare(`
      SELECT id, username, email, role, is_active, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Create user
router.post('/', async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const validRoles = ['admin', 'employee', 'viewer'];
        if (role && !validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Check for existing user
        const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existing) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `);
        const result = stmt.run(username, email, passwordHash, role || 'viewer');

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.USER_CREATE,
            entityType: 'user',
            entityId: result.lastInsertRowid,
            entityName: username,
            newValues: { username, email, role: role || 'viewer' },
            ipAddress: req.ip
        });

        const newUser = db.prepare('SELECT id, username, email, role, is_active, created_at FROM users WHERE id = ?')
            .get(result.lastInsertRowid);

        res.status(201).json(newUser);

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Update user
router.put('/:id', async (req, res) => {
    try {
        const { username, email, role, password } = req.body;
        const userId = req.params.id;

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent self-demotion from admin
        if (parseInt(userId) === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ error: 'Cannot change your own role from admin' });
        }

        const oldValues = { username: user.username, email: user.email, role: user.role };
        const updates = [];
        const params = [];

        if (username && username !== user.username) {
            const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, userId);
            if (existing) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            updates.push('username = ?');
            params.push(username);
        }

        if (email && email !== user.email) {
            const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
            if (existing) {
                return res.status(400).json({ error: 'Email already exists' });
            }
            updates.push('email = ?');
            params.push(email);
        }

        if (role) {
            const validRoles = ['admin', 'employee', 'viewer'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: 'Invalid role' });
            }
            updates.push('role = ?');
            params.push(role);
        }

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }
            const passwordHash = await bcrypt.hash(password, 10);
            updates.push('password_hash = ?');
            params.push(passwordHash);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(userId);

        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

        const updatedUser = db.prepare('SELECT id, username, email, role, is_active, created_at, updated_at FROM users WHERE id = ?')
            .get(userId);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.USER_UPDATE,
            entityType: 'user',
            entityId: parseInt(userId),
            entityName: updatedUser.username,
            oldValues,
            newValues: { username: updatedUser.username, email: updatedUser.email, role: updatedUser.role },
            ipAddress: req.ip
        });

        res.json(updatedUser);

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Toggle user active status
router.patch('/:id/toggle-active', (req, res) => {
    try {
        const userId = req.params.id;

        // Prevent self-deactivation
        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newStatus = user.is_active ? 0 : 1;
        db.prepare('UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newStatus, userId);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: newStatus ? ACTIONS.USER_ACTIVATE : ACTIONS.USER_DEACTIVATE,
            entityType: 'user',
            entityId: parseInt(userId),
            entityName: user.username,
            oldValues: { is_active: user.is_active },
            newValues: { is_active: newStatus },
            ipAddress: req.ip
        });

        res.json({ id: parseInt(userId), is_active: newStatus });

    } catch (error) {
        console.error('Toggle user status error:', error);
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

// Delete user
router.delete('/:id', (req, res) => {
    try {
        const userId = req.params.id;

        // Prevent self-deletion
        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(userId);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.USER_DELETE,
            entityType: 'user',
            entityId: parseInt(userId),
            entityName: user.username,
            oldValues: { username: user.username, email: user.email, role: user.role },
            ipAddress: req.ip
        });

        res.json({ message: 'User deleted successfully' });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
