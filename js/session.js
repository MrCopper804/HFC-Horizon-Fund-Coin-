/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Local Session Manager
 * Client-side cached session persistence synchronized with Firebase real-time states.
 */

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebase.js";
import { getDocument } from "../firebase/firestore.js";

const SESSION_KEY = "hfc_session_profile";

/**
 * Persists basic, non-sensitive profile state in localStorage for fast UI loads.
 * @param {Object} userProfile 
 */
export function saveSession(userProfile) {
  if (!userProfile) return;
  const cachedData = {
    uid: userProfile.uid,
    email: userProfile.email,
    displayName: userProfile.displayName || "",
    photoURL: userProfile.photoURL || "",
    isAdmin: userProfile.isAdmin || false,
    preferredCurrency: userProfile.preferredCurrency || "USD",
    syncedAt: Date.now()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(cachedData));
}

/**
 * Reads cached session profile.
 * @returns {Object|null}
 */
export function readSession() {
  const data = localStorage.getItem(SESSION_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (error) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/**
 * Erase cached session credentials cleanly.
 */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Check if the user is considered logged in by local cache.
 * @returns {boolean}
 */
export function detectLoginStatus() {
  return readSession() !== null;
}

/**
 * Real-time Firebase Auth state sync pipeline.
 * Subscribes to Auth state changes and refreshes the local cache automatically.
 * 
 * @param {Function} [onStateChangedCallback] - Callback when auth state resolves
 * @returns {import("firebase/auth").Unsubscribe} - Unsubscribe function to stop listener
 */
export function initSessionSync(onStateChangedCallback = null) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        isAdmin: false,
        preferredCurrency: "USD"
      };

      // Try fetching matching user metadata profile from Firestore
      try {
        const profileDoc = await getDocument("users", user.uid);
        if (profileDoc) {
          profile.isAdmin = profileDoc.isAdmin || false;
          profile.preferredCurrency = profileDoc.preferredCurrency || "USD";
        }
      } catch (err) {
        // Fallback: Continue with base session details
      }

      saveSession(profile);
      if (onStateChangedCallback) {
        onStateChangedCallback(profile);
      }
    } else {
      clearSession();
      if (onStateChangedCallback) {
        onStateChangedCallback(null);
      }
    }
  });
}
