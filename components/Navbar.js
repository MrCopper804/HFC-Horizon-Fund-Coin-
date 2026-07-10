/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - Navbar Component
 * Reusable glassmorphic top navigation bar.
 */

export class Navbar {
  /**
   * @param {string|HTMLElement} container - The container selector or element to render into
   * @param {Object} options - Configuration options
   * @param {string} options.versionText - Version text displayed on desktop
   * @param {string} options.userEmail - Signed-in user email placeholder
   * @param {Array<Object>} options.initialNotifications - Starter list of notifications
   * @param {Function} options.onLogout - Callback function when user logs out
   */
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      versionText: 'HFC Engine v2.4',
      userEmail: 'reset12345boom@gmail.com',
      initialNotifications: [
        { id: 1, type: 'success', text: 'Deposit confirmed: 1.24 BTC' },
        { id: 2, type: 'warning', text: 'New IP address login detected.' }
      ],
      onLogout: () => console.log('Navbar logout triggered'),
      ...options
    };
    this.notifications = [...this.options.initialNotifications];
    this.render();
  }

  /**
   * Update user details in the profile dropdown
   * @param {Object} userData 
   */
  updateUser(userData) {
    if (userData.email) {
      this.options.userEmail = userData.email;
    }
    this.render();
  }

  /**
   * Add a notification dynamically
   * @param {string} text 
   * @param {string} type - 'success', 'warning', 'danger', 'info'
   */
  addNotification(text, type = 'info') {
    const newNotif = {
      id: Date.now(),
      type,
      text
    };
    this.notifications.unshift(newNotif);
    this.render();
    this.triggerPulse();
  }

  /**
   * Clear all notifications
   */
  clearNotifications() {
    this.notifications = [];
    this.render();
  }

  /**
   * Make the red notification dot pulse
   */
  triggerPulse() {
    const pulseDot = this.container.querySelector('.animate-pulse');
    if (pulseDot) {
      pulseDot.classList.add('status-pulse-primary');
      setTimeout(() => pulseDot.classList.remove('status-pulse-primary'), 3000);
    }
  }

  render() {
    if (!this.container) return;

    const notifCount = this.notifications.length;
    const hasUnread = notifCount > 0;
    const truncatedEmail = this.options.userEmail.length > 15 
      ? this.options.userEmail.substring(0, 12) + '...' 
      : this.options.userEmail;

    // Create notifications HTML
    let notificationsHtml = '';
    if (notifCount === 0) {
      notificationsHtml = `
        <div class="p-3 text-center text-xs text-muted">
          <i class="bi bi-bell-slash d-block mb-1 fs-5"></i>
          No new notifications
        </div>
      `;
    } else {
      notificationsHtml = this.notifications.map(n => {
        let icon = 'bi-info-circle-fill text-info';
        if (n.type === 'success') icon = 'bi-check-circle-fill text-success';
        if (n.type === 'warning') icon = 'bi-exclamation-triangle-fill text-warning';
        if (n.type === 'danger') icon = 'bi-x-circle-fill text-danger';

        return `
          <div class="p-2 rounded bg-white bg-opacity-5 d-flex gap-2 text-sm">
            <i class="bi ${icon} mt-0.5"></i>
            <div class="text-secondary">${n.text}</div>
          </div>
        `;
      }).join('');
    }

    this.container.innerHTML = `
      <header class="navbar-glass">
        <div class="d-flex align-items-center gap-3">
          <!-- Mobile Sidebar Trigger -->
          <button class="btn-hfc btn-hfc-icon d-lg-none" id="hfcSidebarMobileToggle">
            <i class="bi bi-list fs-4"></i>
          </button>
          <div class="text-secondary d-none d-md-flex align-items-center gap-2">
            <i class="bi bi-shield-check text-primary"></i>
            <span class="text-xs text-display uppercase letter-spacing-1 text-muted">${this.options.versionText}</span>
          </div>
        </div>

        <!-- Actions / Navigation Items -->
        <div class="d-flex align-items-center gap-3">
          
          <!-- Quick Notification Bell Dropdown -->
          <div class="dropdown">
            <button class="btn-hfc btn-hfc-icon position-relative" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-bell"></i>
              ${hasUnread ? '<span class="position-absolute top-1 start-75 translate-middle p-1 bg-danger border border-light rounded-circle animate-pulse"></span>' : ''}
            </button>
            <div class="dropdown-menu dropdown-menu-end dropdown-menu-glass p-3" style="width: 300px;">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="text-light fw-bold text-display m-0">Notifications</h6>
                ${hasUnread ? `<button class="btn btn-link text-xs p-0 text-decoration-none text-primary" id="clearNotifBtn">Clear All</button>` : ''}
              </div>
              <div class="d-flex flex-column gap-2 overflow-y-auto" style="max-height: 250px;">
                ${notificationsHtml}
              </div>
            </div>
          </div>

          <!-- Profile Dropdown -->
          <div class="dropdown">
            <button class="btn-hfc btn-hfc-secondary d-flex align-items-center gap-2" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-person-circle fs-5"></i>
              <span class="text-xs text-display d-none d-sm-inline">${truncatedEmail}</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end dropdown-menu-glass">
              <li><span class="dropdown-header text-muted text-xs text-mono text-truncate d-block" style="max-width: 180px;">${this.options.userEmail}</span></li>
              <li><hr class="dropdown-divider border-secondary border-opacity-10"></li>
              <li><a class="dropdown-item dropdown-item-glass" href="#section-cards"><i class="bi bi-wallet2 me-2"></i>My Wallets</a></li>
              <li><a class="dropdown-item dropdown-item-glass" href="#section-forms"><i class="bi bi-gear me-2"></i>Security Settings</a></li>
              <li><hr class="dropdown-divider border-secondary border-opacity-10"></li>
              <li><button class="dropdown-item dropdown-item-glass text-danger w-100 text-start" id="navLogoutBtn"><i class="bi bi-box-arrow-right me-2"></i>Log Out</button></li>
            </ul>
          </div>

        </div>
      </header>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Mobile Sidebar trigger integration
    const mobileToggle = this.container.querySelector('#hfcSidebarMobileToggle');
    if (mobileToggle) {
      mobileToggle.addEventListener('click', () => {
        const sidebar = document.getElementById('hfcSidebar');
        if (sidebar) sidebar.classList.toggle('show');
      });
    }

    // Clear notifications trigger
    const clearBtn = this.container.querySelector('#clearNotifBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Avoid closing dropdown immediately
        this.clearNotifications();
      });
    }

    // Logout button trigger
    const logoutBtn = this.container.querySelector('#navLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.options.onLogout();
      });
    }
  }
}
