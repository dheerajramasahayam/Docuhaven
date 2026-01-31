/**
 * App Page Renderers - Dashboard, Customers, Documents, Users, DocTypes, Audit
 */

// Helper functions
function formatDate(d) { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatDateTime(d) { return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }
function formatBytes(b) { if (!b) return '0 B'; const k = 1024, s = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + s[i]; }
function getFileIcon(mime) { return mime?.includes('pdf') ? '📕' : '🖼️'; }
function getInitials(name) { return name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??'; }

// ============ DASHBOARD ============
// ============ DASHBOARD ============
App.prototype.renderDashboard = async function (content) {
  content.innerHTML = '<div class="loading-content"><div class="loading-spinner"></div><p class="loading-text">Loading dashboard...</p></div>';
  try {
    const data = await api.getDashboardStats();

    if (data.role === 'admin') {
      const stats = data.stats;
      content.innerHTML = `
        <div class="stats-grid stagger-children">
          <div class="stat-card"><div class="stat-icon primary">👥</div><div class="stat-content"><div class="stat-value">${stats.totalCustomers}</div><div class="stat-label">Total Customers</div></div></div>
          <div class="stat-card"><div class="stat-icon secondary">📄</div><div class="stat-content"><div class="stat-value">${stats.totalDocuments}</div><div class="stat-label">Total Documents</div></div></div>
          <div class="stat-card"><div class="stat-icon accent">📤</div><div class="stat-content"><div class="stat-value">${stats.documentsToday}</div><div class="stat-label">Uploaded Today</div></div></div>
          <div class="stat-card"><div class="stat-icon success">💾</div><div class="stat-content"><div class="stat-value">${stats.totalStorageMB} MB</div><div class="stat-label">Storage Used</div></div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6)">
          <div class="card">
            <div class="card-header"><h3 class="card-title">Documents by Type</h3></div>
            <div>${stats.documentsByType.length ? stats.documentsByType.slice(0, 8).map(d => `
              <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border-secondary)">
                <span style="color:var(--text-secondary)">${d.name}</span>
                <span style="font-weight:600">${d.count}</span>
              </div>`).join('') : '<p style="color:var(--text-tertiary)">No documents yet</p>'}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3 class="card-title">Recent Activity</h3></div>
            <div>${stats.recentActivity.length ? stats.recentActivity.slice(0, 6).map(a => `
              <div class="activity-item">
                <div class="activity-icon">📝</div>
                <div class="activity-content">
                  <div class="activity-text"><strong>${a.username || 'System'}</strong> ${a.action.toLowerCase().replace(/_/g, ' ')} ${a.entity_name || ''}</div>
                  <div class="activity-time">${formatDate(a.created_at)}</div>
                </div>
              </div>`).join('') : '<p style="color:var(--text-tertiary)">No activity yet</p>'}
            </div>
          </div>
        </div>`;
    } else if (data.role === 'employee') {
      const customers = data.recentCustomers;
      content.innerHTML = `
        <div class="card">
          <div class="card-header"><h3 class="card-title">My Recent Customers</h3></div>
          ${customers.length ? `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--space-4)" class="stagger-children">
            ${customers.map(c => `
              <div class="customer-card" data-id="${c.id}" onclick="app.showCustomerDetail(${c.id})">
                <div class="customer-card-header">
                  <div class="customer-avatar">${c.name.charAt(0).toUpperCase()}</div>
                  <div><div class="customer-name">${c.name}</div><div class="customer-policy">${c.policy_number || 'No policy'}</div></div>
                </div>
                <div class="customer-stats">
                  <div class="customer-stat">📞 ${c.phone || 'No phone'}</div>
                  <div class="customer-stat">📅 Added ${formatDate(c.created_at)}</div>
                </div>
              </div>`).join('')}
          </div>` : '<div class="empty-state"><div class="empty-state-icon">👥</div><p>You haven\'t added any customers yet.</p></div>'}
        </div>`;
    } else {
      // Viewer or other
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👋</div>
          <h3 class="empty-state-title">Welcome to DocuHaven</h3>
          <p class="empty-state-text">Select an option from the sidebar to get started.</p>
        </div>`;
    }
  } catch (e) { content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>${e.message}</p></div>`; }
};

// ============ CUSTOMERS ============
// ============ CUSTOMERS ============
App.prototype.renderCustomers = async function (content, actions) {
  actions.innerHTML = '<button class="btn btn-primary" id="add-customer-btn">+ Add Customer</button>';
  content.innerHTML = `
    <div class="toolbar">
      <div class="search-input-wrapper"><input type="text" class="search-input" id="cust-search" placeholder="Search customers..."></div>
    </div>
    <div id="customers-list"><div class="loading-content"><div class="loading-spinner"></div></div></div>`;

  const loadCustomers = async (search = '') => {
    // Only fetch root parents (parent_id=null) if no search, otherwise search all to find matches
    const params = { search };
    if (!search) params.parent_id = 'null';

    const { customers } = await api.getCustomers(params);
    const list = document.getElementById('customers-list');

    if (!customers.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><h3 class="empty-state-title">No customers found</h3></div>';
      return;
    }

    list.innerHTML = `<div class="table-container"><table class="table">
      <thead><tr><th>Name</th><th>Email / Phone</th><th>Documents</th><th>Portal</th><th>Actions</th></tr></thead>
      <tbody>
        ${customers.map(c => renderCustomerRow(c)).join('')}
      </tbody></table></div>`;

    // Attach event listeners for expanders
    document.querySelectorAll('.expand-family-btn').forEach(btn => {
      btn.onclick = (e) => toggleChildren(e.target.closest('tr'), btn.dataset.id);
    });
  };

  const renderCustomerRow = (c, level = 0) => {
    const padding = level * 20;
    // We assume root nodes *might* have children, so we show expander if level 0.
    // Ideally backend tells us `has_children`. For now, always show expander for roots unless we know otherwise.
    const showExpander = !c.parent_id;

    return `<tr id="row-${c.id}" data-level="${level}">
      <td>
        <div style="display:flex;align-items:center;padding-left:${padding}px;gap:var(--space-2)">
           ${showExpander ? `<button class="btn btn-ghost btn-xs expand-family-btn" data-id="${c.id}" style="width:20px;height:20px;padding:0;line-height:1">▶</button>` : ''}
           ${c.parent_id ? '↳ ' : ''}<div class="customer-avatar" style="width:32px;height:32px;font-size:var(--text-xs)">${getInitials(c.name)}</div>
           <div>
             <div style="font-weight:var(--font-medium)">${c.name}</div>
             <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${c.policy_number || 'No Policy #'}</div>
           </div>
        </div>
      </td>
      <td><div>${c.email || '-'}</div><div style="font-size:var(--text-xs);color:var(--text-tertiary)">${c.phone || '-'}</div></td>
      <td><span class="badge ${c.document_count > 0 ? 'badge-primary' : 'badge-secondary'}">${c.document_count} Docs</span></td>
      <td>
        ${c.linked_username
        ? `<div style="display:flex;gap:4px;align-items:center">
             <span class="badge badge-success" title="Linked to user: ${c.linked_username}">Active</span>
             <button class="btn btn-ghost btn-xs" title="Copy Login Link" onclick="app.copyPortalLink()">🔗</button>
             <button class="btn btn-ghost btn-xs" title="Disable Access" onclick="app.disablePortal(${c.id})">🚫</button>
           </div>`
        : `<button class="btn btn-xs btn-outline-primary" onclick="app.enablePortal(${c.id})">Enable</button>`
      }
      </td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="app.showCustomerDetail(${c.id})">View</button>
        <button class="btn btn-ghost btn-sm" onclick='app.showCustomerModal(${JSON.stringify(c).replace(/"/g, '&quot;')})'>Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="app.deleteCustomer(${c.id})">🗑️</button>
      </td>
    </tr>`;
  };

  const toggleChildren = async (row, parentId) => {
    const btn = row.querySelector('.expand-family-btn');
    if (btn.textContent === '▼') {
      // Collapse
      btn.textContent = '▶';
      let next = row.nextElementSibling;
      while (next && next.dataset.level > row.dataset.level) {
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
      }
    } else {
      // Expand
      const icon = btn.textContent;
      btn.textContent = '...';
      try {
        const { customers: children } = await api.getCustomers({ parent_id: parentId });
        btn.textContent = '▼';
        if (children.length === 0) return;

        const html = children.map(child => renderCustomerRow(child, parseInt(row.dataset.level) + 1)).join('');
        row.insertAdjacentHTML('afterend', html);

        // No listeners needed for children in this 2-level depth (assuming max 2 for Family: Head -> Member)
        // If we want infinite recursion, we'd need to re-attach listeners for new rows.
        // For Insurance/Client Family, 2 levels (Head -> Members) is strictly sufficient 99% of cases.
      } catch (e) {
        console.error(e);
        btn.textContent = icon;
      }
    }
  };

  loadCustomers();
  let searchTimeout;
  document.getElementById('cust-search').oninput = (e) => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => loadCustomers(e.target.value), 300); };
  document.getElementById('add-customer-btn').onclick = () => this.showCustomerModal();
};

App.prototype.enablePortal = async function (id) {
  if (await Modal.confirm('Enable Portal Access?', 'This will allow the customer to log in and view/upload files. They cannot delete files.')) {
    try {
      const res = await api.createPortalAccess(id);
      await Modal.alert('Access Granted', `
                <p>Portal access created for <strong>${res.email}</strong></p>
                <div style="background:var(--bg-tertiary);padding:var(--space-3);border-radius:var(--radius-md);margin-top:var(--space-2)">
                    <p><strong>Username:</strong> ${res.username}</p>
                    <p><strong>Password:</strong> ${res.tempPassword}</p>
                </div>
                <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:var(--space-2)">Please copy these credentials and send them to the customer securely.</p>
            `);
      this.renderPage('customers');
    } catch (e) {
      console.error(e);
      Toast.error(e.message || 'Failed to enable portal access');
    }
  }
};

App.prototype.disablePortal = async function (id) {
  if (await Modal.confirm('Disable Portal Access?', 'This will revoke login access for this customer. Their user account will be deactivated.')) {
    try {
      await api.disablePortalAccess(id);
      Toast.success('Portal access disabled');
      this.renderPage('customers');
    } catch (e) {
      console.error(e);
      Toast.error(e.message || 'Failed to disable portal');
    }
  }
};

App.prototype.copyPortalLink = function () {
  const url = window.location.origin;
  navigator.clipboard.writeText(url).then(() => Toast.success('Portal Login Link Copied'));
};

App.prototype.showCustomerModal = function (customer = null, parentId = null) {
  const isEdit = !!customer;
  Modal.show(isEdit ? 'Edit Customer' : (parentId ? 'Add Family Member' : 'Add Customer'), `
    <div class="form-group"><label class="form-label">Name ${parentId ? '(Spouse/Child)' : ''}</label><input type="text" class="form-input" id="cust-name" value="${customer?.name || ''}"></div>
    <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="cust-email" value="${customer?.email || ''}"></div>
    <div class="form-group"><label class="form-label">Phone</label><input type="text" class="form-input" id="cust-phone" value="${customer?.phone || ''}"></div>
    <div class="form-group"><label class="form-label">Policy Number</label><input type="text" class="form-input" id="cust-policy" value="${customer?.policy_number || ''}"></div>
    <div class="form-group"><label class="form-label">Address</label><textarea class="form-textarea" id="cust-address">${customer?.address || ''}</textarea></div>
  `, '<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="save-cust">Save</button>');

  document.getElementById('save-cust').onclick = async () => {
    const data = {
      name: document.getElementById('cust-name').value.trim(),
      email: document.getElementById('cust-email').value.trim(),
      phone: document.getElementById('cust-phone').value.trim(),
      policy_number: document.getElementById('cust-policy').value.trim(),
      address: document.getElementById('cust-address').value.trim(),
      parent_id: parentId // New logic
    };
    if (!data.name) { Toast.error('Name required'); return; }
    try {
      if (isEdit) await api.updateCustomer(customer.id, data); else await api.createCustomer(data);
      Toast.success(isEdit ? 'Updated' : 'Created');
      Modal.close();
      if (parentId) {
        this.showCustomerDetail(parentId); // Refresh parent details
      } else {
        this.renderPage('customers');
      }
    } catch (e) { Toast.error(e.message); }
  };
};

App.prototype.showCustomerDetail = async function (id) {
  const content = document.getElementById('page-content');
  content.innerHTML = '<div class="loading-content"><div class="loading-spinner"></div></div>';
  try {
    const customer = await api.getCustomer(id);
    const docTypes = await api.getDocumentTypes();

    // Permission Logic
    const isClient = this.user.role === 'client';
    const canEdit = this.user.role !== 'viewer';
    const canDelete = ['admin', 'employee'].includes(this.user.role);

    content.innerHTML = `
      ${!isClient ? '<div style="margin-bottom:var(--space-6)"><button class="btn btn-ghost" id="back-btn">← Back to Customers</button></div>' : ''}
      <div class="card" style="margin-bottom:var(--space-6)">
        <div style="display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-4)">
          <div class="customer-avatar" style="width:64px;height:64px;font-size:var(--text-2xl)">${customer.name.charAt(0).toUpperCase()}</div>
          <div>
            <h2 style="font-size:var(--text-2xl);font-weight:var(--font-bold)">${customer.name}</h2>
            <p style="color:var(--text-secondary)">${customer.policy_number || 'No policy number'}</p>
          </div>
          <div style="margin-left:auto;display:flex;gap:var(--space-2)">
            ${canEdit ? '<button class="btn btn-secondary" id="edit-cust">Edit Profile</button>' : ''}
            ${canDelete ? '<button class="btn btn-danger" id="delete-cust">Delete</button>' : ''}
          </div>
        </div>
        </div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:var(--space-6)">
           <div class="card">
               <div style="padding:var(--space-4)">
                   <h4 style="margin-top:0;color:var(--text-secondary);font-size:var(--text-sm);text-transform:uppercase">Contact Info</h4>
                   <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
                       <div><label class="form-label">Email</label><div>${customer.email || '-'}</div></div>
                       <div><label class="form-label">Phone</label><div>${customer.phone || '-'}</div></div>
                       <div><label class="form-label">Policy #</label><div>${customer.policy_number || '-'}</div></div>
                       <div><label class="form-label">Address</label><div>${customer.address || '-'}</div></div>
                       ${customer.parent_name ? `<div><label class="form-label">Head of Family</label><div><a href="#" onclick="app.showCustomerDetail(${customer.parent_id})">${customer.parent_name}</a></div></div>` : ''}
                   </div>
               </div>
           </div>
           
           <div class="card">
             <div class="card-header"><h3 class="card-title">Family / Sub-Accounts</h3></div>
             <div style="padding:var(--space-4)">
                ${customer.children && customer.children.length ? `
                    <ul style="list-style:none;padding:0;margin:0">
                        ${customer.children.map(child => `
                            <li style="padding:var(--space-2) 0;border-bottom:1px solid var(--border-secondary);display:flex;justify-content:space-between;align-items:center">
                                <span>${child.name}</span>
                                <button class="btn btn-ghost btn-xs" onclick="app.showCustomerDetail(${child.id})">View</button>
                            </li>
                        `).join('')}
                    </ul>
                ` : '<p style="color:var(--text-tertiary);font-size:var(--text-sm)">No linked accounts</p>'}
                ${canEdit ? `<button class="btn btn-secondary btn-sm btn-full" style="margin-top:var(--space-4)" onclick='app.showCustomerModal(null, ${customer.id})'>+ Add Family Member</button>` : ''}
             </div>
           </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Documents (${customer.documents?.length || 0})</h3>
          ${canEdit ? '<button class="btn btn-primary btn-sm" id="upload-doc-btn">+ Upload</button>' : ''}
        </div>
        <div id="customer-docs">
          ${(() => {
        const groups = [];
        // Self
        const selfDocs = customer.documents?.filter(d => d.customer_id === customer.id) || [];
        groups.push({ name: isClient ? 'My Documents' : customer.name, docs: selfDocs });

        // Children
        if (customer.children) {
          customer.children.forEach(c => {
            const childDocs = customer.documents?.filter(d => d.customer_id === c.id) || [];
            groups.push({ name: c.name, docs: childDocs });
          });
        }

        return groups.map(g => `
                <div class="doc-group" style="margin-bottom:var(--space-4)">
                    <h4 style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-2);text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--border-secondary);padding-bottom:var(--space-1)">${g.name} (${g.docs.length})</h4>
                    ${g.docs.length ? g.docs.map(d => `
                      <div class="document-item">
                        <div class="document-icon ${d.mime_type?.includes('pdf') ? 'pdf' : 'image'}">${getFileIcon(d.mime_type)}</div>
                        <div class="document-info">
                          <div class="document-name">${d.stored_filename}</div>
                          <div class="document-meta">${d.document_type_name} • ${formatBytes(d.file_size)} • v${d.current_version}</div>
                        </div>
                        <div class="document-actions">
                          <button class="btn btn-ghost btn-sm" onclick="app.showDocumentViewer(${d.id}, '${d.stored_filename}', '${d.mime_type || 'application/pdf'}')">👁️</button>
                          <button class="btn btn-ghost btn-sm" onclick="app.downloadDocument(${d.id}, '${d.stored_filename}')">📥</button>
                          ${canDelete ? `<button class="btn btn-ghost btn-sm" onclick="app.deleteDocument(${d.id}, ${id})">🗑️</button>` : ''}
                        </div>
                      </div>`).join('')
            : '<div style="padding:var(--space-3);color:var(--text-tertiary);font-style:italic;font-size:var(--text-sm)">No documents uploaded</div>'}
                </div>
            `).join('');
      })()}
        </div>
      </div>`;

    if (!isClient) document.getElementById('back-btn').onclick = () => this.renderPage('customers');

    if (canEdit) {
      document.getElementById('edit-cust').onclick = () => this.showCustomerModal(customer);
      document.getElementById('upload-doc-btn').onclick = () => this.showUploadModal(customer, docTypes);
    }

    if (canDelete) {
      document.getElementById('delete-cust').onclick = async () => {
        if (await Modal.confirm('Delete Customer?', 'This will delete the customer and all documents.')) {
          await api.deleteCustomer(id);
          Toast.success('Customer deleted');
          this.renderPage('customers');
        }
      };
    }
  } catch (e) { Toast.error(e.message); this.renderPage('customers'); }
};

App.prototype.showUploadModal = function (customer, docTypes) {
  Modal.show('Upload Document', `
    <div class="form-group"><label class="form-label">Document Type</label>
      <select class="form-select" id="upload-doctype">${docTypes.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select>
    </div>
    <div class="upload-zone" id="upload-zone">
      <div class="upload-zone-icon">📁</div>
      <div class="upload-zone-title">Drop file or click to browse</div>
      <div class="upload-zone-formats">PDF, JPEG, PNG • Max 5MB</div>
      <input type="file" id="file-input" accept=".pdf,.jpg,.jpeg,.png" style="display:none">
    </div>
    <div id="file-preview" style="margin-top:var(--space-4);display:none"></div>
  `, '<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="upload-submit" disabled>Upload</button>');

  const zone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const preview = document.getElementById('file-preview');
  const submitBtn = document.getElementById('upload-submit');
  let selectedFile = null;

  zone.onclick = () => fileInput.click();
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
  zone.ondragleave = () => zone.classList.remove('dragover');
  zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); };
  fileInput.onchange = () => handleFile(fileInput.files[0]);

  function handleFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { Toast.error('File too large (max 5MB)'); return; }
    selectedFile = file;
    preview.style.display = 'block';
    preview.innerHTML = `<div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--bg-tertiary);border-radius:var(--radius-md)">
      <span style="font-size:var(--text-xl)">${file.type.includes('pdf') ? '📕' : '🖼️'}</span>
      <div><div style="font-weight:500">${file.name}</div><div style="font-size:var(--text-xs);color:var(--text-tertiary)">${formatBytes(file.size)}</div></div>
    </div>`;
    submitBtn.disabled = false;
  }

  submitBtn.onclick = async () => {
    if (!selectedFile) return;
    submitBtn.disabled = true; submitBtn.textContent = 'Uploading...';
    try {
      await api.uploadDocument(customer.id, document.getElementById('upload-doctype').value, selectedFile);
      Toast.success('Document uploaded');
      Modal.close();
      this.showCustomerDetail(customer.id);
    } catch (e) { Toast.error(e.message); submitBtn.disabled = false; submitBtn.textContent = 'Upload'; }
  };
};

App.prototype.deleteDocument = async function (docId, customerId) {
  if (await Modal.confirm('Delete Document?', 'This action cannot be undone.')) {
    await api.deleteDocument(docId);
    Toast.success('Document deleted');
    this.showCustomerDetail(customerId);
  }
};

// Document Viewer for live preview
App.prototype.showDocumentViewer = function (docId, filename, mimeType) {
  const viewUrl = api.getDocViewUrl(docId);
  const downloadUrl = api.getDocDownloadUrl(docId);
  const isPdf = mimeType.includes('pdf');
  const isImage = mimeType.includes('image') || mimeType.includes('jpeg') || mimeType.includes('png');

  let viewerContent;
  if (isPdf) {
    viewerContent = `<iframe src="${viewUrl}" style="width:100%;height:70vh;border:none;border-radius:var(--radius-md)"></iframe>`;
  } else if (isImage) {
    viewerContent = `<img src="${viewUrl}" style="max-width:100%;max-height:70vh;display:block;margin:0 auto;border-radius:var(--radius-md)" alt="${filename}">`;
  } else {
    viewerContent = `<div class="empty-state"><p>Preview not available</p><a href="${downloadUrl}" class="btn btn-primary" download>Download</a></div>`;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.cssText = 'background:rgba(0,0,0,0.85)';
  overlay.innerHTML = `
    <div style="width:90%;max-width:1000px;background:var(--bg-secondary);border-radius:var(--radius-xl);overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-4) var(--space-5);border-bottom:1px solid var(--border-primary)">
        <div>
          <h3 style="font-size:var(--text-base);font-weight:var(--font-semibold);color:var(--text-primary)">${filename}</h3>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary)">${isPdf ? 'PDF Document' : 'Image'}</span>
        </div>
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn btn-secondary btn-sm" onclick="app.downloadDocument(${docId}, '${filename}')">📥 Download</button>
          <button class="btn btn-ghost btn-sm" id="close-viewer">✕</button>
        </div>
      </div>
      <div style="padding:var(--space-4);background:var(--bg-tertiary)">${viewerContent}</div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#close-viewer').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
};

// Download document with proper authentication
App.prototype.downloadDocument = function (docId, filename) {
  // Backend now supports token in query param and sets Content-Disposition: attachment
  // so we can just navigate to the URL.
  const url = api.getDocDownloadUrl(docId);
  window.location.href = url;
};
