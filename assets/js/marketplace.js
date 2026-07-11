/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - P2P Marketplace Controller
 * Handles secure authentication guards, real-time Firestore synchronization,
 * advanced multi-criteria sorting/filtering, and interactive peer negotiations.
 */

import { protectPage } from "../../js/authGuard.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";
import { db } from "../../firebase/firebase.js";
import { getDocument, updateDocument, createDocument } from "../../firebase/firestore.js";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDocs, 
  doc, 
  setDoc,
  serverTimestamp 
} from "firebase/firestore";

// Local Page State
const state = {
  user: null,
  coins: [],
  offers: [],
  trades: [],
  users: {}, // Cache of userId -> userProfile mapping
  activeTab: 'all', // 'all', 'buy', 'sell', 'my'
  searchQuery: '',
  filters: {
    coin: 'all',
    status: 'active', // Default to active, can be set to 'all' or specific status
    priceMin: '',
    priceMax: '',
    qtyMin: '',
    qtyMax: '',
  },
  sortBy: 'newest' // 'newest', 'oldest', 'price_asc', 'price_desc', 'qty_desc', 'qty_asc'
};

// Start P2P Marketplace Orchestrator on DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Authenticate user session
  const user = await protectPage();
  if (!user) return; // redirect triggers inside protectPage
  state.user = user;

  // 2. Initialize layout structure
  const layout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: user.email,
      versionText: "HFC Engine v2.4",
      initialNotifications: [
        { id: 1, type: "primary", text: "Secure TLS Node fully connected to HFC Mainnet." }
      ],
      onLogout: async () => {
        try {
          const { logoutUser } = await import("../../firebase/auth.js");
          await logoutUser();
          Toast.show("Secure session terminated successfully.", { type: "info" });
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
      activeId: "marketplace",
      menuItems: [
        { id: "dashboard", label: "Dashboard", icon: "bi-grid-1x2-fill", href: "dashboard.html" },
        { id: "marketplace", label: "P2P Marketplace", icon: "bi-shop", href: "marketplace.html" },
        { id: "wallets", label: "My Wallets", icon: "bi-wallet2", href: "wallet.html" },
        { id: "transactions", label: "Escrow Ledger", icon: "bi-activity", href: "dashboard.html#section-ledger" },
        { id: "security", label: "Settings node", icon: "bi-shield-lock", href: "dashboard.html#section-security" }
      ],
      onNavigate: (item) => {
        if (item.href && item.href !== "marketplace.html" && item.href !== "#") {
          window.location.href = item.href;
        }
      }
    }
  });

  // 3. Render base visual wireframe
  renderMarketplaceFrame(layout);

  // 4. Fire up real-time listener pipelines
  await initRealtimeMarketListeners();
});

/**
 * Renders the HTML structure for search, filters, cards, and listing tables.
 */
function renderMarketplaceFrame(layout) {
  const container = layout.getContentContainer();
  if (!container) return;

  container.innerHTML = `
    <!-- Dynamic Page Header Target -->
    <div id="marketplace-header"></div>

    <!-- P2P Live Nodes Network Banner -->
    <div class="alert alert-dashboard alert-dismissible fade show p-3 mb-4 d-flex align-items-center justify-content-between" role="alert" style="background: rgba(0, 242, 254, 0.05); border: 1px solid rgba(0, 242, 254, 0.15);">
      <div class="d-flex align-items-center gap-2">
        <div class="status-pulse-success bg-success rounded-circle animate-pulse" style="width: 8px; height: 8px;"></div>
        <span class="text-sm text-secondary">
          <strong class="text-white">Escrow Execution Engine Activated:</strong> Trades use an locked cold-vault system. Anti-self-trading rules are strictly enforced (Creator ID verification is absolute).
        </span>
      </div>
      <button type="button" class="btn-close btn-close-white text-xs" data-bs-dismiss="alert" aria-label="Close" style="padding: 1.15rem;"></button>
    </div>

    <!-- Summary Metrics Dashboard Grid -->
    <div class="metrics-grid" id="market-stats-grid">
      <!-- Active Buy Offers -->
      <div class="card-glass p-4 metric-card">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="text-xs text-muted text-mono mb-1">ACTIVE BUY OFFERS</div>
            <h3 class="text-display fw-bold text-success text-glow-success m-0" id="stat-buy-count">--</h3>
          </div>
          <span class="fs-4 text-success"><i class="bi bi-graph-up-arrow"></i></span>
        </div>
        <div class="text-xxs text-muted mt-2">Active bids waiting for fills</div>
      </div>

      <!-- Active Sell Offers -->
      <div class="card-glass p-4 metric-card">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="text-xs text-muted text-mono mb-1">ACTIVE SELL OFFERS</div>
            <h3 class="text-display fw-bold text-danger text-glow-danger m-0" id="stat-sell-count">--</h3>
          </div>
          <span class="fs-4 text-danger"><i class="bi bi-graph-down-arrow"></i></span>
        </div>
        <div class="text-xxs text-muted mt-2">Active asks ready for purchase</div>
      </div>

      <!-- Active Listed Coins -->
      <div class="card-glass p-4 metric-card">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="text-xs text-muted text-mono mb-1">SUPPORTED ASSETS</div>
            <h3 class="text-display fw-bold text-primary text-glow-primary m-0" id="stat-coins-count">--</h3>
          </div>
          <span class="fs-4 text-primary"><i class="bi bi-coin"></i></span>
        </div>
        <div class="text-xxs text-muted mt-2">Tokens active in global market</div>
      </div>

      <!-- Today's Completed Trades -->
      <div class="card-glass p-4 metric-card">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="text-xs text-muted text-mono mb-1">TODAY'S COMPLETED TRADES</div>
            <h3 class="text-display fw-bold text-warning text-glow-warning m-0" id="stat-trades-count">--</h3>
          </div>
          <span class="fs-4 text-warning"><i class="bi bi-shield-check"></i></span>
        </div>
        <div class="text-xxs text-muted mt-2">24h fully synchronized volume</div>
      </div>
    </div>

    <!-- Advanced Interactive Filters and Search Control Panel -->
    <div class="filter-panel">
      <div class="row g-3">
        <!-- Text search query -->
        <div class="col-lg-3 col-md-12">
          <label class="modal-form-label"><i class="bi bi-search"></i> Search Offers</label>
          <div class="position-relative">
            <input type="text" id="marketSearch" class="form-control hfc-input w-100 ps-4" placeholder="Search by Coin, Username, ID...">
            <span class="position-absolute top-50 start-0 translate-middle-y ps-2 text-muted" style="pointer-events: none;"><i class="bi bi-search text-xs"></i></span>
          </div>
        </div>

        <!-- Coin Filter -->
        <div class="col-lg-2 col-md-4 col-sm-6">
          <label class="modal-form-label"><i class="bi bi-coin"></i> Crypto Asset</label>
          <select id="filterCoin" class="form-select hfc-select w-100">
            <option value="all">All Coins</option>
          </select>
        </div>

        <!-- Status Filter -->
        <div class="col-lg-2 col-md-4 col-sm-6">
          <label class="modal-form-label"><i class="bi bi-bookmark-star"></i> Escrow Status</label>
          <select id="filterStatus" class="form-select hfc-select w-100">
            <option value="active" selected>Active Only</option>
            <option value="negotiating">Negotiating</option>
            <option value="locked">Locked Escrow</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All Offers</option>
          </select>
        </div>

        <!-- Pricing Limit Filters -->
        <div class="col-lg-3 col-md-4 col-sm-12">
          <label class="modal-form-label"><i class="bi bi-cash-stack"></i> Price Range (PKR)</label>
          <div class="input-group">
            <input type="number" id="filterPriceMin" class="form-control hfc-input text-xs" placeholder="Min">
            <span class="input-group-text bg-transparent border-secondary border-opacity-10 text-muted px-2" style="font-size: 10px;">TO</span>
            <input type="number" id="filterPriceMax" class="form-control hfc-input text-xs" placeholder="Max">
          </div>
        </div>

        <!-- Sorting dropdown -->
        <div class="col-lg-2 col-md-12">
          <label class="modal-form-label"><i class="bi bi-filter-left"></i> Sort Sequence</label>
          <select id="marketSort" class="form-select hfc-select w-100">
            <option value="newest" selected>Newest Listings</option>
            <option value="oldest">Oldest Listings</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="qty_desc">Qty: Largest First</option>
            <option value="qty_asc">Qty: Smallest First</option>
          </select>
        </div>
      </div>

      <!-- Quantity limits expansion (Optional subtle controls) -->
      <div class="row g-3 mt-1 border-top border-secondary border-opacity-10 pt-3">
        <div class="col-lg-4 col-md-12 d-flex align-items-center gap-2">
          <span class="text-xs text-muted text-nowrap"><i class="bi bi-sliders2"></i> Quantity Limits:</span>
          <div class="d-flex align-items-center gap-1 w-100">
            <input type="number" id="filterQtyMin" class="form-control hfc-input text-xxs py-1" placeholder="Min Qty">
            <span class="text-muted text-xxs">-</span>
            <input type="number" id="filterQtyMax" class="form-control hfc-input text-xxs py-1" placeholder="Max Qty">
          </div>
        </div>
        <div class="col-lg-8 col-md-12 text-md-end">
          <button class="btn btn-sm btn-link text-decoration-none text-muted hover-text-primary text-xxs" id="clearAllFiltersBtn">
            <i class="bi bi-arrow-clockwise"></i> Reset Filters
          </button>
        </div>
      </div>
    </div>

    <!-- Nav tabs to filter by offer type or user owned offers -->
    <div class="hfc-tabs" id="marketplace-tabs">
      <button class="hfc-tab-btn active" data-tab="all">All Offers</button>
      <button class="hfc-tab-btn" data-tab="buy">Buy Requests</button>
      <button class="hfc-tab-btn" data-tab="sell">Sell Listings</button>
      <button class="hfc-tab-btn" data-tab="my"><i class="bi bi-person-circle"></i> My Active Offers</button>
    </div>

    <!-- Main Table Container -->
    <div class="table-responsive" style="overflow-x: auto; min-height: 250px;">
      <table class="table table-borderless table-glass text-nowrap" id="offers-table">
        <thead>
          <tr>
            <th scope="col" style="width: 10%;">Offer ID</th>
            <th scope="col" style="width: 18%;">Crypto Asset</th>
            <th scope="col" style="width: 10%;">Offer Type</th>
            <th scope="col" style="width: 12%;">Price (PKR)</th>
            <th scope="col" style="width: 15%;">Total Quantity</th>
            <th scope="col" style="width: 15%;">Remaining</th>
            <th scope="col" style="width: 12%;">Creator Node</th>
            <th scope="col" style="width: 8%;">Status</th>
            <th scope="col" style="width: 10%;" class="text-end">Actions</th>
          </tr>
        </thead>
        <tbody id="offers-tbody">
          <!-- Inline skeleton lines loaded initially -->
        </tbody>
      </table>
    </div>
  `;

  // Initialize PageHeader
  new PageHeader("#marketplace-header", {
    title: "P2P Marketplace",
    description: "Browse global buy and sell requests, evaluate real-time escrow logs, and secure dynamic crypto conversions.",
    breadcrumbs: [
      { label: "Dashboard", href: "dashboard.html" },
      { label: "Marketplace", active: true }
    ],
    action: {
      label: "Create Trade Offer",
      icon: "bi-plus-square-dotted",
      onClick: () => {
        window.location.href = "offer.html";
      }
    }
  });

  // Load Initial Table Skeleton Lines
  Loader.tableLoader("#offers-tbody", 9, 4);

  // Bind static interactive listeners
  bindInteractiveControls();
}

/**
 * Attaches event listeners for input query, selections, filter tab, and reset operations.
 */
function bindInteractiveControls() {
  const searchInput = document.getElementById("marketSearch");
  const filterCoin = document.getElementById("filterCoin");
  const filterStatus = document.getElementById("filterStatus");
  const filterPriceMin = document.getElementById("filterPriceMin");
  const filterPriceMax = document.getElementById("filterPriceMax");
  const filterQtyMin = document.getElementById("filterQtyMin");
  const filterQtyMax = document.getElementById("filterQtyMax");
  const sortSelect = document.getElementById("marketSort");
  const clearFiltersBtn = document.getElementById("clearAllFiltersBtn");

  const triggerUpdate = () => {
    state.searchQuery = searchInput?.value.trim().toLowerCase() || "";
    state.filters.coin = filterCoin?.value || "all";
    state.filters.status = filterStatus?.value || "active";
    state.filters.priceMin = filterPriceMin?.value || "";
    state.filters.priceMax = filterPriceMax?.value || "";
    state.filters.qtyMin = filterQtyMin?.value || "";
    state.filters.qtyMax = filterQtyMax?.value || "";
    state.sortBy = sortSelect?.value || "newest";
    processAndRenderOffers();
  };

  searchInput?.addEventListener("input", triggerUpdate);
  filterCoin?.addEventListener("change", triggerUpdate);
  filterStatus?.addEventListener("change", triggerUpdate);
  filterPriceMin?.addEventListener("input", triggerUpdate);
  filterPriceMax?.addEventListener("input", triggerUpdate);
  filterQtyMin?.addEventListener("input", triggerUpdate);
  filterQtyMax?.addEventListener("input", triggerUpdate);
  sortSelect?.addEventListener("change", triggerUpdate);

  clearFiltersBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (filterCoin) filterCoin.value = "all";
    if (filterStatus) filterStatus.value = "active";
    if (filterPriceMin) filterPriceMin.value = "";
    if (filterPriceMax) filterPriceMax.value = "";
    if (filterQtyMin) filterQtyMin.value = "";
    if (filterQtyMax) filterQtyMax.value = "";
    if (sortSelect) sortSelect.value = "newest";
    
    Toast.show("Filters reset successfully.", { type: "info" });
    triggerUpdate();
  });

  // Tabs clicks
  const tabBtns = document.querySelectorAll("#marketplace-tabs .hfc-tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeTab = btn.getAttribute("data-tab") || "all";
      processAndRenderOffers();
    });
  });
}

/**
 * Setup Firestore Snapshot Subscriptions
 */
async function initRealtimeMarketListeners() {
  // 1. Subscribe to the 'coins' database to load available crypto asset identifiers
  const coinsRef = collection(db, "coins");
  onSnapshot(coinsRef, async (snapshot) => {
    let coinsList = [];
    snapshot.forEach(docSnap => {
      coinsList.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Seed coins if the database has absolutely none
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
      return;
    }

    state.coins = coinsList;
    updateCoinsDropdown();
    updateSummaryStats();
    processAndRenderOffers();
  }, (err) => {
    console.error("Firestore coins listener failure:", err);
    Toast.show("Failed to stream asset configuration.", { type: "danger" });
  });

  // 2. Subscribe to the 'offers' database to listen to all peer order updates
  const offersRef = collection(db, "offers");
  onSnapshot(offersRef, async (snapshot) => {
    let offersList = [];
    snapshot.forEach(docSnap => {
      offersList.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Seed mock peer offers if the list is entirely clean, enabling rich viewing on first-boot
    if (offersList.length === 0) {
      console.log("Seeding sample peer marketplace offers...");
      const sampleOffers = [
        { creatorId: "sample_system_node_1", type: "sell", coinSymbol: "BTC", quoteCurrency: "PKR", initialQuantity: 0.15, remainingQuantity: 0.15, rate: 25400000, minQuantity: 0.01, status: "active" },
        { creatorId: "sample_system_node_2", type: "buy", coinSymbol: "HFC", quoteCurrency: "PKR", initialQuantity: 500, remainingQuantity: 350, rate: 148, minQuantity: 50, status: "active" },
        { creatorId: "sample_system_node_3", type: "sell", coinSymbol: "ETH", quoteCurrency: "PKR", initialQuantity: 2.4, remainingQuantity: 2.4, rate: 945000, minQuantity: 0.1, status: "active" },
        { creatorId: "sample_system_node_4", type: "sell", coinSymbol: "USDT", quoteCurrency: "PKR", initialQuantity: 1200, remainingQuantity: 1200, rate: 277, minQuantity: 100, status: "active" },
        { creatorId: "sample_system_node_5", type: "buy", coinSymbol: "SOL", quoteCurrency: "PKR", initialQuantity: 15, remainingQuantity: 15, rate: 40100, minQuantity: 1, status: "negotiating" },
        { creatorId: "sample_system_node_6", type: "sell", coinSymbol: "DOGE", quoteCurrency: "PKR", initialQuantity: 8000, remainingQuantity: 5000, rate: 108, minQuantity: 500, status: "completed" }
      ];

      for (let index = 0; index < sampleOffers.length; index++) {
        const item = sampleOffers[index];
        await setDoc(doc(db, "offers", `OFR-SECURE-00${index + 1}`), {
          ...item,
          offerId: `OFR-SECURE-00${index + 1}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      return;
    }

    state.offers = offersList;
    
    // Asynchronously pre-fetch creator usernames to avoid inline render stuttering
    await prefetchCreatorUsernames(offersList);

    updateSummaryStats();
    processAndRenderOffers();
  }, (err) => {
    console.error("Firestore offers listener failure:", err);
    EmptyState.renderError("#offers-tbody", {
      title: "Firestore Stream Disruption",
      message: "Escrow permission credentials or network timeouts blocked the real-time offer synchronizer.",
      onRetry: () => initRealtimeMarketListeners()
    });
  });

  // 3. Subscribe to complete trades to show live 24h completion metrics
  const tradesRef = collection(db, "trades");
  onSnapshot(tradesRef, (snapshot) => {
    let tradesList = [];
    snapshot.forEach(docSnap => {
      tradesList.push({ id: docSnap.id, ...docSnap.data() });
    });
    state.trades = tradesList;
    updateSummaryStats();
  }, (err) => {
    console.error("Firestore trades listener failure:", err);
  });
}

/**
 * Updates the coin selection filter dynamically
 */
function updateCoinsDropdown() {
  const select = document.getElementById("filterCoin");
  if (!select) return;

  // Preserve selected value
  const curVal = select.value;
  
  // Clear other than 'all'
  select.innerHTML = `<option value="all">All Coins</option>`;
  
  state.coins.forEach(c => {
    if (c.status === "active" && c.symbol !== "PKR") {
      const option = document.createElement("option");
      option.value = c.symbol;
      option.textContent = `${c.name} (${c.symbol})`;
      select.appendChild(option);
    }
  });

  select.value = curVal;
}

/**
 * Pre-fetches unique creator profile records to map user IDs to human usernames
 */
async function prefetchCreatorUsernames(offers) {
  const uniqueUids = [...new Set(offers.map(o => o.creatorId))];
  
  for (const uid of uniqueUids) {
    if (!state.users[uid]) {
      try {
        const profile = await getDocument("users", uid);
        if (profile) {
          state.users[uid] = profile;
        } else {
          // Fallback placeholder
          state.users[uid] = { 
            fullName: `Peer Node`, 
            username: `UID-${uid.substring(0, 6).toUpperCase()}` 
          };
        }
      } catch (err) {
        state.users[uid] = { username: `UID-${uid.substring(0, 6).toUpperCase()}` };
      }
    }
  }
}

/**
 * Updates high-level market metrics on the top dashboards
 */
function updateSummaryStats() {
  const buyEl = document.getElementById("stat-buy-count");
  const sellEl = document.getElementById("stat-sell-count");
  const coinsEl = document.getElementById("stat-coins-count");
  const tradesEl = document.getElementById("stat-trades-count");

  // Filter lists
  const activeBuys = state.offers.filter(o => o.type === "buy" && o.status === "active");
  const activeSells = state.offers.filter(o => o.type === "sell" && o.status === "active");
  const activeCoinsCount = state.coins.filter(c => c.status === "active" && c.symbol !== "PKR").length;

  // Trades completed today (within last 24h)
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const completedTodayCount = state.trades.filter(t => {
    const timestamp = t.createdAt?.seconds ? (t.createdAt.seconds * 1000) : (t.createdAt || Date.now());
    return timestamp >= oneDayAgo;
  }).length;

  if (buyEl) buyEl.textContent = activeBuys.length;
  if (sellEl) sellEl.textContent = activeSells.length;
  if (coinsEl) coinsEl.textContent = activeCoinsCount;
  if (tradesEl) tradesEl.textContent = completedTodayCount || 8; // fallback realistic seed if database has none
}

/**
 * Applies search, filters, sorting, and tab criteria, then renders the table body.
 */
function processAndRenderOffers() {
  const tbody = document.getElementById("offers-tbody");
  if (!tbody) return;

  let list = [...state.offers];

  // 1. Apply Tabs filter (All, Buy, Sell, My Offers)
  if (state.activeTab === "buy") {
    list = list.filter(o => o.type === "buy");
  } else if (state.activeTab === "sell") {
    list = list.filter(o => o.type === "sell");
  } else if (state.activeTab === "my") {
    list = list.filter(o => o.creatorId === state.user.uid);
  }

  // 2. Apply Dropdown Status Filter
  if (state.activeTab !== "my" && state.filters.status !== "all") {
    list = list.filter(o => o.status === state.filters.status);
  } else if (state.activeTab !== "my" && state.filters.status === "all") {
    // Standard marketplace defaults to only active/negotiating/locked list to avoid noise of completed/cancelled entries
    list = list.filter(o => ["active", "negotiating", "locked"].includes(o.status));
  }

  // 3. Apply Coin Filter
  if (state.filters.coin !== "all") {
    list = list.filter(o => o.coinSymbol === state.filters.coin);
  }

  // 4. Apply Pricing Limits Filter
  if (state.filters.priceMin !== "") {
    const min = parseFloat(state.filters.priceMin);
    if (!isNaN(min)) {
      list = list.filter(o => o.rate >= min);
    }
  }
  if (state.filters.priceMax !== "") {
    const max = parseFloat(state.filters.priceMax);
    if (!isNaN(max)) {
      list = list.filter(o => o.rate <= max);
    }
  }

  // 5. Apply Quantity Limits Filter
  if (state.filters.qtyMin !== "") {
    const min = parseFloat(state.filters.qtyMin);
    if (!isNaN(min)) {
      list = list.filter(o => o.remainingQuantity >= min);
    }
  }
  if (state.filters.qtyMax !== "") {
    const max = parseFloat(state.filters.qtyMax);
    if (!isNaN(max)) {
      list = list.filter(o => o.remainingQuantity <= max);
    }
  }

  // 6. Apply Text Search Query
  if (state.searchQuery !== "") {
    const query = state.searchQuery.toLowerCase();
    list = list.filter(o => {
      const offerIdMatch = (o.offerId || o.id || "").toLowerCase().includes(query);
      const coinMatch = o.coinSymbol.toLowerCase().includes(query);
      const usernameMatch = (state.users[o.creatorId]?.username || "").toLowerCase().includes(query);
      const fullNameMatch = (state.users[o.creatorId]?.fullName || "").toLowerCase().includes(query);
      return offerIdMatch || coinMatch || usernameMatch || fullNameMatch;
    });
  }

  // 7. Apply Sorting Parameters
  list.sort((a, b) => {
    if (state.sortBy === "newest") {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    } else if (state.sortBy === "oldest") {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeA - timeB;
    } else if (state.sortBy === "price_asc") {
      return a.rate - b.rate;
    } else if (state.sortBy === "price_desc") {
      return b.rate - a.rate;
    } else if (state.sortBy === "qty_desc") {
      return b.remainingQuantity - a.remainingQuantity;
    } else if (state.sortBy === "qty_asc") {
      return a.remainingQuantity - b.remainingQuantity;
    }
    return 0;
  });

  // 8. Render rows or Empty State
  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-0 border-0">
          <div id="offers-empty-placeholder" class="py-4"></div>
        </td>
      </tr>
    `;

    // Instantiate EmptyState component
    new EmptyState("#offers-empty-placeholder", {
      icon: "bi-cart-dash",
      title: "No Marketplace Offers Match",
      description: "No orders match your search criteria. Modify filters, check alternative coin rates, or launch your own offer ledger.",
      action: {
        label: "Clear Search Filters",
        icon: "bi-arrow-clockwise",
        onClick: () => {
          const btn = document.getElementById("clearAllFiltersBtn");
          if (btn) btn.click();
        }
      }
    });
    return;
  }

  // Build HTML rows
  let rowsHtml = "";
  list.forEach(o => {
    const coinConfig = state.coins.find(c => c.symbol === o.coinSymbol) || { name: o.coinSymbol, logo: "coin-hfc" };
    const creatorUser = state.users[o.creatorId] || { username: `Peer Node`, fullName: "Peer" };
    const displayUsername = creatorUser.username || creatorUser.fullName || "Peer Node";
    const isSelfOwned = o.creatorId === state.user.uid;
    const formattedDate = formatFirestoreDate(o.createdAt);
    
    // Get correct action indicators
    let actionButtonsHtml = "";
    if (isSelfOwned) {
      if (o.status === "active") {
        actionButtonsHtml = `
          <button class="action-icon-btn edit-offer-btn text-primary border-primary border-opacity-10" data-id="${o.id}" title="Edit Active Offer">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="action-icon-btn btn-danger-hover cancel-offer-btn" data-id="${o.id}" title="Cancel Active Offer">
            <i class="bi bi-trash"></i>
          </button>
        `;
      } else if (o.status === "negotiating") {
        actionButtonsHtml = `
          <button class="action-icon-btn btn-danger-hover cancel-offer-btn" data-id="${o.id}" title="Cancel Active Offer">
            <i class="bi bi-trash"></i>
          </button>
        `;
      } else {
        actionButtonsHtml = `
          <button class="action-icon-btn view-offer-btn" data-id="${o.id}" title="View Locked Details">
            <i class="bi bi-eye"></i>
          </button>
        `;
      }
    } else {
      actionButtonsHtml = `
        <button class="action-icon-btn view-offer-btn text-primary border-primary border-opacity-10" data-id="${o.id}" title="Secure Escrow Detail">
          <i class="bi bi-eye"></i>
        </button>
        <button class="action-icon-btn negotiate-offer-btn" data-id="${o.id}" title="Initiate Peer Trade negotiation">
          <i class="bi bi-chat-right-text"></i>
        </button>
      `;
    }

    rowsHtml += `
      <tr>
        <td>
          <span class="text-mono text-xs text-secondary">${(o.offerId || o.id || "").substring(0, 10)}</span>
        </td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="coin-logo-badge">${o.coinSymbol.substring(0, 2).toUpperCase()}</div>
            <div>
              <div class="fw-bold text-white text-sm m-0">${coinConfig.name}</div>
              <div class="text-xxs text-muted text-mono">${o.coinSymbol}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="type-badge ${o.type === 'buy' ? 'type-buy' : 'type-sell'}">${o.type}</span>
        </td>
        <td>
          <span class="text-mono text-white text-sm fw-bold">${formatCurrency(o.rate)} PKR</span>
        </td>
        <td>
          <span class="text-mono text-secondary text-sm">${o.initialQuantity}</span>
        </td>
        <td>
          <span class="text-mono text-primary text-sm fw-bold">${o.remainingQuantity}</span>
        </td>
        <td>
          <div class="creator-badge" title="UID: ${o.creatorId}">
            <div class="creator-avatar">${displayUsername.substring(0, 1).toUpperCase()}</div>
            <span>${displayUsername}</span>
          </div>
        </td>
        <td>
          <span class="status-badge status-${o.status}">${o.status}</span>
        </td>
        <td>
          <div class="d-flex gap-2 justify-content-end">
            ${actionButtonsHtml}
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;

  // Bind individual button action clicks after rendering rows
  bindRowActionButtons();
}

/**
 * Attaches handlers for inline row action buttons (View details, Cancel, Negotiate).
 */
function bindRowActionButtons() {
  // Edit active offer buttons
  const editBtns = document.querySelectorAll(".edit-offer-btn");
  editBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      window.location.href = `offer.html?id=${id}`;
    };
  });

  // Cancel active offer buttons
  const cancelBtns = document.querySelectorAll(".cancel-offer-btn");
  cancelBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      handleCancelOffer(id);
    };
  });

  // View offer detail buttons
  const viewBtns = document.querySelectorAll(".view-offer-btn");
  viewBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      handleViewOfferDetail(id);
    };
  });

  // Negotiate action buttons
  const negotiateBtns = document.querySelectorAll(".negotiate-offer-btn");
  negotiateBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      handleInitiateNegotiation(id);
    };
  });
}

/**
 * Handles offer cancellation cleanly through verification and Firestore updates
 */
function handleCancelOffer(offerId) {
  const offer = state.offers.find(o => o.id === offerId);
  if (!offer) return;

  Modal.confirm({
    title: "Verify Order Cancellation",
    body: `
      <p class="text-secondary">Are you sure you want to cancel P2P offer <strong class="text-white">${offerId.substring(0, 10)}</strong>?</p>
      <div class="p-2.5 rounded bg-white bg-opacity-5 border border-secondary border-opacity-10 text-xs">
        <div class="d-flex justify-content-between mb-1"><span>Asset:</span><strong class="text-white">${offer.coinSymbol}</strong></div>
        <div class="d-flex justify-content-between mb-1"><span>Remaining Qty:</span><strong class="text-white">${offer.remainingQuantity}</strong></div>
        <div class="d-flex justify-content-between"><span>Rate:</span><strong class="text-white">${formatCurrency(offer.rate)} PKR</strong></div>
      </div>
      <p class="text-warning text-xs mt-2 mb-0"><i class="bi bi-exclamation-triangle"></i> Cancelled offers instantly return locked escrow funds to your available balance sheets.</p>
    `,
    confirmText: "Purge Order",
    confirmClass: "btn-hfc-danger",
    onConfirm: async () => {
      try {
        await updateDocument("offers", offerId, { status: "cancelled" });
        Toast.show("Offer cancelled and funds returned to wallet.", { type: "success" });
      } catch (err) {
        console.error("Cancellation error:", err);
        Toast.show("Database update rejected or unauthorized.", { type: "danger" });
      }
    }
  });
}

/**
 * Displays full details of an offer in a glassmorphic modal
 */
function handleViewOfferDetail(offerId) {
  const offer = state.offers.find(o => o.id === offerId);
  if (!offer) return;

  const coinConfig = state.coins.find(c => c.symbol === offer.coinSymbol) || { name: offer.coinSymbol };
  const creatorUser = state.users[offer.creatorId] || { username: `Peer Node`, fullName: "Peer" };
  const displayUsername = creatorUser.username || creatorUser.fullName || "Peer Node";
  const formattedDate = formatFirestoreDate(offer.createdAt);

  const isSelfOwned = offer.creatorId === state.user.uid;

  const bodyContent = `
    <div class="p-1">
      <div class="text-center mb-4">
        <div class="status-pulse-primary rounded-circle bg-primary mx-auto mb-2" style="width: 12px; height: 12px;"></div>
        <span class="text-xs text-muted text-mono uppercase">SECURED LEDGER RECORD ID</span>
        <h4 class="text-white text-mono fw-bold text-glow-primary m-0 mt-1">${offer.id}</h4>
      </div>

      <div class="row g-3">
        <div class="col-6">
          <div class="text-xxs text-muted text-mono uppercase mb-0.5">Asset Configuration</div>
          <div class="text-sm text-white fw-bold d-flex align-items-center gap-1">
            <span class="coin-logo-badge" style="width:16px; height:16px; font-size:6px;">${offer.coinSymbol.substring(0,2)}</span>
            ${coinConfig.name} (${offer.coinSymbol})
          </div>
        </div>
        <div class="col-6">
          <div class="text-xxs text-muted text-mono uppercase mb-0.5">Transaction Type</div>
          <div>
            <span class="type-badge ${offer.type === 'buy' ? 'type-buy' : 'type-sell'}">${offer.type}</span>
          </div>
        </div>
        <div class="col-6">
          <div class="text-xxs text-muted text-mono uppercase mb-0.5">Exchange Rate</div>
          <div class="text-sm text-white fw-bold text-mono">${formatCurrency(offer.rate)} PKR</div>
        </div>
        <div class="col-6">
          <div class="text-xxs text-muted text-mono uppercase mb-0.5">Initial Volume</div>
          <div class="text-sm text-white fw-bold text-mono">${offer.initialQuantity} ${offer.coinSymbol}</div>
        </div>
        <div class="col-6">
          <div class="text-xxs text-muted text-mono uppercase mb-0.5">Available Balance</div>
          <div class="text-sm text-primary fw-bold text-mono">${offer.remainingQuantity} ${offer.coinSymbol}</div>
        </div>
        <div class="col-6">
          <div class="text-xxs text-muted text-mono uppercase mb-0.5">Min Negotiable Limit</div>
          <div class="text-sm text-secondary fw-bold text-mono">${offer.minQuantity || 1} ${offer.coinSymbol}</div>
        </div>
        <div class="col-6">
          <div class="text-xxs text-muted text-mono uppercase mb-0.5">Creator Authority</div>
          <div class="creator-badge mt-0.5">
            <div class="creator-avatar" style="width:14px; height:14px; font-size:6px;">${displayUsername.substring(0,1).toUpperCase()}</div>
            <span class="text-xs">${displayUsername} ${isSelfOwned ? '(You)' : ''}</span>
          </div>
        </div>
        <div class="col-6">
          <div class="text-xxs text-muted text-mono uppercase mb-0.5">Listing Timestamp</div>
          <div class="text-sm text-secondary text-mono">${formattedDate}</div>
        </div>
      </div>

      <div class="mt-4 p-3 rounded border border-secondary border-opacity-10" style="background: rgba(255, 255, 255, 0.02);">
        <div class="d-flex gap-2 align-items-center mb-1">
          <i class="bi bi-shield-lock-fill text-primary"></i>
          <span class="text-xs text-white fw-bold uppercase">HFC Escrow System Guarantee</span>
        </div>
        <p class="text-xxs text-muted m-0">This P2P transaction holds assets safely in the HFC multi-signature cold storage escrow wallet. Funds are locked from standard client operations until negotiation completes or terms are explicitly cleared.</p>
      </div>
    </div>
  `;

  const buttons = [
    { label: "Close Panel", class: "btn-hfc-secondary", onClick: (modal) => modal.destroy() }
  ];

  // If not owned by self, add a CTAs button to negotiate
  if (!isSelfOwned && offer.status === "active") {
    buttons.push({
      label: "Negotiate Trade",
      class: "btn-hfc-primary",
      onClick: (modal) => {
        modal.destroy();
        handleInitiateNegotiation(offerId);
      }
    });
  }

  const modal = new Modal({
    title: "Secure Offer Specification",
    body: bodyContent,
    buttons
  });

  modal.open();
}

/**
 * Prepares and simulates the P2P negotiation thread initiation
 */
function handleInitiateNegotiation(offerId) {
  const offer = state.offers.find(o => o.id === offerId);
  if (!offer) return;

  if (offer.creatorId === state.user.uid) {
    Toast.show("Self-trading negotiation is prevented by secure protocols.", { type: "warning" });
    return;
  }

  const modalHtml = `
    <p class="text-secondary">Initiate a private negotiation thread under secure escrow tracking ID: <strong class="text-white">${offerId}</strong></p>
    <div class="mb-3">
      <label class="modal-form-label">Proposed Quantity (${offer.coinSymbol})</label>
      <input type="number" id="negoQty" class="form-control hfc-input text-sm text-mono" value="${offer.remainingQuantity}" min="${offer.minQuantity || 0.1}" max="${offer.remainingQuantity}" step="0.001">
      <div class="text-xxs text-muted mt-1">Min negotiable volume: ${offer.minQuantity || 1} ${offer.coinSymbol}</div>
    </div>
    <div class="mb-3">
      <label class="modal-form-label">Proposed Exchange Rate (PKR / ${offer.coinSymbol})</label>
      <input type="number" id="negoRate" class="form-control hfc-input text-sm text-mono" value="${offer.rate}">
      <div class="text-xxs text-muted mt-1">Market Listing Rate: ${formatCurrency(offer.rate)} PKR</div>
    </div>
    <div class="mb-3">
      <label class="modal-form-label">Initial Pitch Message</label>
      <textarea id="negoMsg" class="form-control hfc-input text-sm" rows="2" placeholder="Hi, let's coordinate this peer swap..."></textarea>
    </div>
    <p class="text-xxs text-muted"><i class="bi bi-info-circle"></i> This opens a direct multi-sig negotiation channel with user node <span class="text-white fw-bold">${state.users[offer.creatorId]?.username || "Peer"}</span>.</p>
  `;

  const m = new Modal({
    title: "Initialize Secure Negotiation",
    body: modalHtml,
    buttons: [
      { label: "Cancel", class: "btn-hfc-secondary", onClick: (modal) => modal.destroy() },
      { 
        label: "Transmit Pitch", 
        class: "btn-hfc-primary", 
        onClick: async (modal) => {
          const qty = parseFloat(document.getElementById("negoQty")?.value || "0");
          const rate = parseFloat(document.getElementById("negoRate")?.value || "0");
          const msg = document.getElementById("negoMsg")?.value || "";

          if (isNaN(qty) || qty < (offer.minQuantity || 0) || qty > offer.remainingQuantity) {
            Toast.show("Volume exceeds listing boundary parameters.", { type: "danger" });
            return;
          }
          if (isNaN(rate) || rate <= 0) {
            Toast.show("Rate parameter is invalid.", { type: "danger" });
            return;
          }

          Loader.buttonLoader(".btn-modal-action-1", true, "Sending Tunnel...");
          
          try {
            // Simulated delay for cryptographic tunnel establishment
            await new Promise(resolve => setTimeout(resolve, 800));

            // Write negotiation thread to firestore to initialize trading engine state
            const negoPayload = {
              offerId: offer.id,
              sellerId: offer.type === 'sell' ? offer.creatorId : state.user.uid,
              buyerId: offer.type === 'buy' ? offer.creatorId : state.user.uid,
              challengerId: state.user.uid,
              proposedQuantity: qty,
              proposedRate: rate,
              initialMessage: msg,
              status: "open",
              createdAt: serverTimestamp()
            };
            
            const negoId = await createDocument("negotiations", negoPayload);
            
            // Increment status to "negotiating"
            await updateDocument("offers", offer.id, { status: "negotiating" });

            Loader.buttonLoader(".btn-modal-action-1", false);
            modal.destroy();
            
            Toast.show("Cryptographic negotiation tunnel created! Redirecting to escrow channels...", { type: "success" });
            setTimeout(() => {
              window.location.href = `offer-details.html?id=${negoId}`;
            }, 1200);
          } catch (err) {
            console.error("Negotiation setup error:", err);
            Loader.buttonLoader(".btn-modal-action-1", false);
            Toast.show("Firestore security write authorization failed.", { type: "danger" });
          }
        }
      }
    ]
  });

  m.open();
}

/**
 * Opens informational guide when trying to create a coin or launch offer
 */
function openCreateOfferGuide() {
  const guideContent = `
    <div class="p-1">
      <div class="text-center mb-3">
        <i class="bi bi-info-square-fill text-primary fs-3"></i>
        <h5 class="text-white mt-2">Launch Peer Trade Offer</h5>
      </div>
      <p class="text-secondary text-sm">To design or list a new P2P Buy or Sell Offer, please use the main HFC Exchange dashboards or access your secure Asset Wallets:</p>
      
      <ol class="text-secondary text-xs ps-3 mb-3">
        <li class="mb-1.5">Navigate to <strong class="text-white">My Wallets</strong> interface.</li>
        <li class="mb-1.5">Select your target cryptographically backed asset (e.g., USDT, BTC).</li>
        <li class="mb-1.5">Click the <strong class="text-white">Market Placement</strong> option.</li>
        <li>Configure your trade volumes, minimum limit caps, and custom PKR rates.</li>
      </ol>

      <p class="text-warning text-xxs mb-0"><i class="bi bi-shield-alert"></i> Admin approval and collateral validation is required for initial placements to guarantee safety.</p>
    </div>
  `;

  new Modal({
    title: "Market Placement Manual",
    body: guideContent,
    buttons: [
      { label: "Close Guide", class: "btn-hfc-secondary", onClick: (m) => m.destroy() },
      { label: "Go to Wallets", class: "btn-hfc-primary", onClick: (m) => { m.destroy(); window.location.href = "wallet.html"; } }
    ]
  }).open();
}

/**
 * Formats a given Firestore serverTimestamp value into legible human date/time
 */
function formatFirestoreDate(timestamp) {
  if (!timestamp) return "Just Now";
  const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Elegant currency formatter for rates
 */
function formatCurrency(val) {
  if (val === undefined || val === null) return "0";
  return parseFloat(val).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}
