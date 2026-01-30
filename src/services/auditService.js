const { db } = require('../config/database');

const ACTIONS = {
    // Auth actions
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    LOGIN_FAILED: 'LOGIN_FAILED',

    // User actions
    USER_CREATE: 'USER_CREATE',
    USER_UPDATE: 'USER_UPDATE',
    USER_DELETE: 'USER_DELETE',
    USER_DEACTIVATE: 'USER_DEACTIVATE',
    USER_ACTIVATE: 'USER_ACTIVATE',

    // Customer actions
    CUSTOMER_CREATE: 'CUSTOMER_CREATE',
    CUSTOMER_UPDATE: 'CUSTOMER_UPDATE',
    CUSTOMER_DELETE: 'CUSTOMER_DELETE',

    // Document actions
    DOCUMENT_UPLOAD: 'DOCUMENT_UPLOAD',
    DOCUMENT_VIEW: 'DOCUMENT_VIEW',
    DOCUMENT_DOWNLOAD: 'DOCUMENT_DOWNLOAD',
    DOCUMENT_UPDATE: 'DOCUMENT_UPDATE',
    DOCUMENT_DELETE: 'DOCUMENT_DELETE',
    DOCUMENT_VERSION_CREATE: 'DOCUMENT_VERSION_CREATE',

    // Document type actions
    DOCTYPE_CREATE: 'DOCTYPE_CREATE',
    DOCTYPE_UPDATE: 'DOCTYPE_UPDATE',
    DOCTYPE_DELETE: 'DOCTYPE_DELETE',

    // Settings actions
    SETTINGS_UPDATE: 'SETTINGS_UPDATE',
    SETUP_COMPLETE: 'SETUP_COMPLETE'
};

function logAction(params) {
    const {
        userId,
        username,
        action,
        entityType,
        entityId,
        entityName,
        oldValues,
        newValues,
        ipAddress
    } = params;

    const stmt = db.prepare(`
    INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, entity_name, old_values, new_values, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    stmt.run(
        userId || null,
        username || null,
        action,
        entityType,
        entityId || null,
        entityName || null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress || null
    );
}

function getAuditLogs(filters = {}) {
    let sql = `
    SELECT 
      al.*,
      u.username as user_display_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
    const params = [];

    if (filters.userId) {
        sql += ' AND al.user_id = ?';
        params.push(filters.userId);
    }

    if (filters.action) {
        sql += ' AND al.action = ?';
        params.push(filters.action);
    }

    if (filters.entityType) {
        sql += ' AND al.entity_type = ?';
        params.push(filters.entityType);
    }

    if (filters.entityId) {
        sql += ' AND al.entity_id = ?';
        params.push(filters.entityId);
    }

    if (filters.startDate) {
        sql += ' AND al.created_at >= ?';
        params.push(filters.startDate);
    }

    if (filters.endDate) {
        sql += ' AND al.created_at <= ?';
        params.push(filters.endDate);
    }

    if (filters.search) {
        sql += ' AND (al.entity_name LIKE ? OR al.username LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    sql += ' ORDER BY al.created_at DESC';

    if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
        if (filters.offset) {
            sql += ' OFFSET ?';
            params.push(filters.offset);
        }
    }

    return db.prepare(sql).all(...params);
}

function getAuditLogCount(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
    const params = [];

    if (filters.userId) {
        sql += ' AND user_id = ?';
        params.push(filters.userId);
    }

    if (filters.action) {
        sql += ' AND action = ?';
        params.push(filters.action);
    }

    if (filters.entityType) {
        sql += ' AND entity_type = ?';
        params.push(filters.entityType);
    }

    if (filters.startDate) {
        sql += ' AND created_at >= ?';
        params.push(filters.startDate);
    }

    if (filters.endDate) {
        sql += ' AND created_at <= ?';
        params.push(filters.endDate);
    }

    if (filters.search) {
        sql += ' AND (entity_name LIKE ? OR username LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    return db.prepare(sql).get(...params).count;
}

module.exports = {
    ACTIONS,
    logAction,
    getAuditLogs,
    getAuditLogCount
};
