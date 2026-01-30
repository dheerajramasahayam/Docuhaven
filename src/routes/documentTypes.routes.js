const express = require('express');
const { db } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { logAction, ACTIONS } = require('../services/auditService');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all document types
router.get('/', requirePermission('VIEW_DOCUMENT_TYPES'), (req, res) => {
    try {
        const { includeInactive } = req.query;

        let sql = 'SELECT * FROM document_types';
        if (!includeInactive) {
            sql += ' WHERE is_active = 1';
        }
        sql += ' ORDER BY name ASC';

        const documentTypes = db.prepare(sql).all();
        res.json(documentTypes);
    } catch (error) {
        console.error('Get document types error:', error);
        res.status(500).json({ error: 'Failed to get document types' });
    }
});

// Get single document type
router.get('/:id', requirePermission('VIEW_DOCUMENT_TYPES'), (req, res) => {
    try {
        const docType = db.prepare('SELECT * FROM document_types WHERE id = ?').get(req.params.id);

        if (!docType) {
            return res.status(404).json({ error: 'Document type not found' });
        }

        res.json(docType);
    } catch (error) {
        console.error('Get document type error:', error);
        res.status(500).json({ error: 'Failed to get document type' });
    }
});

// Create document type
router.post('/', requirePermission('MANAGE_DOCUMENT_TYPES'), (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Document type name is required' });
        }

        // Check for existing
        const existing = db.prepare('SELECT id FROM document_types WHERE name = ?').get(name.trim());
        if (existing) {
            return res.status(400).json({ error: 'Document type already exists' });
        }

        const stmt = db.prepare('INSERT INTO document_types (name, description) VALUES (?, ?)');
        const result = stmt.run(name.trim(), description || '');

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.DOCTYPE_CREATE,
            entityType: 'document_type',
            entityId: result.lastInsertRowid,
            entityName: name,
            newValues: { name, description },
            ipAddress: req.ip
        });

        const newDocType = db.prepare('SELECT * FROM document_types WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newDocType);

    } catch (error) {
        console.error('Create document type error:', error);
        res.status(500).json({ error: 'Failed to create document type' });
    }
});

// Update document type
router.put('/:id', requirePermission('MANAGE_DOCUMENT_TYPES'), (req, res) => {
    try {
        const { name, description, is_active } = req.body;
        const docTypeId = req.params.id;

        const docType = db.prepare('SELECT * FROM document_types WHERE id = ?').get(docTypeId);
        if (!docType) {
            return res.status(404).json({ error: 'Document type not found' });
        }

        if (name && name.trim()) {
            // Check for duplicate name
            const existing = db.prepare('SELECT id FROM document_types WHERE name = ? AND id != ?')
                .get(name.trim(), docTypeId);
            if (existing) {
                return res.status(400).json({ error: 'Document type name already exists' });
            }
        }

        const oldValues = { name: docType.name, description: docType.description, is_active: docType.is_active };

        db.prepare(`
      UPDATE document_types 
      SET name = ?, description = ?, is_active = ?
      WHERE id = ?
    `).run(
            name ? name.trim() : docType.name,
            description !== undefined ? description : docType.description,
            is_active !== undefined ? (is_active ? 1 : 0) : docType.is_active,
            docTypeId
        );

        const updatedDocType = db.prepare('SELECT * FROM document_types WHERE id = ?').get(docTypeId);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.DOCTYPE_UPDATE,
            entityType: 'document_type',
            entityId: parseInt(docTypeId),
            entityName: updatedDocType.name,
            oldValues,
            newValues: { name: updatedDocType.name, description: updatedDocType.description, is_active: updatedDocType.is_active },
            ipAddress: req.ip
        });

        res.json(updatedDocType);

    } catch (error) {
        console.error('Update document type error:', error);
        res.status(500).json({ error: 'Failed to update document type' });
    }
});

// Delete document type (soft delete - just deactivate)
router.delete('/:id', requirePermission('MANAGE_DOCUMENT_TYPES'), (req, res) => {
    try {
        const docTypeId = req.params.id;

        const docType = db.prepare('SELECT * FROM document_types WHERE id = ?').get(docTypeId);
        if (!docType) {
            return res.status(404).json({ error: 'Document type not found' });
        }

        // Check if any documents use this type
        const docsCount = db.prepare('SELECT COUNT(*) as count FROM documents WHERE document_type_id = ?')
            .get(docTypeId).count;

        if (docsCount > 0) {
            // Soft delete - just deactivate
            db.prepare('UPDATE document_types SET is_active = 0 WHERE id = ?').run(docTypeId);

            logAction({
                userId: req.user.id,
                username: req.user.username,
                action: ACTIONS.DOCTYPE_UPDATE,
                entityType: 'document_type',
                entityId: parseInt(docTypeId),
                entityName: docType.name,
                oldValues: { is_active: 1 },
                newValues: { is_active: 0 },
                ipAddress: req.ip
            });

            return res.json({ message: 'Document type deactivated (has associated documents)' });
        }

        // Hard delete if no documents
        db.prepare('DELETE FROM document_types WHERE id = ?').run(docTypeId);

        logAction({
            userId: req.user.id,
            username: req.user.username,
            action: ACTIONS.DOCTYPE_DELETE,
            entityType: 'document_type',
            entityId: parseInt(docTypeId),
            entityName: docType.name,
            oldValues: { name: docType.name, description: docType.description },
            ipAddress: req.ip
        });

        res.json({ message: 'Document type deleted successfully' });

    } catch (error) {
        console.error('Delete document type error:', error);
        res.status(500).json({ error: 'Failed to delete document type' });
    }
});

module.exports = router;
