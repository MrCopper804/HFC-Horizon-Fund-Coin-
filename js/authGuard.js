/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Authentication Guard
 * Security interceptor ensuring pages are only accessible to authenticated sessions.
 */

import { getCurrentUser, isLoggedIn } from "../firebase/auth.js";
import { getDocument } from "../firebase/firestore.js";

/**
 * Protects client-side pages and redirects unauthenticated users.
 * Supports future role checking for administrator panels.
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireAdmin - Force verification of administrator role
 * @param {string} options.redirectUrl - Target redirect for unauthorized users (default: 'login.html')
 * @returns {Promise<import("firebase/auth").User>} - Resolves to the authed User object
 */
export async function protectPage(options = {}) {
  const config = {
    requireAdmin: false,
    redirectUrl: "login.html",
    ...options
  };

  try {
    const user = await getCurrentUser();
    
    // 1. Check if user session is active
    if (!user) {
      console.warn("AuthGuard: Unauthenticated session detected. Redirecting...");
      window.location.href = config.redirectUrl;
      return null;
    }

    // 2. Check if admin credentials are required
    if (config.requireAdmin) {
      // Validate in the secure Firestore collections
      const adminDoc = await getDocument("admins", user.uid);
      
      if (!adminDoc) {
        // Fallback: Check users database profile for an isAdmin flag
        const userProfile = await getDocument("users", user.uid);
        if (!userProfile || !userProfile.isAdmin) {
          console.error("AuthGuard: Unauthorized privileges. Redirecting to access-denied page...");
          window.location.href = "unauthorized.html";
          return null;
        }
      }
    }

    return user;
  } catch (error) {
    console.error("AuthGuard: Protection execution error:", error);
    window.location.href = config.redirectUrl;
    return null;
  }
}

/**
 * Guest-only page shield. Prevents authenticated users from seeing landing/login pages again.
 * 
 * @param {string} redirectUrl - Where to send logged-in users (default: 'index.html')
 */
export async function redirectIfAuthenticated(redirectUrl = "index.html") {
  try {
    const user = await getCurrentUser();
    if (user) {
      window.location.href = redirectUrl;
    }
  } catch (e) {
    // Silent fail, allow guest page render
  }
}

// Auto-run if page includes the direct guard tags
document.addEventListener("DOMContentLoaded", async () => {
  const isProtected = document.documentElement.hasAttribute("data-hfc-protected") || 
                        document.body.hasAttribute("data-hfc-protected");
  const isAdminPage = document.documentElement.hasAttribute("data-hfc-admin") || 
                        document.body.hasAttribute("data-hfc-admin");

  if (isAdminPage) {
    await protectPage({ requireAdmin: true });
  } else if (isProtected) {
    await protectPage();
  }
});
