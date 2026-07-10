/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - Sidebar Component
 * Reusable glassmorphic sidebar menu.
 */

export class Sidebar {
  /**
   * @param {string|HTMLElement} container - Container element or selector to render into
   * @param {Object} options - Sidebar options
   * @param {string} options.brandName - The brand signature text
   * @param {Array<Object>} options.menuItems - Array of menu configuration objects
   * @param {string} options.activeId - The currently selected menu item ID
   * @param {Function} options.onNavigate - Callback function when a menu link is clicked
   */
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      brandName: 'HFC EXCHANGE',
      menuItems: [
        { id: 'intro', label: 'Introduction', icon: 'bi-compass', href: '#section-intro' },
        { id: 'tokens', label: 'Design Tokens', icon: 'bi-palette', href: '#section-tokens' },
        { id: 'typography', label: 'Typography', icon: 'bi-type', href: '#section-typography' },
        { id: 'icons', label: 'Icon Mapping', icon: 'bi-lightning-charge', href: '#section-icons' },
        { id: 'buttons', label: 'Buttons & Badges', icon: 'bi-menu-button-wide', href: '#section-buttons' },
        { id: 'cards', label: 'Card Variations', icon: 'bi-grid-3x3-gap', href: '#section-cards' },
        { id: 'tables', label: 'Responsive Tables', icon: 'bi-table', href: '#section-tables' },
        { id: 'forms', label: 'Exchange Forms', icon: 'bi-input-cursor-text', href: '#section-forms' },
        { id: 'notifications', label: 'Toasts & Dialogs', icon: 'bi-bell', href: '#section-notifications' },
        { id: 'states', label: 'Empty / 404 States', icon: 'bi-question-circle', href: '#section-states' }
      ],
      activeId: 'intro',
      onNavigate: (item) => console.log('Sidebar navigation:', item),
      ...options
    };
    this.render();
  }

  /**
   * Set the active item programmatically
   * @param {string} itemId 
   */
  setActiveItem(itemId) {
    this.options.activeId = itemId;
    const links = this.container.querySelectorAll('.sidebar-link');
    links.forEach(link => {
      if (link.getAttribute('data-id') === itemId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  render() {
    if (!this.container) return;

    // Check saved collapsed state in localStorage
    const savedCollapsed = localStorage.getItem('hfc_sidebar_collapsed') === 'true';
    const collapsedClass = savedCollapsed ? 'sidebar-collapsed' : '';
    
    // Ensure the container itself has the proper ID and classes if it is an <aside>
    if (this.container.tagName === 'ASIDE') {
      this.container.className = `sidebar-glass ${collapsedClass}`;
      this.container.id = 'hfcSidebar';
    }

    // Generate menu items HTML
    const menuHtml = this.options.menuItems.map(item => {
      const isActive = item.id === this.options.activeId ? 'active' : '';
      return `
        <li>
          <a href="${item.href}" class="sidebar-link ${isActive}" data-id="${item.id}">
            <i class="bi ${item.icon}"></i>
            <span class="sidebar-text">${item.label}</span>
          </a>
        </li>
      `;
    }).join('');

    this.container.innerHTML = `
      <!-- Brand Signature -->
      <div class="d-flex align-items-center gap-3 py-2 px-1 border-bottom border-secondary border-opacity-10">
        <div class="status-pulse-primary rounded-circle bg-primary" style="width: 10px; height: 10px;"></div>
        <span class="text-display fw-bold text-glow-primary tracking-wide text-white fs-5 sidebar-text">${this.options.brandName}</span>
      </div>

      <!-- Navigation Menu -->
      <nav class="flex-grow-1 overflow-y-auto mt-3">
        <ul class="sidebar-menu">
          ${menuHtml}
        </ul>
      </nav>

      <!-- Sidebar Collapse Toggle Action -->
      <div class="pt-3 border-top border-secondary border-opacity-10 d-none d-lg-block">
        <button class="btn-hfc btn-hfc-secondary w-full" id="hfcSidebarToggle">
          <i class="bi bi-chevron-left"></i>
          <span class="sidebar-text">Collapse Menu</span>
        </button>
      </div>
    `;

    // Apply layout-wide collapsed class if loaded as collapsed
    const layout = document.querySelector('.hfc-layout');
    if (layout) {
      if (savedCollapsed) {
        layout.classList.add('sidebar-collapsed');
      } else {
        layout.classList.remove('sidebar-collapsed');
      }
    }

    this.bindEvents();
  }

  bindEvents() {
    // Sidebar Collapse Trigger
    const toggleBtn = this.container.querySelector('#hfcSidebarToggle');
    const layout = document.querySelector('.hfc-layout');

    if (toggleBtn && layout) {
      toggleBtn.onclick = (e) => {
        e.preventDefault();
        this.container.classList.toggle('sidebar-collapsed');
        layout.classList.toggle('sidebar-collapsed');
        
        const isCollapsed = this.container.classList.contains('sidebar-collapsed');
        localStorage.setItem('hfc_sidebar_collapsed', isCollapsed);
        
        // Update toggle icon rotation or text if needed
        const icon = toggleBtn.querySelector('i');
        if (icon) {
          if (isCollapsed) {
            icon.className = 'bi bi-chevron-right';
          } else {
            icon.className = 'bi bi-chevron-left';
          }
        }
      };

      // Set initial chevron state
      const isCollapsed = this.container.classList.contains('sidebar-collapsed');
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.className = isCollapsed ? 'bi bi-chevron-right' : 'bi bi-chevron-left';
      }
    }

    // Navigation clicks
    const links = this.container.querySelectorAll('.sidebar-link');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        const id = link.getAttribute('data-id');
        this.setActiveItem(id);
        
        // Find corresponding configuration
        const found = this.options.menuItems.find(item => item.id === id);
        if (found) {
          this.options.onNavigate(found);
        }

        // Close mobile drawer on item click
        if (this.container.classList.contains('show')) {
          this.container.classList.remove('show');
        }
      });
    });

    // Close mobile drawer on outside click
    document.addEventListener('click', (e) => {
      const mobileToggle = document.getElementById('hfcSidebarMobileToggle');
      if (this.container.classList.contains('show') && 
          !this.container.contains(e.target) && 
          mobileToggle && !mobileToggle.contains(e.target)) {
        this.container.classList.remove('show');
      }
    });
  }
}
