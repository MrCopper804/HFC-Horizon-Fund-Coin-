/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - User Notification Center Controller
 * Real-time Firestore sync streams, interactive multi-criteria filters,
 * pagination modules, soft-deletion purge controls, accessibility keys,
 * and a rich live developer event trigger panel for validation.
 */

import { protectPage } from "../../js/authGuard.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";
import { EmptyState } from "../../components/EmptyState.js";
import { db } from "../../firebase/firebase.js";
import { 
  createDocument, 
  updateDocument 
} from "../../firebase/firestore.js";
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";

// Local Page State
const state = {
  user: null,
  layout: null,
  notifications: [],      // Chronological database event logs
  
  // Search & Filter controls
  searchQuery: "",
  activeFilter: "all",    // 'all', 'unread', 'read', 'trades', 'marketplace', 'deposits', 'withdrawals', 'announcements'
  activeSort: "newest",   // 'newest', 'oldest', 'priority', 'unread_first'
  
  // Pagination
  currentPage: 1,
  rowsPerPage: 5,         // Responsive pagination chunks
  
  // Loading tracking
  isLoading: true
};

// Map of the 18 fintech notification models required by specification
const EVENT_SPEC_MODELS = [
  {
    type: "Trade Completed",
    title: "P2P Settlement Confirmed",
    message: "Your trade channel for 0.045 BTC has been finalized. Locked escrow collateral released to your balance.",
    priority: "high",
    relatedPage: "trade-history.html"
  },
  {
    type: "Trade Cancelled",
    title: "Escrow Channel Terminated",
    message: "The trade session for 1.25 ETH was cancelled by peer seller. Crypto returned to escrow reserves.",
    priority: "medium",
    relatedPage: "trade-history.html"
  },
  {
    type: "Trade Failed",
    title: "Escrow Dispute Resolution",
    message: "Platform arbitrator ruled: Counterparty failed to fulfill PKR bank transfer within verification window.",
    priority: "high",
    relatedPage: "trade-history.html"
  },
  {
    type: "Offer Created",
    title: "Market Listing Active",
    message: "You successfully published a Sell Offer for 1,200 USDT at 278.45 PKR trade rate.",
    priority: "low",
    relatedPage: "marketplace.html"
  },
  {
    type: "Offer Updated",
    title: "P2P Liquidity Amended",
    message: "Your buying limit rate for ETH was updated to align with current market price changes.",
    priority: "low",
    relatedPage: "marketplace.html"
  },
  {
    type: "Offer Expired",
    title: "Market Offer Expired",
    message: "Your listing for 250 HFC has expired after reaching the maximum 72-hour liquidity window limit.",
    priority: "low",
    relatedPage: "marketplace.html"
  },
  {
    type: "Negotiation Started",
    title: "P2P Negotiation Opened",
    message: "Peer buyer initialized a private negotiation channel for your active USDT sell listing.",
    priority: "medium",
    relatedPage: "marketplace.html"
  },
  {
    type: "Counter Offer Received",
    title: "Counter Proposal Logged",
    message: "Buyer proposed an amended rate of 276.90 PKR. Review rate delta inside negotiate room.",
    priority: "medium",
    relatedPage: "marketplace.html"
  },
  {
    type: "Deal Locked",
    title: "Trade Lock Finalized",
    message: "Escrow collateral is locked in multi-sig. Double cryptographic signatures verified.",
    priority: "high",
    relatedPage: "trade-history.html"
  },
  {
    type: "Deposit Submitted",
    title: "Deposit Slip Registered",
    message: "Your cash deposit of 75,000 PKR has been submitted for manual bank slip validation.",
    priority: "medium",
    relatedPage: "wallet.html"
  },
  {
    type: "Deposit Approved",
    title: "Fiat Deposit Cleared",
    message: "Audit passed: 75,000 PKR has been credited to your fiat wallet balance.",
    priority: "high",
    relatedPage: "wallet.html"
  },
  {
    type: "Deposit Rejected",
    title: "Deposit Slip Rejected",
    message: "Rejection code: Uploaded bank receipt was unreadable. Please upload a high-resolution slip copy.",
    priority: "high",
    relatedPage: "wallet.html"
  },
  {
    type: "Withdrawal Submitted",
    title: "Withdrawal Order Pending",
    message: "Your order to withdraw 15,000 PKR to your EasyPaisa account is queued for clearing checks.",
    priority: "medium",
    relatedPage: "wallet.html"
  },
  {
    type: "Withdrawal Approved",
    title: "Withdrawal Disbursed",
    message: "Compliance passed: 15,000 PKR has been sent to your registered mobile wallet node.",
    priority: "high",
    relatedPage: "wallet.html"
  },
  {
    type: "Withdrawal Rejected",
    title: "Withdrawal Flagged & Revoked",
    message: "Rejection: Bank beneficiary account name does not match your verified KYC profile details.",
    priority: "high",
    relatedPage: "wallet.html"
  },
  {
    type: "Wallet Updated",
    title: "Hot Wallet Address Rotated",
    message: "USDT wallet address keys rotated for security. Please fetch the new address before initiating deposits.",
    priority: "medium",
    relatedPage: "wallet.html"
  },
  {
    type: "Admin Announcement",
    title: "HFC Core Upgrade v2.4",
    message: "Zero-fee trading promotions apply to all maker accounts this week. Native sub-second channels operational.",
    priority: "high",
    relatedPage: "dashboard.html"
  },
  {
    type: "System Maintenance",
    title: "Database Cluster Hot-Patch",
    message: "Scheduled cloud maintenance on UTC 12:00. Brief 2-minute API gateway latency checks expected.",
    priority: "high",
    relatedPage: "dashboard.html"
  }
];

// Start Notification center on DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Enforce active authentication guard check
  const user = await protectPage();
  if (!user) return;
  state.user = user;

  // 2. Setup PageLayout master frames
  state.layout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: user.email,
      versionText: "HFC Engine v2.4",
      initialNotifications: [], // Synced via real-time stream
      onLogout: async () => {
        const { logoutUser } = await import("../../firebase/auth.js");
        await logoutUser();
        Toast.show("Secure session terminated.", { type: "info" });
        setTimeout(() => { window.location.href = "login.html"; }, 1000);
      }
    },
    sidebarOptions: {
      brandName: "HFC EXCHANGE",
      activeId: "notifications",
      menuItems: [
        { id: "dashboard", label: "Dashboard", icon: "bi-grid-1x2-fill", href: "dashboard.html" },
        { id: "marketplace", label: "P2P Marketplace", icon: "bi-shop", href: "marketplace.html" },
        { id: "wallets", label: "My Wallets", icon: "bi-wallet2", href: "wallet.html" },
        { id: "transactions", label: "Trade History", icon: "bi-clock-history", href: "trade-history.html" },
        { id: "notifications", label: "Notification Center", icon: "bi-bell", href: "notifications.html" }
      ],
      onNavigate: (item) => {
        if (item.id !== "transactions" && item.id !== "dashboard" && item.id !== "wallets" && item.id !== "marketplace" && item.id !== "notifications") {
          Toast.show(`${item.label} interface integration is locked on this preview node.`, { type: "warning" });
        }
      }
    }
  });

  // 3. Paint static templates with filter selectors
  renderCenterScaffolding();

  // 4. Connect real-time Firestore stream listener
  initNotificationListener();
});

/**
 * Render standard page elements, event binds, and filter layouts
 */
function renderCenterScaffolding() {
  const container = state.layout.getContentContainer();
  if (!container) return;

  container.innerHTML = `
    <!-- Page Header Target -->
    <div id="notifications-page-header"></div>

    <!-- REAL-TIME STATUS ROW -->
    <div class="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2 px-1">
      <div class="d-flex align-items-center gap-2">
        <span class="badge bg-primary text-black font-semibold text-xs py-1.5 px-3 rounded-pill" id="header-unread-badge">
          0 UNREAD EVENT SHARDS
        </span>
        <span class="text-secondary text-xxs font-monospace" id="header-last-updated">
          LAST SYNC: WAITING FOR BLOCK...
        </span>
      </div>
      <div class="text-secondary text-xxs font-monospace">
        VERSION: HFC DISPATCH V2.4 &bull; SECURE NODE
      </div>
    </div>

    <!-- COLLAPSIBLE DEMO TEST ENGINE CONSOLE (For verification of the 18 required types) -->
    <div class="filters-glass-container mb-4 d-none" id="demo-generator-console" style="border: 1px dashed rgba(0, 242, 254, 0.35); background: rgba(0, 242, 254, 0.02);">
      <div class="d-flex align-items-center justify-content-between border-bottom border-secondary border-opacity-10 pb-2 mb-3">
        <h5 class="text-white text-display fs-6 m-0 d-flex align-items-center gap-2">
          <i class="bi bi-terminal-fill text-primary"></i> Live Event Dispatch Testbed Console
        </h5>
        <span class="badge bg-primary text-black text-xxs font-monospace px-2 py-0.5">SIMULATOR NODE</span>
      </div>
      <p class="text-secondary text-xs mb-3">
        Generate custom mock transactions to verify immediate websocket listener refreshes, priority badge colorings, category splits, and local storage/database compliance.
      </p>
      
      <!-- Grid of 18 specific event builders -->
      <div class="row g-2" id="mock-trigger-grid">
        <!-- Generated Dynamically -->
      </div>
    </div>

    <!-- SUMMARY METRICS STATISTICS CARDS -->
    <div class="notifications-summary-grid" id="notifications-summary-grid">
      <!-- Loading skeletons initially -->
      <div class="metric-glass-card"><div class="skeleton-box w-50 mb-2"></div><div class="skeleton-box w-75 h-6"></div></div>
      <div class="metric-glass-card"><div class="skeleton-box w-50 mb-2"></div><div class="skeleton-box w-75 h-6"></div></div>
      <div class="metric-glass-card"><div class="skeleton-box w-50 mb-2"></div><div class="skeleton-box w-75 h-6"></div></div>
      <div class="metric-glass-card"><div class="skeleton-box w-50 mb-2"></div><div class="skeleton-box w-75 h-6"></div></div>
      <div class="metric-glass-card"><div class="skeleton-box w-50 mb-2"></div><div class="skeleton-box w-75 h-6"></div></div>
    </div>

    <!-- DYNAMIC FILTER CONTAINER -->
    <div class="filters-glass-container">
      <div class="row g-3">
        <!-- Real-time Input Search -->
        <div class="col-md-4 col-sm-6">
          <label for="search-input" class="text-xs text-muted mb-1 d-block"><i class="bi bi-search"></i> Search Notifications</label>
          <input type="text" id="search-input" class="form-control form-control-glass text-white text-xs" 
            placeholder="Search title, message content..." aria-label="Search notifications">
        </div>

        <!-- Category Dropdown Filter -->
        <div class="col-md-4 col-sm-6">
          <label for="filter-type" class="text-xs text-muted mb-1 d-block"><i class="bi bi-funnel"></i> Category & Read State</label>
          <select id="filter-type" class="form-select form-control-glass text-white text-xs" aria-label="Filter category">
            <option value="all" selected>All Notifications</option>
            <option value="unread">Unread Only</option>
            <option value="read">Read Only</option>
            <option value="trades">Trades (Completed, Locked, etc.)</option>
            <option value="marketplace">Marketplace (Offers, Negotiations)</option>
            <option value="deposits">Deposits Category</option>
            <option value="withdrawals">Withdrawals Category</option>
            <option value="announcements">Announcements &amp; System Settings</option>
          </select>
        </div>

        <!-- Sorting Selector -->
        <div class="col-md-4 col-sm-12">
          <label for="sort-order" class="text-xs text-muted mb-1 d-block"><i class="bi bi-filter-left"></i> Sort Order</label>
          <select id="sort-order" class="form-select form-control-glass text-white text-xs" aria-label="Sort order">
            <option value="newest" selected>Newest Executions First</option>
            <option value="oldest">Oldest Executions First</option>
            <option value="priority">Highest Priority Level First</option>
            <option value="unread_first">Unread Event Logs First</option>
          </select>
        </div>
      </div>

      <!-- Action Footer Buttons -->
      <div class="d-flex align-items-center justify-content-between mt-3.5 pt-3.5 border-top border-secondary border-opacity-10 flex-wrap gap-2">
        <span class="text-muted text-xxs font-monospace uppercase" id="results-counter">INITIALIZING DB SYNAPSE GATEWAY...</span>
        <div class="d-flex gap-1.5 flex-wrap">
          <button class="btn btn-outline-secondary btn-xs uppercase text-mono px-3 py-1.5" id="btn-seed-demo" aria-label="Seed demo notifications">
            <i class="bi bi-stack"></i> Seed Initial Demo Stack
          </button>
          <button class="btn btn-outline-primary btn-xs uppercase text-mono px-3 py-1.5" id="btn-mark-all-read" aria-label="Mark all notifications as read">
            <i class="bi bi-check-all"></i> Mark All Read
          </button>
          <button class="btn btn-outline-danger btn-xs uppercase text-mono px-3 py-1.5" id="btn-delete-all-read" aria-label="Delete all read notifications">
            <i class="bi bi-trash"></i> Purge Read (Soft)
          </button>
        </div>
      </div>
    </div>

    <!-- LIVE NOTIFICATION FEED STACK CONTAINER -->
    <div id="notifications-feed-wrapper">
      <!-- Loading skeletons rendered inside processAndRenderFeed -->
      <div class="d-flex flex-column gap-3">
        ${Array.from({ length: 4 }, () => `
          <div class="notification-card">
            <div class="skeleton-box skeleton-icon"></div>
            <div class="notification-card-body">
              <div class="skeleton-box skeleton-title"></div>
              <div class="skeleton-box skeleton-desc"></div>
              <div class="skeleton-box skeleton-desc-sub"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- RESPONSIVE PAGINATION SCROLL WRAP -->
    <div class="table-responsive-container p-3 d-flex justify-content-between align-items-center bg-black bg-opacity-20 flex-wrap gap-2 mt-3" id="feed-pagination-footer" style="display:none !important;">
      <div class="text-xxs text-muted text-mono" id="page-display">SHOWING INDEX 0 of 0</div>
      <div class="d-flex gap-1">
        <button class="btn btn-outline-secondary btn-xs uppercase text-mono px-2.5 py-1" id="btn-page-prev" disabled>PREV</button>
        <button class="btn btn-outline-secondary btn-xs uppercase text-mono px-2.5 py-1" id="btn-page-next" disabled>NEXT</button>
      </div>
    </div>
  `;

  // Instantiate elegant top page header panel
  new PageHeader("#notifications-page-header", {
    title: "Notification Center",
    description: "Audit ledger balance updates, deal lock agreements, and core security maintenance alerts.",
    breadcrumbs: [
      { label: "Dashboard", href: "dashboard.html" },
      { label: "Notifications", active: true }
    ],
    action: {
      label: "Dev Event Simulator",
      icon: "bi-terminal-fill",
      onClick: () => {
        const consoleEl = document.getElementById("demo-generator-console");
        if (consoleEl) {
          consoleEl.classList.toggle("d-none");
          Toast.show("Event Dispatcher view state updated.", { type: "info" });
        }
      }
    }
  });

  // Dynamically populate the 18 mock event selectors inside Dev Console
  const triggerGrid = document.getElementById("mock-trigger-grid");
  if (triggerGrid) {
    EVENT_SPEC_MODELS.forEach((model, idx) => {
      const colDiv = document.createElement("div");
      colDiv.className = "col-lg-3 col-md-4 col-sm-6";
      colDiv.innerHTML = `
        <button class="btn btn-outline-info text-start text-xs w-100 p-2 font-monospace uppercase text-truncate btn-mock-trigger" 
          data-idx="${idx}" style="font-size:10px; border-color: rgba(0, 242, 254, 0.15);">
          <i class="bi bi-broadcast"></i> ${model.type}
        </button>
      `;
      triggerGrid.appendChild(colDiv);
    });

    // Bind trigger clicks
    triggerGrid.querySelectorAll(".btn-mock-trigger").forEach(btn => {
      btn.onclick = async () => {
        const idx = parseInt(btn.getAttribute("data-idx"));
        const model = EVENT_SPEC_MODELS[idx];
        await dispatchMockNotification(model);
      };
    });
  }

  // Bind active dynamic search parameters
  document.getElementById("search-input").addEventListener("input", (e) => {
    state.searchQuery = e.target.value.trim();
    state.currentPage = 1;
    processAndRenderFeed();
  });

  // Bind type selector change
  document.getElementById("filter-type").addEventListener("change", (e) => {
    state.activeFilter = e.target.value;
    state.currentPage = 1;
    processAndRenderFeed();
  });

  // Bind sort selector change
  document.getElementById("sort-order").addEventListener("change", (e) => {
    state.activeSort = e.target.value;
    processAndRenderFeed();
  });

  // Bind Bulk Platform Updates
  document.getElementById("btn-seed-demo").onclick = async () => {
    await seedInitialDemoStack();
  };

  document.getElementById("btn-mark-all-read").onclick = async () => {
    await markAllNotificationsAsRead();
  };

  document.getElementById("btn-delete-all-read").onclick = async () => {
    await purgeAllReadNotifications();
  };

  // Bind dynamic paginators
  document.getElementById("btn-page-prev").onclick = () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      processAndRenderFeed();
    }
  };

  document.getElementById("btn-page-next").onclick = () => {
    const filteredList = getFilteredNotifications();
    const totalPages = Math.ceil(filteredList.length / state.rowsPerPage);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      processAndRenderFeed();
    }
  };
}

/**
 * Initialize Firestore subscription tunnels for authenticated user
 */
function initNotificationListener() {
  const userId = state.user.uid;
  
  // Realtime constraints: Fetch logs for this user, order by newest (locally sorted for safety)
  const notifRef = collection(db, "notifications");
  const q = query(notifRef, where("userId", "==", userId));

  onSnapshot(q, (snapshot) => {
    const list = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      // Enforce soft-deletion locally
      if (data.isDeleted !== true) {
        list.push({ id: docSnap.id, ...data });
      }
    });

    state.notifications = list;
    state.isLoading = false;

    // Refresh dynamic statistics & counters
    updateSummaryStatistics();
    
    // Sync the local unread items to the global Navbar component for full-stack integration!
    synchronizeGlobalNavbar();

    // Render feed viewport list
    processAndRenderFeed();
  }, (err) => {
    console.error("Firestore real-time snapshot listener failed:", err);
    state.isLoading = false;
    processAndRenderFeed();
    Toast.show("Event synchronized link degraded. Check network.", { type: "danger" });
  });
}

/**
 * Sync navbar state and unread tags in real-time
 */
function synchronizeGlobalNavbar() {
  const unreadItems = state.notifications.filter(n => !n.isRead);
  
  // Update Header unread statistics
  const badgeEl = document.getElementById("header-unread-badge");
  if (badgeEl) {
    badgeEl.innerText = `${unreadItems.length} UNREAD EVENT SHARDS`;
    if (unreadItems.length > 0) {
      badgeEl.className = "badge bg-danger text-white font-semibold text-xs py-1.5 px-3 rounded-pill status-pulse-primary";
    } else {
      badgeEl.className = "badge bg-secondary text-white font-semibold text-xs py-1.5 px-3 rounded-pill";
    }
  }

  // Update synchronization timestamp
  const syncEl = document.getElementById("header-last-updated");
  if (syncEl) {
    const d = new Date();
    syncEl.innerText = `LAST SYNC: ${d.toLocaleTimeString()}`;
  }

  // Enforce synchrony with layout's top Navbar component instance if accessible
  if (state.layout && state.layout.navbar) {
    state.layout.navbar.notifications = unreadItems.map(n => ({
      id: n.id,
      type: n.priority === 'high' ? 'danger' : n.priority === 'medium' ? 'warning' : 'success',
      text: n.title
    }));
    state.layout.navbar.render();
  }
}

/**
 * Filter matching list based on parameters
 */
function getFilteredNotifications() {
  const queryLower = state.searchQuery.toLowerCase();

  const list = state.notifications.filter(n => {
    // Search Title & Message matching
    const matchSearch = queryLower === "" || 
      (n.title && n.title.toLowerCase().includes(queryLower)) ||
      (n.message && n.message.toLowerCase().includes(queryLower));

    if (!matchSearch) return false;

    // Read/Unread state filter matches
    if (state.activeFilter === "unread") return !n.isRead;
    if (state.activeFilter === "read") return n.isRead;

    // Categories mapping: Trades, Marketplace, Deposits, Withdrawals, Announcements/System
    const category = getNotificationCategory(n.type);
    if (state.activeFilter === "trades") return category === "Trades";
    if (state.activeFilter === "marketplace") return category === "Marketplace";
    if (state.activeFilter === "deposits") return category === "Deposits";
    if (state.activeFilter === "withdrawals") return category === "Withdrawals";
    if (state.activeFilter === "announcements") return category === "Announcements" || category === "System";

    return true; // "all"
  });

  // Apply sorting rules
  list.sort((a, b) => {
    const secA = a.createdAt?.seconds || a.createdAt?.toMillis?.() / 1000 || 0;
    const secB = b.createdAt?.seconds || b.createdAt?.toMillis?.() / 1000 || 0;

    if (state.activeSort === "newest") return secB - secA;
    if (state.activeSort === "oldest") return secA - secB;

    if (state.activeSort === "priority") {
      const priorityMap = { high: 3, medium: 2, low: 1 };
      const priorityValA = priorityMap[a.priority?.toLowerCase()] || 0;
      const priorityValB = priorityMap[b.priority?.toLowerCase()] || 0;
      if (priorityValA !== priorityValB) {
        return priorityValB - priorityValA; // highest priority first
      }
      return secB - secA; // fallback newest first
    }

    if (state.activeSort === "unread_first") {
      if (a.isRead !== b.isRead) {
        return a.isRead ? 1 : -1; // unread (false) first
      }
      return secB - secA; // fallback newest first
    }

    return 0;
  });

  return list;
}

/**
 * Evaluate specific category for a given notification model type
 */
function getNotificationCategory(type) {
  const tradesTypes = ["Trade Completed", "Trade Cancelled", "Trade Failed", "Deal Locked"];
  const marketplaceTypes = ["Offer Created", "Offer Updated", "Offer Expired", "Negotiation Started", "Counter Offer Received"];
  const depositsTypes = ["Deposit Submitted", "Deposit Approved", "Deposit Rejected"];
  const withdrawalsTypes = ["Withdrawal Submitted", "Withdrawal Approved", "Withdrawal Rejected"];
  const systemTypes = ["Wallet Updated", "System Maintenance"];

  if (tradesTypes.includes(type)) return "Trades";
  if (marketplaceTypes.includes(type)) return "Marketplace";
  if (depositsTypes.includes(type)) return "Deposits";
  if (withdrawalsTypes.includes(type)) return "Withdrawals";
  if (systemTypes.includes(type)) return "System";
  
  return "Announcements"; // 'Admin Announcement' and any others
}

/**
 * Returns icon configurations
 */
function getNotificationIconDetails(type) {
  const spec = {
    // Trades
    "Trade Completed": { icon: "bi-check-circle-fill", class: "icon-trades" },
    "Trade Cancelled": { icon: "bi-x-circle", class: "icon-trades" },
    "Trade Failed": { icon: "bi-exclamation-octagon-fill", class: "icon-trades" },
    "Deal Locked": { icon: "bi-lock-fill", class: "icon-trades" },

    // Marketplace
    "Offer Created": { icon: "bi-plus-circle-fill", class: "icon-marketplace" },
    "Offer Updated": { icon: "bi-pencil-square", class: "icon-marketplace" },
    "Offer Expired": { icon: "bi-calendar-x", class: "icon-marketplace" },
    "Negotiation Started": { icon: "bi-chat-left-quote-fill", class: "icon-marketplace" },
    "Counter Offer Received": { icon: "bi-arrow-left-right", class: "icon-marketplace" },

    // Deposits
    "Deposit Submitted": { icon: "bi-arrow-down-left-circle", class: "icon-deposits" },
    "Deposit Approved": { icon: "bi-check2-circle", class: "icon-deposits" },
    "Deposit Rejected": { icon: "bi-slash-circle-fill", class: "icon-deposits" },

    // Withdrawals
    "Withdrawal Submitted": { icon: "bi-arrow-up-right-circle", class: "icon-withdrawals" },
    "Withdrawal Approved": { icon: "bi-wallet-fill", class: "icon-withdrawals" },
    "Withdrawal Rejected": { icon: "bi-slash-circle", class: "icon-withdrawals" },

    // System / Announcements
    "Wallet Updated": { icon: "bi-wallet2", class: "icon-system" },
    "System Maintenance": { icon: "bi-tools", class: "icon-system" },
    "Admin Announcement": { icon: "bi-megaphone-fill", class: "icon-announcements" }
  };

  return spec[type] || { icon: "bi-bell-fill", class: "icon-announcements" };
}

/**
 * Calculate Summary Statistics
 */
function updateSummaryStatistics() {
  const list = state.notifications;
  const stats = {
    total: list.length,
    unread: list.filter(n => !n.isRead).length,
    trades: list.filter(n => getNotificationCategory(n.type) === "Trades").length,
    funds: list.filter(n => {
      const c = getNotificationCategory(n.type);
      return c === "Deposits" || c === "Withdrawals";
    }).length,
    system: list.filter(n => {
      const c = getNotificationCategory(n.type);
      return c === "Announcements" || c === "System";
    }).length
  };

  const statsGrid = document.getElementById("notifications-summary-grid");
  if (!statsGrid) return;

  statsGrid.innerHTML = `
    <!-- Total Notifications -->
    <div class="metric-glass-card accent-total">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <span class="text-xxs text-muted uppercase text-mono d-block">TOTAL RECORDS</span>
          <strong class="text-white fs-4 text-display mt-1 d-block">${stats.total}</strong>
        </div>
        <div class="metric-icon-badge text-primary"><i class="bi bi-collection fs-5"></i></div>
      </div>
      <span class="text-xxs text-muted">All logs saved on active node</span>
    </div>

    <!-- Unread Notifications -->
    <div class="metric-glass-card accent-unread">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <span class="text-xxs text-muted uppercase text-mono d-block">UNREAD EVENTS</span>
          <strong class="text-primary fs-4 text-display mt-1 d-block">${stats.unread}</strong>
        </div>
        <div class="metric-icon-badge text-primary"><i class="bi bi-bell-fill fs-5"></i></div>
      </div>
      <span class="text-xxs text-muted">Awaiting local clearance</span>
    </div>

    <!-- Trade Notifications -->
    <div class="metric-glass-card accent-trades">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <span class="text-xxs text-muted uppercase text-mono d-block">P2P TRADES</span>
          <strong class="text-success fs-4 text-display mt-1 d-block">${stats.trades}</strong>
        </div>
        <div class="metric-icon-badge text-success"><i class="bi bi-activity fs-5"></i></div>
      </div>
      <span class="text-xxs text-muted">Escrow completions and lock status</span>
    </div>

    <!-- Deposit & Withdrawal Notifications -->
    <div class="metric-glass-card accent-funds">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <span class="text-xxs text-muted uppercase text-mono d-block">FUNDS & WALLETS</span>
          <strong class="text-warning fs-4 text-display mt-1 d-block">${stats.funds}</strong>
        </div>
        <div class="metric-icon-badge text-warning"><i class="bi bi-cash-stack fs-5"></i></div>
      </div>
      <span class="text-xxs text-muted">Submissions and clearance status</span>
    </div>

    <!-- System Announcements -->
    <div class="metric-glass-card accent-system">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <span class="text-xxs text-muted uppercase text-mono d-block">ANNOUNCEMENTS</span>
          <strong class="text-pink fs-4 text-display mt-1 d-block" style="color: #ec4899;">${stats.system}</strong>
        </div>
        <div class="metric-icon-badge" style="color: #ec4899;"><i class="bi bi-megaphone fs-5"></i></div>
      </div>
      <span class="text-xxs text-muted">Platform news and node updates</span>
    </div>
  `;
}

/**
 * Filter, sort, paginate, and print the notification items to screen
 */
function processAndRenderFeed() {
  const feedWrapper = document.getElementById("notifications-feed-wrapper");
  if (!feedWrapper) return;

  const filtered = getFilteredNotifications();
  const counterEl = document.getElementById("results-counter");
  if (counterEl) {
    counterEl.innerText = `${filtered.length} DISPATCH EVENT LOGS LOADED`;
  }

  // Handle zero results empty state
  if (filtered.length === 0) {
    new EmptyState(feedWrapper, {
      icon: "bi-bell-slash",
      title: "No Notifications Found",
      description: "No chronological events match your query or category filters. Click 'Seed Initial Demo Stack' or trigger simulator events above to build live logs.",
      action: {
        label: "Simulate Live Events",
        icon: "bi-terminal-fill",
        onClick: () => {
          const consoleEl = document.getElementById("demo-generator-console");
          if (consoleEl) {
            consoleEl.classList.remove("d-none");
            Toast.show("Event console brought into focus.", { type: "info" });
          }
        }
      }
    });

    document.getElementById("feed-pagination-footer").setAttribute("style", "display:none !important;");
    return;
  }

  // Paginated slices evaluation
  const totalPages = Math.ceil(filtered.length / state.rowsPerPage);
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  if (state.currentPage < 1) state.currentPage = 1;

  const startIndex = (state.currentPage - 1) * state.rowsPerPage;
  const endIndex = Math.min(startIndex + state.rowsPerPage, filtered.length);
  const pageSlice = filtered.slice(startIndex, endIndex);

  // Render list viewport HTML
  let feedHtml = `<div class="d-flex flex-column gap-3">`;

  pageSlice.forEach(n => {
    const iconMeta = getNotificationIconDetails(n.type);
    const category = getNotificationCategory(n.type);
    const badgeCatClass = `badge-category cat-${category.toLowerCase()}`;
    const badgePriClass = `badge-priority pri-${n.priority?.toLowerCase()}`;
    const relativeTime = formatRelativeTime(n.createdAt);

    // Deep routing button details
    let deepLinkHtml = "";
    if (n.relatedPage) {
      let pageLabel = "View Details";
      if (n.relatedPage === "wallet.html") pageLabel = "Go to Wallet";
      if (n.relatedPage === "marketplace.html") pageLabel = "Open Market";
      if (n.relatedPage === "trade-history.html") pageLabel = "Audit Ledger";
      
      deepLinkHtml = `
        <button class="btn btn-outline-primary btn-xs uppercase text-mono px-2.5 py-1 btn-deep-route" 
          data-id="${n.id}" data-href="${n.relatedPage}" aria-label="Route to ${pageLabel}">
          <i class="bi bi-arrow-right-short"></i> ${pageLabel}
        </button>
      `;
    }

    const unreadDotHtml = !n.isRead ? `<span class="unread-glow-dot" aria-label="Unread Indicator"></span>` : "";

    feedHtml += `
      <div class="notification-card state-${n.isRead ? 'read' : 'unread'} priority-${n.priority?.toLowerCase()}" 
        data-id="${n.id}" tabindex="0" role="listitem"
        aria-label="Notification card: ${n.title}. ${n.message}. Category: ${category}. Priority: ${n.priority}. ${n.isRead ? 'Read' : 'Unread'}">
        
        <!-- Interactive Icon -->
        <div class="notification-icon-wrapper ${iconMeta.class}">
          <i class="bi ${iconMeta.icon} fs-5"></i>
        </div>

        <!-- Contents -->
        <div class="notification-card-body">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1.5">
            <div class="d-flex align-items-center gap-1.5 flex-wrap">
              <h4 class="text-white text-display m-0 fs-6 fw-bold">${n.title}</h4>
              ${unreadDotHtml}
            </div>
            <div class="d-flex align-items-center gap-2">
              <span class="${badgeCatClass}">${category}</span>
              <span class="${badgePriClass}">${n.priority}</span>
              <span class="text-muted text-xxs font-monospace">${relativeTime}</span>
            </div>
          </div>
          <p class="text-secondary text-sm m-0 leading-relaxed mb-2.5" style="max-width: 90%;">${n.message}</p>
          
          <!-- Actions Footer on Card -->
          <div class="d-flex gap-1.5 align-items-center flex-wrap">
            ${deepLinkHtml}
            ${!n.isRead ? `
              <button class="btn btn-outline-secondary btn-xs uppercase text-mono px-2.5 py-1 btn-card-mark-read" 
                data-id="${n.id}" aria-label="Mark notification as read">
                <i class="bi bi-eye"></i> Mark Read
              </button>
            ` : `
              <button class="btn btn-outline-secondary btn-xs uppercase text-mono px-2.5 py-1 btn-card-mark-unread" 
                data-id="${n.id}" aria-label="Mark notification as unread">
                <i class="bi bi-eye-slash"></i> Mark Unread
              </button>
            `}
            <button class="btn btn-outline-danger btn-xs uppercase text-mono px-2.5 py-1 btn-card-soft-delete" 
              data-id="${n.id}" aria-label="Delete notification log">
              <i class="bi bi-trash"></i> Delete
            </button>
          </div>
        </div>
      </div>
    `;
  });

  feedHtml += `</div>`;
  feedWrapper.innerHTML = feedHtml;

  // Bind Card Click Route Transitions (Accessibility fallback)
  feedWrapper.querySelectorAll(".notification-card").forEach(card => {
    card.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const id = card.getAttribute("data-id");
        const notif = state.notifications.find(item => item.id === id);
        if (notif) {
          await handleNotificationCardClick(notif);
        }
      }
    });
  });

  // Bind Card specific control click events
  feedWrapper.querySelectorAll(".btn-deep-route").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const targetPage = btn.getAttribute("data-href");
      const notif = state.notifications.find(item => item.id === id);
      if (notif) {
        // Automatically set read state upon deep linking
        if (!notif.isRead) {
          await updateDocument("notifications", notif.id, { isRead: true });
        }
        Toast.show(`Decrypting secure endpoint...`, { type: "info" });
        setTimeout(() => { window.location.href = targetPage; }, 600);
      }
    };
  });

  feedWrapper.querySelectorAll(".btn-card-mark-read").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      await updateDocument("notifications", id, { isRead: true });
      Toast.show("Notification marked as read.", { type: "success" });
    };
  });

  feedWrapper.querySelectorAll(".btn-card-mark-unread").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      await updateDocument("notifications", id, { isRead: false });
      Toast.show("Notification marked as unread.", { type: "info" });
    };
  });

  feedWrapper.querySelectorAll(".btn-card-soft-delete").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const cardEl = btn.closest(".notification-card");
      if (cardEl) {
        cardEl.classList.add("notification-slide-out");
        // Update database after animation finishes
        setTimeout(async () => {
          await updateDocument("notifications", id, { isDeleted: true });
          Toast.show("Notification cleared from active cluster.", { type: "warning" });
        }, 300);
      }
    };
  });

  // Display and update paginator panel
  const paginatorFooter = document.getElementById("feed-pagination-footer");
  if (paginatorFooter) {
    paginatorFooter.setAttribute("style", "display: flex !important;");
    document.getElementById("page-display").innerText = `SHOWING RECORDS ${startIndex + 1} - ${endIndex} OF ${filtered.length}`;
    document.getElementById("btn-page-prev").disabled = state.currentPage === 1;
    document.getElementById("btn-page-next").disabled = state.currentPage === totalPages;
  }
}

/**
 * Handle fully integrated card click events
 */
async function handleNotificationCardClick(n) {
  if (!n.isRead) {
    await updateDocument("notifications", n.id, { isRead: true });
  }
  if (n.relatedPage) {
    window.location.href = n.relatedPage;
  }
}

/**
 * Format relative timestamps cleanly
 */
function formatRelativeTime(ts) {
  if (!ts) return "Just now";
  
  // Extract date from either JS Date, timestamp object, or server Timestamp
  let date;
  if (ts.seconds) {
    date = new Date(ts.seconds * 1000);
  } else if (ts.toMillis) {
    date = new Date(ts.toMillis());
  } else {
    date = new Date(ts);
  }

  if (isNaN(date.getTime())) return "Just now";

  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 15) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) {
    return `Yesterday, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Seed 5 customized Fintech notifications to start off the testing suite elegantly
 */
async function seedInitialDemoStack() {
  const loader = new Loader({ text: "Compiling initial demo transactions..." });
  loader.show();

  const mockStack = [
    {
      type: "Trade Completed",
      title: "P2P Settlement Confirmed",
      message: "Your trade channel for 0.045 BTC has been finalized. Locked escrow collateral released to your balance.",
      priority: "high",
      relatedPage: "trade-history.html",
      isRead: false
    },
    {
      type: "Counter Offer Received",
      title: "Counter Proposal Logged",
      message: "Buyer proposed an amended rate of 276.90 PKR. Review rate delta inside negotiate room.",
      priority: "medium",
      relatedPage: "marketplace.html",
      isRead: false
    },
    {
      type: "Deposit Approved",
      title: "Fiat Deposit Cleared",
      message: "Audit passed: 75,000 PKR has been credited to your fiat wallet balance.",
      priority: "high",
      relatedPage: "wallet.html",
      isRead: true
    },
    {
      type: "Offer Expired",
      title: "Market Offer Expired",
      message: "Your listing for 250 HFC has expired after reaching the maximum 72-hour liquidity window limit.",
      priority: "low",
      relatedPage: "marketplace.html",
      isRead: true
    },
    {
      type: "System Maintenance",
      title: "Database Cluster Hot-Patch",
      message: "Scheduled cloud maintenance on UTC 12:00. Brief 2-minute API gateway latency checks expected.",
      priority: "high",
      relatedPage: "dashboard.html",
      isRead: false
    }
  ];

  try {
    for (const item of mockStack) {
      await createDocument("notifications", {
        userId: state.user.uid,
        userUid: state.user.uid,
        title: item.title,
        message: item.message,
        type: item.type,
        priority: item.priority,
        isRead: item.isRead,
        isDeleted: false,
        relatedDocumentId: "mock_" + Math.floor(Math.random() * 100000),
        relatedPage: item.relatedPage,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    Toast.show("Five demo notifications injected successfully.", { type: "success" });
  } catch (err) {
    console.error("Error seeding initial logs:", err);
    Toast.show("Seeding stream rejected by Firebase node rules.", { type: "danger" });
  } finally {
    loader.hide();
  }
}

/**
 * Dispatch specific notification model to Firestore
 */
async function dispatchMockNotification(model) {
  const loader = new Loader({ text: `Injecting active event: ${model.type}...` });
  loader.show();

  try {
    await createDocument("notifications", {
      userId: state.user.uid,
      userUid: state.user.uid,
      title: model.title,
      message: model.message,
      type: model.type,
      priority: model.priority,
      isRead: false,
      isDeleted: false,
      relatedDocumentId: "mock_" + Math.floor(Math.random() * 100000),
      relatedPage: model.relatedPage,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    Toast.show(`Successfully broadcasted: ${model.type}`, { type: "success" });
  } catch (err) {
    console.error("Error dispatching simulated log:", err);
    Toast.show("Simulated transmission rejected.", { type: "danger" });
  } finally {
    loader.hide();
  }
}

/**
 * Mark all active unread logs as read in bulk
 */
async function markAllNotificationsAsRead() {
  const unread = state.notifications.filter(n => !n.isRead);
  if (unread.length === 0) {
    Toast.show("All transaction logs already cleared as read.", { type: "info" });
    return;
  }

  const loader = new Loader({ text: "Fusing read checkpoints in database..." });
  loader.show();

  try {
    const promises = unread.map(n => updateDocument("notifications", n.id, { isRead: true }));
    await Promise.all(promises);
    Toast.show(`Marked ${unread.length} logs as read.`, { type: "success" });
  } catch (err) {
    console.error("Error completing bulk mark read:", err);
    Toast.show("Bulk confirmation transaction aborted.", { type: "danger" });
  } finally {
    loader.hide();
  }
}

/**
 * Soft delete all read logs in bulk
 */
async function purgeAllReadNotifications() {
  const read = state.notifications.filter(n => n.isRead);
  if (read.length === 0) {
    Toast.show("No read notifications available for soft deletion.", { type: "info" });
    return;
  }

  const loader = new Loader({ text: "Truncating read event cache logs..." });
  loader.show();

  try {
    const promises = read.map(n => updateDocument("notifications", n.id, { isDeleted: true }));
    await Promise.all(promises);
    Toast.show(`Soft deleted ${read.length} read notifications.`, { type: "success" });
    state.currentPage = 1;
  } catch (err) {
    console.error("Error completing bulk soft delete:", err);
    Toast.show("Bulk soft delete aborted.", { type: "danger" });
  } finally {
    loader.hide();
  }
}
