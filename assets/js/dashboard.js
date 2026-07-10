/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Dashboard Page Controller
 * Handles secure authentication guards, real-time Firestore synchronization,
 * wallet statistics calculation, transactional updates, and interactive mock triggers.
 */

import { protectPage } from "../../js/authGuard.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";
import { 
  getDocument, 
  createDocument, 
  updateDocument, 
  queryCollection,
  deleteDocument
} from "../../firebase/firestore.js";
import { where, serverTimestamp } from "firebase/firestore";

// Mock Exchange Asset Price Feed (Rates to USD)
const COIN_RATES = {
  BTC: 92500.00,
  ETH: 3450.00,
  USDT: 1.00,
  SOL: 145.50,
  USD: 1.00,
  PKR: 0.0036 // 1 PKR is approx $0.0036 USD
};

// Start Dashboard Orchestrator on DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Guard the page and fetch the active authenticated user
  const user = await protectPage();
  if (!user) {
    // protectPage will auto-redirect to login.html if not authenticated
    return;
  }

  // 2. Initialize PageLayout with child component selectors
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
      activeId: "dashboard",
      menuItems: [
        { id: "dashboard", label: "Dashboard", icon: "bi-grid-1x2-fill", href: "dashboard.html" },
        { id: "marketplace", label: "P2P Marketplace", icon: "bi-shop", href: "#" },
        { id: "wallets", label: "My Wallets", icon: "bi-wallet2", href: "#" },
        { id: "transactions", label: "Escrow Ledger", icon: "bi-activity", href: "#" },
        { id: "security", label: "Settings node", icon: "bi-shield-lock", href: "#" }
      ],
      onNavigate: (item) => {
        if (item.id !== "dashboard") {
          Toast.show(`${item.label} interface integration is locked on this preview node.`, { type: "warning" });
        }
      }
    }
  });

  // 3. Render Dashboard Structure
  renderDashboardFrame(layout, user);
});

/**
 * Render the main HTML layout wireframe inside the page content container
 */
function renderDashboardFrame(layout, user) {
  const container = layout.getContentContainer();
  if (!container) return;

  // Insert base layout blocks
  container.innerHTML = `
    <!-- Page Header Target -->
    <div id="dashboard-header"></div>

    <!-- Security Network Connection Alert Banner -->
    <div class="alert alert-dashboard alert-dismissible fade show p-3 mb-4 d-flex align-items-center justify-content-between" role="alert">
      <div class="d-flex align-items-center gap-2">
        <div class="status-pulse-success bg-success rounded-circle animate-pulse" style="width: 8px; height: 8px;"></div>
        <span class="text-sm text-secondary">
          <strong class="text-white">Secure Node Connection Active:</strong> Encrypted TLS 1.3 tunnel validated. Cold vault escrow synchronized (1:1 backing guarantee).
        </span>
      </div>
      <button type="button" class="btn-close btn-close-white text-xs" data-bs-dismiss="alert" aria-label="Close" style="padding: 1.15rem;"></button>
    </div>

    <!-- Statistics Cards Grid -->
    <div class="dashboard-grid" id="stats-grid">
      <!-- Skeletons loaded initially -->
      <div class="card-glass p-4"><div class="skeleton-loader w-50 h-4"></div><div class="skeleton-loader w-75 h-8 mt-2"></div></div>
      <div class="card-glass p-4"><div class="skeleton-loader w-50 h-4"></div><div class="skeleton-loader w-75 h-8 mt-2"></div></div>
      <div class="card-glass p-4"><div class="skeleton-loader w-50 h-4"></div><div class="skeleton-loader w-75 h-8 mt-2"></div></div>
      <div class="card-glass p-4"><div class="skeleton-loader w-50 h-4"></div><div class="skeleton-loader w-75 h-8 mt-2"></div></div>
    </div>

    <!-- Two-Column Grid: Left Column for Wallet & Ledger, Right for Ticker & Notifications -->
    <div class="row g-4 mb-4">
      <!-- Left Column (8 cols) -->
      <div class="col-lg-8">
        <!-- Portfolio balances card wrapper -->
        <div class="card-glass mb-4">
          <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
            <h3 class="section-title m-0"><i class="bi bi-wallet2 text-accent"></i> Portfolio Balance Sheet</h3>
            <div class="d-flex gap-2">
              <button class="btn-hfc btn-hfc-secondary py-1.5 px-3 text-xs" id="quickDepositBtn">
                <i class="bi bi-plus-circle"></i> Deposit Asset
              </button>
              <button class="btn-hfc btn-hfc-primary py-1.5 px-3 text-xs" id="quickSwapBtn">
                <i class="bi bi-arrow-left-right"></i> Quick Swap
              </button>
            </div>
          </div>
          <div id="wallets-wrapper">
            <!-- Dynamic Wallets Table or Empty State goes here -->
          </div>
        </div>

        <!-- Ledger transactions table wrapper -->
        <div class="card-glass">
          <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
            <h3 class="section-title m-0"><i class="bi bi-activity text-success"></i> Secure Escrow Ledger</h3>
            <button class="btn-hfc btn-hfc-danger py-1 px-2.5 text-xxs border border-danger border-opacity-25" id="resetLedgerBtn">
              <i class="bi bi-trash-fill"></i> Purge Node Data
            </button>
          </div>
          <div id="transactions-wrapper">
            <!-- Dynamic Transactions Table or Empty State goes here -->
          </div>
        </div>
      </div>

      <!-- Right Column (4 cols) -->
      <div class="col-lg-4">
        <!-- Live Market Price Widget -->
        <div class="card-glass mb-4">
          <h3 class="section-title"><i class="bi bi-lightning-charge text-primary animate-pulse"></i> Market Live Terminal</h3>
          <p class="text-xs text-muted mb-3">Real-time valuation rates mapped to HFC Exchange global pricing nodes.</p>
          <div class="d-flex flex-column gap-2" id="market-terminal">
            <!-- Dynamic ticker feed -->
          </div>
        </div>

        <!-- System Alerts Feed -->
        <div class="card-glass">
          <h3 class="section-title"><i class="bi bi-info-circle text-warning"></i> Node Event Logs</h3>
          <div class="d-flex flex-column gap-3 mt-3 text-sm text-secondary" id="event-logs">
            <div class="p-2 border-start border-primary border-2 bg-white bg-opacity-5 rounded">
              <div class="d-flex justify-content-between align-items-center mb-1 text-xs text-muted">
                <span>SYSTEM DIAGNOSTIC</span>
                <span>Just Now</span>
              </div>
              <p class="m-0 text-white">TLS 1.3 handshake successful. Node initialized securely.</p>
            </div>
            <div class="p-2 border-start border-warning border-2 bg-white bg-opacity-5 rounded">
              <div class="d-flex justify-content-between align-items-center mb-1 text-xs text-muted">
                <span>SECURITY AUDIT</span>
                <span>2 hours ago</span>
              </div>
              <p class="m-0 text-white">P2P Escrow vaults audited successfully. All reserves matched 100%.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Initialize PageHeader
  new PageHeader("#dashboard-header", {
    title: `Welcome, ${user.displayName || user.email.split('@')[0]}`,
    description: `Secure cryptocurrency trading hub. Session authorized under node UID: ${user.uid.substring(0, 10)}...`,
    breadcrumbs: [{ label: "Dashboard", active: true }],
    action: {
      label: "Audit Ledger",
      icon: "bi-shield-check",
      onClick: () => {
        Toast.show("Platform audit verified! Balance sheets aligned correctly.", { type: "success" });
      }
    }
  });

  // Load and populate stats and tables from Firestore
  loadDashboardData(user, layout);

  // Bind Actions (Deposit, Swap, Reset Ledger)
  bindActionTriggers(user, layout);
}

/**
 * Fetch and load real-time user wallets and transactions from Firestore, recalculating combined stats
 */
async function loadDashboardData(user, layout) {
  const walletsContainer = document.getElementById("wallets-wrapper");
  const transactionsContainer = document.getElementById("transactions-wrapper");
  const statsGrid = document.getElementById("stats-grid");
  const marketTerminal = document.getElementById("market-terminal");

  // Show inline skeleton loaders
  if (walletsContainer) Loader.renderSkeleton(walletsContainer, { count: 3 });
  if (transactionsContainer) Loader.renderSkeleton(transactionsContainer, { count: 3 });

  try {
    // 1. Load User Profile from Firestore to read extra custom metadata
    let fullName = user.displayName || user.email.split('@')[0];
    const userProfile = await getDocument("users", user.uid);
    if (userProfile && userProfile.fullName) {
      fullName = userProfile.fullName;
    }

    // Update Profile Name dynamically in Header if found
    const headerTitleEl = document.querySelector("#dashboard-header h1");
    if (headerTitleEl) {
      headerTitleEl.textContent = `Welcome, ${fullName}`;
    }

    // 2. Query wallets for user.uid
    const wallets = await queryCollection("wallets", [
      where("ownerId", "==", user.uid)
    ]);

    // 3. Query transactions for user.uid
    let transactions = await queryCollection("transactions", [
      where("userId", "==", user.uid)
    ]);

    // Sort transactions by date descending
    transactions.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });

    // 4. Calculate Portfolio stats
    let totalPortfolioUSD = 0;
    let availableUSD = 0;
    let btcBalance = 0;
    let ethBalance = 0;

    wallets.forEach(w => {
      const rate = COIN_RATES[w.currency] || 1.0;
      const usdValue = w.balance * rate;
      totalPortfolioUSD += usdValue;

      if (w.currency === "USDT" || w.currency === "USD") {
        availableUSD += usdValue;
      }
      if (w.currency === "PKR") {
        // PKR also counted in available capital
        availableUSD += usdValue;
      }
      if (w.currency === "BTC") btcBalance = w.balance;
      if (w.currency === "ETH") ethBalance = w.balance;
    });

    // Render Statistics Cards
    renderStatsGrid(statsGrid, totalPortfolioUSD, availableUSD, transactions);

    // Render Wallets
    if (wallets.length === 0) {
      new EmptyState("#wallets-wrapper", {
        icon: "bi-wallet-fill",
        title: "No Wallets Synchronized",
        description: "Your platform wallet balances are currently empty. Seed some starter crypto assets to enable trading logs.",
        action: {
          label: "Activate Starter Assets",
          icon: "bi-lightning-fill",
          onClick: () => seedUserBalances(user, layout)
        }
      });
    } else {
      renderWalletsTable(walletsContainer, wallets);
    }

    // Render Transactions Ledger
    if (transactions.length === 0) {
      new EmptyState("#transactions-wrapper", {
        icon: "bi-activity",
        title: "Immutable Ledger Empty",
        description: "No transaction rows have been logged to this cryptographic key address yet."
      });
    } else {
      renderTransactionsTable(transactionsContainer, transactions);
    }

    // Render Live Ticker
    renderMarketLiveTerminal(marketTerminal);

  } catch (error) {
    console.error("Error loading dashboard metrics:", error);
    if (walletsContainer) {
      EmptyState.renderError(walletsContainer, {
        title: "Firestore Sync Failure",
        message: "An security rules validation or connection exception blocked the balance sheet fetch.",
        onRetry: () => loadDashboardData(user, layout)
      });
    }
  }
}

/**
 * Render the top 4 statistics grid cards
 */
function renderStatsGrid(container, totalUSD, availableUSD, transactions) {
  if (!container) return;

  const activeEscrows = transactions.filter(t => t.status === "pending").length;
  
  // Format currency
  const formatUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  container.innerHTML = `
    <!-- Card 1: Combined Net Worth -->
    <div class="card-glass card-wallet metric-card p-4">
      <div class="stat-label">Net Ledger Portfolio</div>
      <div class="stat-value text-white text-glow-primary">${formatUSD(totalUSD)}</div>
      <div class="text-success text-xs mt-2 d-flex align-items-center gap-1">
        <i class="bi bi-graph-up-arrow"></i> <span>+4.85% (Cold Storage)</span>
      </div>
    </div>

    <!-- Card 2: Liquid Assets -->
    <div class="card-glass card-market metric-card p-4">
      <div class="stat-label">Available Liquid Capital</div>
      <div class="stat-value text-white">${formatUSD(availableUSD)}</div>
      <div class="text-secondary text-xs mt-2">
        Ready for immediate swaps or P2P
      </div>
    </div>

    <!-- Card 3: 24h Escrow Trades -->
    <div class="card-glass card-trade metric-card p-4">
      <div class="stat-label">P2P Trade Turnover (24H)</div>
      <div class="stat-value text-white">$14,820.40</div>
      <div class="text-success text-xs mt-2 d-flex align-items-center gap-1">
        <i class="bi bi-arrow-up-right-circle-fill"></i> <span>+12.4% Node volume</span>
      </div>
    </div>

    <!-- Card 4: Active Escrow Items -->
    <div class="card-glass card-offer metric-card p-4">
      <div class="stat-label">Pending Escrow Locks</div>
      <div class="stat-value text-warning">${activeEscrows}</div>
      <div class="text-muted text-xs mt-2">
        Requires verification signatures
      </div>
    </div>
  `;
}

/**
 * Render Wallets list inside a table
 */
function renderWalletsTable(container, wallets) {
  if (!container) return;

  const tbodyHtml = wallets.map(w => {
    const rate = COIN_RATES[w.currency] || 1.0;
    const usdValue = w.balance * rate;
    
    // Formatting values
    const balanceStr = w.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    const usdStr = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usdValue);
    const rateStr = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(rate);
    const shortAddress = w.address ? `${w.address.substring(0, 6)}...${w.address.substring(w.address.length - 4)}` : "Not assigned";

    let coinClass = `coin-${w.currency.toLowerCase()}`;

    return `
      <tr class="align-middle">
        <td>
          <div class="d-flex align-items-center gap-3">
            <div class="coin-icon-wrapper ${coinClass}">${w.currency.substring(0,2)}</div>
            <div>
              <span class="text-white fw-bold d-block text-display text-sm">${w.currency}</span>
              <span class="text-xs text-muted">Decentralized Token</span>
            </div>
          </div>
        </td>
        <td class="text-mono text-white fw-semibold">${balanceStr}</td>
        <td class="text-mono text-muted">${rateStr}</td>
        <td class="text-mono text-glow-primary fw-bold text-white">${usdStr}</td>
        <td>
          <div class="blockchain-address" onclick="navigator.clipboard.writeText('${w.address}'); Toast.show('Chain address copied!', {type:'info'})" title="Click to copy address">
            <i class="bi bi-copy text-xxs"></i> <span>${shortAddress}</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-glass table-glass-hover m-0">
        <thead>
          <tr>
            <th>Asset Pair</th>
            <th>Node Balance</th>
            <th>Terminal Rate</th>
            <th>USD Valuation</th>
            <th>Public Vault Key</th>
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
 * Render Transaction logs list inside a table
 */
function renderTransactionsTable(container, transactions) {
  if (!container) return;

  // Limit to 5 most recent transactions to avoid UI clutter
  const recentTransactions = transactions.slice(0, 5);

  const tbodyHtml = recentTransactions.map(t => {
    const formattedDate = t.createdAt 
      ? new Date(t.createdAt.seconds * 1000).toLocaleString() 
      : "Pending verification";

    const hashShort = t.txHash ? `${t.txHash.substring(0, 8)}...` : "unconfirmed";
    
    let typeBadge = '';
    if (t.type === 'deposit') typeBadge = `<span class="badge bg-success bg-opacity-10 text-success text-xxs px-2 py-1 border border-success border-opacity-10 uppercase"><i class="bi bi-box-arrow-in-down"></i> Deposit</span>`;
    else if (t.type === 'withdrawal') typeBadge = `<span class="badge bg-danger bg-opacity-10 text-danger text-xxs px-2 py-1 border border-danger border-opacity-10 uppercase"><i class="bi bi-box-arrow-up"></i> Withdraw</span>`;
    else if (t.type === 'swap') typeBadge = `<span class="badge bg-primary bg-opacity-10 text-primary text-xxs px-2 py-1 border border-primary border-opacity-10 uppercase"><i class="bi bi-arrow-left-right"></i> Swap</span>`;
    else typeBadge = `<span class="badge bg-warning bg-opacity-10 text-warning text-xxs px-2 py-1 border border-warning border-opacity-10 uppercase"><i class="bi bi-cart"></i> Trade</span>`;

    let statusClass = `status-${t.status}`;

    return `
      <tr class="align-middle">
        <td><div class="text-muted text-xs text-mono">${formattedDate}</div></td>
        <td>${typeBadge}</td>
        <td class="text-mono text-white fw-bold">${t.amount} ${t.currency}</td>
        <td>
          <span class="status-badge ${statusClass}">
            <span class="status-pulse-primary rounded-circle" style="width:5px; height:5px; background-color: currentColor;"></span>
            ${t.status}
          </span>
        </td>
        <td>
          <div class="blockchain-address text-mono text-muted text-xxs" onclick="navigator.clipboard.writeText('${t.txHash}'); Toast.show('Transaction hash copied!', {type:'info'})" title="Copy transaction hash">
            <i class="bi bi-hash"></i> <span>${hashShort}</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-glass table-glass-hover m-0">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Type</th>
            <th>Ledger Delta</th>
            <th>Pillar Status</th>
            <th>Blockchain TXID</th>
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
 * Render standard sparklines and cryptocurrency ticker feeds
 */
function renderMarketLiveTerminal(container) {
  if (!container) return;

  const coins = [
    { name: "Bitcoin", symbol: "BTC", price: COIN_RATES.BTC, change: "+2.42%", up: true, sparkline: [10, 15, 8, 20, 18, 25, 22] },
    { name: "Ethereum", symbol: "ETH", price: COIN_RATES.ETH, change: "-1.15%", up: false, sparkline: [22, 18, 19, 14, 15, 12, 10] },
    { name: "Solana", symbol: "SOL", price: COIN_RATES.SOL, change: "+8.95%", up: true, sparkline: [5, 12, 10, 15, 22, 28, 32] }
  ];

  const listHtml = coins.map(c => {
    const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c.price);
    const changeClass = c.up ? "text-success" : "text-danger";
    const sparkClass = c.up ? "sparkline-green" : "sparkline-red";
    
    // Generate SVG path for sparkline
    const sparkPoints = c.sparkline.map((val, idx) => `${idx * 12},${30 - val}`).join(' ');

    return `
      <div class="market-ticker-row">
        <div class="d-flex align-items-center gap-2">
          <div class="status-pulse-primary bg-primary rounded-circle" style="width: 5px; height: 5px; opacity: ${c.up ? '1' : '0.4'}"></div>
          <div>
            <strong class="text-white text-sm d-block text-display">${c.name}</strong>
            <span class="text-xs text-muted text-mono">${c.symbol} / USD</span>
          </div>
        </div>
        
        <!-- Live Sparkline Curve Visualization -->
        <div class="d-none d-sm-block">
          <svg class="sparkline-svg">
            <polyline class="${sparkClass}" points="${sparkPoints}" />
          </svg>
        </div>

        <div class="text-end">
          <span class="text-white text-sm fw-bold d-block text-mono">${formattedPrice}</span>
          <span class="${changeClass} text-xs text-mono fw-semibold">${c.change}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = listHtml;
}

/**
 * Handle action triggers like Simulate Deposit, Swap, and Ledger Reset
 */
function bindActionTriggers(user, layout) {
  const quickDepositBtn = document.getElementById("quickDepositBtn");
  const quickSwapBtn = document.getElementById("quickSwapBtn");
  const resetLedgerBtn = document.getElementById("resetLedgerBtn");

  // A. SIMULATED DEPOSIT TRIGGER
  if (quickDepositBtn) {
    quickDepositBtn.onclick = () => {
      const modalBody = `
        <form id="depositModalForm" class="d-flex flex-column gap-3">
          <div class="form-group-glass m-0">
            <label for="depositCurrency">Select Blockchain Token</label>
            <select class="form-select form-control-glass bg-dark text-white border-secondary" id="depositCurrency" required>
              <option value="USDT">USDT (Decentralized Dollar Stablecoin)</option>
              <option value="BTC">Bitcoin (BTC Cold Storage)</option>
              <option value="ETH">Ethereum (ETH Smart Contract Vault)</option>
              <option value="PKR">Pakistani Rupee (PKR Fiat gateway)</option>
            </select>
          </div>
          <div class="form-group-glass m-0">
            <label for="depositAmount">Deposit Amount</label>
            <input type="number" class="form-control form-control-glass" id="depositAmount" placeholder="e.g. 500" min="0.000001" step="any" required />
          </div>
          <div class="p-2 border-start border-primary border-2 bg-white bg-opacity-5 rounded">
            <p class="text-xs text-muted m-0"><i class="bi bi-shield-check text-primary"></i> <strong>Pillar Escrow Security:</strong> Deposits undergo a mock blockchain 5-second validation cycle to match P2P Ledger state rules.</p>
          </div>
        </form>
      `;

      const depositModal = new Modal({
        title: "Initiate Secure Deposit",
        body: modalBody,
        buttons: [
          {
            label: "Cancel Gateway",
            class: "btn-hfc-secondary",
            onClick: (m) => m.destroy()
          },
          {
            label: "Authorize Transaction",
            class: "btn-hfc-primary",
            onClick: async (m) => {
              const form = document.getElementById("depositModalForm");
              if (!form.checkValidity()) {
                form.reportValidity();
                return;
              }

              const currency = document.getElementById("depositCurrency").value;
              const amount = parseFloat(document.getElementById("depositAmount").value);
              
              m.destroy(); // Dismiss dialog
              
              // Trigger loader state
              const loader = new Loader({ text: `Validating ${amount} ${currency} on Block Explorer...` });
              loader.show();

              try {
                // To show realistic behavior:
                // 1. Create a "pending" transaction
                const txId = `tx_${Date.now()}`;
                const txHash = "0x" + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');
                
                await createDocument("transactions", {
                  txId,
                  userId: user.uid,
                  type: "deposit",
                  amount,
                  currency,
                  status: "pending",
                  txHash
                }, txId);

                loader.updateText("Re-encrypting block signature rules...");
                
                // 2. Fetch current user wallet balance and update or create
                const walletId = `${user.uid}_${currency}`;
                const existingWallet = await getDocument("wallets", walletId);
                const currentBalance = existingWallet ? existingWallet.balance : 0;
                const newBalance = currentBalance + amount;

                let mockAddresses = {
                  BTC: "bc1q3s9f8g7h6j5k4l3m2n1p0q",
                  ETH: "0x71C249E94d754784a32249E94d754784a32249E9",
                  USDT: "0x71C249E94d754784a32249E94d754784a32249E9",
                  PKR: "PK78HFCEE00045829103957291"
                };

                // Perform wallet create/update
                await createDocument("wallets", {
                  walletId,
                  ownerId: user.uid,
                  currency,
                  balance: newBalance,
                  address: existingWallet?.address || mockAddresses[currency] || "0xMockKeyAddressValue"
                }, walletId);

                // Update transaction status to completed
                await updateDocument("transactions", txId, {
                  status: "completed"
                });

                loader.hide();
                Toast.show(`Escrow verified! ${amount} ${currency} loaded.`, { type: "success" });
                
                // Reload dashboard data live
                loadDashboardData(user, layout);

              } catch (err) {
                loader.hide();
                Toast.show("Deposit validation rejected by secure rules.", { type: "danger" });
              }
            }
          }
        ]
      });

      depositModal.open();
    };
  }

  // B. QUICK SWAP TRIGGER
  if (quickSwapBtn) {
    quickSwapBtn.onclick = () => {
      const modalBody = `
        <form id="swapModalForm" class="d-flex flex-column gap-3">
          <div class="row g-2">
            <div class="col-6">
              <label class="text-xs text-muted uppercase">Swap From</label>
              <select class="form-select form-control-glass" id="swapFrom" required>
                <option value="USDT">USDT</option>
                <option value="PKR">PKR</option>
              </select>
            </div>
            <div class="col-6">
              <label class="text-xs text-muted uppercase">Receive Token</label>
              <select class="form-select form-control-glass" id="swapTo" required>
                <option value="BTC">BTC (Bitcoin)</option>
                <option value="ETH">ETH (Ethereum)</option>
              </select>
            </div>
          </div>
          <div class="form-group-glass m-0">
            <label for="swapAmount">Source Amount</label>
            <input type="number" class="form-control form-control-glass" id="swapAmount" placeholder="e.g. 100" min="1" step="any" required />
            <div class="text-xs text-muted mt-1" id="swapEstimationText">Est. conversion will load on submit.</div>
          </div>
        </form>
      `;

      const swapModal = new Modal({
        title: "Cryptographic Asset Swap",
        body: modalBody,
        buttons: [
          {
            label: "Cancel",
            class: "btn-hfc-secondary",
            onClick: (m) => m.destroy()
          },
          {
            label: "Confirm Swap Lock",
            class: "btn-hfc-primary",
            onClick: async (m) => {
              const form = document.getElementById("swapModalForm");
              if (!form.checkValidity()) {
                form.reportValidity();
                return;
              }

              const fromAsset = document.getElementById("swapFrom").value;
              const toAsset = document.getElementById("swapTo").value;
              const amount = parseFloat(document.getElementById("swapAmount").value);

              m.destroy();

              const loader = new Loader({ text: `Calculating optimal cross-chain routing...` });
              loader.show();

              try {
                // 1. Fetch source wallet
                const sourceWalletId = `${user.uid}_${fromAsset}`;
                const sourceWallet = await getDocument("wallets", sourceWalletId);

                if (!sourceWallet || sourceWallet.balance < amount) {
                  loader.hide();
                  Toast.show(`Insufficient ${fromAsset} liquid funds to swap!`, { type: "danger" });
                  return;
                }

                // 2. Perform rates calculation
                const sourceRate = COIN_RATES[fromAsset] || 1.0;
                const destRate = COIN_RATES[toAsset] || 1.0;
                
                const sourceUSDValue = amount * sourceRate;
                const destAmount = sourceUSDValue / destRate;

                loader.updateText(`Transferring locks to multi-sig escrow...`);

                // 3. Subtract from source wallet
                await createDocument("wallets", {
                  walletId: sourceWalletId,
                  ownerId: user.uid,
                  currency: fromAsset,
                  balance: sourceWallet.balance - amount,
                  address: sourceWallet.address
                }, sourceWalletId);

                // 4. Add to target wallet
                const targetWalletId = `${user.uid}_${toAsset}`;
                const targetWallet = await getDocument("wallets", targetWalletId);
                const targetCurrentBalance = targetWallet ? targetWallet.balance : 0;

                let mockAddresses = {
                  BTC: "bc1q3s9f8g7h6j5k4l3m2n1p0q",
                  ETH: "0x71C249E94d754784a32249E94d754784a32249E9"
                };

                await createDocument("wallets", {
                  walletId: targetWalletId,
                  ownerId: user.uid,
                  currency: toAsset,
                  balance: targetCurrentBalance + destAmount,
                  address: targetWallet?.address || mockAddresses[toAsset] || "0xMockKeyAddressValue"
                }, targetWalletId);

                // 5. Create Swap transaction rows
                const txId = `tx_${Date.now()}`;
                const txHash = "0x" + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');

                await createDocument("transactions", {
                  txId,
                  userId: user.uid,
                  type: "swap",
                  amount,
                  currency: fromAsset,
                  status: "completed",
                  txHash
                }, txId);

                loader.hide();
                Toast.show(`Successfully swapped ${amount} ${fromAsset} into ${destAmount.toFixed(6)} ${toAsset}.`, { type: "success" });
                loadDashboardData(user, layout);

              } catch (err) {
                loader.hide();
                Toast.show("Secure swap routing rejected by peer node.", { type: "danger" });
              }
            }
          }
        ]
      });

      swapModal.open();
    };
  }

  // C. RESET LEDGER DATA TRIGGER (PURGE)
  if (resetLedgerBtn) {
    resetLedgerBtn.onclick = () => {
      Modal.confirm({
        title: "Purge Node Balances?",
        body: "<p class='text-danger'><strong>WARNING:</strong> This action will permanently delete all local wallets and recent transactional records for this session key from Firestore. Excellent to audit HFC Empty State components!</p>",
        confirmText: "De-Authorize Balances",
        confirmClass: "btn-hfc-danger",
        onConfirm: async () => {
          const loader = new Loader({ text: "Purging authenticated user records..." });
          loader.show();

          try {
            // Delete Wallets
            const wallets = await queryCollection("wallets", [where("ownerId", "==", user.uid)]);
            for (let w of wallets) {
              await deleteDocument("wallets", w.id);
            }

            // Delete Transactions
            const transactions = await queryCollection("transactions", [where("userId", "==", user.uid)]);
            for (let t of transactions) {
              await deleteDocument("transactions", t.id);
            }

            loader.hide();
            Toast.show("All database balances purged. Reviewing Empty States.", { type: "info" });
            loadDashboardData(user, layout);

          } catch (err) {
            loader.hide();
            Toast.show("Data purge failed.", { type: "danger" });
          }
        }
      });
    };
  }
}

/**
 * Seed starter balance sheets on new accounts
 */
async function seedUserBalances(user, layout) {
  const loader = new Loader({ text: "Provisioning dynamic cold-vaults..." });
  loader.show();

  try {
    const assets = [
      { currency: "BTC", balance: 0.45, address: "bc1q3s9f8g7h6j5k4l3m2n1p0q" },
      { currency: "ETH", balance: 5.24, address: "0x71C249E94d754784a32249E94d754784a32249E9" },
      { currency: "USDT", balance: 2500.00, address: "0x71C249E94d754784a32249E94d754784a32249E9" },
      { currency: "PKR", balance: 450000.00, address: "PK78HFCEE00045829103957291" }
    ];

    // 1. Create standard starter wallets
    for (let asset of assets) {
      const walletId = `${user.uid}_${asset.currency}`;
      await createDocument("wallets", {
        walletId,
        ownerId: user.uid,
        currency: asset.currency,
        balance: asset.balance,
        address: asset.address
      }, walletId);
    }

    // 2. Create sample starter transactions
    const txs = [
      { type: "deposit", amount: 2500.00, currency: "USDT", status: "completed" },
      { type: "swap", amount: 0.15, currency: "BTC", status: "completed" },
      { type: "withdrawal", amount: 15000.00, currency: "PKR", status: "pending" }
    ];

    for (let index = 0; index < txs.length; index++) {
      const t = txs[index];
      const txId = `tx_seed_${Date.now()}_${index}`;
      const txHash = "0x" + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');

      await createDocument("transactions", {
        txId,
        userId: user.uid,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        txHash
      }, txId);
    }

    loader.hide();
    Toast.show("Secure cold vaults provisioned successfully!", { type: "success" });
    loadDashboardData(user, layout);

  } catch (error) {
    loader.hide();
    Toast.show("Starter balance seed failed.", { type: "danger" });
  }
}
