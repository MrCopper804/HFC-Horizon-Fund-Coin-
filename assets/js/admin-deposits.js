/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Admin Deposit Approval Controller
 * Real-time monitoring, state audits, multi-gateway filtering,
 * secure approval transactions, and accessible zooming modal utilities.
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
  runTransaction, 
  serverTimestamp
} from "firebase/firestore";
import { logoutUser } from "../../firebase/auth.js";
import { runSafeTransaction } from "../../firebase/firestore.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";

// Global Applet State Context
let activePageLayout = null;
let depositsRawList = [];
let unsubscribeDeposits = null;
const userCache = {}; // Promise-based profile resolver cache

// Filtering criteria states
let searchFilter = "";
let statusFilter = "all";
let methodFilter = "all";
let dateFilter = "all";

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Enforce strict Admin RBAC session guard
  const adminUser = await verifyAdminPrivileges();
  if (!adminUser) return; // verifyAdminPrivileges auto-redirects unauthorized requests

  // 2. Initialize PageLayout wrapper matching established admin dashboard style
  activePageLayout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: adminUser.email,
      versionText: "Admin Core v3.0",
      initialNotifications: [
        { id: 1, type: "info", text: "Secure deposit auditing engine loaded." }
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
      activeId: "admin-deposits",
      menuItems: [
        { id: "admin-dashboard", label: "Control Panel", icon: "bi-shield-check", href: "/admin/dashboard.html" },
        { id: "admin-coins", label: "Coin Management", icon: "bi-coin", href: "/admin/coins.html" },
        { id: "admin-deposits", label: "Deposits Vault", icon: "bi-cash-coin", href: "/admin/deposits.html" },
        { id: "users", label: "Users List", icon: "bi-people-fill", href: "/admin/dashboard.html#users" },
        { id: "withdrawals", label: "Withdrawals Queue", icon: "bi-box-arrow-up-right", href: "/admin/dashboard.html#withdrawals" },
        { id: "marketplace", label: "Offer Book", icon: "bi-shop-window", href: "/admin/dashboard.html#marketplace" },
        { id: "trades", label: "Trade Auditor", icon: "bi-journal-check", href: "/admin/dashboard.html#trades" },
        { id: "settings", label: "Terminal Settings", icon: "bi-gear-wide-connected", href: "/admin/dashboard.html#settings" }
      ],
      onNavigate: (item) => {
        if (item.id === "admin-deposits") return;
        window.location.href = item.href;
      }
    }
  });

  // 3. Render basic skeleton frame and start real-time systems
  renderBaseOutline();
  startClock();
  subscribeToDeposits();
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
    <div id="admin-deposits-header" class="admin-page-header mb-4"></div>

    <!-- Live Sync Context Tracker Banner -->
    <div class="card-glass p-3 mb-4 d-flex flex-wrap justify-content-between align-items-center gap-3 text-sm">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-shield-lock-fill text-primary fs-5"></i>
        <div>
          <span class="text-muted text-xs d-block">AUTHORIZED LEDGER NODE</span>
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

    <!-- Quick Insights Cards -->
    <div class="admin-summary-grid mb-4" id="statsGrid">
      <div class="admin-metric-card">
        <div class="admin-metric-label">Pending Requests</div>
        <div class="admin-metric-value" id="statPendingCount">0</div>
        <div class="admin-metric-footer" id="statPendingAmount">Volume: PKR 0.00</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-label">Approved Today</div>
        <div class="admin-metric-value text-success" id="statApprovedToday">0</div>
        <div class="admin-metric-footer text-success-dim" id="statApprovedTodayAmount">Sum: PKR 0.00</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-label">Rejected Today</div>
        <div class="admin-metric-value text-danger" id="statRejectedToday">0</div>
        <div class="admin-metric-footer text-danger-dim">Daily counter reset at 00:00 UTC</div>
      </div>
      <div class="admin-metric-card">
        <div class="admin-metric-label">Cumulative Daily Approved</div>
        <div class="admin-metric-value text-primary" id="statDailyVolume">PKR 0</div>
        <div class="admin-metric-footer">Total deposits confirmed today</div>
      </div>
    </div>

    <!-- Table Filtering Tools and Search Panel -->
    <div class="admin-table-card">
      <div class="admin-filter-bar d-flex flex-wrap align-items-center justify-content-between gap-3">
        
        <!-- Tab status filtering -->
        <div class="d-flex flex-wrap gap-1" role="tablist" id="statusFilterTabs">
          <button class="btn btn-sm btn-glass active px-3 py-2 text-xs" data-status="all" role="tab">All Deposits</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs position-relative" data-status="pending" role="tab">
            Pending <span class="badge bg-warning text-dark rounded-pill ms-1 d-none" id="pendingTabBadge">0</span>
          </button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="under_review" role="tab">Under Review</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="approved" role="tab">Approved</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="rejected" role="tab">Rejected</button>
        </div>

        <div class="d-flex flex-wrap align-items-center gap-2">
          <!-- Gateway Method Filter -->
          <select id="methodFilterSelect" class="form-select form-select-sm input-glass text-xs" style="max-width: 140px;" aria-label="Filter by funding gateway">
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
            <input type="text" id="searchInput" class="form-control form-control-sm input-glass text-xs ps-5 py-2" placeholder="Search by ID, User, Email, or TxID..." aria-label="Search deposits">
          </div>
        </div>

      </div>

      <!-- Main Ledger Table Mount -->
      <div class="table-responsive table-responsive-sticky">
        <table class="table table-glass align-middle mb-0 text-nowrap text-xs" id="depositsTable">
          <thead>
            <tr>
              <th scope="col">Deposit ID</th>
              <th scope="col">User</th>
              <th scope="col">Email</th>
              <th scope="col">Method</th>
              <th scope="col">Amount (PKR)</th>
              <th scope="col">Transaction ID</th>
              <th scope="col" class="text-center">Screenshot</th>
              <th scope="col">Status</th>
              <th scope="col">Submitted Date</th>
              <th scope="col" class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody id="depositsTableBody">
            <!-- Table loader template inserted initially -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Bind breadcrumb header using reusable PageHeader
  new PageHeader("#admin-deposits-header", {
    title: "Fiat Deposit Approvals",
    subtitle: "Verify banking receipts, approve local fiat injections, and adjust PKR cash balances securely.",
    breadcrumbs: [
      { label: "Admin Console", href: "/admin/dashboard.html" },
      { label: "Deposit Audits", active: true }
    ]
  });

  // Display user email once logged in
  const authUser = auth.currentUser;
  if (authUser) {
    const emailEl = document.getElementById("headerUserEmail");
    if (emailEl) emailEl.textContent = authUser.email;
  }

  // Inject beautiful skeletons initially
  Loader.tableLoader("#depositsTableBody", 10, 5);

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
function subscribeToDeposits() {
  if (unsubscribeDeposits) {
    unsubscribeDeposits();
  }

  const q = query(collection(db, "deposits"), orderBy("createdAt", "desc"));
  
  unsubscribeDeposits = onSnapshot(q, (snapshot) => {
    depositsRawList = [];
    snapshot.forEach(docSnap => {
      depositsRawList.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    console.log(`Sync complete: Loaded ${depositsRawList.length} deposit records.`);
    
    // Recalculate metric cards and refresh display
    calculateStats();
    renderTableContent();
  }, (err) => {
    console.error("Firestore real-time subscription error:", err);
    Toast.show("Failed to stream deposit documents from network.", { type: "danger" });
  });
}

/**
 * Calculate summary metric states dynamically
 */
function calculateStats() {
  let pendingCount = 0;
  let pendingVolume = 0;
  let approvedTodayCount = 0;
  let approvedTodayVolume = 0;
  let rejectedTodayCount = 0;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  depositsRawList.forEach(dep => {
    const amt = parseFloat(dep.amount) || 0;
    
    // Convert Firestore Timestamp or ISO String securely to epoch milliseconds
    let processedMs = 0;
    if (dep.processedAt) {
      processedMs = dep.processedAt.seconds 
        ? dep.processedAt.seconds * 1000 
        : new Date(dep.processedAt).getTime();
    } else if (dep.updatedAt && dep.status !== 'pending') {
      processedMs = dep.updatedAt.seconds 
        ? dep.updatedAt.seconds * 1000 
        : new Date(dep.updatedAt).getTime();
    }

    if (dep.status === "pending") {
      pendingCount++;
      pendingVolume += amt;
    } else if (dep.status === "approved" && processedMs >= startOfToday) {
      approvedTodayCount++;
      approvedTodayVolume += amt;
    } else if (dep.status === "rejected" && processedMs >= startOfToday) {
      rejectedTodayCount++;
    }
  });

  // Update DOM metric values
  const elements = {
    statPendingCount: pendingCount,
    statPendingAmount: `Volume: PKR ${pendingVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    statApprovedToday: approvedTodayCount,
    statApprovedTodayAmount: `Sum: PKR ${approvedTodayVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    statRejectedToday: rejectedTodayCount,
    statDailyVolume: `PKR ${approvedTodayVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
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
  const tbody = document.getElementById("depositsTableBody");
  if (!tbody) return;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
  const startOfSevenDaysAgo = startOfToday - (7 * 24 * 60 * 60 * 1000);
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  // Apply sequential filters
  const filteredList = [];
  
  for (const dep of depositsRawList) {
    // 1. Status Tabs Filter
    if (statusFilter !== "all" && dep.status !== statusFilter) {
      continue;
    }

    // 2. Gateway Method Filter
    if (methodFilter !== "all") {
      // Handles normalization of user-side string values
      const m = dep.method ? dep.method.toLowerCase() : "";
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
      if (dep.createdAt) {
        submitMs = dep.createdAt.seconds 
          ? dep.createdAt.seconds * 1000 
          : new Date(dep.createdAt).getTime();
      }

      if (dateFilter === "today" && submitMs < startOfToday) continue;
      if (dateFilter === "yesterday" && (submitMs < startOfYesterday || submitMs >= startOfToday)) continue;
      if (dateFilter === "week" && submitMs < startOfSevenDaysAgo) continue;
      if (dateFilter === "month" && submitMs < startOfThisMonth) continue;
    }

    // Resolve profiles to apply search strings on fullName and email
    const u = await getUserProfile(dep.userId);
    const searchString = [
      (dep.id || "").toLowerCase(),
      (dep.transactionId || "").toLowerCase(),
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
      ...dep,
      userData: u
    });
  }

  // Render finalized rows
  if (filteredList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5">
          <i class="bi bi-wallet2 text-muted fs-2 mb-2 d-block"></i>
          <span class="text-display text-white fw-bold d-block">No deposit transactions found</span>
          <span class="text-secondary text-sm d-block mt-1">Adjust your filters, search strings, or check the database.</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredList.map(dep => {
    const amt = parseFloat(dep.amount) || 0;
    const formattedAmt = amt.toLocaleString(undefined, { minimumFractionDigits: 2 });
    
    // Submission formatted date
    let formattedDate = "N/A";
    if (dep.createdAt) {
      const dateObj = dep.createdAt.seconds 
        ? new Date(dep.createdAt.seconds * 1000) 
        : new Date(dep.createdAt);
      formattedDate = dateObj.toLocaleString();
    }

    // Method Logo normalization
    let methodIcon = "bi-cash-coin text-primary";
    let normM = dep.method ? dep.method.toLowerCase() : "";
    if (normM.includes("easypaisa")) methodIcon = "bi-wallet2 text-success";
    else if (normM.includes("jazzcash")) methodIcon = "bi-phone-vibrate text-accent";
    else if (normM.includes("bank")) methodIcon = "bi-bank text-info";

    // Status classes
    let statusClass = "status-badge-pending";
    if (dep.status === "approved" || dep.status === "completed") statusClass = "status-badge-approved";
    else if (dep.status === "rejected") statusClass = "status-badge-rejected";
    else if (dep.status === "under_review") statusClass = "status-badge-under_review";

    // Action button elements state
    const isPending = dep.status === "pending" || dep.status === "under_review";
    const underReviewAction = dep.status === "pending" 
      ? `<button class="btn btn-xs btn-glass text-2xs px-2 py-1 btn-review-trigger" data-id="${dep.id}" aria-label="Mark under review"><i class="bi bi-eye"></i> Review</button>`
      : "";

    const actionButtonsHtml = isPending 
      ? `
        <div class="d-flex align-items-center justify-content-end gap-1">
          ${underReviewAction}
          <button class="btn btn-xs btn-glass-primary text-2xs px-2 py-1 btn-approve-trigger" data-id="${dep.id}" aria-label="Approve deposit"><i class="bi bi-check-lg"></i> Approve</button>
          <button class="btn btn-xs btn-danger text-2xs px-2 py-1 btn-reject-trigger bg-opacity-20 border border-danger text-danger hover-lift" data-id="${dep.id}" aria-label="Reject deposit"><i class="bi bi-slash-circle"></i> Reject</button>
          <button class="btn btn-xs btn-glass text-2xs px-1 py-1 btn-detail-trigger" data-id="${dep.id}" aria-label="View transaction details"><i class="bi bi-three-dots-vertical"></i></button>
        </div>
      `
      : `
        <div class="d-flex align-items-center justify-content-end">
          <button class="btn btn-xs btn-glass text-2xs px-2 py-1 btn-detail-trigger" data-id="${dep.id}"><i class="bi bi-journal-text"></i> Audit Trail</button>
        </div>
      `;

    // Normalizing Screenshot image element
    const screenshotHtml = dep.screenshotUrl 
      ? `
        <div class="screenshot-preview-cell" data-url="${dep.screenshotUrl}">
          <img src="${dep.screenshotUrl}" alt="Proof" style="width: 42px; height: 32px; object-fit: cover;" referrerpolicy="no-referrer">
        </div>
      `
      : `<span class="text-muted text-2xs">No Image</span>`;

    return `
      <tr>
        <td class="text-mono fw-bold text-white text-uppercase" style="letter-spacing: 0.05em;">${dep.id.replace("dep_", "")}</td>
        <td>
          <span class="text-white fw-semibold d-block">${dep.userData.fullName}</span>
          <span class="text-muted text-2xs d-block">@${dep.userData.username}</span>
        </td>
        <td><a href="mailto:${dep.userData.email}" class="text-secondary text-2xs hover-link">${dep.userData.email}</a></td>
        <td>
          <div class="d-flex align-items-center gap-1">
            <i class="bi ${methodIcon} text-xs"></i>
            <span class="fw-medium text-capitalize">${dep.method || "Unspecified"}</span>
          </div>
        </td>
        <td class="text-mono fw-bold text-light text-end pe-4">PKR ${formattedAmt}</td>
        <td class="text-mono text-secondary">${dep.transactionId || "N/A"}</td>
        <td class="text-center">${screenshotHtml}</td>
        <td>
          <span class="${statusClass}">${dep.status.replace("_", " ")}</span>
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
  // Screenshot Zoom trigger
  document.querySelectorAll(".screenshot-preview-cell").forEach(cell => {
    cell.onclick = (e) => {
      e.stopPropagation();
      const imgUrl = cell.getAttribute("data-url");
      showZoomScreenshotModal(imgUrl);
    };
  });

  // Review status changer
  document.querySelectorAll(".btn-review-trigger").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const depId = btn.getAttribute("data-id");
      await updateDepositStatus(depId, "under_review");
    };
  });

  // Detail Modal popup
  document.querySelectorAll(".btn-detail-trigger").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const depId = btn.getAttribute("data-id");
      showDepositDetailModal(depId);
    };
  });

  // Approval handler
  document.querySelectorAll(".btn-approve-trigger").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const depId = btn.getAttribute("data-id");
      promptDepositApproval(depId);
    };
  });

  // Rejection handler
  document.querySelectorAll(".btn-reject-trigger").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const depId = btn.getAttribute("data-id");
      promptDepositRejection(depId);
    };
  });
}

/**
 * Directly update status in Firestore for simple lifecycle transitions (e.g. pending to under review)
 * @param {string} depositId - Target document ID
 * @param {string} newStatus - target status state
 */
async function updateDepositStatus(depositId, newStatus) {
  try {
    const loader = new Loader({ text: `Updating audit state to ${newStatus.replace("_", " ")}...` });
    loader.show();
    await updateDoc(doc(db, "deposits", depositId), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
    loader.hide();
    Toast.show(`Deposit state updated to ${newStatus.toUpperCase()}`, { type: "info" });
  } catch (err) {
    console.error("Failed to update status:", err);
    Toast.show("Audit write failed.", { type: "danger" });
  }
}

/**
 * Show a professional full-screen image zoom view Modal with backdrop blur
 * @param {string} url - Screenshot url to display
 */
function showZoomScreenshotModal(url) {
  const m = new Modal({
    title: "Proof of Payment Audit Screenshot",
    body: `
      <div class="text-center">
        <img src="${url}" alt="Receipt Zoom" class="screenshot-zoom-view img-fluid" referrerpolicy="no-referrer">
      </div>
    `,
    size: "lg",
    buttons: [
      { label: "Close Panel", class: "btn-hfc-secondary w-100", onClick: (inst) => inst.destroy() }
    ]
  });
  m.open();
}

/**
 * Render the full audit detail modal layout, combining user profiling logs and deposit timeline details
 * @param {string} depositId - Document ID
 */
async function showDepositDetailModal(depositId) {
  const dep = depositsRawList.find(d => d.id === depositId);
  if (!dep) return;

  const loader = new Loader({ text: "Resolving full security profile..." });
  loader.show();

  const u = await getUserProfile(dep.userId);
  loader.hide();

  const isPending = dep.status === "pending" || dep.status === "under_review";
  const processedDate = dep.processedAt 
    ? (dep.processedAt.seconds ? new Date(dep.processedAt.seconds * 1000) : new Date(dep.processedAt)).toLocaleString()
    : "Not processed yet";

  const submittedDate = dep.createdAt 
    ? (dep.createdAt.seconds ? new Date(dep.createdAt.seconds * 1000) : new Date(dep.createdAt)).toLocaleString()
    : "Unknown date";

  // Timeline configuration
  const isApproved = dep.status === "approved" || dep.status === "completed";
  const isRejected = dep.status === "rejected";
  const isUnderReview = dep.status === "under_review";

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

        <div class="mb-2">
          <div class="modal-detail-label">Account Role & Status</div>
          <div class="d-flex gap-1 align-items-center mt-1">
            <span class="badge bg-secondary text-capitalize text-mono text-2xs">${u.role}</span>
            <span class="badge bg-success-dim text-capitalize text-mono text-2xs">${u.status}</span>
          </div>
        </div>
      </div>

      <!-- Right side: Deposit transaction details -->
      <div class="col-md-6 ps-4">
        <h6 class="text-display fw-bold text-white mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-bank2 text-accent"></i> Transaction Specifications
        </h6>

        <div class="row g-2 mb-3">
          <div class="col-sm-6">
            <div class="modal-detail-label">Declared Amount</div>
            <div class="modal-detail-value text-mono text-white fw-bold fs-6">PKR ${(parseFloat(dep.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="col-sm-6">
            <div class="modal-detail-label">Funding Gateway</div>
            <div class="modal-detail-value text-capitalize">${dep.method || "Unspecified"}</div>
          </div>
        </div>

        <div class="mb-2">
          <div class="modal-detail-label">Transaction Reference (TxID)</div>
          <div class="modal-detail-value-mono text-glow-primary text-uppercase">${dep.transactionId || "N/A"}</div>
        </div>

        <div class="mb-3">
          <div class="modal-detail-label">User Notes</div>
          <div class="p-2 card-glass text-secondary font-sans text-2xs" style="max-height: 80px; overflow-y: auto; white-space: pre-wrap;">${dep.notes || "No extra remarks submitted by user."}</div>
        </div>

        <div class="mb-2">
          <div class="modal-detail-label">Processed Auditing Admin</div>
          <div class="modal-detail-value-mono text-2xs">${dep.adminUid || "None"}</div>
        </div>

        <div class="mb-2">
          <div class="modal-detail-label">Administrative notes</div>
          <div class="p-2 card-glass text-info font-sans text-2xs" style="white-space: pre-wrap;">${dep.adminNotes || dep.rejectionReason || "No custom auditing notes logged."}</div>
        </div>
      </div>

      <!-- Footer spacing row: Auditing Timeline -->
      <div class="col-12 border-top border-secondary border-opacity-10 pt-3">
        <h6 class="text-display fw-bold text-white mb-3">Auditing Verification Timeline</h6>
        <div class="timeline-flow d-flex flex-column gap-3">
          <div class="timeline-item">
            <div class="timeline-dot success"></div>
            <div class="fw-bold text-white text-2xs">SUBMITTED</div>
            <div class="text-secondary text-2xs">User filed payment proof. TxID received. Ledger lock initiated: ${submittedDate}</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot ${isUnderReview || isApproved || isRejected ? 'success' : ''}"></div>
            <div class="fw-bold text-white text-2xs">UNDER ADMINISTRATIVE REVIEW</div>
            <div class="text-secondary text-2xs">Deposit status moved to Review Queue. Screenshot analysis and IBFT database matching underway.</div>
          </div>
          <div class="timeline-item mb-0">
            <div class="timeline-dot ${isApproved ? 'success' : (isRejected ? 'danger' : '')}"></div>
            <div class="fw-bold text-white text-2xs">TERMINAL RESOLUTION</div>
            <div class="text-secondary text-2xs">
              ${isApproved 
                ? `APPROVED AND SETTLED: Funds credited instantly to PKR wallet wallet: ${processedDate}` 
                : (isRejected 
                  ? `REJECTED: Audit failed. Reason: "${dep.rejectionReason || dep.adminNotes || 'Declined payment proof.'}": ${processedDate}` 
                  : 'Pending resolution')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Dynamically compile buttons depending on pending status
  const modalButtons = [];
  if (isPending) {
    if (dep.status === "pending") {
      modalButtons.push({
        label: "Move to Review Queue",
        class: "btn-hfc-secondary",
        onClick: async (m) => {
          await updateDepositStatus(depositId, "under_review");
          m.destroy();
          showDepositDetailModal(depositId); // Re-open with fresh data
        }
      });
    }
    modalButtons.push({
      label: "Approve Ledger Credit",
      class: "btn-glass-primary",
      onClick: (m) => {
        m.destroy();
        promptDepositApproval(depositId);
      }
    });
    modalButtons.push({
      label: "Reject Request",
      class: "btn-hfc-danger bg-opacity-20 text-danger border border-danger",
      onClick: (m) => {
        m.destroy();
        promptDepositRejection(depositId);
      }
    });
  }
  
  modalButtons.push({
    label: "Dismiss Audit",
    class: "btn-hfc-secondary",
    onClick: (m) => m.destroy()
  });

  const m = new Modal({
    title: `Ledger Audit Trail: #${dep.id.replace("dep_", "")}`,
    body: tBody,
    size: "lg",
    buttons: modalButtons
  });
  
  m.open();
}

/**
 * Double-confirmation modal interface to collect notes and proceed with atomic wallet credit transaction
 * @param {string} depositId - Deposit document ID
 */
function promptDepositApproval(depositId) {
  const dep = depositsRawList.find(d => d.id === depositId);
  if (!dep) return;

  const amt = parseFloat(dep.amount) || 0;

  const bContent = `
    <div class="text-sm">
      <div class="alert alert-warning card-glass border border-warning border-opacity-30 p-3 mb-3 text-warning">
        <i class="bi bi-exclamation-triangle-fill fs-5 me-2 align-middle"></i>
        <strong>Ledger Credit Authorization:</strong> Approving this transaction will immediately credit <strong>PKR ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> to the user's active wallet balance. This operation is **strictly irreversible**.
      </div>

      <div class="mb-3">
        <label for="approveAdminNotes" class="form-label text-white fw-semibold mb-1">Administrative Settling Notes (Optional)</label>
        <textarea id="approveAdminNotes" class="form-control form-control-glass text-white text-xs" rows="3" placeholder="Specify clearing agent references, specific IBFT batch codes, or verified cashier tags..." maxlength="400"></textarea>
      </div>
    </div>
  `;

  Modal.confirm({
    title: "Authorize Deposit Settling",
    body: bContent,
    confirmText: "Execute Credit Settled",
    confirmClass: "btn-glass-primary px-3 py-2 fw-bold text-dark",
    onConfirm: async (modalInstance) => {
      const notesArea = document.getElementById("approveAdminNotes");
      const adminNotesValue = notesArea ? notesArea.value.trim() : "";
      
      await executeDepositApproval(depositId, adminNotesValue);
    }
  });
}

/**
 * Atomic Firestore Transaction to update deposit document, credit user PKR wallet, create transaction block,
 * push notification feed, and audit logs.
 * @param {string} depositId 
 * @param {string} adminNotes 
 */
async function executeDepositApproval(depositId, adminNotes) {
  const dep = depositsRawList.find(d => d.id === depositId);
  if (!dep) {
    Toast.show("Error: Deposit details lost.", { type: "danger" });
    return;
  }

  const loader = new Loader({ text: "Opening atomic lock. Adjusting Ledger ledger balances..." });
  loader.show();

  const adminUid = auth.currentUser?.uid || "unknown_admin";
  const userId = dep.userId;
  const amount = parseFloat(dep.amount) || 0;

  try {
    // Run the write operation under a single isolated transaction context
    await runSafeTransaction(async (transaction) => {
      // 1. Fetch deposit state inside transaction to ensure concurrency safety
      const depRef = doc(db, "deposits", depositId);
      const depSnap = await transaction.get(depRef);
      if (!depSnap.exists()) {
        throw new Error("Target deposit document does not exist.");
      }
      
      const depData = depSnap.data();
      if (depData.status === "approved" || depData.status === "rejected") {
        throw new Error("This deposit request has already been finalized by another operator.");
      }

      // 2. Fetch or initialize User Wallet profile
      const walletId = `${userId}_PKR`;
      const walletRef = doc(db, "wallets", walletId);
      const walletSnap = await transaction.get(walletRef);

      let currentBalance = 0;
      let holdBalance = 0;
      let addressStr = `pkr_wallet_${userId}`;

      if (walletSnap.exists()) {
        const wData = walletSnap.data();
        currentBalance = parseFloat(wData.availableBalance) || parseFloat(wData.balance) || 0;
        holdBalance = parseFloat(wData.holdBalance) || 0;
        addressStr = wData.address || addressStr;
      }

      const newBalance = currentBalance + amount;

      // 3. Apply atomic ledger credits
      transaction.set(walletRef, {
        walletId,
        ownerId: userId,
        currency: "PKR",
        symbol: "₨",
        availableBalance: newBalance,
        balance: newBalance, // Sync both attributes to prevent legacy rules from breaking
        holdBalance: holdBalance,
        address: addressStr,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 4. Finalize deposit ticket
      transaction.update(depRef, {
        status: "approved",
        adminUid: adminUid,
        adminNotes: adminNotes || "Deposit verified and credited.",
        processedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 5. Generate immutable transaction ledger row
      const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const txRef = doc(db, "transactions", txId);
      transaction.set(txRef, {
        txId,
        userId,
        type: "deposit",
        amount,
        currency: "PKR",
        status: "completed",
        txHash: `0x${Math.random().toString(16).substr(2, 40)}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 6. Push real-time alert notice to client UI feed
      const notId = `not_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const notRef = doc(db, "notifications", notId);
      transaction.set(notRef, {
        notificationId: notId,
        userUid: userId,
        userId: userId,
        title: "Deposit Approved Successfully",
        message: `Your deposit of PKR ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} has been processed. Wallet credited.`,
        type: "success",
        readStatus: false,
        read: false, // Sync properties for redundancy
        createdAt: serverTimestamp()
      });

      // 7. Write security compliance logs
      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const logRef = doc(db, "logs", logId);
      transaction.set(logRef, {
        logId,
        category: "admin_action",
        severity: "medium",
        actorId: adminUid,
        action: "deposit_approved",
        ipAddress: "Admin Portal Client",
        details: {
          depositId,
          targetUserUid: userId,
          amountTransmitted: amount,
          assetType: "PKR"
        },
        timestamp: serverTimestamp()
      });
    });

    // Handle transaction success
    loader.hide();
    Toast.show(`Settlement Success: credited PKR ${amount.toLocaleString()} directly to user.`, { type: "success" });
  } catch (err) {
    loader.hide();
    console.error("Ledger transaction failed:", err);
    
    // Extract actual structured message if wrapped
    let parsedMsg = err.message;
    try {
      const parsed = JSON.parse(err.message);
      if (parsed && parsed.error) parsedMsg = parsed.error;
    } catch (_) {}

    Toast.show(`Operation Aborted: ${parsedMsg}`, { type: "danger" });
  }
}

/**
 * Rejection setup modal. Reason is MANDATORY to maintain auditing trail
 * @param {string} depositId - Deposit document ID
 */
function promptDepositRejection(depositId) {
  const dep = depositsRawList.find(d => d.id === depositId);
  if (!dep) return;

  const bContent = `
    <div class="text-sm">
      <div class="alert alert-danger card-glass border border-danger border-opacity-30 p-3 mb-3 text-danger">
        <i class="bi bi-slash-circle-fill fs-5 me-2 align-middle"></i>
        <strong>Confirm Request Rejection:</strong> You are about to decline this deposit submission. You must state a valid auditing failure reason. This action notifies the user instantly.
      </div>

      <div class="mb-3">
        <label for="rejectReason" class="form-label text-white fw-semibold mb-1">Rejection Reason (Mandatory) <span class="text-danger">*</span></label>
        <textarea id="rejectReason" class="form-control form-control-glass text-white text-xs" rows="3" placeholder="Provide clear reason: 'Invalid screenshot proof', 'Transaction amount mismatch', 'Duplicate TxID signature detected'..." maxlength="400" required></textarea>
        <div class="invalid-feedback text-2xs mt-1 d-none text-danger" id="rejectReasonFeedback">Please input a rejection reason (minimum 5 characters).</div>
      </div>
    </div>
  `;

  Modal.confirm({
    title: "Decline Deposit Request",
    body: bContent,
    confirmText: "Decline and Lock",
    confirmClass: "btn-danger px-3 py-2 fw-bold text-white",
    onConfirm: async (modalInstance) => {
      const reasonArea = document.getElementById("rejectReason");
      const feedback = document.getElementById("rejectReasonFeedback");
      const reasonValue = reasonArea ? reasonArea.value.trim() : "";

      if (!reasonValue || reasonValue.length < 5) {
        if (feedback) feedback.classList.remove("d-none");
        if (reasonArea) reasonArea.classList.add("is-invalid");
        
        // Prevent dismissal of dialog by returning without destroying
        throw new Error("Validation failed: Reason required.");
      }

      await executeDepositRejection(depositId, reasonValue);
    }
  });
}

/**
 * Execute deposit rejection inside Firestore transaction
 * @param {string} depositId 
 * @param {string} reason 
 */
async function executeDepositRejection(depositId, reason) {
  const dep = depositsRawList.find(d => d.id === depositId);
  if (!dep) {
    Toast.show("Error: Deposit state lost.", { type: "danger" });
    return;
  }

  const loader = new Loader({ text: "Logging decline record..." });
  loader.show();

  const adminUid = auth.currentUser?.uid || "unknown_admin";
  const userId = dep.userId;
  const amount = parseFloat(dep.amount) || 0;

  try {
    await runSafeTransaction(async (transaction) => {
      const depRef = doc(db, "deposits", depositId);
      const depSnap = await transaction.get(depRef);
      if (!depSnap.exists()) {
        throw new Error("Target deposit document does not exist.");
      }

      const depData = depSnap.data();
      if (depData.status === "approved" || depData.status === "rejected") {
        throw new Error("This deposit request has already been finalized by another operator.");
      }

      // 1. Update deposit ticket status to rejected
      transaction.update(depRef, {
        status: "rejected",
        adminUid: adminUid,
        rejectionReason: reason,
        adminNotes: `Rejection filed. Reason: ${reason}`,
        processedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Log transaction decline
      const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const txRef = doc(db, "transactions", txId);
      transaction.set(txRef, {
        txId,
        userId,
        type: "deposit",
        amount,
        currency: "PKR",
        status: "failed", // Failed because it was rejected by admin
        txHash: `0x${Math.random().toString(16).substr(2, 40)}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 3. Send warning alert to user
      const notId = `not_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const notRef = doc(db, "notifications", notId);
      transaction.set(notRef, {
        notificationId: notId,
        userUid: userId,
        userId: userId,
        title: "Deposit Rejected",
        message: `Your deposit request of PKR ${amount.toLocaleString()} has been declined. Reason: ${reason}`,
        type: "danger",
        readStatus: false,
        read: false,
        createdAt: serverTimestamp()
      });

      // 4. Log compliance audit
      const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const logRef = doc(db, "logs", logId);
      transaction.set(logRef, {
        logId,
        category: "admin_action",
        severity: "medium",
        actorId: adminUid,
        action: "deposit_rejected",
        ipAddress: "Admin Portal Client",
        details: {
          depositId,
          targetUserUid: userId,
          declinedAmount: amount,
          reasonProvided: reason
        },
        timestamp: serverTimestamp()
      });
    });

    loader.hide();
    Toast.show("Audit failure logged. Deposit declined successfully.", { type: "warning" });
  } catch (err) {
    loader.hide();
    console.error("Ledger transaction failed:", err);
    Toast.show(`Operation Aborted: ${err.message}`, { type: "danger" });
  }
}
