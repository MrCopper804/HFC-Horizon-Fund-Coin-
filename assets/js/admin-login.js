/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Admin Login Page Controller
 * Establishes secure administrative gateway logins, real-time validations, and automatic logout of unauthorized nodes.
 */

import { setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { auth } from "/firebase/firebase.js";
import { getCurrentUser, loginUser, logoutUser, forgotPassword } from "/firebase/auth.js";
import { getDocument } from "/firebase/firestore.js";
import { validateEmail, validatePassword, showToast } from "/js/utils.js";
import { Modal } from "/components/Modal.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Populate the current footer year dynamically
  const currentYearEl = document.getElementById("currentYear");
  if (currentYearEl) {
    currentYearEl.textContent = new Date().getFullYear();
  }

  // Form Field Elements
  const adminLoginForm = document.getElementById("adminLoginForm");
  const emailInput = document.getElementById("adminEmailInput");
  const passwordInput = document.getElementById("adminPasswordInput");
  
  // Custom Interactive Elements
  const passwordToggleBtn = document.getElementById("adminPasswordToggleBtn");
  const passwordToggleIcon = document.getElementById("adminPasswordToggleIcon");
  const rememberMeCheckbox = document.getElementById("adminRememberMe");
  const forgotPasswordLink = document.getElementById("adminForgotPasswordLink");
  const loginBtn = document.getElementById("adminLoginBtn");
  const loginBtnIcon = document.getElementById("adminLoginBtnIcon");

  // Load remembered email if present
  if (emailInput) {
    const rememberedEmail = localStorage.getItem("hfc_admin_remember_email");
    if (rememberedEmail) {
      emailInput.value = rememberedEmail;
      if (rememberMeCheckbox) {
        rememberMeCheckbox.checked = true;
      }
    }
  }

  /**
   * Fast Boot Check: If already logged in as admin, auto-redirect
   */
  try {
    const user = await getCurrentUser();
    if (user) {
      const userProfile = await getDocument("users", user.uid);
      if (userProfile && userProfile.role === "admin") {
        showToast("Admin session restored. Synchronizing console...", "success", 1500);
        setTimeout(() => {
          window.location.href = "/admin/dashboard.html";
        }, 1200);
        return;
      }
    }
  } catch (err) {
    console.warn("Session restore check bypassed:", err);
  }

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
   * Realtime Email Input Validation
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
   * Realtime Password Input Validation
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
   * Trigger password reset securely using the template modal helper
   */
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", async (e) => {
      e.preventDefault();
      const emailVal = emailInput ? emailInput.value.trim() : "";

      if (validateEmail(emailVal)) {
        Modal.confirm({
          title: "Reset Admin Secure Key",
          body: `<p>A secure reset link will be sent to <strong>${emailVal}</strong>. Do you wish to initialize the remote recovery protocol?</p>`,
          confirmText: "Authorize Reset",
          confirmClass: "btn-hfc-danger",
          onConfirm: async (modal) => {
            try {
              await forgotPassword(emailVal);
              showToast("Password reset instructions sent. Please check your secure mailbox.", "success");
            } catch (err) {
              showToast(err.message || "Failed to trigger secure reset protocol.", "danger");
            }
          }
        });
      } else {
        // Fallback prompt for clean manual input
        const userEmail = prompt("Please specify your HFC administrator email address to initialize secure recovery:");
        if (userEmail) {
          const trimmedEmail = userEmail.trim();
          if (validateEmail(trimmedEmail)) {
            try {
              await forgotPassword(trimmedEmail);
              showToast("Password reset instructions sent. Please check your secure mailbox.", "success");
            } catch (err) {
              showToast(err.message || "Failed to trigger secure reset protocol.", "danger");
            }
          } else {
            showToast("The entered email address is not in a valid format.", "danger");
          }
        }
      }
    });
  }

  /**
   * Form Submit: Authenticate, check Role === "admin", and enforce strict guards
   */
  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      let isFormValid = true;
      let firstInvalidField = null;

      // Validate Email Format
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

      // Validate Password Format (at least 6 characters, contains a digit)
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

      // Abort and highlight error field
      if (!isFormValid) {
        if (firstInvalidField) {
          firstInvalidField.focus();
        }
        return;
      }

      // Disable inputs during network calls to prevent concurrent logins
      const inputs = [emailInput, passwordInput, rememberMeCheckbox, passwordToggleBtn, loginBtn];
      inputs.forEach(input => {
        if (input) input.disabled = true;
      });

      // Update button design status to spinner state
      const buttonLabel = loginBtn.querySelector("span");
      if (buttonLabel) {
        buttonLabel.textContent = "Verifying Terminal Authority...";
      }
      if (loginBtnIcon) {
        loginBtnIcon.className = "bi bi-arrow-repeat animate-spin-loader";
      }

      try {
        // Configure Session Persistence based on Checkbox
        const persistence = rememberMeCheckbox && rememberMeCheckbox.checked 
          ? browserLocalPersistence 
          : browserSessionPersistence;
        await setPersistence(auth, persistence);

        // Standard Login
        await loginUser(email, password);

        // Fetch User profile to perform Strict Role-Based Access Control (RBAC) check
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Unable to establish secure connection with Authentication nodes.");
        }

        const userProfile = await getDocument("users", currentUser.uid);

        // Strict validation of Role constraint
        if (!userProfile || userProfile.role !== "admin") {
          // Log out immediately!
          await logoutUser();
          throw new Error("Access Denied. Only registered HFC Exchange administrators are authorized to enter this portal.");
        }

        // Persist "Remember Terminal" email
        if (rememberMeCheckbox && rememberMeCheckbox.checked) {
          localStorage.setItem("hfc_admin_remember_email", email);
        } else {
          localStorage.removeItem("hfc_admin_remember_email");
        }

        // Show Success Toast
        showToast("Gateway Credentials Verified! Opening secure console...", "success", 2000);

        // Redirect to admin dashboard
        setTimeout(() => {
          window.location.href = "/admin/dashboard.html";
        }, 1500);

      } catch (error) {
        console.error("Admin Security Gate Violation:", error);
        
        // Show safe, user-friendly error toast
        showToast(error.message || "Admin authorization failed. Gateway access blocked.", "danger", 6000);

        // Re-enable form fields
        inputs.forEach(input => {
          if (input) input.disabled = false;
        });

        // Restore login button label & icon
        if (buttonLabel) {
          buttonLabel.textContent = "Initialize Terminal";
        }
        if (loginBtnIcon) {
          loginBtnIcon.className = "bi bi-shield-fill-check";
        }

        // Highlight inputs as invalid and focus password
        passwordInput.classList.remove("is-valid");
        passwordInput.classList.add("is-invalid");
        passwordInput.value = ""; // Clear password for safety
        passwordInput.focus();
      }
    });
  }
});
