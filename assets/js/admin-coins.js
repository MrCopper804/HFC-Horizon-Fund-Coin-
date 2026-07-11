/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Admin Coin Management Controller
 * Handles strict RBAC guards, real-time snapshot streams of coin registry,
 * secure image uploads via Firebase Storage, atomic transactions, and deletion safety checks.
 */

import { auth, db } from "../../firebase/firebase.js";
import { 
  collection, 
  doc, 
  query, 
  orderBy, 
  onSnapshot, 
  getDoc, 
  getDocs,
  setDoc,
  updateDoc, 
  deleteDoc,
  where, 
  limit,
  serverTimestamp
} from "firebase/firestore";
import { logoutUser } from "../../firebase/auth.js";
import { createDocument, updateDocument, deleteDocument, runSafeTransaction } from "../../firebase/firestore.js";
import { uploadImage } from "../../firebase/storage.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";
import { EmptyState } from "../../components/EmptyState.js";

// Global app state
let activePageLayout = null;
let coinsList = [];
let unsubscribeCoins = null;
let searchFilter = "";
let statusFilter = "all";

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Strict Auth and RBAC Check
  const adminUser = await verifyAdminPrivileges();
  if (!adminUser) return; // verifyAdminPrivileges handles the redirection

  // 2. Initialize layout wrapper
  activePageLayout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: adminUser.email,
      versionText: "Admin Core v3.0",
      initialNotifications: [
        { id: 1, type: "info", text: "Coin Management terminal authorized." }
      ],
      onLogout: async () => {
        try {
          const loader = new Loader({ text: "Terminating terminal authority..." });
          loader.show();
          await logoutUser();
          loader.hide();
          Toast.show("Admin session closed. Terminal locked.", { type: "info" });
          setTimeout(() => {
            window.location.href = "/admin/login.html";
          }, 1000);
        } catch (err) {
          Toast.show("Failed to close session properly.", { type: "danger" });
        }
      }
    },
    sidebarOptions: {
      brandName: "HFC ADMIN",
      activeId: "admin-coins",
      menuItems: [
        { id: "admin-dashboard", label: "Control Panel", icon: "bi-shield-check", href: "/admin/dashboard.html" },
        { id: "admin-coins", label: "Coin Management", icon: "bi-coin", href: "/admin/coins.html" },
        { id: "users", label: "Users List", icon: "bi-people-fill", href: "/admin/dashboard.html#users" },
        { id: "deposits", label: "Deposits Vault", icon: "bi-cash-coin", href: "/admin/dashboard.html#deposits" },
        { id: "withdrawals", label: "Withdrawals Queue", icon: "bi-box-arrow-up-right", href: "/admin/dashboard.html#withdrawals" },
        { id: "marketplace", label: "Offer Book", icon: "bi-shop-window", href: "/admin/dashboard.html#marketplace" },
        { id: "trades", label: "Trade Auditor", icon: "bi-journal-check", href: "/admin/dashboard.html#trades" },
        { id: "settings", label: "Terminal Settings", icon: "bi-gear-wide-connected", href: "/admin/dashboard.html#settings" }
      ],
      onNavigate: (item) => {
        if (item.id === "admin-coins") return;
        window.location.href = item.href;
      }
    }
  });

  // 3. Render page outline and bind real-time snapshot listeners
  renderPageOutline();
  startClock();
  subscribeToCoinsCollection();
});

/**
 * Strict Rule: Verifies user session and role === admin
 */
async function verifyAdminPrivileges() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        console.warn("Unauthorized access attempt. Redirecting...");
        window.location.href = "/admin/login.html";
        resolve(null);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === "admin") {
          resolve(user);
        } else {
          console.error("Access Denied: Role is not administrator.");
          await logoutUser();
          window.location.href = "/admin/login.html";
          resolve(null);
        }
      } catch (err) {
        console.error("RBAC Validation Error:", err);
        window.location.href = "/admin/login.html";
        resolve(null);
      }
    });
  });
}

/**
 * Renders the main skeleton / outline layout for the page.
 */
function renderPageOutline() {
  const container = activePageLayout.getContentContainer();
  if (!container) return;

  container.innerHTML = `
    <!-- Page Header mount target -->
    <div id="page-header-mount"></div>

    <!-- Live Status Banner -->
    <div class="alert alert-dashboard border-success p-3 mb-4 d-flex align-items-center justify-content-between" role="alert" style="background: rgba(14, 203, 129, 0.05);">
      <div class="d-flex align-items-center gap-2">
        <div class="system-pulse-online"></div>
        <span class="text-xs text-secondary">
          <strong class="text-white uppercase text-glow-primary text-display me-2">Asset Oracle Live:</strong> 
          Standard ERC-20 and native chain variables are synchronized. All listing events are cryptographically recorded.
        </span>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span id="liveClockDisplay" class="text-mono text-xs text-white bg-dark bg-opacity-20 px-2.5 py-1 rounded border border-secondary border-opacity-10">UTC --:--:--</span>
      </div>
    </div>

    <!-- Summary Metrics Grid -->
    <div class="admin-summary-grid" id="admin-coins-metrics">
      <div class="admin-metric-card">
        <div class="admin-metric-label">Total Registered</div>
        <div class="admin-metric-value" id="metric-total-coins">0</div>
        <div class="admin-metric-footer">Cryptographic ledger assets</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-label">Active Markets</div>
        <div class="admin-metric-value text-success" id="metric-active-coins">0</div>
        <div class="admin-metric-footer">Trading pairs online</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-label">Suspended / Inactive</div>
        <div class="admin-metric-value text-danger" id="metric-inactive-coins">0</div>
        <div class="admin-metric-footer">Temporarily halted assets</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-label">Archived Assets</div>
        <div class="admin-metric-value text-muted" id="metric-archived-coins">0</div>
        <div class="admin-metric-footer">Hidden from listings</div>
      </div>
    </div>

    <!-- Interactive Table and Filter Module -->
    <div class="admin-table-card">
      <div class="admin-filter-bar">
        <div class="row g-3 align-items-center">
          <div class="col-md-5">
            <div class="position-relative">
              <span class="position-absolute top-50 start-0 translate-middle-y ps-3 text-muted">
                <i class="bi bi-search"></i>
              </span>
              <input type="text" class="form-control input-glass ps-5" id="searchCoinsInput" placeholder="Search by name, symbol, or asset ID..." />
            </div>
          </div>
          <div class="col-md-4">
            <div class="d-flex align-items-center gap-2">
              <label class="text-muted text-xs text-mono text-nowrap m-0 uppercase">Status:</label>
              <select class="form-select input-glass" id="filterStatusSelect">
                <option value="all">Show All Listed</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
                <option value="hidden">Hidden Only</option>
                <option value="archived">Archived Only</option>
              </select>
            </div>
          </div>
          <div class="col-md-3 text-md-end">
            <button class="btn-hfc btn-hfc-secondary w-100 py-2" id="clearFiltersBtn">
              <i class="bi bi-eraser me-1"></i> Reset Filters
            </button>
          </div>
        </div>
      </div>

      <!-- Coins List Container -->
      <div class="table-responsive">
        <table class="table table-glass text-nowrap" id="coinsTable">
          <thead>
            <tr>
              <th scope="col" style="width: 50px;">Icon</th>
              <th scope="col">Asset Name</th>
              <th scope="col">Symbol</th>
              <th scope="col">Total Supply</th>
              <th scope="col">Initial Price (PKR)</th>
              <th scope="col">Initial Price (USD)</th>
              <th scope="col">Decimals</th>
              <th scope="col">Status</th>
              <th scope="col">Created At</th>
              <th scope="col" class="text-end" style="width: 150px;">Actions</th>
            </tr>
          </thead>
          <tbody id="coinsTableBody">
            <!-- Loading state on initial render -->
            <tr>
              <td colspan="10" class="p-5 text-center">
                <div class="spinner-border text-primary mb-2" role="status"></div>
                <div class="text-mono text-xs uppercase text-secondary">Awaiting ledger index feed...</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Instantiate the PageHeader component
  new PageHeader("#page-header-mount", {
    title: "Cryptocurrency Asset Registry",
    description: "Mint and configure available trading pairs, update asset status, and audit centralized circulation rules.",
    breadcrumbs: [
      { label: "Admin Core", href: "/admin/dashboard.html" },
      { label: "Coin Manager", active: true }
    ],
    action: {
      label: "Create New Coin",
      icon: "bi-plus-circle-fill",
      onClick: () => triggerCreateCoinModal()
    }
  });

  // Bind local filter events
  const searchInput = document.getElementById("searchCoinsInput");
  const statusSelect = document.getElementById("filterStatusSelect");
  const clearBtn = document.getElementById("clearFiltersBtn");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchFilter = e.target.value.trim().toLowerCase();
      applyFiltersAndRender();
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener("change", (e) => {
      statusFilter = e.target.value;
      applyFiltersAndRender();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (statusSelect) statusSelect.value = "all";
      searchFilter = "";
      statusFilter = "all";
      applyFiltersAndRender();
    });
  }
}

/**
 * Subscribes to real-time updates from Firestore coins collection
 */
function subscribeToCoinsCollection() {
  const coinsRef = collection(db, "coins");
  const q = query(coinsRef, orderBy("symbol", "asc"));

  unsubscribeCoins = onSnapshot(q, (snapshot) => {
    coinsList = [];
    snapshot.forEach((docSnap) => {
      coinsList.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    updateSummaryMetrics();
    applyFiltersAndRender();
  }, (error) => {
    console.error("Firestore Snapshot Subscription Error:", error);
    Toast.show("Failed to receive real-time coin updates.", { type: "danger" });
  });
}

/**
 * Calculates sum statistics and updates UI widgets.
 */
function updateSummaryMetrics() {
  const total = coinsList.length;
  const active = coinsList.filter(c => c.status === "active").length;
  const inactive = coinsList.filter(c => c.status === "inactive" || c.status === "suspended").length;
  const archived = coinsList.filter(c => c.status === "archived" || c.status === "hidden").length;

  const totalEl = document.getElementById("metric-total-coins");
  const activeEl = document.getElementById("metric-active-coins");
  const inactiveEl = document.getElementById("metric-inactive-coins");
  const archivedEl = document.getElementById("metric-archived-coins");

  if (totalEl) totalEl.textContent = total;
  if (activeEl) activeEl.textContent = active;
  if (inactiveEl) inactiveEl.textContent = inactive;
  if (archivedEl) archivedEl.textContent = archived;
}

/**
 * Apply local memory filter parameters and draw table rows.
 */
function applyFiltersAndRender() {
  const tbody = document.getElementById("coinsTableBody");
  if (!tbody) return;

  const filtered = coinsList.filter(coin => {
    // Search match
    const nameMatch = coin.name ? coin.name.toLowerCase().includes(searchFilter) : false;
    const symbolMatch = coin.symbol ? coin.symbol.toLowerCase().includes(searchFilter) : false;
    const idMatch = coin.id ? coin.id.toLowerCase().includes(searchFilter) : false;
    const matchesSearch = !searchFilter || nameMatch || symbolMatch || idMatch;

    // Status match
    let matchesStatus = true;
    if (statusFilter !== "all") {
      matchesStatus = coin.status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="p-0 border-0">
          <div class="p-5 text-center text-mono">
            <i class="bi bi-wallet2 text-glow-primary text-primary fs-3 d-block mb-2"></i>
            <h5 class="text-white fw-bold">No Matching Cryptocurrencies</h5>
            <p class="text-secondary text-xs mt-1">Adjust search parameters or create a new token standard.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(coin => {
    const formattedSupply = Number(coin.totalSupply || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
    const formattedPricePKR = Number(coin.initialPricePKR || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const formattedPriceUSD = Number(coin.initialPriceUSD || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    
    let statusBadgeClass = "badge-status-inactive";
    if (coin.status === "active") statusBadgeClass = "badge-status-active";
    else if (coin.status === "hidden") statusBadgeClass = "badge-status-hidden";
    else if (coin.status === "archived") statusBadgeClass = "badge-status-archived";

    let dateStr = "N/A";
    if (coin.createdAt) {
      const dateVal = coin.createdAt.toDate ? coin.createdAt.toDate() : new Date(coin.createdAt);
      dateStr = dateVal.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // Logo image rendering or default fallback
    const logoHtml = coin.logo 
      ? `<img src="${coin.logo}" alt="${coin.symbol}" referrerpolicy="no-referrer" />` 
      : `<i class="bi bi-coin coin-fallback-icon"></i>`;

    return `
      <tr>
        <td>
          <div class="coin-logo-container">
            ${logoHtml}
          </div>
        </td>
        <td>
          <span class="text-white fw-bold">${coin.name || "Unnamed"}</span>
        </td>
        <td>
          <span class="text-mono text-primary uppercase fw-bold tracking-wider">${coin.symbol || "UNKNOWN"}</span>
        </td>
        <td class="text-mono text-white text-end">${formattedSupply}</td>
        <td class="text-mono text-success text-end">₨ ${formattedPricePKR}</td>
        <td class="text-mono text-info text-end">$ ${formattedPriceUSD}</td>
        <td class="text-mono text-center">${coin.decimals ?? 18}</td>
        <td>
          <span class="badge rounded-pill ${statusBadgeClass} uppercase text-xs font-semibold px-2.5 py-1">
            ${coin.status || "inactive"}
          </span>
        </td>
        <td>
          <span class="text-muted text-xs">${dateStr}</span>
        </td>
        <td class="text-end">
          <div class="d-flex align-items-center justify-content-end gap-1.5">
            <button class="btn-action-icon" onclick="window.triggerViewCoinDetails('${coin.symbol}')" title="View details">
              <i class="bi bi-eye"></i>
            </button>
            <button class="btn-action-icon" onclick="window.triggerEditCoinModal('${coin.symbol}')" title="Edit fields">
              <i class="bi bi-pencil"></i>
            </button>
            ${coin.status === 'active' ? `
              <button class="btn-action-icon" onclick="window.toggleCoinQuickStatus('${coin.symbol}', 'inactive')" title="Disable trading">
                <i class="bi bi-pause-circle text-warning"></i>
              </button>
            ` : `
              <button class="btn-action-icon" onclick="window.toggleCoinQuickStatus('${coin.symbol}', 'active')" title="Enable trading">
                <i class="bi bi-play-circle text-success"></i>
              </button>
            `}
            <button class="btn-action-icon btn-action-icon-danger" onclick="window.triggerDeleteCoin('${coin.symbol}')" title="Delete listing">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Spawns the Creation modal.
 * Implements advanced Drag and Drop for asset logo, real-time validations, 
 * and handles atomic double write inside client side.
 */
function triggerCreateCoinModal() {
  let uploadedLogoUrl = "";

  const formBodyHtml = `
    <form id="createCoinForm" class="row g-3">
      <!-- Drag and Drop Image Uploader -->
      <div class="col-12">
        <label class="form-label-glass">Asset Symbol Logo (SVG, PNG, JPG)</label>
        <div class="hfc-upload-zone" id="dragDropLogoZone">
          <input type="file" id="logoFileInput" class="d-none" accept="image/*" />
          <div id="uploadZoneContent">
            <i class="bi bi-cloud-arrow-up text-primary"></i>
            <span class="text-white d-block text-sm fw-semibold">Drag & Drop Image or Click to Browse</span>
            <span class="text-muted text-xs d-block mt-1">Recommended size: 128x128px, Max size: 5MB</span>
          </div>
          <div id="uploadZoneProgress" class="d-none">
            <div class="spinner-border text-primary mb-2" role="status"></div>
            <span class="text-white text-xs d-block uppercase tracking-wider text-mono">Uploading asset logo to cloud storage...</span>
          </div>
          <div id="uploadZonePreview" class="d-none text-center">
            <img src="" id="logoImagePreview" class="hfc-upload-preview mb-2" referrerpolicy="no-referrer" />
            <span class="text-success text-xs d-block"><i class="bi bi-check2-circle"></i> Upload completed successfully!</span>
            <button type="button" class="btn btn-link btn-xs text-danger text-decoration-none p-0 mt-1" id="removeLogoBtn">Replace Logo</button>
          </div>
        </div>
      </div>

      <div class="col-md-7">
        <label for="coinNameInput" class="form-label-glass">Coin Display Name</label>
        <input type="text" class="form-control input-glass" id="coinNameInput" placeholder="e.g. Pakistan Digital Rupee" required />
      </div>

      <div class="col-md-5">
        <label for="coinSymbolInput" class="form-label-glass">Unique Symbol / Ticker</label>
        <input type="text" class="form-control input-glass uppercase" id="coinSymbolInput" placeholder="e.g. PKDR" maxlength="10" required />
        <div class="form-text-muted text-mono text-xs uppercase text-danger d-none" id="duplicateSymbolError">Symbol is already registered!</div>
      </div>

      <div class="col-md-8">
        <label for="coinSupplyInput" class="form-label-glass">Total Cap / Minting Supply</label>
        <input type="number" class="form-control input-glass" id="coinSupplyInput" step="any" min="0.0001" placeholder="e.g. 500000000" required />
        <div class="form-text-muted">Entire supply will be directly assigned to your Admin Wallet. No further minting is allowed.</div>
      </div>

      <div class="col-md-4">
        <label for="coinDecimalsInput" class="form-label-glass">Decimals</label>
        <input type="number" class="form-control input-glass" id="coinDecimalsInput" value="18" min="0" max="18" required />
      </div>

      <div class="col-md-6">
        <label for="pricePKRInput" class="form-label-glass">Initial Price (PKR)</label>
        <input type="number" class="form-control input-glass" id="pricePKRInput" step="any" min="0.000001" placeholder="e.g. 278.50" required />
      </div>

      <div class="col-md-6">
        <label for="priceUSDInput" class="form-label-glass">Initial Price (USD)</label>
        <input type="number" class="form-control input-glass" id="priceUSDInput" step="any" min="0.000001" placeholder="e.g. 1.00" required />
      </div>

      <div class="col-md-6">
        <label for="coinStatusSelect" class="form-label-glass">Trading Standard Status</label>
        <select class="form-select input-glass" id="coinStatusSelect">
          <option value="active">Active (Trading online)</option>
          <option value="inactive">Inactive (Suspended)</option>
          <option value="hidden">Hidden (Testing phase)</option>
        </select>
      </div>

      <div class="col-12">
        <label for="coinDescriptionInput" class="form-label-glass">Asset / Project Description</label>
        <textarea class="form-control input-glass" id="coinDescriptionInput" rows="3" placeholder="Provide detailed cryptographic utility, tokenomics standard, and issuing framework descriptions..."></textarea>
      </div>
    </form>
  `;

  const modal = new Modal({
    title: "Mint & List Cryptographic Asset",
    body: formBodyHtml,
    size: "lg",
    buttons: [
      {
        label: "Cancel Listing",
        class: "btn-hfc-secondary",
        onClick: (m) => m.destroy()
      },
      {
        label: "Authorize Minting & Register",
        class: "btn-hfc-primary",
        onClick: async (m) => {
          const success = await handleCreateCoinSubmit(m, uploadedLogoUrl);
          if (success) {
            m.destroy();
          }
        }
      }
    ]
  });

  modal.open();

  // Bind local DOM handlers for uploading logo inside modal
  const dropZone = document.getElementById("dragDropLogoZone");
  const fileInput = document.getElementById("logoFileInput");
  const zoneContent = document.getElementById("uploadZoneContent");
  const zoneProgress = document.getElementById("uploadZoneProgress");
  const zonePreview = document.getElementById("uploadZonePreview");
  const logoPreview = document.getElementById("logoImagePreview");
  const removeBtn = document.getElementById("removeLogoBtn");

  if (!dropZone || !fileInput) return;

  // Open file selector on click
  dropZone.addEventListener("click", (e) => {
    if (e.target !== removeBtn) {
      fileInput.click();
    }
  });

  // Drag-and-drop mechanics
  const highlight = (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  };

  const unhighlight = (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  };

  dropZone.addEventListener("dragenter", highlight);
  dropZone.addEventListener("dragover", highlight);
  dropZone.addEventListener("dragleave", unhighlight);

  dropZone.addEventListener("drop", (e) => {
    unhighlight(e);
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleLogoFileUpload(files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleLogoFileUpload(files[0]);
    }
  });

  removeBtn.onclick = (e) => {
    e.stopPropagation();
    uploadedLogoUrl = "";
    fileInput.value = "";
    zonePreview.classList.add("d-none");
    zoneContent.classList.remove("d-none");
  };

  async function handleLogoFileUpload(file) {
    zoneContent.classList.add("d-none");
    zoneProgress.classList.remove("d-none");
    try {
      const downloadUrl = await uploadImage(file, "coins");
      uploadedLogoUrl = downloadUrl;
      logoPreview.src = downloadUrl;
      zoneProgress.classList.add("d-none");
      zonePreview.classList.remove("d-none");
      Toast.show("Asset logo uploaded to secure Storage.", { type: "success" });
    } catch (err) {
      console.error(err);
      zoneProgress.classList.add("d-none");
      zoneContent.classList.remove("d-none");
      Toast.show(err.message || "File upload failed.", { type: "danger" });
    }
  }

  // Real-time unique symbol validator
  const symbolInput = document.getElementById("coinSymbolInput");
  const duplicateErr = document.getElementById("duplicateSymbolError");
  if (symbolInput) {
    symbolInput.addEventListener("input", () => {
      const sym = symbolInput.value.trim().toUpperCase();
      const duplicateExists = coinsList.some(c => c.symbol.toUpperCase() === sym);
      if (duplicateExists) {
        duplicateErr.classList.remove("d-none");
        symbolInput.classList.add("border-danger");
      } else {
        duplicateErr.classList.add("d-none");
        symbolInput.classList.remove("border-danger");
      }
    });
  }
}

/**
 * Handle validation and safe transaction for coin creation.
 */
async function handleCreateCoinSubmit(modalInstance, logoUrl) {
  const nameInput = document.getElementById("coinNameInput");
  const symbolInput = document.getElementById("coinSymbolInput");
  const supplyInput = document.getElementById("coinSupplyInput");
  const decimalsInput = document.getElementById("coinDecimalsInput");
  const pricePKRInput = document.getElementById("pricePKRInput");
  const priceUSDInput = document.getElementById("priceUSDInput");
  const statusSelect = document.getElementById("coinStatusSelect");
  const descriptionInput = document.getElementById("coinDescriptionInput");

  if (!nameInput || !symbolInput || !supplyInput || !pricePKRInput || !priceUSDInput) {
    return false;
  }

  const name = nameInput.value.trim();
  const symbol = symbolInput.value.trim().toUpperCase();
  const totalSupply = parseFloat(supplyInput.value);
  const decimals = parseInt(decimalsInput.value) || 0;
  const initialPricePKR = parseFloat(pricePKRInput.value);
  const initialPriceUSD = parseFloat(priceUSDInput.value);
  const status = statusSelect.value;
  const description = descriptionInput.value.trim();

  // Basic JS validations
  if (!name) {
    Toast.show("Coin name is required.", { type: "danger" });
    return false;
  }
  if (!symbol || !/^[A-Z0-9]{2,10}$/.test(symbol)) {
    Toast.show("Symbol must be alphanumeric and 2-10 characters long.", { type: "danger" });
    return false;
  }
  if (isNaN(totalSupply) || totalSupply <= 0) {
    Toast.show("Cap supply must be a positive number.", { type: "danger" });
    return false;
  }
  if (decimals < 0 || decimals > 18) {
    Toast.show("Decimals must be between 0 and 18.", { type: "danger" });
    return false;
  }
  if (isNaN(initialPricePKR) || initialPricePKR <= 0) {
    Toast.show("Initial price in PKR must be positive.", { type: "danger" });
    return false;
  }
  if (isNaN(initialPriceUSD) || initialPriceUSD <= 0) {
    Toast.show("Initial price in USD must be positive.", { type: "danger" });
    return false;
  }

  // Symbol duplicate validation
  const duplicateExists = coinsList.some(c => c.symbol.toUpperCase() === symbol);
  if (duplicateExists) {
    Toast.show("A coin with this symbol is already registered.", { type: "danger" });
    return false;
  }

  // Loaders & Transaction flow
  const progressLoader = new Loader({ text: "Registering standard coin & minting supply..." });
  progressLoader.show();

  try {
    const adminUid = auth.currentUser.uid;
    const lowerId = symbol.toLowerCase();
    const compositeWalletId = `${adminUid}_${symbol}`;

    // Create a mock cryptographically unique address for Admin's newly created Wallet
    const randomHex = "0x" + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("");

    const coinPayload = {
      coinId: lowerId,
      name,
      symbol,
      logo: logoUrl || "",
      description,
      totalSupply,
      circulatingSupply: 0, // Assigned solely to admin, circulating remains 0 till transferred
      decimals,
      initialPricePKR,
      initialPriceUSD,
      status,
      ownerUid: adminUid
    };

    const walletPayload = {
      walletId: compositeWalletId,
      ownerId: adminUid,
      currency: symbol,
      symbol,
      availableBalance: totalSupply,
      holdBalance: 0,
      address: randomHex
    };

    // Atomic double write inside a Firestore safe transaction
    await runSafeTransaction(async (transaction) => {
      // 1. Write the Coin specification document
      const coinDocRef = doc(db, "coins", symbol); // uppercase symbol ID
      transaction.set(coinDocRef, {
        ...coinPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Write the Admin's corresponding wallet document
      const walletDocRef = doc(db, "wallets", compositeWalletId);
      transaction.set(walletDocRef, {
        ...walletPayload,
        updatedAt: serverTimestamp()
      });
    });

    progressLoader.hide();
    Toast.show(`Successfully registered ${name} (${symbol}). Entire supply assigned to your Admin Wallet.`, { type: "success" });
    return true;
  } catch (err) {
    progressLoader.hide();
    console.error("Transact Fail:", err);
    Toast.show(`Failed to finalize ledger writes: ${err.message || err}`, { type: "danger" });
    return false;
  }
}

/**
 * Quick toggling of the trading standard state
 */
window.toggleCoinQuickStatus = async function(symbol, targetStatus) {
  const loader = new Loader({ text: `Adjusting asset status to ${targetStatus}...` });
  loader.show();
  try {
    await updateDocument("coins", symbol, { status: targetStatus });
    loader.hide();
    Toast.show(`Successfully set status of ${symbol} to ${targetStatus}.`, { type: "success" });
  } catch (err) {
    loader.hide();
    Toast.show(`Failed to adjust asset state: ${err.message || err}`, { type: "danger" });
  }
};

/**
 * Spawns full details viewer dialog
 */
window.triggerViewCoinDetails = function(symbol) {
  const coin = coinsList.find(c => c.symbol === symbol);
  if (!coin) {
    Toast.show("Asset registry details not found.", { type: "danger" });
    return;
  }

  let dateStr = "N/A";
  if (coin.createdAt) {
    const dateVal = coin.createdAt.toDate ? coin.createdAt.toDate() : new Date(coin.createdAt);
    dateStr = dateVal.toLocaleString();
  }

  const logoHtml = coin.logo 
    ? `<img src="${coin.logo}" alt="${coin.symbol}" style="width: 64px; height: 64px; border-radius:50%; object-fit:cover; border:2px solid var(--hfc-primary);" referrerpolicy="no-referrer" />`
    : `<div class="coin-logo-container mx-auto" style="width: 64px; height: 64px;"><i class="bi bi-coin text-primary fs-2"></i></div>`;

  const detailsHtml = `
    <div class="text-center mb-4">
      ${logoHtml}
      <h4 class="text-white fw-bold mt-2 m-0">${coin.name}</h4>
      <span class="text-mono text-primary uppercase fw-bold fs-5 tracking-wider">${coin.symbol}</span>
    </div>
    <div class="row g-3 text-sm">
      <div class="col-6 py-2 border-bottom border-secondary border-opacity-10">
        <span class="text-muted text-mono text-xs d-block">TOTAL CAP SUPPLY</span>
        <strong class="text-white text-mono">${Number(coin.totalSupply || 0).toLocaleString()}</strong>
      </div>
      <div class="col-6 py-2 border-bottom border-secondary border-opacity-10">
        <span class="text-muted text-mono text-xs d-block">DECIMALS STANDARD</span>
        <strong class="text-white text-mono">${coin.decimals ?? 18}</strong>
      </div>
      <div class="col-6 py-2 border-bottom border-secondary border-opacity-10">
        <span class="text-muted text-mono text-xs d-block">INITIAL PRICE (PKR)</span>
        <strong class="text-success text-mono">₨ ${Number(coin.initialPricePKR || 0).toLocaleString()}</strong>
      </div>
      <div class="col-6 py-2 border-bottom border-secondary border-opacity-10">
        <span class="text-muted text-mono text-xs d-block">INITIAL PRICE (USD)</span>
        <strong class="text-info text-mono">$ ${Number(coin.initialPriceUSD || 0).toLocaleString()}</strong>
      </div>
      <div class="col-6 py-2 border-bottom border-secondary border-opacity-10">
        <span class="text-muted text-mono text-xs d-block">TRADING STATUS</span>
        <span class="badge badge-status-${coin.status} uppercase px-2">${coin.status}</span>
      </div>
      <div class="col-6 py-2 border-bottom border-secondary border-opacity-10">
        <span class="text-muted text-mono text-xs d-block">REGISTRATION TIME</span>
        <span class="text-white text-mono text-xs">${dateStr}</span>
      </div>
      <div class="col-12 mt-3">
        <span class="text-muted text-mono text-xs d-block mb-1">ASSET DESCRIPTION</span>
        <div class="p-3 rounded bg-white bg-opacity-5 text-secondary" style="font-size:0.825rem; white-space:pre-wrap; max-height:120px; overflow-y:auto;">
          ${coin.description || "No description provided for this cryptographic asset standards."}
        </div>
      </div>
    </div>
  `;

  const modal = new Modal({
    title: `${coin.symbol} Asset Specification Sheet`,
    body: detailsHtml,
    size: "md",
    buttons: [
      {
        label: "Close Spec Sheet",
        class: "btn-hfc-secondary",
        onClick: (m) => m.destroy()
      }
    ]
  });

  modal.open();
};

/**
 * Spawns Editing modal.
 * Follows immutable business rules: Total Supply and Symbol cannot be edited.
 */
window.triggerEditCoinModal = function(symbol) {
  const coin = coinsList.find(c => c.symbol === symbol);
  if (!coin) {
    Toast.show("Asset registry standard not found.", { type: "danger" });
    return;
  }

  let updatedLogoUrl = coin.logo || "";

  const editBodyHtml = `
    <form id="editCoinForm" class="row g-3">
      <!-- Drag and Drop Image Uploader for editing logo -->
      <div class="col-12">
        <label class="form-label-glass">Asset Symbol Logo</label>
        <div class="hfc-upload-zone" id="editLogoZone">
          <input type="file" id="editLogoFileInput" class="d-none" accept="image/*" />
          <div id="editZoneContent" class="${coin.logo ? 'd-none' : ''}">
            <i class="bi bi-cloud-arrow-up text-primary"></i>
            <span class="text-white d-block text-sm fw-semibold">Drag & Drop Image or Click to Browse</span>
          </div>
          <div id="editZoneProgress" class="d-none">
            <div class="spinner-border text-primary mb-2" role="status"></div>
            <span class="text-white text-xs d-block text-mono uppercase">Uploading...</span>
          </div>
          <div id="editZonePreview" class="${coin.logo ? '' : 'd-none'} text-center">
            <img src="${coin.logo || ''}" id="editLogoPreview" class="hfc-upload-preview mb-2" referrerpolicy="no-referrer" />
            <span class="text-success text-xs d-block"><i class="bi bi-check2-circle"></i> Image synced</span>
            <button type="button" class="btn btn-link btn-xs text-danger text-decoration-none p-0 mt-1" id="removeEditLogoBtn">Remove Logo</button>
          </div>
        </div>
      </div>

      <div class="col-md-7">
        <label for="editCoinNameInput" class="form-label-glass">Coin Name (Mutable)</label>
        <input type="text" class="form-control input-glass" id="editCoinNameInput" value="${coin.name || ''}" required />
      </div>

      <div class="col-md-5">
        <label class="form-label-glass">Unique Symbol (Immutable)</label>
        <input type="text" class="form-control input-glass bg-dark" value="${coin.symbol}" disabled />
        <div class="form-text-muted text-xs text-mono uppercase text-warning">Symbols cannot be modified post-deployment</div>
      </div>

      <div class="col-md-8">
        <label class="form-label-glass">Total Cap Supply (Immutable)</label>
        <input type="text" class="form-control input-glass bg-dark" value="${Number(coin.totalSupply || 0).toLocaleString()}" disabled />
        <div class="form-text-muted text-xs text-mono uppercase text-warning">Strict Ledger Rule: No minting or burning allowed.</div>
      </div>

      <div class="col-md-4">
        <label class="form-label-glass">Decimals (Immutable)</label>
        <input type="number" class="form-control input-glass bg-dark" value="${coin.decimals ?? 18}" disabled />
      </div>

      <div class="col-md-6">
        <label for="editPricePKRInput" class="form-label-glass">Price (PKR)</label>
        <input type="number" class="form-control input-glass" id="editPricePKRInput" value="${coin.initialPricePKR || 0}" step="any" min="0.000001" required />
      </div>

      <div class="col-md-6">
        <label for="editPriceUSDInput" class="form-label-glass">Price (USD)</label>
        <input type="number" class="form-control input-glass" id="editPriceUSDInput" value="${coin.initialPriceUSD || 0}" step="any" min="0.000001" required />
      </div>

      <div class="col-md-6">
        <label for="editCoinStatusSelect" class="form-label-glass">Market standard Status</label>
        <select class="form-select input-glass" id="editCoinStatusSelect">
          <option value="active" ${coin.status === 'active' ? 'selected' : ''}>Active (Trading online)</option>
          <option value="inactive" ${coin.status === 'inactive' ? 'selected' : ''}>Inactive (Suspended)</option>
          <option value="hidden" ${coin.status === 'hidden' ? 'selected' : ''}>Hidden (Testing phase)</option>
          <option value="archived" ${coin.status === 'archived' ? 'selected' : ''}>Archived (Hidden from tables)</option>
        </select>
      </div>

      <div class="col-12">
        <label for="editCoinDescriptionInput" class="form-label-glass">Tokenomics Description</label>
        <textarea class="form-control input-glass" id="editCoinDescriptionInput" rows="3">${coin.description || ''}</textarea>
      </div>
    </form>
  `;

  const modal = new Modal({
    title: `Modify ${coin.symbol} Specification`,
    body: editBodyHtml,
    size: "lg",
    buttons: [
      {
        label: "Discard Modifications",
        class: "btn-hfc-secondary",
        onClick: (m) => m.destroy()
      },
      {
        label: "Commit Asset Changes",
        class: "btn-hfc-primary",
        onClick: async (m) => {
          const success = await handleEditCoinSubmit(symbol, m, updatedLogoUrl);
          if (success) {
            m.destroy();
          }
        }
      }
    ]
  });

  modal.open();

  // Logo file binders inside editing modal
  const dropZone = document.getElementById("editLogoZone");
  const fileInput = document.getElementById("editLogoFileInput");
  const zoneContent = document.getElementById("editZoneContent");
  const zoneProgress = document.getElementById("editZoneProgress");
  const zonePreview = document.getElementById("editZonePreview");
  const logoPreview = document.getElementById("editLogoPreview");
  const removeBtn = document.getElementById("removeEditLogoBtn");

  if (!dropZone || !fileInput) return;

  dropZone.onclick = (e) => {
    if (e.target !== removeBtn) {
      fileInput.click();
    }
  };

  const highlight = (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  };

  const unhighlight = (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  };

  dropZone.addEventListener("dragenter", highlight);
  dropZone.addEventListener("dragover", highlight);
  dropZone.addEventListener("dragleave", unhighlight);

  dropZone.addEventListener("drop", (e) => {
    unhighlight(e);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleLogoEditUpload(files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleLogoEditUpload(files[0]);
    }
  });

  removeBtn.onclick = (e) => {
    e.stopPropagation();
    updatedLogoUrl = "";
    fileInput.value = "";
    zonePreview.classList.add("d-none");
    zoneContent.classList.remove("d-none");
  };

  async function handleLogoEditUpload(file) {
    zoneContent.classList.add("d-none");
    zoneProgress.classList.remove("d-none");
    try {
      const downloadUrl = await uploadImage(file, "coins");
      updatedLogoUrl = downloadUrl;
      logoPreview.src = downloadUrl;
      zoneProgress.classList.add("d-none");
      zonePreview.classList.remove("d-none");
      Toast.show("Asset logo updated.", { type: "success" });
    } catch (err) {
      console.error(err);
      zoneProgress.classList.add("d-none");
      zoneContent.classList.remove("d-none");
      Toast.show(err.message || "File upload failed.", { type: "danger" });
    }
  }
};

/**
 * Validates and updates the edited coin document in Firestore.
 */
async function handleEditCoinSubmit(symbol, modalInstance, logoUrl) {
  const nameInput = document.getElementById("editCoinNameInput");
  const pricePKRInput = document.getElementById("editPricePKRInput");
  const priceUSDInput = document.getElementById("editPriceUSDInput");
  const statusSelect = document.getElementById("editCoinStatusSelect");
  const descriptionInput = document.getElementById("editCoinDescriptionInput");

  if (!nameInput || !pricePKRInput || !priceUSDInput) return false;

  const name = nameInput.value.trim();
  const initialPricePKR = parseFloat(pricePKRInput.value);
  const initialPriceUSD = parseFloat(priceUSDInput.value);
  const status = statusSelect.value;
  const description = descriptionInput.value.trim();

  if (!name) {
    Toast.show("Asset display name cannot be blank.", { type: "danger" });
    return false;
  }
  if (isNaN(initialPricePKR) || initialPricePKR <= 0) {
    Toast.show("PKR Price standard must be a positive decimal.", { type: "danger" });
    return false;
  }
  if (isNaN(initialPriceUSD) || initialPriceUSD <= 0) {
    Toast.show("USD Price standard must be a positive decimal.", { type: "danger" });
    return false;
  }

  const loader = new Loader({ text: `Updating specification for ${symbol}...` });
  loader.show();

  try {
    await updateDocument("coins", symbol, {
      name,
      logo: logoUrl,
      initialPricePKR,
      initialPriceUSD,
      status,
      description
    });
    loader.hide();
    Toast.show(`Successfully committed standard modifications to ${symbol}.`, { type: "success" });
    return true;
  } catch (err) {
    loader.hide();
    Toast.show(`Failed to update specifications: ${err.message || err}`, { type: "danger" });
    return false;
  }
}

/**
 * Strictly verifies delete constraints and deletes the coin.
 * Business Rules:
 * - No user other than admin owns the coin.
 * - No active offers exist.
 * - No trades exist.
 */
window.triggerDeleteCoin = async function(symbol) {
  const adminUid = auth.currentUser.uid;

  // Ask for quick user confirmation before checking backend logs
  Modal.confirm({
    title: `Destroy Asset Listing: ${symbol}`,
    body: `
      <div class="text-center text-danger mb-3">
        <i class="bi bi-exclamation-octagon-fill fs-1"></i>
      </div>
      <p class="text-white text-center">Are you sure you want to permanently delete <strong>${symbol}</strong> from HFC Exchange?</p>
      <p class="text-muted text-xs text-center">This will run a cryptographic scan across active Wallets, Offers, and trade ledgers to ensure no active user is affected.</p>
    `,
    confirmText: "Execute Cryptographic Scan & Delete",
    confirmClass: "btn-hfc-danger",
    onConfirm: async (m) => {
      m.close();
      const checkLoader = new Loader({ text: `Auditing active ledger constraints for ${symbol}...` });
      checkLoader.show();

      try {
        // Rule 1: No user owns the coin (wallets other than admin with balance > 0)
        const walletsQuery = query(collection(db, "wallets"), where("currency", "==", symbol));
        const walletSnap = await getDocs(walletsQuery);
        let userHasBalance = false;
        
        walletSnap.forEach((docSnap) => {
          const w = docSnap.data();
          if (w.ownerId !== adminUid && ((w.availableBalance || 0) > 0 || (w.holdBalance || 0) > 0)) {
            userHasBalance = true;
          }
        });

        if (userHasBalance) {
          checkLoader.hide();
          Modal.confirm({
            title: "Auditing Action Suspended",
            body: `
              <div class="text-center text-warning mb-2"><i class="bi bi-shield-slash fs-1"></i></div>
              <h5 class="text-white text-center">Active User Balances Detected</h5>
              <p class="text-secondary text-sm text-center">Listing for <strong>${symbol}</strong> cannot be deleted because active user accounts hold circulating balances of this token standard.</p>
            `,
            confirmText: "Acknowledge Warning",
            confirmClass: "btn-hfc-primary",
            onConfirm: (modal) => modal.destroy()
          });
          return;
        }

        // Rule 2: No offers exist for this asset
        const offersQuery = query(collection(db, "offers"), where("coinSymbol", "==", symbol), limit(1));
        const offersSnap = await getDocs(offersQuery);
        if (!offersSnap.empty) {
          checkLoader.hide();
          Modal.confirm({
            title: "Auditing Action Suspended",
            body: `
              <div class="text-center text-warning mb-2"><i class="bi bi-shield-slash fs-1"></i></div>
              <h5 class="text-white text-center">Marketplace Offers Exist</h5>
              <p class="text-secondary text-sm text-center">Listing for <strong>${symbol}</strong> cannot be deleted because active limit or market orders are currently open in the peer order book.</p>
            `,
            confirmText: "Acknowledge Warning",
            confirmClass: "btn-hfc-primary",
            onConfirm: (modal) => modal.destroy()
          });
          return;
        }

        // Rule 3: No trades exist referencing this asset
        const tradesQuery = query(collection(db, "trades"), where("coin", "==", symbol), limit(1));
        const tradesSnap = await getDocs(tradesQuery);
        if (!tradesSnap.empty) {
          checkLoader.hide();
          Modal.confirm({
            title: "Auditing Action Suspended",
            body: `
              <div class="text-center text-warning mb-2"><i class="bi bi-shield-slash fs-1"></i></div>
              <h5 class="text-white text-center">Settled Trades Record Found</h5>
              <p class="text-secondary text-sm text-center">Listing for <strong>${symbol}</strong> cannot be deleted because finalized transactions exist on-ledger referencing this coin code.</p>
            `,
            confirmText: "Acknowledge Warning",
            confirmClass: "btn-hfc-primary",
            onConfirm: (modal) => modal.destroy()
          });
          return;
        }

        // Constraints passed, safe to perform deletion!
        // We delete the coin document, and also delete the admin's wallet for this coin to clean up!
        const adminWalletId = `${adminUid}_${symbol}`;
        
        await runSafeTransaction(async (transaction) => {
          const coinRef = doc(db, "coins", symbol);
          const walletRef = doc(db, "wallets", adminWalletId);
          
          transaction.delete(coinRef);
          transaction.delete(walletRef);
        });

        checkLoader.hide();
        Toast.show(`Successfully destroyed and purged ${symbol} listing and admin wallet from registry.`, { type: "success" });
      } catch (err) {
        checkLoader.hide();
        console.error("Deletion Audit error:", err);
        Toast.show(`System check or transaction failed: ${err.message || err}`, { type: "danger" });
      }
    }
  });
};

/**
 * Helper Clock updater
 */
function startClock() {
  const clockEl = document.getElementById("liveClockDisplay");
  if (!clockEl) return;

  const update = () => {
    const d = new Date();
    const hrs = String(d.getUTCHours()).padStart(2, "0");
    const mins = String(d.getUTCMinutes()).padStart(2, "0");
    const secs = String(d.getUTCSeconds()).padStart(2, "0");
    clockEl.textContent = `UTC ${hrs}:${mins}:${secs}`;
  };

  update();
  setInterval(update, 1000);
}
