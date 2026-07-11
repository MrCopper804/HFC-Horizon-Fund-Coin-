/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - PWA Service Worker (service-worker.js)
 * High-performance, secure offline cache manager for FinTech environments.
 * Strictly avoids caching sensitive transactional user data.
 */

const CACHE_VERSION = 'hfc-pwa-v1.0.0';
const STATIC_CACHE_NAME = `hfc-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `hfc-dynamic-${CACHE_VERSION}`;

// Core assets required for offline rendering and fundamental layout boot
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/offline.html',
  '/manifest.json',
  '/pwa-init.js',
  '/css/style.css',
  '/assets/css/home.css',
  '/assets/js/home.js',
  '/js/utils.js',
  '/js/components.js',
  '/js/theme.js',
  '/js/authGuard.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  // Third-Party CDN Core Deliverables (Bootstrap 5 and Icons)
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js'
];

// Security Exclusions: Under no circumstances should sensitive parameters be cached
const SECURITY_EXCLUSIONS = [
  'identitytoolkit.googleapis.com', // Firebase Authentication
  'securetoken.googleapis.com',      // Firebase Session Tokens
  'firestore.googleapis.com',        // Firestore Database Tickers
  'firebasestorage.googleapis.com',  // Financial Transaction Screenshots/Receipts
  'oauth2.googleapis.com',           // Google OAuth Gateways
  '/api/',                           // System administrative endpoints
  '?source=pwa'                      // Tracking parameter pass
];

/* ==========================================================================
   1. INSTALLATION EVENT (Pre-caching critical files)
   ========================================================================== */
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Initiating installation & static asset pre-caching...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Pre-cache successfully populated. Terminating wait step.');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[Service Worker] Pre-cache enrollment failure:', err);
      })
  );
});

/* ==========================================================================
   2. ACTIVATION EVENT (Cache cleanups & clients takeover)
   ========================================================================== */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating worker node and purging stale indices...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log(`[Service Worker] Pruning obsolete ledger cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming active browser sessions as controller...');
      return self.clients.claim();
    })
  );
});

/* ==========================================================================
   3. FETCH EVENT INTERCEPTOR (Cache strategy enforcement)
   ========================================================================== */
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Skip intercepting non-GET requests (such as POST multi-sig actions, database updates, file uploads)
  if (event.request.method !== 'GET') {
    return;
  }

  // Security Check: Enforce strictly no-cache for authentication, live database streams, and financial assets
  const isExcluded = SECURITY_EXCLUSIONS.some(pattern => event.request.url.includes(pattern));
  if (isExcluded) {
    // Direct network bypass, no local copies stored
    return;
  }

  // Handle document navigations (HTML pages) utilizing a robust Network-First fallback strategy
  // This guarantees traders always see up-to-the-millisecond balances if online, and a clean offline screen if not
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          console.warn('[Service Worker] Network unreachable. Routing navigation to offline fallback card.');
          return caches.match('/offline.html');
        })
    );
    return;
  }

  // Standard Static Assets & CDN caching (Stale-While-Revalidate Strategy)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in the background to keep cache updated
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {
          // Silent catch on background fetch failure (offline usage of cached copy)
        });
        return cachedResponse;
      }

      // Fallback directly to network if not in static cache
      return fetch(event.request).then((networkResponse) => {
        // Cache successful GET responses from reliable origins
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        // For images, we can optionally return a static vector fallback if offline
        if (event.request.destination === 'image') {
          return caches.match('/icons/icon.svg');
        }
        throw err;
      });
    })
  );
});

/* ==========================================================================
   4. FUTURE BACKGROUND SYNC FRAMEWORK (P2P Queue Buffer)
   ========================================================================== */
self.addEventListener('sync', (event) => {
  console.log(`[Service Worker] Background Sync Triggered: ${event.tag}`);
  
  if (event.tag === 'hfc-pending-actions') {
    event.waitUntil(
      // Dev placeholder: Flush local IndexedDB action queue to Firestore ledger when connectivity returns
      Promise.resolve()
        .then(() => console.log('[Service Worker] Connection restored. Pending local node actions flushed.'))
    );
  }
});

/* ==========================================================================
   5. FUTURE PUSH NOTIFICATION FRAMEWORK (Active trade logs and deals)
   ========================================================================== */
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Incoming push notification stream detected.');
  
  let data = { title: 'HFC Exchange Node Alert', body: 'New escrow trade notification received.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'HFC Exchange Node Alert', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-maskable.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      { action: 'open_dashboard', title: 'Open Dashboard', icon: '/icons/icon-maskable.png' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Manage Push notification clicks programmatically
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;

  notification.close();

  if (action === 'open_dashboard') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((windowClients) => {
        // Check if there's already a window open, focus it, or open a new one
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/dashboard.html');
        }
      })
    );
  }
});
