/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Offline Mode Controller (offline-controller.js)
 * Manages active connectivity retry attempts and redirects back to secure portals.
 */

import { Toast } from './js/toast.js';

document.addEventListener('DOMContentLoaded', () => {
  const retryBtn = document.getElementById('retryBtn');

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      const spanText = retryBtn.querySelector('span');
      const originalText = spanText ? spanText.textContent : 'Re-Verify Connection Node';
      
      if (spanText) {
        spanText.textContent = 'Verifying connection gateway...';
      }
      retryBtn.disabled = true;

      // Simulate network verification delay (representing node checks)
      setTimeout(() => {
        if (navigator.onLine) {
          Toast.show('Gateway established! Redirecting back to node environment...', 'success', 2000);
          setTimeout(() => {
            window.location.href = '/index.html';
          }, 1200);
        } else {
          if (spanText) {
            spanText.textContent = originalText;
          }
          retryBtn.disabled = false;
          Toast.show('Peer network is still unreachable. Please check router nodes.', 'danger', 3000);
        }
      }, 1000);
    });
  }
});
