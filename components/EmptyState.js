/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - EmptyState Component
 * Reusable dynamic feedback / fallback canvas for empty collections, missing records, or 404 views.
 */

export class EmptyState {
  /**
   * @param {string|HTMLElement} container - Selector or element to render into
   * @param {Object} options - Configuration options
   * @param {string} options.icon - Bootstrap Icon class (default: bi-database-dash)
   * @param {string} options.title - Core header text (default: No Records Found)
   * @param {string} options.description - Explanatory subtitle
   * @param {boolean} options.glowIcon - Apply neon text shadow glow to the icon
   * @param {Object} options.action - Optional CTA button config: { label, icon, onClick }
   */
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      icon: 'bi-database-dash',
      title: 'No Ledger Records Found',
      description: 'You do not have any transaction rows registered. Fund your Web3 wallet address to get started.',
      glowIcon: true,
      action: null,
      ...options
    };
    this.render();
  }

  render() {
    if (!this.container) return;

    const glowClass = this.options.glowIcon ? 'text-glow-primary text-primary' : 'text-muted';
    
    let actionHtml = '';
    if (this.options.action && this.options.action.label && this.options.action.onClick) {
      const btnIcon = this.options.action.icon ? `<i class="bi ${this.options.action.icon}"></i>` : '';
      actionHtml = `
        <button class="btn-hfc btn-hfc-primary hover-lift mt-3 empty-state-cta">
          ${btnIcon} ${this.options.action.label}
        </button>
      `;
    }

    this.container.innerHTML = `
      <div class="card-glass rounded-lg p-0">
        <div class="state-container animate-fade-in">
          <i class="bi ${this.options.icon} state-icon ${glowClass}"></i>
          <h4 class="state-title">${this.options.title}</h4>
          <p class="state-desc">${this.options.description}</p>
          ${actionHtml}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (this.options.action && this.options.action.onClick) {
      const ctaBtn = this.container.querySelector('.empty-state-cta');
      if (ctaBtn) {
        ctaBtn.onclick = (e) => {
          e.preventDefault();
          this.options.action.onClick();
        };
      }
    }
  }

  /**
   * Quick-render an error state inside a target container
   * @param {string|HTMLElement} container 
   * @param {Object} options 
   * @param {string} options.title 
   * @param {string} options.message 
   * @param {Function} options.onRetry 
   */
  static renderError(container, options = {}) {
    const config = {
      title: 'Synchronizer Connection Failed',
      message: 'An unexpected RPC network error prevented the ledger from loading.',
      onRetry: () => window.location.reload(),
      ...options
    };

    return new EmptyState(container, {
      icon: 'bi-exclamation-octagon-fill text-danger text-glow-danger',
      title: config.title,
      description: config.message,
      glowIcon: false,
      action: {
        label: 'Retry Connection',
        icon: 'bi-arrow-clockwise',
        onClick: config.onRetry
      }
    });
  }

  /**
   * Quick-render an offline state inside a target container
   * @param {string|HTMLElement} container 
   * @param {Object} options 
   * @param {string} options.title 
   * @param {string} options.message 
   * @param {Function} options.onReconnect 
   */
  static renderOffline(container, options = {}) {
    const config = {
      title: 'Workspace Offline',
      message: 'You are currently disconnected from HFC Exchange cloud servers. Please verify your local network status.',
      onReconnect: () => window.location.reload(),
      ...options
    };

    return new EmptyState(container, {
      icon: 'bi-wifi-off text-warning text-glow-warning',
      title: config.title,
      description: config.message,
      glowIcon: false,
      action: {
        label: 'Re-authenticate Session',
        icon: 'bi-cloud-lightning',
        onClick: config.onReconnect
      }
    });
  }
}
