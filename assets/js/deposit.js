/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - PKR Deposit Page Controller
 * Advanced fiat processing terminal handling real-time status updates,
 * file uploading to Firebase Storage, unique transaction reference verification,
 * and immediate status change notification toast prompts.
 */

import { protectPage } from "../../js/authGuard.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";
import { db, storage } from "../../firebase/firebase.js";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDocs,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { 
  createDocument, 
  updateDocument, 
  getDocument 
} from "../../firebase/firestore.js";
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "firebase/storage";

// Standard client-side configurable parameters
const LIMITS = {
  min: 500,                    // Default Minimum PKR
  max: 1000000,                // Default Maximum PKR
  maxFileSize: 5 * 1024 * 1024 // Default 5 MB Max screenshot size
};

// Payment Method Constants with Accounts detail
const PAYMENT_METHODS = {
  "EasyPaisa": {
    name: "EasyPaisa Mobile Wallet",
    accountNumber: "0345-7654321",
    accountTitle: "HFC Exchange Ltd.",
    badgeClass: "logo-easypaisa",
    logoText: "EP",
    instructions: "Please transfer the exact PKR amount you wish to deposit to our designated Cash Vault EasyPaisa pool:",
    availability: "Online",
    fee: "0%"
  },
  "JazzCash": {
    name: "JazzCash Mobile Wallet",
    accountNumber: "0300-1234567",
    accountTitle: "HFC Exchange Ltd.",
    badgeClass: "logo-jazzcash",
    logoText: "JC",
    instructions: "Please route the exact PKR transfer amount to our authorized corporate JazzCash treasury wallet:",
    availability: "Online",
    fee: "0%"
  },
  "Bank Transfer": {
    name: "Allied Bank Limited (ABL)",
    accountNumber: "PK38ALBY001234567890",
    accountTitle: "HFC Exchange Pvt Ltd.",
    badgeClass: "logo-bank",
    logoText: "BANK",
    instructions: "Execute a direct bank transfer or Interbank Funds Transfer (IBFT) to the following corporate settlement IBAN:",
    availability: "Online",
    fee: "0%"
  }
};

// Reactive view-model state container
const state = {
  user: null,
  deposits: [],             // All historical records for the active authenticated user
  screenshotFile: null,      // Active selected screenshot image file Object
  depositStatuses: {},       // Cache mapping [depositId] -> [status] to trace remote admin changes
  initialLoadDone: false,    // Tracks if the first real-time snapshot has completed
  searchQuery: "",          // Active query filter for search inputs
  statusFilter: "all"       // Active tab filter: 'all', 'pending', 'approved', 'rejected'
};

// Start Page Initialization on DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Intercept session & secure page access
  const user = await protectPage();
  if (!user) return;
  state.user = user;

  // 2. Fetch future limit and validation settings from database
  await fetchLimitSettings();

  // 3. Initialize HFC Page Layout orchestrator
  const layout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: user.email,
      versionText: "HFC Engine v2.4",
      initialNotifications: [
        { id: 1, type: "primary", text: "Fiat gateways operational. High throughput enabled." }
      ],
      onLogout: async () => {
        try {
          const { logoutUser } = await import("../../firebase/auth.js");
          await logoutUser();
          Toast.show("Secure session terminated.", { type: "info" });
          setTimeout(() => { window.location.href = "login.html"; }, 1000);
        } catch (err) {
          Toast.show("Session termination error.", { type: "danger" });
        }
      }
    },
    sidebarOptions: {
      brandName: "HFC EXCHANGE",
      activeId: "wallets", // Highlight wallet sidebar category
      menuItems: [
        { id: "dashboard", label: "Dashboard", icon: "bi-grid-1x2-fill", href: "dashboard.html" },
        { id: "marketplace", label: "P2P Marketplace", icon: "bi-shop", href: "#" },
        { id: "wallets", label: "My Wallets", icon: "bi-wallet2", href: "wallet.html" },
        { id: "transactions", label: "Escrow Ledger", icon: "bi-activity", href: "#" },
        { id: "security", label: "Settings node", icon: "bi-shield-lock", href: "#" }
      ],
      onNavigate: (item) => {
        if (item.id !== "wallets" && item.id !== "dashboard") {
          Toast.show(`${item.label} interface integration is locked on this preview node.`, { type: "warning" });
        }
      }
    }
  });

  // 4. Inject structural HTML grid content
  renderDepositFrame(layout);

  // 5. Wire active user meta bar updates
  startMetaInfoTracker(user);

  // 6. Bind interactive listeners to forms and cards
  bindInterfaceEvents();

  // 7. Subscribe to real-time Firestore database triggers
  startRealtimeLedgerListener();
});

/**
 * Fetch dynamic minimum, maximum deposit boundaries, and file sizes from settings collection
 */
async function fetchLimitSettings() {
  try {
    const config = await getDocument("settings", "deposit");
    if (config) {
      if (config.min !== undefined) LIMITS.min = parseFloat(config.min);
      if (config.max !== undefined) LIMITS.max = parseFloat(config.max);
      if (config.maxFileSize !== undefined) LIMITS.maxFileSize = parseInt(config.maxFileSize);
      console.log("HFC Deposits: Limit configurations verified from Firestore nodes.", LIMITS);
    }
  } catch (error) {
    console.warn("HFC Deposits: Settings nodes unreachable. Operating on hardcoded fallback boundaries.", LIMITS);
  }
}

/**
 * Render base UI elements, form shells, and history logs layout
 */
function renderDepositFrame(layout) {
  const container = layout.getContentContainer();
  if (!container) return;

  container.innerHTML = `
    <!-- Page Breadcrumb Header -->
    <div id="deposit-page-header"></div>

    <!-- Active User & Sync Metadata Tracker Card -->
    <div class="card-glass p-3 mb-4 d-flex flex-wrap justify-content-between align-items-center gap-3 text-sm">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-person-badge text-primary fs-5"></i>
        <div>
          <span class="text-muted text-xs d-block">AUTHENTICATED NODE ID</span>
          <span class="text-white fw-bold" id="headerUserEmail">Loading...</span>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 text-mono text-xs">
        <i class="bi bi-clock text-accent fs-6"></i>
        <div>
          <span class="text-muted text-xs d-block text-end">SYSTEM COOLDOWN WATCH (UTC)</span>
          <span class="text-white fw-semibold" id="headerNodeTime">Loading...</span>
        </div>
      </div>
    </div>

    <!-- Main Content Dual-Column Layout Grid -->
    <div class="row g-4 animate-fade-in">
      
      <!-- COLUMN 1: Deposit Method Selector & Submission Form -->
      <div class="col-xl-7 col-lg-12">
        <!-- Step 1 Title -->
        <div class="d-flex align-items-center gap-2 mb-3">
          <div class="step-num-badge">1</div>
          <h2 class="text-display fw-bold text-white fs-5 m-0">Select Funding Gateway</h2>
        </div>

        <!-- Deposit Gateway Methods Grid -->
        <div class="deposit-methods-grid">
          <!-- EasyPaisa Gateway -->
          <div class="method-card active" data-method="EasyPaisa" id="methodCard_EasyPaisa">
            <div class="active-indicator"><i class="bi bi-check"></i></div>
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="text-display fw-bold text-white fs-6">EasyPaisa</span>
              <div class="method-logo-badge logo-easypaisa">EP</div>
            </div>
            <div class="text-sm text-secondary mb-2">Instant fiat processing.</div>
            <div class="d-flex align-items-center justify-content-between text-xs mt-auto pt-2 border-top border-secondary border-opacity-10">
              <span class="text-muted">Status: <span class="text-success fw-semibold">Online</span></span>
              <span class="text-muted">Fee: <span class="text-white fw-semibold">0%</span></span>
            </div>
          </div>

          <!-- JazzCash Gateway -->
          <div class="method-card" data-method="JazzCash" id="methodCard_JazzCash">
            <div class="active-indicator"><i class="bi bi-check"></i></div>
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="text-display fw-bold text-white fs-6">JazzCash</span>
              <div class="method-logo-badge logo-jazzcash">JC</div>
            </div>
            <div class="text-sm text-secondary mb-2">Instant mobile wallet routing.</div>
            <div class="d-flex align-items-center justify-content-between text-xs mt-auto pt-2 border-top border-secondary border-opacity-10">
              <span class="text-muted">Status: <span class="text-success fw-semibold">Online</span></span>
              <span class="text-muted">Fee: <span class="text-white fw-semibold">0%</span></span>
            </div>
          </div>

          <!-- Bank Gateway -->
          <div class="method-card" data-method="Bank Transfer" id="methodCard_Bank">
            <div class="active-indicator"><i class="bi bi-check"></i></div>
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="text-display fw-bold text-white fs-6">Bank Transfer</span>
              <div class="method-logo-badge logo-bank">BANK</div>
            </div>
            <div class="text-sm text-secondary mb-2">Secure Allied Bank IBFT.</div>
            <div class="d-flex align-items-center justify-content-between text-xs mt-auto pt-2 border-top border-secondary border-opacity-10">
              <span class="text-muted">Status: <span class="text-success fw-semibold">Online</span></span>
              <span class="text-muted">Fee: <span class="text-white fw-semibold">0%</span></span>
            </div>
          </div>
        </div>

        <!-- Step 2 Title -->
        <div class="d-flex align-items-center gap-2 mb-3">
          <div class="step-num-badge">2</div>
          <h2 class="text-display fw-bold text-white fs-5 m-0">Confirm Deposit Submission</h2>
        </div>

        <!-- Glassmorphism Form Card -->
        <div class="card-glass p-4 mb-4">
          <!-- Dynamic Instructions Box -->
          <div class="instruction-box" id="paymentInstructions">
            <h3 class="text-display fw-bold text-primary fs-6 mb-2 d-flex align-items-center gap-2">
              <i class="bi bi-info-circle-fill"></i> EasyPaisa Mobile Wallet
            </h3>
            <p class="text-secondary text-sm mb-3" id="instDescription">
              Please transfer the exact PKR amount you wish to deposit to our designated Cash Vault EasyPaisa pool:
            </p>
            <div class="row g-3 mb-3 text-sm">
              <div class="col-sm-6">
                <span class="text-muted d-block text-xs">ACCOUNT NUMBER</span>
                <span class="text-white fw-bold d-flex align-items-center gap-2 text-mono">
                  <span id="instAccount">0345-7654321</span>
                  <button type="button" class="btn btn-link btn-sm p-0 text-primary copy-btn" id="copyAccountBtn" aria-label="Copy Account Number">
                    <i class="bi bi-copy"></i>
                  </button>
                </span>
              </div>
              <div class="col-sm-6">
                <span class="text-muted d-block text-xs">ACCOUNT TITLE</span>
                <span class="text-white fw-bold d-flex align-items-center gap-2">
                  <span id="instTitle">HFC Exchange Ltd.</span>
                  <button type="button" class="btn btn-link btn-sm p-0 text-primary copy-btn" id="copyTitleBtn" aria-label="Copy Account Title">
                    <i class="bi bi-copy"></i>
                  </button>
                </span>
              </div>
            </div>
            <p class="text-warning text-xs mb-0"><i class="bi bi-exclamation-triangle"></i> Important: Admin checks manually. Keep transaction receipts and exact dates. Double-check details before sending.</p>
          </div>

          <!-- Deposit Core Input Fields -->
          <form id="depositForm" novalidate>
            <!-- Synced Hidden Method State -->
            <input type="hidden" id="depositMethodInput" value="EasyPaisa">

            <!-- Amount Input -->
            <div class="mb-3">
              <label for="depositAmount" class="form-label text-white text-sm fw-medium">Deposit Amount (PKR) <span class="text-danger">*</span></label>
              <div class="input-group">
                <span class="input-group-text bg-secondary bg-opacity-10 text-muted border-secondary border-opacity-20 text-mono text-xs">PKR</span>
                <input type="number" id="depositAmount" class="form-control form-control-glass text-white text-mono" placeholder="Minimum amount" required>
              </div>
              <div class="form-text text-muted text-xs d-flex justify-content-between mt-1">
                <span id="labelLimitMin">Min: 500 PKR</span>
                <span id="labelLimitMax">Max: 1,000,000 PKR</span>
              </div>
              <div class="invalid-feedback text-xs text-danger" id="amountFeedback">Please specify an amount within the limits.</div>
            </div>

            <!-- Transaction Reference ID -->
            <div class="mb-3">
              <label for="depositTxId" class="form-label text-white text-sm fw-medium">Transaction ID (TxID) <span class="text-danger">*</span></label>
              <input type="text" id="depositTxId" class="form-control form-control-glass text-white text-mono" placeholder="Paste your transfer transaction ID" required>
              <div class="form-text text-muted text-xs">A unique reference code is mandatory to audit transaction slips. Duplicates will trigger safety rejections.</div>
              <div class="invalid-feedback text-xs text-danger" id="txIdFeedback">Please specify a unique, valid Transaction ID.</div>
            </div>

            <!-- Date and Receipt row -->
            <div class="row g-3 mb-4">
              <div class="col-sm-6">
                <label for="depositDate" class="form-label text-white text-sm fw-medium">Transfer Date <span class="text-danger">*</span></label>
                <input type="date" id="depositDate" class="form-control form-control-glass text-white" required>
                <div class="invalid-feedback text-xs text-danger">Please pick a valid date.</div>
              </div>
              <div class="col-sm-6">
                <label class="form-label text-white text-sm fw-medium">Receipt Screenshot <span class="text-danger">*</span></label>
                <input type="file" id="depositScreenshot" accept="image/*" class="d-none">
                <div class="upload-dropzone" id="dropzone">
                  <i class="bi bi-cloud-arrow-up fs-2 mb-2 d-block"></i>
                  <span class="text-white text-xs d-block fw-semibold mb-1" id="dropzoneText">Drag receipt image or click</span>
                  <span class="text-muted text-2xs d-block" id="dropzoneDetails">PNG, JPG, or JPEG (Max 5MB)</span>
                  <div class="d-none" id="previewContainer">
                    <img id="screenshotPreviewImg" src="" alt="Receipt Preview" style="max-height: 80px; border-radius: 4px;" class="mt-2">
                  </div>
                </div>
                <div class="invalid-feedback text-xs text-danger" id="screenshotFeedback">Screenshot file is required.</div>
              </div>
            </div>

            <!-- Notes Textarea -->
            <div class="mb-4">
              <label for="depositNotes" class="form-label text-white text-sm fw-medium">Optional Settlement Notes</label>
              <textarea id="depositNotes" class="form-control form-control-glass text-white text-sm" rows="3" placeholder="Add extra remarks if payment was completed via merchant or agent outlets..." maxlength="500"></textarea>
              <div class="form-text text-muted text-xs d-flex justify-content-between mt-1">
                <span>Maximum capacity: 500 characters</span>
                <span id="charCountLabel">0 / 500</span>
              </div>
            </div>

            <!-- Submission Button -->
            <button type="submit" class="btn-hfc btn-hfc-primary hover-lift w-100 py-3 fw-bold d-flex align-items-center justify-content-center gap-2" id="submitBtn">
              <i class="bi bi-shield-lock-fill"></i>
              <span id="submitBtnText">TRANSMIT DEPOSIT FOR AUDITING</span>
            </button>
          </form>
        </div>
      </div>

      <!-- COLUMN 2: Real-time History Logs -->
      <div class="col-xl-5 col-lg-12">
        <!-- Ledger Title -->
        <div class="d-flex align-items-center gap-2 mb-3">
          <div class="step-num-badge"><i class="bi bi-clock-history"></i></div>
          <h2 class="text-display fw-bold text-white fs-5 m-0">Account Audit Trail</h2>
        </div>

        <!-- Filtering Tools Card -->
        <div class="card-glass p-3 mb-3">
          <div class="d-flex flex-column gap-3">
            <!-- Search bar input -->
            <div class="search-input-wrapper">
              <i class="bi bi-search"></i>
              <input type="text" id="ledgerSearchInput" class="form-control form-control-glass text-white text-sm" placeholder="Search by Deposit ID or TxID..." aria-label="Search deposits">
            </div>
            <!-- Status Filter tabs -->
            <div class="deposit-filter-tabs" role="tablist">
              <button class="deposit-filter-tab-btn active" data-filter="all">All</button>
              <button class="deposit-filter-tab-btn" data-filter="pending">Pending</button>
              <button class="deposit-filter-tab-btn" data-filter="approved">Approved</button>
              <button class="deposit-filter-tab-btn" data-filter="rejected">Rejected</button>
            </div>
          </div>
        </div>

        <!-- Ledger Tables Target Content mount -->
        <div id="ledgerContentContainer">
          <!-- Default Loading Skeleton -->
          <div class="card-glass p-4 text-center">
            <div class="status-pulse-primary rounded-circle bg-primary mx-auto mb-3" style="width: 20px; height: 20px;"></div>
            <span class="text-display fw-semibold text-white">Loading verified ledger rows...</span>
          </div>
        </div>
      </div>

    </div>
  `;

  // Instantiate dynamic headers
  new PageHeader("#deposit-page-header", {
    title: "Fiat Ledger Deposit",
    description: "Initialize a manual PKR funding deposit slip. Core exchange services route claims to cold-vault networks upon admin authentication.",
    breadcrumbs: [
      { label: "My Wallets", href: "wallet.html" },
      { label: "Deposit PKR", active: true }
    ],
    action: {
      label: "Live Liquidity Node",
      icon: "bi-activity",
      onClick: () => {
        Toast.show("Audit Check: Node online. Liquid liquidity stands at 1.4M USDT.", { type: "info" });
      }
    }
  });

  // Load dynamically fetched limits to input hints
  updateLimitLabels();
}

/**
 * Update minimum and maximum layout texts to respect database configurations
 */
function updateLimitLabels() {
  const minLabel = document.getElementById("labelLimitMin");
  const maxLabel = document.getElementById("labelLimitMax");
  const amountInput = document.getElementById("depositAmount");

  if (minLabel) minLabel.textContent = `Min: ${LIMITS.min.toLocaleString()} PKR`;
  if (maxLabel) maxLabel.textContent = `Max: ${LIMITS.max.toLocaleString()} PKR`;
  if (amountInput) amountInput.placeholder = `Min: ${LIMITS.min} PKR`;
}

/**
 * Display User email & live UTC time clock in header meta elements
 */
function startMetaInfoTracker(user) {
  const userEmailEl = document.getElementById("headerUserEmail");
  const nodeTimeEl = document.getElementById("headerNodeTime");

  if (userEmailEl) userEmailEl.textContent = user.email;

  if (nodeTimeEl) {
    const updateTime = () => {
      const now = new Date();
      // Force format: YYYY-MM-DD HH:mm:ss UTC
      const datePart = now.toISOString().slice(0, 10);
      const timePart = now.toISOString().slice(11, 19);
      nodeTimeEl.textContent = `${datePart} ${timePart} UTC`;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }
}

/**
 * Bind DOM elements to card clicks, file selection, search, notes text counters, and form validation
 */
function bindInterfaceEvents() {
  // 1. Setup payment method selection trigger
  const methodCards = document.querySelectorAll(".method-card");
  const methodInput = document.getElementById("depositMethodInput");

  methodCards.forEach(card => {
    card.addEventListener("click", () => {
      methodCards.forEach(c => c.classList.remove("active"));
      card.classList.add("active");

      const methodId = card.getAttribute("data-method");
      if (methodInput) methodInput.value = methodId;

      updatePaymentInstructionView(methodId);
    });
  });

  // 2. Setup notes dynamic textarea char counter
  const notesTextarea = document.getElementById("depositNotes");
  const countLabel = document.getElementById("charCountLabel");
  if (notesTextarea && countLabel) {
    notesTextarea.addEventListener("input", () => {
      const len = notesTextarea.value.length;
      countLabel.textContent = `${len} / 500`;
    });
  }

  // 3. Setup File Upload dropzone click & drag triggers
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("depositScreenshot");

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());

    // File selected manually
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        processSelectedFile(e.target.files[0]);
      }
    });

    // File Drag and Drop states
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("drag-over");
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processSelectedFile(e.dataTransfer.files[0]);
      }
    });
  }

  // 4. Setup Copy Buttons for instructions panel
  const copyAccountBtn = document.getElementById("copyAccountBtn");
  const copyTitleBtn = document.getElementById("copyTitleBtn");

  if (copyAccountBtn) {
    copyAccountBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const num = document.getElementById("instAccount")?.textContent || "";
      copyToClipboard(num, "Account Number");
    });
  }

  if (copyTitleBtn) {
    copyTitleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const title = document.getElementById("instTitle")?.textContent || "";
      copyToClipboard(title, "Account Title");
    });
  }

  // 5. Setup search filter inputs
  const ledgerSearchInput = document.getElementById("ledgerSearchInput");
  if (ledgerSearchInput) {
    ledgerSearchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderDepositLedgerTable();
    });
  }

  // 6. Setup filter tabs triggers
  const filterTabs = document.querySelectorAll(".deposit-filter-tab-btn");
  filterTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      filterTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      state.statusFilter = tab.getAttribute("data-filter");
      renderDepositLedgerTable();
    });
  });

  // 7. Setup Form Submission Validation and Execution
  const form = document.getElementById("depositForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await handleFormSubmission(form);
    });
  }

  // Set default form date to today
  const dateInput = document.getElementById("depositDate");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
  }
}

/**
 * Render matched bank accounts and notes when clicking between JazzCash/EasyPaisa/Bank
 */
function updatePaymentInstructionView(methodId) {
  const methodData = PAYMENT_METHODS[methodId];
  if (!methodData) return;

  const header = document.getElementById("paymentInstructions");
  const instTitle = document.getElementById("instTitle");
  const instAccount = document.getElementById("instAccount");
  const instDesc = document.getElementById("instDescription");

  if (header) {
    header.querySelector("h3").innerHTML = `<i class="bi bi-info-circle-fill"></i> ${methodData.name}`;
  }
  if (instTitle) instTitle.textContent = methodData.accountTitle;
  if (instAccount) instAccount.textContent = methodData.accountNumber;
  if (instDesc) instDesc.textContent = methodData.instructions;
}

/**
 * Validate types and boundary dimensions of screenshot slips inside state
 */
function processSelectedFile(file) {
  const dropzoneText = document.getElementById("dropzoneText");
  const dropzoneDetails = document.getElementById("dropzoneDetails");
  const dropzone = document.getElementById("dropzone");
  const previewImg = document.getElementById("screenshotPreviewImg");
  const previewContainer = document.getElementById("previewContainer");

  // Validate Type
  if (!file.type.startsWith("image/")) {
    Toast.show("Unsupported file type. Receipts must be formatted as JPEG or PNG images.", { type: "danger" });
    clearFileSelection();
    return;
  }

  // Validate Size
  if (file.size > LIMITS.maxFileSize) {
    const maxSizeMB = (LIMITS.maxFileSize / (1024 * 1024)).toFixed(0);
    Toast.show(`File size exceeds maximum boundary limit of ${maxSizeMB}MB.`, { type: "danger" });
    clearFileSelection();
    return;
  }

  state.screenshotFile = file;

  // Render UI visual feedback
  if (dropzone) {
    dropzone.classList.add("has-file");
  }

  const fileSizeKB = (file.size / 1024).toFixed(1);
  if (dropzoneText) dropzoneText.textContent = `${file.name}`;
  if (dropzoneDetails) dropzoneDetails.textContent = `File validated: ${fileSizeKB} KB`;

  // Display small thumbnail
  if (previewImg && previewContainer) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewContainer.classList.remove("d-none");
    };
    reader.readAsDataURL(file);
  }
}

/**
 * Remove selected screenshot variables on validation failure
 */
function clearFileSelection() {
  state.screenshotFile = null;
  const dropzoneText = document.getElementById("dropzoneText");
  const dropzoneDetails = document.getElementById("dropzoneDetails");
  const dropzone = document.getElementById("dropzone");
  const previewContainer = document.getElementById("previewContainer");
  const fileInput = document.getElementById("depositScreenshot");

  if (dropzone) dropzone.classList.remove("has-file");
  if (dropzoneText) dropzoneText.textContent = "Drag receipt image or click";
  if (dropzoneDetails) dropzoneDetails.textContent = `PNG, JPG, or JPEG (Max ${(LIMITS.maxFileSize / (1024 * 1024)).toFixed(0)}MB)`;
  if (previewContainer) previewContainer.classList.add("d-none");
  if (fileInput) fileInput.value = "";
}

/**
 * Helper to copy specific text nodes directly to the Clipboard API
 */
function copyToClipboard(text, labelName) {
  navigator.clipboard.writeText(text).then(() => {
    Toast.show(`${labelName} copied successfully.`, { type: "success", duration: 1500 });
  }).catch(() => {
    Toast.show(`Unable to access clipboard. Please copy manually.`, { type: "warning" });
  });
}

/**
 * Core processor validating inputs, uploading screenshot, and writing documents to Firestore
 */
async function handleFormSubmission(form) {
  const methodInput = document.getElementById("depositMethodInput");
  const amountInput = document.getElementById("depositAmount");
  const txIdInput = document.getElementById("depositTxId");
  const dateInput = document.getElementById("depositDate");
  const notesTextarea = document.getElementById("depositNotes");

  const amountVal = parseFloat(amountInput.value);
  const txIdVal = txIdInput.value.trim();
  const dateVal = dateInput.value;
  const notesVal = notesTextarea.value.trim();
  const methodVal = methodInput.value;

  let isValid = true;

  // Reset Bootstrap Validation styles
  form.querySelectorAll(".form-control").forEach(inp => inp.classList.remove("is-invalid"));
  document.getElementById("dropzone").classList.remove("border-danger");

  // Validate Amount boundaries
  if (isNaN(amountVal) || amountVal < LIMITS.min || amountVal > LIMITS.max) {
    amountInput.classList.add("is-invalid");
    const amountFeedback = document.getElementById("amountFeedback");
    if (amountFeedback) {
      amountFeedback.textContent = `Amount must stand between ${LIMITS.min.toLocaleString()} and ${LIMITS.max.toLocaleString()} PKR.`;
    }
    isValid = false;
  }

  // Validate Transaction ID structure
  if (!txIdVal || txIdVal.length < 5) {
    txIdInput.classList.add("is-invalid");
    isValid = false;
  }

  // Validate Date existence
  if (!dateVal) {
    dateInput.classList.add("is-invalid");
    isValid = false;
  }

  // Validate Screenshot Attachment
  if (!state.screenshotFile) {
    document.getElementById("dropzone").classList.add("border-danger");
    const scrFeedback = document.getElementById("screenshotFeedback");
    if (scrFeedback) scrFeedback.textContent = "Please attach or drag & drop payment receipt image.";
    isValid = false;
  }

  if (!isValid) {
    Toast.show("Please correct highlighted error validation markers.", { type: "danger" });
    return;
  }

  // Boot UI Loader
  Loader.show("Transmitting security slip claims...");
  const submitBtn = document.getElementById("submitBtn");
  if (submitBtn) submitBtn.disabled = true;

  try {
    // 1. Verify Transaction Reference ID Uniqueness inside entire system collection
    const isUnique = await checkTxIdUniqueness(txIdVal);
    if (!isUnique) {
      txIdInput.classList.add("is-invalid");
      const txFeedback = document.getElementById("txIdFeedback");
      if (txFeedback) txFeedback.textContent = "This Transaction ID has already been registered in our ledgers.";
      Toast.show("Duplicate Transaction ID detected. Core ledger verification failed.", { type: "danger" });
      Loader.hide();
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    // 2. Upload Receipt Screenshot to secure Firebase Storage
    const storageUrl = await uploadScreenshotToStorage(state.screenshotFile);
    if (!storageUrl) {
      throw new Error("Unable to obtain secure cloud storage url credentials.");
    }

    // 3. Generate distinct corporate receipt ledger IDs
    const depositId = generateSecureDepositId();

    // 4. Set deposit record payload
    const depositPayload = {
      depositId: depositId,
      userId: state.user.uid,
      method: methodVal,
      amount: amountVal,
      transactionId: txIdVal,
      screenshotUrl: storageUrl,
      notes: notesVal,
      status: "pending",
      transferDate: dateVal,
      adminUid: null
    };

    // 5. Write to deposits collection
    await createDocument("deposits", depositPayload, depositId);

    // 6. Write synchronized transaction row in /transactions to display on Wallets Ledger history
    const transactionPayload = {
      txId: depositId,
      userId: state.user.uid,
      type: "deposit",
      amount: amountVal,
      currency: "PKR",
      status: "pending",
      txHash: "unconfirmed"
    };
    await createDocument("transactions", transactionPayload, depositId);

    // Form success operations
    Toast.show(`Deposit claim ${depositId} submitted successfully. Pending Admin manual reconciliation.`, { type: "success" });
    
    // Clear Form inputs safely
    form.reset();
    clearFileSelection();
    
    // Re-set default transfer date
    const today = new Date().toISOString().split("T")[0];
    if (dateInput) dateInput.value = today;

    // Reset notes character counts
    const charLabel = document.getElementById("charCountLabel");
    if (charLabel) charLabel.textContent = "0 / 500";

    // Direct UX focus scroll to Ledger log history on the right
    const ledgerScrollAnchor = document.getElementById("ledgerContentContainer");
    if (ledgerScrollAnchor) {
      ledgerScrollAnchor.scrollIntoView({ behavior: "smooth" });
    }

  } catch (error) {
    console.error("HFC Gateway Execution Exception: ", error);
    Toast.show("Reconciliation network claim crashed. Please contact client support nodes.", { type: "danger" });
  } finally {
    Loader.hide();
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * Queries Firestore deposits collections to audit unique txId reference codes
 * @param {string} txId 
 * @returns {Promise<boolean>} - true if completely unique
 */
async function checkTxIdUniqueness(txId) {
  try {
    const q = query(collection(db, "deposits"), where("transactionId", "==", txId));
    const snap = await getDocs(q);
    return snap.empty;
  } catch (err) {
    console.error("Uniqueness check error:", err);
    // Treat as failed verification if database is strictly offline/unreachable
    return false;
  }
}

/**
 * Upload receipt image to Firebase Storage and retrieve the public CDN download URL
 */
async function uploadScreenshotToStorage(file) {
  const timestamp = Date.now();
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
  const filePath = `deposits/${state.user.uid}/${timestamp}_${sanitizedFileName}`;
  
  const storageRef = ref(storage, filePath);
  
  // Upload raw byte streams
  const snapshot = await uploadBytes(storageRef, file);
  
  // Resolve public download URL
  return await getDownloadURL(snapshot.ref);
}

/**
 * Generate highly descriptive, sequential-random payment slip IDs
 */
function generateSecureDepositId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomValue = Math.floor(1000 + Math.random() * 9000);
  return `DEP-${dateStr}-${randomValue}`;
}

/**
 * Establishes real-time listener subscription on user specific deposits collections
 */
function startRealtimeLedgerListener() {
  const q = query(
    collection(db, "deposits"), 
    where("userId", "==", state.user.uid)
  );

  onSnapshot(q, (snapshot) => {
    const freshDeposits = [];
    snapshot.forEach(doc => {
      freshDeposits.push({ id: doc.id, ...doc.data() });
    });

    // Sort by Date/Created time descending (newest first)
    freshDeposits.sort((a, b) => {
      const timeA = a.createdAt?.seconds || Date.now() / 1000;
      const timeB = b.createdAt?.seconds || Date.now() / 1000;
      return timeB - timeA;
    });

    // Audit changes and trigger status change Alerts
    if (state.initialLoadDone) {
      auditDatabaseStatusChanges(freshDeposits);
    } else {
      // Warm-up cache mappings on cold boot without triggering notifications
      freshDeposits.forEach(dep => {
        state.depositStatuses[dep.depositId] = dep.status;
      });
      state.initialLoadDone = true;
    }

    state.deposits = freshDeposits;
    renderDepositLedgerTable();

  }, (error) => {
    console.error("Firestore Listener error:", error);
    EmptyState.renderError("#ledgerContentContainer", {
      title: "Ledger Pipeline Offline",
      message: "An active Firestore connection could not be established to synchronize account logs.",
      onRetry: () => window.location.reload()
    });
  });
}

/**
 * Compare snapshot lists to determine if any status was modified by an admin Node
 */
function auditDatabaseStatusChanges(newList) {
  newList.forEach(dep => {
    const cachedStatus = state.depositStatuses[dep.depositId];
    if (cachedStatus !== undefined && cachedStatus !== dep.status) {
      
      // Update cached state mapping
      state.depositStatuses[dep.depositId] = dep.status;

      // Construct descriptive, highly professional status alerts mapping statuses
      let message = "";
      let type = "info";

      const formattedStatus = getDisplayStatusText(dep.status);

      if (dep.status === "approved") {
        message = `Deposit slip ${dep.depositId} has been APPROVED! ${dep.amount.toLocaleString()} PKR credited to account balances.`;
        type = "success";
      } else if (dep.status === "rejected") {
        message = `Deposit slip ${dep.depositId} was REJECTED by Admin. Check reference notes.`;
        type = "danger";
      } else if (dep.status === "review") {
        message = `Deposit slip ${dep.depositId} status shifted to: Under Review.`;
        type = "primary";
      } else if (dep.status === "cancelled") {
        message = `Deposit slip ${dep.depositId} was cancelled successfully.`;
        type = "warning";
      } else {
        message = `Deposit slip ${dep.depositId} status shifted to: ${formattedStatus}.`;
      }

      Toast.show(message, { type: type, duration: 8000 });
    } else if (cachedStatus === undefined) {
      // Warm-up new submissions
      state.depositStatuses[dep.depositId] = dep.status;
    }
  });
}

/**
 * Filter list items in state and compile the dynamic table lists
 */
function renderDepositLedgerTable() {
  const container = document.getElementById("ledgerContentContainer");
  if (!container) return;

  // 1. Process active Search and status filters
  let filtered = state.deposits.filter(dep => {
    // Search query matches deposit ID or transaction ID
    const matchesSearch = !state.searchQuery || 
      dep.depositId.toLowerCase().includes(state.searchQuery) ||
      dep.transactionId.toLowerCase().includes(state.searchQuery);

    // Tab category matches status
    let matchesStatus = true;
    if (state.statusFilter !== "all") {
      matchesStatus = dep.status === state.statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  // 2. Handle empty states gracefully
  if (filtered.length === 0) {
    new EmptyState(container, {
      icon: "bi-cash-stack",
      title: state.searchQuery ? "No Matching Deposit Slips" : "No Deposit Logs Registered",
      description: state.searchQuery ? 
        "Verify your search input terms or clear transaction query filters to locate records." : 
        "You do not have any PKR deposit slips on record. Submit a manual deposit form to register assets.",
      action: {
        label: "Initiate First Deposit",
        icon: "bi-plus-circle",
        onClick: () => {
          const amountInput = document.getElementById("depositAmount");
          if (amountInput) amountInput.focus();
        }
      }
    });
    return;
  }

  // 3. Compile table markup
  let tableRows = filtered.map(dep => {
    const badgeClass = getStatusBadgeClass(dep.status);
    const displayStatus = getDisplayStatusText(dep.status);
    const methodDetails = PAYMENT_METHODS[dep.method] || { badgeClass: "logo-bank", logoText: "BANK" };
    
    // Format submission date
    let formattedDate = "N/A";
    if (dep.createdAt) {
      // Handle Firebase timestamp or Date strings gracefully
      const dateObj = dep.createdAt.toDate ? dep.createdAt.toDate() : new Date(dep.createdAt);
      formattedDate = dateObj.toISOString().slice(0, 10) + " " + dateObj.toISOString().slice(11, 16);
    } else if (dep.transferDate) {
      formattedDate = dep.transferDate;
    }

    // Format admin decision date if approved/rejected/cancelled
    let decisionDate = "—";
    if (dep.status !== "pending" && dep.status !== "review") {
      if (dep.updatedAt) {
        const upDate = dep.updatedAt.toDate ? dep.updatedAt.toDate() : new Date(dep.updatedAt);
        decisionDate = upDate.toISOString().slice(0, 10);
      } else {
        decisionDate = new Date().toISOString().slice(0, 10);
      }
    }

    // Render Action cancel button for pending elements
    const isPending = dep.status === "pending";
    const actionButtonHtml = isPending ? `
      <button class="btn btn-sm btn-outline-danger py-1 px-2 cancel-dep-btn hover-lift" data-id="${dep.depositId}" aria-label="Cancel Deposit Claim">
        <i class="bi bi-x-circle"></i> Cancel
      </button>
    ` : `
      <button class="btn btn-sm btn-outline-secondary py-1 px-2 view-receipt-btn text-xs" data-url="${dep.screenshotUrl}" data-id="${dep.depositId}" data-notes="${dep.notes || ''}" data-method="${dep.method}" data-amount="${dep.amount}" data-tx="${dep.transactionId}" aria-label="View Slip Details">
        <i class="bi bi-receipt"></i> Details
      </button>
    `;

    return `
      <tr>
        <td class="text-mono fw-bold text-white text-xs py-3">
          ${dep.depositId}
        </td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <span class="method-logo-badge ${methodDetails.badgeClass}" style="width: 24px; height: 24px; font-size: 8px;">
              ${methodDetails.logoText}
            </span>
            <span class="text-secondary text-xs fw-medium">${dep.method}</span>
          </div>
        </td>
        <td class="text-mono fw-bold text-white text-xs">
          ${dep.amount.toLocaleString()} PKR
        </td>
        <td>
          <span class="badge ${badgeClass} text-2xs py-1 px-2 fw-bold rounded-pill">
            ${displayStatus}
          </span>
        </td>
        <td class="text-mono text-muted text-2xs">
          ${formattedDate}
        </td>
        <td class="text-mono text-muted text-2xs">
          ${decisionDate}
        </td>
        <td class="text-end">
          ${actionButtonHtml}
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div class="card-glass p-0">
      <div class="table-responsive table-responsive-deposit">
        <table class="table table-dark table-hover table-deposit m-0 align-middle">
          <thead>
            <tr>
              <th scope="col" class="text-xs text-muted py-3 px-3">SLIP ID</th>
              <th scope="col" class="text-xs text-muted">METHOD</th>
              <th scope="col" class="text-xs text-muted">AMOUNT</th>
              <th scope="col" class="text-xs text-muted">STATUS</th>
              <th scope="col" class="text-xs text-muted">SUBMITTED</th>
              <th scope="col" class="text-xs text-muted">DECIDED</th>
              <th scope="col" class="text-xs text-muted text-end px-3">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Bind dynamic event triggers on newly rendered table elements
  bindTableActionListeners(container);
}

/**
 * Bind Cancel and Detail Receipt views directly to table elements
 */
function bindTableActionListeners(container) {
  // Bind Cancel buttons
  const cancelButtons = container.querySelectorAll(".cancel-dep-btn");
  cancelButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const depId = btn.getAttribute("data-id");
      promptDepositCancellation(depId);
    });
  });

  // Bind Details buttons
  const detailsButtons = container.querySelectorAll(".view-receipt-btn");
  detailsButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const depId = btn.getAttribute("data-id");
      const url = btn.getAttribute("data-url");
      const notes = btn.getAttribute("data-notes");
      const method = btn.getAttribute("data-method");
      const amount = btn.getAttribute("data-amount");
      const tx = btn.getAttribute("data-tx");
      
      showReceiptSlipsModal({ id: depId, url, notes, method, amount, tx });
    });
  });
}

/**
 * Prompt confirmation modal before setting deposit rows to cancelled state
 */
function promptDepositCancellation(depositId) {
  Modal.confirm({
    title: "Cancel Funding Request?",
    body: `
      <div class="text-center p-2">
        <i class="bi bi-exclamation-octagon text-danger fs-1 mb-3 d-block text-glow-danger animate-pulse"></i>
        <h6 class="text-white fw-bold">Are you sure you want to cancel deposit slip ${depositId}?</h6>
        <p class="text-secondary text-xs mt-2 m-0">This operation cannot be reversed. Cancelling this slip will release pending ledger claims and close administrative checks.</p>
      </div>
    `,
    confirmText: "Yes, Cancel Slip",
    confirmClass: "btn-hfc-danger",
    cancelText: "Dismiss",
    onConfirm: async (modal) => {
      Loader.show("Terminating payment slips...");
      try {
        // 1. Update the Deposits record collection
        await updateDocument("deposits", depositId, {
          status: "cancelled"
        });

        // 2. Synchronize transactions ledger state to cancelled
        await updateDocument("transactions", depositId, {
          status: "cancelled"
        });

        Toast.show(`Deposit slip ${depositId} cancelled successfully.`, { type: "success" });
      } catch (err) {
        console.error("Cancellation crash:", err);
        Toast.show("Unable to terminate deposit claims. Permission denied or database offline.", { type: "danger" });
      } finally {
        Loader.hide();
        modal.destroy();
      }
    }
  });
}

/**
 * Render details, notes, and screenshot preview thumbnail inside modular overlays
 */
function showReceiptSlipsModal(data) {
  const modalBodyHtml = `
    <div class="row g-3">
      <div class="col-md-5">
        <h6 class="text-muted text-xs mb-1">TRANSACTION DETAILS</h6>
        <div class="d-flex flex-column gap-2 text-sm text-light mb-3">
          <div><span class="text-muted text-xs">Slip ID:</span> <span class="text-mono fw-bold text-white text-xs">${data.id}</span></div>
          <div><span class="text-muted text-xs">Method:</span> <span class="fw-semibold text-white">${data.method}</span></div>
          <div><span class="text-muted text-xs">Amount:</span> <span class="text-mono text-primary fw-bold">${parseFloat(data.amount).toLocaleString()} PKR</span></div>
          <div><span class="text-muted text-xs">TxID Reference:</span> <span class="text-mono text-accent text-xs fw-semibold">${data.tx}</span></div>
        </div>
        
        <h6 class="text-muted text-xs mb-1">USER NOTES / REMARKS</h6>
        <p class="card-glass p-2 text-xs text-secondary mb-0" style="min-height: 80px; overflow-wrap: break-word;">
          ${data.notes ? data.notes : "No remarks appended to this deposit slip claims."}
        </p>
      </div>
      <div class="col-md-7 text-center">
        <span class="text-muted text-xs d-block mb-1 text-start">VERIFIED PAYMENT RECEIPT</span>
        <a href="${data.url}" target="_blank" title="Open screenshot in new tab">
          <img src="${data.url}" class="receipt-preview-img" alt="Payment Receipt Slip">
        </a>
        <div class="text-muted text-2xs mt-1"><i class="bi bi-box-arrow-up-right"></i> Click the screenshot receipt image to inspect original details in high resolution.</div>
      </div>
    </div>
  `;

  const detailsModal = new Modal({
    title: `Settlement Audit: ${data.id}`,
    body: modalBodyHtml,
    size: "lg",
    buttons: [
      { label: "Close Panel", class: "btn-hfc-secondary", onClick: (m) => m.destroy() }
    ]
  });

  detailsModal.open();
}

/**
 * CSS styles mapping to premium Status Badges
 */
function getStatusBadgeClass(status) {
  switch (status) {
    case "pending": return "deposit-badge-pending";
    case "review": return "deposit-badge-review";
    case "approved": return "deposit-badge-approved";
    case "rejected": return "deposit-badge-rejected";
    case "cancelled": return "deposit-badge-cancelled";
    default: return "bg-secondary text-white";
  }
}

/**
 * Text labels mapping to raw status strings
 */
function getDisplayStatusText(status) {
  switch (status) {
    case "pending": return "Pending";
    case "review": return "Under Review";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "cancelled": return "Cancelled";
    default: return status;
  }
}
