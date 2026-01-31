/**
 * Main Application - DocuHaven
 */
class App {
  constructor() {
    this.currentPage = 'dashboard';
    this.user = null;
    this.init();
  }

  async init() {
    try {
      const { setupComplete } = await api.getSetupStatus();
      if (!setupComplete) { this.showSetup(); return; }
      if (!api.isAuthenticated()) { this.showLogin(); return; }
      const { user } = await api.getCurrentUser();
      this.user = user;
      this.showApp();
    } catch (e) {
      if (e.message.includes('Invalid') || e.message.includes('expired')) {
        api.logout();
        this.showLogin();
      } else {
        this.showLogin();
      }
    }
  }

  showSetup() {
    document.getElementById('app').innerHTML = this.renderSetupPage();
    this.initSetupHandlers();
  }

  showLogin() {
    document.getElementById('app').innerHTML = this.renderLoginPage();
    this.initLoginHandlers();
  }

  showApp() {
    document.getElementById('app').innerHTML = this.renderAppLayout();
    this.initAppHandlers();

    if (this.user.role === 'client' && this.user.linked_customer_id) {
      // Direct clients to their profile immediately
      this.currentPage = 'profile';
      this.navigate('profile');
    } else if (this.user.role === 'viewer' && this.currentPage === 'dashboard') {
      this.currentPage = 'customers';
      this.navigate(this.currentPage);
    } else {
      this.navigate(this.currentPage);
    }
  }

  // ============ SETUP PAGE ============
  renderSetupPage() {
    return `
      <div class="setup-container">
        <div class="setup-card fade-in-up">
          <div class="auth-logo">
            <div class="auth-logo-icon">🏰</div>
            <h1 class="auth-title">Welcome!</h1>
            <p class="auth-subtitle">Let's set up your DocuHaven</p>
          </div>
          <div class="setup-steps"><div class="setup-step active"></div><div class="setup-step"></div><div class="setup-step"></div><div class="setup-step"></div><div class="setup-step"></div></div>
          <div id="setup-content"></div>
        </div>
      </div>`;
  }

  initSetupHandlers() {
    this.setupStep = 1;
    this.setupStep = 1;
    this.setupData = {
      admin: {},
      documentTypes: [],
      customerFields: { required: ['name'], optional: ['phone', 'email', 'address', 'policy_number'], custom: [] },
      backupConfig: {}
    };
    this.renderSetupStep();
  }

  async renderSetupStep() {
    const content = document.getElementById('setup-content');
    const steps = document.querySelectorAll('.setup-step');
    steps.forEach((s, i) => {
      s.classList.remove('active', 'completed');
      if (i + 1 < this.setupStep) s.classList.add('completed');
      if (i + 1 === this.setupStep) s.classList.add('active');
    });

    if (this.setupStep === 1) {
      content.innerHTML = `
        <h3 style="margin-bottom:var(--space-4)">Create Admin Account</h3>
        <div class="form-group"><label class="form-label">Username</label><input type="text" class="form-input" id="admin-username" placeholder="admin"></div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="admin-email" placeholder="admin@example.com"></div>
        <div class="form-group"><label class="form-label">Password</label><input type="password" class="form-input" id="admin-password" placeholder="Min 6 characters"></div>
        <button class="btn btn-primary btn-full btn-lg" id="setup-next">Continue →</button>`;
      document.getElementById('setup-next').onclick = () => {
        const u = document.getElementById('admin-username').value.trim();
        const e = document.getElementById('admin-email').value.trim();
        const p = document.getElementById('admin-password').value;
        if (!u || !e || !p) { Toast.error('All fields required'); return; }
        if (p.length < 6) { Toast.error('Password min 6 chars'); return; }
        this.setupData.admin = { username: u, email: e, password: p };
        this.setupStep = 2;
        this.renderSetupStep();
      };
    } else if (this.setupStep === 2) {
      const defaults = await api.getDefaultDocumentTypes();
      content.innerHTML = `
        <h3 style="margin-bottom:var(--space-4)">Document Types</h3>
        <p style="color:var(--text-secondary);margin-bottom:var(--space-4);font-size:var(--text-sm)">Select document types for your organization:</p>
        
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-4)">
            <input type="text" id="new-type-name" class="form-input" placeholder="Add custom type..." style="flex:1">
            <button class="btn btn-secondary" id="add-type-btn">Add</button>
        </div>

        <div id="doc-types-list" style="max-height:300px;overflow-y:auto;margin-bottom:var(--space-6)">
          ${defaults.map((d, i) => `<label style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--bg-card);border-radius:var(--radius-md);margin-bottom:var(--space-2);cursor:pointer"><input type="checkbox" checked data-name="${d.name}" data-desc="${d.description || ''}" style="width:18px;height:18px"><span style="flex:1">${d.name}</span></label>`).join('')}
        </div>
        <div style="display:flex;gap:var(--space-3)">
          <button class="btn btn-secondary" id="setup-back">← Back</button>
          <button class="btn btn-primary btn-full btn-lg" id="setup-next">Continue →</button>
        </div>`;

      // Handler for adding custom types
      document.getElementById('add-type-btn').onclick = () => {
        const input = document.getElementById('new-type-name');
        const name = input.value.trim();
        if (!name) return;

        const list = document.getElementById('doc-types-list');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<label style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--bg-card);border-radius:var(--radius-md);margin-bottom:var(--space-2);cursor:pointer"><input type="checkbox" checked data-name="${name}" data-desc="Custom Type" style="width:18px;height:18px"><span style="flex:1">${name}</span></label>`;

        list.insertBefore(tempDiv.firstChild, list.firstChild); // Add to top for visibility
        input.value = '';
        input.focus();
      };

      document.getElementById('setup-back').onclick = () => { this.setupStep = 1; this.renderSetupStep(); };
      document.getElementById('setup-next').onclick = () => {
        const checked = document.querySelectorAll('#doc-types-list input:checked');
        this.setupData.documentTypes = Array.from(checked).map(c => ({ name: c.dataset.name, description: c.dataset.desc }));
        if (!this.setupData.documentTypes.length) { Toast.error('Select at least one'); return; }
        this.setupStep = 3;
        this.renderSetupStep();
      };
    } else if (this.setupStep === 3) {
      // Customer Fields Step
      content.innerHTML = `
        <h3 style="margin-bottom:var(--space-4)">Customer Fields</h3>
        <p style="color:var(--text-secondary);margin-bottom:var(--space-4);font-size:var(--text-sm)">Configure what information to collect for each customer.</p>
        
        <div class="form-group">
            <label class="form-label">Standard Fields</label>
            <div style="background:var(--bg-tertiary);padding:var(--space-3);border-radius:var(--radius-md)">
                <label style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);opacity:0.7"><input type="checkbox" checked disabled> Name (Required)</label>
                <label style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);cursor:pointer"><input type="checkbox" id="field-phone" checked> Phone Number</label>
                <label style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);cursor:pointer"><input type="checkbox" id="field-email" checked> Email Address</label>
                <label style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);cursor:pointer"><input type="checkbox" id="field-address" checked> Physical Address</label>
                <label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer"><input type="checkbox" id="field-policy" checked> Policy Number</label>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">Custom Fields</label>
            <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-2)">
                <input type="text" id="new-custom-field" class="form-input" placeholder="e.g. Tax ID" style="flex:1">
                <button class="btn btn-secondary" id="add-field-btn">Add</button>
            </div>
            <div id="custom-fields-list" style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
                ${(this.setupData.customerFields?.custom || []).map(f => `<span class="badge badge-primary" style="background:var(--primary);color:white;padding:2px 8px;border-radius:12px;font-size:12px">${f}</span>`).join('')}
            </div>
        </div>

        <div style="display:flex;gap:var(--space-3);margin-top:var(--space-6)">
          <button class="btn btn-secondary" id="setup-back">← Back</button>
          <button class="btn btn-primary btn-full btn-lg" id="setup-next">Continue →</button>
        </div>`;

      const opts = this.setupData.customerFields?.optional || ['phone', 'email', 'address', 'policy_number'];
      if (!opts.includes('phone')) document.getElementById('field-phone').checked = false;
      if (!opts.includes('email')) document.getElementById('field-email').checked = false;
      if (!opts.includes('address')) document.getElementById('field-address').checked = false;
      if (!opts.includes('policy_number')) document.getElementById('field-policy').checked = false;

      document.getElementById('add-field-btn').onclick = () => {
        const val = document.getElementById('new-custom-field').value.trim();
        if (!val) return;
        const current = this.setupData.customerFields?.custom || [];
        if (!current.includes(val)) {
          // SAVE STATE of checkboxes before re-rendering
          const optional = [];
          if (document.getElementById('field-phone').checked) optional.push('phone');
          if (document.getElementById('field-email').checked) optional.push('email');
          if (document.getElementById('field-address').checked) optional.push('address');
          if (document.getElementById('field-policy').checked) optional.push('policy_number');
          this.setupData.customerFields.optional = optional;

          this.setupData.customerFields.custom = [...current, val];
          this.renderSetupStep();
        }
      };

      document.getElementById('setup-back').onclick = () => { this.setupStep = 2; this.renderSetupStep(); };
      document.getElementById('setup-next').onclick = () => {
        const optional = [];
        if (document.getElementById('field-phone').checked) optional.push('phone');
        if (document.getElementById('field-email').checked) optional.push('email');
        if (document.getElementById('field-address').checked) optional.push('address');
        if (document.getElementById('field-policy').checked) optional.push('policy_number');

        this.setupData.customerFields.optional = optional;
        this.setupStep = 4;
        this.renderSetupStep();
      };
    } else if (this.setupStep === 4) {
      content.innerHTML = `
        <h3 style="margin-bottom:var(--space-4)">Backup Configuration</h3>
        <p style="color:var(--text-secondary);margin-bottom:var(--space-4);font-size:var(--text-sm)">Secure your data with automatic backups.</p>
        
        <div class="form-group">
            <label class="form-label">Primary Backup Path (Required)</label>
            <div style="display:flex;gap:var(--space-2)">
                <input type="text" class="form-input" id="backup-path1" placeholder="/path/to/backup/drive" value="${this.setupData.backupConfig?.localPath1 || ''}" style="flex:1">
                <button class="btn btn-secondary" id="browse-path1">📂 Browse</button>
            </div>
            <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-1)">Absolute path on the SERVER where backups will be stored.</p>
        </div>

        <div class="form-group">
            <label class="form-label">Secondary Backup Path (Recommended)</label>
            <div style="display:flex;gap:var(--space-2)">
                <input type="text" class="form-input" id="backup-path2" placeholder="/path/to/another/drive" value="${this.setupData.backupConfig?.localPath2 || ''}" style="flex:1">
                <button class="btn btn-secondary" id="browse-path2">📂 Browse</button>
            </div>
            <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-1)">A different physical drive is recommended.</p>
        </div>

        <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;gap:var(--space-2)">
                <input type="checkbox" id="cloud-enabled" ${this.setupData.backupConfig?.cloudEnabled ? 'checked' : ''}> 
                Enable Cloud Backup (Configure Later)
            </label>
        </div>

        <div style="display:flex;gap:var(--space-3)">
          <button class="btn btn-secondary" id="setup-back">← Back</button>
          <button class="btn btn-primary btn-full btn-lg" id="setup-next">Continue →</button>
        </div>`;

      document.getElementById('setup-back').onclick = () => { this.setupStep = 2; this.renderSetupStep(); };
      document.getElementById('setup-next').onclick = () => {
        const path1 = document.getElementById('backup-path1').value.trim();
        const path2 = document.getElementById('backup-path2').value.trim();
        const cloudEnabled = document.getElementById('cloud-enabled').checked;

        if (!path1) { Toast.error('Primary Backup Path is required'); return; }

        this.setupData.backupConfig = { localPath1: path1, localPath2: path2, cloudEnabled };
        this.setupStep = 5;
        this.renderSetupStep();
      };
    } else {
      content.innerHTML = `
        <h3 style="margin-bottom:var(--space-4)">Ready to Go!</h3>
        <div style="background:var(--bg-tertiary);padding:var(--space-4);border-radius:var(--radius-lg);margin-bottom:var(--space-6)">
          <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-2)"><strong>Admin:</strong> ${this.setupData.admin.username}</p>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-2)"><strong>Document Types:</strong> ${this.setupData.documentTypes.length} configured</p>
          <p style="font-size:var(--text-sm);color:var(--text-secondary)"><strong>Backups:</strong> ${this.setupData.backupConfig.localPath1 ? 'Configured' : 'Skipped'}</p>
        </div>
        <div style="display:flex;gap:var(--space-3)">
          <button class="btn btn-secondary" id="setup-back">← Back</button>
          <button class="btn btn-success btn-full btn-lg" id="setup-complete">🚀 Complete Setup</button>
        </div>`;
      document.getElementById('setup-back').onclick = () => { this.setupStep = 4; this.renderSetupStep(); };
      document.getElementById('setup-complete').onclick = async () => {
        try {
          const btn = document.getElementById('setup-complete');
          btn.disabled = true; btn.textContent = 'Setting up...';
          const result = await api.completeSetup(this.setupData);
          Toast.success('Setup complete!');
          this.user = result.user;
          this.showApp();
        } catch (e) { Toast.error(e.message); }
      };
    }
  }

  async showDirectoryBrowser(targetInputId) {
    const input = document.getElementById(targetInputId);
    let currentPath = input.value || '';

    // Create modal functionality inline for setup
    const modalHtml = `
        <div class="modal-overlay active" id="browser-modal">
            <div class="modal-container" style="max-width:600px;height:500px;display:flex;flex-direction:column">
                <div class="modal-header">
                    <h3 class="modal-title">Select Directory</h3>
                    <button class="btn btn-ghost btn-sm" id="close-browser">✕</button>
                </div>
                <div style="padding:var(--space-3);background:var(--bg-tertiary);border-bottom:1px solid var(--border-secondary)">
                    <div style="font-size:var(--text-xs);text-transform:uppercase;color:var(--text-tertiary);margin-bottom:4px">Current Path</div>
                    <div id="browser-current-path" style="font-family:monospace;font-weight:600;word-break:break-all">...</div>
                </div>
                <div id="browser-list" style="flex:1;overflow-y:auto;padding:var(--space-2)">
                    <div class="loading-spinner"></div>
                </div>
                <div class="modal-footer" style="margin-top:0;border-top:1px solid var(--border-secondary)">
                    <button class="btn btn-secondary" id="cancel-browser">Cancel</button>
                    <button class="btn btn-primary" id="select-browser">Select this Folder</button>
                </div>
            </div>
        </div>
     `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = modalHtml;
    const overlay = tempDiv.firstElementChild;
    document.body.appendChild(overlay);

    let selectedPath = '';

    const loadDir = async (path = '') => {
      const list = document.getElementById('browser-list');
      const pathDisplay = document.getElementById('browser-current-path');
      list.innerHTML = '<div class="loading-content"><div class="loading-spinner"></div></div>';

      try {
        const data = await api.browseServerFs(path);
        selectedPath = data.current;
        pathDisplay.textContent = data.current;

        list.innerHTML = '';

        // Parent directory
        if (data.parent) {
          const row = document.createElement('div');
          row.style.cssText = 'padding:var(--space-3);cursor:pointer;display:flex;align-items:center;gap:var(--space-3);border-radius:var(--radius-md);margin-bottom:4px;background:var(--bg-secondary)';
          row.innerHTML = `<span style="font-size:1.2em">🔙</span> <strong>.. (Parent Directory)</strong>`;
          row.onclick = () => loadDir(data.parent);
          list.appendChild(row);
        }

        if (data.directories.length === 0) {
          list.innerHTML += '<div style="padding:var(--space-4);text-align:center;color:var(--text-tertiary)">No subdirectories found</div>';
        } else {
          data.directories.forEach(dir => {
            const row = document.createElement('div');
            row.className = 'browser-item'; // CSS class needed or inline style
            row.style.cssText = 'padding:var(--space-3);cursor:pointer;display:flex;align-items:center;gap:var(--space-3);border-radius:var(--radius-md);margin-bottom:4px;transition:background 0.2s';
            row.innerHTML = `<span style="font-size:1.2em">📁</span> <span>${dir.name}</span>`;
            row.onmouseover = () => row.style.background = 'var(--bg-tertiary)';
            row.onmouseout = () => row.style.background = 'transparent';
            row.onclick = () => loadDir(dir.path);
            list.appendChild(row);
          });
        }

      } catch (e) {
        list.innerHTML = `<div style="color:var(--error);padding:var(--space-3)">${e.message}</div>`;
      }
    };

    // Initial load
    await loadDir(currentPath);

    const closeModal = () => overlay.remove();

    document.getElementById('close-browser').onclick = closeModal;
    document.getElementById('cancel-browser').onclick = closeModal;
    document.getElementById('select-browser').onclick = () => {
      if (selectedPath) {
        document.getElementById(targetInputId).value = selectedPath;
        // Update state too if needed, but 'setup-next' reads value so it's fine.
        // Actually, for consistency if we switch steps:
        if (targetInputId === 'backup-path1') this.setupData.backupConfig.localPath1 = selectedPath;
        if (targetInputId === 'backup-path2') this.setupData.backupConfig.localPath2 = selectedPath;
      }
      closeModal();
    };
  }

  // ============ LOGIN PAGE ============
  renderLoginPage() {
    return `
      <div class="auth-container">
        <div class="auth-card fade-in-up">
          <div class="auth-logo">
            <div class="auth-logo-icon">🏰</div>
            <h1 class="auth-title">DocuHaven</h1>
            <p class="auth-subtitle">Sign in to your account</p>
          </div>
          <form id="login-form">
            <div class="form-group"><label class="form-label">Username or Email</label><input type="text" class="form-input" id="login-username" required></div>
            <div class="form-group"><label class="form-label">Password</label><input type="password" class="form-input" id="login-password" required></div>
            <button type="submit" class="btn btn-primary btn-full btn-lg">Sign In</button>
          </form>
        </div>
      </div>`;
  }

  initLoginHandlers() {
    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      try {
        btn.disabled = true; btn.textContent = 'Signing in...';
        const { user } = await api.login(
          document.getElementById('login-username').value,
          document.getElementById('login-password').value
        );
        this.user = user;
        Toast.success(`Welcome back, ${user.username}!`);
        this.showApp();
      } catch (err) {
        Toast.error(err.message);
        btn.disabled = false; btn.textContent = 'Sign In';
      }
    };
  }

  // ============ MAIN APP LAYOUT ============
  renderAppLayout() {
    const initial = this.user.username.charAt(0).toUpperCase();
    const isAdmin = this.user.role === 'admin';
    const isClient = this.user.role === 'client';
    const isViewer = this.user.role === 'viewer';

    return `
      <div class="app-container">
        <aside class="sidebar">
          <div class="sidebar-header">
            <div class="sidebar-logo"><div class="sidebar-logo-icon">🏰</div><span class="sidebar-logo-text">DocuHaven</span></div>
          </div>
          <nav class="sidebar-nav">
            <div class="nav-section">
              <div class="nav-section-title">Main</div>
              ${!isClient && !isViewer ? `<div class="nav-item" data-page="dashboard"><span class="nav-item-icon">📊</span>Dashboard</div>` : ''}
              ${isClient
        ? `<div class="nav-item" data-page="profile"><span class="nav-item-icon">👤</span>My Profile</div>`
        : `<div class="nav-item" data-page="customers"><span class="nav-item-icon">👥</span>Customers</div>
                   <div class="nav-item" data-page="documents"><span class="nav-item-icon">📄</span>Documents</div>`
      }
            </div>
            ${isAdmin ? `
            <div class="nav-section">
              <div class="nav-section-title">Admin</div>
              <div class="nav-item" data-page="users"><span class="nav-item-icon">👤</span>Users</div>
              <div class="nav-item" data-page="doctypes"><span class="nav-item-icon">🏷️</span>Document Types</div>
              <div class="nav-item" data-page="audit"><span class="nav-item-icon">📋</span>Audit Logs</div>
              <div class="nav-item" data-page="settings"><span class="nav-item-icon">⚙️</span>Settings</div>
            </div>` : ''}
          </nav>
          <div class="sidebar-footer">
            <div class="user-info">
              <div class="user-avatar">${initial}</div>
              <div class="user-details"><div class="user-name">${this.user.username}</div><div class="user-role">${this.user.role}</div></div>
            </div>
            <button class="btn btn-ghost btn-full" style="margin-top:var(--space-3)" id="logout-btn">🚪 Sign Out</button>
          </div>
        </aside>
        <main class="main-content">
          <header class="header">
            <div class="header-left"><h1 class="page-title" id="page-title">Dashboard</h1></div>
            <div class="header-right" id="header-actions"></div>
          </header>
          <div class="page-content" id="page-content"></div>
        </main>
      </div>`;
  }

  initAppHandlers() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.onclick = () => this.navigate(item.dataset.page);
    });
    document.getElementById('logout-btn').onclick = () => {
      api.logout();
      Toast.info('Signed out');
      this.showLogin();
    };
  }

  navigate(page) {
    this.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    const titles = { dashboard: 'Dashboard', customers: 'Customers', documents: 'Documents', users: 'User Management', doctypes: 'Document Types', audit: 'Audit Logs', settings: 'Settings' };
    document.getElementById('page-title').textContent = titles[page] || page;
    this.renderPage(page);
  }

  renderPage(page) {
    const content = document.getElementById('page-content');
    const actions = document.getElementById('header-actions');
    actions.innerHTML = '';

    switch (page) {
      case 'dashboard': this.renderDashboard(content); break;
      case 'customers': this.renderCustomers(content, actions); break;
      case 'documents': this.renderDocuments(content, actions); break;
      case 'users': this.renderUsers(content, actions); break;
      case 'doctypes': this.renderDocTypes(content, actions); break;
      case 'audit': this.renderAuditLogs(content); break;
      case 'settings': this.renderSettings(content); break;
      case 'profile': this.showCustomerDetail(this.user.linked_customer_id); break;
      default: content.innerHTML = '<p>Page not found</p>';
    }
  }

  // Continued in app-pages.js
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
