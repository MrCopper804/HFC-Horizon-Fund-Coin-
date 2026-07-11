/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Offer Details & Negotiation Workspace Controller
 * Dynamic state synchronizer, conversation history log, real-time agreement trackers,
 * counter-proposal generators, double-confirmation escrows, and robust validations.
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
  onSnapshot,
  serverTimestamp 
} from "firebase/firestore";
import { 
  createDocument, 
  runSafeTransaction 
} from "../../firebase/firestore.js";

// Negotiation Page State Registry
const state = {
  user: null,
  negotiationId: null,
  negotiation: null,
  offer: null,
  isSeller: false,
  isBuyer: false,
  counterpartyId: null,
  counterpartyName: "Counterparty Node",
  messages: [],
  isSubmitting: false,
  unreadCount: 0
};

// DOM Content Setup on Boot
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Authenticate user
  const user = await protectPage();
  if (!user) return;
  state.user = user;

  // 2. Identify negotiation channel ID
  const urlParams = new URLSearchParams(window.location.search);
  const negoId = urlParams.get("id");
  if (!negoId) {
    Toast.show("No negotiation channel signature found. Returning to marketplace...", { type: "danger" });
    setTimeout(() => { window.location.href = "marketplace.html"; }, 1500);
    return;
  }
  state.negotiationId = negoId;

  // 3. Setup Layout Orchestrator
  const layout = new PageLayout("#app-root", {
    navbarOptions: {
      userEmail: user.email,
      versionText: "HFC Engine v2.4",
      initialNotifications: [
        { id: 1, type: "primary", text: "Secure negotiation tunnel established." }
      ],
      onLogout: async () => {
        try {
          const { logoutUser } = await import("../../firebase/auth.js");
          await logoutUser();
          Toast.show("Secure session terminated successfully.", { type: "info" });
          setTimeout(() => { window.location.href = "login.html"; }, 1000);
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

  // 4. Render Layout
  renderWorkspaceStructure(layout);

  // 5. Establish real-time listen pipelines
  initRealtimeTunnel();
});

/**
 * Builds HTML skeletal divisions inside content block
 */
function renderWorkspaceStructure(layout) {
  const container = layout.getContentContainer();
  if (!container) return;

  container.innerHTML = `
    <!-- Top breadcrumb page header -->
    <div id="workspace-header"></div>

    <!-- Active Negotiation Workspace Grid -->
    <div class="workspace-container mt-1" id="workspace-grid-wrapper">
      
      <!-- LEFT MODULE: Conversational Chat & Actions -->
      <div class="d-flex flex-column gap-4">
        
        <!-- Status Indicator Strip -->
        <div class="p-3 rounded border border-secondary border-opacity-10 d-flex align-items-center justify-content-between" style="background: rgba(255, 255, 255, 0.01);">
          <div class="d-flex align-items-center gap-2">
            <span class="status-pulse-primary rounded-circle bg-warning" id="status-dot" style="width: 10px; height: 10px;"></span>
            <span class="text-xxs text-muted uppercase text-mono tracking-wider">TUNNEL STATUS:</span>
            <strong class="text-xs text-white uppercase text-mono" id="lbl-status-badge">CONNECTING...</strong>
          </div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-outline-danger btn-sm text-xxs uppercase tracking-wide px-3 py-1.5" id="btn-cancel-negotiation">
              <i class="bi bi-x-circle"></i> Cancel Negotiation
            </button>
          </div>
        </div>

        <!-- Professional Chat Timeline Workspace -->
        <div class="negotiation-pane">
          <div class="negotiation-header">
            <div class="d-flex align-items-center gap-2">
              <div class="message-avatar bg-primary bg-opacity-10 border-primary border-opacity-10 text-primary">C</div>
              <div>
                <h5 class="text-white fs-6 mb-0" id="lbl-peer-username">Resolving Node...</h5>
                <span class="text-xxs text-muted" id="lbl-peer-role">Authorized Trading Peer</span>
              </div>
            </div>
            <span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10 text-mono text-xxs" id="lbl-nego-id">ID: --</span>
          </div>

          <!-- Messages Stream Scroller -->
          <div class="negotiation-messages-scroller" id="chat-messages-container" role="log" aria-live="polite">
            <!-- Loader Skeleton while messages resolve -->
            <div class="text-center py-5 my-5 text-secondary">
              <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
              <p class="text-xxs text-mono">RETRIEVING CHRONOLOGICAL HISTORY...</p>
            </div>
          </div>

          <!-- Chat Input / Action Controls -->
          <div class="negotiation-footer">
            <form id="chat-form" class="d-flex gap-2" novalidate>
              <input type="text" id="chat-text-input" class="form-control negotiation-form-control flex-1" placeholder="Type secure chat message to peer..." autocomplete="off" required aria-label="Chat message">
              <button type="submit" class="btn btn-primary px-4 text-xs uppercase text-black font-semibold" id="btn-send-chat">
                <i class="bi bi-send-fill"></i> Send
              </button>
            </form>
          </div>
        </div>

      </div>

      <!-- RIGHT MODULE: Sticky Summary and Active Agreement Panel -->
      <div class="sidebar-sticky-panel">
        
        <!-- Active Agreement Board -->
        <div class="agreement-card" id="agreement-board-card">
          <h4 class="text-display fw-bold text-white fs-6 mb-3 d-flex align-items-center gap-2">
            <i class="bi bi-handshake text-warning"></i> Proposal Agreement
          </h4>
          
          <div class="p-3 rounded mb-3 border border-warning border-opacity-10 bg-warning bg-opacity-5">
            <div class="d-flex justify-content-between mb-2">
              <span class="text-xxs text-muted text-mono">PROPOSED RATE</span>
              <span class="fw-bold text-white text-mono fs-5" id="lbl-agree-price">₨ 0.00</span>
            </div>
            <div class="d-flex justify-content-between">
              <span class="text-xxs text-muted text-mono">PROPOSED QUANTITY</span>
              <span class="fw-bold text-warning text-mono fs-5" id="lbl-agree-qty">0.0000 --</span>
            </div>
          </div>

          <div class="summary-stat-row">
            <span class="summary-stat-label">Last Updated By</span>
            <span class="summary-stat-value text-white text-xs text-mono" id="lbl-agree-updater">--</span>
          </div>

          <div class="summary-stat-row mb-3">
            <span class="summary-stat-label">Waiting For Action</span>
            <span class="summary-stat-value text-white text-xs text-mono" id="lbl-agree-waiting">--</span>
          </div>

          <!-- User Specific Actions Panel -->
          <div class="d-flex flex-column gap-2" id="action-proposals-container">
            <button type="button" class="btn btn-warning w-full py-2 px-3 text-xs uppercase font-bold text-black" id="btn-propose-counter">
              <i class="bi bi-arrow-left-right"></i> Propose Counter Offer
            </button>
            <button type="button" class="btn btn-success w-full py-2 px-3 text-xs uppercase font-bold text-white text-glow-success" id="btn-accept-proposal">
              <i class="bi bi-check-circle-fill"></i> Accept Proposal Terms
            </button>
          </div>

          <!-- Current Acceptances Badges Strip -->
          <div class="d-flex justify-content-between gap-2 mt-3 pt-3 border-top border-secondary border-opacity-10">
            <div class="agree-state-badge pending" id="badge-buyer-agree">
              <i class="bi bi-hourglass-split"></i> Buyer: PENDING
            </div>
            <div class="agree-state-badge pending" id="badge-seller-agree">
              <i class="bi bi-hourglass-split"></i> Seller: PENDING
            </div>
          </div>
        </div>

        <!-- Double Signature Finalized Deal Summary (Shown ONLY when both agreed) -->
        <div class="agreement-card is-locked d-none" id="final-deal-summary-card">
          <h4 class="text-display fw-bold text-glow-primary text-white fs-6 mb-3 d-flex align-items-center gap-2">
            <i class="bi bi-shield-check text-success"></i> Escrow Deal Summary
          </h4>
          
          <div class="p-3 rounded mb-3 border border-success border-opacity-10 bg-success bg-opacity-5">
            <div class="d-flex justify-content-between mb-1 text-xxs">
              <span class="text-muted">Target Cryptocurrency:</span>
              <strong class="text-white" id="lbl-final-coin">--</strong>
            </div>
            <div class="d-flex justify-content-between mb-1 text-xxs">
              <span class="text-muted">Final volume Quantity:</span>
              <strong class="text-white text-mono" id="lbl-final-qty">0.00 --</strong>
            </div>
            <div class="d-flex justify-content-between mb-1 text-xxs">
              <span class="text-muted">Final Price Rate:</span>
              <strong class="text-white text-mono" id="lbl-final-rate">0.00 PKR</strong>
            </div>
            <hr class="my-2 border-secondary border-opacity-10">
            <div class="d-flex justify-content-between mb-1 text-xxs">
              <span class="text-muted" id="lbl-fee-title">Escrow Fee (0.2%):</span>
              <strong class="text-white text-mono" id="lbl-final-fee">₨ 0.00</strong>
            </div>
            <div class="d-flex justify-content-between text-xs mt-1">
              <strong class="text-success" id="lbl-payout-title">Total ledger cost:</strong>
              <strong class="text-success text-mono fs-6" id="lbl-final-total">₨ 0.00</strong>
            </div>
          </div>

          <div class="p-2.5 rounded mb-3 border border-secondary border-opacity-10 text-xxs text-secondary text-mono" style="background: rgba(255, 255, 255, 0.01);">
            <strong class="text-white d-block mb-1">Estimated Wallet Impact:</strong>
            <div id="lbl-wallet-delta">--</div>
          </div>

          <button type="button" class="btn btn-primary w-full py-2.5 px-3 text-xs uppercase font-bold text-black text-glow-primary" id="btn-confirm-deal">
            <i class="bi bi-shield-lock-fill"></i> Confirm Deal Escrow
          </button>

          <!-- Confirmation progress track -->
          <div class="d-flex justify-content-between gap-2 mt-3 pt-3 border-top border-secondary border-opacity-10">
            <div class="agree-state-badge pending w-full justify-content-center" id="badge-buyer-confirm">
              Buyer Signature: NO
            </div>
            <div class="agree-state-badge pending w-full justify-content-center" id="badge-seller-confirm">
              Seller Signature: NO
            </div>
          </div>
        </div>

        <!-- Sticky Listing Summary Box -->
        <div class="summary-card">
          <h4 class="text-display fw-bold text-white fs-6 mb-3 d-flex align-items-center gap-2">
            <i class="bi bi-info-square text-primary"></i> Listing Parameters
          </h4>

          <div class="summary-stat-row">
            <span class="summary-stat-label">Offer ID</span>
            <span class="summary-stat-value text-secondary text-xs text-mono" id="lbl-offer-id">--</span>
          </div>

          <div class="summary-stat-row">
            <span class="summary-stat-label">Offer Type</span>
            <span class="summary-stat-value text-white text-xs uppercase" id="lbl-offer-type">--</span>
          </div>

          <div class="summary-stat-row">
            <span class="summary-stat-label">Asset Token</span>
            <span class="summary-stat-value text-white text-xs text-mono" id="lbl-coin-token">--</span>
          </div>

          <div class="summary-stat-row">
            <span class="summary-stat-label">Original Price Rate</span>
            <span class="summary-stat-value text-white text-xs text-mono" id="lbl-orig-price">₨ 0.00</span>
          </div>

          <div class="summary-stat-row">
            <span class="summary-stat-label">Original Volume</span>
            <span class="summary-stat-value text-white text-xs text-mono" id="lbl-orig-qty">0.00 --</span>
          </div>

          <div class="summary-stat-row">
            <span class="summary-stat-label">Remaining Volume</span>
            <span class="summary-stat-value text-white text-xs text-mono" id="lbl-remaining-qty">0.00 --</span>
          </div>

          <div class="summary-stat-row">
            <span class="summary-stat-label">Initiated Date</span>
            <span class="summary-stat-value text-muted text-xxs" id="lbl-created-date">--</span>
          </div>

          <div class="summary-stat-row">
            <span class="summary-stat-label">Ledger Expiration</span>
            <span class="summary-stat-value text-muted text-xxs" id="lbl-expiry-date">--</span>
          </div>
        </div>

      </div>
    </div>
  `;

  // Standard PageHeader creation
  new PageHeader("#workspace-header", {
    title: "Negotiation Workspace",
    description: "Secure, real-time escrow contract negotiation tunnel backed 1:1 by liquidity holds.",
    breadcrumbs: [
      { label: "Dashboard", href: "dashboard.html" },
      { label: "Marketplace", href: "marketplace.html" },
      { label: "Negotiation", active: true }
    ]
  });

  // Bind cancel negotiation trigger
  document.getElementById("btn-cancel-negotiation").onclick = () => {
    handleCancelNegotiation();
  };

  // Bind proposal buttons
  document.getElementById("btn-accept-proposal").onclick = () => {
    handleAcceptProposal();
  };

  document.getElementById("btn-propose-counter").onclick = () => {
    openCounterProposalModal();
  };

  // Bind final confirm deal signature
  document.getElementById("btn-confirm-deal").onclick = () => {
    window.location.href = `deal-lock.html?id=${state.negotiationId}`;
  };

  // Bind chat submission form
  document.getElementById("chat-form").onsubmit = async (e) => {
    e.preventDefault();
    await handleSendTextMessage();
  };
}

/**
 * Fetch profiles and run real-time synchronization pipelines
 */
function initRealtimeTunnel() {
  const negoRef = doc(db, "negotiations", state.negotiationId);

  onSnapshot(negoRef, async (negoSnap) => {
    if (!negoSnap.exists()) {
      Toast.show("Negotiation stream severed. Redirection to marketplace...", { type: "danger" });
      setTimeout(() => { window.location.href = "marketplace.html"; }, 1500);
      return;
    }

    const nego = { id: negoSnap.id, ...negoSnap.data() };
    state.negotiation = nego;

    // Detect role
    state.isSeller = state.user.uid === nego.sellerId;
    state.isBuyer = state.user.uid === nego.buyerId;
    state.counterpartyId = state.isSeller ? nego.buyerId : nego.sellerId;

    if (!state.isSeller && !state.isBuyer) {
      Toast.show("Unauthorized. Your node key is not signed on this ledger.", { type: "danger" });
      setTimeout(() => { window.location.href = "marketplace.html"; }, 1500);
      return;
    }

    // Resolve Counterparty username info once
    if (state.counterpartyName === "Counterparty Node") {
      state.counterpartyName = await getUserDisplay(state.counterpartyId);
      const peerNameEl = document.getElementById("lbl-peer-username");
      if (peerNameEl) {
        peerNameEl.textContent = state.counterpartyName;
      }
      const peerRoleEl = document.getElementById("lbl-peer-role");
      if (peerRoleEl) {
        peerRoleEl.textContent = state.isSeller ? "Authorized Buyer Peer" : "Authorized Seller Peer";
      }
    }

    // Bind document details UI values
    document.getElementById("lbl-nego-id").textContent = `ID: ${nego.id.substring(0, 12)}...`;

    // Status mapping & pulses
    const statusDot = document.getElementById("status-dot");
    const statusBadge = document.getElementById("lbl-status-badge");
    const cancelBtn = document.getElementById("btn-cancel-negotiation");

    statusBadge.textContent = nego.status;
    if (nego.status === "open") {
      statusDot.className = "status-pulse-primary rounded-circle bg-warning";
      statusBadge.className = "text-xs text-warning uppercase text-mono";
      cancelBtn.classList.remove("d-none");
    } else if (nego.status === "completed") {
      statusDot.className = "status-pulse-primary rounded-circle bg-success";
      statusBadge.className = "text-xs text-success uppercase text-mono text-glow-success";
      cancelBtn.classList.add("d-none");
    } else if (nego.status === "cancelled") {
      statusDot.className = "status-pulse-primary rounded-circle bg-danger";
      statusBadge.className = "text-xs text-danger uppercase text-mono";
      cancelBtn.classList.add("d-none");
    } else {
      statusDot.className = "status-pulse-primary rounded-circle bg-secondary";
      statusBadge.className = "text-xs text-secondary uppercase text-mono";
      cancelBtn.classList.add("d-none");
    }

    // Render Proposal agreement details
    const formatCurrency = (val, dec = 2) => val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    document.getElementById("lbl-agree-price").textContent = `₨ ${formatCurrency(nego.proposedRate)}`;
    document.getElementById("lbl-agree-qty").textContent = `${formatCurrency(nego.proposedQuantity, 4)}`;

    // Resolve last updater role name
    let updaterLabel = "Initiated";
    if (nego.lastUpdatedBy) {
      updaterLabel = nego.lastUpdatedBy === nego.sellerId ? "Seller" : "Buyer";
    }
    document.getElementById("lbl-agree-updater").textContent = updaterLabel;

    // Resolve waiting for action
    let waitingLabel = "None";
    if (nego.status === "open") {
      if (nego.lastUpdatedBy) {
        waitingLabel = nego.lastUpdatedBy === nego.sellerId ? "Buyer Response" : "Seller Response";
      } else {
        // initially, waiting for seller or buyer depending on who is challenger
        waitingLabel = nego.challengerId === nego.sellerId ? "Buyer Response" : "Seller Response";
      }
    } else {
      waitingLabel = nego.status.toUpperCase();
    }
    document.getElementById("lbl-agree-waiting").textContent = waitingLabel;

    // Set Agree state badges
    const buyerAgreeBadge = document.getElementById("badge-buyer-agree");
    const sellerAgreeBadge = document.getElementById("badge-seller-agree");

    if (nego.buyerAccepted) {
      buyerAgreeBadge.className = "agree-state-badge confirmed";
      buyerAgreeBadge.innerHTML = `<i class="bi bi-patch-check-fill"></i> Buyer: AGREED`;
    } else {
      buyerAgreeBadge.className = "agree-state-badge pending";
      buyerAgreeBadge.innerHTML = `<i class="bi bi-hourglass-split"></i> Buyer: PENDING`;
    }

    if (nego.sellerAccepted) {
      sellerAgreeBadge.className = "agree-state-badge confirmed";
      sellerAgreeBadge.innerHTML = `<i class="bi bi-patch-check-fill"></i> Seller: AGREED`;
    } else {
      sellerAgreeBadge.className = "agree-state-badge pending";
      sellerAgreeBadge.innerHTML = `<i class="bi bi-hourglass-split"></i> Seller: PENDING`;
    }

    // Determine visibility of Deal double confirmations
    const actionContainer = document.getElementById("action-proposals-container");
    const finalDealCard = document.getElementById("final-deal-summary-card");
    const agreementBoard = document.getElementById("agreement-board-card");

    if (nego.buyerAccepted && nego.sellerAccepted) {
      // Both agreed on pricing! Show Final Double Signature contract
      actionContainer.classList.add("d-none");
      finalDealCard.classList.remove("d-none");
      agreementBoard.classList.add("is-locked");

      // Bind Final Deal parameters
      document.getElementById("lbl-final-qty").textContent = `${formatCurrency(nego.proposedQuantity, 4)}`;
      document.getElementById("lbl-final-rate").textContent = `${formatCurrency(nego.proposedRate)} PKR`;

      const subtotal = nego.proposedQuantity * nego.proposedRate;
      const fee = subtotal * 0.002;

      document.getElementById("lbl-final-fee").textContent = `₨ ${formatCurrency(fee)}`;

      if (state.isBuyer) {
        document.getElementById("lbl-fee-title").textContent = "Buyer Escrow Fee (0.2%):";
        document.getElementById("lbl-payout-title").textContent = "Total Amount to Pay:";
        const totalCost = subtotal + fee;
        document.getElementById("lbl-final-total").textContent = `₨ ${formatCurrency(totalCost)}`;
        document.getElementById("lbl-wallet-delta").innerHTML = `
          <div class="d-flex justify-content-between text-xxs"><span>Coin Wallet:</span><strong class="text-success">+${formatCurrency(nego.proposedQuantity, 4)}</strong></div>
          <div class="d-flex justify-content-between text-xxs"><span>PKR Wallet:</span><strong class="text-danger">-${formatCurrency(totalCost)} PKR</strong></div>
        `;
      } else {
        document.getElementById("lbl-fee-title").textContent = "Seller Escrow Fee (0.2%):";
        document.getElementById("lbl-payout-title").textContent = "Net Payout to Receive:";
        const totalPayout = subtotal - fee;
        document.getElementById("lbl-final-total").textContent = `₨ ${formatCurrency(totalPayout)}`;
        document.getElementById("lbl-wallet-delta").innerHTML = `
          <div class="d-flex justify-content-between text-xxs"><span>Coin Wallet:</span><strong class="text-danger">-${formatCurrency(nego.proposedQuantity, 4)}</strong></div>
          <div class="d-flex justify-content-between text-xxs"><span>PKR Wallet:</span><strong class="text-success">+${formatCurrency(totalPayout)} PKR</strong></div>
        `;
      }

      // Confirm deal button disable state if user already signed or deal completed
      const confirmBtn = document.getElementById("btn-confirm-deal");
      if (nego.status !== "open") {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<i class="bi bi-patch-check"></i> Trade Resolved (${nego.status.toUpperCase()})`;
      } else {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="bi bi-shield-lock-fill"></i> Proceed to Deal Lock Workspace`;
      }

      // Render Confirmation Signatures Track
      const buyerConfirmBadge = document.getElementById("badge-buyer-confirm");
      const sellerConfirmBadge = document.getElementById("badge-seller-confirm");

      if (nego.buyerConfirmed) {
        buyerConfirmBadge.className = "agree-state-badge confirmed w-full justify-content-center";
        buyerConfirmBadge.textContent = "Buyer Signature: SIGNED";
      } else {
        buyerConfirmBadge.className = "agree-state-badge pending w-full justify-content-center";
        buyerConfirmBadge.textContent = "Buyer Signature: PENDING";
      }

      if (nego.sellerConfirmed) {
        sellerConfirmBadge.className = "agree-state-badge confirmed w-full justify-content-center";
        sellerConfirmBadge.textContent = "Seller Signature: SIGNED";
      } else {
        sellerConfirmBadge.className = "agree-state-badge pending w-full justify-content-center";
        sellerConfirmBadge.textContent = "Seller Signature: PENDING";
      }

    } else {
      // Still negotiating
      actionContainer.classList.remove("d-none");
      finalDealCard.classList.add("d-none");
      agreementBoard.classList.remove("is-locked");

      // Disable buttons if nego is not active/open
      const acceptBtn = document.getElementById("btn-accept-proposal");
      const counterBtn = document.getElementById("btn-propose-counter");

      if (nego.status !== "open") {
        acceptBtn.disabled = true;
        counterBtn.disabled = true;
      } else {
        // Can only accept if counterparty was the last one who updated it, or we haven't accepted yet
        const alreadyAccepted = state.isSeller ? nego.sellerAccepted : nego.buyerAccepted;
        acceptBtn.disabled = alreadyAccepted;
      }
    }

    // 6. Listen to original offer document
    onSnapshot(doc(db, "offers", nego.offerId), (offerSnap) => {
      if (offerSnap.exists()) {
        const offer = { id: offerSnap.id, ...offerSnap.data() };
        state.offer = offer;

        // Populate Summary details
        document.getElementById("lbl-offer-id").textContent = offer.offerId.substring(0, 15) + "...";
        document.getElementById("lbl-offer-type").textContent = offer.type;
        const offerTypeEl = document.getElementById("lbl-offer-type");
        if (offer.type === "buy") {
          offerTypeEl.className = "summary-stat-value text-success text-xs uppercase";
        } else {
          offerTypeEl.className = "summary-stat-value text-danger text-xs uppercase";
        }

        document.getElementById("lbl-coin-token").textContent = offer.coinSymbol;
        document.getElementById("lbl-final-coin").textContent = offer.coinSymbol;
        document.getElementById("lbl-agree-qty").textContent = `${formatCurrency(nego.proposedQuantity, 4)} ${offer.coinSymbol}`;

        document.getElementById("lbl-orig-price").textContent = `₨ ${formatCurrency(offer.rate)}`;
        document.getElementById("lbl-orig-qty").textContent = `${formatCurrency(offer.initialQuantity || offer.quantity, 4)} ${offer.coinSymbol}`;
        document.getElementById("lbl-remaining-qty").textContent = `${formatCurrency(offer.remainingQuantity, 4)} ${offer.coinSymbol}`;

        // Created Dates formats
        const crDate = offer.createdAt?.seconds ? new Date(offer.createdAt.seconds * 1000) : new Date();
        const expDate = offer.expiry?.seconds ? new Date(offer.expiry.seconds * 1000) : new Date(offer.expiry);

        document.getElementById("lbl-created-date").textContent = crDate.toLocaleString();
        document.getElementById("lbl-expiry-date").textContent = expDate.toLocaleString();
      }
    });

  });

  // 7. Subscribe to Message logs chronological feed
  const messagesRef = collection(db, "negotiations", state.negotiationId, "messages");
  onSnapshot(messagesRef, (snapshot) => {
    let msgList = [];
    snapshot.forEach(docSnap => {
      msgList.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Client-side immune sort to avoid Index exceptions
    msgList.sort((a, b) => {
      const timeA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return timeA - timeB;
    });

    state.messages = msgList;
    renderMessagesTimeline(msgList);
  }, (err) => {
    console.error("Chat sync exception:", err);
    Toast.show("Firestore subscription pipeline lost.", { type: "danger" });
  });
}

/**
 * Renders list of chronological message objects
 */
function renderMessagesTimeline(msgList) {
  const container = document.getElementById("chat-messages-container");
  if (!container) return;

  if (msgList.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-secondary">
        <i class="bi bi-chat-left-dots fs-3 mb-2 text-muted"></i>
        <p class="text-xxs text-mono uppercase">Negotiation secured. Send first message to initialize channel.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  msgList.forEach(m => {
    const isSelf = m.senderId === state.user.uid;
    const isSystem = m.senderId === "system";

    if (isSystem) {
      // System notification timeline log
      const isSuccess = m.type === "system_success";
      const isCancel = m.text.includes("terminated") || m.text.includes("cancelled");
      
      let systemClass = "system-event-badge";
      let icon = "bi-cpu-fill";
      if (isSuccess) {
        systemClass += " success-deal";
        icon = "bi-shield-fill-check";
      } else if (isCancel) {
        systemClass += " cancel-deal";
        icon = "bi-shield-fill-exclamation";
      }

      const div = document.createElement("div");
      div.className = "system-event w-full";
      div.innerHTML = `
        <div class="${systemClass}">
          <i class="bi ${icon}"></i>
          <span>${m.text}</span>
        </div>
        <span class="system-event-time">${formatMessageTime(m.createdAt)}</span>
      `;
      container.appendChild(div);
    } else {
      // Normal bubble or Counter offer panel
      const div = document.createElement("div");
      div.className = `message-bubble-wrapper ${isSelf ? 'is-self' : ''}`;

      // Resolve user logo display letter
      const emailPrefix = m.senderEmail ? m.senderEmail.substring(0, 2).toUpperCase() : "P";

      let bubbleContentHtml = "";
      if (m.type === "counter") {
        bubbleContentHtml = `
          <div class="message-bubble is-proposal">
            <span class="proposal-badge"><i class="bi bi-arrow-left-right"></i> Counter Proposal</span>
            <div class="mb-1 text-xs text-secondary text-mono">Proposed Exchange Terms:</div>
            <div class="text-xs fw-bold text-white mb-0.5">Rate: ₨ ${m.price.toLocaleString()} PKR</div>
            <div class="text-xs fw-bold text-warning mb-2">Quantity: ${m.quantity} ${state.offer?.coinSymbol || ""}</div>
            ${m.text ? `<hr class="my-1 border-secondary border-opacity-10"><p class="text-xs text-secondary mb-0">${m.text}</p>` : ""}
          </div>
        `;
      } else {
        bubbleContentHtml = `
          <div class="message-bubble">
            ${escapeHtml(m.text)}
          </div>
        `;
      }

      div.innerHTML = `
        <div class="message-avatar">${emailPrefix}</div>
        <div class="message-content-container">
          <div class="message-meta">
            <span class="fw-bold">${isSelf ? "You" : (m.senderEmail?.split("@")[0] || "Peer")}</span>
            <span>•</span>
            <span>${formatMessageTime(m.createdAt)}</span>
          </div>
          ${bubbleContentHtml}
        </div>
      `;
      container.appendChild(div);
    }
  });

  // Auto scroll to bottom
  container.scrollTop = container.scrollHeight;
}

/**
 * Handles text message delivery
 */
async function handleSendTextMessage() {
  const input = document.getElementById("chat-text-input");
  const text = input.value.trim();
  if (!text) return;

  if (state.negotiation.status !== "open") {
    Toast.show("Channel is locked. No message transmission allowed.", { type: "warning" });
    return;
  }

  input.value = "";
  input.focus();

  try {
    await createDocument(`negotiations/${state.negotiationId}/messages`, {
      senderId: state.user.uid,
      senderEmail: state.user.email,
      text: text,
      type: "text"
    });

    // Notify peer
    await createNotification(
      state.counterpartyId,
      "primary",
      `New message from trading peer: "${text.substring(0, 30)}..."`,
      `offer-details.html?id=${state.negotiationId}`
    );
  } catch (err) {
    console.error("Message write failure:", err);
    Toast.show("Failed to transmit text packet.", { type: "danger" });
  }
}

/**
 * Opens custom counter proposal interface modal
 */
function openCounterProposalModal() {
  const modalBody = document.createElement("div");
  modalBody.innerHTML = `
    <form id="counter-proposal-form" novalidate>
      <div class="row g-3">
        <div class="col-12">
          <label for="cntPrice" class="counter-form-label">
            <i class="bi bi-cash-stack text-success"></i> Counter Price Rate (PKR)
          </label>
          <div class="input-group">
            <input type="number" id="cntPrice" class="form-control negotiation-form-control" placeholder="Rate in PKR" min="0.01" step="any" required>
            <span class="input-group-text bg-transparent border-secondary border-opacity-10 text-muted text-xs">PKR</span>
          </div>
        </div>

        <div class="col-12">
          <label for="cntQty" class="counter-form-label">
            <i class="bi bi-box-seam text-warning"></i> Counter Quantity to Trade
          </label>
          <div class="input-group">
            <input type="number" id="cntQty" class="form-control negotiation-form-control" placeholder="0.00" min="0.000001" step="any" required>
            <span class="input-group-text bg-transparent border-secondary border-opacity-10 text-muted text-xs">${state.offer?.coinSymbol || "--"}</span>
          </div>
        </div>

        <div class="col-12">
          <label for="cntMsg" class="counter-form-label">
            <i class="bi bi-pencil-square text-muted"></i> Optional Accompanying Message
          </label>
          <textarea id="cntMsg" class="form-control negotiation-form-control" rows="2" placeholder="Explain your pricing rationale or delivery specifics..."></textarea>
        </div>
      </div>
    </form>
  `;

  const m = new Modal({
    title: "Propose Counter Terms",
    body: modalBody,
    buttons: [
      {
        label: "Cancel",
        class: "btn-hfc-secondary",
        onClick: (modal) => modal.destroy()
      },
      {
        label: "Transmit Counter",
        class: "btn-hfc-primary",
        onClick: async (modal) => {
          const price = parseFloat(document.getElementById("cntPrice")?.value || "0");
          const qty = parseFloat(document.getElementById("cntQty")?.value || "0");
          const msg = document.getElementById("cntMsg")?.value || "";

          if (isNaN(price) || price <= 0) {
            Toast.show("Please enter a valid PKR price rate.", { type: "danger" });
            return;
          }

          if (isNaN(qty) || qty <= 0) {
            Toast.show("Please enter a valid volume quantity.", { type: "danger" });
            return;
          }

          if (qty > (state.offer?.remainingQuantity || state.offer?.quantity)) {
            Toast.show("Counter quantity exceeds listing remaining limit.", { type: "danger" });
            return;
          }

          Loader.buttonLoader(".btn-modal-action-1", true, "Sending Proposal...");

          try {
            await runSafeTransaction(async (transaction) => {
              const negoRef = doc(db, "negotiations", state.negotiationId);
              
              transaction.update(negoRef, {
                proposedRate: price,
                proposedQuantity: qty,
                sellerAccepted: false,
                buyerAccepted: false,
                sellerConfirmed: false,
                buyerConfirmed: false,
                lastUpdatedBy: state.user.uid,
                updatedAt: serverTimestamp()
              });
            });

            // Write counter proposal chat message
            await createDocument(`negotiations/${state.negotiationId}/messages`, {
              senderId: state.user.uid,
              senderEmail: state.user.email,
              type: "counter",
              price: price,
              quantity: qty,
              text: msg.trim()
            });

            // System event notification
            await createNotification(
              state.counterpartyId,
              "warning",
              `Trading peer proposed counter terms: ${qty} ${state.offer?.coinSymbol} @ ₨ ${price.toLocaleString()}`,
              `offer-details.html?id=${state.negotiationId}`
            );

            Loader.buttonLoader(".btn-modal-action-1", false);
            modal.destroy();
            Toast.show("Counter proposal transmitted to ledger.", { type: "success" });

          } catch (err) {
            console.error("Counter write error:", err);
            Loader.buttonLoader(".btn-modal-action-1", false);
            Toast.show("Failed to register counter terms: " + err.message, { type: "danger" });
          }
        }
      }
    ]
  });

  m.open();

  // Pre-fill fields with current agreement values
  const priceInput = document.getElementById("cntPrice");
  const qtyInput = document.getElementById("cntQty");
  if (priceInput && qtyInput) {
    priceInput.value = state.negotiation.proposedRate;
    qtyInput.value = state.negotiation.proposedQuantity;
  }
}

/**
 * Handles accepting the current active terms
 */
async function handleAcceptProposal() {
  Modal.confirm({
    title: "Accept Proposed Terms?",
    body: `
      <p class="text-secondary">Are you sure you want to accept the active proposed terms of this trade listing?</p>
      <div class="p-3 rounded border border-warning border-opacity-10 bg-warning bg-opacity-5 mb-2">
        <div class="d-flex justify-content-between text-xs mb-1"><span>Rate Price:</span><strong class="text-white">₨ ${state.negotiation.proposedRate.toLocaleString()} PKR</strong></div>
        <div class="d-flex justify-content-between text-xs"><span>Volume:</span><strong class="text-white">${state.negotiation.proposedQuantity} ${state.offer?.coinSymbol || ""}</strong></div>
      </div>
      <p class="text-xxs text-muted mb-0"><i class="bi bi-info-circle text-warning"></i> Once both parties accept, the final double-signature escrow agreement summary will resolve to complete deal locks.</p>
    `,
    confirmText: "Agree to Terms",
    confirmClass: "btn-hfc-success",
    onConfirm: async () => {
      const loader = new Loader({ text: "Signing agreement holds..." });
      loader.show();

      try {
        await runSafeTransaction(async (transaction) => {
          const negoRef = doc(db, "negotiations", state.negotiationId);
          
          const updates = {};
          if (state.isSeller) {
            updates.sellerAccepted = true;
          } else {
            updates.buyerAccepted = true;
          }
          updates.updatedAt = serverTimestamp();

          transaction.update(negoRef, updates);
        });

        // Add system message logging acceptance
        await createDocument(`negotiations/${state.negotiationId}/messages`, {
          senderId: "system",
          senderEmail: "HFC System",
          type: "system",
          text: `Current terms accepted and signed by ${state.isSeller ? "Seller" : "Buyer"}.`
        });

        // Notify counterparty
        await createNotification(
          state.counterpartyId,
          "success",
          `Trading peer accepted the proposed terms. Final double confirmation is now accessible.`,
          `offer-details.html?id=${state.negotiationId}`
        );

        loader.hide();
        Toast.show("Agreement registered successfully.", { type: "success" });

      } catch (err) {
        loader.hide();
        console.error("Acceptance failure:", err);
        Toast.show("Failed to write acceptance signature: " + err.message, { type: "danger" });
      }
    }
  });
}

/**
 * Handles final double confirmation signature to close deal lock
 */
async function handleConfirmDealSignature() {
  Modal.confirm({
    title: "Sign & Execute Escrow Contract",
    body: `
      <p class="text-secondary">Are you sure you want to sign the final cryptographic contract holding block for this trade?</p>
      <div class="p-3 rounded border border-success border-opacity-15 bg-success bg-opacity-5 mb-2">
        <div class="d-flex justify-content-between text-xs mb-1"><span>Rate Price:</span><strong class="text-white">₨ ${state.negotiation.proposedRate.toLocaleString()} PKR</strong></div>
        <div class="d-flex justify-content-between text-xs mb-1"><span>Volume:</span><strong class="text-white">${state.negotiation.proposedQuantity} ${state.offer?.coinSymbol || ""}</strong></div>
        <hr class="my-1 border-secondary border-opacity-10">
        <div class="text-xxs text-secondary text-center">Net ledger value holds will finalize on both nodes.</div>
      </div>
      <p class="text-xxs text-warning mb-0"><i class="bi bi-shield-lock text-warning"></i> Confirming signatures will execute deal locking. This cannot be undone once signed by both trading parties.</p>
    `,
    confirmText: "Sign Escrow Contract",
    confirmClass: "btn-hfc-primary",
    onConfirm: async () => {
      const loader = new Loader({ text: "Signing double contract keys..." });
      loader.show();

      try {
        await runSafeTransaction(async (transaction) => {
          const negoRef = doc(db, "negotiations", state.negotiationId);
          const negoSnap = await transaction.get(negoRef);
          if (!negoSnap.exists()) throw new Error("Negotiation channel severed.");

          const updates = {};
          if (state.isSeller) {
            updates.sellerConfirmed = true;
          } else {
            updates.buyerConfirmed = true;
          }

          const data = negoSnap.data();
          const nextSellerConfirmed = state.isSeller ? true : (data.sellerConfirmed || false);
          const nextBuyerConfirmed = state.isBuyer ? true : (data.buyerConfirmed || false);

          if (nextSellerConfirmed && nextBuyerConfirmed) {
            updates.status = "completed";

            // Update associated original offer quantity
            const offerRef = doc(db, "offers", data.offerId);
            const offerSnap = await transaction.get(offerRef);
            if (offerSnap.exists()) {
              const oData = offerSnap.data();
              const newRemaining = Math.max(0, (oData.remainingQuantity || oData.quantity) - data.proposedQuantity);
              const nextOfferStatus = newRemaining <= 0.0001 ? "completed" : "active";

              transaction.update(offerRef, {
                remainingQuantity: newRemaining,
                status: nextOfferStatus,
                updatedAt: serverTimestamp()
              });
            }
          }

          transaction.update(negoRef, updates);
        });

        const opponentSigned = state.isSeller ? state.negotiation.buyerConfirmed : state.negotiation.sellerConfirmed;
        if (opponentSigned) {
          // Complete success! Both confirmed
          await createDocument(`negotiations/${state.negotiationId}/messages`, {
            senderId: "system",
            senderEmail: "HFC System",
            type: "system_success",
            text: `Trade agreement securely confirmed and escrow locked 1:1! Escrow ledger finalized.`
          });

          await createNotification(
            state.counterpartyId,
            "success",
            `Deal fully confirmed! Escrow ledger locked and finalized.`,
            "dashboard.html"
          );
        } else {
          // Solo confirmation signed
          await createDocument(`negotiations/${state.negotiationId}/messages`, {
            senderId: "system",
            senderEmail: "HFC System",
            type: "system",
            text: `Deal confirmation signed by ${state.isSeller ? "Seller" : "Buyer"}. Waiting for counterparty signature.`
          });

          await createNotification(
            state.counterpartyId,
            "warning",
            `Trading peer has signed the deal contract. Your counterparty signature is requested!`,
            `offer-details.html?id=${state.negotiationId}`
          );
        }

        loader.hide();
        Toast.show("Signature successfully applied to transaction ledger.", { type: "success" });

      } catch (err) {
        loader.hide();
        console.error("Signature transaction failure:", err);
        Toast.show("Escrow signing failed: " + err.message, { type: "danger" });
      }
    }
  });
}

/**
 * Handles negotiation cancellation completely
 */
function handleCancelNegotiation() {
  Modal.confirm({
    title: "Cancel Negotiation?",
    body: `
      <p class="text-secondary">Are you sure you want to terminate this negotiation channel?</p>
      <div class="col-12 mb-3">
        <label for="cancelReason" class="counter-form-label">Reason for cancellation</label>
        <textarea id="cancelReason" class="form-control negotiation-form-control" rows="2" placeholder="e.g. Price limits too high, delayed response..."></textarea>
      </div>
      <p class="text-xxs text-danger mb-0"><i class="bi bi-shield-fill-exclamation text-danger"></i> Terminating releases listing status holds and redirects both nodes back to marketplace sheets.</p>
    `,
    confirmText: "Terminate Channel",
    confirmClass: "btn-hfc-danger",
    onConfirm: async () => {
      const reason = document.getElementById("cancelReason")?.value.trim() || "No explanation provided.";
      const loader = new Loader({ text: "Terminating transaction channels..." });
      loader.show();

      try {
        await runSafeTransaction(async (transaction) => {
          const negoRef = doc(db, "negotiations", state.negotiationId);
          const negoSnap = await transaction.get(negoRef);
          if (!negoSnap.exists()) throw new Error("Negotiation channel resolved.");

          const data = negoSnap.data();

          // Reset offer status back to active so it goes back to public listing
          const offerRef = doc(db, "offers", data.offerId);
          transaction.update(offerRef, {
            status: "active",
            updatedAt: serverTimestamp()
          });

          transaction.update(negoRef, {
            status: "cancelled",
            sellerAccepted: false,
            buyerAccepted: false,
            sellerConfirmed: false,
            buyerConfirmed: false,
            cancelReason: reason,
            updatedAt: serverTimestamp()
          });
        });

        // Add cancellation logs
        await createDocument(`negotiations/${state.negotiationId}/messages`, {
          senderId: "system",
          senderEmail: "HFC System",
          type: "system",
          text: `Negotiation terminated by ${state.isSeller ? "Seller" : "Buyer"}. Reason: ${reason}`
        });

        // Notify peer
        await createNotification(
          state.counterpartyId,
          "danger",
          `Negotiation channel cancelled by trading partner.`,
          "marketplace.html"
        );

        loader.hide();
        Toast.show("Negotiation successfully terminated.", { type: "success" });
        setTimeout(() => { window.location.href = "marketplace.html"; }, 1000);

      } catch (err) {
        loader.hide();
        console.error("Cancellation txn failed:", err);
        Toast.show("Termination failed: " + err.message, { type: "danger" });
      }
    }
  });
}

/**
 * Defensive user database resolution
 */
async function getUserDisplay(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const uData = userDoc.data();
      return uData.username || uData.email?.split("@")[0] || "User_" + uid.substring(0, 5);
    }
  } catch (err) {
    console.warn("Divergent profile resolving:", err);
  }
  return "Peer_" + uid.substring(0, 5);
}

/**
 * Clean message timestamp helper
 */
function formatMessageTime(timestamp) {
  if (!timestamp) return "Just now";
  const d = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * XSS injection defense escape function
 */
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Write to user notifications
 */
async function createNotification(userId, type, text, href = "") {
  try {
    await createDocument("notifications", {
      userId,
      type,
      text,
      href,
      read: false
    });
  } catch (err) {
    console.error("System notification dispatch failure:", err);
  }
}
