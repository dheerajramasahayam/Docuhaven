const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const { logAction, ACTIONS } = require('../services/auditService');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user by username or email
        const user = db.prepare(`
      SELECT * FROM users 
      WHERE (username = ? OR email = ?) AND is_active = 1
    `).get(username, username);

        if (!user) {
            logAction({
                action: ACTIONS.LOGIN_FAILED,
                entityType: 'auth',
                entityName: username,
                ipAddress: req.ip
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            logAction({
                userId: user.id,
                username: user.username,
                action: ACTIONS.LOGIN_FAILED,
                entityType: 'auth',
                entityName: username,
                ipAddress: req.ip
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = generateToken(user);

        // Log successful login
        logAction({
            userId: user.id,
            username: user.username,
            action: ACTIONS.LOGIN,
            entityType: 'auth',
            entityName: user.username,
            ipAddress: req.ip
        });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role
        }
    });
});

// Change password
router.post('/change-password', require('../middleware/auth').authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        // Get user with password hash
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Update password
        const newHash = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newHash, req.user.id);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.USER_UPDATE,
            entityType: 'user',
            entityId: req.user.id,
            entityName: req.user.username,
            newValues: { password: '[changed]' },
            ipAddress: req.ip
        });

        res.json({ message: 'Password changed successfully' });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

module.exports = router;
