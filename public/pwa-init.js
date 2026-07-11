/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - PWA Orchestrator (pwa-init.js)
 * ES6 module handles service worker registration, installation prompts, and display-mode audits.
 */

import { Toast } from './js/toast.js';

class HFCPWAOrchestrator {
  constructor() {
    this.deferredPrompt = null;
    this.isStandalone = false;
    this.init();
  }

  init() {
    // 1. Audit Display-Mode States (Determine if running as installed app)
    this.checkInstalledMode();

    // 2. Register Service Worker with proper scope and registration callbacks
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        this.registerServiceWorker();
      });
    }

    // 3. Capture Custom Install Prompts
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent automatic desktop prompt to allow professional UI integration
      e.preventDefault();
      this.deferredPrompt = e;
      
      console.log('[PWA Orchestrator] "beforeinstallprompt" event intercepted.');
      
      // Notify the page controllers that custom installation is available
      document.dispatchEvent(new CustomEvent('hfcPwaInstallAvailable', { detail: e }));
      
      // Wire any static install buttons programmatically if present in the document
      this.bindInstallButtons();
    });

    // 4. Listen for Successful Installation Completion
    window.addEventListener('appinstalled', (event) => {
      console.log('[PWA Orchestrator] HFC Exchange app installed successfully.');
      this.deferredPrompt = null;
      Toast.show('HFC Exchange installed successfully! Launching from desktop mode.', { type: 'success', duration: 5000 });
      
      // Update custom installation UI states
      document.dispatchEvent(new CustomEvent('hfcPwaInstalled'));
    });
  }

  registerServiceWorker() {
    // Standard relative root mapping
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then((registration) => {
        console.log('[PWA Orchestrator] Service Worker registered with scope:', registration.scope);

        // Listen for updates to cache assets
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker == null) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New content exists but user is running older cache values
                console.log('[PWA Orchestrator] New network assets detected. Prompting update.');
                Toast.show('New platform update available! Reloading assets...', { 
                  type: 'primary', 
                  duration: 6000 
                });
                
                setTimeout(() => {
                  window.location.reload();
                }, 1500);
              } else {
                // First install success
                console.log('[PWA Orchestrator] Platform offline synchronization enabled.');
                Toast.show('Offline node capabilities enabled! HFC is ready for offline usage.', { type: 'success', duration: 4000 });
              }
            }
          });
        });
      })
      .catch((error) => {
        console.error('[PWA Orchestrator] Service Worker enrollment failed:', error);
      });
  }

  checkInstalledMode() {
    const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = window.navigator.standalone === true;
    
    this.isStandalone = isStandaloneMedia || isIOSStandalone;

    if (this.isStandalone) {
      console.log('[PWA Orchestrator] Node operating in Standalone/Installed environment.');
      document.documentElement.classList.add('pwa-standalone');
    } else {
      console.log('[PWA Orchestrator] Node operating in standard browser tab context.');
    }
  }

  bindInstallButtons() {
    // Select any buttons designated with the PWA install target
    const installButtons = document.querySelectorAll('[data-pwa-action="install"]');
    installButtons.forEach(btn => {
      // Reveal the button gracefully as it's hidden by default for non-PWA browsers
      btn.style.display = 'inline-flex';
      btn.classList.remove('d-none');
      
      btn.addEventListener('click', async () => {
        if (!this.deferredPrompt) {
          Toast.show('HFC Installation is already complete or not supported on this browser.', 'info');
          return;
        }

        // Trigger native Chrome/Android prompt
        this.deferredPrompt.prompt();
        
        // Wait for user choice response
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log(`[PWA Orchestrator] User response to installation: ${outcome}`);
        
        // Clear prompt handle as it can only be invoked once
        this.deferredPrompt = null;
        
        // Hide button again
        btn.style.display = 'none';
      });
    });
  }
}

// Instantiate the singleton orchestrator on import
export const pwaOrchestrator = new HFCPWAOrchestrator();
export default pwaOrchestrator;
