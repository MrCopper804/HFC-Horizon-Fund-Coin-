/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Accessible Dropdown Manager helper
 */

export class HFCDropdown {
  /**
   * Automatically bind keyboard controls or focus tracking for native Bootstrap dropdowns
   * @param {string|HTMLElement} selector 
   */
  static init(selector = '.dropdown') {
    const dropdowns = document.querySelectorAll(selector);
    dropdowns.forEach(dropdown => {
      const toggle = dropdown.querySelector('[data-bs-toggle="dropdown"]');
      const menu = dropdown.querySelector('.dropdown-menu');

      if (toggle && menu) {
        // Accessibility tracking: add ARIA tags programmatically if missing
        if (!toggle.id) {
          toggle.id = `hfcDropdown_${Math.random().toString(36).substring(2, 9)}`;
        }
        toggle.setAttribute('aria-haspopup', 'true');
        menu.setAttribute('aria-labelledby', toggle.id);

        // Bind escape and arrow key navigation inside dropdown items
        dropdown.addEventListener('keydown', (e) => {
          const items = Array.from(menu.querySelectorAll('.dropdown-item, .dropdown-item-glass, button'));
          if (items.length === 0) return;

          const activeIndex = items.indexOf(document.activeElement);

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = (activeIndex + 1) % items.length;
            items[nextIndex].focus();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = (activeIndex - 1 + items.length) % items.length;
            items[prevIndex].focus();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            // Close dropdown using Bootstrap instance toggle
            if (window.bootstrap && window.bootstrap.Dropdown) {
              const instance = window.bootstrap.Dropdown.getInstance(toggle);
              if (instance) {
                instance.hide();
              }
            }
            toggle.focus();
          }
        });
      }
    });
  }
}

export default HFCDropdown;
