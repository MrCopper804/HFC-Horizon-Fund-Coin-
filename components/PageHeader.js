/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - PageHeader & Breadcrumb Component
 * Reusable layout title blocks with embedded breadcrumbs and responsive action targets.
 */

export class PageHeader {
  /**
   * @param {string|HTMLElement} container - Selector or element to render into
   * @param {Object} options - Configuration options
   * @param {string} options.title - Core page header text
   * @param {string} [options.description] - Page purpose text
   * @param {Array<Object>} [options.breadcrumbs] - Nav links: [{ label: 'Home', href: '#/' }, { label: 'Active', active: true }]
   * @param {Object} [options.action] - Right-hand side action: { label, icon, onClick }
   */
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      title: 'Dashboard Workspace',
      description: '',
      breadcrumbs: [],
      action: null,
      ...options
    };
    this.render();
  }

  render() {
    if (!this.container) return;

    // Breadcrumbs rendering
    let breadcrumbsHtml = '';
    if (this.options.breadcrumbs && this.options.breadcrumbs.length > 0) {
      const items = this.options.breadcrumbs.map((b, i) => {
        if (b.active || i === this.options.breadcrumbs.length - 1) {
          return `<li class="breadcrumb-item active text-primary" aria-current="page">${b.label}</li>`;
        }
        return `
          <li class="breadcrumb-item">
            <a href="${b.href || '#'}" class="text-decoration-none text-secondary hover-text-primary transition-fast">${b.label}</a>
          </li>
        `;
      }).join('');

      breadcrumbsHtml = `
        <nav aria-label="breadcrumb" class="mb-2">
          <ol class="breadcrumb breadcrumb-glass text-xs m-0">
            <li class="breadcrumb-item"><a href="#section-intro" class="text-decoration-none text-muted"><i class="bi bi-house-door-fill me-1"></i>Home</a></li>
            ${items}
          </ol>
        </nav>
      `;
    }

    // Action button
    let actionHtml = '';
    if (this.options.action && this.options.action.label && this.options.action.onClick) {
      const icon = this.options.action.icon ? `<i class="bi ${this.options.action.icon}"></i>` : '';
      actionHtml = `
        <button class="btn-hfc btn-hfc-primary hover-lift page-header-action mt-2 mt-md-0">
          ${icon} ${this.options.action.label}
        </button>
      `;
    }

    this.container.innerHTML = `
      <div class="d-md-flex align-items-center justify-content-between mb-4 pb-2 border-bottom border-secondary border-opacity-10 py-2 animate-fade-in">
        <div class="flex-grow-1">
          ${breadcrumbsHtml}
          <h1 class="text-display fw-bold text-white tracking-tight text-glow-primary m-0 fs-3">${this.options.title}</h1>
          ${this.options.description ? `<p class="text-muted text-sm m-0 mt-1">${this.options.description}</p>` : ''}
        </div>
        <div class="ms-md-3">
          ${actionHtml}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (this.options.action && this.options.action.onClick) {
      const btn = this.container.querySelector('.page-header-action');
      if (btn) {
        btn.onclick = (e) => {
          e.preventDefault();
          this.options.action.onClick();
        };
      }
    }
  }
}
