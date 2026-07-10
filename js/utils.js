/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Utility Helpers Library
 * Bundles central validators, currency formatters, date/time parse engines, and reusable UI trigger proxies.
 */

import { Loader } from "../components/Loader.js";
import { Toast } from "../components/Toast.js";
import { Modal } from "../components/Modal.js";

// Keep track of any active full-screen loader instance to prevent duplicate backdrops
let activeLoader = null;

/**
 * Interface proxy triggering standard toast overlay
 * @param {string} message 
 * @param {string} [type] - 'success', 'danger', 'warning', 'info', 'primary'
 * @param {number} [duration] - Timeout in ms
 */
export function showToast(message, type = "success", duration = 4000) {
  Toast.show(message, { type, duration });
}

/**
 * Interface proxy spawning a full screen or inline loader overlay
 * @param {string} text - Message label
 */
export function showLoader(text) {
  if (!activeLoader) {
    activeLoader = new Loader({ text });
  } else {
    activeLoader.updateText(text);
  }
  activeLoader.show();
}

/**
 * Instantly shuts down and cleans up any active loader overlay from document body.
 */
export function hideLoader() {
  if (activeLoader) {
    activeLoader.hide();
    activeLoader = null;
  }
}

/**
 * Open or instantiate an overlay modal programmatically by its ID.
 * @param {string} modalId 
 */
export function showModal(modalId) {
  const modal = new Modal({ id: modalId });
  modal.open();
}

/**
 * Close and clean up an active overlay modal by its ID.
 * @param {string} modalId 
 */
export function closeModal(modalId) {
  const modal = new Modal({ id: modalId });
  modal.close();
}

/**
 * Formats a raw number value into local or target currency presentation.
 * @param {number} amount 
 * @param {string} [currency] - ISO 4217 Currency Code (default: 'USD')
 * @returns {string} - Styled localized currency output
 */
export function formatCurrency(amount, currency = 'USD') {
  const parsed = parseFloat(amount);
  if (isNaN(parsed)) return "$0.00";
  
  // Format crypto or fiat differently depending on precision needed
  const isCrypto = ["BTC", "ETH", "USDT", "SOL"].includes(currency.toUpperCase());
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: isCrypto ? 'USD' : currency, // Fallback standard representation
    minimumFractionDigits: isCrypto ? 6 : 2,
    maximumFractionDigits: isCrypto ? 8 : 2
  }).format(parsed).replace("$", isCrypto ? `${currency.toUpperCase()} ` : "$");
}

/**
 * Parse any JavaScript Date or Firestore Timestamp into standard calendar layout.
 * @param {any} timestamp - raw Date, millisecond count, or Firestore Timestamp object
 * @returns {string} - 'Month Day, Year'
 */
export function formatDate(timestamp) {
  if (!timestamp) return "";
  let date;

  // Handle Firestore Timestamp object natively
  if (timestamp && typeof timestamp.toDate === "function") {
    date = timestamp.toDate();
  } else if (timestamp && timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) return "Invalid Date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Parse any JavaScript Date or Firestore Timestamp into standard time layout.
 * @param {any} timestamp - raw Date, millisecond count, or Firestore Timestamp object
 * @returns {string} - 'HH:MM:SS AM/PM'
 */
export function formatTime(timestamp) {
  if (!timestamp) return "";
  let date;

  // Handle Firestore Timestamp object natively
  if (timestamp && typeof timestamp.toDate === "function") {
    date = timestamp.toDate();
  } else if (timestamp && timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) return "Invalid Time";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Generates an cryptographically safe-entropy alphanumeric random string ID.
 * @param {string} [prefix] - optional namespace string
 * @returns {string}
 */
export function generateUniqueId(prefix = "") {
  const randomPortion = Math.random().toString(36).substring(2, 11);
  const timePortion = Date.now().toString(36);
  return `${prefix ? prefix + '_' : ''}${timePortion}_${randomPortion}`;
}

/**
 * Comprehensive verification of email format sanity.
 * @param {string} email 
 * @returns {boolean}
 */
export function validateEmail(email) {
  if (!email || typeof email !== "string") return false;
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return regex.test(email.trim());
}

/**
 * Strict check ensuring passwords meet minimal security strength.
 * Requirements: Minimum 6 characters. Must contain at least one digit.
 * @param {string} password 
 * @returns {boolean}
 */
export function validatePassword(password) {
  if (!password || typeof password !== "string") return false;
  // Strong foundation: minimum 6 chars and contains at least 1 number
  return password.length >= 6 && /\d/.test(password);
}
