/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - SearchBar Component
 * Reusable accessible search bar with debounce emitters and keyboard triggers.
 */

export class SearchBar {
  /**
   * @param {string|HTMLElement} container - Target container to render search bar into
   * @param {Object} options - Configuration options
   * @param {string} options.placeholder - Placeholder text (default: "Search peer assets...")
   * @param {number} options.debounceMs - Debounce limit in ms (default: 300)
   * @param {string} options.ariaLabel - ARIA label for screen readers (default: "Search the exchange")
   * @param {Function} options.onSearch - Callback emitted when search input is typed/changed
   * @param {Function} options.onEnter - Callback emitted when Enter key is pressed
   * @param {Function} options.onEscape - Callback emitted when Escape key is pressed
   */
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      placeholder: 'Search marketplaces or UIDs...',
      debounceMs: 300,
      ariaLabel: 'Search HFC Exchange data sheets',
      onSearch: (query) => console.log('Search query emitted:', query),
      onEnter: (query) => console.log('Search Enter committed:', query),
      onEscape: () => console.log('Search cleared / escaped'),
      ...options
    };

    this.debounceTimer = null;
    this.render();
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="search-bar-glass">
        <input 
          type="text" 
          class="form-control-glass search-input text-sm" 
          placeholder="${this.options.placeholder}" 
          aria-label="${this.options.ariaLabel}"
          id="hfcSearchInput"
          autocomplete="off"
        >
        <span class="search-icon"><i class="bi bi-search"></i></span>
        <button type="button" class="search-clear-btn d-none" id="hfcSearchClear" aria-label="Clear search input">
          <i class="bi bi-x-circle-fill"></i>
        </button>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const input = this.container.querySelector('#hfcSearchInput');
    const clearBtn = this.container.querySelector('#hfcSearchClear');

    if (!input || !clearBtn) return;

    // Handle typing and debouncing
    input.addEventListener('input', (e) => {
      const value = e.target.value.trim();

      // Show/hide clear button
      if (value.length > 0) {
        clearBtn.classList.remove('d-none');
      } else {
        clearBtn.classList.add('d-none');
      }

      // Debounce logic
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.options.onSearch(value);
      }, this.options.debounceMs);
    });

    // Keyboard navigation and key listeners
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.options.onEnter(input.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.clear();
        this.options.onEscape();
      }
    });

    // Clear action
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clear();
      this.options.onSearch('');
      this.options.onEscape();
    });
  }

  /**
   * Clears the search input field programmatically
   */
  clear() {
    if (!this.container) return;
    const input = this.container.querySelector('#hfcSearchInput');
    const clearBtn = this.container.querySelector('#hfcSearchClear');
    
    if (input) {
      input.value = '';
      input.focus();
    }
    if (clearBtn) {
      clearBtn.classList.add('d-none');
    }
  }

  /**
   * Retrieve current query value directly
   * @returns {string}
   */
  getValue() {
    if (!this.container) return '';
    const input = this.container.querySelector('#hfcSearchInput');
    return input ? input.value.trim() : '';
  }

  /**
   * Programmatically set focus on input field
   */
  focus() {
    if (!this.container) return;
    const input = this.container.querySelector('#hfcSearchInput');
    if (input) input.focus();
  }
}
