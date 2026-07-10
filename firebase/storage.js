/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Cloud Storage Library
 * Handles robust file upload pipelines, size/format validations, and deletion handlers.
 */

import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from "firebase/storage";
import { storage } from "./firebase.js";

// Standard security configurations for images
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Megabytes default

/**
 * Upload an image file securely to Cloud Storage
 * 
 * @param {File} file - Web File API object from file input
 * @param {string} [folderPath] - Target directory (default: 'uploads')
 * @returns {Promise<string>} - Resolves to the public secure download URL
 */
export async function uploadImage(file, folderPath = "uploads") {
  if (!file) {
    return Promise.reject(new Error("Upload failed: No file was supplied."));
  }

  // Type validation
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return Promise.reject(
      new Error(`Upload rejected: File type '${file.type}' is unauthorized. Use JPEG, PNG, WEBP, or GIF.`)
    );
  }

  // Size validation
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    return Promise.reject(
      new Error(`Upload rejected: File is ${sizeInMB}MB. Maximum authorized size is 5.00MB.`)
    );
  }

  try {
    // Generate secure randomized kebab name to avoid cache collision and path poisoning
    const extension = file.name.split('.').pop() || "png";
    const cleanFolderName = folderPath.replace(/[^a-zA-Z0-9_\-/]/g, '');
    const randomizedName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${extension}`;
    const targetPath = `${cleanFolderName}/${randomizedName}`;

    const storageRef = ref(storage, targetPath);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);

    return downloadURL;
  } catch (error) {
    return Promise.reject(new Error(`Storage Upload Error: ${error.message}`));
  }
}

/**
 * Delete an image file from Cloud Storage using its direct reference URL
 * 
 * @param {string} imageURL - The direct download URL of the image
 * @returns {Promise<void>}
 */
export async function deleteImage(imageURL) {
  if (!imageURL) {
    return Promise.reject(new Error("Deletion failed: No storage URL was specified."));
  }

  try {
    const storageRef = ref(storage, imageURL);
    await deleteObject(storageRef);
  } catch (error) {
    return Promise.reject(new Error(`Storage Deletion Error: ${error.message}`));
  }
}

/**
 * Retrieve a secure download URL from a raw Cloud Storage filepath
 * 
 * @param {string} filePath - Path inside the bucket (e.g. 'avatars/user-123.jpg')
 * @returns {Promise<string>}
 */
export async function getImageURL(filePath) {
  if (!filePath) {
    return Promise.reject(new Error("URL request failed: Filepath cannot be empty."));
  }

  try {
    const storageRef = ref(storage, filePath);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    return Promise.reject(new Error(`Storage URL Retrieval Error: ${error.message}`));
  }
}
