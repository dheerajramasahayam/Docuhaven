const express = require('express');
const bcrypt = require('bcrypt');
const { db, isSetupComplete, markSetupComplete, getDefaultDocumentTypes } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const { logAction, ACTIONS } = require('../services/auditService');
const backupService = require('../services/backupService');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

// Check if setup is needed
router.get('/status', (req, res) => {
    const setupComplete = isSetupComplete();
    res.json({ setupComplete });
});

// Browse server directories
router.post('/fs/browse', (req, res) => {
    try {
        const targetPath = req.body.path || os.homedir(); // Default to home (safe start)

        // Security check: simple one, can be expanded. 
        // We only allow listing if we can access it.

        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: 'Path not found' });
        }

        const items = fs.readdirSync(targetPath, { withFileTypes: true });

        const directories = items
            .filter(item => item.isDirectory() && !item.name.startsWith('.'))
            .map(item => ({
                name: item.name,
                path: path.join(targetPath, item.name)
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const parent = path.dirname(targetPath);

        res.json({
            current: targetPath,
            parent: parent === targetPath ? null : parent, // Stop at root
            directories
        });

    } catch (error) {
        console.error('Browse fs error:', error);
        res.status(500).json({ error: 'Failed to list directories: ' + error.message });
    }
});

// Complete initial setup
router.post('/complete', async (req, res) => {
    try {
        if (isSetupComplete()) {
            return res.status(400).json({ error: 'Setup has already been completed' });
        }

        const { admin, documentTypes, customerFields, backupConfig } = req.body;

        // Validate admin data
        if (!admin || !admin.username || !admin.email || !admin.password) {
            return res.status(400).json({ error: 'Admin username, email, and password are required' });
        }

        if (admin.password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Create admin user
        const passwordHash = await bcrypt.hash(admin.password, 10);
        const userStmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, 'admin')
    `);
        const userResult = userStmt.run(admin.username, admin.email, passwordHash);

        // Insert document types
        const docTypes = documentTypes && documentTypes.length > 0
            ? documentTypes
            : getDefaultDocumentTypes();

        const docTypeStmt = db.prepare(`
      INSERT INTO document_types (name, description)
      VALUES (?, ?)
    `);

        for (const docType of docTypes) {
            try {
                docTypeStmt.run(docType.name, docType.description || '');
            } catch (err) {
                // Ignore duplicate entries
                if (!err.message.includes('UNIQUE constraint')) {
                    throw err;
                }
            }
        }

        // Save customer fields configuration
        const fieldsConfig = customerFields || {
            required: ['name'],
            optional: ['phone', 'email', 'address', 'policy_number'],
            custom: []
        };

        const settingsStmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
    `);
        settingsStmt.run('customer_fields', JSON.stringify(fieldsConfig));

        // Save backup config if provided
        if (backupConfig) {
            backupService.saveBackupSettings(backupConfig);
        }

        // Mark setup as complete
        markSetupComplete();

        // Log the setup completion
        logAction({
            userId: userResult.lastInsertRowid,
            username: admin.username,
            action: ACTIONS.SETUP_COMPLETE,
            entityType: 'system',
            entityId: null,
            entityName: 'Initial Setup',
            ipAddress: req.ip
        });

        // Generate token for auto-login
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userResult.lastInsertRowid);
        const token = generateToken(user);

        res.json({
            success: true,
            message: 'Setup completed successfully',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({ error: 'Failed to complete setup: ' + error.message });
    }
});

// Get default document types for setup UI
router.get('/default-document-types', (req, res) => {
    res.json(getDefaultDocumentTypes());
});

module.exports = router;
