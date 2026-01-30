const express = require('express');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Dashboard stats - requires authentication
router.get('/stats', authenticateToken, (req, res) => {
    try {
        // Admin gets full stats
        if (req.user.role === 'admin') {
            const stats = {};

            // Total customers
            stats.totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;

            // Total documents
            stats.totalDocuments = db.prepare('SELECT COUNT(*) as count FROM documents').get().count;

            // Total users
            stats.totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

            // Documents by type
            stats.documentsByType = db.prepare(`
                SELECT dt.name, COUNT(d.id) as count
                FROM document_types dt
                LEFT JOIN documents d ON dt.id = d.document_type_id
                WHERE dt.is_active = 1
                GROUP BY dt.id
                ORDER BY count DESC
            `).all();

            // Recent activity (last 10)
            stats.recentActivity = db.prepare(`
                SELECT action, entity_type, entity_name, username, created_at
                FROM audit_logs
                ORDER BY created_at DESC
                LIMIT 10
            `).all();

            // Documents uploaded today
            const today = new Date().toISOString().split('T')[0];
            stats.documentsToday = db.prepare(`
                SELECT COUNT(*) as count FROM documents 
                WHERE date(created_at) = date(?)
            `).get(today).count;

            // Storage usage (total file size)
            const storageResult = db.prepare('SELECT SUM(file_size) as total FROM documents').get();
            stats.totalStorageBytes = storageResult.total || 0;
            stats.totalStorageMB = Math.round((stats.totalStorageBytes / (1024 * 1024)) * 100) / 100;

            // Customers added this month
            const firstOfMonth = new Date();
            firstOfMonth.setDate(1);
            stats.customersThisMonth = db.prepare(`
                SELECT COUNT(*) as count FROM customers 
                WHERE date(created_at) >= date(?)
            `).get(firstOfMonth.toISOString().split('T')[0]).count;

            return res.json({ role: 'admin', stats });
        }

        // Employee gets their recent customers
        if (req.user.role === 'employee') {
            const recentCustomers = db.prepare(`
                SELECT * FROM customers 
                WHERE created_by = ? 
                ORDER BY created_at DESC 
                LIMIT 10
            `).all(req.user.id);
            
            return res.json({ role: 'employee', recentCustomers });
        }

        // Viewers get no dashboard data
        return res.json({ role: 'viewer' });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get dashboard stats' });
    }
});

module.exports = router;
