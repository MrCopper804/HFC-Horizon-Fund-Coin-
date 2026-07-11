/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Create/Edit Offer Controller
 * Handles glassmorphic form interaction, live calculations, safe ledger transactions,
 * wallet holds reserve management, real-time sync pipelines, and defensive validations.
 */

import { protectPage } from "../../js/authGuard.js";
import { PageLayout } from "../../components/PageLayout.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Loader } from "../../components/Loader.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";
import { db } from "../../firebase/firebase.js";
import { 
  collection, 
  doc, 
  getDoc,
  getDocs,
  setDoc,
  query, 
  where, 
  onSnapshot,
  serverTimestamp 
} from "firebase/firestore";
import { 
  getDocument, 
  createDocument, 
  updateDocument, 
  runSafeTransaction 
} from "../../firebase/firestore.js";

// Page State Registry
const state = {
  user: null,
  coins: [],
  wallets: [],
  mode: "create", // "create" or "edit"
  offerId: null,
  existingOffer: null,
  activeType: "buy", // "buy" or "sell"
  hasActiveNegotiation: false,
  isSubmitting: false
};

// Start Orchestration on DOM Ready
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Authenticate user node
  const user = await protectPage();
  if (!user) return; // authGuard handled redirection
  state.user = user;

  // 2. Initialize Layout structure
  const layout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: user.email,
      versionText: "HFC Engine v2.4",
      initialNotifications: [
        { id: 1, type: "primary", text: "Offer placement channel secure." }
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
        if (item.href && item.href !== "#") {
          window.location.href = item.href;
        }
      }
    }
  });

  // 3. Inspect URL query keys for Create vs Edit Mode
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get("id");
  if (editId) {
    state.mode = "edit";
    state.offerId = editId;
  }

  // 4. Render Layout Structure
  renderOfferFrame(layout);

  // 5. Fire up real-time listener pipelines
  await initRealtimeListeners();
});

/**
 * Builds HTML skeleton of the reusable single-form interface
 */
function renderOfferFrame(layout) {
  const container = layout.getContentContainer();
  if (!container) return;

  container.innerHTML = `
    <!-- Page Header Target -->
    <div id="offer-page-header"></div>

    <div class="row g-4 mt-1">
      <!-- Left Column: The Interactive Glass Form -->
      <div class="col-lg-7 col-md-12">
        <div class="offer-form-container" id="form-container-pane">
          <!-- Live Mode Header Alert -->
          <div id="offer-edit-lock-alert" class="d-none"></div>

          <!-- Segmented Offer Type Selector -->
          <div class="form-group mb-4">
            <label class="offer-form-label"><i class="bi bi-tag"></i> Select Transaction Type</label>
            <div class="offer-type-selector">
              <button type="button" class="offer-type-btn active-buy" id="btn-type-buy">Buy Offer (Bid)</button>
              <button type="button" class="offer-type-btn" id="btn-type-sell">Sell Offer (Ask)</button>
            </div>
          </div>

          <!-- Core input fields form -->
          <form id="offerForm" novalidate>
            <div class="row g-3">
              <!-- Coin Select -->
              <div class="col-sm-6 col-12">
                <label for="offerCoin" class="offer-form-label">
                  <i class="bi bi-coin text-primary"></i> Target Cryptocurrency
                </label>
                <select id="offerCoin" class="form-select offer-form-control" required>
                  <option value="" disabled selected>Select Coin...</option>
                </select>
                <div class="invalid-feedback text-xxs">Target coin selection is required.</div>
              </div>

              <!-- Offer Expiry -->
              <div class="col-sm-6 col-12">
                <label for="offerExpiry" class="offer-form-label">
                  <i class="bi bi-calendar-event text-secondary"></i> Offer Expiration
                </label>
                <input type="datetime-local" id="offerExpiry" class="form-control offer-form-control" required>
                <div class="invalid-feedback text-xxs">Expiration date & time is required.</div>
              </div>

              <!-- Price Input (PKR Rate) -->
              <div class="col-sm-6 col-12">
                <label for="offerPrice" class="offer-form-label">
                  <i class="bi bi-cash-stack text-success"></i> Exchange Rate (PKR)
                </label>
                <div class="input-group">
                  <input type="number" id="offerPrice" class="form-control offer-form-control" placeholder="Rate in PKR" min="0.01" step="any" required>
                  <span class="input-group-text bg-transparent border-secondary border-opacity-10 text-muted text-xs">PKR</span>
                  <div class="invalid-feedback text-xxs">Please specify a positive PKR rate.</div>
                </div>
              </div>

              <!-- Quantity Input -->
              <div class="col-sm-6 col-12">
                <label for="offerQty" class="offer-form-label">
                  <i class="bi bi-box-seam text-warning"></i> Quantity to Trade
                </label>
                <div class="input-group">
                  <input type="number" id="offerQty" class="form-control offer-form-control" placeholder="0.00" min="0.000001" step="any" required>
                  <span class="input-group-text bg-transparent border-secondary border-opacity-10 text-muted text-xs" id="qty-symbol-addon">--</span>
                  <div class="invalid-feedback text-xxs">Please specify a positive volume quantity.</div>
                </div>
              </div>

              <!-- Optional Description -->
              <div class="col-12">
                <label for="offerDesc" class="offer-form-label">
                  <i class="bi bi-pencil-square text-muted"></i> Optional Public Terms / Description
                </label>
                <textarea id="offerDesc" class="form-control offer-form-control" rows="2" placeholder="Describe escrow requirements, bank details, or preferred coordinates..."></textarea>
              </div>
            </div>

            <!-- Action Buttons Footer -->
            <div class="d-flex flex-wrap gap-2 justify-content-between mt-4 pt-3 border-top border-secondary border-opacity-10">
              <button type="button" class="btn btn-outline-secondary py-2 px-4 text-xs text-uppercase" id="btnCancelForm">
                <i class="bi bi-arrow-left"></i> Back to Market
              </button>
              
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-outline-danger py-2 px-3 text-xs text-uppercase d-none" id="btnCancelOfferRecord">
                  <i class="bi bi-trash-fill"></i> Cancel Active Offer
                </button>
                <button type="submit" class="btn btn-primary py-2 px-4 text-xs text-uppercase fw-bold text-glow-primary text-black" id="btnSubmitForm">
                  <i class="bi bi-shield-lock-fill"></i> Secure Offer
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <!-- Right Column: Live Calculations & Order Preview Summary -->
      <div class="col-lg-5 col-md-12">
        <div class="calculations-panel d-flex flex-column justify-content-between">
          <div>
            <h4 class="text-display fw-bold text-white fs-5 mb-4 d-flex align-items-center gap-2">
              <i class="bi bi-cpu text-primary"></i> Live Ledger Calculations
            </h4>

            <div class="calc-row">
              <span class="calc-label">Subtotal Value</span>
              <span class="calc-value" id="calc-subtotal">₨ 0.00</span>
            </div>

            <div class="calc-row">
              <span class="calc-label">Network Escrow Fee (0.2%)</span>
              <span class="calc-value text-muted" id="calc-fee">₨ 0.00</span>
            </div>

            <div class="calc-row">
              <span class="calc-label" id="lbl-collateral">Required Liquid Collateral</span>
              <span class="calc-value text-warning" id="calc-collateral">0.00 PKR</span>
            </div>

            <div class="calc-total-row d-flex justify-content-between align-items-center mt-3">
              <span class="text-xs text-muted uppercase text-mono">Estimated Total Ledger Cost</span>
              <span class="fs-5 text-white fw-bold text-mono" id="calc-total">₨ 0.00</span>
            </div>

            <!-- Live Balance Sheet Check Card -->
            <div class="mt-4 p-3 rounded border border-secondary border-opacity-10" style="background: rgba(255, 255, 255, 0.01);">
              <span class="text-xxs text-muted text-mono d-block mb-1">AVAILABLE LIQUID FUNDS CHECK</span>
              <div class="balance-container mb-1.5">
                <span class="balance-available">Available in Wallet:</span>
                <span class="fw-bold text-white" id="val-available-balance">0.00 --</span>
              </div>
              <div class="balance-container">
                <span class="balance-available">Remaining Balance:</span>
                <span class="fw-bold text-glow-primary" id="val-remaining-balance">0.00 --</span>
              </div>
            </div>
          </div>

          <!-- Professional Order Preview Block -->
          <div class="order-preview-card">
            <span class="text-xxs text-muted text-mono d-block mb-2">CRYPTOGRAPHIC LEDGER PREVIEW</span>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="text-xs text-white" id="preview-coin-pair">COIN / PKR</span>
              <span class="preview-pill type-buy" id="preview-type-pill">BUY</span>
            </div>
            <div class="text-xxs text-muted text-mono" id="preview-text">
              Enter price rates and quantities to construct cryptographic ledger packet.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Initialize page layout and dynamic title header
  const title = state.mode === "edit" ? "Edit Active Offer" : "Secure New Offer";
  const desc = state.mode === "edit" 
    ? "Modify terms, adjust pricing limits, or safely cancel active order escrows on the HFC node." 
    : "Register a secure P2P buy or sell request backed 1:1 by multi-sig vault collateral holds.";

  new PageHeader("#offer-page-header", {
    title,
    description: desc,
    breadcrumbs: [
      { label: "Dashboard", href: "dashboard.html" },
      { label: "Marketplace", href: "marketplace.html" },
      { label: state.mode === "edit" ? "Edit Offer" : "Create Offer", active: true }
    ]
  });

  // Bind type buttons (Buy/Sell toggles)
  const btnBuy = document.getElementById("btn-type-buy");
  const btnSell = document.getElementById("btn-type-sell");

  btnBuy.onclick = () => {
    if (state.hasActiveNegotiation) {
      Toast.show("Editing transaction type is locked because active negotiations exist.", { type: "warning" });
      return;
    }
    setOfferType("buy");
  };

  btnSell.onclick = () => {
    if (state.hasActiveNegotiation) {
      Toast.show("Editing transaction type is locked because active negotiations exist.", { type: "warning" });
      return;
    }
    setOfferType("sell");
  };

  // Bind Cancel Form / Back to market button
  document.getElementById("btnCancelForm").onclick = () => {
    window.location.href = "marketplace.html";
  };

  // Bind Cancel Offer Record (only visible/functional in Edit Mode)
  document.getElementById("btnCancelOfferRecord").onclick = () => {
    handleCancelOfferRecord();
  };

  // Form submit handler
  const form = document.getElementById("offerForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    await handleFormSubmission();
  };

  // Input calculations triggers
  document.getElementById("offerPrice").addEventListener("input", triggerLiveCalculations);
  document.getElementById("offerQty").addEventListener("input", triggerLiveCalculations);
  document.getElementById("offerCoin").addEventListener("change", (e) => {
    const symbol = e.target.value;
    document.getElementById("qty-symbol-addon").textContent = symbol || "--";
    triggerLiveCalculations();
  });
}

/**
 * Switch types between BUY and SELL, updating classes and recalculations
 */
function setOfferType(type) {
  state.activeType = type;
  const btnBuy = document.getElementById("btn-type-buy");
  const btnSell = document.getElementById("btn-type-sell");
  const pill = document.getElementById("preview-type-pill");

  if (type === "buy") {
    btnBuy.className = "offer-type-btn active-buy";
    btnSell.className = "offer-type-btn";
    pill.className = "preview-pill type-buy";
    pill.textContent = "BUY";
  } else {
    btnBuy.className = "offer-type-btn";
    btnSell.className = "offer-type-btn active-sell";
    pill.className = "preview-pill type-sell";
    pill.textContent = "SELL";
  }

  triggerLiveCalculations();
}

/**
 * Fetches real-time snapshots of Coins and Wallets to maintain absolute 1:1 sync with databases
 */
async function initRealtimeListeners() {
  const userId = state.user.uid;

  // 1. Listen to available coins collection
  const coinsRef = collection(db, "coins");
  onSnapshot(coinsRef, (snapshot) => {
    let coinsList = [];
    snapshot.forEach(docSnap => {
      coinsList.push({ id: docSnap.id, ...docSnap.data() });
    });
    state.coins = coinsList;

    // Populate dropdown
    const coinSelect = document.getElementById("offerCoin");
    if (coinSelect) {
      // Preserve current selected coin
      const currentSelection = coinSelect.value;
      coinSelect.innerHTML = `<option value="" disabled selected>Select Coin...</option>`;
      
      coinsList.forEach(c => {
        if (c.status === "active" && c.symbol !== "PKR") {
          const opt = document.createElement("option");
          opt.value = c.symbol;
          opt.textContent = `${c.name} (${c.symbol})`;
          coinSelect.appendChild(opt);
        }
      });
      if (currentSelection) {
        coinSelect.value = currentSelection;
      }
    }

    triggerLiveCalculations();
  }, (err) => {
    console.error("Coins snapshot failure:", err);
    Toast.show("Failed to listen to live coin parameters.", { type: "danger" });
  });

  // 2. Listen to active User Wallets
  const walletsQuery = query(collection(db, "wallets"), where("ownerId", "==", userId));
  onSnapshot(walletsQuery, (snapshot) => {
    let walletsList = [];
    snapshot.forEach(docSnap => {
      walletsList.push({ id: docSnap.id, ...docSnap.data() });
    });
    state.wallets = walletsList;
    triggerLiveCalculations();
  }, (err) => {
    console.error("Wallets snapshot failure:", err);
  });

  // 3. If in EDIT Mode, retrieve the active Offer document and build real-time guard
  if (state.mode === "edit" && state.offerId) {
    const mainLoader = new Loader({ text: "Authenticating ledger record..." });
    mainLoader.show();

    // Query active negotiations to see if edit should be locked
    try {
      const negoQuery = query(collection(db, "negotiations"), where("offerId", "==", state.offerId));
      const negoSnap = await getDocs(negoQuery);
      state.hasActiveNegotiation = negoSnap.size > 0;
    } catch (err) {
      console.error("Negotiations lookup error:", err);
    }

    // Subscribe to offer record changes
    const offerRef = doc(db, "offers", state.offerId);
    onSnapshot(offerRef, (docSnap) => {
      mainLoader.hide();

      if (!docSnap.exists()) {
        Toast.show("Requested offer record not found.", { type: "danger" });
        setTimeout(() => { window.location.href = "marketplace.html"; }, 1500);
        return;
      }

      const offer = { id: docSnap.id, ...docSnap.data() };
      state.existingOffer = offer;

      // Fill values
      setOfferType(offer.type || "buy");
      
      const coinSelect = document.getElementById("offerCoin");
      if (coinSelect) coinSelect.value = offer.coinSymbol;
      
      const priceInput = document.getElementById("offerPrice");
      if (priceInput) priceInput.value = offer.rate;

      const qtyInput = document.getElementById("offerQty");
      if (qtyInput) qtyInput.value = offer.initialQuantity || offer.quantity;

      const descInput = document.getElementById("offerDesc");
      if (descInput) descInput.value = offer.description || "";

      const expiryInput = document.getElementById("offerExpiry");
      if (expiryInput && offer.expiry) {
        // Expiry can be stored as timestamp or date string. Convert to format 'YYYY-MM-DDTHH:MM'
        const dateObj = offer.expiry.seconds ? new Date(offer.expiry.seconds * 1000) : new Date(offer.expiry);
        const pad = (num) => String(num).padStart(2, '0');
        const formattedDate = `${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
        expiryInput.value = formattedDate;
      }

      // Check validation constraints: Allow editing only when No negotiations exist AND Status == "active"
      const alertContainer = document.getElementById("offer-edit-lock-alert");
      const submitBtn = document.getElementById("btnSubmitForm");
      const deleteBtn = document.getElementById("btnCancelOfferRecord");

      let lockMessage = "";
      let lockReason = null;

      if (offer.status !== "active") {
        lockReason = "status";
        lockMessage = `This offer is currently locked because its status is <strong class="text-white">${offer.status.toUpperCase()}</strong>. Editing is prohibited.`;
      } else if (state.hasActiveNegotiation) {
        lockReason = "negotiations";
        lockMessage = `This offer has active peer negotiation requests. Altering transaction terms is secured and locked.`;
      }

      if (lockReason) {
        alertContainer.className = "alert alert-dashboard p-3 mb-4 d-flex align-items-center gap-2";
        alertContainer.style.background = "rgba(246, 70, 93, 0.05)";
        alertContainer.style.border = "1px solid rgba(246, 70, 93, 0.15)";
        alertContainer.innerHTML = `
          <i class="bi bi-shield-lock-fill text-danger fs-5"></i>
          <span class="text-xs text-secondary">${lockMessage}</span>
        `;
        
        // Disable fields
        disableFormFields(true);
        submitBtn.disabled = true;
        deleteBtn.classList.add("d-none"); // Hide cancellation button since it's already locked/inactive
      } else {
        alertContainer.className = "d-none";
        disableFormFields(false);
        submitBtn.disabled = false;
        deleteBtn.classList.remove("d-none"); // Show cancellation option
      }

      triggerLiveCalculations();
    }, (err) => {
      mainLoader.hide();
      console.error("Offer listener failure:", err);
      Toast.show("Secured channel error reading offer document.", { type: "danger" });
    });
  }
}

/**
 * Disables or enables core form fields
 */
function disableFormFields(disable) {
  const fields = ["offerCoin", "offerExpiry", "offerPrice", "offerQty", "offerDesc"];
  fields.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.disabled = disable;
  });
  
  const buyBtn = document.getElementById("btn-type-buy");
  const sellBtn = document.getElementById("btn-type-sell");
  if (buyBtn && sellBtn) {
    if (disable) {
      buyBtn.setAttribute("disabled", "true");
      sellBtn.setAttribute("disabled", "true");
      buyBtn.style.pointerEvents = "none";
      sellBtn.style.pointerEvents = "none";
    } else {
      buyBtn.removeAttribute("disabled");
      sellBtn.removeAttribute("disabled");
      buyBtn.style.pointerEvents = "auto";
      sellBtn.style.pointerEvents = "auto";
    }
  }
}

/**
 * Core Live Calculation and Visual Balance Check engine
 */
function triggerLiveCalculations() {
  const coinSelect = document.getElementById("offerCoin");
  const priceInput = document.getElementById("offerPrice");
  const qtyInput = document.getElementById("offerQty");

  const subtotalEl = document.getElementById("calc-subtotal");
  const feeEl = document.getElementById("calc-fee");
  const collateralLbl = document.getElementById("lbl-collateral");
  const collateralEl = document.getElementById("calc-collateral");
  const totalEl = document.getElementById("calc-total");

  const availBalEl = document.getElementById("val-available-balance");
  const remainBalEl = document.getElementById("val-remaining-balance");

  const previewCoinPair = document.getElementById("preview-coin-pair");
  const previewText = document.getElementById("preview-text");

  const coinSymbol = coinSelect?.value || "--";
  const rawPrice = parseFloat(priceInput?.value || "0");
  const rawQty = parseFloat(qtyInput?.value || "0");

  const price = isNaN(rawPrice) || rawPrice < 0 ? 0 : rawPrice;
  const qty = isNaN(rawQty) || rawQty < 0 ? 0 : rawQty;

  // 1. Basic calculations
  const subtotal = qty * price;
  const feeRate = 0.002; // 0.2% fee
  const fee = subtotal * feeRate;

  // Let's format decimals appropriately
  const formatCurrency = (val, dec = 2) => val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });

  subtotalEl.textContent = `₨ ${formatCurrency(subtotal)}`;
  feeEl.textContent = `₨ ${formatCurrency(fee)}`;

  // 2. Mode dependent pricing & collateral requirements
  let collateralNeeded = 0;
  let totalLedgerCost = 0;
  let targetCurrency = "";

  if (state.activeType === "buy") {
    // BUYING COIN: Needs PKR collateral to secure the transaction
    collateralNeeded = subtotal; // standard buy locks the rate subtotal
    totalLedgerCost = subtotal + fee;
    targetCurrency = "PKR";
    collateralLbl.textContent = "Required Liquid Collateral";
    collateralEl.textContent = `${formatCurrency(collateralNeeded)} PKR`;
    totalEl.textContent = `₨ ${formatCurrency(totalLedgerCost)}`;
  } else {
    // SELLING COIN: Needs Coin collateral to lock in multi-sig escrow holds
    collateralNeeded = qty;
    totalLedgerCost = subtotal - fee; // receives subtotal minus fees
    targetCurrency = coinSymbol;
    collateralLbl.textContent = "Required Escrow Assets";
    collateralEl.textContent = `${formatCurrency(collateralNeeded, 6)} ${coinSymbol}`;
    totalEl.textContent = `₨ ${formatCurrency(totalLedgerCost)}`;
  }

  // 3. Wallet lookup & balance comparison
  const targetWallet = state.wallets.find(w => w.currency === targetCurrency);
  let availableBalance = 0;

  if (targetWallet) {
    availableBalance = targetWallet.availableBalance !== undefined ? targetWallet.availableBalance : (targetWallet.balance || 0);
  }

  // If we are in Edit Mode and editing the SAME asset, we must adjust the balance checker!
  // In Edit Mode, the funds currently locked by THIS offer are already deducted from Available Balance.
  // So we must temporarily add back the original locked hold collateral to accurately calculate the remaining balance!
  let tempOriginalCollateral = 0;
  if (state.mode === "edit" && state.existingOffer) {
    const isSameType = state.existingOffer.type === state.activeType;
    const isSameCoin = state.existingOffer.coinSymbol === coinSymbol;
    
    if (isSameType && isSameCoin) {
      if (state.activeType === "buy") {
        tempOriginalCollateral = (state.existingOffer.initialQuantity || state.existingOffer.quantity) * state.existingOffer.rate;
      } else {
        tempOriginalCollateral = state.existingOffer.initialQuantity || state.existingOffer.quantity;
      }
    }
  }

  const simulatedAvailable = availableBalance + tempOriginalCollateral;
  const remainingBalance = simulatedAvailable - collateralNeeded;

  const displayDecimals = targetCurrency === "PKR" ? 2 : 6;
  availBalEl.textContent = `${formatCurrency(simulatedAvailable, displayDecimals)} ${targetCurrency}`;
  
  remainBalEl.textContent = `${formatCurrency(remainingBalance, displayDecimals)} ${targetCurrency}`;
  if (remainingBalance < 0) {
    remainBalEl.className = "fw-bold text-glow-danger text-danger";
  } else {
    remainBalEl.className = "fw-bold text-glow-primary text-white";
  }

  // 4. Update order preview box
  previewCoinPair.textContent = `${coinSymbol} / PKR`;
  if (qty > 0 && price > 0) {
    previewText.innerHTML = `
      Securing <strong class="text-white">${formatCurrency(qty, 6)} ${coinSymbol}</strong> at exchange rate <strong class="text-white">₨ ${formatCurrency(price)}</strong> PKR per token.
      <br><span class="text-secondary mt-1 d-block">Hold Lock: ${formatCurrency(collateralNeeded, displayDecimals)} ${targetCurrency} will be transferred to multi-sig holds.</span>
    `;
  } else {
    previewText.textContent = "Enter price rates and quantities to construct cryptographic ledger packet.";
  }
}

/**
 * Submits the form data inside a high-integrity transaction to ensure safe ledger holds
 */
async function handleFormSubmission() {
  const form = document.getElementById("offerForm");
  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    return;
  }

  if (state.isSubmitting) return;

  const coinSelect = document.getElementById("offerCoin");
  const priceInput = document.getElementById("offerPrice");
  const qtyInput = document.getElementById("offerQty");
  const expiryInput = document.getElementById("offerExpiry");
  const descInput = document.getElementById("offerDesc");

  const coinSymbol = coinSelect.value;
  const rate = parseFloat(priceInput.value);
  const qty = parseFloat(qtyInput.value);
  const expiryVal = new Date(expiryInput.value);
  const description = descInput.value.trim();

  // Guard against past expiry
  if (expiryVal.getTime() <= Date.now()) {
    Toast.show("Offer expiration date must be in the future.", { type: "danger" });
    return;
  }

  // Positive price and qty validation
  if (rate <= 0 || qty <= 0) {
    Toast.show("Price and quantity parameters must be positive numbers.", { type: "danger" });
    return;
  }

  const collateralNeeded = state.activeType === "buy" ? (qty * rate) : qty;
  const targetCurrency = state.activeType === "buy" ? "PKR" : coinSymbol;

  // Check wallets pre-flight
  const targetWallet = state.wallets.find(w => w.currency === targetCurrency);
  let availableBalance = 0;
  if (targetWallet) {
    availableBalance = targetWallet.availableBalance !== undefined ? targetWallet.availableBalance : (targetWallet.balance || 0);
  }

  // Compute original holds to adjust simulated limits
  let tempOriginalCollateral = 0;
  if (state.mode === "edit" && state.existingOffer) {
    const isSameType = state.existingOffer.type === state.activeType;
    const isSameCoin = state.existingOffer.coinSymbol === coinSymbol;
    
    if (isSameType && isSameCoin) {
      if (state.activeType === "buy") {
        tempOriginalCollateral = (state.existingOffer.initialQuantity || state.existingOffer.quantity) * state.existingOffer.rate;
      } else {
        tempOriginalCollateral = state.existingOffer.initialQuantity || state.existingOffer.quantity;
      }
    }
  }

  if (availableBalance + tempOriginalCollateral < collateralNeeded) {
    Toast.show(`Insufficient balance. You need at least ${collateralNeeded} ${targetCurrency} to cover collateral.`, { type: "danger" });
    return;
  }

  // Commit transaction
  state.isSubmitting = true;
  Loader.buttonLoader("#btnSubmitForm", true, "Authorizing...");

  try {
    const result = await runSafeTransaction(async (transaction) => {
      // 1. Read wallets to make sure database values haven't changed during filling
      const walletId = `${state.user.uid}_${targetCurrency}`;
      const walletRef = doc(db, "wallets", walletId);
      const walletSnap = await transaction.get(walletRef);

      let currentAvail = 0;
      let currentHold = 0;
      let walletAddress = "";

      if (walletSnap.exists()) {
        const wData = walletSnap.data();
        currentAvail = wData.availableBalance !== undefined ? wData.availableBalance : (wData.balance || 0);
        currentHold = wData.holdBalance || 0;
        walletAddress = wData.address || "";
      } else {
        // Create wallet shell inside the transaction if it doesn't exist
        walletAddress = "0x" + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('');
      }

      // 2. Adjust Balance holds depending on Create or Edit
      let newAvail = currentAvail;
      let newHold = currentHold;

      if (state.mode === "create") {
        // Safe check
        if (currentAvail < collateralNeeded) {
          throw new Error("Core available balance changed. Transaction aborted.");
        }
        newAvail = currentAvail - collateralNeeded;
        newHold = currentHold + collateralNeeded;
      } else {
        // Edit Mode: calculate difference
        const originalCollateral = state.existingOffer.type === "buy" 
          ? (state.existingOffer.initialQuantity || state.existingOffer.quantity) * state.existingOffer.rate
          : (state.existingOffer.initialQuantity || state.existingOffer.quantity);

        const diff = collateralNeeded - originalCollateral;

        if (diff > 0) {
          // Needs additional holds
          if (currentAvail < diff) {
            throw new Error("Insufficient additional liquidity to update offer holdings.");
          }
          newAvail = currentAvail - diff;
          newHold = currentHold + diff;
        } else if (diff < 0) {
          // Releases excess holds
          newAvail = currentAvail + Math.abs(diff);
          newHold = currentHold - Math.abs(diff);
        }
      }

      // 3. Construct or Update Offer document
      const targetOfferId = state.mode === "create" 
        ? `OFR-SECURE-${Date.now()}` 
        : state.offerId;
      
      const offerRef = doc(db, "offers", targetOfferId);

      const offerPayload = {
        offerId: targetOfferId,
        creatorId: state.user.uid,
        creatorUID: state.user.uid, // backward compatibility
        type: state.activeType,
        offerType: state.activeType, // compatibility
        coinSymbol: coinSymbol,
        coin: coinSymbol, // compatibility
        rate: rate,
        price: rate, // compatibility
        initialQuantity: qty,
        quantity: qty, // compatibility
        remainingQuantity: state.mode === "create" ? qty : qty, // in edit mode remaining updates to new qty
        status: "active",
        expiry: expiryVal,
        description: description,
        updatedAt: serverTimestamp()
      };

      if (state.mode === "create") {
        offerPayload.createdAt = serverTimestamp();
      } else {
        // preserve old fields
        offerPayload.createdAt = state.existingOffer.createdAt;
      }

      // Write changes
      transaction.set(walletRef, {
        walletId,
        ownerId: state.user.uid,
        currency: targetCurrency,
        availableBalance: newAvail,
        holdBalance: newHold,
        balance: newAvail, // backward compatibility
        address: walletAddress,
        updatedAt: serverTimestamp()
      }, { merge: true });

      transaction.set(offerRef, offerPayload, { merge: true });

      return targetOfferId;
    });

    Loader.buttonLoader("#btnSubmitForm", false);
    state.isSubmitting = false;

    Toast.show(state.mode === "create" ? "Offer successfully registered!" : "Offer updated and holds recalibrated.", { type: "success" });
    
    // Redirect to marketplace page
    setTimeout(() => {
      window.location.href = "marketplace.html";
    }, 1200);

  } catch (err) {
    Loader.buttonLoader("#btnSubmitForm", false);
    state.isSubmitting = false;
    console.error("Submission failed:", err);
    
    let userMsg = "Transaction aborted by database security ledger rules.";
    if (err.message.includes("aborted") || err.message.includes("liquidity") || err.message.includes("changed")) {
      userMsg = err.message;
    }
    Toast.show(userMsg, { type: "danger" });
  }
}

/**
 * Handle cancellation of an active offer completely inside a transaction, releasing hold balances
 */
function handleCancelOfferRecord() {
  if (!state.existingOffer) return;

  Modal.confirm({
    title: "Verify Offer Cancellation",
    body: `
      <p class="text-secondary">Are you sure you want to cancel active offer <strong class="text-white">${state.offerId.substring(0, 10)}</strong>?</p>
      <div class="p-3 rounded border border-secondary border-opacity-10 bg-white bg-opacity-5 mb-2">
        <div class="d-flex justify-content-between mb-1 text-xs"><span>Asset Pair:</span><strong class="text-white">${state.existingOffer.coinSymbol} / PKR</strong></div>
        <div class="d-flex justify-content-between mb-1 text-xs"><span>Offer Type:</span><strong class="text-uppercase text-white">${state.existingOffer.type}</strong></div>
        <div class="d-flex justify-content-between text-xs"><span>Remaining Qty:</span><strong class="text-white">${state.existingOffer.remainingQuantity}</strong></div>
      </div>
      <p class="text-warning text-xxs mb-0"><i class="bi bi-shield-alert text-warning"></i> Cancellation immediately voids the offer listings on the ledger and releases hold balances back to your available sheets.</p>
    `,
    confirmText: "Cancel Offer & Release Funds",
    confirmClass: "btn-hfc-danger",
    onConfirm: async () => {
      const loader = new Loader({ text: "Releasing hold collateral..." });
      loader.show();

      try {
        const rate = state.existingOffer.rate;
        const remainingQty = state.existingOffer.remainingQuantity || state.existingOffer.initialQuantity || state.existingOffer.quantity;
        
        const refundAmount = state.existingOffer.type === "buy" ? (remainingQty * rate) : remainingQty;
        const targetCurrency = state.existingOffer.type === "buy" ? "PKR" : state.existingOffer.coinSymbol;

        await runSafeTransaction(async (transaction) => {
          // 1. Fetch wallet
          const walletId = `${state.user.uid}_${targetCurrency}`;
          const walletRef = doc(db, "wallets", walletId);
          const walletSnap = await transaction.get(walletRef);

          if (!walletSnap.exists()) {
            throw new Error("Asset wallet reference not found.");
          }

          const wData = walletSnap.data();
          const currentAvail = wData.availableBalance !== undefined ? wData.availableBalance : (wData.balance || 0);
          const currentHold = wData.holdBalance || 0;

          // 2. Compute safety limits
          if (currentHold < refundAmount) {
            throw new Error("Divergent lock sheets: Hold limits are lower than refundable collateral.");
          }

          const newAvail = currentAvail + refundAmount;
          const newHold = currentHold - refundAmount;

          // 3. Update documents
          transaction.update(walletRef, {
            availableBalance: newAvail,
            holdBalance: newHold,
            balance: newAvail, // compatibility
            updatedAt: serverTimestamp()
          });

          const offerRef = doc(db, "offers", state.offerId);
          transaction.update(offerRef, {
            status: "cancelled",
            updatedAt: serverTimestamp()
          });
        });

        loader.hide();
        Toast.show("Offer cancelled and collateral holds returned successfully.", { type: "success" });
        
        setTimeout(() => {
          window.location.href = "marketplace.html";
        }, 1200);

      } catch (err) {
        loader.hide();
        console.error("Cancellation txn error:", err);
        Toast.show("Cancellation execution failed: " + err.message, { type: "danger" });
      }
    }
  });
}
