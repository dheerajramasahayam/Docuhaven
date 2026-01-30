/**
 * API Client for DocuHaven
 */
const API_BASE = '/api';

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('token');
    }

    setToken(token) {
        this.token = token;
        token ? localStorage.setItem('token', token) : localStorage.removeItem('token');
    }

    isAuthenticated() { return !!this.token; }

    async request(endpoint, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        if (options.body && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Request failed');
        return data;
    }

    // Setup
    getSetupStatus() { return this.request('/setup/status'); }
    completeSetup(data) { return this.request('/setup/complete', { method: 'POST', body: data }); }
    getDefaultDocumentTypes() { return this.request('/setup/default-document-types'); }

    // Auth
    async login(username, password) {
        const data = await this.request('/auth/login', { method: 'POST', body: { username, password } });
        if (data.token) this.setToken(data.token);
        return data;
    }
    getCurrentUser() { return this.request('/auth/me'); }
    changePassword(current, newPass) { return this.request('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: newPass } }); }
    logout() { this.setToken(null); }

    // Users
    getUsers() { return this.request('/users'); }
    createUser(data) { return this.request('/users', { method: 'POST', body: data }); }
    updateUser(id, data) { return this.request(`/users/${id}`, { method: 'PUT', body: data }); }
    toggleUserActive(id) { return this.request(`/users/${id}/toggle-active`, { method: 'PATCH' }); }
    deleteUser(id) { return this.request(`/users/${id}`, { method: 'DELETE' }); }

    // Customers
    getCustomers(params = {}) { return this.request(`/customers?${new URLSearchParams(params)}`); }
    getCustomer(id) { return this.request(`/customers/${id}`); }
    createCustomer(data) { return this.request('/customers', { method: 'POST', body: data }); }
    updateCustomer(id, data) { return this.request(`/customers/${id}`, { method: 'PUT', body: data }); }
    deleteCustomer(id) { return this.request(`/customers/${id}`, { method: 'DELETE' }); }

    // Documents
    getDocuments(params = {}) { return this.request(`/documents?${new URLSearchParams(params)}`); }
    getDocument(id) { return this.request(`/documents/${id}`); }
    uploadDocument(customerId, docTypeId, file) {
        const formData = new FormData();
        formData.append('customer_id', customerId);
        formData.append('document_type_id', docTypeId);
        formData.append('file', file);
        return this.request('/documents/upload', { method: 'POST', body: formData });
    }
    deleteDocument(id) { return this.request(`/documents/${id}`, { method: 'DELETE' }); }
    getDocDownloadUrl(id) { return `${API_BASE}/documents/${id}/download?token=${this.token}`; }
    getDocViewUrl(id) { return `${API_BASE}/documents/${id}/view?token=${this.token}`; }

    // Document Types
    getDocumentTypes(inactive = false) { return this.request(`/document-types${inactive ? '?includeInactive=true' : ''}`); }
    createDocumentType(data) { return this.request('/document-types', { method: 'POST', body: data }); }
    updateDocumentType(id, data) { return this.request(`/document-types/${id}`, { method: 'PUT', body: data }); }
    deleteDocumentType(id) { return this.request(`/document-types/${id}`, { method: 'DELETE' }); }

    // Audit & Dashboard
    getAuditLogs(params = {}) { return this.request(`/audit-logs?${new URLSearchParams(params)}`); }
    getDashboardStats() { return this.request('/dashboard/stats'); }
    getSettings() { return this.request('/settings'); }
    updateSetting(key, value) { return this.request(`/settings/${key}`, { method: 'PUT', body: { value } }); }
}

window.api = new ApiClient();
