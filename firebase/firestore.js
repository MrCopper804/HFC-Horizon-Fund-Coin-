/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Firestore Database Library
 * Modular data operations, transaction wrapper, and strict permission error formatting.
 */

import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  runTransaction,
  serverTimestamp
} from "firebase/firestore";
import { db, auth } from "./firebase.js";

/**
 * Strict operation enumerators required for system-level audits.
 */
export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

/**
 * Custom Firestore permission checker that converts low-level rule errors to structural JSON errors.
 * Required by HFC automated diagnostics tools to debug Security Rules.
 * 
 * @param {Error|unknown} error 
 * @param {string} operationType - from OperationType
 * @param {string|null} path - target Firestore collection/doc path
 */
export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    }
  };
  
  console.error('Firestore Error Occurred: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Create a new document in a collection.
 * Supports custom IDs or auto-generated UUIDs.
 * 
 * @param {string} collectionPath 
 * @param {Object} data 
 * @param {string|null} [customId] 
 * @returns {Promise<string>} - Returns the document ID
 */
export async function createDocument(collectionPath, data, customId = null) {
  const payload = {
    ...data,
    createdAt: data.createdAt || serverTimestamp(),
    updatedAt: data.updatedAt || serverTimestamp(),
  };

  try {
    if (customId) {
      const docRef = doc(db, collectionPath, customId.trim());
      await setDoc(docRef, payload);
      return customId.trim();
    } else {
      const collRef = collection(db, collectionPath);
      const docRef = await addDoc(collRef, payload);
      return docRef.id;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, collectionPath);
  }
}

/**
 * Update an existing document fields.
 * 
 * @param {string} collectionPath 
 * @param {string} docId 
 * @param {Object} data 
 * @returns {Promise<void>}
 */
export async function updateDocument(collectionPath, docId, data) {
  if (!docId) {
    return Promise.reject(new Error("Document ID must be provided for updates."));
  }

  const payload = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  const path = `${collectionPath}/${docId}`;
  try {
    const docRef = doc(db, collectionPath, docId);
    await updateDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Deletes a document from the collection.
 * 
 * @param {string} collectionPath 
 * @param {string} docId 
 * @returns {Promise<void>}
 */
export async function deleteDocument(collectionPath, docId) {
  if (!docId) {
    return Promise.reject(new Error("Document ID must be provided for deletion."));
  }

  const path = `${collectionPath}/${docId}`;
  try {
    const docRef = doc(db, collectionPath, docId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Retrieve a single document with its metadata.
 * 
 * @param {string} collectionPath 
 * @param {string} docId 
 * @returns {Promise<Object|null>}
 */
export async function getDocument(collectionPath, docId) {
  if (!docId) {
    return Promise.reject(new Error("Document ID must be provided to fetch record."));
  }

  const path = `${collectionPath}/${docId}`;
  try {
    const docRef = doc(db, collectionPath, docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Get all document rows from a collection.
 * 
 * @param {string} collectionPath 
 * @returns {Promise<Array<Object>>}
 */
export async function getCollection(collectionPath) {
  try {
    const collRef = collection(db, collectionPath);
    const snap = await getDocs(collRef);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

/**
 * Execute custom filters and queries on a collection.
 * 
 * @param {string} collectionPath 
 * @param {Array<import("firebase/firestore").QueryConstraint>} constraints 
 * @returns {Promise<Array<Object>>}
 */
export async function queryCollection(collectionPath, constraints = []) {
  try {
    const collRef = collection(db, collectionPath);
    const q = query(collRef, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

/**
 * Transaction wrapper ensuring read-before-write safety across operations.
 * 
 * @param {Function} callback - Callback function with signature (transaction) => Promise<any>
 * @returns {Promise<any>}
 */
export async function runSafeTransaction(callback) {
  try {
    return await runTransaction(db, callback);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "atomic_transaction");
  }
}
