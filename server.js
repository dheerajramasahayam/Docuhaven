const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

const { initializeDatabase, isSetupComplete } = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Create required directories
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize database
initializeDatabase();

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for development
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/setup', require('./src/routes/setup.routes'));
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/users', require('./src/routes/users.routes'));
app.use('/api/customers', require('./src/routes/customers.routes'));
app.use('/api/documents', require('./src/routes/documents.routes'));
app.use('/api/document-types', require('./src/routes/documentTypes.routes'));
app.use('/api/audit-logs', require('./src/routes/audit.routes'));
app.use('/api/settings', require('./src/routes/settings.routes'));
app.use('/api/dashboard', require('./src/routes/dashboard.routes'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', setupComplete: isSetupComplete() });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🏰  DocuHaven - Open Source DMS                          ║
║                                                            ║
║   Server running at: http://localhost:${PORT}                 ║
║                                                            ║
║   Setup Complete: ${isSetupComplete() ? 'Yes ✓' : 'No - Visit the app to set up'}              ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
