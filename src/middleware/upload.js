const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png'
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Files are temporarily stored, then moved to customer folder
        const tempDir = path.join(UPLOAD_DIR, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        // Temporary filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `temp-${uniqueSuffix}${ext}`);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(new Error(`Invalid file type. Allowed types: PDF, JPEG, PNG`), false);
    }

    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE
    },
    fileFilter: fileFilter
});

// Error handling middleware for multer
function handleUploadError(err, req, res, next) {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size exceeds 5MB limit' });
        }
        return res.status(400).json({ error: err.message });
    } else if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
}

module.exports = {
    upload,
    handleUploadError,
    UPLOAD_DIR,
    MAX_FILE_SIZE,
    ALLOWED_EXTENSIONS
};
