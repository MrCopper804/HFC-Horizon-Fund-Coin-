/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Login Page Controller
 * Establishes secure gateway authentications, interactive validations, and redirect routing.
 */

import { setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { auth } from "/firebase/firebase.js";
import { loginUser } from "/firebase/auth.js";
import { redirectIfAuthenticated } from "/js/authGuard.js";
import { validateEmail, validatePassword, showToast } from "/js/utils.js";

// Execute immediate guest-only page guard redirection
redirectIfAuthenticated("dashboard.html");

document.addEventListener("DOMContentLoaded", () => {
  // Populate the current footer year dynamically
  const currentYearEl = document.getElementById("currentYear");
  if (currentYearEl) {
    currentYearEl.textContent = new Date().getFullYear();
  }

  // Form Field Elements
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  
  // Custom Interactive Elements
  const passwordToggleBtn = document.getElementById("passwordToggleBtn");
  const passwordToggleIcon = document.getElementById("passwordToggleIcon");
  const rememberMeCheckbox = document.getElementById("rememberMeCheckbox");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const registerLink = document.getElementById("registerLink");
  const loginBtn = document.getElementById("loginBtn");
  const loginBtnIcon = document.getElementById("loginBtnIcon");

  /**
   * Toggle password input visibility (Show/Hide)
   */
  if (passwordToggleBtn && passwordInput && passwordToggleIcon) {
    passwordToggleBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      
      // Update visual icons
      passwordToggleIcon.className = isPassword ? "bi bi-eye-slash" : "bi bi-eye";
      
      // Update ARIA assistive text
      passwordToggleBtn.setAttribute(
        "aria-label", 
        isPassword ? "Hide password" : "Show password"
      );
    });
  }

  /**
   * Client-side Realtime Email Input Validation Feedback
   */
  if (emailInput) {
    emailInput.addEventListener("input", () => {
      const email = emailInput.value.trim();
      if (!email) {
        emailInput.classList.remove("is-valid", "is-invalid");
        emailInput.setAttribute("aria-invalid", "false");
      } else if (validateEmail(email)) {
        emailInput.classList.remove("is-invalid");
        emailInput.classList.add("is-valid");
        emailInput.setAttribute("aria-invalid", "false");
      } else {
        emailInput.classList.remove("is-valid");
        emailInput.classList.add("is-invalid");
        emailInput.setAttribute("aria-invalid", "true");
      }
    });
  }

  /**
   * Client-side Realtime Password Input Validation Feedback
   */
  if (passwordInput) {
    passwordInput.addEventListener("input", () => {
      const password = passwordInput.value;
      if (!password) {
        passwordInput.classList.remove("is-valid", "is-invalid");
        passwordInput.setAttribute("aria-invalid", "false");
      } else if (validatePassword(password)) {
        passwordInput.classList.remove("is-invalid");
        passwordInput.classList.add("is-valid");
        passwordInput.setAttribute("aria-invalid", "false");
      } else {
        passwordInput.classList.remove("is-valid");
        passwordInput.classList.add("is-invalid");
        passwordInput.setAttribute("aria-invalid", "true");
      }
    });
  }

  /**
   * Friendly notifications for placeholder pages
   */
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", (e) => {
      e.preventDefault();
      showToast(
        "Secure recovery links are sent automatically. Please contact our system admin node for account assistance.", 
        "info"
      );
    });
  }



  /**
   * Form Submit: Execute authentications and session locks
   */
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      let isFormValid = true;
      let firstInvalidField = null;

      // 1. Run Email checks
      if (!validateEmail(email)) {
        emailInput.classList.remove("is-valid");
        emailInput.classList.add("is-invalid");
        emailInput.setAttribute("aria-invalid", "true");
        isFormValid = false;
        if (!firstInvalidField) firstInvalidField = emailInput;
      } else {
        emailInput.classList.remove("is-invalid");
        emailInput.classList.add("is-valid");
        emailInput.setAttribute("aria-invalid", "false");
      }

      // 2. Run Password checks
      if (!validatePassword(password)) {
        passwordInput.classList.remove("is-valid");
        passwordInput.classList.add("is-invalid");
        passwordInput.setAttribute("aria-invalid", "true");
        isFormValid = false;
        if (!firstInvalidField) firstInvalidField = passwordInput;
      } else {
        passwordInput.classList.remove("is-invalid");
        passwordInput.classList.add("is-valid");
        passwordInput.setAttribute("aria-invalid", "false");
      }

      // If invalid, focus first error input and abort
      if (!isFormValid) {
        if (firstInvalidField) {
          firstInvalidField.focus();
        }
        return;
      }

      // 3. Disable all inputs to prevent multiple concurrent submit events
      const inputs = [emailInput, passwordInput, rememberMeCheckbox, passwordToggleBtn, loginBtn];
      inputs.forEach(input => {
        if (input) input.disabled = true;
      });

      // Update button design status to spinner state
      const buttonLabel = loginBtn.querySelector("span");
      if (buttonLabel) {
        buttonLabel.textContent = "Authorizing Node...";
      }
      if (loginBtnIcon) {
        loginBtnIcon.className = "bi bi-arrow-repeat animate-spin-loader";
      }

      try {
        // 4. Configure Firebase Persistence according to 'Remember Me' state
        const persistence = rememberMeCheckbox.checked ? browserLocalPersistence : browserSessionPersistence;
        await setPersistence(auth, persistence);

        // 5. Connect and Login User
        await loginUser(email, password);

        // Show Success Toast
        showToast("Gateway Authorization Successful! Syncing with cold ledger...", "success", 2000);

        // 6. Automatically redirect to dashboard.html after success delay
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 1500);

      } catch (error) {
        console.error("Auth Gate Error:", error);
        
        // Show Translated Safe Friendly Error Message
        showToast(error.message || "Credential authentication failed. Check gateway connection.", "danger", 5000);

        // Re-enable form fields
        inputs.forEach(input => {
          if (input) input.disabled = false;
        });

        // Restore login button label & icon
        if (buttonLabel) {
          buttonLabel.textContent = "Authorize & Sign In";
        }
        if (loginBtnIcon) {
          loginBtnIcon.className = "bi bi-arrow-right-circle";
        }

        // Highlight inputs as invalid and focus password
        passwordInput.classList.remove("is-valid");
        passwordInput.classList.add("is-invalid");
        passwordInput.value = ""; // Clear password for security
        passwordInput.focus();
      }
    });
  }
});
