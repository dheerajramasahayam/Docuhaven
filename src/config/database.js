const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '../../data/fileorg.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'employee', 'viewer')) NOT NULL DEFAULT 'viewer',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Customers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      policy_number TEXT,
      custom_fields TEXT DEFAULT '{}',
      folder_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Document types table
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Documents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      document_type_id INTEGER NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      current_version INTEGER DEFAULT 1,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (document_type_id) REFERENCES document_types(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

  // Document versions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      version_number INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

  // Audit logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      entity_name TEXT,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);

  console.log('Database initialized successfully');
}

function isSetupComplete() {
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('setup_complete');
  return setting && setting.value === 'true';
}

function markSetupComplete() {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  stmt.run('setup_complete', 'true');
}

function getDefaultDocumentTypes() {
  return [
    { name: 'ID Document', description: 'Passport, National ID, Driver License' },
    { name: 'Financial Record', description: 'Bank statements, Tax documents, Invoices' },
    { name: 'Legal Contract', description: 'Agreements, Deeds, Contracts' },
    { name: 'Medical Record', description: 'Medical reports, Prescriptions' },
    { name: 'Education Certificate', description: 'Degrees, Diplomas, Transcripts' },
    { name: 'Employment Record', description: 'Offer letters, Payslips' },
    { name: 'Utility Bill', description: 'Electricity, Water, Gas bills' },
    { name: 'Correspondence', description: 'Letters, Emails, Memos' },
    { name: 'Other', description: 'Miscellaneous documents' }
  ];
}

module.exports = {
  db,
  initializeDatabase,
  isSetupComplete,
  markSetupComplete,
  getDefaultDocumentTypes
};
