/**
 * Firebase Config Management System
 * Stores and retrieves Firebase Config in LocalStorage
 */

const STORAGE_KEY = 'cloud_tasks_firebase_config';

/**
 * Check if the Firebase credentials exist in local storage
 * @returns {boolean}
 */
export function isFirebaseConfigured() {
  const config = localStorage.getItem(STORAGE_KEY);
  if (!config) return false;
  
  try {
    const parsed = JSON.parse(config);
    return !!(parsed.apiKey && parsed.projectId && parsed.databaseURL);
  } catch (e) {
    return false;
  }
}

/**
 * Get configuration from local storage
 * @returns {Object|null}
 */
export function getFirebaseConfig() {
  const config = localStorage.getItem(STORAGE_KEY);
  if (!config) return null;
  
  try {
    return JSON.parse(config);
  } catch (e) {
    return null;
  }
}

/**
 * Save Firebase Configuration to LocalStorage
 * @param {Object|string} configData - The raw JS object or JSON string from Firebase console
 * @returns {boolean} Success state
 */
export function saveFirebaseConfig(configData) {
  let configObj = null;

  if (typeof configData === 'object' && configData !== null) {
    configObj = configData;
  } else if (typeof configData === 'string') {
    // Try to parse as JSON first
    try {
      configObj = JSON.parse(configData);
    } catch (jsonErr) {
      // If it's a JS code snippet (e.g. const firebaseConfig = { ... }), try to extract the object portion
      try {
        // Regex to match anything inside { ... } in the string
        const match = configData.match(/\{[\s\S]*\}/);
        if (match) {
          // Parse using relaxed eval-like structure safely or string cleaning
          const objStr = match[0]
            .replace(/(\w+)\s*:/g, '"$1":') // add quotes to keys
            .replace(/'/g, '"')              // replace single quotes with double quotes
            .replace(/,\s*}/g, '}')          // remove trailing commas
            .replace(/,\s*\]/g, ']');        // remove trailing commas inside arrays
          configObj = JSON.parse(objStr);
        }
      } catch (regexErr) {
        console.error('Failed to parse text input as JavaScript Object:', regexErr);
      }
    }
  }

  // Validate required keys
  if (configObj && configObj.apiKey && configObj.projectId && configObj.databaseURL) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configObj));
    return true;
  }

  return false;
}

/**
 * Clear configuration from local storage
 */
export function resetFirebaseConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
