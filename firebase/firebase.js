/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Firebase Singleton Initializer
 * Establishes real-time connection contexts to Firestore, Storage, and Auth instances.
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Explicit project configuration requested by system security specifications
const firebaseConfig = {
  apiKey: "AIzaSyD8oCrxwgmi_Ln0JsW6NB8Di7BEcPUsAyo",
  authDomain: "horizon-fund-coin.firebaseapp.com",
  projectId: "horizon-fund-coin",
  storageBucket: "horizon-fund-coin.firebasestorage.app",
  messagingSenderId: "184821543332",
  appId: "1:184821543332:web:2a3cba3b906537f236d131"
};

// Initialize Firebase App instance as a singleton
const app = initializeApp(firebaseConfig);

// Initialize Firebase SDK service singletons
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/**
 * Validate connection to database on initial boot.
 * Requisite to fulfill security rules auditing pipeline.
 */
async function validateDatabaseConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("HFC Firebase Foundation: Connection validated successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("HFC Firebase Foundation: Client is offline. Postponing remote checks.");
    }
  }
}

// Quietly execute connection diagnostics
validateDatabaseConnection();

export { app, auth, db, storage };
