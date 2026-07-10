/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - Toast Component
 * Reusable dynamic toast notification manager supporting actions and durations.
 */

export class Toast {
  /**
   * Instantly generate and show a premium glassmorphic toast notification
   * @param {string} message - Text inside toast
   * @param {Object} options - Configuration options
   * @param {string} options.type - 'success', 'danger', 'warning', 'info' or 'primary'
   * @param {number} options.duration - Miliseconds to show before fade out (default: 4000)
   * @param {Object} options.action - Optional action button config (e.g., { label: 'Undo', onClick: () => {} })
   */
  static show(message, options = {}) {
    const config = {
      type: 'success',
      duration: 4000,
      action: null,
      ...options
    };

    let container = document.querySelector('.toast-container-hfc');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container-hfc';
      document.body.appendChild(container);
    }

    // Determine icons & colors
    let iconClass = 'bi-check-circle-fill text-success';
    let borderColorClass = 'border-success';
    
    switch (config.type) {
      case 'danger':
        iconClass = 'bi-exclamation-triangle-fill text-danger';
        borderColorClass = 'border-danger';
        break;
      case 'warning':
        iconClass = 'bi-exclamation-circle-fill text-warning';
        borderColorClass = 'border-warning';
        break;
      case 'info':
        iconClass = 'bi-info-circle-fill text-info';
        borderColorClass = 'border-info';
        break;
      case 'primary':
        iconClass = 'bi-lightning-charge-fill text-primary';
        borderColorClass = 'border-primary';
        break;
    }

    const toast = document.createElement('div');
    toast.className = `toast-glass hover-lift border-start border-3 ${borderColorClass}`;
    
    // Action button structure
    let actionBtnHtml = '';
    if (config.action && config.action.label && config.action.onClick) {
      actionBtnHtml = `
        <button type="button" class="btn-hfc btn-hfc-primary py-1 px-2 text-xs toast-action-btn hover-lift ms-2">
          ${config.action.label}
        </button>
      `;
    }

    toast.innerHTML = `
      <i class="bi ${iconClass} fs-5 mt-1"></i>
      <div class="flex-grow-1" style="z-index: 2;">
        <div class="fw-bold text-light text-capitalize">${config.type} Notification</div>
        <div class="text-secondary text-sm mt-1">${message}</div>
      </div>
      <div class="d-flex align-items-center gap-2 ms-auto" style="z-index: 2;">
        ${actionBtnHtml}
        <button type="button" class="btn-close btn-close-white text-sm" style="font-size: 0.75rem;" aria-label="Close"></button>
      </div>
      <div class="toast-progress progress-${config.type}" style="animation-duration: ${config.duration}ms;"></div>
    `;

    // Bind action button event
    if (config.action && config.action.onClick) {
      const actionBtn = toast.querySelector('.toast-action-btn');
      if (actionBtn) {
        actionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          config.action.onClick();
          this.remove(toast);
        });
      }
    }

    // Bind close button event
    const closeBtn = toast.querySelector('.btn-close');
    closeBtn.onclick = () => {
      this.remove(toast);
    };

    container.appendChild(toast);

    // Auto dismiss
    if (config.duration > 0) {
      setTimeout(() => {
        this.remove(toast);
      }, config.duration);
    }
  }

  /**
   * Slide out and delete a specific toast element
   * @param {HTMLElement} toast 
   */
  static remove(toast) {
    if (!toast || !toast.parentNode) return;
    toast.style.animation = 'hfcToastSlideOut var(--hfc-transition-normal) forwards';
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }
}
