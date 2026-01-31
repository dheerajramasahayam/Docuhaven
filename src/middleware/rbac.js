// Role-Based Access Control Middleware

const ROLES = {
    ADMIN: 'admin',
    EMPLOYEE: 'employee',
    VIEWER: 'viewer',
    CLIENT: 'client'
};

const PERMISSIONS = {
    // Document permissions
    VIEW_DOCUMENTS: [ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.VIEWER], // Internal view
    VIEW_OWN_DOCUMENTS: [ROLES.CLIENT], // Portal view

    UPLOAD_DOCUMENTS: [ROLES.ADMIN, ROLES.EMPLOYEE], // Internal upload
    UPLOAD_OWN_DOCUMENTS: [ROLES.CLIENT], // Portal upload

    UPDATE_DOCUMENTS: [ROLES.ADMIN, ROLES.EMPLOYEE],
    DELETE_DOCUMENTS: [ROLES.ADMIN, ROLES.EMPLOYEE],

    // Customer permissions
    VIEW_CUSTOMERS: [ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.VIEWER],
    MANAGE_CUSTOMERS: [ROLES.ADMIN, ROLES.EMPLOYEE],

    // User management
    MANAGE_USERS: [ROLES.ADMIN],

    // Audit logs
    VIEW_AUDIT_LOGS: [ROLES.ADMIN],

    // Settings
    MANAGE_SETTINGS: [ROLES.ADMIN],

    // Document types
    VIEW_DOCUMENT_TYPES: [ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.VIEWER, ROLES.CLIENT],
    MANAGE_DOCUMENT_TYPES: [ROLES.ADMIN]
};

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const allowedRoles = PERMISSIONS[permission];
        if (!allowedRoles) {
            return res.status(500).json({ error: 'Invalid permission configuration' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'You do not have permission to perform this action' });
        }

        next();
    };
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient privileges' });
        }

        next();
    };
}

module.exports = {
    ROLES,
    PERMISSIONS,
    requirePermission,
    requireRole
};
