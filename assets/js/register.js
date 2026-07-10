/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Registration Page Controller
 * Establishes secure registration gateways, validation constraints, profile builders, and wallet initializers.
 */

import { auth } from "/firebase/firebase.js";
import { registerUser, logoutUser, sendEmailVerification } from "/firebase/auth.js";
import { createDocument, queryCollection } from "/firebase/firestore.js";
import { where } from "firebase/firestore";
import { redirectIfAuthenticated } from "/js/authGuard.js";
import { validateEmail, showToast, generateUniqueId } from "/js/utils.js";

// Execute immediate guest-only page guard redirection
redirectIfAuthenticated("dashboard.html");

/**
 * Validates Pakistan phone format (+923xx... or 03xx... or 923xx... with total 9 digits after 3)
 * @param {string} phone 
 * @returns {boolean}
 */
function validatePakistanPhone(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  const regex = /^((\+92)|(0092)|(92))?3[0-9]{9}$|^03[0-9]{9}$/;
  return regex.test(cleaned);
}

/**
 * Validates a strong password meeting professional trading requirements
 * Requirements: Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 digit, and 1 special character
 * @param {string} password 
 * @returns {boolean}
 */
function validateStrongPassword(password) {
  if (!password || password.length < 8) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return hasUpper && hasLower && hasDigit && hasSpecial;
}

document.addEventListener("DOMContentLoaded", () => {
  // Populate the current footer year dynamically
  const currentYearEl = document.getElementById("currentYear");
  if (currentYearEl) {
    currentYearEl.textContent = new Date().getFullYear();
  }

  // Form Field Elements
  const registerForm = document.getElementById("registerForm");
  const fullNameInput = document.getElementById("fullNameInput");
  const usernameInput = document.getElementById("usernameInput");
  const emailInput = document.getElementById("emailInput");
  const phoneInput = document.getElementById("phoneInput");
  const passwordInput = document.getElementById("passwordInput");
  const confirmPasswordInput = document.getElementById("confirmPasswordInput");
  const termsCheckbox = document.getElementById("termsCheckbox");
  const termsFeedback = document.getElementById("termsFeedback");

  // Custom Interactive Toggle Triggers
  const passwordToggleBtn = document.getElementById("passwordToggleBtn");
  const passwordToggleIcon = document.getElementById("passwordToggleIcon");
  const confirmPasswordToggleBtn = document.getElementById("confirmPasswordToggleBtn");
  const confirmPasswordToggleIcon = document.getElementById("confirmPasswordToggleIcon");
  const registerBtn = document.getElementById("registerBtn");
  const registerBtnIcon = document.getElementById("registerBtnIcon");

  /**
   * Password Visibility Toggle: Main Password Input
   */
  if (passwordToggleBtn && passwordInput && passwordToggleIcon) {
    passwordToggleBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      passwordToggleIcon.className = isPassword ? "bi bi-eye-slash" : "bi bi-eye";
      passwordToggleBtn.setAttribute(
        "aria-label", 
        isPassword ? "Hide password" : "Show password"
      );
    });
  }

  /**
   * Password Visibility Toggle: Confirm Password Input
   */
  if (confirmPasswordToggleBtn && confirmPasswordInput && confirmPasswordToggleIcon) {
    confirmPasswordToggleBtn.addEventListener("click", () => {
      const isPassword = confirmPasswordInput.type === "password";
      confirmPasswordInput.type = isPassword ? "text" : "password";
      confirmPasswordToggleIcon.className = isPassword ? "bi bi-eye-slash" : "bi bi-eye";
      confirmPasswordToggleBtn.setAttribute(
        "aria-label", 
        isPassword ? "Hide password" : "Show password"
      );
    });
  }

  /**
   * Real-time validation helper classes
   */
  function applyValidationState(element, isValid) {
    if (isValid) {
      element.classList.remove("is-invalid");
      element.classList.add("is-valid");
      element.setAttribute("aria-invalid", "false");
    } else {
      element.classList.remove("is-valid");
      element.classList.add("is-invalid");
      element.setAttribute("aria-invalid", "true");
    }
  }

  // Real-time listener: Full Name
  if (fullNameInput) {
    fullNameInput.addEventListener("input", () => {
      const value = fullNameInput.value.trim();
      if (!value) {
        fullNameInput.classList.remove("is-valid", "is-invalid");
        fullNameInput.setAttribute("aria-invalid", "false");
      } else {
        applyValidationState(fullNameInput, value.length >= 3);
      }
    });
  }

  // Real-time listener: Username (3-20 characters, alphanumeric and underscore)
  if (usernameInput) {
    usernameInput.addEventListener("input", () => {
      const value = usernameInput.value.trim();
      if (!value) {
        usernameInput.classList.remove("is-valid", "is-invalid");
        usernameInput.setAttribute("aria-invalid", "false");
      } else {
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        applyValidationState(usernameInput, usernameRegex.test(value));
      }
    });
  }

  // Real-time listener: Email
  if (emailInput) {
    emailInput.addEventListener("input", () => {
      const value = emailInput.value.trim();
      if (!value) {
        emailInput.classList.remove("is-valid", "is-invalid");
        emailInput.setAttribute("aria-invalid", "false");
      } else {
        applyValidationState(emailInput, validateEmail(value));
      }
    });
  }

  // Real-time listener: Phone
  if (phoneInput) {
    phoneInput.addEventListener("input", () => {
      const value = phoneInput.value.trim();
      if (!value) {
        phoneInput.classList.remove("is-valid", "is-invalid");
        phoneInput.setAttribute("aria-invalid", "false");
      } else {
        applyValidationState(phoneInput, validatePakistanPhone(value));
      }
    });
  }

  // Real-time listener: Password
  if (passwordInput) {
    passwordInput.addEventListener("input", () => {
      const value = passwordInput.value;
      if (!value) {
        passwordInput.classList.remove("is-valid", "is-invalid");
        passwordInput.setAttribute("aria-invalid", "false");
      } else {
        applyValidationState(passwordInput, validateStrongPassword(value));
      }
      
      // Update confirm password field validation state if it has content
      if (confirmPasswordInput && confirmPasswordInput.value) {
        applyValidationState(confirmPasswordInput, confirmPasswordInput.value === value);
      }
    });
  }

  // Real-time listener: Confirm Password
  if (confirmPasswordInput && passwordInput) {
    confirmPasswordInput.addEventListener("input", () => {
      const value = confirmPasswordInput.value;
      if (!value) {
        confirmPasswordInput.classList.remove("is-valid", "is-invalid");
        confirmPasswordInput.setAttribute("aria-invalid", "false");
      } else {
        applyValidationState(confirmPasswordInput, value === passwordInput.value);
      }
    });
  }

  // Real-time listener: Terms Checkbox
  if (termsCheckbox && termsFeedback) {
    termsCheckbox.addEventListener("change", () => {
      if (termsCheckbox.checked) {
        termsFeedback.classList.add("d-none");
        termsCheckbox.setAttribute("aria-invalid", "false");
      } else {
        termsFeedback.classList.remove("d-none");
        termsCheckbox.setAttribute("aria-invalid", "true");
      }
    });
  }

  /**
   * Form Submit handler
   */
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fullName = fullNameInput.value.trim();
      const username = usernameInput.value.trim();
      const email = emailInput.value.trim();
      const phone = phoneInput.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      let isFormValid = true;
      let firstInvalidField = null;

      // 1. Full Name Validation
      if (fullName.length < 3) {
        applyValidationState(fullNameInput, false);
        isFormValid = false;
        if (!firstInvalidField) firstInvalidField = fullNameInput;
      } else {
        applyValidationState(fullNameInput, true);
      }

      // 2. Username Validation
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        applyValidationState(usernameInput, false);
        isFormValid = false;
        if (!firstInvalidField) firstInvalidField = usernameInput;
      } else {
        applyValidationState(usernameInput, true);
      }

      // 3. Email Validation
      if (!validateEmail(email)) {
        applyValidationState(emailInput, false);
        isFormValid = false;
        if (!firstInvalidField) firstInvalidField = emailInput;
      } else {
        applyValidationState(emailInput, true);
      }

      // 4. Phone Validation
      if (!validatePakistanPhone(phone)) {
        applyValidationState(phoneInput, false);
        isFormValid = false;
        if (!firstInvalidField) firstInvalidField = phoneInput;
      } else {
        applyValidationState(phoneInput, true);
      }

      // 5. Password Validation
      if (!validateStrongPassword(password)) {
        applyValidationState(passwordInput, false);
        isFormValid = false;
        if (!firstInvalidField) firstInvalidField = passwordInput;
      } else {
        applyValidationState(passwordInput, true);
      }

      // 6. Confirm Password Validation
      if (password !== confirmPassword) {
        applyValidationState(confirmPasswordInput, false);
        isFormValid = false;
        if (!firstInvalidField) firstInvalidField = confirmPasswordInput;
      } else {
        applyValidationState(confirmPasswordInput, true);
      }

      // 7. Terms & Conditions Validation
      if (!termsCheckbox.checked) {
        termsFeedback.classList.remove("d-none");
        termsCheckbox.setAttribute("aria-invalid", "true");
        isFormValid = false;
        if (!firstInvalidField) firstInvalidField = termsCheckbox;
      } else {
        termsFeedback.classList.add("d-none");
        termsCheckbox.setAttribute("aria-invalid", "false");
      }

      // Stop and focus first invalid field if any check failed
      if (!isFormValid) {
        if (firstInvalidField) {
          firstInvalidField.focus();
        }
        return;
      }

      // Disable inputs and button during network calls to prevent duplicate submissions
      const formInputs = [
        fullNameInput, 
        usernameInput, 
        emailInput, 
        phoneInput, 
        passwordInput, 
        confirmPasswordInput, 
        termsCheckbox, 
        passwordToggleBtn, 
        confirmPasswordToggleBtn,
        registerBtn
      ];

      formInputs.forEach(input => {
        if (input) input.disabled = true;
      });

      // Update button design state to loading spinner
      const buttonLabel = registerBtn.querySelector("span");
      if (buttonLabel) {
        buttonLabel.textContent = "Initializing HFC Node...";
      }
      if (registerBtnIcon) {
        registerBtnIcon.className = "bi bi-arrow-repeat animate-spin-loader";
      }

      let createdUser = null;

      try {
        // Step 1: Create the User in Firebase Authentication
        // registerUser returns a promise and logs the user in immediately
        createdUser = await registerUser(email, password, fullName);

        // Step 2: Validate Username Uniqueness inside Firestore
        // Since the user is registered & logged in, list queries are permitted by our updated firestore rules
        const matches = await queryCollection("users", [
          where("username", "==", username.toLowerCase())
        ]);

        if (matches && matches.length > 0) {
          // Username already exists! Cleanup the Auth user record to maintain security and integrity
          await createdUser.delete();
          throw new Error("The username is already taken on HFC Exchange. Please select another.");
        }

        // Step 3: Create user record document in "users" collection
        await createDocument("users", {
          uid: createdUser.uid,
          fullName: fullName,
          displayName: fullName,
          username: username.toLowerCase(),
          email: email,
          phone: phone,
          role: "user", // Supports "user", "admin", "moderator"
          status: "active",
          lastLogin: null,
          profileImage: "",
          photoURL: "",
          isAdmin: false,
          preferredCurrency: "PKR",
          notificationEnabled: true,
          theme: "dark",
          language: "English",
          currency: "PKR"
        }, createdUser.uid);

        // Step 4: Create PKR Wallet Balance document in "wallets" collection
        const walletId = generateUniqueId("wallet");
        await createDocument("wallets", {
          walletId: walletId,
          ownerId: createdUser.uid,
          currency: "PKR",
          balance: 0,
          address: "HFC-PKR-" + createdUser.uid.substring(0, 16).toUpperCase()
        }, walletId);

        // Step 5: Send the account verification security email
        await sendEmailVerification();

        // Show Success Toast informing about the email verification
        showToast("Registration successful! Verification email sent. Please check your inbox before accessing the exchange.", "success", 5000);

        // Step 6: Log out the newly registered user so they must sign in fresh with verification
        await logoutUser();

        // Redirect to login page after a friendly transition delay
        setTimeout(() => {
          window.location.href = "login.html";
        }, 3000);

      } catch (error) {
        console.error("HFC Registration Exception:", error);

        // Determine user friendly error message
        let errorMsg = error.message;
        if (errorMsg && errorMsg.includes("auth/email-already-in-use")) {
          errorMsg = "This email address is already registered on HFC Exchange.";
        } else if (errorMsg && errorMsg.includes("auth/weak-password")) {
          errorMsg = "The password strength does not meet the secure gateway requirements.";
        } else if (errorMsg && errorMsg.includes("permission-denied")) {
          errorMsg = "Firestore gateway rejected registration parameters. Try again.";
        }

        showToast(errorMsg || "An error occurred during account registration. Contact system operations.", "danger", 6000);

        // Re-enable all inputs
        formInputs.forEach(input => {
          if (input) input.disabled = false;
        });

        // Restore registration button state
        if (buttonLabel) {
          buttonLabel.textContent = "Initialize HFC Node";
        }
        if (registerBtnIcon) {
          registerBtnIcon.className = "bi bi-shield-lock";
        }

        // Focus password and flag invalid
        if (passwordInput) {
          passwordInput.value = "";
          if (confirmPasswordInput) confirmPasswordInput.value = "";
          passwordInput.classList.remove("is-valid");
          passwordInput.classList.add("is-invalid");
          passwordInput.focus();
        }
      }
    });
  }
});
