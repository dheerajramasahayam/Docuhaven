/**
 * Toast Notification System
 */
class Toast {
    static container = null;

    static init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    static show(message, type = 'info', duration = 4000) {
        this.init();
        const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <div class="toast-content"><span class="toast-message">${message}</span></div>
      <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;
        this.container.appendChild(toast);
        setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, duration);
    }

    static success(msg) { this.show(msg, 'success'); }
    static error(msg) { this.show(msg, 'error'); }
    static warning(msg) { this.show(msg, 'warning'); }
    static info(msg) { this.show(msg, 'info'); }
}

/**
 * Modal System
 */
class Modal {
    static show(title, content, footer = '') {
        const existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" onclick="Modal.close()">✕</button>
        </div>
        <div class="modal-body">${content}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) Modal.close(); });
        requestAnimationFrame(() => overlay.classList.add('active'));
    }

    static close() {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) { overlay.classList.remove('active'); setTimeout(() => overlay.remove(), 200); }
    }

    static confirm(title, message) {
        return new Promise(resolve => {
            const content = `<p style="color: var(--text-secondary)">${message}</p>`;
            const footer = `
        <button class="btn btn-secondary" onclick="Modal.close(); window._modalResolve(false)">Cancel</button>
        <button class="btn btn-danger" onclick="Modal.close(); window._modalResolve(true)">Confirm</button>
      `;
            window._modalResolve = resolve;
            Modal.show(title, content, footer);
        });
    }
}

window.Toast = Toast;
window.Modal = Modal;
