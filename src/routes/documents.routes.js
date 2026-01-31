const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { upload, handleUploadError, UPLOAD_DIR } = require('../middleware/upload');
const { logAction, ACTIONS } = require('../services/auditService');
const { moveToCustomerFolder, archiveCurrentVersion, deleteFile, getFileStats } = require('../services/fileService');

const router = express.Router();

// Download document - BEFORE global auth (uses token from query param)
router.get('/:id/download', (req, res) => {
    try {
        const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const jwt = require('jsonwebtoken');
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        } catch (e) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const document = db.prepare(`
          SELECT d.*, c.name as customer_name, dt.name as document_type_name
          FROM documents d
          LEFT JOIN customers c ON d.customer_id = c.id
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          WHERE d.id = ?
        `).get(req.params.id);

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const filePath = path.join(UPLOAD_DIR, document.file_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        // Log the download action
        try {
            const { logAction, ACTIONS } = require('../services/auditService');
            logAction({
                userId: decoded.userId,
                username: decoded.username,
                action: ACTIONS.DOCUMENT_DOWNLOAD,
                entityType: 'document',
                entityId: parseInt(req.params.id),
                entityName: `${document.customer_name} - ${document.document_type_name}`,
                ipAddress: req.ip
            });
        } catch (err) {
            console.error('Audit log error:', err);
            // Continue with download even if logging fails
        }

        res.setHeader('Content-Type', document.mime_type);
        // Force download with attachment
        res.setHeader('Content-Disposition', `attachment; filename="${document.stored_filename}"`);
        res.sendFile(filePath);
    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ error: 'Failed to download document' });
    }
});

// View document inline - BEFORE global auth (uses token from query param for iframe)
router.get('/:id/view', (req, res) => {
    try {
        const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const jwt = require('jsonwebtoken');
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        } catch (e) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const document = db.prepare(`
          SELECT d.*, c.name as customer_name, dt.name as document_type_name
          FROM documents d
          LEFT JOIN customers c ON d.customer_id = c.id
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          WHERE d.id = ?
        `).get(req.params.id);

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const filePath = path.join(UPLOAD_DIR, document.file_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        res.setHeader('Content-Type', document.mime_type);
        res.setHeader('Content-Disposition', `inline; filename="${document.stored_filename}"`);
        res.sendFile(filePath);
    } catch (error) {
        console.error('View document error:', error);
        res.status(500).json({ error: 'Failed to view document' });
    }
});

// All other routes require authentication
router.use(authenticateToken);

// Get all documents (with optional filters)
router.get('/', (req, res) => {
    // Permission check override
    const ROLES = require('../middleware/rbac').ROLES;
    const isClient = req.user.role === ROLES.CLIENT;

    // Check permissions manually since we support multiple
    // Clients have VIEW_OWN_DOCUMENTS, others VIEW_DOCUMENTS
    // For simplicity, just check roles or update middleware. 
    // Let's assume valid login.

    // Validation
    if (isClient) {
        // Ok
    } else if ([ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.VIEWER].includes(req.user.role)) {
        // Ok
    } else {
        return res.status(403).json({ error: 'Permission denied' });
    }

    try {
        const { customer_id, document_type_id, search, limit = 50, offset = 0 } = req.query;

        let sql = `
       SELECT d.*, 
        c.name as customer_name,
        dt.name as document_type_name,
        u.username as uploaded_by_name
       FROM documents d
       LEFT JOIN customers c ON d.customer_id = c.id
       LEFT JOIN document_types dt ON d.document_type_id = dt.id
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE 1=1
    `;
        const params = [];

        // CLIENT PORTAL LOGIC
        if (isClient) {
            // Find linked customer
            const linkedCustomer = db.prepare('SELECT id FROM customers WHERE linked_user_id = ?').get(req.user.id);
            if (!linkedCustomer) {
                return res.json({ documents: [], total: 0 }); // No linked customer
            }

            // Find self and all descendants (Hierarchical)
            // CTE to get all child IDs
            const familyTree = db.prepare(`
                WITH RECURSIVE family_tree(id) AS (
                    SELECT id FROM customers WHERE id = ?
                    UNION ALL
                    SELECT c.id FROM customers c
                    JOIN family_tree ft ON c.parent_id = ft.id
                )
                SELECT id FROM family_tree
            `).all(linkedCustomer.id);

            const familyIds = familyTree.map(f => f.id);

            if (familyIds.length === 0) {
                sql += ' AND 1=0'; // Should not happen
            } else {
                sql += ` AND d.customer_id IN (${familyIds.map(() => '?').join(',')})`;
                params.push(...familyIds);
            }
        }

        if (customer_id) {
            sql += ' AND d.customer_id = ?';
            params.push(customer_id);
        }

        if (document_type_id) {
            sql += ' AND d.document_type_id = ?';
            params.push(document_type_id);
        }

        if (search) {
            sql += ' AND (d.original_filename LIKE ? OR c.name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        sql += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const documents = db.prepare(sql).all(...params);

        // Get total count
        let countSql = `
       SELECT COUNT(*) as count FROM documents d
       LEFT JOIN customers c ON d.customer_id = c.id
       WHERE 1=1
    `;
        const countParams = [];

        // Repeat Client Logic for Count
        if (isClient) {
            const linkedCustomer = db.prepare('SELECT id FROM customers WHERE linked_user_id = ?').get(req.user.id);
            if (!linkedCustomer) {
                return res.json({ documents: [], total: 0 });
            }
            const familyTree = db.prepare(`
                WITH RECURSIVE family_tree(id) AS (
                    SELECT id FROM customers WHERE id = ?
                    UNION ALL
                    SELECT c.id FROM customers c
                    JOIN family_tree ft ON c.parent_id = ft.id
                )
                SELECT id FROM family_tree
            `).all(linkedCustomer.id);
            const familyIds = familyTree.map(f => f.id);
            countSql += ` AND d.customer_id IN (${familyIds.map(() => '?').join(',')})`;
            countParams.push(...familyIds);
        }

        if (customer_id) {
            countSql += ' AND d.customer_id = ?';
            countParams.push(customer_id);
        }

        if (document_type_id) {
            countSql += ' AND d.document_type_id = ?';
            countParams.push(document_type_id);
        }

        if (search) {
            countSql += ' AND (d.original_filename LIKE ? OR c.name LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const { count } = db.prepare(countSql).get(...countParams);

        res.json({ documents, total: count });
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to get documents' });
    }
});

// Get single document with versions
router.get('/:id', requirePermission('VIEW_DOCUMENTS'), (req, res) => {
    try {
        const document = db.prepare(`
      SELECT d.*, 
        c.name as customer_name,
        dt.name as document_type_name,
        u.username as uploaded_by_name
      FROM documents d
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN document_types dt ON d.document_type_id = dt.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.id = ?
    `).get(req.params.id);

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Get versions
        const versions = db.prepare(`
      SELECT dv.*, u.username as uploaded_by_name
      FROM document_versions dv
      LEFT JOIN users u ON dv.uploaded_by = u.id
      WHERE dv.document_id = ?
      ORDER BY dv.version_number DESC
    `).all(req.params.id);

        res.json({ ...document, versions });
    } catch (error) {
        console.error('Get document error:', error);
        res.status(500).json({ error: 'Failed to get document' });
    }
});

// Upload document
router.post('/upload', upload.single('file'), handleUploadError, async (req, res) => {
    try {
        const { customer_id, document_type_id } = req.body;

        // Permission Check
        const canUpload = ['admin', 'employee'].includes(req.user.role);
        let isClientAllowed = false;

        if (req.user.role === 'client' && customer_id) {
            const targetCustomer = db.prepare('SELECT id, parent_id, linked_user_id FROM customers WHERE id = ?').get(customer_id);
            if (targetCustomer) {
                // Uploading to own profile
                if (targetCustomer.linked_user_id === req.user.id) {
                    isClientAllowed = true;
                }
                // Uploading to family member profile (if I am the parent)
                else if (targetCustomer.parent_id) {
                    const parent = db.prepare('SELECT linked_user_id FROM customers WHERE id = ?').get(targetCustomer.parent_id);
                    if (parent && parent.linked_user_id === req.user.id) {
                        isClientAllowed = true;
                    }
                }
            }
        }

        if (!canUpload && !isClientAllowed) {
            return res.status(403).json({ error: 'You do not have permission to upload documents' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!customer_id || !document_type_id) {
            // Clean up temp file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Customer and document type are required' });
        }

        // Verify customer exists
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
        if (!customer) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Verify document type exists
        const docType = db.prepare('SELECT * FROM document_types WHERE id = ? AND is_active = 1').get(document_type_id);
        if (!docType) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Document type not found or inactive' });
        }

        // Check if document of same type exists for this customer
        const existingDoc = db.prepare(`
      SELECT * FROM documents 
      WHERE customer_id = ? AND document_type_id = ?
    `).get(customer_id, document_type_id);

        const ext = path.extname(req.file.originalname).toLowerCase();

        if (existingDoc) {
            // Version the existing document
            const fullPath = path.join(UPLOAD_DIR, existingDoc.file_path);
            const archiveResult = archiveCurrentVersion(fullPath, existingDoc.current_version);

            if (archiveResult) {
                // Save version to database
                db.prepare(`
          INSERT INTO document_versions (document_id, version_number, file_path, file_size, uploaded_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(
                    existingDoc.id,
                    existingDoc.current_version,
                    archiveResult.relativePath,
                    existingDoc.file_size,
                    existingDoc.uploaded_by
                );
            }

            // Move new file
            const fileResult = moveToCustomerFolder(req.file.path, customer_id, customer.name, docType.name, ext);

            // Update document record
            const newVersion = existingDoc.current_version + 1;
            db.prepare(`
        UPDATE documents SET
          original_filename = ?,
          stored_filename = ?,
          file_path = ?,
          file_size = ?,
          mime_type = ?,
          current_version = ?,
          uploaded_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
                req.file.originalname,
                fileResult.filename,
                fileResult.relativePath,
                req.file.size,
                req.file.mimetype,
                newVersion,
                req.user.id,
                existingDoc.id
            );

            logAction({
                userId: req.user.id,
                username: req.user.username,
                action: ACTIONS.DOCUMENT_VERSION_CREATE,
                entityType: 'document',
                entityId: existingDoc.id,
                entityName: `${customer.name} - ${docType.name}`,
                newValues: { version: newVersion, filename: fileResult.filename },
                ipAddress: req.ip
            });

            const updatedDoc = db.prepare(`
        SELECT d.*, c.name as customer_name, dt.name as document_type_name
        FROM documents d
        LEFT JOIN customers c ON d.customer_id = c.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        WHERE d.id = ?
      `).get(existingDoc.id);

            res.json({ ...updatedDoc, message: 'Document updated with new version' });

        } else {
            // New document
            const fileResult = moveToCustomerFolder(req.file.path, customer_id, customer.name, docType.name, ext);

            const stmt = db.prepare(`
        INSERT INTO documents (customer_id, document_type_id, original_filename, stored_filename, file_path, file_size, mime_type, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

            const result = stmt.run(
                customer_id,
                document_type_id,
                req.file.originalname,
                fileResult.filename,
                fileResult.relativePath,
                req.file.size,
                req.file.mimetype,
                req.user.id
            );

            logAction({
                userId: req.user.id,
                username: req.user.username,
                action: ACTIONS.DOCUMENT_UPLOAD,
                entityType: 'document',
                entityId: result.lastInsertRowid,
                entityName: `${customer.name} - ${docType.name}`,
                newValues: { filename: fileResult.filename, size: req.file.size },
                ipAddress: req.ip
            });

            const newDoc = db.prepare(`
        SELECT d.*, c.name as customer_name, dt.name as document_type_name
        FROM documents d
        LEFT JOIN customers c ON d.customer_id = c.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        WHERE d.id = ?
      `).get(result.lastInsertRowid);

            res.status(201).json(newDoc);
        }

    } catch (error) {
        console.error('Upload document error:', error);
        // Clean up temp file if exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Failed to upload document' });
    }
});


// Download specific version
router.get('/:id/versions/:versionId/download', requirePermission('VIEW_DOCUMENTS'), (req, res) => {
    try {
        const version = db.prepare(`
      SELECT dv.*, d.customer_id, c.name as customer_name, dt.name as document_type_name
      FROM document_versions dv
      LEFT JOIN documents d ON dv.document_id = d.id
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN document_types dt ON d.document_type_id = dt.id
      WHERE dv.id = ? AND dv.document_id = ?
    `).get(req.params.versionId, req.params.id);

        if (!version) {
            return res.status(404).json({ error: 'Version not found' });
        }

        const filePath = path.join(UPLOAD_DIR, version.file_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        res.download(filePath);

    } catch (error) {
        console.error('Download version error:', error);
        res.status(500).json({ error: 'Failed to download version' });
    }
});

// Delete document
router.delete('/:id', requirePermission('DELETE_DOCUMENTS'), (req, res) => {
    try {
        const document = db.prepare(`
      SELECT d.*, c.name as customer_name, dt.name as document_type_name
      FROM documents d
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN document_types dt ON d.document_type_id = dt.id
      WHERE d.id = ?
    `).get(req.params.id);

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Delete file from disk
        const filePath = path.join(UPLOAD_DIR, document.file_path);
        deleteFile(filePath);

        // Delete version files
        const versions = db.prepare('SELECT * FROM document_versions WHERE document_id = ?').all(req.params.id);
        for (const version of versions) {
            deleteFile(path.join(UPLOAD_DIR, version.file_path));
        }

        // Delete from database
        db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.DOCUMENT_DELETE,
            entityType: 'document',
            entityId: parseInt(req.params.id),
            entityName: `${document.customer_name} - ${document.document_type_name}`,
            oldValues: { filename: document.stored_filename },
            ipAddress: req.ip
        });

        res.json({ message: 'Document deleted successfully' });

    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

module.exports = router;
