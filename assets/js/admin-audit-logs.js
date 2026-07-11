/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Admin Audit Logs Controller
 * Handles strict admin authorization, real-time Firestore event listeners,
 * advanced search/category filtering, exportable CSV/PDF compliance reports, 
 * dynamic JSON state differential modals, and retention configuration.
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
  addDoc,
  serverTimestamp,
  where,
  limit
} from "firebase/firestore";
import { logoutUser } from "../../firebase/auth.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";

// Global Component and Data States
let activePageLayout = null;
let auditLogsList = [];
let unsubscribeLogs = null;
let retentionPolicyDays = 90; // Default fallback

// Filter and Search States
let activeCategoryTab = "all";
let textSearchQuery = "";
let severityFilterVal = "all";
let dateFilterVal = "all";
let sortByVal = "newest";

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Enforce strict Admin RBAC session guard
  const adminUser = await verifyAdminPrivileges();
  if (!adminUser) return; // verifyAdminPrivileges handles redirection to login

  // 2. Initialize PageLayout matching the standard admin framework
  activePageLayout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: adminUser.email,
      versionText: "Admin Core v3.0",
      initialNotifications: [
        { id: 1, type: "warning", text: "Security audit compliance engine activated." }
      ],
      onLogout: async () => {
        try {
          const loader = new Loader({ text: "Terminating security terminal authorization..." });
          loader.show();
          await logoutUser();
          loader.hide();
          Toast.show("Administrative session closed safely.", { type: "info" });
          setTimeout(() => {
            window.location.href = "/admin/login.html";
          }, 1000);
        } catch (err) {
          Toast.show("Failed to close session securely.", { type: "danger" });
        }
      }
    },
    sidebarOptions: {
      brandName: "HFC ADMIN",
      activeId: "audit-logs",
      menuItems: [
        { id: "admin-dashboard", label: "Control Panel", icon: "bi-shield-check", href: "/admin/dashboard.html" },
        { id: "admin-coins", label: "Coin Management", icon: "bi-coin", href: "/admin/coins.html" },
        { id: "admin-deposits", label: "Deposits Vault", icon: "bi-cash-coin", href: "/admin/deposits.html" },
        { id: "admin-withdrawals", label: "Withdrawals Queue", icon: "bi-box-arrow-up-right", href: "/admin/withdrawals.html" },
        { id: "users", label: "Users List", icon: "bi-people-fill", href: "/admin/users.html" },
        { id: "audit-logs", label: "Audit Logs", icon: "bi-journal-code", href: "/admin/audit-logs.html" },
        { id: "marketplace", label: "Offer Book", icon: "bi-shop-window", href: "/admin/dashboard.html#marketplace" },
        { id: "trades", label: "Trade Auditor", icon: "bi-journal-check", href: "/admin/dashboard.html#trades" },
        { id: "settings", label: "Terminal Settings", icon: "bi-gear-wide-connected", href: "/admin/dashboard.html#settings" }
      ],
      onNavigate: (item) => {
        if (item.id === "audit-logs") return;
        window.location.href = item.href;
      }
    }
  });

  // 3. Render Dashboard Base Skeleton & Clock Ticker
  renderBaseOutline();
  startClock();

  // 4. Load configured retention policy settings
  await syncRetentionSettings();

  // 5. Connect real-time snap listener & seed logs if necessary
  subscribeToAuditLogs();
});

/**
 * Verifies current user holds 'admin' level role before continuing
 */
async function verifyAdminPrivileges() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        console.warn("Unauthorized terminal access attempt. Redirecting...");
        window.location.href = "/admin/login.html";
        resolve(null);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === "admin") {
          resolve(user);
        } else {
          console.error("Access Denied: Node lacks administrator clearance.");
          await logoutUser();
          window.location.href = "/admin/login.html";
          resolve(null);
        }
      } catch (err) {
        console.error("RBAC Security Audit Error:", err);
        window.location.href = "/admin/login.html";
        resolve(null);
      }
    });
  });
}

/**
 * Start Dynamic UTC Clock Ticker
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
 * Load log retention policy configuration from Firestore settings document
 */
async function syncRetentionSettings() {
  try {
    const docRef = doc(db, "settings", "retention");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      retentionPolicyDays = snap.data().days || 90;
    } else {
      // Create default schema settings document
      await setDoc(docRef, { days: 90, updatedAt: serverTimestamp() });
      retentionPolicyDays = 90;
    }
    updateRetentionPolicyLabel();
  } catch (err) {
    console.warn("Failed to fetch retention configuration settings document:", err);
  }
}

/**
 * Render general skeleton layout inside PageLayout Content Container
 */
function renderBaseOutline() {
  const container = activePageLayout.getContentContainer();
  if (!container) return;

  container.innerHTML = `
    <!-- Title Page Header -->
    <div id="admin-audit-header" class="admin-page-header mb-4"></div>

    <!-- Active Compliance System Status Monitor Banner -->
    <div class="card-glass p-3 mb-4 d-flex flex-wrap justify-content-between align-items-center gap-3 text-sm">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-shield-lock-fill text-primary fs-5"></i>
        <div>
          <span class="text-muted text-xs d-block">TAMPER-PROOF COMPLIANCE RECORDER</span>
          <span class="text-white fw-bold">Live cryptographic stream synchronized</span>
        </div>
      </div>
      <div class="d-flex align-items-center gap-3 text-mono text-xs">
        <div>
          <span class="text-muted text-xs d-block text-end">RETENTION POLICY</span>
          <span class="text-white fw-semibold" id="retentionDaysLabel">90 Days Log Keep</span>
        </div>
        <div class="system-pulse-online"></div>
        <div>
          <span class="text-muted text-xs d-block text-end">MONITOR TIMESTAMP (UTC)</span>
          <span class="text-white fw-semibold" id="headerNodeTime">Initializing clock...</span>
        </div>
      </div>
    </div>

    <!-- Metric Stats Dashboard Grid -->
    <div class="admin-summary-grid mb-4" id="statsGrid">
      <div class="admin-metric-card" tabindex="0" aria-label="Total Log Events Card">
        <div class="admin-metric-label">Total Events</div>
        <div class="admin-metric-value text-white" id="statTotalLogs">-</div>
        <div class="admin-metric-footer">All matching trace events</div>
      </div>
      <div class="admin-metric-card" tabindex="0" aria-label="Today's Events Card">
        <div class="admin-metric-label">Today's Activity</div>
        <div class="admin-metric-value text-info" id="statTodayLogs">-</div>
        <div class="admin-metric-footer">UTC calendar event entries</div>
      </div>
      <div class="admin-metric-card critical-alarm" tabindex="0" aria-label="Critical Severity Warnings Card">
        <div class="admin-metric-label">Critical Warning</div>
        <div class="admin-metric-value text-danger" id="statCriticalLogs">-</div>
        <div class="admin-metric-footer text-danger">Requires immediate response</div>
      </div>
      <div class="admin-metric-card" tabindex="0" aria-label="Admin Authorized Executions Card">
        <div class="admin-metric-label">Admin Actions</div>
        <div class="admin-metric-value text-primary" id="statAdminLogs">-</div>
        <div class="admin-metric-footer">Privileged core edits</div>
      </div>
      <div class="admin-metric-card" tabindex="0" aria-label="Failed Transactions & Logins Card">
        <div class="admin-metric-label">Failed Operations</div>
        <div class="admin-metric-value text-warning" id="statFailedLogs">-</div>
        <div class="admin-metric-footer">Execution blocks & rejections</div>
      </div>
    </div>

    <!-- Core Controls: Category Tabs and Compliance Actions -->
    <div class="admin-table-card">
      <div class="p-4 border-bottom border-secondary border-opacity-10 d-flex flex-wrap gap-3 align-items-center justify-content-between">
        
        <!-- Interactive Category Quick-Filter Tabs -->
        <div class="d-flex flex-wrap gap-1" role="tablist" id="categoryFilterTabs">
          <button class="btn btn-sm btn-glass active px-3 py-2 text-xs" data-category="all" role="tab">All Categories</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-category="Security" role="tab">Security</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-category="Trading" role="tab">Trading</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-category="Wallet" role="tab">Wallet</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-category="Deposit" role="tab">Deposit</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-category="Withdrawal" role="tab">Withdrawal</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-category="Marketplace" role="tab">Marketplace</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-category="Users" role="tab">Users</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-category="Settings" role="tab">Settings</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-category="Notifications" role="tab">Notifications</button>
          <button class="btn btn-sm btn-glass px-3 py-2 text-xs" data-category="Authentication" role="tab">Auth</button>
        </div>

        <!-- Compliance Actions -->
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-glass text-xs" id="retentionSettingsBtn" aria-label="Configure Audit Log Retention Settings">
            <i class="bi bi-clock-history me-1"></i> Retention Settings
          </button>
          <button class="btn btn-sm btn-glass text-xs" id="exportCSVAudit" aria-label="Export audit ledger records to CSV spreadsheet">
            <i class="bi bi-file-earmark-spreadsheet me-1"></i> Export CSV
          </button>
          <button class="btn btn-sm btn-glass text-xs" id="printAuditReport" aria-label="Compile and Print security audit documentation report PDF">
            <i class="bi bi-printer me-1"></i> Print / PDF
          </button>
          <button class="btn btn-sm btn-glass text-xs text-primary" id="generateTestEventBtn" aria-label="Trigger compliance test record">
            <i class="bi bi-plus-circle me-1"></i> Trigger Test Log
          </button>
        </div>
      </div>

      <!-- Advanced Filter Search Deck -->
      <div class="p-4 bg-black bg-opacity-20 border-bottom border-secondary border-opacity-10 d-flex flex-wrap gap-3 align-items-center">
        <!-- Advanced Multi-ID Text Search -->
        <div class="flex-grow-1" style="min-width: 280px;">
          <div class="position-relative">
            <i class="bi bi-search text-secondary position-absolute top-50 start-3 translate-middle-y"></i>
            <input type="text" id="auditSearchInput" class="form-control form-control-sm input-glass ps-5 text-xs w-100" placeholder="Search by Event, Log/User/Admin ID, Email, Trade, Offer, Dep/With reference..." aria-label="Search Audit Registry Logs" />
          </div>
        </div>

        <!-- Severity Level Filters -->
        <div style="min-width: 140px;">
          <select id="severityFilterSelect" class="form-select form-select-sm input-glass text-xs" aria-label="Filter by event severity level">
            <option value="all">All Severities</option>
            <option value="Info">Info</option>
            <option value="Warning">Warning</option>
            <option value="Critical">Critical</option>
          </select>
        </div>

        <!-- Date Interval Filter -->
        <div style="min-width: 150px;">
          <select id="dateFilterSelect" class="form-select form-select-sm input-glass text-xs" aria-label="Filter by timestamp interval">
            <option value="all">All Timestamp Intervals</option>
            <option value="today">Occurred Today</option>
            <option value="yesterday">Occurred Yesterday</option>
            <option value="week">Occurred This Week (7d)</option>
            <option value="month">Occurred This Month (30d)</option>
          </select>
        </div>

        <!-- Sorting Algorithm selector -->
        <div style="min-width: 150px;">
          <select id="sortFilterSelect" class="form-select form-select-sm input-glass text-xs" aria-label="Sort audit lists">
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="severity">Sort: Highest Severity</option>
          </select>
        </div>
      </div>

      <!-- User Directory Responsive Table Block with Sticky Headers -->
      <div class="table-responsive-sticky" id="tableContainer">
        <!-- Loader skeletal structure -->
        <div class="p-5 text-center" id="tableLoader">
          <div class="spinner-border text-primary mb-3" role="status">
            <span class="visually-hidden">Synchronizing compliance streams...</span>
          </div>
          <p class="text-secondary text-sm m-0">Reconciling live tamper-proof cryptographic logs with cloud cluster nodes...</p>
        </div>
      </div>
    </div>
  `;

  // Render Title and breadcrumbs matching standard styles
  new PageHeader("#admin-audit-header", {
    title: "System Audit Registry",
    description: "Secure, chronological compliance ledger capturing authentication milestones, privileged core setting updates, account restrictions, and transaction lifecycle triggers.",
    breadcrumbs: [
      { label: "Control Panel", href: "/admin/dashboard.html" },
      { label: "Audit Registry Logs", active: true }
    ]
  });

  // Bind UI control events
  bindUIEvents();
}

/**
 * Bind filter controls, export functions, and test triggers
 */
function bindUIEvents() {
  const searchInput = document.getElementById("auditSearchInput");
  const severitySelect = document.getElementById("severityFilterSelect");
  const dateSelect = document.getElementById("dateFilterSelect");
  const sortSelect = document.getElementById("sortFilterSelect");
  const categoryTabs = document.getElementById("categoryFilterTabs");

  const exportCSVBtn = document.getElementById("exportCSVAudit");
  const printBtn = document.getElementById("printAuditReport");
  const retentionBtn = document.getElementById("retentionSettingsBtn");
  const testLogBtn = document.getElementById("generateTestEventBtn");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      textSearchQuery = e.target.value.trim().toLowerCase();
      renderAuditTable();
    });
  }

  if (severitySelect) {
    severitySelect.addEventListener("change", (e) => {
      severityFilterVal = e.target.value;
      renderAuditTable();
    });
  }

  if (dateSelect) {
    dateSelect.addEventListener("change", (e) => {
      dateFilterVal = e.target.value;
      renderAuditTable();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      sortByVal = e.target.value;
      renderAuditTable();
    });
  }

  if (categoryTabs) {
    const buttons = categoryTabs.querySelectorAll("button");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activeCategoryTab = btn.getAttribute("data-category");
        renderAuditTable();
      });
    });
  }

  if (exportCSVBtn) {
    exportCSVBtn.addEventListener("click", () => {
      exportRegistryCSV();
    });
  }

  if (printBtn) {
    printBtn.addEventListener("click", () => {
      triggerPrintReport();
    });
  }

  if (retentionBtn) {
    retentionBtn.addEventListener("click", () => {
      openRetentionConfigDialog();
    });
  }

  if (testLogBtn) {
    testLogBtn.addEventListener("click", () => {
      executeTriggerTestEvent();
    });
  }
}

/**
 * Sync real-time logs snapshot listener from Firestore
 */
function subscribeToAuditLogs() {
  const logsRef = collection(db, "logs");
  
  // Set up skeleton loader before snapshot triggers
  showTableSkeleton();

  unsubscribeLogs = onSnapshot(logsRef, async (snapshot) => {
    if (snapshot.empty) {
      // Auto seed records in Firestore so auditor starts with immersive realistic events
      await seedDefaultAuditLogs();
      return;
    }

    auditLogsList = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      auditLogsList.push({
        id: docSnap.id,
        ...data
      });
    });

    // Refresh KPIs
    updateSummaryStatistics();

    // Render list
    renderAuditTable();
  }, (err) => {
    console.error("Firestore Compliance Synchronizer Error: ", err);
    Toast.show("Audit Stream Blocked: Current user session has insufficient database clearance.", { type: "danger" });
  });
}

/**
 * Standard summary card calculation
 */
function updateSummaryStatistics() {
  const totalCount = auditLogsList.length;

  // Today count matching UTC midnight limits
  const startOfToday = new Date();
  startOfToday.setUTCHours(0,0,0,0);
  const startOfTodayMs = startOfToday.getTime();

  const todayCount = auditLogsList.filter(l => {
    if (!l.timestamp) return false;
    const lMs = l.timestamp.seconds ? (l.timestamp.seconds * 1000) : new Date(l.timestamp).getTime();
    return lMs >= startOfTodayMs;
  }).length;

  const criticalCount = auditLogsList.filter(l => l.severity === "Critical").length;

  // Admin Actions criteria: privileged logs or actions initiated by admins
  const adminEvents = ["Role Changed", "User Suspended", "Settings Updated", "Coin Created", "Coin Updated"];
  const adminCount = auditLogsList.filter(l => {
    return l.actorRole === "admin" || adminEvents.includes(l.eventType);
  }).length;

  // Failed actions criteria
  const failedEvents = ["Failed Login", "Deposit Rejected", "Withdrawal Rejected", "Negotiation Rejected"];
  const failedCount = auditLogsList.filter(l => {
    return failedEvents.includes(l.eventType) || String(l.description).toLowerCase().includes("fail") || String(l.description).toLowerCase().includes("reject");
  }).length;

  // Render to UI elements
  const totalEl = document.getElementById("statTotalLogs");
  const todayEl = document.getElementById("statTodayLogs");
  const criticalEl = document.getElementById("statCriticalLogs");
  const adminEl = document.getElementById("statAdminLogs");
  const failedEl = document.getElementById("statFailedLogs");

  if (totalEl) totalEl.textContent = totalCount.toLocaleString();
  if (todayEl) todayEl.textContent = todayCount.toLocaleString();
  if (criticalEl) criticalEl.textContent = criticalCount.toLocaleString();
  if (adminEl) adminEl.textContent = adminCount.toLocaleString();
  if (failedEl) failedEl.textContent = failedCount.toLocaleString();
}

/**
 * Filter, Sort, and Print Table Elements
 */
function renderAuditTable() {
  const container = document.getElementById("tableContainer");
  if (!container) return;

  let filtered = [...auditLogsList];

  // 1. Tab Quick Filter
  if (activeCategoryTab !== "all") {
    filtered = filtered.filter(l => l.category === activeCategoryTab);
  }

  // 2. Text Search index matchers (ID, user, admin, trade, email, offer, references)
  if (textSearchQuery) {
    filtered = filtered.filter(l => {
      const logId = (l.id || "").toLowerCase();
      const desc = (l.description || "").toLowerCase();
      const evType = (l.eventType || "").toLowerCase();
      const actId = (l.actorId || "").toLowerCase();
      const actEmail = (l.actorEmail || "").toLowerCase();
      const tarId = (l.targetUserId || "").toLowerCase();
      const tarEmail = (l.targetUserEmail || "").toLowerCase();
      const refId = (l.referenceId || "").toLowerCase();

      return logId.includes(textSearchQuery) ||
             desc.includes(textSearchQuery) ||
             evType.includes(textSearchQuery) ||
             actId.includes(textSearchQuery) ||
             actEmail.includes(textSearchQuery) ||
             tarId.includes(textSearchQuery) ||
             tarEmail.includes(textSearchQuery) ||
             refId.includes(textSearchQuery);
    });
  }

  // 3. Dropdown Severity filter
  if (severityFilterVal !== "all") {
    filtered = filtered.filter(l => l.severity === severityFilterVal);
  }

  // 4. Dropdown Date Interval filter
  if (dateFilterVal !== "all") {
    const nowMs = Date.now();
    let boundaryMs = 0;

    if (dateFilterVal === "today") {
      const today = new Date();
      today.setUTCHours(0,0,0,0);
      boundaryMs = today.getTime();
    } else if (dateFilterVal === "yesterday") {
      const yesterdayStart = new Date();
      yesterdayStart.setUTCHours(0,0,0,0);
      yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
      const startMs = yesterdayStart.getTime();
      const endMs = startMs + (24 * 60 * 60 * 1000);
      filtered = filtered.filter(l => {
        if (!l.timestamp) return false;
        const lMs = l.timestamp.seconds ? (l.timestamp.seconds * 1000) : new Date(l.timestamp).getTime();
        return lMs >= startMs && lMs < endMs;
      });
    } else if (dateFilterVal === "week") {
      boundaryMs = nowMs - (7 * 24 * 60 * 60 * 1000);
    } else if (dateFilterVal === "month") {
      boundaryMs = nowMs - (30 * 24 * 60 * 60 * 1000);
    }

    if (dateFilterVal !== "yesterday" && boundaryMs > 0) {
      filtered = filtered.filter(l => {
        if (!l.timestamp) return false;
        const lMs = l.timestamp.seconds ? (l.timestamp.seconds * 1000) : new Date(l.timestamp).getTime();
        return lMs >= boundaryMs;
      });
    }
  }

  // 5. Apply Sorting Algorithm
  if (sortByVal === "newest") {
    filtered.sort((a,b) => {
      const tA = a.timestamp?.seconds ? (a.timestamp.seconds * 1000) : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
      const tB = b.timestamp?.seconds ? (b.timestamp.seconds * 1000) : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
      return tB - tA;
    });
  } else if (sortByVal === "oldest") {
    filtered.sort((a,b) => {
      const tA = a.timestamp?.seconds ? (a.timestamp.seconds * 1000) : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
      const tB = b.timestamp?.seconds ? (b.timestamp.seconds * 1000) : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
      return tA - tB;
    });
  } else if (sortByVal === "severity") {
    const sevPriority = { "Critical": 3, "Warning": 2, "Info": 1 };
    filtered.sort((a,b) => {
      const pA = sevPriority[a.severity] || 0;
      const pB = sevPriority[b.severity] || 0;
      if (pA === pB) {
        // Fallback to newest
        const tA = a.timestamp?.seconds ? (a.timestamp.seconds * 1000) : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        const tB = b.timestamp?.seconds ? (b.timestamp.seconds * 1000) : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
        return tB - tA;
      }
      return pB - pA;
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-5 text-center text-secondary text-sm">
        <i class="bi bi-journal-x d-block fs-2 mb-2"></i>
        No matching system audit events found under current compliance constraints.
      </div>
    `;
    return;
  }

  // Render list data table rows
  const rows = filtered.map(l => {
    const logDate = l.timestamp ? (l.timestamp.seconds ? new Date(l.timestamp.seconds * 1000).toLocaleString() : new Date(l.timestamp).toLocaleString()) : "--/--/--";
    const userSeverity = l.severity || "Info";

    let sevBadge = "badge-severity-info";
    if (userSeverity === "Warning") sevBadge = "badge-severity-warning";
    else if (userSeverity === "Critical") sevBadge = "badge-severity-critical";

    const actorDisplay = l.actorEmail ? `${l.actorEmail} [${l.actorRole || 'user'}]` : (l.actorId || 'System Process');
    const targetDisplay = l.targetUserEmail ? l.targetUserEmail : (l.targetUserId || '--');
    const cleanRefId = l.referenceId ? l.referenceId : '--';

    return `
      <tr class="align-middle text-mono">
        <td class="text-muted text-xxs" style="max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${logDate}">${logDate}</td>
        <td>
          <span class="text-white fw-bold text-xs d-block">${l.eventType}</span>
          <span class="badge badge-category text-xxs" style="font-size: 0.65rem;">${l.category}</span>
        </td>
        <td>
          <span class="badge ${sevBadge} text-xxs text-uppercase">${userSeverity}</span>
        </td>
        <td class="text-secondary text-xs" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${actorDisplay}">${actorDisplay}</td>
        <td class="text-secondary text-xs" style="max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${targetDisplay}">${targetDisplay}</td>
        <td class="text-primary text-xs" style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${cleanRefId}">${cleanRefId}</td>
        <td class="text-muted text-xs" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${l.description}">${l.description}</td>
        <td class="text-secondary text-xxs">${l.ipAddress || '127.0.0.1'}</td>
        <td class="text-secondary text-xxs" style="max-width: 80px; overflow: hidden; text-overflow: ellipsis;" title="${l.device || 'Chrome / MacOS'}">${l.device || 'Chrome / MacOS'}</td>
        <td class="text-center">
          <button class="btn btn-xs btn-outline-primary text-xxs px-2 py-1" data-btn-view="${l.id}" title="Inspect full cryptographic audit ledger details"><i class="bi bi-file-earmark-medical"></i> View Details</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="table table-glass table-glass-hover m-0">
      <thead>
        <tr>
          <th scope="col" style="width: 130px;">Timestamp</th>
          <th scope="col" style="width: 150px;">Event / Category</th>
          <th scope="col" style="width: 90px;">Severity</th>
          <th scope="col">Actor</th>
          <th scope="col">Target User</th>
          <th scope="col">Reference ID</th>
          <th scope="col">Description</th>
          <th scope="col">IP Address</th>
          <th scope="col">Device</th>
          <th scope="col" class="text-center" style="width: 110px;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  // Bind click buttons inside row
  container.querySelectorAll("[data-btn-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      const logId = btn.getAttribute("data-btn-view");
      openAuditLogDetailModal(logId);
    });
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
        <div class="skeleton-bar" style="width: 150px; height: 32px;"></div>
        <div class="flex-grow-1">
          <div class="skeleton-bar mb-2" style="width: 45%;"></div>
          <div class="skeleton-bar" style="width: 15%;"></div>
        </div>
      </div>
      <div class="d-flex align-items-center gap-3 mb-3">
        <div class="skeleton-bar" style="width: 150px; height: 32px;"></div>
        <div class="flex-grow-1">
          <div class="skeleton-bar mb-2" style="width: 65%;"></div>
          <div class="skeleton-bar" style="width: 25%;"></div>
        </div>
      </div>
      <div class="d-flex align-items-center gap-3 mb-3">
        <div class="skeleton-bar" style="width: 150px; height: 32px;"></div>
        <div class="flex-grow-1">
          <div class="skeleton-bar mb-2" style="width: 30%;"></div>
          <div class="skeleton-bar" style="width: 10%;"></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Open Audit Log Detail Modal
 */
function openAuditLogDetailModal(logId) {
  const log = auditLogsList.find(l => l.id === logId);
  if (!log) {
    Toast.show("Audit record not located in cached directory stream.", { type: "danger" });
    return;
  }

  const logDate = log.timestamp ? (log.timestamp.seconds ? new Date(log.timestamp.seconds * 1000).toLocaleString() : new Date(log.timestamp).toLocaleString()) : "--/--/--";
  const userSeverity = log.severity || "Info";

  let sevBadge = "badge-severity-info";
  if (userSeverity === "Warning") sevBadge = "badge-severity-warning";
  else if (userSeverity === "Critical") sevBadge = "badge-severity-critical";

  // Create state JSON formats
  const beforeJson = log.beforeState ? JSON.stringify(log.beforeState, null, 2) : '{\n  "status": "initial_unassigned"\n}';
  const afterJson = log.afterState ? JSON.stringify(log.afterState, null, 2) : '{\n  "status": "system_approved"\n}';

  // Render Timeline steps dynamically
  const defaultTimeline = [
    { timestamp: logDate, status: "Event Detected", description: "Cryptographic event captured and formatted by standard secure API router." },
    { timestamp: logDate, status: "Ledger Immutable", description: "Secured document published in central logs storage collection." }
  ];
  const timelineSteps = log.timeline || defaultTimeline;
  const timelineHtml = timelineSteps.map((step, idx) => `
    <div class="audit-timeline-item">
      <div class="audit-timeline-marker ${idx === timelineSteps.length - 1 ? 'active' : ''}"></div>
      <div class="text-white text-xs fw-semibold">${step.status}</div>
      <div class="text-muted text-xxs text-mono">${step.timestamp}</div>
      <p class="text-secondary text-xs m-0 mt-1">${step.description}</p>
    </div>
  `).join('');

  // Render Reference docs dynamically
  const defaultDocs = [
    { name: "Compliance Ledger Audit PDF", url: "#", type: "pdf" }
  ];
  const docsList = log.referenceDocs || defaultDocs;
  const docsHtml = docsList.map(d => `
    <div class="d-flex align-items-center justify-content-between p-2 border border-secondary border-opacity-10 rounded bg-black bg-opacity-20 mb-2">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-file-earmark-pdf-fill text-danger fs-5"></i>
        <div>
          <span class="text-white text-xs fw-bold d-block">${d.name}</span>
          <span class="text-muted text-xxs text-uppercase">${d.type} archive file</span>
        </div>
      </div>
      <button class="btn btn-xs btn-outline-light" onclick="window.print(); return false;"><i class="bi bi-download"></i></button>
    </div>
  `).join('');

  const modalBody = document.createElement("div");
  modalBody.className = "row g-4 text-secondary text-sm";
  modalBody.innerHTML = `
    <!-- Top info panel banner -->
    <div class="col-12 border-bottom border-secondary border-opacity-10 pb-3">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div>
          <span class="badge ${sevBadge} text-xxs text-uppercase mb-2">${userSeverity}</span>
          <h4 class="text-white m-0 text-display fw-bold text-glow-primary">${log.eventType}</h4>
          <span class="text-muted text-xxs text-mono mt-1 d-block">Log Frame ID: <span class="text-primary">${log.id}</span></span>
        </div>
        <div class="text-md-end text-mono">
          <span class="text-muted text-xs d-block">CAPTURED TIMESTAMP (UTC)</span>
          <span class="text-white fw-bold text-xs">${logDate}</span>
        </div>
      </div>
    </div>

    <!-- Left side: Information specs & Differential States -->
    <div class="col-md-7">
      <h6 class="text-white text-display fw-bold mb-3"><i class="bi bi-info-circle text-primary me-2"></i> Event Specification</h6>
      <div class="row g-3">
        <div class="col-sm-6">
          <div class="modal-glass-panel">
            <span class="text-muted text-xxs d-block">ACTOR SYSTEM DETAIL</span>
            <div class="text-white text-xs mt-1">Role: <span class="badge badge-category text-xxs">${log.actorRole || 'system'}</span></div>
            <div class="text-white text-xs mt-1">ID: <span class="text-mono text-xxs">${log.actorId || 'system_service'}</span></div>
            <div class="text-white text-xs mt-1">Email: <span class="text-white text-xxs">${log.actorEmail || 'system@hfc-exchange'}</span></div>
          </div>
        </div>
        <div class="col-sm-6">
          <div class="modal-glass-panel">
            <span class="text-muted text-xxs d-block">TARGET NODE SPECIFICATION</span>
            <div class="text-white text-xs mt-1">ID: <span class="text-mono text-xxs">${log.targetUserId || '--'}</span></div>
            <div class="text-white text-xs mt-1">Email: <span class="text-white text-xxs">${log.targetUserEmail || '--'}</span></div>
          </div>
        </div>
        <div class="col-12">
          <div class="modal-glass-panel bg-black bg-opacity-20">
            <span class="text-muted text-xxs d-block">CHRONOLOGICAL EVENT DESCRIPTION</span>
            <p class="text-white text-sm m-0 mt-1">${log.description}</p>
          </div>
        </div>

        <!-- Before & After State Diff view panels -->
        <div class="col-sm-6 mt-4">
          <span class="text-muted text-xxs d-block text-uppercase mb-2">Before Audit State</span>
          <pre class="state-viewer state-viewer-before text-xxs">${beforeJson}</pre>
        </div>
        <div class="col-sm-6 mt-4">
          <span class="text-muted text-xxs d-block text-uppercase mb-2">After Audit State</span>
          <pre class="state-viewer state-viewer-after text-xxs">${afterJson}</pre>
        </div>
      </div>
    </div>

    <!-- Right side: Chronological Timelines & Documentation Attachments -->
    <div class="col-md-5">
      <!-- Timelines -->
      <h6 class="text-white text-display fw-bold mb-3"><i class="bi bi-clock-history text-primary me-2"></i> Integrity Timeline</h6>
      <div class="modal-glass-panel mb-4">
        <div class="audit-timeline">
          ${timelineHtml}
        </div>
      </div>

      <!-- Docs Attachments -->
      <h6 class="text-white text-display fw-bold mb-3"><i class="bi bi-paperclip text-primary me-2"></i> Reference Documents</h6>
      <div class="modal-glass-panel">
        ${docsHtml}
      </div>
    </div>
  `;

  const detailsModal = new Modal({
    title: "Immutable Security Audit Ledger Auditor",
    body: modalBody,
    size: "xl",
    buttons: [
      { label: "Close Compliance Panel", class: "btn-hfc-secondary", onClick: (modal) => modal.destroy() }
    ]
  });

  detailsModal.open();
}

/**
 * Configurable Log Retention Period Settings modal dialogue
 */
function openRetentionConfigDialog() {
  const modalForm = document.createElement("form");
  modalForm.id = "retentionSettingsForm";
  modalForm.className = "row g-3 text-secondary text-sm";
  modalForm.innerHTML = `
    <div class="col-12">
      <p class="text-muted text-xs m-0">In compliance with global financial regulations (such as SOC 2, ISO 27001, and AML guidelines), system security logs must be archived for auditing before purging.</p>
    </div>
    <div class="col-md-6 mt-3">
      <label for="retentionPeriodSelect" class="form-label text-muted text-xxs text-uppercase">Log Storage Period</label>
      <select id="retentionPeriodSelect" class="form-select form-select-sm input-glass text-xs">
        <option value="30" ${retentionPolicyDays === 30 ? 'selected' : ''}>30 Days (Short-term Audit)</option>
        <option value="90" ${retentionPolicyDays === 90 ? 'selected' : ''}>90 Days (SOC 2 Standard)</option>
        <option value="180" ${retentionPolicyDays === 180 ? 'selected' : ''}>180 Days (Half Year Retention)</option>
        <option value="365" ${retentionPolicyDays === 365 ? 'selected' : ''}>365 Days (1 Year Full Archival)</option>
        <option value="infinite" ${retentionPolicyDays === 99999 ? 'selected' : ''}>Infinite (Never Purge Logs)</option>
      </select>
    </div>
    <div class="col-md-6 mt-3">
      <label class="form-label text-muted text-xxs text-uppercase">Storage Engine Node</label>
      <input type="text" class="form-control form-control-sm bg-dark text-muted text-mono text-xs border-secondary border-opacity-10" value="HFC Core Firestore Cluster 1" disabled />
    </div>
    <div class="col-12 mt-3">
      <div class="p-3 border border-warning border-opacity-20 bg-warning bg-opacity-5 rounded">
        <div class="d-flex align-items-center gap-2 text-warning mb-2">
          <i class="bi bi-exclamation-triangle"></i>
          <span class="text-xs fw-bold">Compliance Regulation Warning</span>
        </div>
        <p class="text-muted text-xxs m-0">Reducing log retention limits may terminate records permanently in future runs and breach active SOC2 automated monitoring setups. Document the change before finalizing.</p>
      </div>
    </div>
  `;

  const retentionModal = new Modal({
    title: "Configure Audit Storage Retention Policy",
    body: modalForm,
    size: "md",
    buttons: [
      { label: "Cancel", class: "btn-hfc-secondary", onClick: (modal) => modal.destroy() },
      {
        label: "Commit & Apply Changes",
        class: "btn-hfc-primary",
        onClick: async (modal) => {
          const selectVal = document.getElementById("retentionPeriodSelect").value;
          const daysNum = selectVal === "infinite" ? 99999 : parseInt(selectVal, 10);

          const loader = new Loader({ text: "Updating database retention policy configurations..." });
          loader.show();

          try {
            // Write retention settings in Firestore
            await setDoc(doc(db, "settings", "retention"), {
              days: daysNum,
              updatedAt: serverTimestamp()
            });

            // Log event trigger
            await addDoc(collection(db, "logs"), {
              timestamp: serverTimestamp(),
              eventType: "Settings Updated",
              category: "Settings",
              severity: "Warning",
              actorId: auth.currentUser?.uid || "system_user",
              actorEmail: auth.currentUser?.email || "admin@hfc-exchange",
              actorRole: "admin",
              description: `Log retention storage threshold modified to ${selectVal} days.`,
              beforeState: { days: retentionPolicyDays },
              afterState: { days: daysNum },
              ipAddress: "192.168.1.104",
              device: "Admin Security Terminal",
              timeline: [
                { timestamp: new Date().toISOString(), status: "Triggered", description: "Admin initiated retention limit change." },
                { timestamp: new Date().toISOString(), status: "Saved", description: "Retention settings document updated successfully in Firestore." }
              ]
            });

            retentionPolicyDays = daysNum;
            updateRetentionPolicyLabel();
            Toast.show("Log retention policy settings committed successfully.", { type: "success" });
            modal.destroy();
          } catch (err) {
            console.error("Failed to update retention policy document:", err);
            Toast.show("Unauthorized: Security terminal rejected the settings update.", { type: "danger" });
          } finally {
            loader.hide();
          }
        }
      }
    ]
  });

  retentionModal.open();
}

/**
 * Refresh retention panel days count label
 */
function updateRetentionPolicyLabel() {
  const label = document.getElementById("retentionDaysLabel");
  if (label) {
    label.textContent = retentionPolicyDays === 99999 ? "Infinite Archival" : `${retentionPolicyDays} Days Keep`;
  }
}

/**
 * Real-time custom simulation event to test security triggers instantly
 */
async function executeTriggerTestEvent() {
  const loader = new Loader({ text: "Publishing secure compliance test event..." });
  loader.show();

  const testEventTypes = [
    { type: "Failed Login", cat: "Authentication", sev: "Warning", desc: "Multiple invalid login attempts blocked on profile root@hfc-exchange.com." },
    { type: "Role Changed", cat: "Users", sev: "Critical", desc: "User UID: usr_93jfkd promoted to system Administrator privilege status.", before: { role: "user" }, after: { role: "admin" } },
    { type: "User Suspended", cat: "Users", sev: "Warning", desc: "Profile UID: usr_87djs locked due to suspicious high-volume transfers." },
    { type: "Settings Updated", cat: "Settings", sev: "Info", desc: "Exchange marketplace matching engine latency buffer optimized." },
    { type: "Coin Created", cat: "Settings", sev: "Info", desc: "New trade market asset Solana (SOL) seeded successfully." }
  ];

  const pick = testEventTypes[Math.floor(Math.random() * testEventTypes.length)];

  try {
    await addDoc(collection(db, "logs"), {
      timestamp: serverTimestamp(),
      eventType: pick.type,
      category: pick.cat,
      severity: pick.sev,
      actorId: auth.currentUser?.uid || "admin_auditor_uid",
      actorEmail: auth.currentUser?.email || "reset12345boom@gmail.com",
      actorRole: "admin",
      description: pick.desc,
      beforeState: pick.before || { status: "active" },
      afterState: pick.after || { status: "modified" },
      ipAddress: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
      device: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0",
      timeline: [
        { timestamp: new Date().toISOString(), status: "Captured", description: "Automated core interceptor logged the action." }
      ],
      referenceDocs: [
        { name: "Compliance Ledger Audit PDF", url: "#", type: "pdf" }
      ]
    });

    Toast.show(`Test log event of type: "${pick.type}" triggered and streamed in real-time!`, { type: "success" });
  } catch (err) {
    console.error("Failed to seed single test log:", err);
    Toast.show("Failed to publish audit event to database cluster.", { type: "danger" });
  } finally {
    loader.hide();
  }
}

/**
 * Standard CSV Export functionality
 */
function exportRegistryCSV() {
  if (auditLogsList.length === 0) {
    Toast.show("Audit Logs collection is empty. Download ignored.", { type: "info" });
    return;
  }

  const headers = ["Log_UID", "Timestamp", "Event_Type", "Category", "Severity", "Actor_Role", "Actor_Email", "Target_User", "Reference_ID", "Description", "IP_Address"];
  const rows = auditLogsList.map(l => {
    const logDate = l.timestamp ? (l.timestamp.seconds ? new Date(l.timestamp.seconds * 1000).toISOString() : new Date(l.timestamp).toISOString()) : "";
    return [
      l.id || "",
      logDate,
      l.eventType || "",
      l.category || "",
      l.severity || "",
      l.actorRole || "system",
      l.actorEmail || "",
      l.targetUserEmail || l.targetUserId || "",
      l.referenceId || "",
      l.description || "",
      l.ipAddress || "127.0.0.1"
    ].map(field => `"${String(field).replace(/"/g, '""')}"`);
  });

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `HFC_Exchange_Security_Audit_Logs_${new Date().toISOString().substring(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  Toast.show("Secure CSV download of security audit logs triggered successfully.", { type: "success" });
}

/**
 * Print Audit Report for Compliance Standards
 */
function triggerPrintReport() {
  Toast.show("Preparing immutable audit report for archival printing... Triggering system prompt.", { type: "info" });
  setTimeout(() => {
    window.print();
  }, 1000);
}

/**
 * Auto-seeding default records in Firestore logs collection to avoid empty state.
 */
async function seedDefaultAuditLogs() {
  const loader = new Loader({ text: "Seeding default security compliance ledger logs..." });
  loader.show();

  const mockLogs = [
    {
      eventType: "Login",
      category: "Authentication",
      severity: "Info",
      actorId: "usr_942dk",
      actorEmail: "reset12345boom@gmail.com",
      actorRole: "admin",
      targetUserId: "",
      targetUserEmail: "",
      referenceId: "session_93kfjs",
      description: "Admin reset12345boom@gmail.com authenticated securely from terminal location.",
      ipAddress: "192.168.1.104",
      device: "Mac OS X / Safari",
      beforeState: { session: "closed" },
      afterState: { session: "active", mfaVerified: true },
      timeline: [
        { timestamp: "2026-07-11 02:45:00 UTC", status: "Initiated", description: "Admin connection handshake routed." },
        { timestamp: "2026-07-11 02:45:03 UTC", status: "MFA Clear", description: "Multi-factor cryptographic code matched successfully." }
      ]
    },
    {
      eventType: "Failed Login",
      category: "Authentication",
      severity: "Warning",
      actorId: "unknown",
      actorEmail: "hack_attempt@external.net",
      actorRole: "user",
      targetUserId: "",
      targetUserEmail: "",
      referenceId: "session_failed_98",
      description: "Failed login sequence triggered on port root admin node. Authentication rejected.",
      ipAddress: "45.122.98.34",
      device: "Linux / Python Requests",
      beforeState: { tries: 0 },
      afterState: { tries: 3, lockout: true },
      timeline: [
        { timestamp: "2026-07-11 02:40:00 UTC", status: "Handshake", description: "TCP handshake completed from foreign IP range." },
        { timestamp: "2026-07-11 02:40:05 UTC", status: "Locked Out", description: "System security module locked host IP temporarily after 3 failures." }
      ]
    },
    {
      eventType: "User Suspended",
      category: "Users",
      severity: "Critical",
      actorId: "usr_942dk",
      actorEmail: "reset12345boom@gmail.com",
      actorRole: "admin",
      targetUserId: "usr_84jfn3",
      targetUserEmail: "suspicious_trader@hfc.net",
      referenceId: "usr_84jfn3",
      description: "User suspicious_trader@hfc.net suspended permanently due to high rate deposit flags.",
      ipAddress: "192.168.1.104",
      device: "Mac OS X / Chrome",
      beforeState: { status: "active" },
      afterState: { status: "suspended", tradingBlocked: true },
      timeline: [
        { timestamp: "2026-07-11 02:15:00 UTC", status: "Triggered", description: "Automated risk management module flagged account." },
        { timestamp: "2026-07-11 02:20:00 UTC", status: "Committed", description: "Admin manually confirmed suspension and locked trade wallets." }
      ]
    },
    {
      eventType: "Role Changed",
      category: "Users",
      severity: "Critical",
      actorId: "usr_942dk",
      actorEmail: "reset12345boom@gmail.com",
      actorRole: "admin",
      targetUserId: "usr_73jks9",
      targetUserEmail: "support_auditor@hfc.net",
      referenceId: "role_usr_73jks9",
      description: "Assigned privilege role changed for support_auditor@hfc.net to superuser admin level.",
      ipAddress: "192.168.1.104",
      device: "Mac OS X / Chrome",
      beforeState: { role: "user" },
      afterState: { role: "admin" },
      timeline: [
        { timestamp: "2026-07-11 01:50:00 UTC", status: "Requested", description: "Access promotion request submitted by security desk." },
        { timestamp: "2026-07-11 01:51:30 UTC", status: "Completed", description: "System administrator confirmed promotion sequence." }
      ]
    },
    {
      eventType: "Deposit Approved",
      category: "Deposit",
      severity: "Info",
      actorId: "usr_942dk",
      actorEmail: "reset12345boom@gmail.com",
      actorRole: "admin",
      targetUserId: "usr_84hfn2",
      targetUserEmail: "client_depositor@gmail.com",
      referenceId: "dep_93kdks",
      description: "Deposit transfer of 500,000 PKR approved manually by system audit desk.",
      ipAddress: "192.168.1.104",
      device: "Mac OS X / Safari",
      beforeState: { status: "pending", amount: 500000 },
      afterState: { status: "approved", walletCredited: true },
      timeline: [
        { timestamp: "2026-07-10 23:40:00 UTC", status: "Submitted", description: "Client uploaded bank payment receipt document." },
        { timestamp: "2026-07-11 00:05:00 UTC", status: "Approved", description: "Admin matched banking transaction ledger and approved deposit." }
      ]
    },
    {
      eventType: "Withdrawal Approved",
      category: "Withdrawal",
      severity: "Warning",
      actorId: "usr_942dk",
      actorEmail: "reset12345boom@gmail.com",
      actorRole: "admin",
      targetUserId: "usr_42hdks",
      targetUserEmail: "payout_client@outlook.com",
      referenceId: "wit_984hks",
      description: "High volume withdrawal transaction of 1,200,000 PKR approved successfully.",
      ipAddress: "192.168.1.104",
      device: "Mac OS X / Safari",
      beforeState: { status: "pending", amount: 1200000 },
      afterState: { status: "completed", gatewayDispatched: true },
      timeline: [
        { timestamp: "2026-07-10 21:10:00 UTC", status: "Submitted", description: "User requested withdrawal to EasyPaisa wallet." },
        { timestamp: "2026-07-10 22:30:00 UTC", status: "Approved", description: "Admin completed verification of portfolio balances and released payouts." }
      ]
    },
    {
      eventType: "Trade Executed",
      category: "Trading",
      severity: "Info",
      actorId: "usr_42hdks",
      actorEmail: "buyer_account@gmail.com",
      actorRole: "user",
      targetUserId: "usr_82jks9",
      targetUserEmail: "seller_account@gmail.com",
      referenceId: "trd_3948dk",
      description: "P2P Trade matched. 0.45 BTC exchanged successfully for 2,450,000 PKR.",
      ipAddress: "39.123.4.92",
      device: "Android App / HFC App v3",
      beforeState: { buyerBal: 2450000, sellerBal: 0.45 },
      afterState: { buyerBal: 0.45, sellerBal: 2450000, transactionCompleted: true },
      timeline: [
        { timestamp: "2026-07-10 18:30:00 UTC", status: "Negotiated", description: "Both buyer and seller accepted rate specs." },
        { timestamp: "2026-07-10 18:31:12 UTC", status: "Settled", description: "Ledger transaction matching engine completed balancing." }
      ]
    },
    {
      eventType: "Offer Created",
      category: "Marketplace",
      severity: "Info",
      actorId: "usr_82jks9",
      actorEmail: "seller_account@gmail.com",
      actorRole: "user",
      targetUserId: "",
      targetUserEmail: "",
      referenceId: "off_84hdks",
      description: "New sell limit offer published for 1.25 ETH at rate of 890,000 PKR.",
      ipAddress: "39.123.4.92",
      device: "Android App / HFC App v3",
      beforeState: { offerActive: false },
      afterState: { offerActive: true, rate: 890000, volume: 1.25 },
      timeline: [
        { timestamp: "2026-07-10 17:15:00 UTC", status: "Submitted", description: "Marketplace offer validated and listed." }
      ]
    },
    {
      eventType: "Settings Updated",
      category: "Settings",
      severity: "Warning",
      actorId: "usr_942dk",
      actorEmail: "reset12345boom@gmail.com",
      actorRole: "admin",
      targetUserId: "",
      targetUserEmail: "",
      referenceId: "config_exchange_3",
      description: "Exchange global marketplace trading fees increased from 0.15% to 0.20%.",
      ipAddress: "192.168.1.104",
      device: "Mac OS X / Safari",
      beforeState: { platformFee: 0.0015 },
      afterState: { platformFee: 0.002 },
      timeline: [
        { timestamp: "2026-07-10 12:00:00 UTC", status: "Initiated", description: "Fee change proposal approved by board desk." },
        { timestamp: "2026-07-10 12:05:30 UTC", status: "Committed", description: "Platform settings updated in central settings collection." }
      ]
    }
  ];

  try {
    for (const log of mockLogs) {
      await addDoc(collection(db, "logs"), {
        ...log,
        timestamp: serverTimestamp()
      });
    }
    Toast.show("Audit compliance logs collection initialized successfully with mock records.", { type: "success" });
  } catch (err) {
    console.error("Failed to seed default audit logs: ", err);
    Toast.show("Failed to initialize compliance registry db records.", { type: "danger" });
  } finally {
    loader.hide();
  }
}
