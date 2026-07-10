/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - firebase-config.js
 * Pre-configured project foundation for Firebase Authentication, Firestore Database, and Firebase Storage.
 */

// This will be replaced with official imports when Firebase SDK v12 is bound.
// For now, it acts as the project initialization foundation with standard lazy loading.

const firebaseConfig = {
  apiKey: "PLACEHOLDER_API_KEY",
  authDomain: "hfc-exchange.firebaseapp.com",
  projectId: "hfc-exchange",
  storageBucket: "hfc-exchange.appspot.com",
  messagingSenderId: "PLACEHOLDER_SENDER_ID",
  appId: "PLACEHOLDER_APP_ID"
};

let appInstance = null;
let authInstance = null;
let firestoreInstance = null;
let storageInstance = null;

/**
 * Initialize Firebase Application context safely
 */
export function getFirebaseApp(firebaseSDKs = {}) {
  if (!appInstance) {
    const { initializeApp } = firebaseSDKs;
    if (initializeApp) {
      appInstance = initializeApp(firebaseConfig);
    } else {
      console.warn("Firebase SDK 'initializeApp' not supplied. Returning local mock context.");
      appInstance = { name: "hfc-exchange-mock-app" };
    }
  }
  return appInstance;
}

/**
 * Lazy initialization for Firebase Auth
 */
export function getFirebaseAuth(firebaseSDKs = {}) {
  if (!authInstance) {
    const app = getFirebaseApp(firebaseSDKs);
    const { getAuth } = firebaseSDKs;
    if (getAuth) {
      authInstance = getAuth(app);
    } else {
      console.warn("Firebase SDK 'getAuth' not supplied. Returning local mock auth.");
      authInstance = { currentUser: null };
    }
  }
  return authInstance;
}

/**
 * Lazy initialization for Firestore Database
 */
export function getFirestore(firebaseSDKs = {}) {
  if (!firestoreInstance) {
    const app = getFirebaseApp(firebaseSDKs);
    const { getFirestore: initFirestore } = firebaseSDKs;
    if (initFirestore) {
      firestoreInstance = initFirestore(app);
    } else {
      console.warn("Firebase SDK 'getFirestore' not supplied. Returning local mock database.");
      firestoreInstance = {};
    }
  }
  return firestoreInstance;
}

/**
 * Lazy initialization for Firebase Cloud Storage
 */
export function getFirebaseStorage(firebaseSDKs = {}) {
  if (!storageInstance) {
    const app = getFirebaseApp(firebaseSDKs);
    const { getStorage } = firebaseSDKs;
    if (getStorage) {
      storageInstance = getStorage(app);
    } else {
      console.warn("Firebase SDK 'getStorage' not supplied. Returning local mock storage.");
      storageInstance = {};
    }
  }
  return storageInstance;
}
