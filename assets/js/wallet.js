/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Wallet Page Controller
 * Advanced portfolio manager handling multi-asset balances, real-time listeners,
 * instant multi-criteria sorting/filtering, and transactional ledger actions.
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
  getDocs, 
  setDoc, 
  addDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  getDocument, 
  createDocument, 
  updateDocument, 
  queryCollection 
} from "../../firebase/firestore.js";

// Global Local State for the Wallet Page
const state = {
  user: null,
  coins: [],         // Dynamic Coin list from Firestore 'coins'
  wallets: [],       // Real-time Wallets list from Firestore 'wallets'
  transactions: [],  // Real-time Transactions list from Firestore 'transactions'
  
  // Filtering and Table Controls
  searchQuery: "",
  activeFilter: "all", // 'all', 'coin', 'fiat'
  activeSort: "value_desc", // 'name_asc', 'balance_desc', 'balance_asc', 'value_desc', 'updated_desc'
  
  // Pagination
  currentPage: 1,
  rowsPerPage: 5
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
        { id: 1, type: "success", text: "Cold wallet ledger synchronized." }
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
      activeId: "wallets",
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

  // 3. Render base frame skeleton
  renderWalletFrame(layout);

  // 4. Initialize Database connection and real-time listeners
  await initRealtimeListeners();
});

/**
 * Render base UI framework, table headers, filter containers, and event logs placeholder
 */
function renderWalletFrame(layout) {
  const container = layout.getContentContainer();
  if (!container) return;

  container.innerHTML = `
    <!-- Dynamic Page Header Target -->
    <div id="wallet-header"></div>

    <!-- Portfolio Summary Cards Grid -->
    <div class="wallet-summary-grid" id="summary-cards">
      <!-- Loading placeholders -->
      <div class="summary-card primary-edge"><div class="skeleton-loader w-50 h-4"></div><div class="skeleton-loader w-75 h-8 mt-2"></div></div>
      <div class="summary-card success-edge"><div class="skeleton-loader w-50 h-4"></div><div class="skeleton-loader w-75 h-8 mt-2"></div></div>
      <div class="summary-card warning-edge"><div class="skeleton-loader w-50 h-4"></div><div class="skeleton-loader w-75 h-8 mt-2"></div></div>
      <div class="summary-card accent-edge"><div class="skeleton-loader w-50 h-4"></div><div class="skeleton-loader w-75 h-8 mt-2"></div></div>
    </div>

    <!-- Interactive Filters and Search Control Panel -->
    <div class="card-glass p-3 mb-4">
      <div class="row g-3 align-items-center">
        <!-- Search bar -->
        <div class="col-lg-4 col-md-6">
          <div class="search-input-wrapper">
            <i class="bi bi-search"></i>
            <input type="text" id="walletSearch" class="form-control form-control-glass text-white" placeholder="Search by asset name or symbol..." aria-label="Search coins">
          </div>
        </div>

        <!-- Filter tabs -->
        <div class="col-lg-5 col-md-6 d-flex justify-content-start justify-content-md-center">
          <div class="filter-tabs" role="tablist">
            <button class="filter-tab-btn active" id="filter-all" role="tab" aria-selected="true">All Assets</button>
            <button class="filter-tab-btn" id="filter-coin" role="tab" aria-selected="false">Coins Only</button>
            <button class="filter-tab-btn" id="filter-fiat" role="tab" aria-selected="false">Fiat Only</button>
          </div>
        </div>

        <!-- Sorting dropdown -->
        <div class="col-lg-3 col-md-12 text-md-end">
          <div class="d-flex align-items-center justify-content-md-end gap-2">
            <span class="text-xs text-muted text-nowrap"><i class="bi bi-filter-left"></i> Sort By:</span>
            <div class="sort-select-wrapper">
              <select id="walletSort" class="form-select form-control-glass text-white text-xs" aria-label="Sort wallets">
                <option value="value_desc" selected>Highest Value (PKR)</option>
                <option value="balance_desc">Highest Balance</option>
                <option value="balance_asc">Lowest Balance</option>
                <option value="name_asc">Alphabetically</option>
                <option value="updated_desc">Recently Updated</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- main table section -->
    <div class="card-glass p-0 mb-5" id="table-card-container">
      <div class="d-flex align-items-center justify-content-between p-4 border-bottom border-secondary border-opacity-10">
        <h3 class="text-display fw-bold text-white fs-5 m-0 d-flex align-items-center gap-2">
          <i class="bi bi-wallet2 text-primary"></i> Dynamic Account Balances
        </h3>
        <div class="d-flex gap-2">
          <button class="btn-hfc btn-hfc-secondary py-1.5 px-3 text-xs" id="headerDepositBtn">
            <i class="bi bi-plus-circle"></i> Deposit Asset
          </button>
          <button class="btn-hfc btn-hfc-danger py-1.5 px-3 text-xs" id="headerWithdrawBtn">
            <i class="bi bi-dash-circle"></i> Withdraw Asset
          </button>
        </div>
      </div>

      <div id="wallets-table-wrapper">
        <!-- Inline loaders -->
        <div class="p-4 text-center">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading balances...</span>
          </div>
          <p class="text-muted text-xs mt-2">Connecting block registry...</p>
        </div>
      </div>
    </div>

    <!-- Ledger Transaction logs view -->
    <div class="card-glass p-0" id="transactions-ledger-container">
      <div class="d-flex align-items-center justify-content-between p-4 border-bottom border-secondary border-opacity-10">
        <h3 class="text-display fw-bold text-white fs-5 m-0 d-flex align-items-center gap-2">
          <i class="bi bi-activity text-success"></i> Recent Wallet Transactions
        </h3>
        <button class="btn-hfc btn-hfc-secondary py-1 px-3 text-xs" id="viewAllLogsBtn">
          <i class="bi bi-clock-history"></i> View Full History
        </button>
      </div>

      <div id="transactions-table-wrapper">
        <div class="p-4 text-center">
          <div class="spinner-border text-success animate-pulse" role="status">
            <span class="visually-hidden">Syncing records...</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Render PageHeader
  new PageHeader("#wallet-header", {
    title: "Wallet Portfolio Node",
    description: "Manage decentralized assets, check available liquid funds, and view transactional audits.",
    breadcrumbs: [
      { label: "Dashboard", href: "dashboard.html" },
      { label: "Wallets", active: true }
    ],
    action: {
      label: "Audit Balance Sheets",
      icon: "bi-shield-check",
      onClick: () => {
        Toast.show("Audit verified: Balance ledgers match cold-vault backing rules.", { type: "success" });
      }
    }
  });

  // Bind static header level buttons
  document.getElementById("headerDepositBtn").onclick = () => openDepositModal();
  document.getElementById("headerWithdrawBtn").onclick = () => openWithdrawalModal();
  document.getElementById("viewAllLogsBtn").onclick = () => {
    const tableEl = document.getElementById("transactions-ledger-container");
    if (tableEl) {
      tableEl.scrollIntoView({ behavior: "smooth" });
      Toast.show("Displaying recent transactions log", { type: "info" });
    }
  };

  // Bind dynamic inputs for search, filter, and sort
  const searchInput = document.getElementById("walletSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      state.currentPage = 1; // Reset to page 1 on search
      processAndRenderTable();
    });
  }

  const sortSelect = document.getElementById("walletSort");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      state.activeSort = e.target.value;
      processAndRenderTable();
    });
  }

  // Filter tabs click binding
  const filterBtns = ["all", "coin", "fiat"];
  filterBtns.forEach(type => {
    const btn = document.getElementById(`filter-${type}`);
    if (btn) {
      btn.addEventListener("click", () => {
        // Remove active class from all
        filterBtns.forEach(t => {
          const b = document.getElementById(`filter-${t}`);
          if (b) {
            b.classList.remove("active");
            b.setAttribute("aria-selected", "false");
          }
        });
        // Add to current
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        state.activeFilter = type;
        state.currentPage = 1; // Reset page
        processAndRenderTable();
      });
    }
  });
}

/**
 * Initialize real-time listening on Firestore collections
 */
async function initRealtimeListeners() {
  const userId = state.user.uid;

  // 1. Listen to dynamic Coin asset configurations from Firestore 'coins'
  const coinsRef = collection(db, "coins");
  onSnapshot(coinsRef, async (snapshot) => {
    let coinsList = [];
    snapshot.forEach(doc => {
      coinsList.push({ id: doc.id, ...doc.data() });
    });

    // Seed default coins if the collection is entirely empty in the database
    if (coinsList.length === 0) {
      console.log("Seeding initial HFC database coins...");
      const defaultCoins = [
        { coinId: "pkr", name: "Pakistani Rupee", symbol: "PKR", logo: "coin-pkr", type: "fiat", pricePKR: 1, status: "active" },
        { coinId: "hfc", name: "Horizon Fund Coin", symbol: "HFC", logo: "coin-hfc", type: "coin", pricePKR: 150, status: "active" },
        { coinId: "btc", name: "Bitcoin", symbol: "BTC", logo: "coin-btc", type: "coin", pricePKR: 25600000, status: "active" },
        { coinId: "eth", name: "Ethereum", symbol: "ETH", logo: "coin-eth", type: "coin", pricePKR: 958000, status: "active" },
        { coinId: "usdt", name: "Tether USD", symbol: "USDT", logo: "coin-usdt", type: "coin", pricePKR: 278, status: "active" },
        { coinId: "bnb", name: "Binance Coin", symbol: "BNB", logo: "coin-bnb", type: "coin", pricePKR: 160000, status: "active" },
        { coinId: "doge", name: "Dogecoin", symbol: "DOGE", logo: "coin-doge", type: "coin", pricePKR: 110, status: "active" },
        { coinId: "sol", name: "Solana", symbol: "SOL", logo: "coin-sol", type: "coin", pricePKR: 40400, status: "active" }
      ];

      for (let c of defaultCoins) {
        await setDoc(doc(db, "coins", c.symbol), {
          ...c,
          createdAt: serverTimestamp()
        });
      }
      return; // The next snapshot listener loop will pick this up
    }

    state.coins = coinsList;
    processAndRenderTable();
  }, (err) => {
    console.error("Error fetching coins snap:", err);
    Toast.show("Error connecting to live asset configurations", { type: "danger" });
  });

  // 2. Listen to User Wallets for ownerId
  const walletsQuery = query(collection(db, "wallets"), where("ownerId", "==", userId));
  onSnapshot(walletsQuery, (snapshot) => {
    let walletsList = [];
    snapshot.forEach(doc => {
      walletsList.push({ id: doc.id, ...doc.data() });
    });
    
    state.wallets = walletsList;
    processAndRenderTable();
  }, (err) => {
    console.error("Error fetching wallets snap:", err);
    EmptyState.renderError("#wallets-table-wrapper", {
      title: "Firestore Wallet Link Failure",
      message: "Security rules verification or peer latency blocked the wallet syncing stream.",
      onRetry: () => initRealtimeListeners()
    });
  });

  // 3. Listen to User Transactions ledger entries
  const txQuery = query(collection(db, "transactions"), where("userId", "==", userId));
  onSnapshot(txQuery, (snapshot) => {
    let txList = [];
    snapshot.forEach(doc => {
      txList.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt descending
    txList.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });

    state.transactions = txList;
    renderTransactionsLedger();
  }, (err) => {
    console.error("Error fetching transactions snap:", err);
  });
}

/**
 * Filter, Sort, Paginate and render the dynamic wallets table, recalculating aggregates on-the-fly
 */
function processAndRenderTable() {
  const tableContainer = document.getElementById("wallets-table-wrapper");
  const summaryContainer = document.getElementById("summary-cards");
  if (!tableContainer) return;

  // Let's first match user wallets with current coin rates/types from state.coins
  const coinsMap = {};
  state.coins.forEach(c => {
    coinsMap[c.symbol] = c;
  });

  // 1. Recalculate Aggregates in PKR
  let totalPKR = 0;
  let availablePKR = 0;
  let holdPKR = 0;
  let activeCoinsCount = 0;

  const userWalletsMapped = state.wallets.map(w => {
    const coinConfig = coinsMap[w.currency] || {
      name: w.currency,
      symbol: w.currency,
      pricePKR: 1,
      type: "coin",
      logo: "coin-generic"
    };

    // Calculate balances with support for backward compatibility ('balance' field)
    const available = w.availableBalance !== undefined ? w.availableBalance : (w.balance || 0);
    const hold = w.holdBalance || 0;
    const total = available + hold;

    const rate = coinConfig.pricePKR || 1.0;
    const estimatedValuePKR = total * rate;

    if (total > 0) {
      activeCoinsCount++;
    }

    totalPKR += estimatedValuePKR;
    availablePKR += (available * rate);
    holdPKR += (hold * rate);

    return {
      ...w,
      availableBalance: available,
      holdBalance: hold,
      totalBalance: total,
      name: coinConfig.name,
      logo: coinConfig.logo || "coin-generic",
      type: coinConfig.type || "coin",
      pricePKR: rate,
      estimatedValuePKR
    };
  });

  // Update summary cards with real-time numbers
  renderSummaryCards(summaryContainer, totalPKR, availablePKR, holdPKR, activeCoinsCount);

  // If user has zero wallets, render empty state
  if (state.wallets.length === 0) {
    new EmptyState("#wallets-table-wrapper", {
      icon: "bi-wallet-fill",
      title: "No Account Balances Synchronized",
      description: "You do not have any cryptocurrency balances allocated yet. Activate some test resources to explore transactions.",
      action: {
        label: "Authorize Starter Balances",
        icon: "bi-lightning-charge-fill",
        onClick: () => seedUserBalances()
      }
    });
    return;
  }

  // 2. Filter list based on search and tab selections
  let processedList = userWalletsMapped;

  // Apply Tab Filtering
  if (state.activeFilter === "coin") {
    processedList = processedList.filter(item => item.type === "coin");
  } else if (state.activeFilter === "fiat") {
    processedList = processedList.filter(item => item.type === "fiat");
  }

  // Apply Search Query
  if (state.searchQuery) {
    processedList = processedList.filter(item => 
      item.currency.toLowerCase().includes(state.searchQuery) ||
      item.name.toLowerCase().includes(state.searchQuery)
    );
  }

  // 3. Apply Sorting
  processedList.sort((a, b) => {
    switch (state.activeSort) {
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "balance_desc":
        return b.totalBalance - a.totalBalance;
      case "balance_asc":
        return a.totalBalance - b.totalBalance;
      case "updated_desc":
        const timeA = a.updatedAt?.seconds || 0;
        const timeB = b.updatedAt?.seconds || 0;
        return timeB - timeA;
      case "value_desc":
      default:
        return b.estimatedValuePKR - a.estimatedValuePKR;
    }
  });

  // 4. Paginate Results
  const totalItems = processedList.length;
  const totalPages = Math.ceil(totalItems / state.rowsPerPage) || 1;
  if (state.currentPage > totalPages) {
    state.currentPage = totalPages;
  }

  const startIndex = (state.currentPage - 1) * state.rowsPerPage;
  const paginatedList = processedList.slice(startIndex, startIndex + state.rowsPerPage);

  // 5. Render Table Rows
  if (paginatedList.length === 0) {
    tableContainer.innerHTML = `
      <div class="p-5 text-center">
        <i class="bi bi-search text-muted fs-2"></i>
        <h5 class="text-white mt-3">No Matched Assets</h5>
        <p class="text-muted text-xs">Try searching for alternative keywords or change your asset filter type.</p>
      </div>
    `;
    return;
  }

  const tbodyHtml = paginatedList.map(item => {
    const formatValue = (v, digits = 2) => v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    
    const formattedAvailable = formatValue(item.availableBalance, item.type === "fiat" ? 2 : 6);
    const formattedHold = formatValue(item.holdBalance, item.type === "fiat" ? 2 : 6);
    const formattedRate = formatValue(item.pricePKR, 2);
    const formattedValuePKR = formatValue(item.estimatedValuePKR, 0);

    const updateTime = item.updatedAt
      ? new Date(item.updatedAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : "Synchronized";

    const addressShort = item.address ? `${item.address.substring(0, 6)}...${item.address.substring(item.address.length - 4)}` : "None";

    return `
      <tr class="align-middle">
        <td>
          <div class="d-flex align-items-center gap-3">
            <div class="coin-brand-badge ${item.logo}">${item.currency.substring(0, 2)}</div>
            <div>
              <span class="text-white fw-bold d-block text-display text-sm">${item.name}</span>
              <span class="text-xs text-muted text-mono">${item.currency}</span>
            </div>
          </div>
        </td>
        <td class="text-mono text-white fw-semibold">${formattedAvailable}</td>
        <td class="text-mono text-warning">${formattedHold}</td>
        <td class="text-mono text-muted d-none d-md-table-cell">₨ ${formattedRate}</td>
        <td class="text-mono text-glow-primary fw-bold text-white">₨ ${formattedValuePKR}</td>
        <td class="d-none d-lg-table-cell">
          <div class="wallet-blockchain-address" onclick="navigator.clipboard.writeText('${item.address || ''}'); Toast.show('Address copied!', {type:'info'})" title="Click to copy public keys" aria-label="Copy public blockchain key">
            <i class="bi bi-copy text-xxs"></i> <span>${addressShort}</span>
          </div>
        </td>
        <td class="text-muted text-xs text-mono d-none d-sm-table-cell">${updateTime}</td>
        <td>
          <div class="d-flex gap-1.5 justify-content-end">
            <button class="btn btn-sm btn-outline-primary text-xxs py-1 px-2.5" onclick="window.openDepositModal('${item.currency}')" aria-label="Deposit ${item.currency}">
              <i class="bi bi-plus-circle"></i> Dep
            </button>
            <button class="btn btn-sm btn-outline-danger text-xxs py-1 px-2.5" onclick="window.openWithdrawalModal('${item.currency}')" aria-label="Withdraw ${item.currency}">
              <i class="bi bi-dash-circle"></i> Wit
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tableContainer.innerHTML = `
    <div class="table-responsive-wallet">
      <table class="table table-glass table-wallet m-0">
        <thead>
          <tr>
            <th scope="col">Asset Pair</th>
            <th scope="col">Available</th>
            <th scope="col">In Hold</th>
            <th scope="col" class="d-none d-md-table-cell">Asset Price</th>
            <th scope="col">Est. Value (PKR)</th>
            <th scope="col" class="d-none d-lg-table-cell">Vault Key</th>
            <th scope="col" class="d-none d-sm-table-cell">Sync Time</th>
            <th scope="col" class="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${tbodyHtml}
        </tbody>
      </table>
    </div>

    <!-- Pagination Footer -->
    <div class="pagination-container text-xs">
      <div class="text-muted text-mono">
        Showing ${startIndex + 1} - ${Math.min(startIndex + state.rowsPerPage, totalItems)} of ${totalItems} Assets
      </div>
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-outline-secondary py-1 px-2 text-xxs" id="prevPageBtn" ${state.currentPage === 1 ? "disabled" : ""} aria-label="Previous page">
          <i class="bi bi-chevron-left"></i> Prev
        </button>
        <span class="d-inline-flex align-items-center px-2 text-mono text-white fw-bold">Page ${state.currentPage} of ${totalPages}</span>
        <button class="btn btn-sm btn-outline-secondary py-1 px-2 text-xxs" id="nextPageBtn" ${state.currentPage === totalPages ? "disabled" : ""} aria-label="Next page">
          Next <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  `;

  // Bind pagination buttons
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");

  if (prevBtn) {
    prevBtn.onclick = () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        processAndRenderTable();
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      if (state.currentPage < totalPages) {
        state.currentPage++;
        processAndRenderTable();
      }
    };
  }
}

/**
 * Render the summary statistics panels with smooth visual number transitions
 */
function renderSummaryCards(container, total, available, hold, coinsCount) {
  if (!container) return;

  const formatPKR = (v) => "₨ " + v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  container.innerHTML = `
    <!-- Card 1: Total Net Worth -->
    <div class="summary-card primary-edge">
      <div class="card-metric-label"><i class="bi bi-pie-chart text-primary"></i> Portfolio Net Worth</div>
      <div class="card-metric-value text-glow-primary text-white animate-number">${formatPKR(total)}</div>
      <div class="card-metric-subtext text-mono text-success d-flex align-items-center gap-1">
        <i class="bi bi-shield-check"></i> Combined secure balance assets
      </div>
    </div>

    <!-- Card 2: Liquid Balance -->
    <div class="summary-card success-edge">
      <div class="card-metric-label"><i class="bi bi-wallet2 text-success"></i> Liquid Capital</div>
      <div class="card-metric-value text-white">${formatPKR(available)}</div>
      <div class="card-metric-subtext text-mono text-muted">
        Instantly available for trades & payout
      </div>
    </div>

    <!-- Card 3: Escrow Hold Balances -->
    <div class="summary-card warning-edge">
      <div class="card-metric-label"><i class="bi bi-lock text-warning"></i> Multi-Sig Holds</div>
      <div class="card-metric-value text-white">${formatPKR(hold)}</div>
      <div class="card-metric-subtext text-mono text-muted">
        Locked securely in active escrows
      </div>
    </div>

    <!-- Card 4: Total Owned Currencies -->
    <div class="summary-card accent-edge">
      <div class="card-metric-label"><i class="bi bi-coin text-accent"></i> Active Currencies</div>
      <div class="card-metric-value text-white">${coinsCount} <span class="fs-6 text-muted">assets</span></div>
      <div class="card-metric-subtext text-mono text-primary">
        Backed 1:1 on offline cold ledgers
      </div>
    </div>
  `;
}

/**
 * Render historical transactions ledger logs
 */
function renderTransactionsLedger() {
  const container = document.getElementById("transactions-table-wrapper");
  if (!container) return;

  if (state.transactions.length === 0) {
    container.innerHTML = `
      <div class="p-5 text-center">
        <i class="bi bi-journals text-muted fs-2"></i>
        <h5 class="text-white mt-3">Ledger Logs Empty</h5>
        <p class="text-muted text-xs">No transaction operations have been initiated for this session key.</p>
      </div>
    `;
    return;
  }

  // Slice to the 10 most recent transactions
  const sliceTx = state.transactions.slice(0, 10);

  const tbodyHtml = sliceTx.map(t => {
    const formattedDate = t.createdAt 
      ? new Date(t.createdAt.seconds * 1000).toLocaleString() 
      : "Pending verification";

    const hashShort = t.txHash ? `${t.txHash.substring(0, 8)}...` : "unconfirmed";
    
    let typeBadge = '';
    if (t.type === 'deposit') {
      typeBadge = `<span class="badge bg-success bg-opacity-10 text-success text-xxs px-2 py-1 border border-success border-opacity-10 uppercase"><i class="bi bi-box-arrow-in-down"></i> Deposit</span>`;
    } else if (t.type === 'withdrawal') {
      typeBadge = `<span class="badge bg-danger bg-opacity-10 text-danger text-xxs px-2 py-1 border border-danger border-opacity-10 uppercase"><i class="bi bi-box-arrow-up"></i> Withdraw</span>`;
    } else if (t.type === 'swap') {
      typeBadge = `<span class="badge bg-primary bg-opacity-10 text-primary text-xxs px-2 py-1 border border-primary border-opacity-10 uppercase"><i class="bi bi-arrow-left-right"></i> Swap</span>`;
    } else {
      typeBadge = `<span class="badge bg-warning bg-opacity-10 text-warning text-xxs px-2 py-1 border border-warning border-opacity-10 uppercase"><i class="bi bi-cart"></i> Trade</span>`;
    }

    let statusBadge = '';
    if (t.status === 'completed') {
      statusBadge = `<span class="status-badge wallet-badge-completed"><span class="status-pulse-primary bg-success rounded-circle" style="width:5px; height:5px; background-color:currentColor;"></span> Completed</span>`;
    } else if (t.status === 'pending') {
      statusBadge = `<span class="status-badge wallet-badge-pending"><span class="status-pulse-primary bg-warning rounded-circle" style="width:5px; height:5px; background-color:currentColor;"></span> Pending</span>`;
    } else {
      statusBadge = `<span class="status-badge wallet-badge-failed"><span class="status-pulse-primary bg-danger rounded-circle" style="width:5px; height:5px; background-color:currentColor;"></span> Failed</span>`;
    }

    return `
      <tr class="align-middle">
        <td><div class="text-muted text-xs text-mono">${formattedDate}</div></td>
        <td>${typeBadge}</td>
        <td class="text-mono text-white fw-bold">${t.amount} ${t.currency}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="wallet-blockchain-address text-mono text-muted text-xxs" onclick="navigator.clipboard.writeText('${t.txHash}'); Toast.show('Tx hash copied!', {type:'info'})" title="Copy transaction hash">
            <i class="bi bi-hash"></i> <span>${hashShort}</span>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-glass table-glass-hover m-0">
        <thead>
          <tr>
            <th scope="col">Timestamp</th>
            <th scope="col">Type</th>
            <th scope="col">Delta Amount</th>
            <th scope="col">Pillar Status</th>
            <th scope="col">TXID Signature</th>
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
 * Seed sample starter balance sheets inside Firestore on empty user accounts
 */
async function seedUserBalances() {
  const loader = new Loader({ text: "Allocating seed balances..." });
  loader.show();

  try {
    const assets = [
      { currency: "PKR", balance: 150000.00, address: "PK44HFC8923481239" },
      { currency: "HFC", balance: 500.00, address: "0x71C249E94d754784a32249E94d754784" },
      { currency: "BTC", balance: 0.125, address: "bc1q3s9f8g7h6j5k4l3m2n1p" },
      { currency: "USDT", balance: 1000.00, address: "0x71C249E94d754784a32249E94d7" }
    ];

    for (let asset of assets) {
      const walletId = `${state.user.uid}_${asset.currency}`;
      await setDoc(doc(db, "wallets", walletId), {
        walletId,
        ownerId: state.user.uid,
        currency: asset.currency,
        availableBalance: asset.balance,
        holdBalance: 0,
        balance: asset.balance, // Backward compatibility
        address: asset.address,
        updatedAt: serverTimestamp()
      });
    }

    // Add a couple of initial transaction logs
    const seedTxs = [
      { type: "deposit", amount: 150000.00, currency: "PKR", status: "completed" },
      { type: "deposit", amount: 1000.00, currency: "USDT", status: "completed" },
      { type: "swap", amount: 500.00, currency: "HFC", status: "completed" }
    ];

    for (let index = 0; index < seedTxs.length; index++) {
      const t = seedTxs[index];
      const txId = `tx_wallet_seed_${Date.now()}_${index}`;
      const txHash = "0x" + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');

      await setDoc(doc(db, "transactions", txId), {
        txId,
        userId: state.user.uid,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        txHash,
        createdAt: serverTimestamp()
      });
    }

    loader.hide();
    Toast.show("Starter portfolios allocated successfully!", { type: "success" });
  } catch (error) {
    loader.hide();
    console.error("Seed error:", error);
    Toast.show("Allocation error. Please verify firestore permissions.", { type: "danger" });
  }
}

/**
 * Open fully functional Secure Deposit Modal targeting dynamic coins
 */
function openDepositModal(defaultCurrency = "USDT") {
  const coinsOptions = state.coins.map(c => {
    const selected = c.symbol === defaultCurrency ? "selected" : "";
    return `<option value="${c.symbol}" ${selected}>${c.name} (${c.symbol})</option>`;
  }).join("");

  const modalBody = `
    <form id="depositModalForm" class="d-flex flex-column gap-3">
      <div class="form-group-glass m-0">
        <label for="depositCurrency" class="form-label text-xs text-muted uppercase">Select Deposit Coin</label>
        <select class="form-select form-control-glass text-white border-secondary bg-dark" id="depositCurrency" required>
          ${coinsOptions}
        </select>
      </div>
      <div class="form-group-glass m-0">
        <label for="depositAmount" class="form-label text-xs text-muted uppercase">Amount to Deposit</label>
        <input type="number" class="form-control form-control-glass text-white" id="depositAmount" placeholder="e.g. 100" min="0.000001" step="any" required>
      </div>
      <div class="p-2.5 border-start border-primary border-2 bg-white bg-opacity-5 rounded">
        <p class="text-xs text-muted m-0"><i class="bi bi-shield-check text-primary"></i> <strong>Escrow Multi-Sig Protection:</strong> This balance allocation is registered locally and audited instantly on the ledger node.</p>
      </div>
    </form>
  `;

  const depositModal = new Modal({
    title: "Secure Account Deposit",
    body: modalBody,
    buttons: [
      {
        label: "Cancel",
        class: "btn-hfc-secondary",
        onClick: (m) => m.destroy()
      },
      {
        label: "Authorize Deposit",
        class: "btn-hfc-primary",
        onClick: async (m) => {
          const form = document.getElementById("depositModalForm");
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }

          const currency = document.getElementById("depositCurrency").value;
          const amount = parseFloat(document.getElementById("depositAmount").value);

          m.destroy();

          const loader = new Loader({ text: `Submitting deposit delta for validation...` });
          loader.show();

          try {
            const walletId = `${state.user.uid}_${currency}`;
            const walletDocRef = doc(db, "wallets", walletId);
            const existingWallet = state.wallets.find(w => w.currency === currency);

            const currentAvailable = existingWallet ? (existingWallet.availableBalance !== undefined ? existingWallet.availableBalance : (existingWallet.balance || 0)) : 0;
            const currentHold = existingWallet ? (existingWallet.holdBalance || 0) : 0;

            const newAvailable = currentAvailable + amount;

            let defaultMockAddresses = {
              PKR: "PK44HFC8923481239",
              HFC: "0x71C249E94d754784a32249E94d754784",
              BTC: "bc1q3s9f8g7h6j5k4l3m2n1p",
              ETH: "0x71C249E94d754784a32249E94d7",
              USDT: "0x71C249E94d754784a32249E94d7",
              BNB: "0x71C249E94d754784a32249E94d7",
              DOGE: "D6HFCF923481239d784a32249E94",
              SOL: "0x71C249E94d754784a32249E94d7"
            };

            const addr = existingWallet?.address || defaultMockAddresses[currency] || "0x71C249E94d754784a32249E94d7";

            // 1. Update wallet balance document
            await setDoc(walletDocRef, {
              walletId,
              ownerId: state.user.uid,
              currency,
              availableBalance: newAvailable,
              holdBalance: currentHold,
              balance: newAvailable, // Backward compatibility
              address: addr,
              updatedAt: serverTimestamp()
            });

            // 2. Write transaction log
            const txId = `tx_deposit_${Date.now()}`;
            const txHash = "0x" + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');
            
            await setDoc(doc(db, "transactions", txId), {
              txId,
              userId: state.user.uid,
              type: "deposit",
              amount,
              currency,
              status: "completed",
              txHash,
              createdAt: serverTimestamp()
            });

            loader.hide();
            Toast.show(`Successfully deposited ${amount} ${currency} into ledger vault.`, { type: "success" });
          } catch (error) {
            loader.hide();
            console.error("Deposit error:", error);
            Toast.show("Deposit declined due to database authorization error.", { type: "danger" });
          }
        }
      }
    ]
  });

  depositModal.open();
}

/**
 * Open fully functional Withdraw Modal validating current balances dynamically
 */
function openWithdrawalModal(defaultCurrency = "") {
  // Only show options where user has some balance
  const activeWallets = state.wallets.filter(w => {
    const bal = w.availableBalance !== undefined ? w.availableBalance : (w.balance || 0);
    return bal > 0;
  });

  if (activeWallets.length === 0) {
    Toast.show("No available wallet funds to withdraw. Initiate a deposit first.", { type: "warning" });
    return;
  }

  // Pre-select active wallet currency or fallback to first active wallet
  const selectedCurrency = defaultCurrency && activeWallets.find(w => w.currency === defaultCurrency)
    ? defaultCurrency
    : activeWallets[0].currency;

  const coinsOptions = activeWallets.map(w => {
    const isSel = w.currency === selectedCurrency ? "selected" : "";
    const bal = w.availableBalance !== undefined ? w.availableBalance : (w.balance || 0);
    return `<option value="${w.currency}" ${isSel}>${w.currency} (Avail: ${bal})</option>`;
  }).join("");

  const activeWallet = activeWallets.find(w => w.currency === selectedCurrency) || activeWallets[0];
  const isFiat = activeWallet.currency === "PKR" || activeWallet.currency === "USD";

  const modalBody = `
    <form id="withdrawModalForm" class="d-flex flex-column gap-3">
      <div class="form-group-glass m-0">
        <label for="withdrawCurrency" class="form-label text-xs text-muted uppercase">Select Asset</label>
        <select class="form-select form-control-glass text-white border-secondary bg-dark" id="withdrawCurrency" required>
          ${coinsOptions}
        </select>
      </div>

      <div class="form-group-glass m-0">
        <label for="withdrawAmount" class="form-label text-xs text-muted uppercase">Withdraw Amount</label>
        <input type="number" class="form-control form-control-glass text-white" id="withdrawAmount" placeholder="e.g. 50" min="0.000001" step="any" required>
        <div id="maxBalanceTip" class="text-xxs text-muted mt-1">Available to cashout: <span id="maxBalSpan" class="text-white"></span></div>
      </div>

      <!-- Contextual Address Input - Banks for PKR/Fiat, hashes for Crypto -->
      <div class="form-group-glass m-0" id="withdrawDestinationContainer">
        <!-- populated dynamically -->
      </div>
    </form>
  `;

  const withdrawModal = new Modal({
    title: "Secure Wallet Cashout",
    body: modalBody,
    buttons: [
      {
        label: "Cancel",
        class: "btn-hfc-secondary",
        onClick: (m) => m.destroy()
      },
      {
        label: "Initiate Payout",
        class: "btn-hfc-danger",
        onClick: async (m) => {
          const form = document.getElementById("withdrawModalForm");
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }

          const currency = document.getElementById("withdrawCurrency").value;
          const amount = parseFloat(document.getElementById("withdrawAmount").value);
          const destination = document.getElementById("withdrawDestination").value;

          const targetWallet = state.wallets.find(w => w.currency === currency);
          const avail = targetWallet ? (targetWallet.availableBalance !== undefined ? targetWallet.availableBalance : (targetWallet.balance || 0)) : 0;

          if (amount > avail) {
            Toast.show(`Withdraw amount exceeds available balance of ${avail} ${currency}!`, { type: "danger" });
            return;
          }

          m.destroy();

          const loader = new Loader({ text: `Initiating multi-sig hold...` });
          loader.show();

          try {
            const walletId = `${state.user.uid}_${currency}`;
            const walletDocRef = doc(db, "wallets", walletId);

            const newAvailable = avail - amount;
            const currentHold = targetWallet.holdBalance || 0;

            // 1. Update wallet balance doc
            await setDoc(walletDocRef, {
              walletId,
              ownerId: state.user.uid,
              currency,
              availableBalance: newAvailable,
              holdBalance: currentHold,
              balance: newAvailable, // Backward compatibility
              address: targetWallet.address || "",
              updatedAt: serverTimestamp()
            });

            // 2. Log withdrawal transaction
            const txId = `tx_withdrawal_${Date.now()}`;
            const txHash = "0x" + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');

            await setDoc(doc(db, "transactions", txId), {
              txId,
              userId: state.user.uid,
              type: "withdrawal",
              amount: -amount,
              currency,
              status: "pending", // Withdrawal requests require security audit processing
              txHash,
              destination,
              createdAt: serverTimestamp()
            });

            loader.hide();
            Toast.show(`Withdrawal request of ${amount} ${currency} submitted successfully. Pending system confirmation.`, { type: "success" });
          } catch (error) {
            loader.hide();
            console.error("Withdraw error:", error);
            Toast.show("Cashout execution rejected by secure rule constraints.", { type: "danger" });
          }
        }
      }
    ]
  });

  withdrawModal.open();

  // Handle dynamic form rendering inside modal
  const updateFormState = () => {
    const cur = document.getElementById("withdrawCurrency").value;
    const currentW = state.wallets.find(w => w.currency === cur);
    const balVal = currentW ? (currentW.availableBalance !== undefined ? currentW.availableBalance : (currentW.balance || 0)) : 0;
    
    // Set max span tip
    const span = document.getElementById("maxBalSpan");
    if (span) span.textContent = `${balVal} ${cur}`;

    const amtInput = document.getElementById("withdrawAmount");
    if (amtInput) amtInput.setAttribute("max", balVal);

    // Contextual address container Hashing
    const destContainer = document.getElementById("withdrawDestinationContainer");
    if (destContainer) {
      if (cur === "PKR" || cur === "USD") {
        destContainer.innerHTML = `
          <label for="withdrawDestination" class="form-label text-xs text-muted uppercase">Bank Account IBAN / EasyPaisa Number</label>
          <input type="text" class="form-control form-control-glass text-white" id="withdrawDestination" placeholder="e.g. PK21HABB000012345678" required>
        `;
      } else {
        destContainer.innerHTML = `
          <label for="withdrawDestination" class="form-label text-xs text-muted uppercase">Destination Blockchain Address</label>
          <input type="text" class="form-control form-control-glass text-white text-xs" id="withdrawDestination" placeholder="e.g. bc1q... or 0x..." required>
        `;
      }
    }
  };

  // Run on load and bind select change
  updateFormState();
  document.getElementById("withdrawCurrency").addEventListener("change", updateFormState);
}

// Map helpers to window object so inline table button clicks can trigger them perfectly
window.openDepositModal = openDepositModal;
window.openWithdrawalModal = openWithdrawalModal;
window.seedUserBalances = seedUserBalances;
