/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Admin Withdrawal Approval Controller
 * Real-time monitoring, state audits, multi-gateway filtering,
 * secure transaction validations, atomic balances modifications, and audit logs.
 */

import { auth, db } from "../../firebase/firebase.js";
import { 
  collection, 
  doc, 
  query, 
  orderBy, 
  onSnapshot, 
  getDoc, 
  setDoc,
  updateDoc, 
  runTransaction, 
  serverTimestamp,
  increment
} from "firebase/firestore";
import { logoutUser } from "../../firebase/auth.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";

// Global Applet State Context
let activePageLayout = null;
let withdrawalsRawList = [];
let unsubscribeWithdrawals = null;
const userCache = {}; // Cache to avoid multiple reads for same profile
const walletCache = {}; // Cache to avoid duplicate wallet reads

// Filtering criteria states
let searchFilter = "";
let statusFilter = "all";
let methodFilter = "all";
let dateFilter = "all";

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Enforce strict Admin RBAC session guard
  const adminUser = await verifyAdminPrivileges();
  if (!adminUser) return; // verifyAdminPrivileges handles redirection on failure

  // 2. Initialize PageLayout wrapper matching established admin dashboard style
  activePageLayout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: adminUser.email,
      versionText: "Admin Core v3.0",
      initialNotifications: [
        { id: 1, type: "info", text: "Secure withdrawals dispatch engine loaded." }
      ],
      onLogout: async () => {
        try {
          const loader = new Loader({ text: "Terminating session..." });
          loader.show();
          await logoutUser();
          loader.hide();
          Toast.show("Terminal session ended securely.", { type: "info" });
          setTimeout(() => {
            window.location.href = "/admin/login.html";
          }, 1000);
        } catch (err) {
          Toast.show("Session termination error.", { type: "danger" });
        }
      }
    },
    sidebarOptions: {
      brandName: "HFC ADMIN",
      activeId: "admin-withdrawals",
      menuItems: [
        { id: "admin-dashboard", label: "Control Panel", icon: "bi-shield-check", href: "/admin/dashboard.html" },
        { id: "admin-coins", label: "Coin Management", icon: "bi-coin", href: "/admin/coins.html" },
        { id: "admin-deposits", label: "Deposits Vault", icon: "bi-cash-coin", href: "/admin/deposits.html" },
        { id: "admin-withdrawals", label: "Withdrawals Queue", icon: "bi-box-arrow-up-right", href: "/admin/withdrawals.html" },
        { id: "users", label: "Users List", icon: "bi-people-fill", href: "/admin/dashboard.html#users" },
        { id: "marketplace", label: "Offer Book", icon: "bi-shop-window", href: "/admin/dashboard.html#marketplace" },
        { id: "trades", label: "Trade Auditor", icon: "bi-journal-check", href: "/admin/dashboard.html#trades" },
        { id: "settings", label: "Terminal Settings", icon: "bi-gear-wide-connected", href: "/admin/dashboard.html#settings" }
      ],
      onNavigate: (item) => {
        if (item.id === "admin-withdrawals") return;
        window.location.href = item.href;
      }
    }
  });

  // 3. Render basic skeleton frame and start real-time clock and subscription systems
  renderBaseOutline();
  startClock();
  subscribeToWithdrawals();
});

/**
 * Strict RBAC Verification Guard
 * Checks if current user is logged in and has 'admin' role in /users collection
 */
async function verifyAdminPrivileges() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        console.warn("Unauthenticated access detected. Redirecting to admin portal login...");
        window.location.href = "/admin/login.html";
        resolve(null);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === "admin") {
          resolve(user);
        } else {
          console.error("Access Denied: Logged in node lacks administrator status.");
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
 * Promise-based user profile fetcher with caching to prevent parallel read hammering
 * @param {string} userId - User UID
 */
async function getUserProfile(userId) {
  if (!userId) return { fullName: "System Node", email: "system@hfc-exchange.com", username: "system" };
  
  if (userCache[userId]) {
    return userCache[userId];
  }

  userCache[userId] = (async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const d = userDoc.data();
        return {
          fullName: d.fullName || d.displayName || "Unspecified Profile",
          email: d.email || "no-email@hfc.com",
          username: d.username || "unknown",
          phone: d.phone || "No phone linked",
          status: d.status || "active",
          role: d.role || "user"
        };
      }
    } catch (err) {
      console.warn(`Failed to resolve user metadata for UID: ${userId}`, err);
    }
    return { fullName: "Unregistered User", email: "unregistered@hfc.com", username: "guest" };
  })();

  return userCache[userId];
}

/**
 * Promise-based user PKR wallet balance fetcher with caching
 * @param {string} userId - User UID
 */
async function getUserWallet(userId) {
  if (!userId) return { availableBalance: 0, holdBalance: 0, balance: 0 };

  const cacheKey = `${userId}_PKR`;
  if (walletCache[cacheKey]) {
    return walletCache[cacheKey];
  }

  walletCache[cacheKey] = (async () => {
    try {
      const walletDoc = await getDoc(doc(db, "wallets", cacheKey));
      if (walletDoc.exists()) {
        const d = walletDoc.data();
        return {
          availableBalance: d.availableBalance !== undefined ? d.availableBalance : (d.balance || 0),
          holdBalance: d.holdBalance || 0,
          balance: d.balance || 0
        };
      }
    } catch (err) {
      console.warn(`Failed to resolve wallet metadata for UID: ${userId}`, err);
    }
    return { availableBalance: 0, holdBalance: 0, balance: 0 };
  })();

  return walletCache[cacheKey];
}

/**
 * Start UTC Clock ticker in header space
 */
function startClock() {
  const ticker = () => {
    const timeEl = document.getElementById("headerNodeTime");
    if (timeEl) {
      const now = new Date();
      timeEl.textContent = now.toISOString().replace("T", " ").substring(0, 19) + " UTC";
    }
  };
  ticker();
  setInterval(ticker, 1000);
}

/**
 * Render basic structural container inside PageLayout
 */
function renderBaseOutline() {
  const container = activePageLayout.getContentContainer();
  if (!container) return;

  container.innerHTML = `
    <!-- Page Header Info -->
    <div id="admin-withdrawals-header" class="admin-page-header mb-4"></div>

    <!-- Live Sync Context Tracker Banner -->
    <div class="card-glass p-3 mb-4 d-flex flex-wrap justify-content-between align-items-center gap-3 text-sm">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-shield-lock-fill text-danger fs-5"></i>
        <div>
          <span class="text-muted text-xs d-block">AUTHORIZED DISPATCH NODE</span>
          <span class="text-white fw-bold" id="headerUserEmail">Synchronizing session...</span>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 text-mono text-xs">
        <div class="system-pulse-online"></div>
        <div>
          <span class="text-muted text-xs d-block text-end">AUDITING TIMESTAMP (UTC)</span>
          <span class="text-white fw-semibold" id="headerNodeTime">Initializing tracker...</span>
        </div>
      </div>
    </div>

    <!-- Summary Metrics Cards -->
    <div class="admin-summary-grid mb-4" id="statsGrid">
      <div class="admin-metric-card border-warning">
        <div class="admin-metric-label">Pending Withdrawals</div>
        <div class="admin-metric-value text-warning" id="statPendingCount">0</div>
        <div class="admin-metric-footer" id="statPendingAmount">Volume: PKR 0.00</div>
      </div>
      <div class="admin-metric-card border-success">
        <div class="admin-metric-label">Approved Withdrawals</div>
        <div class="admin-metric-value text-success" id="statApprovedCount">0</div>
        <div class="admin-metric-footer text-success-dim" id="statApprovedAmount">Sum: PKR 0.00</div>
      </div>
      <div class="admin-metric-card border-danger">
        <div class="admin-metric-label">Rejected Withdrawals</div>
        <div class="admin-metric-value text-danger" id="statRejectedCount">0</div>
        <div class="admin-metric-footer text-danger-dim">Daily counter reset at 00:00 UTC</div>
      </div>
      <div class="admin-metric-card border-primary">
        <div class="admin-metric-label">Today's Withdrawal Amount</div>
        <div class="admin-metric-value text-primary" id="statTodayApprovedAmount">PKR 0</div>
        <div class="admin-metric-footer">Total value dispatched today</div>
      </div>
    </div>

    <!-- Table Filtering Tools and Search Panel -->
    <div class="admin-table-card">
      <div class="admin-filter-bar d-flex flex-wrap align-items-center justify-content-between gap-3">
        
        <!-- Tab status filtering -->
        <div class="d-flex flex-wrap gap-1" role="tablist" id="statusFilterTabs">
          <button class="btn btn-sm btn-glass active px-3 py-2 text-xs" data-status="all" role="tab">All</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs position-relative" data-status="pending" role="tab">
            Pending <span class="badge bg-warning text-dark rounded-pill ms-1 d-none" id="pendingTabBadge">0</span>
          </button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="under_review" role="tab">Under Review</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="approved" role="tab">Approved</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="rejected" role="tab">Rejected</button>
        </div>

        <div class="d-flex flex-wrap align-items-center gap-2">
          <!-- Gateway Method Filter -->
          <select id="methodFilterSelect" class="form-select form-select-sm input-glass text-xs" style="max-width: 140px;" aria-label="Filter by payout channel">
            <option value="all">All Methods</option>
            <option value="EasyPaisa">EasyPaisa</option>
            <option value="JazzCash">JazzCash</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>

          <!-- Date Duration Filter -->
          <select id="dateFilterSelect" class="form-select form-select-sm input-glass text-xs" style="max-width: 140px;" aria-label="Filter by date submitted">
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">Last 7 Days</option>
            <option value="month">This Month</option>
          </select>

          <!-- Custom Text Search -->
          <div class="position-relative" style="min-width: 260px;">
            <span class="position-absolute top-50 start-0 translate-middle-y ps-3 text-muted" style="pointer-events: none;"><i class="bi bi-search text-xs"></i></span>
            <input type="text" id="searchInput" class="form-control form-control-sm input-glass text-xs ps-5 py-2" placeholder="Search by ID, User, Email, or Account..." aria-label="Search withdrawals">
          </div>
        </div>

      </div>

      <!-- Main Ledger Table Mount -->
      <div class="table-responsive table-responsive-sticky">
        <table class="table table-glass align-middle mb-0 text-nowrap text-xs" id="withdrawalsTable">
          <thead>
            <tr>
              <th scope="col">Withdrawal ID</th>
              <th scope="col">User</th>
              <th scope="col">Method</th>
              <th scope="col" class="text-end">Requested Amount</th>
              <th scope="col" class="text-end">Fee (2%)</th>
              <th scope="col" class="text-end">Net Amount</th>
              <th scope="col">Account Holder</th>
              <th scope="col">Account Number</th>
              <th scope="col">Status</th>
              <th scope="col">Submitted Date</th>
              <th scope="col" class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody id="withdrawalsTableBody">
            <!-- Loading skeletons initially -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Bind breadcrumb header using reusable PageHeader
  new PageHeader("#admin-withdrawals-header", {
    title: "Withdrawal Requests",
    subtitle: "Audit domestic PKR payout transactions, authorize hold deductions, and manage compliance locks.",
    breadcrumbs: [
      { label: "Admin Console", href: "/admin/dashboard.html" },
      { label: "Withdrawals Dispatch", active: true }
    ]
  });

  // Display admin email once logged in
  const authUser = auth.currentUser;
  if (authUser) {
    const emailEl = document.getElementById("headerUserEmail");
    if (emailEl) emailEl.textContent = authUser.email;
  }

  // Inject beautiful skeletons initially
  Loader.tableLoader("#withdrawalsTableBody", 11, 5);

  // Attach search and filter event listeners
  bindFilterEvents();
}

/**
 * Event binding logic for filtering, search, and status toggles
 */
function bindFilterEvents() {
  const searchInput = document.getElementById("searchInput");
  const methodFilterSelect = document.getElementById("methodFilterSelect");
  const dateFilterSelect = document.getElementById("dateFilterSelect");
  const statusTabs = document.querySelectorAll("#statusFilterTabs button");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchFilter = e.target.value.toLowerCase().trim();
      renderTableContent();
    });
  }

  if (methodFilterSelect) {
    methodFilterSelect.addEventListener("change", (e) => {
      methodFilter = e.target.value;
      renderTableContent();
    });
  }

  if (dateFilterSelect) {
    dateFilterSelect.addEventListener("change", (e) => {
      dateFilter = e.target.value;
      renderTableContent();
    });
  }

  statusTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      statusTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      statusFilter = tab.getAttribute("data-status");
      renderTableContent();
    });
  });
}

/**
 * Subscribe to realtime onSnapshot updates from Firestore collection
 */
function subscribeToWithdrawals() {
  if (unsubscribeWithdrawals) {
    unsubscribeWithdrawals();
  }

  const q = query(collection(db, "withdrawals"), orderBy("createdAt", "desc"));
  
  unsubscribeWithdrawals = onSnapshot(q, (snapshot) => {
    withdrawalsRawList = [];
    snapshot.forEach(docSnap => {
      withdrawalsRawList.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    console.log(`Sync complete: Loaded ${withdrawalsRawList.length} withdrawal records.`);
    
    // Recalculate metric cards and refresh display
    calculateStats();
    renderTableContent();
  }, (err) => {
    console.error("Firestore real-time subscription error:", err);
    Toast.show("Failed to stream withdrawal documents from network.", { type: "danger" });
  });
}

/**
 * Calculate summary metric states dynamically
 */
function calculateStats() {
  let pendingCount = 0;
  let pendingVolume = 0;
  let approvedCount = 0;
  let approvedVolume = 0;
  let rejectedCount = 0;
  let approvedTodayVolume = 0;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  withdrawalsRawList.forEach(wit => {
    const amt = parseFloat(wit.amount) || 0;
    const statusLower = wit.status ? wit.status.toLowerCase() : "pending";

    let processedMs = 0;
    if (wit.processedAt) {
      processedMs = wit.processedAt.seconds 
        ? wit.processedAt.seconds * 1000 
        : new Date(wit.processedAt).getTime();
    } else if (wit.updatedAt && statusLower !== 'pending') {
      processedMs = wit.updatedAt.seconds 
        ? wit.updatedAt.seconds * 1000 
        : new Date(wit.updatedAt).getTime();
    }

    if (statusLower === "pending") {
      pendingCount++;
      pendingVolume += amt;
    } else if (statusLower === "approved" || statusLower === "completed") {
      approvedCount++;
      approvedVolume += amt;
      if (processedMs >= startOfToday) {
        approvedTodayVolume += amt;
      }
    } else if (statusLower === "rejected") {
      rejectedCount++;
    }
  });

  // Update DOM metric values
  const elements = {
    statPendingCount: pendingCount,
    statPendingAmount: `Volume: PKR ${pendingVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    statApprovedCount: approvedCount,
    statApprovedAmount: `Sum: PKR ${approvedVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    statRejectedCount: rejectedCount,
    statTodayApprovedAmount: `PKR ${approvedTodayVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  };

  for (const [id, value] of Object.entries(elements)) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // Sync tab warning indicator
  const pendingBadge = document.getElementById("pendingTabBadge");
  if (pendingBadge) {
    if (pendingCount > 0) {
      pendingBadge.textContent = pendingCount;
      pendingBadge.classList.remove("d-none");
    } else {
      pendingBadge.classList.add("d-none");
    }
  }
}

/**
 * Filter ledger entries based on criteria, then fetch required users and render table rows
 */
async function renderTableContent() {
  const tbody = document.getElementById("withdrawalsTableBody");
  if (!tbody) return;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
  const startOfSevenDaysAgo = startOfToday - (7 * 24 * 60 * 60 * 1000);
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  // Apply sequential filters
  const filteredList = [];
  
  for (const wit of withdrawalsRawList) {
    const statusLower = wit.status ? wit.status.toLowerCase() : "pending";

    // 1. Status Tabs Filter
    if (statusFilter !== "all") {
      if (statusFilter === "pending" && statusLower !== "pending") continue;
      if (statusFilter === "under_review" && statusLower !== "under_review") continue;
      if (statusFilter === "approved" && statusLower !== "approved" && statusLower !== "completed") continue;
      if (statusFilter === "rejected" && statusLower !== "rejected") continue;
    }

    // 2. Gateway Method Filter
    if (methodFilter !== "all") {
      const m = wit.method ? wit.method.toLowerCase() : "";
      const queryM = methodFilter.toLowerCase();
      if (queryM === "bank_transfer") {
        if (!m.includes("bank") && m !== "bank_transfer") continue;
      } else {
        if (!m.includes(queryM)) continue;
      }
    }

    // 3. Date Submitted Range Filter
    if (dateFilter !== "all") {
      let submitMs = 0;
      if (wit.createdAt) {
        submitMs = wit.createdAt.seconds 
          ? wit.createdAt.seconds * 1000 
          : new Date(wit.createdAt).getTime();
      }

      if (dateFilter === "today" && submitMs < startOfToday) continue;
      if (dateFilter === "yesterday" && (submitMs < startOfYesterday || submitMs >= startOfToday)) continue;
      if (dateFilter === "week" && submitMs < startOfSevenDaysAgo) continue;
      if (dateFilter === "month" && submitMs < startOfThisMonth) continue;
    }

    // Resolve profiles to apply search strings on fullName, email, account details
    const u = await getUserProfile(wit.userUid || wit.userId);
    const searchString = [
      (wit.withdrawalId || wit.id || "").toLowerCase(),
      (wit.accountNumber || "").toLowerCase(),
      (wit.accountHolder || "").toLowerCase(),
      u.fullName.toLowerCase(),
      u.email.toLowerCase(),
      u.username.toLowerCase()
    ].join(" ");

    // 4. Text query filter
    if (searchFilter && !searchString.includes(searchFilter)) {
      continue;
    }

    // Add resolved user information to the object for ease of rendering
    filteredList.push({
      ...wit,
      userData: u
    });
  }

  // Render finalized rows
  if (filteredList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-5">
          <i class="bi bi-wallet-fill text-muted fs-2 mb-2 d-block"></i>
          <span class="text-display text-white fw-bold d-block">No withdrawal requests found</span>
          <span class="text-secondary text-sm d-block mt-1">Adjust your filters, search strings, or check the database.</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredList.map(wit => {
    const amt = parseFloat(wit.amount) || 0;
    const fee = parseFloat(wit.processingFee) || (amt * 0.02);
    const net = parseFloat(wit.netAmount) || (amt - fee);

    const formattedAmt = amt.toLocaleString(undefined, { minimumFractionDigits: 2 });
    const formattedFee = fee.toLocaleString(undefined, { minimumFractionDigits: 2 });
    const formattedNet = net.toLocaleString(undefined, { minimumFractionDigits: 2 });
    
    // Submission formatted date
    let formattedDate = "N/A";
    if (wit.createdAt) {
      const dateObj = wit.createdAt.seconds 
        ? new Date(wit.createdAt.seconds * 1000) 
        : new Date(wit.createdAt);
      formattedDate = dateObj.toLocaleString();
    }

    // Method Logo normalization
    let methodIcon = "bi-cash-coin text-primary";
    let normM = wit.method ? wit.method.toLowerCase() : "";
    if (normM.includes("easypaisa")) methodIcon = "bi-wallet2 text-success";
    else if (normM.includes("jazzcash")) methodIcon = "bi-phone-vibrate text-accent";
    else if (normM.includes("bank")) methodIcon = "bi-bank text-info";

    // Status classes
    const statusLower = wit.status ? wit.status.toLowerCase() : "pending";
    let statusClass = "status-badge-pending";
    if (statusLower === "approved" || statusLower === "completed") statusClass = "status-badge-approved";
    else if (statusLower === "rejected" || statusLower === "failed") statusClass = "status-badge-rejected";
    else if (statusLower === "under_review") statusClass = "status-badge-under_review";
    else if (statusLower === "cancelled") statusClass = "status-badge-cancelled";

    // Action button elements state
    const isPending = statusLower === "pending" || statusLower === "under_review";
    const underReviewAction = statusLower === "pending" 
      ? `<button class="btn btn-xs btn-glass text-2xs px-2 py-1 btn-review-trigger" data-id="${wit.id}" aria-label="Mark under review"><i class="bi bi-eye"></i> Review</button>`
      : "";

    const actionButtonsHtml = isPending 
      ? `
        <div class="d-flex align-items-center justify-content-end gap-1">
          ${underReviewAction}
          <button class="btn btn-xs btn-glass-primary text-2xs px-2 py-1 btn-approve-trigger" data-id="${wit.id}" aria-label="Approve withdrawal"><i class="bi bi-check-lg"></i> Approve</button>
          <button class="btn btn-xs btn-danger text-2xs px-2 py-1 btn-reject-trigger bg-opacity-20 border border-danger text-danger hover-lift" data-id="${wit.id}" aria-label="Reject withdrawal"><i class="bi bi-slash-circle"></i> Reject</button>
          <button class="btn btn-xs btn-glass text-2xs px-1 py-1 btn-detail-trigger" data-id="${wit.id}" aria-label="View transaction details"><i class="bi bi-three-dots-vertical"></i></button>
        </div>
      `
      : `
        <div class="d-flex align-items-center justify-content-end">
          <button class="btn btn-xs btn-glass text-2xs px-2 py-1 btn-detail-trigger" data-id="${wit.id}"><i class="bi bi-journal-text"></i> Audit Trail</button>
        </div>
      `;

    return `
      <tr>
        <td class="text-mono fw-bold text-white text-uppercase" style="letter-spacing: 0.05em;">${wit.id.replace("WD-", "")}</td>
        <td>
          <span class="text-white fw-semibold d-block">${wit.userData.fullName}</span>
          <span class="text-muted text-2xs d-block">@${wit.userData.username}</span>
        </td>
        <td>
          <div class="d-flex align-items-center gap-1">
            <i class="bi ${methodIcon} text-xs"></i>
            <span class="fw-medium text-capitalize">${wit.method || "Unspecified"}</span>
          </div>
        </td>
        <td class="text-mono fw-bold text-white text-end pe-3">₨ ${formattedAmt}</td>
        <td class="text-mono text-muted text-end pe-3">₨ ${formattedFee}</td>
        <td class="text-mono fw-bold text-primary text-end pe-3">₨ ${formattedNet}</td>
        <td class="fw-medium text-white">${wit.accountHolder || "N/A"}</td>
        <td class="text-mono text-secondary">${wit.accountNumber || "N/A"}</td>
        <td>
          <span class="${statusClass}">${wit.status ? wit.status.replace("_", " ") : "Pending"}</span>
        </td>
        <td class="text-mono text-secondary">${formattedDate}</td>
        <td>${actionButtonsHtml}</td>
      </tr>
    `;
  }).join("");

  // Attach dynamically spawned row-level action listeners
  attachRowActionListeners();
}

/**
 * Handle attaching events dynamically to freshly rendered table DOM elements
 */
function attachRowActionListeners() {
  // Review status changer
  document.querySelectorAll(".btn-review-trigger").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const witId = btn.getAttribute("data-id");
      await updateWithdrawalStatus(witId, "Under Review");
    };
  });

  // Detail Modal popup
  document.querySelectorAll(".btn-detail-trigger").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const witId = btn.getAttribute("data-id");
      showWithdrawalDetailModal(witId);
    };
  });

  // Approval handler
  document.querySelectorAll(".btn-approve-trigger").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const witId = btn.getAttribute("data-id");
      promptWithdrawalApproval(witId);
    };
  });

  // Rejection handler
  document.querySelectorAll(".btn-reject-trigger").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const witId = btn.getAttribute("data-id");
      promptWithdrawalRejection(witId);
    };
  });
}

/**
 * Directly update status in Firestore for simple lifecycle transitions (e.g. pending to under review)
 * @param {string} withdrawalId - Target document ID
 * @param {string} newStatus - target status state
 */
async function updateWithdrawalStatus(withdrawalId, newStatus) {
  try {
    const loader = new Loader({ text: `Updating audit state to ${newStatus}...` });
    loader.show();
    await updateDoc(doc(db, "withdrawals", withdrawalId), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
    loader.hide();
    Toast.show(`Withdrawal state updated to ${newStatus.toUpperCase()}`, { type: "info" });
  } catch (err) {
    console.error("Failed to update status:", err);
    Toast.show("Audit write failed.", { type: "danger" });
  }
}

/**
 * Render the full audit detail modal layout, combining user profiling logs, wallet stats and payout timelines
 * @param {string} withdrawalId - Document ID
 */
async function showWithdrawalDetailModal(withdrawalId) {
  const wit = withdrawalsRawList.find(d => d.id === withdrawalId);
  if (!wit) return;

  const loader = new Loader({ text: "Resolving secure portfolio & balances..." });
  loader.show();

  const userId = wit.userUid || wit.userId;
  const u = await getUserProfile(userId);
  const w = await getUserWallet(userId);
  loader.hide();

  const statusLower = wit.status ? wit.status.toLowerCase() : "pending";
  const isPending = statusLower === "pending" || statusLower === "under_review";
  const processedDate = wit.processedAt 
    ? (wit.processedAt.seconds ? new Date(wit.processedAt.seconds * 1000) : new Date(wit.processedAt)).toLocaleString()
    : "Not processed yet";

  const submittedDate = wit.createdAt 
    ? (wit.createdAt.seconds ? new Date(wit.createdAt.seconds * 1000) : new Date(wit.createdAt)).toLocaleString()
    : "Unknown date";

  // Timeline configuration
  const isApproved = statusLower === "approved" || statusLower === "completed";
  const isRejected = statusLower === "rejected";
  const isUnderReview = statusLower === "under_review";

  const totalUserBalance = w.availableBalance + w.holdBalance;

  const tBody = `
    <div class="row g-4 text-xs">
      <!-- Left side: User profile context card -->
      <div class="col-md-6 border-end border-secondary border-opacity-10 pe-4">
        <h6 class="text-display fw-bold text-white mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-person-circle text-primary"></i> Target Account Profile
        </h6>
        
        <div class="mb-2">
          <div class="modal-detail-label">Legal Name</div>
          <div class="modal-detail-value text-white fw-bold">${u.fullName}</div>
        </div>

        <div class="mb-2">
          <div class="modal-detail-label">Unique Username</div>
          <div class="modal-detail-value-mono">@${u.username}</div>
        </div>

        <div class="mb-2">
          <div class="modal-detail-label">Email Node</div>
          <div class="modal-detail-value"><a href="mailto:${u.email}" class="text-primary hover-link">${u.email}</a></div>
        </div>

        <div class="mb-2">
          <div class="modal-detail-label">Contact Mobile</div>
          <div class="modal-detail-value">${u.phone}</div>
        </div>

        <div class="mb-3">
          <div class="modal-detail-label">Account Role & Status</div>
          <div class="d-flex gap-1 align-items-center mt-1">
            <span class="badge bg-secondary text-capitalize text-mono text-2xs">${u.role}</span>
            <span class="badge bg-success-dim text-capitalize text-mono text-2xs">${u.status}</span>
          </div>
        </div>

        <!-- Wallet Summary Block -->
        <h6 class="text-display fw-bold text-white mt-4 mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-wallet2 text-success"></i> Wallet Balance Summary
        </h6>

        <div class="row g-2 mb-2">
          <div class="col-sm-4 text-center">
            <div class="p-2 card-glass border border-secondary border-opacity-10">
              <span class="modal-detail-label d-block text-3xs">Available</span>
              <span class="text-mono fw-bold text-white text-xs">₨ ${w.availableBalance.toLocaleString()}</span>
            </div>
          </div>
          <div class="col-sm-4 text-center">
            <div class="p-2 card-glass border border-secondary border-opacity-10">
              <span class="modal-detail-label d-block text-3xs">Held Locked</span>
              <span class="text-mono fw-bold text-warning text-xs">₨ ${w.holdBalance.toLocaleString()}</span>
            </div>
          </div>
          <div class="col-sm-4 text-center">
            <div class="p-2 card-glass border border-secondary border-opacity-10">
              <span class="modal-detail-label d-block text-3xs">Total Ledger</span>
              <span class="text-mono fw-bold text-primary text-xs">₨ ${totalUserBalance.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right side: Withdrawal details -->
      <div class="col-md-6 ps-4">
        <h6 class="text-display fw-bold text-white mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-box-arrow-up-right text-accent"></i> Payout Specifications
        </h6>

        <div class="row g-2 mb-2">
          <div class="col-sm-4">
            <div class="modal-detail-label">Requested Amount</div>
            <div class="modal-detail-value-mono text-white fw-bold">₨ ${(parseFloat(wit.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="col-sm-4">
            <div class="modal-detail-label">Compliance Fee (2%)</div>
            <div class="modal-detail-value-mono text-muted">₨ ${(parseFloat(wit.processingFee) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="col-sm-4">
            <div class="modal-detail-label">Net Payable Dispatch</div>
            <div class="modal-detail-value-mono text-primary fw-bold">₨ ${(parseFloat(wit.netAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <div class="row g-2 mb-2 mt-2">
          <div class="col-sm-6">
            <div class="modal-detail-label">Payout Channel</div>
            <div class="modal-detail-value text-capitalize fw-bold">${wit.method || "Unspecified"}</div>
          </div>
          <div class="col-sm-6">
            <div class="modal-detail-label">Recipient Account Holder</div>
            <div class="modal-detail-value text-white fw-semibold">${wit.accountHolder || "N/A"}</div>
          </div>
        </div>

        <div class="mb-2">
          <div class="modal-detail-label">Payout Account/Iban/Mobile Number</div>
          <div class="modal-detail-value-mono text-glow-primary text-uppercase">${wit.accountNumber || "N/A"}</div>
        </div>

        <div class="mb-2">
          <div class="modal-detail-label">User Submission Notes</div>
          <div class="p-2 card-glass text-secondary font-sans text-2xs" style="max-height: 80px; overflow-y: auto; white-space: pre-wrap;">${wit.notes || "No extra remarks submitted by user."}</div>
        </div>

        <div class="mb-2">
          <div class="modal-detail-label">Compliance Operator Admin ID</div>
          <div class="modal-detail-value-mono text-2xs">${wit.adminUid || "None"}</div>
        </div>

        <div class="mb-2">
          <div class="modal-detail-label">Administrative audit notes</div>
          <div class="p-2 card-glass text-info font-sans text-2xs" style="white-space: pre-wrap;">${wit.adminNotes || wit.rejectionReason || "No custom auditing notes logged."}</div>
        </div>
      </div>

      <!-- Footer spacing row: Auditing Timeline -->
      <div class="col-12 border-top border-secondary border-opacity-10 pt-3">
        <h6 class="text-display fw-bold text-white mb-3">Auditing Verification Timeline</h6>
        <div class="timeline-flow d-flex flex-column gap-3">
          <div class="timeline-item">
            <div class="timeline-dot success"></div>
            <div class="fw-bold text-white text-2xs">SUBMITTED</div>
            <div class="text-secondary text-2xs">User filed withdrawal payout. Ledger lock initiated. Amount locked in Hold: ${submittedDate}</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot ${isUnderReview || isApproved || isRejected ? 'success' : ''}"></div>
            <div class="fw-bold text-white text-2xs">UNDER COMPLIANCE VERIFICATION</div>
            <div class="text-secondary text-2xs">Payout pending manual IBFT batch clearing or domestic verification matches.</div>
          </div>
          <div class="timeline-item mb-0">
            <div class="timeline-dot ${isApproved ? 'success' : (isRejected ? 'danger' : '')}"></div>
            <div class="fw-bold text-white text-2xs">TERMINAL RESOLUTION</div>
            <div class="text-secondary text-2xs">
              ${isApproved 
                ? `APPROVED AND DISPATCHED: Funds released from lock. Net balance credited to recipient channel: ${processedDate}` 
                : (isRejected 
                  ? `REJECTED: Audit failed. Locked hold balances fully refunded back to user's available wallet balance. Reason: "${wit.rejectionReason || wit.adminNotes || 'Declined payment profile.'}": ${processedDate}` 
                  : 'Pending final resolution')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Dynamically compile buttons depending on pending status
  const modalButtons = [];
  if (isPending) {
    if (statusLower === "pending") {
      modalButtons.push({
        label: "Move to Review Queue",
        class: "btn-hfc-secondary text-xs",
        onClick: async (m) => {
          await updateWithdrawalStatus(withdrawalId, "Under Review");
          m.destroy();
          showWithdrawalDetailModal(withdrawalId); // Re-open with fresh data
        }
      });
    }
    modalButtons.push({
      label: "Approve and Dispatch",
      class: "btn-glass-primary text-xs",
      onClick: (m) => {
        m.destroy();
        promptWithdrawalApproval(withdrawalId);
      }
    });
    modalButtons.push({
      label: "Reject Request",
      class: "btn-hfc-danger bg-opacity-20 text-danger border border-danger text-xs",
      onClick: (m) => {
        m.destroy();
        promptWithdrawalRejection(withdrawalId);
      }
    });
  }
  
  modalButtons.push({
    label: "Dismiss Audit",
    class: "btn-hfc-secondary text-xs",
    onClick: (m) => m.destroy()
  });

  const m = new Modal({
    title: `Ledger Audit Trail: #${wit.id.replace("WD-", "")}`,
    body: tBody,
    size: "lg",
    buttons: modalButtons
  });
  
  m.open();
}

/**
 * Double-confirmation modal interface to collect notes and proceed with atomic wallet debit transaction
 * @param {string} withdrawalId - Withdrawal document ID
 */
function promptWithdrawalApproval(withdrawalId) {
  const wit = withdrawalsRawList.find(d => d.id === withdrawalId);
  if (!wit) return;

  const amt = parseFloat(wit.amount) || 0;
  const fee = parseFloat(wit.processingFee) || (amt * 0.02);
  const net = parseFloat(wit.netAmount) || (amt - fee);

  const bContent = `
    <div class="text-sm">
      <div class="alert alert-warning card-glass border border-warning border-opacity-30 p-3 mb-3 text-warning">
        <i class="bi bi-exclamation-triangle-fill fs-5 me-2 align-middle"></i>
        <strong>Ledger Dispatch Authorization:</strong> Approving this transaction means you have verified that <strong>₨ ${net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> has been successfully dispatched (IBFT/Easypaisa/Jazzcash) to the recipient. This will permanently release and deduct the locked <strong>₨ ${amt.toLocaleString()}</strong> from the user's hold balance. This is **irreversible**.
      </div>

      <div class="mb-3">
        <label for="approveAdminNotes" class="form-label text-white fw-semibold mb-1">Administrative Settling Notes (Optional)</label>
        <textarea id="approveAdminNotes" class="form-control form-control-glass text-white text-xs" rows="3" placeholder="Specify IBFT transaction hash, reference trace ID, bank confirmation batch code, etc..." maxlength="400"></textarea>
      </div>
    </div>
  `;

  Modal.confirm({
    title: "Authorize Payout Dispatch",
    body: bContent,
    confirmText: "Execute Dispatch Release",
    confirmClass: "btn-glass-primary px-3 py-2 fw-bold text-dark",
    onConfirm: async (modalInstance) => {
      const notesArea = document.getElementById("approveAdminNotes");
      const adminNotesValue = notesArea ? notesArea.value.trim() : "";
      
      await executeWithdrawalApproval(withdrawalId, adminNotesValue);
    }
  });
}

/**
 * Atomic Firestore Transaction to update withdrawal status, modify wallet held balance, record fees, 
 * insert notifications, and logging blocks.
 * @param {string} withdrawalId 
 * @param {string} adminNotes 
 */
async function executeWithdrawalApproval(withdrawalId, adminNotes) {
  const wit = withdrawalsRawList.find(d => d.id === withdrawalId);
  if (!wit) {
    Toast.show("Error: Withdrawal details lost.", { type: "danger" });
    return;
  }

  const loader = new Loader({ text: "Opening atomic lock. Adjusting dispatch hold balances..." });
  loader.show();

  const adminUid = auth.currentUser?.uid || "unknown_admin";
  const userId = wit.userUid || wit.userId;
  const amount = parseFloat(wit.amount) || 0;
  const processingFee = parseFloat(wit.processingFee) || (amount * 0.02);
  const netAmount = parseFloat(wit.netAmount) || (amount - processingFee);

  try {
    // Run all balance updates and records inside a single isolated transaction context
    await runTransaction(db, async (transaction) => {
      // 1. Fetch withdrawal state inside transaction to ensure concurrency safety
      const witRef = doc(db, "withdrawals", withdrawalId);
      const witSnap = await transaction.get(witRef);
      if (!witSnap.exists()) {
        throw new Error("Target withdrawal document does not exist.");
      }
      
      const witData = witSnap.data();
      const statusLower = witData.status ? witData.status.toLowerCase() : "pending";
      if (statusLower === "approved" || statusLower === "completed" || statusLower === "rejected") {
        throw new Error("This withdrawal request has already been finalized by another operator.");
      }

      // 2. Fetch User Wallet profile to release hold balances
      const walletId = `${userId}_PKR`;
      const walletRef = doc(db, "wallets", walletId);
      const walletSnap = await transaction.get(walletRef);

      if (!walletSnap.exists()) {
        throw new Error("Target user wallet does not exist.");
      }

      const wData = walletSnap.data();
      const currentHold = parseFloat(wData.holdBalance) || 0;

      if (currentHold < amount) {
        throw new Error("Critical validation failure: Held balance is lower than the requested withdrawal amount.");
      }

      const newHold = Math.max(0, currentHold - amount);

      // 3. Update PKR Wallet document
      transaction.update(walletRef, {
        holdBalance: newHold,
        updatedAt: serverTimestamp()
      });

      // 4. Finalize withdrawal ticket
      transaction.update(witRef, {
        status: "Approved",
        adminUid: adminUid,
        adminNotes: adminNotes || "Withdrawal verified and dispatched.",
        processedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 5. Update matching ledger transaction in transactions/ collection
      const txRef = doc(db, "transactions", `tx_${withdrawalId}`);
      transaction.set(txRef, {
        status: "completed",
        updatedAt: serverTimestamp(),
        adminUid: adminUid
      }, { merge: true });

      // 6. Create walletTransactions dispatch log
      const wtId = `wt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const wtRef = doc(db, "walletTransactions", wtId);
      transaction.set(wtRef, {
        walletTransactionId: wtId,
        userId: userId,
        walletId: walletId,
        type: "withdrawal_payout",
        amount: amount,
        fee: processingFee,
        netAmount: netAmount,
        currency: "PKR",
        status: "completed",
        description: `Withdrawal payout dispatched to ${witData.method}. Net Amount: PKR ${netAmount.toLocaleString()}`,
        createdAt: serverTimestamp()
      });

      // 7. Credit Platform Exchange Revenue Wallet
      const revWalletRef = doc(db, "wallets", "exchange_revenue_PKR");
      transaction.set(revWalletRef, {
        walletId: "exchange_revenue_PKR",
        ownerId: "exchange_revenue",
        currency: "PKR",
        balance: increment(processingFee),
        availableBalance: increment(processingFee),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 8. Create immutable Exchange Revenue record row
      const revId = `rev_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const revRef = doc(db, "exchange_revenue", revId);
      transaction.set(revRef, {
        revenueId: revId,
        amount: processingFee,
        type: "withdrawal_fee",
        withdrawalId: withdrawalId,
        userId: userId,
        createdAt: serverTimestamp()
      });

      // 9. Push real-time alert notice to client UI feed
      const notId = `not_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const notRef = doc(db, "notifications", notId);
      transaction.set(notRef, {
        notificationId: notId,
        userUid: userId,
        userId: userId,
        title: "Withdrawal Approved Successfully",
        message: `Your withdrawal of PKR ${amount.toLocaleString()} (Net: PKR ${netAmount.toLocaleString()}) has been processed and dispatched.`,
        type: "success",
        readStatus: false,
        read: false,
        createdAt: serverTimestamp()
      });

      // 10. Write security compliance logs
      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const logRef = doc(db, "logs", logId);
      transaction.set(logRef, {
        logId,
        category: "admin_action",
        severity: "high",
        actorId: adminUid,
        action: "withdrawal_approved",
        ipAddress: "Admin Portal Client",
        details: {
          withdrawalId,
          targetUserUid: userId,
          amountTransmitted: amount,
          processingFee,
          netAmount,
          assetType: "PKR"
        },
        timestamp: serverTimestamp()
      });
    });

    // Handle transaction success
    loader.hide();
    Toast.show(`Settlement Success: Withdrawal completed and PKR ${amount.toLocaleString()} released.`, { type: "success" });
  } catch (err) {
    loader.hide();
    console.error("Ledger transaction failed:", err);
    Toast.show(`Operation Aborted: ${err.message}`, { type: "danger" });
  }
}

/**
 * Rejection setup modal. Reason is MANDATORY to maintain auditing trail
 * @param {string} withdrawalId - Withdrawal document ID
 */
function promptWithdrawalRejection(withdrawalId) {
  const wit = withdrawalsRawList.find(d => d.id === withdrawalId);
  if (!wit) return;

  const amt = parseFloat(wit.amount) || 0;

  const bContent = `
    <div class="text-sm">
      <div class="alert alert-danger card-glass border border-danger border-opacity-30 p-3 mb-3 text-danger">
        <i class="bi bi-slash-circle-fill fs-5 me-2 align-middle"></i>
        <strong>Confirm Request Rejection:</strong> You are about to decline this payout request. This will completely return the locked <strong>₨ ${amt.toLocaleString()}</strong> back to the user's available wallet balance. A valid failure reason is required.
      </div>

      <div class="mb-3">
        <label for="rejectReason" class="form-label text-white fw-semibold mb-1">Rejection Reason (Mandatory) <span class="text-danger">*</span></label>
        <textarea id="rejectReason" class="form-control form-control-glass text-white text-xs" rows="3" placeholder="Specify valid audit fault: 'Incorrect account number', 'Name mismatch on Easypaisa channel', 'Suspected duplicate payout claim', etc..." maxlength="400" required></textarea>
        <div class="invalid-feedback text-2xs mt-1 d-none text-danger" id="rejectReasonFeedback">Please input a rejection reason (minimum 5 characters).</div>
      </div>
    </div>
  `;

  Modal.confirm({
    title: "Decline Withdrawal Request",
    body: bContent,
    confirmText: "Decline and Refund",
    confirmClass: "btn-danger px-3 py-2 fw-bold text-white",
    onConfirm: async (modalInstance) => {
      const reasonArea = document.getElementById("rejectReason");
      const feedback = document.getElementById("rejectReasonFeedback");
      const reasonValue = reasonArea ? reasonArea.value.trim() : "";

      if (!reasonValue || reasonValue.length < 5) {
        if (feedback) feedback.classList.remove("d-none");
        if (reasonArea) reasonArea.classList.add("is-invalid");
        
        throw new Error("Validation failed: Reason required.");
      }

      await executeWithdrawalRejection(withdrawalId, reasonValue);
    }
  });
}

/**
 * Execute withdrawal rejection inside Firestore transaction, returning locked hold funds back to available
 * @param {string} withdrawalId 
 * @param {string} reason 
 */
async function executeWithdrawalRejection(withdrawalId, reason) {
  const wit = withdrawalsRawList.find(d => d.id === withdrawalId);
  if (!wit) {
    Toast.show("Error: Withdrawal state lost.", { type: "danger" });
    return;
  }

  const loader = new Loader({ text: "Logging decline and reverting wallet locks..." });
  loader.show();

  const adminUid = auth.currentUser?.uid || "unknown_admin";
  const userId = wit.userUid || wit.userId;
  const amount = parseFloat(wit.amount) || 0;

  try {
    await runTransaction(db, async (transaction) => {
      const witRef = doc(db, "withdrawals", withdrawalId);
      const witSnap = await transaction.get(witRef);
      if (!witSnap.exists()) {
        throw new Error("Target withdrawal document does not exist.");
      }

      const witData = witSnap.data();
      const statusLower = witData.status ? witData.status.toLowerCase() : "pending";
      if (statusLower === "approved" || statusLower === "completed" || statusLower === "rejected") {
        throw new Error("This withdrawal request has already been finalized by another operator.");
      }

      // 1. Fetch User Wallet to release lock back to available balance
      const walletId = `${userId}_PKR`;
      const walletRef = doc(db, "wallets", walletId);
      const walletSnap = await transaction.get(walletRef);

      if (!walletSnap.exists()) {
        throw new Error("Target user wallet does not exist.");
      }

      const wData = walletSnap.data();
      const currentAvailable = wData.availableBalance !== undefined ? wData.availableBalance : (wData.balance || 0);
      const currentHold = wData.holdBalance || 0;

      if (currentHold < amount) {
        throw new Error("Critical balance anomaly: Held balance is lower than the refund target.");
      }

      const newAvailable = currentAvailable + amount;
      const newHold = Math.max(0, currentHold - amount);

      // 2. Revert wallet balances
      transaction.update(walletRef, {
        availableBalance: newAvailable,
        balance: newAvailable, // Keep balance in sync for legacy compatibility
        holdBalance: newHold,
        updatedAt: serverTimestamp()
      });

      // 3. Update withdrawal status to Rejected
      transaction.update(witRef, {
        status: "Rejected",
        adminUid: adminUid,
        rejectionReason: reason,
        adminNotes: `Rejection filed. Reason: ${reason}`,
        processedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 4. Update matching ledger transaction to failed
      const txRef = doc(db, "transactions", `tx_${withdrawalId}`);
      transaction.set(txRef, {
        status: "failed",
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 5. Create walletTransactions hold release log
      const wtId = `wt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const wtRef = doc(db, "walletTransactions", wtId);
      transaction.set(wtRef, {
        walletTransactionId: wtId,
        userId: userId,
        walletId: walletId,
        type: "withdrawal_rejected_release",
        amount: amount,
        currency: "PKR",
        status: "completed",
        description: `Hold release of PKR ${amount.toLocaleString()} due to withdrawal rejection. Reason: ${reason}`,
        createdAt: serverTimestamp()
      });

      // 6. Send warning alert to user
      const notId = `not_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const notRef = doc(db, "notifications", notId);
      transaction.set(notRef, {
        notificationId: notId,
        userUid: userId,
        userId: userId,
        title: "Withdrawal Rejected",
        message: `Your withdrawal request of PKR ${amount.toLocaleString()} has been declined. Funds returned to Available balance. Reason: ${reason}`,
        type: "danger",
        readStatus: false,
        read: false,
        createdAt: serverTimestamp()
      });

      // 7. Log compliance audit
      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const logRef = doc(db, "logs", logId);
      transaction.set(logRef, {
        logId,
        category: "admin_action",
        severity: "medium",
        actorId: adminUid,
        action: "withdrawal_rejected",
        ipAddress: "Admin Portal Client",
        details: {
          withdrawalId,
          targetUserUid: userId,
          declinedAmount: amount,
          reasonProvided: reason
        },
        timestamp: serverTimestamp()
      });
    });

    loader.hide();
    Toast.show("Audit failure logged. Withdrawal request rejected and funds refunded.", { type: "warning" });
  } catch (err) {
    loader.hide();
    console.error("Ledger transaction failed:", err);
    Toast.show(`Operation Aborted: ${err.message}`, { type: "danger" });
  }
}
