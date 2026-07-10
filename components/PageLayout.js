/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - PageLayout Component
 * Master orchestrator layout component grouping Sidebar, Navbar, Content panel, and Footer.
 */

import { Sidebar } from './Sidebar.js';
import { Navbar } from './Navbar.js';
import { Footer } from './Footer.js';

export class PageLayout {
  /**
   * @param {string|HTMLElement} target - Target element to build full page structure inside (usually document.body)
   * @param {Object} options - Structural options
   * @param {Object} options.navbarOptions - Config objects for Navbar
   * @param {Object} options.sidebarOptions - Config objects for Sidebar
   * @param {Object} options.footerOptions - Config objects for Footer
   */
  constructor(target = document.body, options = {}) {
    this.target = typeof target === 'string' ? document.querySelector(target) : target;
    this.options = {
      navbarOptions: {},
      sidebarOptions: {},
      footerOptions: {},
      ...options
    };
    
    this.navbar = null;
    this.sidebar = null;
    this.footer = null;
    this.contentContainer = null;
    
    this.buildStructure();
  }

  buildStructure() {
    if (!this.target) return;

    // Flush target
    this.target.innerHTML = `
      <div class="hfc-layout">
        <!-- Sidebar placeholder -->
        <aside class="sidebar-glass" id="hfcSidebar"></aside>

        <!-- Main container wrapper -->
        <div class="hfc-main-container">
          <!-- Navbar wrapper -->
          <div id="hfcNavbarContainer"></div>

          <!-- Dynamic Main Content Section -->
          <main class="hfc-page-content animate-fade-in" id="hfcMainContent">
            <!-- Child pages / components mount here -->
          </main>

          <!-- Footer wrapper -->
          <div id="hfcFooterContainer" class="px-3 px-md-4 pb-4"></div>
        </div>
      </div>
    `;

    // Instantiate child layout elements
    this.sidebar = new Sidebar('#hfcSidebar', this.options.sidebarOptions);
    this.navbar = new Navbar('#hfcNavbarContainer', this.options.navbarOptions);
    this.footer = new Footer('#hfcFooterContainer', this.options.footerOptions);
    this.contentContainer = this.target.querySelector('#hfcMainContent');
  }

  /**
   * Set content inside the main workspace container cleanly with fade-in effects
   * @param {string|HTMLElement} htmlOrNode - The string template or DOM node to put inside the workspace
   */
  setContent(htmlOrNode) {
    if (!this.contentContainer) return;

    // Trigger fade transition
    this.contentContainer.classList.remove('animate-fade-in');
    
    // Force reflow
    void this.contentContainer.offsetWidth;

    this.contentContainer.classList.add('animate-fade-in');

    if (typeof htmlOrNode === 'string') {
      this.contentContainer.innerHTML = htmlOrNode;
    } else {
      this.contentContainer.innerHTML = '';
      this.contentContainer.appendChild(htmlOrNode);
    }
  }

  /**
   * Quick access getter for main workspace node
   * @returns {HTMLElement}
   */
  getContentContainer() {
    return this.contentContainer;
  }
}
