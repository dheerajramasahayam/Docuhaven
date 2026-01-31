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
      role TEXT CHECK(role IN ('admin', 'employee', 'viewer', 'client')) NOT NULL DEFAULT 'viewer',
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
      parent_id INTEGER,
      linked_user_id INTEGER,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Migration for linked_user_id and parent_id
  try {
    const columns = db.prepare('PRAGMA table_info(customers)').all();
    const hasParentId = columns.some(c => c.name === 'parent_id');
    const hasLinkedUserId = columns.some(c => c.name === 'linked_user_id');

    if (!hasParentId) {
      console.log('Migrating: Adding parent_id to customers');
      db.exec('ALTER TABLE customers ADD COLUMN parent_id INTEGER REFERENCES customers(id) ON DELETE SET NULL');
    }
    if (!hasLinkedUserId) {
      console.log('Migrating: Adding linked_user_id to customers');
      db.exec('ALTER TABLE customers ADD COLUMN linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
    }
  } catch (err) {
    console.error('Migration error:', err);
  }

  // Migration to fix Users CHECK constraint for 'client' role
  try {
    // Check if we can insert a dummy client user (rollback transaction)
    // This is a dirty check but effective. Or we can check table_info sql.
    // Easiest is to force a schema migration if we haven't already.
    // We'll check the SQL of the table.
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql;
    if (tableSql && !tableSql.includes("'client'")) {
      console.log('Migrating: Updating users table constraints...');
      db.pragma('foreign_keys = OFF'); // Disable FKs temporarily
      db.transaction(() => {
        db.exec("ALTER TABLE users RENAME TO users_old");
        db.exec(`
                CREATE TABLE users (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE NOT NULL,
                  email TEXT UNIQUE NOT NULL,
                  password_hash TEXT NOT NULL,
                  role TEXT CHECK(role IN ('admin', 'employee', 'viewer', 'client')) NOT NULL DEFAULT 'viewer',
                  is_active INTEGER DEFAULT 1,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
              `);
        db.exec("INSERT INTO users SELECT * FROM users_old");
        db.exec("DROP TABLE users_old");
      })();
      db.pragma('foreign_keys = ON'); // Re-enable FKs
      console.log('Migration: Users table updated.');
    }

    // REPAIR: Fix broken Foreign Keys pointing to 'users_old' due to previous rename
    const TABLES_TO_REPAIR = [
      {
        name: 'customers', sql: `CREATE TABLE customers (
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
          parent_id INTEGER,
          linked_user_id INTEGER,
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (parent_id) REFERENCES customers(id) ON DELETE SET NULL,
          FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL
        )`},
      {
        name: 'documents', sql: `CREATE TABLE documents (
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
        )`},
      {
        name: 'document_versions', sql: `CREATE TABLE document_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id INTEGER NOT NULL,
          version_number INTEGER NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          uploaded_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
          FOREIGN KEY (uploaded_by) REFERENCES users(id)
        )`},
      {
        name: 'audit_logs', sql: `CREATE TABLE audit_logs (
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
        )`}
    ];

    db.pragma('foreign_keys = OFF');
    TABLES_TO_REPAIR.forEach(table => {
      const sql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table.name}'`).get()?.sql;
      if (sql && sql.includes('users_old')) {
        console.log(`Repairing FKs for table: ${table.name}`);
        db.transaction(() => {
          db.exec(`ALTER TABLE ${table.name} RENAME TO ${table.name}_broken`);
          db.exec(table.sql);
          db.exec(`INSERT INTO ${table.name} SELECT * FROM ${table.name}_broken`);
          db.exec(`DROP TABLE ${table.name}_broken`);
        })();
        console.log(`Fixed ${table.name}`);
      }
    });
    db.pragma('foreign_keys = ON');

  } catch (err) {
    console.error('User migration error:', err);
  }

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
