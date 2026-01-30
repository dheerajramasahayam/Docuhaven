const express = require('express');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { logAction, ACTIONS } = require('../services/auditService');

const router = express.Router();

// All routes require authentication and admin permission
router.use(authenticateToken);
router.use(requirePermission('MANAGE_SETTINGS'));

// Get all settings
router.get('/', (req, res) => {
    try {
        const settings = db.prepare('SELECT * FROM settings').all();

        const settingsObj = {};
        settings.forEach(s => {
            try {
                settingsObj[s.key] = JSON.parse(s.value);
            } catch {
                settingsObj[s.key] = s.value;
            }
        });

        res.json(settingsObj);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// Get single setting
router.get('/:key', (req, res) => {
    try {
        const setting = db.prepare('SELECT * FROM settings WHERE key = ?').get(req.params.key);

        if (!setting) {
            return res.status(404).json({ error: 'Setting not found' });
        }

        let value;
        try {
            value = JSON.parse(setting.value);
        } catch {
            value = setting.value;
        }

        res.json({ key: setting.key, value });
    } catch (error) {
        console.error('Get setting error:', error);
        res.status(500).json({ error: 'Failed to get setting' });
    }
});

// Update setting
router.put('/:key', (req, res) => {
    try {
        const { value } = req.body;
        const key = req.params.key;

        if (value === undefined) {
            return res.status(400).json({ error: 'Value is required' });
        }

        // Don't allow changing setup_complete
        if (key === 'setup_complete') {
            return res.status(400).json({ error: 'Cannot modify setup_complete setting' });
        }

        const oldSetting = db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

        if (oldSetting) {
            db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?')
                .run(valueStr, key);
        } else {
            db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, valueStr);
        }

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.SETTINGS_UPDATE,
            entityType: 'settings',
            entityName: key,
            oldValues: oldSetting ? { value: oldSetting.value } : null,
            newValues: { value: valueStr },
            ipAddress: req.ip
        });

        res.json({ key, value });
    } catch (error) {
        console.error('Update setting error:', error);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

// Get customer field configuration
router.get('/customer-fields/config', (req, res) => {
    try {
        const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('customer_fields');

        if (!setting) {
            return res.json({
                required: ['name'],
                optional: ['phone', 'email', 'address', 'policy_number'],
                custom: []
            });
        }

        res.json(JSON.parse(setting.value));
    } catch (error) {
        console.error('Get customer fields error:', error);
        res.status(500).json({ error: 'Failed to get customer fields configuration' });
    }
});

module.exports = router;
