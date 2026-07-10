/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - Footer Component
 * Reusable glassmorphic page footer with status indicators.
 */

export class Footer {
  /**
   * @param {string|HTMLElement} container - Selector or element to render into
   * @param {Object} options - Configuration options
   * @param {string} options.companyName - Company name (default: HFC Exchange)
   * @param {Array<Object>} options.links - Footer links
   * @param {boolean} options.showTelemetry - Whether to display connection speed/status
   */
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      companyName: 'HFC Exchange Ltd.',
      links: [
        { label: 'Privacy Policy', href: '#' },
        { label: 'Terms of Service', href: '#' },
        { label: 'Escrow Security Guidelines', href: '#' },
        { label: 'Developer API', href: '#' }
      ],
      showTelemetry: true,
      ...options
    };
    this.render();
  }

  /**
   * Set server status programmatically
   * @param {string} status - 'online', 'maintenance', 'offline'
   * @param {number} ping - Latency in ms
   */
  setSystemStatus(status, ping) {
    const statusDot = this.container.querySelector('#footerStatusDot');
    const statusText = this.container.querySelector('#footerStatusText');
    
    if (statusDot && statusText) {
      if (status === 'online') {
        statusDot.className = 'status-pulse-success rounded-circle bg-success';
        statusText.innerHTML = `All systems operational <span class="text-primary text-mono">(${ping}ms)</span>`;
      } else if (status === 'maintenance') {
        statusDot.className = 'status-pulse-warning rounded-circle bg-warning';
        statusText.textContent = 'Scheduled Maintenance';
      } else {
        statusDot.className = 'status-pulse-danger rounded-circle bg-danger';
        statusText.textContent = 'Disconnected';
      }
    }
  }

  render() {
    if (!this.container) return;

    const currentYear = new Date().getFullYear();
    const linksHtml = this.options.links.map(l => {
      return `<li><a href="${l.href}" class="text-secondary text-decoration-none hover-glow-text text-xs">${l.label}</a></li>`;
    }).join('');

    const telemetryHtml = this.options.showTelemetry ? `
      <div class="d-flex align-items-center gap-2">
        <div class="status-pulse-success rounded-circle bg-success" id="footerStatusDot" style="width: 8px; height: 8px;"></div>
        <span class="text-muted text-xs text-mono" id="footerStatusText">All systems operational <span class="text-primary">(24ms)</span></span>
      </div>
    ` : '';

    this.container.innerHTML = `
      <footer class="footer-glass mt-5 py-4 px-4 rounded-lg">
        <div class="row align-items-center g-3">
          <!-- Logo & Copyright Section -->
          <div class="col-md-6 text-center text-md-start">
            <span class="text-display fw-bold text-white text-xs tracking-wider uppercase">HFC EXCHANGE</span>
            <p class="text-muted text-xs mt-1 mb-0">&copy; ${currentYear} ${this.options.companyName} All rights reserved.</p>
          </div>

          <!-- Links Section -->
          <div class="col-md-6">
            <div class="d-flex flex-column flex-md-row align-items-center justify-content-md-end gap-3">
              <ul class="d-flex flex-wrap justify-content-center gap-3 list-unstyled mb-0">
                ${linksHtml}
              </ul>
              ${telemetryHtml}
            </div>
          </div>
        </div>
      </footer>
    `;
  }
}
