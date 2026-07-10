/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - Loader Component
 * Reusable full-screen or container-contained glassmorphic loader.
 */

export class Loader {
  /**
   * @param {Object} options - Configuration options
   * @param {string|HTMLElement} options.target - Selector/Element to place loader inside. Defaults to body (full-screen overlay).
   * @param {string} options.text - Core message (e.g., 'Processing transaction...')
   * @param {boolean} options.blurBackdrop - Apply heavy backdrop blur
   */
  constructor(options = {}) {
    this.options = {
      target: document.body,
      text: 'Synchronizing with Firestore ledger...',
      blurBackdrop: true,
      ...options
    };
    
    this.target = typeof this.options.target === 'string' 
      ? document.querySelector(this.options.target) 
      : this.options.target;

    this.element = null;
  }

  /**
   * Show the loader inside the target container or full screen
   * @param {string} [customText] - Temporarily override the message text
   */
  show(customText) {
    // If already showing, update text and return
    if (this.element) {
      this.updateText(customText || this.options.text);
      return;
    }

    const displayText = customText || this.options.text;
    const isFullScreen = this.target === document.body;
    
    const wrapper = document.createElement('div');
    wrapper.className = isFullScreen 
      ? 'hfc-loader-overlay hfc-loader-fullscreen animate-fade-in' 
      : 'hfc-loader-overlay hfc-loader-inline animate-fade-in';
    
    if (this.options.blurBackdrop) {
      wrapper.classList.add('hfc-loader-blur');
    }

    wrapper.innerHTML = `
      <div class="text-center d-flex flex-column align-items-center justify-content-center p-4">
        <!-- Loader Spinner -->
        <div class="loader-hfc mb-3" style="width: 48px; height: 48px;"></div>
        <!-- Status Label -->
        <div class="text-display fw-bold text-white text-base tracking-wide uppercase text-glow-primary mb-1 loader-message">
          ${displayText}
        </div>
        <div class="text-muted text-xs text-mono skeleton-loader px-2 py-0.5 rounded" style="background: none;">
          Please wait
        </div>
      </div>
    `;

    // Ensure parent is positioned relatively if inline loader
    if (!isFullScreen && getComputedStyle(this.target).position === 'static') {
      this.target.style.position = 'relative';
    }

    this.target.appendChild(wrapper);
    this.element = wrapper;

    if (isFullScreen) {
      document.body.classList.add('no-scroll');
    }
  }

  /**
   * Update message text in real-time
   * @param {string} newText 
   */
  updateText(newText) {
    if (this.element) {
      const msgEl = this.element.querySelector('.loader-message');
      if (msgEl) {
        msgEl.textContent = newText;
      }
    }
  }

  /**
   * Hide and destroy the loader element with a smooth fade-out animation
   */
  hide() {
    if (!this.element) return;

    this.element.style.animation = 'hfcFadeOut var(--hfc-transition-normal) forwards';
    
    const onAnimationEnd = () => {
      if (this.element) {
        this.element.remove();
        this.element = null;
      }
      if (this.target === document.body) {
        document.body.classList.remove('no-scroll');
      }
    };

    // Fallback if animation doesn't play
    this.element.addEventListener('animationend', onAnimationEnd, { once: true });
    setTimeout(onAnimationEnd, 350);
  }

  /**
   * Puts a small dynamic spinner inside a button and disables it.
   * @param {HTMLButtonElement|string} button - Button selector or element
   * @param {boolean} show - True to enable loader, false to restore
   * @param {string} [loadingText] - Text to show next to spinner (optional)
   */
  static buttonLoader(button, show, loadingText = '') {
    const btnEl = typeof button === 'string' ? document.querySelector(button) : button;
    if (!btnEl) return;

    if (show) {
      if (btnEl.getAttribute('data-loading') === 'true') return;
      btnEl.setAttribute('data-original-html', btnEl.innerHTML);
      btnEl.setAttribute('data-loading', 'true');
      btnEl.disabled = true;
      btnEl.innerHTML = `
        <span class="spinner-border spinner-border-sm me-1 text-primary animate-spin-loader" role="status" aria-hidden="true" style="width: 1rem; height: 1rem; border-width: 0.15em;"></span>
        ${loadingText || btnEl.textContent}
      `;
    } else {
      const originalHtml = btnEl.getAttribute('data-original-html');
      if (originalHtml) {
        btnEl.innerHTML = originalHtml;
        btnEl.removeAttribute('data-original-html');
      }
      btnEl.removeAttribute('data-loading');
      btnEl.disabled = false;
    }
  }

  /**
   * Replaces table body content with standard skeleton shimmer lines
   * @param {HTMLElement|string} tbody - Table body selector or element
   * @param {number} [columns] - Columns count
   * @param {number} [rows] - Rows count
   */
  static tableLoader(tbody, columns = 4, rows = 3) {
    const tbodyEl = typeof tbody === 'string' ? document.querySelector(tbody) : tbody;
    if (!tbodyEl) return;

    let rowsHtml = '';
    for (let r = 0; r < rows; r++) {
      let colsHtml = '';
      for (let c = 0; c < columns; c++) {
        colsHtml += `
          <td>
            <div class="skeleton-loader w-75" style="height: 16px;"></div>
          </td>
        `;
      }
      rowsHtml += `<tr>${colsHtml}</tr>`;
    }
    tbodyEl.innerHTML = rowsHtml;
  }

  /**
   * Renders a custom card dashboard skeleton inside a target container
   * @param {HTMLElement|string} container - Container element or selector
   * @param {number} [count] - Cards to render
   */
  static cardLoader(container, count = 1) {
    const parentEl = typeof container === 'string' ? document.querySelector(container) : container;
    if (!parentEl) return;

    let cardsHtml = '';
    for (let i = 0; i < count; i++) {
      cardsHtml += `
        <div class="card-glass hover-glow rounded-lg mb-3">
          <div class="skeleton-loader mb-3 w-50" style="height: 14px;"></div>
          <div class="skeleton-loader mb-2 w-75" style="height: 28px;"></div>
          <div class="skeleton-loader w-25" style="height: 12px;"></div>
        </div>
      `;
    }
    parentEl.innerHTML = count === 1 ? cardsHtml : `<div class="row g-4">${cardsHtml.replace(/card-glass/g, '<div class="col-md-4"><div class="card-glass">').replace(/<\/div>$/g, '</div></div>')}</div>`;
  }

  /**
   * Standard skeleton shimmer line generator
   * @param {HTMLElement|string} target - Mount target
   * @param {Object} [options] - Height/width/circle settings
   */
  static renderSkeleton(target, options = {}) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) return;

    const opt = {
      width: '100%',
      height: '16px',
      circle: false,
      count: 1,
      ...options
    };

    let html = '';
    for (let i = 0; i < opt.count; i++) {
      const circleStyle = opt.circle ? 'border-radius: 50%;' : '';
      html += `
        <div class="skeleton-loader mb-2" style="width: ${opt.width}; height: ${opt.height}; ${circleStyle}"></div>
      `;
    }
    container.innerHTML = html;
  }
}
