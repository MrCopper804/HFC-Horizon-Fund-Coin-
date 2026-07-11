/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - PKR Withdrawal Page Controller
 * Handles user authentication, real-time wallet sync, interactive payment methods,
 * withdrawal calculations, pending state management, hold balance locking,
 * user-initiated cancellations, and comprehensive ledger audit logs.
 */

import { protectPage } from "../../js/authGuard.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";
import { db } from "../../firebase/firebase.js";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  serverTimestamp,
  setDoc,
  getDoc
} from "firebase/firestore";
import { 
  createDocument, 
  updateDocument, 
  getDocument 
} from "../../firebase/firestore.js";

// Global Local State for the Withdraw Page
const state = {
  user: null,
  pkrWallet: null,           // Real-time PKR Wallet document
  withdrawals: [],           // Real-time user withdrawals list
  withdrawStatuses: {},      // Keep track of previous statuses for real-time alerts
  selectedMethod: "EasyPaisa", // "EasyPaisa", "JazzCash", "Bank Transfer"
  searchQuery: "",           // For withdrawal history filter
  activeFilter: "All",       // "All", "Pending", "Approved", "Rejected"
  
  // Withdrawal settings for future-ready configurations
  limits: {
    minWithdraw: 500,        // Minimum PKR withdrawal limit
    maxWithdraw: 500000,     // Maximum PKR withdrawal limit
    feePercentage: 0.02      // 2% processing fee (only charged on Admin approval)
  }
};

// Start Page Initialization on DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Guard the page and fetch the active authenticated user
  const user = await protectPage();
  if (!user) {
    // protectPage automatically redirects to login.html if unauthenticated
    return;
  }
  state.user = user;

  // 2. Initialize PageLayout
  const layout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: user.email,
      versionText: "HFC Engine v2.4",
      initialNotifications: [
        { id: 1, type: "info", text: "Withdrawal portal initialized." }
      ],
      onLogout: async () => {
        try {
          const { logoutUser } = await import("../../firebase/auth.js");
          await logoutUser();
          Toast.show("Secure session terminated.", { type: "info" });
          setTimeout(() => {
            window.location.href = "login.html";
          }, 1000);
        } catch (err) {
          Toast.show("Session termination error.", { type: "danger" });
        }
      }
    },
    sidebarOptions: {
      brandName: "HFC EXCHANGE",
      activeId: "withdraw",
      menuItems: [
        { id: "dashboard", label: "Dashboard", icon: "bi-grid-1x2-fill", href: "dashboard.html" },
        { id: "marketplace", label: "P2P Marketplace", icon: "bi-shop", href: "#" },
        { id: "wallets", label: "My Wallets", icon: "bi-wallet2", href: "wallet.html" },
        { id: "deposit", label: "Deposit Funds", icon: "bi-plus-circle-fill", href: "deposit.html" },
        { id: "withdraw", label: "Withdraw PKR", icon: "bi-dash-circle-fill", href: "withdraw.html" },
        { id: "transactions", label: "Escrow Ledger", icon: "bi-activity", href: "#" },
        { id: "security", label: "Settings node", icon: "bi-shield-lock", href: "#" }
      ],
      onNavigate: (item) => {
        if (item.id !== "withdraw" && item.id !== "wallets" && item.id !== "dashboard" && item.id !== "deposit") {
          Toast.show(`${item.label} interface integration is locked on this preview node.`, { type: "warning" });
        }
      }
    }
  });

  // 3. Render base frame container
  renderWithdrawFrame(layout);

  // 4. Initialize Database connections and listeners
  initRealtimeListeners();
});

/**
 * Render the full layout skeleton for Withdraw PKR page
 */
function renderWithdrawFrame(layout) {
  const container = layout.getContentContainer();
  if (!container) return;

  const currentTimeStr = "2026-07-10 08:55:59 UTC"; // Fixed system simulated baseline clock or user metadata
  const userDisplayName = state.user.displayName || state.user.email.split("@")[0];

  container.innerHTML = `
    <!-- Top Header Component -->
    <div class="row align-items-center mb-4">
      <div class="col-md-8">
        <h1 class="text-display fw-bold text-glow-primary text-white mb-1">Withdraw Funds</h1>
        <p class="text-secondary text-sm mb-0">Submit PKR payout requests directly to registered domestic channels. Payouts are manually approved by compliance admins within 2-4 business hours.</p>
      </div>
      <div class="col-md-4 text-md-end mt-3 mt-md-0">
        <div class="card-glass py-1.5 px-3 d-inline-flex flex-column align-items-md-end text-start">
          <span class="text-xs text-muted font-mono"><i class="bi bi-person-circle"></i> ${state.user.email}</span>
          <span class="text-xs text-muted font-mono"><i class="bi bi-clock"></i> <span id="payout-clock">${currentTimeStr}</span></span>
        </div>
      </div>
    </div>

    <!-- Summary Metrics Card row -->
    <div class="withdraw-summary-grid" id="withdraw-summary-cards">
      <!-- Skeleton Loaders initially -->
      <div class="summary-card success-edge">
        <div class="card-metric-label"><div class="skeleton-loader w-50 h-3"></div></div>
        <div class="card-metric-value text-white mt-1"><div class="skeleton-loader w-75 h-6"></div></div>
        <div class="card-metric-subtext"><div class="skeleton-loader w-100 h-2 mt-1"></div></div>
      </div>
      <div class="summary-card warning-edge">
        <div class="card-metric-label"><div class="skeleton-loader w-50 h-3"></div></div>
        <div class="card-metric-value text-white mt-1"><div class="skeleton-loader w-75 h-6"></div></div>
        <div class="card-metric-subtext"><div class="skeleton-loader w-100 h-2 mt-1"></div></div>
      </div>
      <div class="summary-card primary-edge">
        <div class="card-metric-label"><div class="skeleton-loader w-50 h-3"></div></div>
        <div class="card-metric-value text-white mt-1"><div class="skeleton-loader w-75 h-6"></div></div>
        <div class="card-metric-subtext"><div class="skeleton-loader w-100 h-2 mt-1"></div></div>
      </div>
      <div class="summary-card accent-edge">
        <div class="card-metric-label"><div class="skeleton-loader w-50 h-3"></div></div>
        <div class="card-metric-value text-white mt-1"><div class="skeleton-loader w-75 h-6"></div></div>
        <div class="card-metric-subtext"><div class="skeleton-loader w-100 h-2 mt-1"></div></div>
      </div>
    </div>

    <!-- Interactive Form and Selector Interface -->
    <div class="row g-4 mb-5">
      <!-- Step 1 & Form -->
      <div class="col-lg-7">
        <div class="card-glass h-100">
          <div class="border-bottom border-secondary border-opacity-10 p-4">
            <h2 class="text-display fw-bold text-white fs-5 m-0 d-flex align-items-center gap-2">
              <span class="step-num-badge">1</span> Select Payout Method
            </h2>
          </div>
          
          <div class="p-4">
            <!-- Payout Methods Grid -->
            <div class="withdraw-methods-grid">
              <!-- EasyPaisa Card -->
              <div class="method-card active" id="method-easypaisa" data-method="EasyPaisa" role="radio" aria-checked="true" tabindex="0" aria-label="Select EasyPaisa payout">
                <div class="active-indicator"><i class="bi bi-check"></i></div>
                <div class="method-logo-badge logo-easypaisa">EP</div>
                <div class="mt-3">
                  <h4 class="text-white text-sm fw-bold mb-0">EasyPaisa</h4>
                  <p class="text-muted text-xxs mb-0">Instant Mobile Wallet</p>
                </div>
              </div>

              <!-- JazzCash Card -->
              <div class="method-card" id="method-jazzcash" data-method="JazzCash" role="radio" aria-checked="false" tabindex="0" aria-label="Select JazzCash payout">
                <div class="active-indicator"><i class="bi bi-check"></i></div>
                <div class="method-logo-badge logo-jazzcash">JC</div>
                <div class="mt-3">
                  <h4 class="text-white text-sm fw-bold mb-0">JazzCash</h4>
                  <p class="text-muted text-xxs mb-0">Instant Mobile Wallet</p>
                </div>
              </div>

              <!-- Bank Transfer Card -->
              <div class="method-card" id="method-bank" data-method="Bank Transfer" role="radio" aria-checked="false" tabindex="0" aria-label="Select Bank Transfer payout">
                <div class="active-indicator"><i class="bi bi-check"></i></div>
                <div class="method-logo-badge logo-bank">BT</div>
                <div class="mt-3">
                  <h4 class="text-white text-sm fw-bold mb-0">Bank Transfer</h4>
                  <p class="text-muted text-xxs mb-0">All Domestic Banks</p>
                </div>
              </div>
            </div>

            <!-- Steps 2: Submit Details -->
            <div class="d-flex align-items-center gap-2 mb-3">
              <span class="step-num-badge">2</span>
              <h3 class="text-display fw-bold text-white fs-5 m-0">Provide Payout Instructions</h3>
            </div>

            <!-- Main Form -->
            <form id="withdraw-form" class="row g-3 needs-validation" novalidate>
              <!-- Withdrawal Method (Hidden but controlled) -->
              <input type="hidden" id="withdraw-method-input" value="EasyPaisa">

              <!-- Amount Field -->
              <div class="col-md-6 form-group-glass m-0 mb-3">
                <label for="withdraw-amount" class="form-label text-xs text-muted uppercase">Withdraw Amount (PKR)</label>
                <div class="input-group">
                  <span class="input-group-text bg-transparent text-muted border-secondary text-mono">₨</span>
                  <input type="number" id="withdraw-amount" class="form-control form-control-glass text-white text-mono" placeholder="Min: 500" min="500" max="500000" step="any" required>
                  <button type="button" class="btn btn-outline-secondary btn-glass text-xxs" id="btn-withdraw-max">MAX</button>
                </div>
                <div class="form-text text-xxs text-muted mt-1 d-flex justify-content-between">
                  <span>Future-Ready validation: 500 - 500,000 PKR</span>
                  <span class="text-glow-primary cursor-pointer text-decoration-underline" id="view-fees-breakdown">View 2% processing fee rules</span>
                </div>
              </div>

              <!-- Account Holder Name -->
              <div class="col-md-6 form-group-glass m-0 mb-3">
                <label for="withdraw-holder-name" class="form-label text-xs text-muted uppercase">Account Holder Name</label>
                <input type="text" id="withdraw-holder-name" class="form-control form-control-glass text-white" placeholder="Recipient official name" required>
                <div class="form-text text-xxs text-muted mt-1">Must exactly match registered bank or mobile identity.</div>
              </div>

              <!-- Account Number -->
              <div class="col-12 form-group-glass m-0 mb-3">
                <label for="withdraw-account-number" class="form-label text-xs text-muted uppercase" id="label-account-number">Mobile Account Number</label>
                <input type="text" id="withdraw-account-number" class="form-control form-control-glass text-white text-mono" placeholder="e.g. 03XXXXXXXXX" required>
                <div class="form-text text-xxs text-muted mt-1" id="hint-account-number">Enter your 11-digit mobile wallet number.</div>
              </div>

              <!-- Optional Notes -->
              <div class="col-12 form-group-glass m-0 mb-4">
                <label for="withdraw-notes" class="form-label text-xs text-muted uppercase">Optional Notes for compliance auditors</label>
                <textarea id="withdraw-notes" class="form-control form-control-glass text-white text-xs" rows="2" placeholder="Bank branch name, IBAN details, or custom routing directions..."></textarea>
              </div>

              <!-- Submit Action Button -->
              <div class="col-12">
                <button type="submit" class="btn-hfc btn-hfc-primary w-100 py-2.5 fs-6 font-display" id="btn-submit-withdrawal">
                  <i class="bi bi-shield-lock-fill"></i> AUTHORIZE PKR WITHDRAWAL REQUEST
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Quick Guidance & Fees Explanation Panel -->
      <div class="col-lg-5">
        <div class="card-glass p-4 h-100 d-flex flex-column justify-content-between">
          <div>
            <h3 class="text-display fw-bold text-white fs-5 mb-3 d-flex align-items-center gap-2">
              <i class="bi bi-shield-check text-primary"></i> Secure Ledger Auditing
            </h3>
            <p class="text-muted text-xs leading-relaxed mb-4">The HFC Exchange protocol implements strict anti-double spend measures. When you authorize a payout, your PKR Available Balance is immediately held securely under escrow and cannot be traded or withdrawn elsewhere.</p>
            
            <div class="instruction-box">
              <h5 class="text-white text-sm fw-bold mb-2"><i class="bi bi-info-circle text-primary"></i> Compliance Checks</h5>
              <ul class="text-muted text-xs ps-3 m-0 d-flex flex-column gap-2">
                <li>No immediate payouts are sent; manual compliance auditing prevents illicit transfers.</li>
                <li><strong>Hold Balance:</strong> Your requested amount remains locked in Hold Balance until compliance verification.</li>
                <li><strong>Fee Application:</strong> The standard 2% processing fee is deducted only after compliance node approval. No pre-deductions are made.</li>
                <li><strong>Cancellations:</strong> You can instantly revoke any "Pending" status requests, returning the hold amount to available balance immediately.</li>
              </ul>
            </div>
          </div>

          <div class="p-3 border-start border-warning border-3 bg-white bg-opacity-5 rounded">
            <h6 class="text-warning text-xs fw-bold mb-1"><i class="bi bi-exclamation-triangle-fill"></i> Critical Safety Notice</h6>
            <p class="text-muted text-xxs m-0 leading-relaxed">Providing incorrect account details will lead to irreversible ledger verification failures. Double check your mobile wallet number or banking routing instructions before signing this transaction block.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Withdrawal Payout History and Real-Time Ledger -->
    <div class="card-glass p-0">
      <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between p-4 border-bottom border-secondary border-opacity-10 gap-3">
        <div>
          <h3 class="text-display fw-bold text-white fs-5 m-0 d-flex align-items-center gap-2">
            <i class="bi bi-clock-history text-accent"></i> PKR Withdrawal Audit Trail
          </h3>
          <p class="text-secondary text-xxs mb-0 mt-0.5">Real-time peer ledger sync. Tracks withdrawal history, approval fees, and decision signatures.</p>
        </div>
        
        <!-- Filter Controls -->
        <div class="d-flex flex-wrap gap-2">
          <!-- Search Control -->
          <div class="search-input-wrapper" style="max-width: 200px;">
            <i class="bi bi-search" style="font-size: 11px;"></i>
            <input type="text" id="withdraw-search" class="form-control form-control-glass text-white text-xs py-1" style="padding-left: 28px;" placeholder="Search ID..." aria-label="Search withdrawals by id">
          </div>

          <!-- Status Filter Tabs -->
          <div class="withdraw-filter-tabs" role="tablist">
            <button class="withdraw-filter-tab-btn active" id="tab-all" role="tab" aria-selected="true" data-filter="All">All</button>
            <button class="withdraw-filter-tab-btn" id="tab-pending" role="tab" aria-selected="false" data-filter="Pending">Pending</button>
            <button class="withdraw-filter-tab-btn" id="tab-approved" role="tab" aria-selected="false" data-filter="Approved">Approved</button>
            <button class="withdraw-filter-tab-btn" id="tab-rejected" role="tab" aria-selected="false" data-filter="Rejected">Rejected</button>
          </div>
        </div>
      </div>

      <!-- History Table Wrapper -->
      <div id="withdrawals-table-wrapper" class="p-0">
        <!-- Loader Fallback -->
        <div class="p-5 text-center">
          <div class="spinner-border text-primary" role="status" style="width: 2rem; height: 2rem;">
            <span class="visually-hidden">Syncing audit logs...</span>
          </div>
          <p class="text-muted text-xs mt-2">Connecting to peer verification nodes...</p>
        </div>
      </div>
    </div>
  `;

  // Bind Dynamic UI Actions
  bindUIActions();
}

/**
 * Bind DOM events, form submissions, click handlers, and input restrictions
 */
function bindUIActions() {
  // Method selection cards
  const methodCards = document.querySelectorAll(".method-card");
  const methodInput = document.getElementById("withdraw-method-input");
  const labelAccount = document.getElementById("label-account-number");
  const hintAccount = document.getElementById("hint-account-number");
  const accountInput = document.getElementById("withdraw-account-number");

  methodCards.forEach(card => {
    card.addEventListener("click", () => {
      methodCards.forEach(c => {
        c.classList.remove("active");
        c.setAttribute("aria-checked", "false");
      });
      card.classList.add("active");
      card.setAttribute("aria-checked", "true");

      const selected = card.getAttribute("data-method");
      state.selectedMethod = selected;
      if (methodInput) methodInput.value = selected;

      // Adjust Form Labels & hints dynamically
      if (selected === "Bank Transfer") {
        if (labelAccount) labelAccount.textContent = "Bank IBAN or Account Number";
        if (hintAccount) hintAccount.textContent = "Specify 24-character international IBAN or branch account number.";
        if (accountInput) accountInput.placeholder = "e.g. PK44HFC89234812390001";
      } else {
        if (labelAccount) labelAccount.textContent = "Mobile Account Number";
        if (hintAccount) hintAccount.textContent = "Enter your 11-digit mobile wallet number.";
        if (accountInput) accountInput.placeholder = "e.g. 03XXXXXXXXX";
      }
    });

    // Support keyboard activation on focuses
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });
  });

  // MAX balance button click
  const maxBtn = document.getElementById("btn-withdraw-max");
  const amountInput = document.getElementById("withdraw-amount");
  if (maxBtn && amountInput) {
    maxBtn.addEventListener("click", () => {
      if (state.pkrWallet) {
        const available = state.pkrWallet.availableBalance !== undefined ? state.pkrWallet.availableBalance : (state.pkrWallet.balance || 0);
        
        // Respect maximum withdrawal limit
        const fillAmount = Math.min(available, state.limits.maxWithdraw);
        amountInput.value = fillAmount > 0 ? fillAmount : "";
        Toast.show(`Pre-filled maximum withdrawable balance: ${fillAmount.toLocaleString()} PKR.`, { type: "info" });
      } else {
        Toast.show("PKR wallet configuration missing. Deposit or seed balances first.", { type: "warning" });
      }
    });
  }

  // Fees Breakdown Explanation modal trigger
  const feesTrigger = document.getElementById("view-fees-breakdown");
  if (feesTrigger) {
    feesTrigger.addEventListener("click", () => {
      const modalBody = `
        <div class="p-1">
          <p class="text-sm text-muted">HFC Exchange maintains physical liquidity hubs with a secure 1:1 local reserve framework. The 2% processing fee is standard across domestic channels:</p>
          <div class="card-glass p-3 mb-3 text-mono text-xs">
            <div class="d-flex justify-content-between mb-2">
              <span class="text-muted">Minimum Transaction:</span>
              <span class="text-white">500.00 PKR</span>
            </div>
            <div class="d-flex justify-content-between mb-2">
              <span class="text-muted">Maximum Transaction:</span>
              <span class="text-white">500,000.00 PKR</span>
            </div>
            <div class="d-flex justify-content-between">
              <span class="text-muted">Compliance Fee Rate:</span>
              <span class="text-glow-primary text-primary">2.00%</span>
            </div>
          </div>
          <p class="text-xs text-muted mb-0"><i class="bi bi-info-circle"></i> <strong>Note:</strong> No fees are withheld during submission. If your payout request is cancelled or rejected, the <strong>full original amount is returned</strong> with zero transaction costs.</p>
        </div>
      `;
      new Modal({
        title: "Compliance Fee Audit Details",
        body: modalBody,
        buttons: [{ label: "Close", class: "btn-hfc-primary", onClick: (m) => m.destroy() }]
      }).show();
    });
  }

  // Search filter typing handler
  const searchInput = document.getElementById("withdraw-search");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderWithdrawalsHistory();
    });
  }

  // Tabs click binding
  const filterTabs = document.querySelectorAll(".withdraw-filter-tab-btn");
  filterTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      filterTabs.forEach(t => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      state.activeFilter = tab.getAttribute("data-filter");
      renderWithdrawalsHistory();
    });
  });

  // Payout clock updater
  setInterval(() => {
    const clockEl = document.getElementById("payout-clock");
    if (clockEl) {
      const now = new Date();
      // Emulating beautiful timestamp strings formatted in user specs
      clockEl.textContent = now.toISOString().replace("T", " ").substring(0, 19) + " UTC";
    }
  }, 1000);

  // Form Submission
  const form = document.getElementById("withdraw-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      if (!form.checkValidity()) {
        form.classList.add("was-validated");
        return;
      }

      await submitWithdrawalRequest();
    });
  }
}

/**
 * Initialize Firestore listeners for dynamic user wallet and withdrawals
 */
function initRealtimeListeners() {
  const userId = state.user.uid;

  // 1. Listen to PKR Wallet real-time
  const walletId = `${userId}_PKR`;
  const walletRef = doc(db, "wallets", walletId);

  onSnapshot(walletRef, (snap) => {
    if (snap.exists()) {
      state.pkrWallet = { id: snap.id, ...snap.data() };
    } else {
      state.pkrWallet = null;
    }
    updateSummaryCardsUI();
  }, (err) => {
    console.error("Wallet snapshot error:", err);
    Toast.show("Real-time wallet synchronization failure.", { type: "danger" });
  });

  // 2. Listen to withdrawals list real-time
  const withdrawalsQuery = query(
    collection(db, "withdrawals"),
    where("userUid", "==", userId)
  );

  onSnapshot(withdrawalsQuery, (snap) => {
    const newList = [];
    snap.forEach(doc => {
      newList.push({ id: doc.id, ...doc.data() });
    });

    // Sort descending by createdAt
    newList.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });

    // Audit changes to alert on Admin status modifications
    auditDatabaseStatusChanges(newList);

    state.withdrawals = newList;
    updateSummaryCardsUI();
    renderWithdrawalsHistory();
  }, (err) => {
    console.error("Withdrawals snapshot error:", err);
    EmptyState.renderError("#withdrawals-table-wrapper", {
      title: "Ledger Outage",
      message: "Database rule restrictions or connection issues blocked real-time audit syncing.",
      onRetry: () => initRealtimeListeners()
    });
  });
}

/**
 * Handle real-time alert updates for admin state changes
 */
function auditDatabaseStatusChanges(newList) {
  newList.forEach(wit => {
    const previousStatus = state.withdrawStatuses[wit.withdrawalId];
    if (previousStatus !== undefined && previousStatus !== wit.status) {
      state.withdrawStatuses[wit.withdrawalId] = wit.status;

      let message = "";
      let type = "info";

      if (wit.status === "Approved") {
        message = `Withdrawal ${wit.withdrawalId} for ${wit.amount.toLocaleString()} PKR has been Approved! Net transacted: ${wit.netAmount.toLocaleString()} PKR.`;
        type = "success";
      } else if (wit.status === "Rejected") {
        message = `Withdrawal ${wit.withdrawalId} of ${wit.amount.toLocaleString()} PKR was Rejected. Funds reverted back to your Available Balance.`;
        type = "danger";
      } else if (wit.status === "Cancelled") {
        message = `Withdrawal ${wit.withdrawalId} has been successfully Cancelled. Held funds released.`;
        type = "warning";
      } else if (wit.status === "Under Review") {
        message = `Withdrawal ${wit.withdrawalId} is currently Under Review by compliance auditors.`;
        type = "info";
      }

      Toast.show(message, { type, duration: 6000 });
    } else if (previousStatus === undefined) {
      state.withdrawStatuses[wit.withdrawalId] = wit.status;
    }
  });
}

/**
 * Dynamically updates top metric metrics summary card values
 */
function updateSummaryCardsUI() {
  const container = document.getElementById("withdraw-summary-cards");
  if (!container) return;

  // Recalculate totals
  const availablePKR = state.pkrWallet 
    ? (state.pkrWallet.availableBalance !== undefined ? state.pkrWallet.availableBalance : (state.pkrWallet.balance || 0))
    : 0;
  
  const holdPKR = state.pkrWallet ? (state.pkrWallet.holdBalance || 0) : 0;
  const withdrawablePKR = availablePKR; // Liquid amount ready for request

  // Calculate sum of active Pending or Under Review requests
  const pendingAmount = state.withdrawals
    .filter(w => w.status === "Pending" || w.status === "Under Review")
    .reduce((sum, current) => sum + current.amount, 0);

  const formatPKR = (v) => "₨ " + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  container.innerHTML = `
    <!-- Card 1: Available PKR -->
    <div class="summary-card success-edge">
      <div class="card-metric-label"><i class="bi bi-wallet2 text-success"></i> Available Balance</div>
      <div class="card-metric-value text-white">${formatPKR(availablePKR)}</div>
      <div class="card-metric-subtext text-muted">Liquid PKR capital ready to transact</div>
    </div>

    <!-- Card 2: Hold Balance -->
    <div class="summary-card warning-edge">
      <div class="card-metric-label"><i class="bi bi-lock text-warning"></i> Locked Hold Balance</div>
      <div class="card-metric-value text-white">${formatPKR(holdPKR)}</div>
      <div class="card-metric-subtext text-muted">Held securely in active payout escrows</div>
    </div>

    <!-- Card 3: Withdrawable Balance -->
    <div class="summary-card primary-edge">
      <div class="card-metric-label"><i class="bi bi-shield-check text-primary"></i> Withdrawable Balance</div>
      <div class="card-metric-value text-white">${formatPKR(withdrawablePKR)}</div>
      <div class="card-metric-subtext text-muted">Maximum immediate payout threshold</div>
    </div>

    <!-- Card 4: Total Pending Payouts -->
    <div class="summary-card accent-edge">
      <div class="card-metric-label"><i class="bi bi-hourglass-split text-accent"></i> Pending Requests</div>
      <div class="card-metric-value text-white">${formatPKR(pendingAmount)}</div>
      <div class="card-metric-subtext text-muted">Awaiting auditing compliance checks</div>
    </div>
  `;
}

/**
 * Submits the withdrawal form request to Firestore, locking the funds
 */
async function submitWithdrawalRequest() {
  const amountInput = document.getElementById("withdraw-amount");
  const holderInput = document.getElementById("withdraw-holder-name");
  const accountInput = document.getElementById("withdraw-account-number");
  const notesInput = document.getElementById("withdraw-notes");

  const amount = parseFloat(amountInput.value);
  const holderName = holderInput.value.trim();
  const accountNumber = accountInput.value.trim();
  const notes = notesInput.value.trim();
  const method = state.selectedMethod;

  // 1. Perform deep client-side state safety validations
  if (!state.pkrWallet) {
    Toast.show("No active PKR wallet identified. Please seed your account portfolio first.", { type: "danger" });
    return;
  }

  const availableBalance = state.pkrWallet.availableBalance !== undefined 
    ? state.pkrWallet.availableBalance 
    : (state.pkrWallet.balance || 0);

  if (amount < state.limits.minWithdraw) {
    Toast.show(`Amount exceeds boundary limits. Minimum withdrawal is ${state.limits.minWithdraw} PKR.`, { type: "warning" });
    return;
  }

  if (amount > state.limits.maxWithdraw) {
    Toast.show(`Amount exceeds boundary limits. Maximum single withdrawal is ${state.limits.maxWithdraw} PKR.`, { type: "warning" });
    return;
  }

  if (amount > availableBalance) {
    Toast.show(`Insufficient funds. Your Available PKR balance is ${availableBalance.toLocaleString()} PKR.`, { type: "danger" });
    return;
  }

  // 2. Lock balance and trigger loading state
  const loader = new Loader({ text: "Signing ledger and locking PKR balance..." });
  loader.show();

  try {
    const userId = state.user.uid;
    const currentWalletHold = state.pkrWallet.holdBalance || 0;

    // Subtraction and lock additions
    const updatedAvailable = availableBalance - amount;
    const updatedHold = currentWalletHold + amount;

    // Transactional ID Generation
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,"");
    const withdrawalId = `WD-${dateStr}-${randSuffix}`;

    // Fee processing (Calculated for audit, but not pre-deducted)
    const processingFee = amount * state.limits.feePercentage;
    const netAmount = amount - processingFee;

    // A. Update PKR Wallet document in wallets/ collection
    const walletId = `${userId}_PKR`;
    await updateDocument("wallets", walletId, {
      availableBalance: updatedAvailable,
      holdBalance: updatedHold,
      balance: updatedAvailable, // Sync backward compatibility
      updatedAt: serverTimestamp()
    });

    // B. Create Withdrawal request document in withdrawals/ collection
    await createDocument("withdrawals", {
      withdrawalId,
      userUid: userId,
      method,
      amount,
      processingFee,
      netAmount,
      accountHolder: holderName,
      accountNumber,
      notes,
      status: "Pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      adminUid: null
    }, withdrawalId);

    // C. Create matching ledger history in transactions/ collection
    const txId = `tx_${withdrawalId}`;
    const txHash = "0x" + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');
    await setDoc(doc(db, "transactions", txId), {
      txId,
      userId,
      type: "withdrawal",
      amount,
      currency: "PKR",
      status: "pending",
      txHash,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // 3. Complete and clear form
    loader.hide();
    Toast.show("Withdrawal request filed. Funds moved to lock hold.", { type: "success" });

    // Reset inputs gracefully
    amountInput.value = "";
    holderInput.value = "";
    accountInput.value = "";
    notesInput.value = "";
    
    const form = document.getElementById("withdraw-form");
    if (form) form.classList.remove("was-validated");

  } catch (err) {
    loader.hide();
    console.error("Submission failed:", err);
    Toast.show("Ledger connection write error. Please try again.", { type: "danger" });
  }
}

/**
 * Renders list of historical withdrawals based on active search criteria and tab status
 */
function renderWithdrawalsHistory() {
  const tableContainer = document.getElementById("withdrawals-table-wrapper");
  if (!tableContainer) return;

  // 1. Filter out list
  let filtered = state.withdrawals;

  // Filter based on Tab
  if (state.activeFilter !== "All") {
    filtered = filtered.filter(item => item.status === state.activeFilter);
  }

  // Filter based on Search ID
  if (state.searchQuery) {
    filtered = filtered.filter(item => 
      item.withdrawalId.toLowerCase().includes(state.searchQuery) ||
      (item.accountNumber && item.accountNumber.includes(state.searchQuery))
    );
  }

  // 2. Render appropriate list
  if (filtered.length === 0) {
    tableContainer.innerHTML = `
      <div class="p-5 text-center">
        <i class="bi bi-inbox text-muted fs-2"></i>
        <h5 class="text-white mt-3">No Matched Records</h5>
        <p class="text-muted text-xs">There are no withdrawals matching the active filter criteria.</p>
      </div>
    `;
    return;
  }

  const tbodyHtml = filtered.map(w => {
    const formattedAmount = "₨ " + w.amount.toLocaleString(undefined, { minimumFractionDigits: 2 });
    const formattedFee = "₨ " + w.processingFee.toLocaleString(undefined, { minimumFractionDigits: 2 });
    const formattedNet = "₨ " + w.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 });

    const createdDate = w.createdAt 
      ? new Date(w.createdAt.seconds * 1000).toLocaleString()
      : "Pending block...";

    const decidedDate = (w.updatedAt && w.status !== "Pending" && w.status !== "Under Review")
      ? new Date(w.updatedAt.seconds * 1000).toLocaleString()
      : "Awaiting approval";

    let statusClass = "withdraw-badge-pending";
    if (w.status === "Approved") statusClass = "withdraw-badge-approved";
    if (w.status === "Rejected") statusClass = "withdraw-badge-rejected";
    if (w.status === "Cancelled") statusClass = "withdraw-badge-cancelled";
    if (w.status === "Under Review") statusClass = "withdraw-badge-review";

    // Payout Cancel Action (Only pending requests are permitted to be cancelled)
    const isPending = w.status === "Pending";
    const actionBtn = isPending 
      ? `<button class="btn btn-sm btn-outline-danger py-1 px-2.5 text-xxs font-sans" onclick="cancelWithdrawal('${w.withdrawalId}')" aria-label="Cancel payout ${w.withdrawalId}">
           <i class="bi bi-x-circle"></i> Cancel
         </button>`
      : `<button class="btn btn-sm btn-outline-secondary py-1 px-2.5 text-xxs font-sans" disabled aria-label="Action locked">
           Locked
         </button>`;

    return `
      <tr class="align-middle">
        <td>
          <div class="d-flex align-items-center gap-2">
            <span class="text-white text-mono text-xs fw-bold" onclick="navigator.clipboard.writeText('${w.withdrawalId}'); Toast.show('ID Copied!', {type:'info'})" style="cursor: pointer;" title="Copy ID">
              <i class="bi bi-copy text-xxs text-muted me-1"></i>${w.withdrawalId}
            </span>
          </div>
        </td>
        <td class="text-xs text-muted text-nowrap">${w.method}</td>
        <td class="text-mono text-white text-xs fw-bold">${formattedAmount}</td>
        <td class="text-mono text-muted text-xs">${formattedFee}</td>
        <td class="text-mono text-glow-primary text-white text-xs fw-bold">${formattedNet}</td>
        <td><span class="badge ${statusClass} text-xxs uppercase px-2.5 py-1.5">${w.status}</span></td>
        <td class="text-xs text-muted text-mono">${createdDate}</td>
        <td class="text-xs text-muted text-mono d-none d-lg-table-cell">${decidedDate}</td>
        <td class="text-end">${actionBtn}</td>
      </tr>
    `;
  }).join("");

  tableContainer.innerHTML = `
    <div class="table-responsive-withdraw">
      <table class="table table-glass table-withdraw m-0">
        <thead>
          <tr>
            <th scope="col">Withdrawal ID</th>
            <th scope="col">Method</th>
            <th scope="col">Amount</th>
            <th scope="col">Processing Fee (2%)</th>
            <th scope="col">Est. Net Amount</th>
            <th scope="col">Audit Status</th>
            <th scope="col">Submitted Date</th>
            <th scope="col" class="d-none d-lg-table-cell">Decision Date</th>
            <th scope="col" class="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${tbodyHtml}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Handle user initiated cancellation of pending requests, returning funds to Available Balance
 * Exposed as global function so inline onclick binds work reliably.
 */
window.cancelWithdrawal = async function(withdrawalId) {
  // Confirm with a gorgeous Modal dialog
  new Modal({
    title: "Revoke Payout Request",
    body: `
      <div class="p-1">
        <p class="text-sm text-muted">Are you sure you want to cancel the pending payout request <strong>${withdrawalId}</strong>?</p>
        <div class="p-2.5 border-start border-warning border-3 bg-white bg-opacity-5 rounded">
          <p class="text-xxs text-muted m-0">This operation will release the locked gross PKR amount from Hold Balance and return it immediately to your Available Balance with zero penalties.</p>
        </div>
      </div>
    `,
    buttons: [
      {
        label: "Keep Active",
        class: "btn-hfc-secondary",
        onClick: (m) => m.destroy()
      },
      {
        label: "Confirm Cancellation",
        class: "btn-hfc-danger",
        onClick: async (m) => {
          m.destroy();
          await executeWithdrawalCancellation(withdrawalId);
        }
      }
    ]
  }).show();
};

/**
 * Performs actual transactional operations of withdrawal cancellation in Firestore
 */
async function executeWithdrawalCancellation(withdrawalId) {
  const loader = new Loader({ text: "Releasing locked balances..." });
  loader.show();

  try {
    const userId = state.user.uid;

    // 1. Fetch current withdrawal request state
    const witDocRef = doc(db, "withdrawals", withdrawalId);
    const witSnap = await getDoc(witDocRef);

    if (!witSnap.exists()) {
      loader.hide();
      Toast.show("Audit record missing or deleted.", { type: "danger" });
      return;
    }

    const witData = witSnap.data();
    if (witData.status !== "Pending") {
      loader.hide();
      Toast.show("This request has already been processed by admin compliance nodes and cannot be revoked.", { type: "warning" });
      return;
    }

    const cancelAmount = witData.amount;

    // 2. Fetch active user wallet state
    const walletId = `${userId}_PKR`;
    const walletDocRef = doc(db, "wallets", walletId);
    const walletSnap = await getDoc(walletDocRef);

    if (!walletSnap.exists()) {
      loader.hide();
      Toast.show("PKR wallet missing.", { type: "danger" });
      return;
    }

    const walletData = walletSnap.data();
    const currentAvailable = walletData.availableBalance !== undefined ? walletData.availableBalance : (walletData.balance || 0);
    const currentHold = walletData.holdBalance || 0;

    // Calculations
    const updatedAvailable = currentAvailable + cancelAmount;
    const updatedHold = Math.max(0, currentHold - cancelAmount);

    // A. Perform balance return
    await updateDocument("wallets", walletId, {
      availableBalance: updatedAvailable,
      holdBalance: updatedHold,
      balance: updatedAvailable, // Sync backward compatibility
      updatedAt: serverTimestamp()
    });

    // B. Update withdrawal status to Cancelled
    await updateDocument("withdrawals", withdrawalId, {
      status: "Cancelled",
      updatedAt: serverTimestamp()
    });

    // C. Update matching transaction ledger history to failed/cancelled
    const txId = `tx_${withdrawalId}`;
    await setDoc(doc(db, "transactions", txId), {
      status: "cancelled",
      updatedAt: serverTimestamp()
    }, { merge: true });

    loader.hide();
    Toast.show(`Payout request ${withdrawalId} cancelled successfully. Balance returned!`, { type: "success" });

  } catch (err) {
    loader.hide();
    console.error("Cancellation execution failed:", err);
    Toast.show("Ledger write failure. Please verify active database node connections.", { type: "danger" });
  }
}
