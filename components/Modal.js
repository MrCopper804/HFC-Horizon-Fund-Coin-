/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - Modal Component
 * Reusable glassmorphic Modal Dialog with backdrop blur.
 */

export class Modal {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.id - The unique element ID for the modal
   * @param {string} options.title - Header title text
   * @param {string|HTMLElement} options.body - HTML content or DOM node for body
   * @param {string} options.size - Modal size: 'sm', 'md' (default), 'lg', 'xl'
   * @param {boolean} options.closeOnBackdrop - Close modal when clicking outside (default: true)
   * @param {boolean} options.closeOnEscape - Close modal when pressing Escape key (default: true)
   * @param {Array<Object>} options.buttons - Array of footer button objects: { label, class, onClick }
   */
  constructor(options = {}) {
    this.options = {
      id: `hfcModal_${Date.now()}`,
      title: 'Modal Confirmation',
      body: '<p>Standard confirmation text.</p>',
      size: 'md',
      closeOnBackdrop: true,
      closeOnEscape: true,
      buttons: [
        { label: 'Close', class: 'btn-hfc-secondary', onClick: (modal) => modal.close() }
      ],
      ...options
    };

    this.element = null;
    this.backdrop = null;
    this.boundOnEscape = this.onEscape.bind(this);
    
    // Auto-create in DOM if options are provided programmatically
    this.create();
  }

  create() {
    // If a modal with this ID already exists in DOM, bind to it instead of creating a new one
    const existing = document.getElementById(this.options.id);
    if (existing) {
      this.element = existing;
      this.bindExistingEvents();
      return;
    }

    // Determine size width setting
    let sizeWidthClass = 'width: 500px;';
    if (this.options.size === 'sm') sizeWidthClass = 'width: 350px;';
    else if (this.options.size === 'lg') sizeWidthClass = 'width: 750px;';
    else if (this.options.size === 'xl') sizeWidthClass = 'width: 950px;';

    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal fade';
    modalDiv.id = this.options.id;
    modalDiv.tabIndex = -1;
    modalDiv.style.cssText = `display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1060; ${sizeWidthClass} max-width: 95%;`;

    // Map buttons
    const buttonsHtml = this.options.buttons.map((btn, index) => {
      const cls = btn.class || 'btn-hfc-secondary';
      return `<button type="button" class="btn-hfc ${cls} text-xs btn-modal-action-${index}">${btn.label}</button>`;
    }).join('');

    const bodyContent = typeof this.options.body === 'string' 
      ? this.options.body 
      : this.options.body.outerHTML;

    modalDiv.innerHTML = `
      <div class="modal-dialog m-0 w-100">
        <div class="modal-content modal-content-glass">
          <div class="modal-header border-bottom border-secondary border-opacity-10 p-3">
            <h5 class="modal-title text-display fw-bold text-white d-flex align-items-center gap-2">
              <i class="bi bi-shield-lock-fill text-primary"></i> ${this.options.title}
            </h5>
            <button type="button" class="btn-close btn-close-white text-xs btn-modal-close" aria-label="Close"></button>
          </div>
          <div class="modal-body p-4 text-secondary text-sm">
            ${bodyContent}
          </div>
          <div class="modal-footer border-top border-secondary border-opacity-10 p-3 d-flex gap-2 justify-content-end">
            ${buttonsHtml}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalDiv);
    this.element = modalDiv;

    this.bindEvents();
  }

  bindEvents() {
    // Close button
    const closeBtn = this.element.querySelector('.btn-modal-close');
    if (closeBtn) {
      closeBtn.onclick = () => this.close();
    }

    // Action buttons
    this.options.buttons.forEach((btn, index) => {
      const btnEl = this.element.querySelector(`.btn-modal-action-${index}`);
      if (btnEl && btn.onClick) {
        btnEl.onclick = () => btn.onClick(this);
      }
    });
  }

  bindExistingEvents() {
    // Bind dismissing buttons of standard Bootstrap layouts
    const dismissers = this.element.querySelectorAll('[data-hfc-dismiss="modal"]');
    dismissers.forEach(d => {
      d.onclick = () => this.close();
    });
  }

  onEscape(e) {
    if (e.key === 'Escape' && this.options.closeOnEscape) {
      this.close();
    }
  }

  /**
   * Slide up and open the modal dialog
   */
  open() {
    if (!this.element) return;

    // Show modal
    this.element.classList.add('show');
    this.element.style.display = 'block';
    document.body.classList.add('no-scroll');

    // Create blur backdrop
    if (!document.querySelector('.modal-backdrop-blur')) {
      this.backdrop = document.createElement('div');
      this.backdrop.className = 'modal-backdrop fade show modal-backdrop-blur';
      document.body.appendChild(this.backdrop);

      if (this.options.closeOnBackdrop) {
        this.backdrop.onclick = () => this.close();
      }
    }

    if (this.options.closeOnEscape) {
      document.addEventListener('keydown', this.boundOnEscape);
    }
  }

  /**
   * Hide and dismiss the modal dialog
   */
  close() {
    if (!this.element) return;

    this.element.classList.remove('show');
    this.element.style.display = 'none';
    document.body.classList.remove('no-scroll');

    const backdropEl = document.querySelector('.modal-backdrop-blur');
    if (backdropEl) {
      backdropEl.remove();
    }

    document.removeEventListener('keydown', this.boundOnEscape);
  }

  /**
   * Completely remove from the DOM
   */
  destroy() {
    this.close();
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }

  /**
   * Spawns a programmatically generated confirmation modal dialog
   * @param {Object} options 
   * @param {string} options.title - Header title
   * @param {string} options.body - Body prompt/text
   * @param {string} [options.confirmText] - Label of positive button (default: "Confirm")
   * @param {string} [options.confirmClass] - Class for positive button (default: "btn-hfc-primary")
   * @param {string} [options.cancelText] - Label of negative button (default: "Cancel")
   * @param {Function} options.onConfirm - Callback on confirmation click (receives modalInstance)
   * @param {Function} [options.onCancel] - Callback on cancellation click/dismiss (receives modalInstance)
   * @returns {Modal}
   */
  static confirm(options = {}) {
    const config = {
      title: 'Are you sure?',
      body: '<p>Do you want to proceed with this operation?</p>',
      confirmText: 'Confirm',
      confirmClass: 'btn-hfc-primary',
      cancelText: 'Cancel',
      onConfirm: (modal) => modal.close(),
      onCancel: (modal) => modal.close(),
      ...options
    };

    const modalInstance = new Modal({
      title: config.title,
      body: config.body,
      closeOnBackdrop: false,
      buttons: [
        {
          label: config.cancelText,
          class: 'btn-hfc-secondary',
          onClick: (modal) => {
            if (config.onCancel) config.onCancel(modal);
            modal.destroy();
          }
        },
        {
          label: config.confirmText,
          class: config.confirmClass,
          onClick: (modal) => {
            if (config.onConfirm) config.onConfirm(modal);
            modal.destroy();
          }
        }
      ]
    });

    modalInstance.open();
    return modalInstance;
  }
}
