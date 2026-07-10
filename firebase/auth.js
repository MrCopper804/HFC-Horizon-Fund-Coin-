/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Authentication Library
 * Standard reusable authentication controls with strict validation and user-friendly error translations.
 */

import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  updateProfile as firebaseUpdateProfile,
  sendEmailVerification as firebaseSendEmailVerification,
  onAuthStateChanged
} from "firebase/auth";
import { auth } from "./firebase.js";

/**
 * Translates low-level Firebase Auth error codes into safe, helpful, non-technical instructions.
 * @param {Object|Error} error - Low-level Firestore or Auth error
 * @returns {string} - Clean user feedback string
 */
export function getFriendlyErrorMessage(error) {
  if (!error) return "An unknown error has occurred in the secure gateway.";
  const code = error.code || "";
  
  switch (code) {
    case "auth/invalid-email":
      return "The format of the email address is invalid.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support for recovery.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "The email or password combination is incorrect.";
    case "auth/email-already-in-use":
      return "This email address is already registered on HFC Exchange.";
    case "auth/weak-password":
      return "Password is too weak. Ensure it is at least 6 characters and includes numbers/symbols.";
    case "auth/requires-recent-login":
      return "This action is highly sensitive and requires a fresh login session.";
    case "auth/too-many-requests":
      return "Access restricted due to multiple failed login attempts. Try again in a few minutes.";
    case "auth/network-request-failed":
      return "Gateway connection failed. Please check your network connection.";
    case "auth/popup-closed-by-user":
      return "The browser authentication window was closed before authorization.";
    case "auth/expired-action-code":
      return "The security token or email verification link has expired.";
    case "auth/invalid-action-code":
      return "The security link is invalid or has already been used.";
    default:
      return error.message || "A secure authentication error occurred. Action blocked.";
  }
}

/**
 * Register a new user on the platform.
 * @param {string} email 
 * @param {string} password 
 * @param {string} [displayName] 
 * @returns {Promise<import("firebase/auth").User>}
 */
export async function registerUser(email, password, displayName = "") {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return Promise.reject(new Error("A valid email address is required."));
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    return Promise.reject(new Error("Password must be at least 6 characters."));
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = cred.user;
    if (displayName) {
      await firebaseUpdateProfile(user, { displayName: displayName.trim() });
    }
    return user;
  } catch (error) {
    return Promise.reject(new Error(getFriendlyErrorMessage(error)));
  }
}

/**
 * Sign in existing user.
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<import("firebase/auth").User>}
 */
export async function loginUser(email, password) {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return Promise.reject(new Error("Please enter your registered email address."));
  }
  if (!password || typeof password !== "string") {
    return Promise.reject(new Error("Please enter your account password."));
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch (error) {
    return Promise.reject(new Error(getFriendlyErrorMessage(error)));
  }
}

/**
 * Log out the current active session.
 * @returns {Promise<void>}
 */
export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    return Promise.reject(new Error(getFriendlyErrorMessage(error)));
  }
}

/**
 * Triggers a password reset security email.
 * @param {string} email 
 * @returns {Promise<void>}
 */
export async function forgotPassword(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return Promise.reject(new Error("Please specify a valid email to receive reset instructions."));
  }

  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    return Promise.reject(new Error(getFriendlyErrorMessage(error)));
  }
}

/**
 * Promise-based retrieval of current logged-in user context.
 * Useful to avoid null checks on cold page boots.
 * @returns {Promise<import("firebase/auth").User|null>}
 */
export function getCurrentUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        reject(new Error(getFriendlyErrorMessage(error)));
      }
    );
  });
}

/**
 * Instant boolean check for login state (synchronous).
 * @returns {boolean}
 */
export function isLoggedIn() {
  return auth.currentUser !== null;
}

/**
 * Updates details in the authenticated user's profile metadata.
 * @param {string} [displayName] 
 * @param {string} [photoURL] 
 * @returns {Promise<import("firebase/auth").User>}
 */
export async function updateProfile(displayName = "", photoURL = "") {
  const user = auth.currentUser;
  if (!user) {
    return Promise.reject(new Error("No active user session was found to modify."));
  }

  const updates = {};
  if (displayName) updates.displayName = displayName.trim();
  if (photoURL) updates.photoURL = photoURL.trim();

  try {
    await firebaseUpdateProfile(user, updates);
    return user;
  } catch (error) {
    return Promise.reject(new Error(getFriendlyErrorMessage(error)));
  }
}

/**
 * Trigger account verification email.
 * @returns {Promise<void>}
 */
export async function sendEmailVerification() {
  const user = auth.currentUser;
  if (!user) {
    return Promise.reject(new Error("No active user session was found to verify."));
  }

  try {
    await firebaseSendEmailVerification(user);
  } catch (error) {
    return Promise.reject(new Error(getFriendlyErrorMessage(error)));
  }
}

/**
 * Force reload user token and profile state to catch dynamic verifications or changes.
 * @returns {Promise<import("firebase/auth").User>}
 */
export async function reloadUser() {
  const user = auth.currentUser;
  if (!user) {
    return Promise.reject(new Error("No active session was found to synchronize."));
  }

  try {
    await user.reload();
    return auth.currentUser;
  } catch (error) {
    return Promise.reject(new Error(getFriendlyErrorMessage(error)));
  }
}
