/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - components.js
 * Vanilla ES Module managing component interactivity, Toasts, Modals, Tabs, and the Live Variable Customizer.
 */

import { Navbar } from '../components/Navbar.js';
import { Sidebar } from '../components/Sidebar.js';
import { Footer } from '../components/Footer.js';
import { Loader } from '../components/Loader.js';
import { Toast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { PageLayout } from '../components/PageLayout.js';
import { EmptyState } from '../components/EmptyState.js';
import { PageHeader } from '../components/PageHeader.js';
import { SearchBar } from '../components/SearchBar.js';

export class HFCComponents {
  static Navbar = Navbar;
  static Sidebar = Sidebar;
  static Footer = Footer;
  static Loader = Loader;
  static Toast = Toast;
  static Modal = Modal;
  static PageLayout = PageLayout;
  static EmptyState = EmptyState;
  static PageHeader = PageHeader;
  static SearchBar = SearchBar;

  /**
   * Initialize all default interactive triggers
   */
  static init() {
    this.initSidebar();
    this.initTabs();
    this.initModals();
    this.initTooltips();
    this.initThemeTweak();
  }

  /* ==========================================================================
     SIDEBAR TRANSITIONS & COLLAPSE
     ========================================================================== */
  static initSidebar() {
    const sidebarToggle = document.getElementById('hfcSidebarToggle');
    const sidebarMobileToggle = document.getElementById('hfcSidebarMobileToggle');
    const sidebar = document.getElementById('hfcSidebar');
    const layout = document.querySelector('.hfc-layout');

    if (sidebarToggle && sidebar && layout) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('sidebar-collapsed');
        layout.classList.toggle('sidebar-collapsed');
        
        // Save state to localStorage
        const isCollapsed = sidebar.classList.contains('sidebar-collapsed');
        localStorage.setItem('hfc_sidebar_collapsed', isCollapsed);
      });

      // Restore state
      const savedState = localStorage.getItem('hfc_sidebar_collapsed');
      if (savedState === 'true') {
        sidebar.classList.add('sidebar-collapsed');
        layout.classList.add('sidebar-collapsed');
      }
    }

    if (sidebarMobileToggle && sidebar) {
      sidebarMobileToggle.addEventListener('click', () => {
        sidebar.classList.toggle('show');
      });

      // Close mobile sidebar when clicking outside of it
      document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('show') && 
            !sidebar.contains(e.target) && 
            !sidebarMobileToggle.contains(e.target)) {
          sidebar.classList.remove('show');
        }
      });
    }
  }

  /* ==========================================================================
     TABS MANAGER
     ========================================================================== */
  static initTabs() {
    const tabContainers = document.querySelectorAll('.tabs-glass');
    
    tabContainers.forEach(container => {
      const tabs = container.querySelectorAll('.tab-link');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Remove active class from all tabs
          tabs.forEach(t => t.classList.remove('active'));
          // Add active class to current tab
          tab.classList.add('active');

          // If there are target panels, toggle them
          const targetId = tab.getAttribute('data-tab-target');
          if (targetId) {
            const panelContainer = container.nextElementSibling;
            if (panelContainer && panelContainer.classList.contains('tab-content')) {
              const panels = panelContainer.querySelectorAll('.tab-pane');
              panels.forEach(panel => {
                panel.classList.remove('show', 'active');
                if (panel.id === targetId) {
                  panel.classList.add('show', 'active');
                }
              });
            }
          }
        });
      });
    });
  }

  /* ==========================================================================
     MODALS & CONFIRMATION DIALOGS
     ========================================================================== */
  static initModals() {
    const modalTriggers = document.querySelectorAll('[data-hfc-toggle="modal"]');
    
    modalTriggers.forEach(trigger => {
      trigger.addEventListener('click', () => {
        const targetId = trigger.getAttribute('data-hfc-target');
        if (targetId) {
          this.openModal(targetId);
        }
      });
    });

    const modalDismissers = document.querySelectorAll('[data-hfc-dismiss="modal"]');
    modalDismissers.forEach(dismisser => {
      dismisser.addEventListener('click', () => {
        const modal = dismisser.closest('.modal');
        if (modal) {
          this.closeModal(modal.id);
        }
      });
    });
  }

  static openModal(modalId) {
    // Bind existing markup or dynamic nodes using the reusable Modal class
    const modalInstance = new this.Modal({ id: modalId });
    modalInstance.open();
  }

  static closeModal(modalId) {
    const modalInstance = new this.Modal({ id: modalId });
    modalInstance.close();
  }

  /* ==========================================================================
     TOAST ENGINE
     ========================================================================== */
  /**
   * Instantly generate and show a premium glassmorphic toast notification
   * @param {string} message - Text inside toast
   * @param {string} type - 'success', 'danger', 'warning', 'info' or 'primary'
   * @param {number} duration - Miliseconds to show before fade out
   */
  static showToast(message, type = 'success', duration = 4000) {
    this.Toast.show(message, { type, duration });
  }

  /* ==========================================================================
     TOOLTIPS
     ========================================================================== */
  static initTooltips() {
    // Basic native tooltips styled via standard titles or simple attributes
  }

  /* ==========================================================================
     LIVE DESIGN SYSTEM VARIABLE CUSTOMIZER (THEME EDIT)
     ========================================================================== */
  static initThemeTweak() {
    const root = document.documentElement;
    
    // Wire color pickers if they are on the page
    const primaryPicker = document.getElementById('themePrimaryColor');
    const borderSlider = document.getElementById('themeBorderRadius');
    const blurSlider = document.getElementById('themeBlurAmount');
    const resetBtn = document.getElementById('themeResetBtn');

    if (primaryPicker) {
      primaryPicker.addEventListener('input', (e) => {
        root.style.setProperty('--hfc-primary', e.target.value);
        // Convert hex to rgb for opacity-dependent vars
        const rgb = this.hexToRgb(e.target.value);
        if (rgb) {
          root.style.setProperty('--hfc-primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        }
      });
    }

    if (borderSlider) {
      borderSlider.addEventListener('input', (e) => {
        root.style.setProperty('--hfc-radius-md', `${e.target.value}px`);
      });
    }

    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        root.style.setProperty('--hfc-glass-blur', `${e.target.value}px`);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        root.style.removeProperty('--hfc-primary');
        root.style.removeProperty('--hfc-primary-rgb');
        root.style.removeProperty('--hfc-radius-md');
        root.style.removeProperty('--hfc-glass-blur');
        
        if (primaryPicker) primaryPicker.value = '#00f2fe';
        if (borderSlider) borderSlider.value = '12';
        if (blurSlider) blurSlider.value = '16';

        this.showToast('Design System variables reset to HFC Exchange standard!', 'info');
      });
    }
  }

  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
}
