const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { db } = require('../config/database');
const { logAction, ACTIONS } = require('./auditService');

// Helper to ensure directory exists
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

class BackupService {
    constructor() {
        this.isBackingUp = false;
    }

    getBackupSettings() {
        const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_config');
        return setting ? JSON.parse(setting.value) : null;
    }

    saveBackupSettings(config) {
        db.prepare(`
            INSERT INTO settings (key, value) VALUES ('backup_config', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify(config));
    }

    async createBackup(initiatedByUserId = null, initiatedByUsername = 'System') {
        if (this.isBackingUp) {
            throw new Error('Backup already in progress');
        }

        this.isBackingUp = true;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `docuhaven_backup_${timestamp}.zip`;
        const tempPath = path.join(__dirname, '../../uploads/temp', fileName);

        ensureDir(path.dirname(tempPath));

        try {
            // 1. Create ZIP
            await this.createZip(tempPath);

            // 2. Get Settings
            const config = this.getBackupSettings();
            if (!config) {
                console.warn('No backup configuration found. Backup created at temp path only.');
                return { success: true, path: tempPath, message: 'No configuration found, saved to temp' };
            }

            // 3. Save to Local Path 1
            if (config.localPath1) {
                try {
                    ensureDir(config.localPath1);
                    fs.copyFileSync(tempPath, path.join(config.localPath1, fileName));
                } catch (err) {
                    console.error('Failed to copy to Local Path 1:', err);
                }
            }

            // 4. Save to Local Path 2
            if (config.localPath2) {
                try {
                    ensureDir(config.localPath2);
                    fs.copyFileSync(tempPath, path.join(config.localPath2, fileName));
                } catch (err) {
                    console.error('Failed to copy to Local Path 2:', err);
                }
            }

            // 5. Cloud Upload (Future Implementation)
            if (config.cloudEnabled && config.cloudConfig) {
                // TODO: Implement S3/Cloud upload here
                console.log('Cloud backup skipped (not implemented yet)');
            }

            // Log Success
            if (initiatedByUserId) {
                logAction({
                    userId: initiatedByUserId,
                    username: initiatedByUsername,
                    action: 'BACKUP_CREATE',
                    entityType: 'system',
                    entityName: fileName,
                    newValues: { size: fs.statSync(tempPath).size }
                });
            }

            // Cleanup temp file
            // fs.unlinkSync(tempPath); 

            return { success: true, fileName };

        } catch (error) {
            console.error('Backup failed:', error);
            throw error;
        } finally {
            this.isBackingUp = false;
        }
    }

    createZip(outputPath) {
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => resolve());
            archive.on('error', (err) => reject(err));

            archive.pipe(output);

            // Append DB file
            const dbPath = path.join(__dirname, '../../data/fileorg.db');
            if (fs.existsSync(dbPath)) {
                archive.file(dbPath, { name: 'data/fileorg.db' });
            }

            // Append Uploads directory
            const uploadsDir = path.join(__dirname, '../../uploads');
            if (fs.existsSync(uploadsDir)) {
                archive.directory(uploadsDir, 'uploads');
            }

            // Append .env file (Optional, risky for security but needed for full restore)
            // archive.file(path.join(__dirname, '../../.env'), { name: '.env' });

            archive.finalize();
        });
    }

    // List backups from configured paths
    listBackups() {
        const config = this.getBackupSettings();
        const backups = [];

        if (!config) return [];

        [config.localPath1, config.localPath2].forEach(dir => {
            if (dir && fs.existsSync(dir)) {
                try {
                    const files = fs.readdirSync(dir).filter(f => f.startsWith('docuhaven_backup_') && f.endsWith('.zip'));
                    files.forEach(f => {
                        const stats = fs.statSync(path.join(dir, f));
                        backups.push({
                            filename: f,
                            path: path.join(dir, f),
                            size: stats.size,
                            created_at: stats.birthtime
                        });
                    });
                } catch (e) {
                    console.error(`Error reading backups from ${dir}:`, e);
                }
            }
        });

        // Sort by date desc
        return backups.sort((a, b) => b.created_at - a.created_at);
    }
}

module.exports = new BackupService();
