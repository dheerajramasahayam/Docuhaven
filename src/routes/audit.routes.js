const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { getAuditLogs, getAuditLogCount, ACTIONS } = require('../services/auditService');

const router = express.Router();

// All routes require authentication and admin permission
router.use(authenticateToken);
router.use(requirePermission('VIEW_AUDIT_LOGS'));

// Get audit logs with filters
router.get('/', (req, res) => {
    try {
        const {
            user_id,
            action,
            entity_type,
            entity_id,
            start_date,
            end_date,
            search,
            limit = 50,
            offset = 0
        } = req.query;

        const filters = {
            userId: user_id,
            action,
            entityType: entity_type,
            entityId: entity_id,
            startDate: start_date,
            endDate: end_date,
            search,
            limit: parseInt(limit),
            offset: parseInt(offset)
        };

        const logs = getAuditLogs(filters);
        const total = getAuditLogCount(filters);

        // Parse JSON fields
        const parsedLogs = logs.map(log => ({
            ...log,
            old_values: log.old_values ? JSON.parse(log.old_values) : null,
            new_values: log.new_values ? JSON.parse(log.new_values) : null
        }));

        res.json({ logs: parsedLogs, total });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ error: 'Failed to get audit logs' });
    }
});

// Get available action types for filtering
router.get('/actions', (req, res) => {
    res.json(Object.values(ACTIONS));
});

// Get entity types for filtering
router.get('/entity-types', (req, res) => {
    res.json(['auth', 'user', 'customer', 'document', 'document_type', 'settings', 'system']);
});

module.exports = router;
