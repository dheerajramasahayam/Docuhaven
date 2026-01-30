const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('../middleware/upload');

/**
 * Sanitize a string for use in filenames
 */
function sanitizeForFilename(str) {
    return str
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '')
        .trim();
}

/**
 * Generate the standard filename format: CustomerName_DocumentType_YYYY-MM-DD.ext
 */
function generateFilename(customerName, documentType, extension) {
    const sanitizedCustomer = sanitizeForFilename(customerName);
    const sanitizedDocType = sanitizeForFilename(documentType);
    const date = new Date().toISOString().split('T')[0];
    const ext = extension.startsWith('.') ? extension : `.${extension}`;

    return `${sanitizedCustomer}_${sanitizedDocType}_${date}${ext}`;
}

/**
 * Get or create customer folder
 */
function getCustomerFolder(customerId, customerName) {
    const sanitizedName = sanitizeForFilename(customerName);
    const folderName = `${customerId}_${sanitizedName}`;
    const folderPath = path.join(UPLOAD_DIR, 'customers', folderName);

    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    // Create versions subfolder
    const versionsPath = path.join(folderPath, 'versions');
    if (!fs.existsSync(versionsPath)) {
        fs.mkdirSync(versionsPath, { recursive: true });
    }

    return { folderName, folderPath, versionsPath };
}

/**
 * Move file from temp to customer folder with proper naming
 */
function moveToCustomerFolder(tempFilePath, customerId, customerName, documentType, extension) {
    const { folderPath } = getCustomerFolder(customerId, customerName);
    const filename = generateFilename(customerName, documentType, extension);
    const destPath = path.join(folderPath, filename);

    // If file exists with same name, handle versioning
    let finalFilename = filename;
    let counter = 1;
    while (fs.existsSync(path.join(folderPath, finalFilename))) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        finalFilename = `${base}_${counter}${ext}`;
        counter++;
    }

    const finalPath = path.join(folderPath, finalFilename);
    fs.renameSync(tempFilePath, finalPath);

    return {
        filename: finalFilename,
        path: finalPath,
        relativePath: path.relative(UPLOAD_DIR, finalPath)
    };
}

/**
 * Move current version to versions folder
 */
function archiveCurrentVersion(documentPath, versionNumber) {
    if (!fs.existsSync(documentPath)) {
        return null;
    }

    const dir = path.dirname(documentPath);
    const versionsDir = path.join(dir, 'versions');
    const ext = path.extname(documentPath);
    const base = path.basename(documentPath, ext);
    const versionFilename = `${base}_v${versionNumber}${ext}`;
    const versionPath = path.join(versionsDir, versionFilename);

    if (!fs.existsSync(versionsDir)) {
        fs.mkdirSync(versionsDir, { recursive: true });
    }

    fs.copyFileSync(documentPath, versionPath);

    return {
        filename: versionFilename,
        path: versionPath,
        relativePath: path.relative(UPLOAD_DIR, versionPath)
    };
}

/**
 * Delete a file
 */
function deleteFile(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
    }
    return false;
}

/**
 * Delete customer folder and all contents
 */
function deleteCustomerFolder(customerId, customerName) {
    const { folderPath } = getCustomerFolder(customerId, customerName);

    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
        return true;
    }
    return false;
}

/**
 * Get file stats
 */
function getFileStats(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return fs.statSync(filePath);
}

module.exports = {
    sanitizeForFilename,
    generateFilename,
    getCustomerFolder,
    moveToCustomerFolder,
    archiveCurrentVersion,
    deleteFile,
    deleteCustomerFolder,
    getFileStats,
    UPLOAD_DIR
};
