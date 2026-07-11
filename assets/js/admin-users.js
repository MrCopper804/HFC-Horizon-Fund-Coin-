/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Admin User Management Controller
 * Handles strict admin RBAC authorization, real-time user database streams,
 * search-filtering, and comprehensive multi-tab account audit profiles.
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
  updateDoc, 
  where,
  limit,
  serverTimestamp
} from "firebase/firestore";
import { logoutUser } from "../../firebase/auth.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";

// Page Global State Context
let activePageLayout = null;
let usersList = [];
let unsubscribeUsers = null;

// Filter & Sort States
let searchFilterQuery = "";
let statusFilterVal = "all"; // "all", "active", "suspended", "verified", "unverified", "admins"
let roleFilterVal = "all"; // "all", "user", "admin", "moderator", "finance", "support"
let dateFilterVal = "all"; // "all", "today", "yesterday", "week", "month"
let sortByVal = "newest"; // "newest", "oldest", "alphabetical", "most_trades", "highest_portfolio"

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Enforce strict Admin RBAC session guard
  const adminUser = await verifyAdminPrivileges();
  if (!adminUser) return; // verifyAdminPrivileges handles redirection

  // 2. Initialize PageLayout wrapper matching the premium dark/glassmorphic admin design
  activePageLayout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: adminUser.email,
      versionText: "Admin Core v3.0",
      initialNotifications: [
        { id: 1, type: "info", text: "Secure user auditing engine active." }
      ],
      onLogout: async () => {
        try {
          const loader = new Loader({ text: "Terminating terminal authority..." });
          loader.show();
          await logoutUser();
          loader.hide();
          Toast.show("Admin session closed securely. Terminal locked.", { type: "info" });
          setTimeout(() => {
            window.location.href = "/admin/login.html";
          }, 1000);
        } catch (err) {
          Toast.show("Failed to close session cleanly.", { type: "danger" });
        }
      }
    },
    sidebarOptions: {
      brandName: "HFC ADMIN",
      activeId: "users",
      menuItems: [
        { id: "admin-dashboard", label: "Control Panel", icon: "bi-shield-check", href: "/admin/dashboard.html" },
        { id: "admin-coins", label: "Coin Management", icon: "bi-coin", href: "/admin/coins.html" },
        { id: "admin-deposits", label: "Deposits Vault", icon: "bi-cash-coin", href: "/admin/deposits.html" },
        { id: "admin-withdrawals", label: "Withdrawals Queue", icon: "bi-box-arrow-up-right", href: "/admin/withdrawals.html" },
        { id: "users", label: "Users List", icon: "bi-people-fill", href: "/admin/users.html" },
        { id: "marketplace", label: "Offer Book", icon: "bi-shop-window", href: "/admin/dashboard.html#marketplace" },
        { id: "trades", label: "Trade Auditor", icon: "bi-journal-check", href: "/admin/dashboard.html#trades" },
        { id: "settings", label: "Terminal Settings", icon: "bi-gear-wide-connected", href: "/admin/dashboard.html#settings" }
      ],
      onNavigate: (item) => {
        if (item.id === "users") return;
        window.location.href = item.href;
      }
    }
  });

  // 3. Render base frame template
  renderBaseOutline();
  startClock();
  
  // 4. Connect real-time Firestore synchronization
  subscribeToUserDirectory();
});

/**
 * Strict RBAC Verification Guard
 * Confirms current session holds 'admin' level role before continuing
 */
async function verifyAdminPrivileges() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        console.warn("Unauthorized access attempt. Redirecting to admin login...");
        window.location.href = "/admin/login.html";
        resolve(null);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === "admin") {
          resolve(user);
        } else {
          console.error("Access Denied: Node lacks administrator credentials.");
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
 * Start Dynamic UTC Clock Ticker in header
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
 * Render basic structural container layout inside PageLayout
 */
function renderBaseOutline() {
  const container = activePageLayout.getContentContainer();
  if (!container) return;

  container.innerHTML = `
    <!-- Page Header Title and Breadcrumbs Space -->
    <div id="admin-users-header" class="admin-page-header mb-4"></div>

    <!-- Live Sync Identity System Status Header Banner -->
    <div class="card-glass p-3 mb-4 d-flex flex-wrap justify-content-between align-items-center gap-3 text-sm">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-shield-check-fill text-primary fs-5"></i>
        <div>
          <span class="text-muted text-xs d-block">AUTHORIZED LEDGER AUDITOR</span>
          <span class="text-white fw-bold" id="headerAdminEmail">Syncing security nodes...</span>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 text-mono text-xs">
        <div class="system-pulse-online"></div>
        <div>
          <span class="text-muted text-xs d-block text-end">AUDITING TIMESTAMP (UTC)</span>
          <span class="text-white fw-semibold" id="headerNodeTime">Initializing ticker...</span>
        </div>
      </div>
    </div>

    <!-- User Metrics Summary Cards Grid -->
    <div class="admin-summary-grid mb-4" id="statsGrid">
      <div class="admin-metric-card" tabindex="0">
        <div class="admin-metric-label">Total Registered</div>
        <div class="admin-metric-value text-white" id="statTotalUsers">-</div>
        <div class="admin-metric-footer">Cumulative registered nodes</div>
      </div>
      <div class="admin-metric-card" tabindex="0">
        <div class="admin-metric-label">Active Accounts</div>
        <div class="admin-metric-value text-success" id="statActiveUsers">-</div>
        <div class="admin-metric-footer">Nodes authorized to trade</div>
      </div>
      <div class="admin-metric-card" tabindex="0">
        <div class="admin-metric-label">Suspended Users</div>
        <div class="admin-metric-value text-warning" id="statSuspendedUsers">-</div>
        <div class="admin-metric-footer">Temporarily locked accounts</div>
      </div>
      <div class="admin-metric-card" tabindex="0">
        <div class="admin-metric-label">Verified KYC</div>
        <div class="admin-metric-value text-primary" id="statVerifiedUsers">-</div>
        <div class="admin-metric-footer">Cleared profile identity records</div>
      </div>
      <div class="admin-metric-card" tabindex="0">
        <div class="admin-metric-label">System Admins</div>
        <div class="admin-metric-value text-glow-primary text-white" id="statAdminCount">-</div>
        <div class="admin-metric-footer">Root privileges authorized</div>
      </div>
      <div class="admin-metric-card" tabindex="0">
        <div class="admin-metric-label">Registered Today</div>
        <div class="admin-metric-value text-info" id="statNewUsersToday">-</div>
        <div class="admin-metric-footer">Incoming nodes today</div>
      </div>
    </div>

    <!-- Filtering Panel, Search Tools, and Table -->
    <div class="admin-table-card">
      <div class="p-4 border-bottom border-secondary border-opacity-10 d-flex flex-wrap gap-3 align-items-center justify-content-between">
        
        <!-- Interactive Category Quick-Filter Tabs -->
        <div class="d-flex flex-wrap gap-1" role="tablist" id="statusFilterTabs">
          <button class="btn btn-sm btn-glass active px-3 py-2 text-xs" data-status="all" role="tab">All Users</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="active" role="tab">Active</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="suspended" role="tab">Suspended</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="admins" role="tab">Admins</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="verified" role="tab">Verified</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-status="unverified" role="tab">Unverified</button>
        </div>

        <!-- Custom Action Tools: Register Node Placeholder (Future Expansion) -->
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-glass text-xs" id="exportUsersBtn" aria-label="Export users registry data">
            <i class="bi bi-download me-1"></i> Export Registry
          </button>
        </div>
      </div>

      <!-- Advanced Filter Search Bar Deck -->
      <div class="p-4 bg-black bg-opacity-20 border-bottom border-secondary border-opacity-10 d-flex flex-wrap gap-3 align-items-center">
        <!-- Text Search -->
        <div class="flex-grow-1" style="min-width: 260px;">
          <div class="position-relative">
            <i class="bi bi-search text-secondary position-absolute top-50 start-3 translate-middle-y"></i>
            <input type="text" id="userSearchInput" class="form-control form-control-sm input-glass ps-5 text-xs w-100" placeholder="Search registry by UID, Name, Username, Email, Phone..." aria-label="Search User Registry" />
          </div>
        </div>

        <!-- Role Filter Select -->
        <div style="min-width: 140px;">
          <select id="roleFilterSelect" class="form-select form-select-sm input-glass text-xs" aria-label="Filter by assigned access role">
            <option value="all">All Roles</option>
            <option value="user">User</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
            <option value="finance">Finance</option>
            <option value="support">Support</option>
          </select>
        </div>

        <!-- Date Range Filter Select -->
        <div style="min-width: 150px;">
          <select id="dateFilterSelect" class="form-select form-select-sm input-glass text-xs" aria-label="Filter by registration period">
            <option value="all">All Registration Dates</option>
            <option value="today">Registered Today</option>
            <option value="yesterday">Registered Yesterday</option>
            <option value="week">Registered This Week</option>
            <option value="month">Registered This Month</option>
          </select>
        </div>

        <!-- Sort Select Selector -->
        <div style="min-width: 150px;">
          <select id="sortSelect" class="form-select form-select-sm input-glass text-xs" aria-label="Sort users registry list">
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="alphabetical">Sort: Alphabetical (A-Z)</option>
            <option value="most_trades">Sort: Most Trades</option>
            <option value="highest_portfolio">Sort: Portfolio Value</option>
          </select>
        </div>
      </div>

      <!-- User Directory Responsive Table Block with Sticky Headers -->
      <div class="table-responsive-sticky" id="tableContainer">
        <!-- Loading fallback skeleton inside table -->
        <div class="p-5 text-center" id="tableLoader">
          <div class="spinner-border text-primary mb-3" role="status">
            <span class="visually-hidden">Loading registry data...</span>
          </div>
          <p class="text-secondary text-sm m-0">Synchronizing user registry records with live cluster nodes...</p>
        </div>
      </div>
    </div>
  `;

  // Render header title and breadcrumbs matching deposits UI
  new PageHeader("#admin-users-header", {
    title: "User Registry Auditor",
    description: "Manage system roles, account restriction states, security attributes, and audit trading portfolios.",
    breadcrumbs: [
      { label: "Control Panel", href: "/admin/dashboard.html" },
      { label: "User Directory", active: true }
    ]
  });

  // Display admin email in sync block
  const adminEmailEl = document.getElementById("headerAdminEmail");
  if (adminEmailEl && auth.currentUser) {
    adminEmailEl.textContent = auth.currentUser.email;
  }

  // Bind Event Listeners for Filters, Search, Sort & Export
  bindFilterControlEvents();
}

/**
 * Connect user input event listeners to state managers and triggers
 */
function bindFilterControlEvents() {
  const searchInput = document.getElementById("userSearchInput");
  const roleSelect = document.getElementById("roleFilterSelect");
  const dateSelect = document.getElementById("dateFilterSelect");
  const sortSelect = document.getElementById("sortSelect");
  const tabContainer = document.getElementById("statusFilterTabs");
  const exportBtn = document.getElementById("exportUsersBtn");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchFilterQuery = e.target.value.trim().toLowerCase();
      renderUsersTable();
    });
  }

  if (roleSelect) {
    roleSelect.addEventListener("change", (e) => {
      roleFilterVal = e.target.value;
      renderUsersTable();
    });
  }

  if (dateSelect) {
    dateSelect.addEventListener("change", (e) => {
      dateFilterVal = e.target.value;
      renderUsersTable();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      sortByVal = e.target.value;
      renderUsersTable();
    });
  }

  if (tabContainer) {
    const tabs = tabContainer.querySelectorAll("button");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        statusFilterVal = tab.getAttribute("data-status");
        renderUsersTable();
      });
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      exportRegistryToCSV();
    });
  }
}

/**
 * Real-time active Firestore listener on the 'users' collection
 */
function subscribeToUserDirectory() {
  const usersRef = collection(db, "users");
  
  // Set up loader fallback state
  showTableSkeleton();

  unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
    usersList = [];
    snapshot.forEach(docSnap => {
      const u = docSnap.data();
      usersList.push({
        id: docSnap.id,
        ...u
      });
    });

    // Run real-time updates across summary statistics
    updateSummaryStatistics();

    // Re-draw standard users table with current live data
    renderUsersTable();
  }, (err) => {
    console.error("Firestore Registry Synchronizer Error: ", err);
    Toast.show("Failed to stream real-time user records due to permission blocks.", { type: "danger" });
  });
}

/**
 * Compute real-time metric numbers from active users list
 */
function updateSummaryStatistics() {
  const totalCount = usersList.length;
  
  const activeCount = usersList.filter(u => u.status === "active").length;
  const suspendedCount = usersList.filter(u => u.status === "suspended" || u.status === "banned").length;
  const verifiedCount = usersList.filter(u => u.status === "verified").length;
  const adminCount = usersList.filter(u => u.role === "admin" || u.isAdmin === true).length;

  // Calculate new users registered today in UTC calendar period
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  const newTodayCount = usersList.filter(u => {
    if (!u.createdAt) return false;
    // Handle both seconds (Firestore timestamp) and ISO date string format
    const regMs = u.createdAt.seconds ? (u.createdAt.seconds * 1000) : new Date(u.createdAt).getTime();
    return regMs >= startOfTodayMs;
  }).length;

  // Render to DOM
  const totalUsersEl = document.getElementById("statTotalUsers");
  const activeUsersEl = document.getElementById("statActiveUsers");
  const suspendedUsersEl = document.getElementById("statSuspendedUsers");
  const verifiedUsersEl = document.getElementById("statVerifiedUsers");
  const adminCountEl = document.getElementById("statAdminCount");
  const newUsersTodayEl = document.getElementById("statNewUsersToday");

  if (totalUsersEl) totalUsersEl.textContent = totalCount.toLocaleString();
  if (activeUsersEl) activeUsersEl.textContent = activeCount.toLocaleString();
  if (suspendedUsersEl) suspendedUsersEl.textContent = suspendedCount.toLocaleString();
  if (verifiedUsersEl) verifiedUsersEl.textContent = verifiedCount.toLocaleString();
  if (adminCountEl) adminCountEl.textContent = adminCount.toLocaleString();
  if (newUsersTodayEl) newUsersTodayEl.textContent = newTodayCount.toLocaleString();
}

/**
 * Filter, sort and render user records into table DOM
 */
function renderUsersTable() {
  const container = document.getElementById("tableContainer");
  if (!container) return;

  // Perform multi-criteria filtering
  let filtered = [...usersList];

  // 1. Text Search Filter (UID, Full Name, Username, Email, Phone Number)
  if (searchFilterQuery) {
    filtered = filtered.filter(u => {
      const uid = (u.id || u.uid || "").toLowerCase();
      const fullName = (u.fullName || u.displayName || "").toLowerCase();
      const username = (u.username || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      const phone = (u.phone || "").toLowerCase();

      return uid.includes(searchFilterQuery) ||
             fullName.includes(searchFilterQuery) ||
             username.includes(searchFilterQuery) ||
             email.includes(searchFilterQuery) ||
             phone.includes(searchFilterQuery);
    });
  }

  // 2. Tab-based Quick Status Filter
  if (statusFilterVal !== "all") {
    if (statusFilterVal === "active") {
      filtered = filtered.filter(u => u.status === "active");
    } else if (statusFilterVal === "suspended") {
      filtered = filtered.filter(u => u.status === "suspended" || u.status === "banned");
    } else if (statusFilterVal === "verified") {
      filtered = filtered.filter(u => u.status === "verified");
    } else if (statusFilterVal === "unverified") {
      filtered = filtered.filter(u => u.status !== "verified");
    } else if (statusFilterVal === "admins") {
      filtered = filtered.filter(u => u.role === "admin" || u.isAdmin === true);
    }
  }

  // 3. Dropdown-based Role Filter
  if (roleFilterVal !== "all") {
    filtered = filtered.filter(u => (u.role || "user").toLowerCase() === roleFilterVal.toLowerCase());
  }

  // 4. Dropdown-based Registration Date Period Filter
  if (dateFilterVal !== "all") {
    const nowMs = Date.now();
    let limitMs = 0;

    if (dateFilterVal === "today") {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      limitMs = d.getTime();
    } else if (dateFilterVal === "yesterday") {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - 1);
      const startYesterday = d.getTime();
      const endYesterday = startYesterday + (24 * 60 * 60 * 1000);
      filtered = filtered.filter(u => {
        if (!u.createdAt) return false;
        const regMs = u.createdAt.seconds ? (u.createdAt.seconds * 1000) : new Date(u.createdAt).getTime();
        return regMs >= startYesterday && regMs < endYesterday;
      });
    } else if (dateFilterVal === "week") {
      // Past 7 days
      limitMs = nowMs - (7 * 24 * 60 * 60 * 1000);
    } else if (dateFilterVal === "month") {
      // Past 30 days
      limitMs = nowMs - (30 * 24 * 60 * 60 * 1000);
    }

    if (dateFilterVal !== "yesterday" && limitMs > 0) {
      filtered = filtered.filter(u => {
        if (!u.createdAt) return false;
        const regMs = u.createdAt.seconds ? (u.createdAt.seconds * 1000) : new Date(u.createdAt).getTime();
        return regMs >= limitMs;
      });
    }
  }

  // 5. Apply Sorting Algorithm
  if (sortByVal === "newest") {
    filtered.sort((a, b) => {
      const tA = a.createdAt?.seconds ? (a.createdAt.seconds * 1000) : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tB = b.createdAt?.seconds ? (b.createdAt.seconds * 1000) : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tB - tA;
    });
  } else if (sortByVal === "oldest") {
    filtered.sort((a, b) => {
      const tA = a.createdAt?.seconds ? (a.createdAt.seconds * 1000) : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tB = b.createdAt?.seconds ? (b.createdAt.seconds * 1000) : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tA - tB;
    });
  } else if (sortByVal === "alphabetical") {
    filtered.sort((a, b) => {
      const nameA = (a.fullName || a.displayName || "").toLowerCase();
      const nameB = (b.fullName || b.displayName || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  } else if (sortByVal === "most_trades" || sortByVal === "highest_portfolio") {
    // Portfolios/Trade details can be simulated or calculated in dynamic structures.
    // Standard numerical descending order based on existing profile fields or deterministic properties
    filtered.sort((a, b) => {
      const scoreA = a.tradeCount || 0;
      const scoreB = b.tradeCount || 0;
      return scoreB - scoreA;
    });
  }

  // Handle empty state gracefully
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-5 text-center text-secondary text-sm">
        <i class="bi bi-people text-secondary d-block fs-2 mb-2"></i>
        No matching registered user nodes found under active criteria.
      </div>
    `;
    return;
  }

  // Render Table Layout
  const tableRows = filtered.map(u => {
    const regDateStr = u.createdAt ? (u.createdAt.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : new Date(u.createdAt).toLocaleDateString()) : "--/--/--";
    const lastLoginStr = u.lastLogin ? (u.lastLogin.seconds ? new Date(u.lastLogin.seconds * 1000).toLocaleString() : new Date(u.lastLogin).toLocaleString()) : "Never";
    const userRole = u.role || "user";
    const userStatus = u.status || "pending_kyc";

    // Setup visual status badges
    let statusBadgeClass = "badge-active";
    if (userStatus === "suspended") statusBadgeClass = "badge-suspended";
    else if (userStatus === "banned") statusBadgeClass = "badge-banned";

    // Setup initials logo profile if photoURL missing
    const initialName = (u.fullName || u.displayName || "Node").substring(0, 2).toUpperCase();
    const avatarImg = u.photoURL || u.profileImage 
      ? `<img src="${u.photoURL || u.profileImage}" alt="${u.fullName || 'User avatar'}" referrerPolicy="no-referrer" />` 
      : `<span class="text-xs text-glow-primary text-white fw-bold">${initialName}</span>`;

    // Determine status switch quick-action
    const isSuspended = userStatus === "suspended" || userStatus === "banned";
    const toggleActionHtml = isSuspended 
      ? `<button class="btn btn-xs btn-outline-success text-xxs px-2 py-1 flex-fill" data-btn-activate="${u.id}" title="Re-authorize access for this user"><i class="bi bi-check-circle"></i> Activate</button>`
      : `<button class="btn btn-xs btn-outline-warning text-xxs px-2 py-1 flex-fill" data-btn-suspend="${u.id}" title="Lock/Suspend access for this user"><i class="bi bi-slash-circle"></i> Suspend</button>`;

    return `
      <tr class="align-middle text-mono">
        <td>
          <div class="avatar-wrapper">${avatarImg}</div>
        </td>
        <td>
          <span class="text-white fw-bold d-block text-sm" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${u.fullName || u.displayName || 'Anonymous'}</span>
          <span class="text-muted text-xxs d-block" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">UID: ${u.id}</span>
        </td>
        <td class="text-white text-xs">${u.username || '--'}</td>
        <td class="text-secondary text-xs" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${u.email}">${u.email}</td>
        <td class="text-white text-xs">${u.phone || 'No phone'}</td>
        <td>
          <span class="badge ${userRole === 'admin' ? 'badge-role-admin' : 'badge-role-user'} text-xxs text-uppercase">${userRole}</span>
        </td>
        <td>
          <span class="badge ${statusBadgeClass} text-xxs text-uppercase">${userStatus}</span>
        </td>
        <td class="text-muted text-xxs">${regDateStr}</td>
        <td class="text-muted text-xxs" style="max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${lastLoginStr}">${lastLoginStr}</td>
        <td>
          <div class="d-flex flex-wrap gap-1" style="max-width: 250px;">
            <button class="btn btn-xs btn-outline-primary text-xxs px-2 py-1 flex-fill" data-btn-view="${u.id}" title="View comprehensive balance sheet and transaction auditing logs"><i class="bi bi-eye"></i> View</button>
            <button class="btn btn-xs btn-outline-light text-xxs px-2 py-1 flex-fill" data-btn-edit="${u.id}" title="Modify name, phone number, role and permissions"><i class="bi bi-pencil"></i> Edit</button>
            ${toggleActionHtml}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="table table-glass table-glass-hover m-0">
      <thead>
        <tr>
          <th scope="col" style="width: 60px;">Node</th>
          <th scope="col">Full Name / UID</th>
          <th scope="col">Username</th>
          <th scope="col">Email</th>
          <th scope="col">Phone</th>
          <th scope="col">Role</th>
          <th scope="col">Status</th>
          <th scope="col">Registered</th>
          <th scope="col">Last Login</th>
          <th scope="col" class="text-center" style="width: 240px;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;

  // Bind individual row buttons
  bindRowActionButtons();
}

/**
 * Bind dynamically rendered button listeners inside user directory tables
 */
function bindRowActionButtons() {
  const container = document.getElementById("tableContainer");
  if (!container) return;

  // View Profile Action
  container.querySelectorAll("[data-btn-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      const uid = btn.getAttribute("data-btn-view");
      openUserProfileAuditor(uid);
    });
  });

  // Edit User Action
  container.querySelectorAll("[data-btn-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const uid = btn.getAttribute("data-btn-edit");
      openEditUserModal(uid);
    });
  });

  // Suspend Quick Action
  container.querySelectorAll("[data-btn-suspend]").forEach(btn => {
    btn.addEventListener("click", () => {
      const uid = btn.getAttribute("data-btn-suspend");
      executeQuickSuspendState(uid, "suspended");
    });
  });

  // Activate Quick Action
  container.querySelectorAll("[data-btn-activate]").forEach(btn => {
    btn.addEventListener("click", () => {
      const uid = btn.getAttribute("data-btn-activate");
      executeQuickSuspendState(uid, "active");
    });
  });
}

/**
 * Change status between suspended and active immediately with strict authorization checks
 * @param {string} targetUid 
 * @param {string} newStatus 
 */
async function executeQuickSuspendState(targetUid, newStatus) {
  // Prevent self suspension lockout
  if (targetUid === auth.currentUser?.uid) {
    Toast.show("Security Restriction: You are forbidden from modifying or locking your own administrative account.", { type: "danger" });
    return;
  }

  const userRecord = usersList.find(u => u.id === targetUid);
  if (!userRecord) return;

  // Prevent modifying other admin users to secure access escalation bounds
  if (userRecord.role === "admin" && auth.currentUser?.uid !== targetUid) {
    Toast.show("Privilege Breach Blocked: You do not possess clearance to lock another primary Administrator.", { type: "danger" });
    return;
  }

  const promptText = newStatus === "suspended" 
    ? `Are you sure you want to suspend user ${userRecord.fullName || userRecord.displayName || targetUid}? This will block their active trade operations and market offers.`
    : `Activate account access for user ${userRecord.fullName || userRecord.displayName || targetUid}? This restores active balance movements.`;

  Modal.confirm({
    title: newStatus === "suspended" ? "Suspend Node Authority" : "Re-activate Node Authority",
    body: `<p class="m-0 text-white">${promptText}</p>`,
    confirmText: newStatus === "suspended" ? "Suspend Account" : "Activate Account",
    confirmClass: newStatus === "suspended" ? "btn-danger" : "btn-success",
    onConfirm: async (modal) => {
      const loader = new Loader({ text: `Updating ledger permission to ${newStatus}...` });
      loader.show();
      try {
        const userDocRef = doc(db, "users", targetUid);
        await updateDoc(userDocRef, {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
        Toast.show(`Account state updated successfully to: ${newStatus.toUpperCase()}`, { type: "success" });
      } catch (err) {
        console.error("Failed to alter user status: ", err);
        Toast.show("Failed to update status record due to database authority issues.", { type: "danger" });
      } finally {
        loader.hide();
        modal.close();
      }
    }
  });
}

/**
 * Renders loading skeleton animations before Firestore results arrive
 */
function showTableSkeleton() {
  const container = document.getElementById("tableContainer");
  if (!container) return;

  container.innerHTML = `
    <div class="p-4">
      <div class="d-flex align-items-center gap-3 mb-3">
        <div class="skeleton-bar" style="width: 48px; height: 48px; border-radius: 50%;"></div>
        <div class="flex-grow-1">
          <div class="skeleton-bar mb-2" style="width: 30%;"></div>
          <div class="skeleton-bar" style="width: 15%;"></div>
        </div>
      </div>
      <div class="d-flex align-items-center gap-3 mb-3">
        <div class="skeleton-bar" style="width: 48px; height: 48px; border-radius: 50%;"></div>
        <div class="flex-grow-1">
          <div class="skeleton-bar mb-2" style="width: 45%;"></div>
          <div class="skeleton-bar" style="width: 20%;"></div>
        </div>
      </div>
      <div class="d-flex align-items-center gap-3 mb-3">
        <div class="skeleton-bar" style="width: 48px; height: 48px; border-radius: 50%;"></div>
        <div class="flex-grow-1">
          <div class="skeleton-bar mb-2" style="width: 25%;"></div>
          <div class="skeleton-bar" style="width: 10%;"></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Open unified Profile Auditor Modal with multi-tab structure
 * @param {string} uid 
 */
async function openUserProfileAuditor(uid) {
  const user = usersList.find(u => u.id === uid);
  if (!user) {
    Toast.show("User record matching ID not located in directory cached memory.", { type: "danger" });
    return;
  }

  const modalBody = document.createElement("div");
  modalBody.className = "user-auditor-modal-wrapper";
  modalBody.innerHTML = `
    <div class="row g-4 align-items-center mb-4 pb-3 border-bottom border-secondary border-opacity-10">
      <div class="col-md-auto text-center text-md-start">
        <div class="avatar-wrapper mx-auto" style="width: 72px; height: 72px; border-width: 3px;">
          ${user.photoURL || user.profileImage 
            ? `<img src="${user.photoURL || user.profileImage}" alt="avatar" referrerPolicy="no-referrer" />` 
            : `<span class="fs-4 text-glow-primary text-white fw-bold">${(user.fullName || user.displayName || 'Node').substring(0,2).toUpperCase()}</span>`
          }
        </div>
      </div>
      <div class="col-md">
        <div class="text-center text-md-start">
          <div class="d-flex flex-wrap gap-2 align-items-center justify-content-center justify-content-md-start">
            <h4 class="text-white m-0 text-display fw-bold text-glow-primary">${user.fullName || user.displayName || 'Anonymous'}</h4>
            <span class="badge ${user.role === 'admin' ? 'badge-role-admin' : 'badge-role-user'} text-uppercase text-xxs">${user.role || 'user'}</span>
            <span class="badge badge-active text-uppercase text-xxs" id="modalBadgeStatus">${user.status || 'active'}</span>
          </div>
          <p class="text-muted text-sm m-0 mt-1">Username: <span class="text-white text-mono">@${user.username || 'unknown'}</span> | Email: <span class="text-white">${user.email}</span></p>
          <p class="text-muted text-xxs m-0 mt-1">HFC Secure Account ID: <span class="text-primary text-mono">${user.id}</span></p>
        </div>
      </div>
    </div>

    <!-- Tabbed navigation -->
    <ul class="nav nav-pills modal-tabs mb-4 border-bottom border-secondary border-opacity-10 gap-1" id="profileModalTabs" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" id="modal-tab-basic" data-bs-toggle="pill" data-bs-target="#panel-basic" type="button" role="tab" aria-selected="true">Basic Info</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="modal-tab-wallets" data-bs-toggle="pill" data-bs-target="#panel-wallets" type="button" role="tab" aria-selected="false">Wallets & Coins</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="modal-tab-trades" data-bs-toggle="pill" data-bs-target="#panel-trades" type="button" role="tab" aria-selected="false">Trade History</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="modal-tab-deposits" data-bs-toggle="pill" data-bs-target="#panel-deposits" type="button" role="tab" aria-selected="false">Deposits</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="modal-tab-withdrawals" data-bs-toggle="pill" data-bs-target="#panel-withdrawals" type="button" role="tab" aria-selected="false">Withdrawals</button>
      </li>
    </ul>

    <!-- Tabs Content Panel -->
    <div class="tab-content text-secondary text-sm" id="profileModalPanels" style="min-height: 250px;">
      
      <!-- Panel 1: Basic Information -->
      <div class="tab-pane fade show active" id="panel-basic" role="tabpanel" aria-labelledby="modal-tab-basic">
        <div class="row g-3">
          <div class="col-sm-6">
            <div class="modal-glass-panel">
              <span class="text-muted text-xxs d-block">REGISTRATION STAMPS</span>
              <div class="text-white text-mono text-xs mt-1">
                Joined: ${user.createdAt ? (user.createdAt.seconds ? new Date(user.createdAt.seconds * 1000).toLocaleString() : new Date(user.createdAt).toLocaleString()) : '--/--/--'}
              </div>
              <div class="text-white text-mono text-xs mt-1">
                Last login: ${user.lastLogin ? (user.lastLogin.seconds ? new Date(user.lastLogin.seconds * 1000).toLocaleString() : new Date(user.lastLogin).toLocaleString()) : 'Never'}
              </div>
            </div>
          </div>
          <div class="col-sm-6">
            <div class="modal-glass-panel">
              <span class="text-muted text-xxs d-block">COMMUNICATION & LOCALE</span>
              <div class="text-white text-xs mt-1">Phone: ${user.phone || 'None linked'}</div>
              <div class="text-white text-xs mt-1">Currency: ${user.preferredCurrency || user.currency || 'PKR'}</div>
              <div class="text-white text-xs mt-1">Language preference: ${user.language || 'English'}</div>
            </div>
          </div>
          <div class="col-sm-12">
            <div class="modal-glass-panel d-flex justify-content-between align-items-center">
              <div>
                <span class="text-muted text-xxs d-block">SECURITY INTEGRITY ACTIONS</span>
                <span class="text-white text-xs mt-1 d-block">Prepare administrative triggers for client credentials verification</span>
              </div>
              <button class="btn btn-xs btn-outline-danger" id="modalResetPasswordBtn">Reset Pass Link</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Panel 2: Wallets and Asset Balances -->
      <div class="tab-pane fade" id="panel-wallets" role="tabpanel" aria-labelledby="modal-tab-wallets">
        <div class="text-center p-4 text-muted" id="walletsPanelLoader">
          <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
          <span class="ms-2">Fetching wallet balances...</span>
        </div>
        <div class="table-responsive d-none" id="walletsTableWrapper">
          <table class="table table-dark table-glass table-sm">
            <thead>
              <tr>
                <th>Wallet ID</th>
                <th>Currency</th>
                <th>Chain / Address Address</th>
                <th class="text-end">Balance Sheet Value</th>
              </tr>
            </thead>
            <tbody id="walletsTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Panel 3: Trade History -->
      <div class="tab-pane fade" id="panel-trades" role="tabpanel" aria-labelledby="modal-tab-trades">
        <div class="text-center p-4 text-muted" id="tradesPanelLoader">
          <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
          <span class="ms-2">Auditing trading accounts...</span>
        </div>
        <div class="table-responsive d-none" id="tradesTableWrapper">
          <table class="table table-dark table-glass table-sm">
            <thead>
              <tr>
                <th>Block ID</th>
                <th>Volume</th>
                <th>Coin</th>
                <th>Rate</th>
                <th>Platform Fee</th>
                <th class="text-end">Completion Date</th>
              </tr>
            </thead>
            <tbody id="tradesTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Panel 4: Deposits ledger -->
      <div class="tab-pane fade" id="panel-deposits" role="tabpanel" aria-labelledby="modal-tab-deposits">
        <div class="text-center p-4 text-muted" id="depositsPanelLoader">
          <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
          <span class="ms-2">Reconciling transaction cache...</span>
        </div>
        <div class="table-responsive d-none" id="depositsTableWrapper">
          <table class="table table-dark table-glass table-sm">
            <thead>
              <tr>
                <th>Reference ID</th>
                <th>Funding Gateway</th>
                <th>Gross Volume</th>
                <th>Deposit Status</th>
                <th class="text-end">Timestamp</th>
              </tr>
            </thead>
            <tbody id="depositsTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Panel 5: Withdrawals Queue -->
      <div class="tab-pane fade" id="panel-withdrawals" role="tabpanel" aria-labelledby="modal-tab-withdrawals">
        <div class="text-center p-4 text-muted" id="withdrawalsPanelLoader">
          <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
          <span class="ms-2">Reconciling settlements...</span>
        </div>
        <div class="table-responsive d-none" id="withdrawalsTableWrapper">
          <table class="table table-dark table-glass table-sm">
            <thead>
              <tr>
                <th>Dispatch ID</th>
                <th>Settlement Method</th>
                <th>Payout Net</th>
                <th>Fee Deducted</th>
                <th>Verification State</th>
                <th class="text-end">Authorized Date</th>
              </tr>
            </thead>
            <tbody id="withdrawalsTableBody"></tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  const profileModal = new Modal({
    title: "Comprehensive Security Profile Auditor",
    body: modalBody,
    size: "lg",
    buttons: [
      { label: "Close Auditor Panel", class: "btn-hfc-secondary", onClick: (modal) => modal.destroy() }
    ]
  });

  profileModal.open();

  // Handle password reset action within modal
  const resetBtn = document.getElementById("modalResetPasswordBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      Toast.show(`Reset password link prepared. In a production cloud, this sends an identity reset validation to: ${user.email}`, { type: "info" });
    });
  }

  // Trigger Dynamic Loading on other tabs when opened/viewed
  loadUserWallets(uid);
  loadUserTrades(uid);
  loadUserDeposits(uid);
  loadUserWithdrawals(uid);
}

/**
 * Fetch and render user wallets balances from "/wallets" collection where ownerId == uid
 * @param {string} uid 
 */
async function loadUserWallets(uid) {
  const loader = document.getElementById("walletsPanelLoader");
  const wrapper = document.getElementById("walletsTableWrapper");
  const tbody = document.getElementById("walletsTableBody");
  if (!tbody) return;

  try {
    const qWallets = query(collection(db, "wallets"), where("ownerId", "==", uid));
    const snap = await getDocs(qWallets);
    
    let rowsHtml = "";
    snap.forEach(docSnap => {
      const w = docSnap.data();
      const balStr = Number(w.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
      rowsHtml += `
        <tr class="text-mono">
          <td class="text-secondary text-xs">${docSnap.id.substring(0, 10)}...</td>
          <td class="text-white fw-bold">${w.currency}</td>
          <td class="text-muted text-xxs">${w.address || 'Internal exchange link'}</td>
          <td class="text-end text-success fw-bold">${balStr} ${w.currency}</td>
        </tr>
      `;
    });

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No asset balances found.</td></tr>`;
    } else {
      tbody.innerHTML = rowsHtml;
    }

    if (loader) loader.classList.add("d-none");
    if (wrapper) wrapper.classList.remove("d-none");
  } catch (err) {
    console.error("Failed to load user wallets: ", err);
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-3">Error reading balances database.</td></tr>`;
    if (loader) loader.classList.add("d-none");
    if (wrapper) wrapper.classList.remove("d-none");
  }
}

/**
 * Fetch and render completed trades for this specific user
 * @param {string} uid 
 */
async function loadUserTrades(uid) {
  const loader = document.getElementById("tradesPanelLoader");
  const wrapper = document.getElementById("tradesTableWrapper");
  const tbody = document.getElementById("tradesTableBody");
  if (!tbody) return;

  try {
    // Collect trades where user is buyer OR seller
    const qBuyer = query(collection(db, "trades"), where("buyerUid", "==", uid));
    const qSeller = query(collection(db, "trades"), where("sellerUid", "==", uid));
    
    const [buyerSnap, sellerSnap] = await Promise.all([getDocs(qBuyer), getDocs(qSeller)]);
    
    const mergedTrades = [];
    buyerSnap.forEach(snap => mergedTrades.push({ id: snap.id, role: "Buyer", ...snap.data() }));
    sellerSnap.forEach(snap => mergedTrades.push({ id: snap.id, role: "Seller", ...snap.data() }));

    // Sort descending by completion time
    mergedTrades.sort((a,b) => {
      const tA = a.completedAt?.seconds || 0;
      const tB = b.completedAt?.seconds || 0;
      return tB - tA;
    });

    let rowsHtml = "";
    mergedTrades.forEach(t => {
      const volStr = Number(t.quantity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
      const priceStr = Number(t.price || 0).toLocaleString();
      const feeStr = Number((t.buyerFee || 0) + (t.sellerFee || 0)).toLocaleString();
      const compDate = t.completedAt ? new Date(t.completedAt.seconds * 1000).toLocaleDateString() : "--/--/--";

      rowsHtml += `
        <tr class="text-mono">
          <td class="text-secondary text-xs" title="${t.id}">${t.id.substring(0, 8)}... <span class="badge ${t.role === 'Buyer' ? 'bg-primary' : 'bg-warning'} text-xxs">${t.role}</span></td>
          <td class="text-white">${volStr}</td>
          <td class="text-accent fw-bold">${t.coin || "HFC"}</td>
          <td class="text-white">${priceStr} PKR</td>
          <td class="text-success">${feeStr} PKR</td>
          <td class="text-end text-muted text-xs">${compDate}</td>
        </tr>
      `;
    });

    if (mergedTrades.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No trade history recorded for this node.</td></tr>`;
    } else {
      tbody.innerHTML = rowsHtml;
    }

    if (loader) loader.classList.add("d-none");
    if (wrapper) wrapper.classList.remove("d-none");
  } catch (err) {
    console.error("Failed to load user trades: ", err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">Error reading trade ledger data.</td></tr>`;
    if (loader) loader.classList.add("d-none");
    if (wrapper) wrapper.classList.remove("d-none");
  }
}

/**
 * Fetch and render deposits ledger history for this user
 * @param {string} uid 
 */
async function loadUserDeposits(uid) {
  const loader = document.getElementById("depositsPanelLoader");
  const wrapper = document.getElementById("depositsTableWrapper");
  const tbody = document.getElementById("depositsTableBody");
  if (!tbody) return;

  try {
    const qDeposits = query(collection(db, "deposits"), where("userId", "==", uid));
    const snap = await getDocs(qDeposits);

    let rowsHtml = "";
    snap.forEach(docSnap => {
      const d = docSnap.data();
      const grossStr = Number(d.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
      const depDate = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString() : "--/--/--";
      
      let statusBadge = "badge bg-secondary text-xxs";
      if (d.status === "approved") statusBadge = "badge bg-success text-xxs";
      else if (d.status === "rejected") statusBadge = "badge bg-danger text-xxs";
      else if (d.status === "pending") statusBadge = "badge bg-warning text-dark text-xxs";

      rowsHtml += `
        <tr class="text-mono">
          <td class="text-secondary text-xs" title="${docSnap.id}">${docSnap.id.substring(0, 10)}...</td>
          <td class="text-white">${d.method || "Bank Transfer"}</td>
          <td class="text-white fw-bold">${grossStr} PKR</td>
          <td><span class="${statusBadge} text-uppercase">${d.status || 'pending'}</span></td>
          <td class="text-end text-muted text-xs">${depDate}</td>
        </tr>
      `;
    });

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No deposits logged.</td></tr>`;
    } else {
      tbody.innerHTML = rowsHtml;
    }

    if (loader) loader.classList.add("d-none");
    if (wrapper) wrapper.classList.remove("d-none");
  } catch (err) {
    console.error("Failed to load user deposits: ", err);
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">Error reading deposit records database.</td></tr>`;
    if (loader) loader.classList.add("d-none");
    if (wrapper) wrapper.classList.remove("d-none");
  }
}

/**
 * Fetch and render withdrawals history list for this user
 * @param {string} uid 
 */
async function loadUserWithdrawals(uid) {
  const loader = document.getElementById("withdrawalsPanelLoader");
  const wrapper = document.getElementById("withdrawalsTableWrapper");
  const tbody = document.getElementById("withdrawalsTableBody");
  if (!tbody) return;

  try {
    const qWithdrawals = query(collection(db, "withdrawals"), where("userId", "==", uid));
    const snap = await getDocs(qWithdrawals);

    let rowsHtml = "";
    snap.forEach(docSnap => {
      const w = docSnap.data();
      const netStr = Number(w.netAmount || w.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
      const feeStr = Number(w.processingFee || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
      const witDate = w.createdAt ? new Date(w.createdAt.seconds * 1000).toLocaleString() : "--/--/--";

      let statusBadge = "badge bg-secondary text-xxs";
      if (w.status === "completed" || w.status === "approved") statusBadge = "badge bg-success text-xxs";
      else if (w.status === "failed" || w.status === "rejected") statusBadge = "badge bg-danger text-xxs";
      else if (w.status === "pending") statusBadge = "badge bg-warning text-dark text-xxs";

      rowsHtml += `
        <tr class="text-mono">
          <td class="text-secondary text-xs" title="${docSnap.id}">${docSnap.id.substring(0, 10)}...</td>
          <td class="text-white">${w.method || "EasyPaisa / JazzCash"}</td>
          <td class="text-white fw-bold">${netStr} PKR</td>
          <td class="text-danger">${feeStr} PKR</td>
          <td><span class="${statusBadge} text-uppercase">${w.status || 'pending'}</span></td>
          <td class="text-end text-muted text-xs">${witDate}</td>
        </tr>
      `;
    });

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No withdrawals logged.</td></tr>`;
    } else {
      tbody.innerHTML = rowsHtml;
    }

    if (loader) loader.classList.add("d-none");
    if (wrapper) wrapper.classList.remove("d-none");
  } catch (err) {
    console.error("Failed to load user withdrawals: ", err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">Error reading withdrawal queue database.</td></tr>`;
    if (loader) loader.classList.add("d-none");
    if (wrapper) wrapper.classList.remove("d-none");
  }
}

/**
 * Open modal to allow modifying user record fields safely
 * @param {string} uid 
 */
function openEditUserModal(uid) {
  const user = usersList.find(u => u.id === uid);
  if (!user) {
    Toast.show("Selected node is not cached in local thread.", { type: "danger" });
    return;
  }

  const isSelf = uid === auth.currentUser?.uid;

  const modalForm = document.createElement("form");
  modalForm.id = "editUserForm";
  modalForm.className = "row g-3 text-secondary text-sm";
  modalForm.innerHTML = `
    <!-- Read only static information fields -->
    <div class="col-md-6">
      <label class="form-label text-muted text-xxs text-uppercase">HFC Account UID (System Fixed)</label>
      <input type="text" class="form-control form-control-sm bg-dark text-muted text-mono text-xs border-secondary border-opacity-10" value="${user.id}" disabled />
    </div>
    <div class="col-md-6">
      <label class="form-label text-muted text-xxs text-uppercase">Email Address (Auth Fixed)</label>
      <input type="text" class="form-control form-control-sm bg-dark text-muted text-mono text-xs border-secondary border-opacity-10" value="${user.email}" disabled />
    </div>

    <!-- Modifiable Information Fields -->
    <div class="col-md-6">
      <label for="editFullName" class="form-label text-muted text-xxs text-uppercase">Full Profile Name</label>
      <input type="text" id="editFullName" class="form-control form-control-sm input-glass text-xs" value="${user.fullName || user.displayName || ''}" required />
    </div>
    <div class="col-md-6">
      <label for="editPhone" class="form-label text-muted text-xxs text-uppercase">Phone Number</label>
      <input type="text" id="editPhone" class="form-control form-control-sm input-glass text-xs" value="${user.phone || ''}" />
    </div>

    <!-- Status restriction level -->
    <div class="col-md-6">
      <label for="editStatus" class="form-label text-muted text-xxs text-uppercase">Access Permission State</label>
      <select id="editStatus" class="form-select form-select-sm input-glass text-xs" ${isSelf ? 'disabled' : ''}>
        <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active / Authorized</option>
        <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option>
        <option value="banned" ${user.status === 'banned' ? 'selected' : ''}>Banned (Banned Future Schema)</option>
        <option value="pending_kyc" ${user.status === 'pending_kyc' ? 'selected' : ''}>Pending KYC Verification</option>
        <option value="verified" ${user.status === 'verified' ? 'selected' : ''}>Verified Account</option>
      </select>
      ${isSelf ? '<span class="text-danger text-xxs">Lockout Prevention: Cannot suspend yourself.</span>' : ''}
    </div>

    <!-- Role assignment level -->
    <div class="col-md-6">
      <label for="editRole" class="form-label text-muted text-xxs text-uppercase">System Access Role</label>
      <select id="editRole" class="form-select form-select-sm input-glass text-xs" ${isSelf ? 'disabled' : ''}>
        <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
        <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Moderator (Future Support)</option>
        <option value="finance" ${user.role === 'finance' ? 'selected' : ''}>Finance (Future Support)</option>
        <option value="support" ${user.role === 'support' ? 'selected' : ''}>Support (Future Support)</option>
        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin / Superuser</option>
      </select>
      ${isSelf ? '<span class="text-danger text-xxs">Privilege Escaping: Cannot demote yourself.</span>' : ''}
    </div>

    <!-- Image Selection Placeholder Structure -->
    <div class="col-12 mt-3 pt-2 border-top border-secondary border-opacity-10">
      <span class="text-muted text-xxs d-block text-uppercase mb-2">Avatar Profile Image Link</span>
      <div class="d-flex align-items-center gap-3">
        <div class="avatar-wrapper" style="width: 50px; height: 50px;">
          ${user.photoURL || user.profileImage 
            ? `<img src="${user.photoURL || user.profileImage}" alt="avatar" />` 
            : `<span class="text-glow-primary text-white text-xs fw-bold">${(user.fullName || user.displayName || 'Node').substring(0,2).toUpperCase()}</span>`
          }
        </div>
        <input type="text" class="form-control form-control-sm bg-dark text-muted text-xs border-secondary border-opacity-10 flex-grow-1" value="${user.photoURL || user.profileImage || 'No external URL linked'}" disabled />
        <span class="badge bg-secondary text-xxs">Read Only URL</span>
      </div>
    </div>
  `;

  const editModal = new Modal({
    title: `Modify Node Specifications: @${user.username || 'user'}`,
    body: modalForm,
    size: "lg",
    buttons: [
      { 
        label: "Cancel Modifications", 
        class: "btn-hfc-secondary", 
        onClick: (modal) => modal.destroy() 
      },
      { 
        label: "Apply Server Updates", 
        class: "btn-hfc-primary", 
        onClick: async (modal) => {
          const editName = document.getElementById("editFullName").value.trim();
          const editPhone = document.getElementById("editPhone").value.trim();
          const editStatus = document.getElementById("editStatus") ? document.getElementById("editStatus").value : user.status;
          const editRole = document.getElementById("editRole") ? document.getElementById("editRole").value : user.role;

          if (!editName) {
            Toast.show("Please enter a valid profile display name.", { type: "danger" });
            return;
          }

          // Safety guard again
          if (isSelf) {
            if (editStatus !== "active" && editStatus !== "verified") {
              Toast.show("Security Shield: You cannot suspend your own administrative session.", { type: "danger" });
              return;
            }
            if (editRole !== "admin") {
              Toast.show("Security Shield: You are forbidden from removing your Admin privileges.", { type: "danger" });
              return;
            }
          }

          const loader = new Loader({ text: "Publishing user profile updates to core database..." });
          loader.show();

          try {
            const userDocRef = doc(db, "users", uid);
            await updateDoc(userDocRef, {
              fullName: editName,
              displayName: editName,
              phone: editPhone,
              status: editStatus,
              role: editRole,
              updatedAt: serverTimestamp()
            });

            Toast.show("Profile record published and synchronized successfully.", { type: "success" });
            modal.destroy();
          } catch (err) {
            console.error("Failed to update user profile in Firestore: ", err);
            Toast.show("Failed to update document metadata. Database authority rejected the request.", { type: "danger" });
          } finally {
            loader.hide();
          }
        } 
      }
    ]
  });

  editModal.open();
}

/**
 * Clean export registry database to standard Excel-compliant CSV format
 */
function exportRegistryToCSV() {
  if (usersList.length === 0) {
    Toast.show("Registry currently empty. Download request skipped.", { type: "info" });
    return;
  }

  const headers = ["Account_UID", "Full_Name", "Username", "Email_Address", "Phone_Number", "Access_Role", "Account_Status", "Registration_Date"];
  const rows = usersList.map(u => {
    const regDate = u.createdAt ? (u.createdAt.seconds ? new Date(u.createdAt.seconds * 1000).toISOString() : new Date(u.createdAt).toISOString()) : "";
    return [
      u.id || "",
      u.fullName || u.displayName || "",
      u.username || "",
      u.email || "",
      u.phone || "",
      u.role || "user",
      u.status || "active",
      regDate
    ].map(field => `"${String(field).replace(/"/g, '""')}"`); // Quote and escape fields safely
  });

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `HFC_User_Registry_Export_${new Date().toISOString().substring(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  Toast.show("Secure CSV download of registry records triggered successfully.", { type: "success" });
}
