/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange Design System - theme.js
 * Theme initialization, state saving, and custom preference handlers.
 */

export class HFCTheme {
  static STORAGE_KEY = 'hfc_custom_variables';

  /**
   * Load any saved styling changes from local storage and apply to root scope
   */
  static init() {
    try {
      const savedVars = localStorage.getItem(this.STORAGE_KEY);
      if (savedVars) {
        const variables = JSON.parse(savedVars);
        const root = document.documentElement;
        
        Object.keys(variables).forEach(key => {
          root.style.setProperty(key, variables[key]);
        });
      }
    } catch (e) {
      console.warn('Failed to load local storage theme overrides:', e);
    }
  }

  /**
   * Save customized CSS variable overrides
   * @param {Object} variables - Key-value pair of custom CSS variable overrides
   */
  static saveOverrides(variables) {
    try {
      const savedVarsStr = localStorage.getItem(this.STORAGE_KEY) || '{}';
      const currentVars = JSON.parse(savedVarsStr);
      
      const mergedVars = { ...currentVars, ...variables };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(mergedVars));
    } catch (e) {
      console.warn('Failed to persist custom theme settings:', e);
    }
  }

  /**
   * Clear all custom theme modifications and restore exchange defaults
   */
  static clearOverrides() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      const root = document.documentElement;
      
      // Remove known custom properties to trigger defaults
      root.style.removeProperty('--hfc-primary');
      root.style.removeProperty('--hfc-primary-rgb');
      root.style.removeProperty('--hfc-radius-md');
      root.style.removeProperty('--hfc-glass-blur');
    } catch (e) {
      console.warn('Failed to clean custom theme preferences:', e);
    }
  }
}
