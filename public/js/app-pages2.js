/**
 * App Page Renderers Part 2 - Documents, Users, DocTypes, Audit
 */

// ============ DOCUMENTS ============
App.prototype.renderDocuments = async function (content, actions) {
  content.innerHTML = `
    <div class="toolbar">
      <div class="search-input-wrapper"><input type="text" class="search-input" id="doc-search" placeholder="Search documents..."></div>
      <select class="form-select" id="doc-filter-type" style="width:200px"><option value="">All Types</option></select>
    </div>
    <div id="documents-list"><div class="loading-content"><div class="loading-spinner"></div></div></div>`;

  const docTypes = await api.getDocumentTypes();
  const typeSelect = document.getElementById('doc-filter-type');
  docTypes.forEach(t => { const opt = document.createElement('option'); opt.value = t.id; opt.textContent = t.name; typeSelect.appendChild(opt); });

  const loadDocs = async (search = '', typeId = '') => {
    const params = {}; if (search) params.search = search; if (typeId) params.document_type_id = typeId;
    const { documents } = await api.getDocuments(params);
    const list = document.getElementById('documents-list');
    if (!documents.length) { list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><h3 class="empty-state-title">No documents found</h3></div>'; return; }
    list.innerHTML = `<div class="table-container"><table class="table"><thead><tr><th>Document</th><th>Customer</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>
      ${documents.map(d => `<tr>
        <td><div style="display:flex;align-items:center;gap:var(--space-2)">${getFileIcon(d.mime_type)} ${d.stored_filename}</div></td>
        <td>${d.customer_name}</td>
        <td><span class="badge badge-primary">${d.document_type_name}</span></td>
        <td>${formatBytes(d.file_size)}</td>
        <td>${formatDate(d.created_at)}</td>
        <td><a href="${api.getDocDownloadUrl(d.id)}" class="btn btn-ghost btn-sm" target="_blank">📥</a></td>
      </tr>`).join('')}</tbody></table></div>`;
  };

  loadDocs();
  let searchTimeout;
  document.getElementById('doc-search').oninput = (e) => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => loadDocs(e.target.value, typeSelect.value), 300); };
  document.getElementById('doc-filter-type').onchange = () => loadDocs(document.getElementById('doc-search').value, typeSelect.value);
};

// ============ USERS ============
App.prototype.renderUsers = async function (content, actions) {
  actions.innerHTML = '<button class="btn btn-primary" id="add-user-btn">+ Add User</button>';
  content.innerHTML = '<div id="users-list"><div class="loading-content"><div class="loading-spinner"></div></div></div>';

  const loadUsers = async () => {
    const users = await api.getUsers();
    document.getElementById('users-list').innerHTML = `<div class="table-container"><table class="table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>
      ${users.map(u => `<tr>
        <td><div style="display:flex;align-items:center;gap:var(--space-2)"><div class="user-avatar" style="width:32px;height:32px;font-size:var(--text-xs)">${u.username.charAt(0).toUpperCase()}</div>${u.username}</div></td>
        <td>${u.email}</td>
        <td><span class="badge ${u.role === 'admin' ? 'badge-primary' : u.role === 'employee' ? 'badge-success' : 'badge-secondary'}">${u.role}</span></td>
        <td><span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>${formatDate(u.created_at)}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="app.showUserModal(${JSON.stringify(u).replace(/"/g, '&quot;')})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="app.toggleUser(${u.id})">${u.is_active ? '🔒' : '🔓'}</button>
        <button class="btn btn-ghost btn-sm" onclick="app.deleteUser(${u.id})">🗑️</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  };
  loadUsers();
  document.getElementById('add-user-btn').onclick = () => this.showUserModal();
};

App.prototype.showUserModal = function (user = null) {
  const isEdit = !!user;
  Modal.show(isEdit ? 'Edit User' : 'Add User', `
    <div class="form-group"><label class="form-label">Username</label><input type="text" class="form-input" id="user-username" value="${user?.username || ''}"></div>
    <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="user-email" value="${user?.email || ''}"></div>
    <div class="form-group"><label class="form-label">Password ${isEdit ? '(leave blank to keep)' : ''}</label><input type="password" class="form-input" id="user-password"></div>
    <div class="form-group"><label class="form-label">Role</label>
      <select class="form-select" id="user-role"><option value="viewer" ${user?.role === 'viewer' ? 'selected' : ''}>Viewer</option><option value="employee" ${user?.role === 'employee' ? 'selected' : ''}>Employee</option><option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Admin</option></select>
    </div>
  `, '<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="save-user">Save</button>');

  document.getElementById('save-user').onclick = async () => {
    const data = { username: document.getElementById('user-username').value.trim(), email: document.getElementById('user-email').value.trim(), role: document.getElementById('user-role').value };
    const password = document.getElementById('user-password').value;
    if (password) data.password = password;
    if (!data.username || !data.email) { Toast.error('Username and email required'); return; }
    if (!isEdit && !password) { Toast.error('Password required'); return; }
    try {
      if (isEdit) await api.updateUser(user.id, data); else await api.createUser(data);
      Toast.success(isEdit ? 'User updated' : 'User created');
      Modal.close(); this.renderPage('users');
    } catch (e) { Toast.error(e.message); }
  };
};

App.prototype.toggleUser = async function (id) { try { await api.toggleUserActive(id); Toast.success('Status updated'); this.renderPage('users'); } catch (e) { Toast.error(e.message); } };
App.prototype.deleteUser = async function (id) { if (await Modal.confirm('Delete User?', 'This cannot be undone.')) { try { await api.deleteUser(id); Toast.success('User deleted'); this.renderPage('users'); } catch (e) { Toast.error(e.message); } } };

// ============ DOCUMENT TYPES ============
App.prototype.renderDocTypes = async function (content, actions) {
  actions.innerHTML = '<button class="btn btn-primary" id="add-doctype-btn">+ Add Type</button>';
  content.innerHTML = '<div id="doctypes-list"><div class="loading-content"><div class="loading-spinner"></div></div></div>';

  const loadTypes = async () => {
    const types = await api.getDocumentTypes(true);
    document.getElementById('doctypes-list').innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-4)">
      ${types.map(t => `<div class="card ${!t.is_active ? 'opacity-50' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-2)">
          <h4 style="font-weight:var(--font-semibold)">${t.name}</h4>
          <span class="badge ${t.is_active ? 'badge-success' : 'badge-secondary'}">${t.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-4)">${t.description || 'No description'}</p>
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn btn-ghost btn-sm" onclick='app.showDocTypeModal(${JSON.stringify(t)})'>Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="app.deleteDocType(${t.id})">Delete</button>
        </div>
      </div>`).join('')}</div>`;
  };
  loadTypes();
  document.getElementById('add-doctype-btn').onclick = () => this.showDocTypeModal();
};

App.prototype.showDocTypeModal = function (docType = null) {
  const isEdit = !!docType;
  Modal.show(isEdit ? 'Edit Document Type' : 'Add Document Type', `
    <div class="form-group"><label class="form-label">Name</label><input type="text" class="form-input" id="doctype-name" value="${docType?.name || ''}"></div>
    <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="doctype-desc" rows="2">${docType?.description || ''}</textarea></div>
    ${isEdit ? `<div class="form-group"><label style="display:flex;align-items:center;gap:var(--space-2)"><input type="checkbox" id="doctype-active" ${docType?.is_active ? 'checked' : ''}> Active</label></div>` : ''}
  `, '<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="save-doctype">Save</button>');

  document.getElementById('save-doctype').onclick = async () => {
    const data = { name: document.getElementById('doctype-name').value.trim(), description: document.getElementById('doctype-desc').value.trim() };
    if (isEdit) data.is_active = document.getElementById('doctype-active').checked;
    if (!data.name) { Toast.error('Name required'); return; }
    try {
      if (isEdit) await api.updateDocumentType(docType.id, data); else await api.createDocumentType(data);
      Toast.success(isEdit ? 'Type updated' : 'Type created');
      Modal.close(); this.renderPage('doctypes');
    } catch (e) { Toast.error(e.message); }
  };
};

App.prototype.deleteDocType = async function (id) { if (await Modal.confirm('Delete Document Type?', 'If documents exist, it will be deactivated instead.')) { try { await api.deleteDocumentType(id); Toast.success('Done'); this.renderPage('doctypes'); } catch (e) { Toast.error(e.message); } } };

// ============ AUDIT LOGS ============
App.prototype.renderAuditLogs = async function (content) {
  content.innerHTML = `
    <div class="toolbar">
      <div class="search-input-wrapper"><input type="text" class="search-input" id="audit-search" placeholder="Search logs..."></div>
    </div>
    <div id="audit-list"><div class="loading-content"><div class="loading-spinner"></div></div></div>`;

  const formatAction = (action) => {
    const map = {
      'LOGIN': 'Logged In',
      'LOGOUT': 'Logged Out',
      'DOCUMENT_UPLOAD': 'Uploaded Document',
      'DOCUMENT_DOWNLOAD': 'Downloaded Document',
      'DOCUMENT_DELETE': 'Deleted Document',
      'DOCUMENT_VIEW': 'Viewed Document',
      'USER_CREATE': 'Created User',
      'USER_UPDATE': 'Updated User',
      'USER_DELETE': 'Deleted User',
      'CUSTOMER_CREATE': 'Created Customer',
      'CUSTOMER_UPDATE': 'Updated Customer',
      'CUSTOMER_DELETE': 'Deleted Customer',
      'SETUP_COMPLETE': 'System Setup'
    };
    return map[action] || action;
  };

  const formatEntity = (type, name) => {
    if (type === 'auth') return 'System Authentication';
    if (type === 'document' && name?.includes(' - ')) {
      const parts = name.split(' - ');
      return `${parts[parts.length - 1]} <span style="color:var(--text-tertiary);font-size:0.9em">(${parts[0]})</span>`;
    }
    return name || type;
  };

  const getActionColor = (action) => {
    if (action.includes('DELETE')) return 'badge-danger';
    if (action.includes('CREATE') || action.includes('UPLOAD')) return 'badge-success';
    if (action.includes('UPDATE')) return 'badge-warning';
    return 'badge-secondary';
  };

  const loadLogs = async (search = '') => {
    const { logs } = await api.getAuditLogs({ search, limit: 100 });
    const list = document.getElementById('audit-list');
    if (!logs.length) { list.innerHTML = '<div class="empty-state"><p>No logs found</p></div>'; return; }
    list.innerHTML = `<div class="table-container"><table class="table"><thead><tr><th>Time</th><th>User</th><th>Activity</th><th>Item</th></tr></thead><tbody>
      ${logs.map(l => `<tr>
        <td style="white-space:nowrap;color:var(--text-secondary);font-size:0.9em">${formatDateTime(l.created_at)}</td>
        <td><div style="font-weight:var(--font-medium)">${l.username || 'System'}</div></td>
        <td><span class="badge ${getActionColor(l.action)}">${formatAction(l.action)}</span></td>
        <td><div style="color:var(--text-primary)">${formatEntity(l.entity_type, l.entity_name)}</div></td>
      </tr>`).join('')}</tbody></table></div>`;
  };
  loadLogs();
  let searchTimeout;
  document.getElementById('audit-search').oninput = (e) => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => loadLogs(e.target.value), 300); };
};

// ============ SETTINGS ============
App.prototype.renderSettings = async function (content) {
  content.innerHTML = `
    <div class="tabs">
      <div class="tab-item active" data-tab="backups">Backups & Restore</div>
    </div>
    <div class="tab-content" id="settings-content">
      <div class="loading-content"><div class="loading-spinner"></div></div>
    </div>`;

  const renderBackupsTab = async () => {
    const container = document.getElementById('settings-content');
    container.innerHTML = '<div class="loading-content"><div class="loading-spinner"></div></div>';

    try {
      const config = await api.getBackupConfig();
      const backups = await api.getBackups();

      container.innerHTML = `
            <div class="row" style="gap:var(--space-6)">
                <div class="col" style="flex:1">
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">Backup Configuration</h3></div>
                        <div style="padding:var(--space-4)">
                            <div class="form-group">
                                <label class="form-label">Primary Backup Path</label>
                                <input type="text" class="form-input" id="conf-path1" value="${config.localPath1 || ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Secondary Backup Path</label>
                                <input type="text" class="form-input" id="conf-path2" value="${config.localPath2 || ''}">
                            </div>
                             <div class="form-group">
                                <label class="form-label" style="display:flex;align-items:center;gap:var(--space-2)">
                                    <input type="checkbox" id="conf-cloud" ${config.cloudEnabled ? 'checked' : ''}> 
                                    Enable Cloud Backup
                                </label>
                            </div>
                            <div id="cloud-config" style="display:${config.cloudEnabled ? 'block' : 'none'};padding-left:var(--space-4);border-left:2px solid var(--border-primary);margin-bottom:var(--space-4)">
                                <div class="form-group"><label class="form-label">Cloud Provider (S3 Compatible)</label><input type="text" class="form-input" placeholder="e.g., AWS, MinIO"></div>
                                <div class="form-group"><label class="form-label">Endpoint</label><input type="text" class="form-input" placeholder="https://s3.amazonaws.com"></div>
                                <div class="form-group"><label class="form-label">Bucket Name</label><input type="text" class="form-input"></div>
                                <div class="form-group"><label class="form-label">Access Key</label><input type="text" class="form-input"></div>
                                <div class="form-group"><label class="form-label">Secret Key</label><input type="password" class="form-input"></div>
                            </div>
                            <button class="btn btn-primary" id="save-config-btn">Save Configuration</button>
                        </div>
                    </div>
                </div>
                <div class="col" style="flex:1">
                     <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Available Backups</h3>
                            <button class="btn btn-secondary btn-sm" id="run-backup-btn">Backup Now</button>
                        </div>
                        <div style="max-height:400px;overflow-y:auto">
                            ${backups.length ? `
                                <table class="table">
                                    <thead><tr><th>Date</th><th>Size</th><th>Action</th></tr></thead>
                                    <tbody>
                                        ${backups.map(b => `
                                            <tr>
                                                <td>${formatDateTime(b.created_at)}</td>
                                                <td>${formatBytes(b.size)}</td>
                                                <td>
                                                    <a href="file://${b.path}" class="btn btn-ghost btn-sm" title="Manually copy this file">📂</a>
                                                    <button class="btn btn-ghost btn-sm" onclick="Toast.info('To restore: Replace app data with contents of this zip.')">ℹ️ Restore</button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            ` : '<div class="empty-state"><p>No backups found</p></div>'}
                        </div>
                    </div>
                </div>
            </div>
        `;

      document.getElementById('conf-cloud').onchange = (e) => {
        document.getElementById('cloud-config').style.display = e.target.checked ? 'block' : 'none';
      };

      document.getElementById('save-config-btn').onclick = async () => {
        const data = {
          localPath1: document.getElementById('conf-path1').value.trim(),
          localPath2: document.getElementById('conf-path2').value.trim(),
          cloudEnabled: document.getElementById('conf-cloud').checked
        };
        try {
          await api.updateBackupConfig(data);
          Toast.success('Configuration saved');
          renderBackupsTab(); // Refresh to ensure sync
        } catch (e) { Toast.error(e.message); }
      };

      document.getElementById('run-backup-btn').onclick = async () => {
        const btn = document.getElementById('run-backup-btn');
        btn.disabled = true; btn.textContent = 'Backing up...';
        try {
          await api.runBackup();
          Toast.success('Backup completed successfully');
          renderBackupsTab();
        } catch (e) {
          Toast.error(e.message);
          btn.disabled = false; btn.textContent = 'Backup Now';
        }
      };

    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p class="text-danger">Error loading settings: ${e.message}</p></div>`;
    }
  };

  renderBackupsTab();
};
