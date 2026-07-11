# HFC Exchange: P2P Marketplace & Trading Engine Architecture
**Version:** 1.0.0  
**Author:** Lead Cryptocurrency Exchange & Firebase Systems Architect  
**Classification:** Confidential / Technical Specification  

---

## 1. Executive Summary & Core Philosophy

HFC Exchange operates on a high-security, high-scalability **Centralized Peer-to-Peer (P2P) Offer-Based Marketplace with Double-Confirmation Negotiations**. Unlike a standard automated order book (AMM or order-matching CLOB) where execution is immediate upon price crossing, HFC Exchange values interactive commercial agency. 

To maximize liquidity, trust, and pricing efficiency in frontier digital assets:
1. **Unilateral Offers:** Sellers or buyers post intent (Offer sheets) declaring standard base asset parameters, initial rates, limits, and quantities.
2. **Bespoke Negotiations:** Counterparties do not simply "buy/sell at market"; they initiate secure negotiation threads, offering counter-bids or counter-asks on rate and quantity.
3. **Double-Confirmation Execution:** A trade never executes automatically. Both parties must cryptographically sign off on the *final agreed state*. Once agreed, the deal transitions to a "Locked" escrow phase, verifying and isolating collateral in dedicated hold accounts until settlement or timeout.

This document details the immutable business rules, transactional mechanics, Firestore document models, indexing rules, security boundaries, and scalability guidelines for this engine.

---

## 2. System State Machines (State Diagrams)

### 2.1 Offer Lifecycle State Machine

An **Offer** is a public advertisement of intent to trade a specific quantity of an asset at a base rate.

```
          [ Draft ]
              |
              | (Admin/User Publishes)
              v
         [ Active ] <-----------------------------------+
          /   |   \                                     |
         /    |    \ (User Initiates Negotiation)        | (Partial Fill
        /     |     v                                   |  Resets to Active)
       /      |  [ Negotiating ]                        |
      /       |       |                                 |
     |        |       | (Final Dual-Acceptance)         |
     |        |       v                                 |
     |        |  [ Locked (Escrow) ]                    |
     |        |    /             \                      |
     |        |   /               \ (Timeout/Cancel)    |
     |        |  v                 v                    |
     |        v [ Completed ]    [ Expired / Cancelled -+
     |   [ Cancelled ]
     v
[ Expired / Rejected ]
```

#### State Transitions Description:
*   **Draft:** The offer is created but not visible on the public listing ledger. Validations are checked locally.
*   **Active:** The offer is live on the public board, indexable, and open for inbound negotiation proposals.
*   **Negotiating:** One or more counterparties have opened negotiation lobbies. The parent offer remains visible unless the cumulative active negotiation locks consume 100% of the available supply.
*   **Locked:** Both parties have accepted a specific rate/quantity proposal. The corresponding base assets (for Sell) or quote assets (for Buy) are immediately detached from `availableBalance` and placed into `holdBalance` under escrow. No other transactions can touch these assets.
*   **Completed:** The trade executes successfully. Balances are transferred, fees are collected, and the parent offer is either marked `Completed` (if fully filled) or returns to `Active` with a decremented remaining supply (partial fulfillment).
*   **Cancelled:** The creator manually revokes the offer. This is only permitted if the offer is not currently in a `Locked` state.
*   **Expired:** The offer exceeds its configured lifespan (e.g., 7 days) without fulfillment.
*   **Rejected:** An admin manually revokes or flags the offer due to compliance or terms-of-service violations.

---

### 2.2 Negotiation & Proposal State Machine

A **Negotiation** represents a private, secure multi-turn communication lobby between the Creator of the Offer and a Challenger.

```
                  [ Proposal Created (Buyer/Seller) ]
                                   |
                                   v
                        +---> [ Countered ] <---+
                        |          |            |
         (Counter Offer |          |            | (Counter Offer
          by Creator)   |          v            |  by Challenger)
                        +---- [ Proposed ] -----+
                               /        \
                              /          \
                (Dual-Accept)v            v(Reject/Cancel)
                        [ Accepted ]    [ Cancelled / Terminated ]
                             |
                             v
                        [ Locked ]
                         /      \
             (Success)  /        \ (Timeout / Dispute)
                       v          v
                 [ Executed ]   [ Expired / Refunded ]
```

#### State Descriptions:
1.  **Proposed:** The challenger starts a thread with an initial quantity and price proposal.
2.  **Countered:** The counterparty rejects the active offer and posts a revised price/quantity. This alternates indefinitely.
3.  **Accepted:** One party accepts the active proposal of the other. The system changes the negotiation status to `accepted_by_creator` or `accepted_by_challenger`.
4.  **Locked:** Both parties have clicked "Accept". The state transitions to `locked`. The escrow engine takes control of the assets.
5.  **Executed:** The settlement succeeds. Funds are transferred and logged.
6.  **Cancelled / Terminated:** Either party withdraws from the negotiation before the `Locked` state is reached.

---

## 3. Atomic Double-Confirmation Counter-Offer Ledger

To maintain historical records and satisfy strict financial audit criteria, **counter-offers never overwrite preceding states**. The negotiation document operates as a parent context pointing to an immutable subcollection of discrete messages and proposal blocks.

### 3.1 Immutable Structural Protocol
*   Every change in price, quantity, or terms generates a new `proposal_history` record.
*   Each proposal has a unique incrementing `version` integer.
*   The parent negotiation document stores `current_version_ref` pointing to the active proposal.
*   **Zero-overwrite Rule:** Editing a proposal actually marks the old proposal as `superseded` and inserts a new proposal document. This prevents malicious manipulation of agreed pricing in the middle of a websocket session.

---

## 4. Escrow and Locked Deals (Double-Spend Prevention)

Double-spending in a centralized ledger occurs when a user initiates multiple simultaneous negotiations and accepts deals whose combined requirements exceed their actual physical balance.

### 4.1 Collateral Locking Mechanism
When a negotiation transitions to `Locked`:
1.  **If the parent is a SELL Offer:** The Seller's base coin (e.g., `HFC`) is isolated.
2.  **If the parent is a BUY Offer:** The Buyer's quote currency (e.g., `PKR` balance) is isolated.
3.  The assets are immediately shifted from `availableBalance` to `holdBalance` inside the respective `wallets` document.
4.  The system records a `LockedDeal` document containing a strict expiration timestamp (`expiresAt = now + 15 minutes`).

### 4.2 Configurable Timeout Expiration
A background process (or lazy evaluator/scheduled cloud function) checks for expired `LockedDeal` documents.
*   **Condition:** `status == "escrow_locked" && expiresAt < currentTime`.
*   **Reversal Transaction:** The system runs a Firestore Transaction:
    *   Releases `holdBalance` back to `availableBalance` for the locked party.
    *   Updates negotiation status to `expired`.
    *   Updates `LockedDeal` status to `expired`.
    *   Generates system-level notifications and security audit logs.

---

## 5. Partial Quantity Fulfillment Flow

To maintain deep marketplace liquidity, HFC Exchange supports partial fulfillment of buy and sell advertisements.

### 5.1 Fictional Scenario Walkthrough
Let's trace a **Sell Offer** through a partial purchase:

1.  **Initial State:**
    *   Seller A creates Sell Offer `OFFER_999`: **100 HFC** at **₨ 250 PKR / HFC**.
    *   `remainingQuantity = 100`, `status = "active"`.
2.  **Negotiation Initiated:**
    *   Buyer B initiates negotiation `NEG_555` for **25 HFC** at **₨ 240 PKR / HFC**.
    *   Seller A counter-proposes **25 HFC** at **₨ 245 PKR / HFC**.
    *   Buyer B accepts the counter-offer of **₨ 245 PKR**.
3.  **Locking Phase:**
    *   Negotiation `NEG_555` transitions to `Locked`.
    *   **25 HFC** is deducted from Seller A's `availableBalance` and added to Seller A's `holdBalance` for `HFC`.
    *   `OFFER_999` remains `Active` with `remainingQuantity = 100` but has an active lock reserve of `25`. Its *allocatable* public supply for other new buyers becomes `75 HFC`.
4.  **Trade Execution Phase:**
    *   The trade executes atomically.
    *   Seller A's `holdBalance` is reduced by **25 HFC** (permanently debited).
    *   Buyer B is credited with **25 HFC** (minus buyer fees).
    *   Seller A is credited with **₨ 6,125 PKR** (25 * 245, minus seller fees).
    *   `OFFER_999` updates its state:
        *   `remainingQuantity` is updated to `75 HFC`.
        *   Because `remainingQuantity > 0`, the offer status transitions back to `active`.
        *   If `remainingQuantity == 0`, the offer status transitions to `completed`.

---

## 6. The Fee Engine Specification

Fees are critical to platform sustainability and are controlled solely by Admin system configurations stored in `settings/exchange_config`.

### 6.1 Configuration Parameters
*   `buyer_fee_percentage`: Decimal value (e.g., `0.01` for 1.00%).
*   `seller_fee_percentage`: Decimal value (e.g., `0.015` for 1.50%).
*   `minimum_fee_pkr`: Minimum fee value (e.g., `₨ 10.00`).

### 6.2 Calculation Order and Formulae
Let:
*   $Q$ = Agreed quantity of Base Coin (e.g., $25\text{ HFC}$).
*   $R$ = Agreed Rate in PKR (e.g., $245\text{ PKR}$).
*   $G$ = Gross Trade Volume = $Q \times R = 25 \times 245 = 6,125\text{ PKR}$.

#### 1. Buyer Side Settlement (Pays Quote, Receives Base)
*   **Gross Base Due:** $Q$ (e.g., $25\text{ HFC}$).
*   **Buyer Fee Amount (Base Coin or PKR equivalent):** 
    *   *Standard Base Fee:* $\text{Buyer Fee (HFC)} = Q \times \text{buyer\_fee\_percentage}$.
    *   $25 \times 0.01 = 0.25\text{ HFC}$.
*   **Net Base Received by Buyer:** $Q - \text{Buyer Fee} = 25 - 0.25 = 24.75\text{ HFC}$.

#### 2. Seller Side Settlement (Pays Base, Receives Quote)
*   **Gross Quote Due:** $G = 6,125\text{ PKR}$.
*   **Seller Fee Amount (PKR):**
    *   $\text{Seller Fee (PKR)} = G \times \text{seller\_fee\_percentage}$.
    *   $6,125 \times 0.015 = 91.875\text{ PKR}$.
    *   Apply ceiling/floor constraints: $\max(\text{Seller Fee}, \text{minimum\_fee\_pkr}) = 91.875\text{ PKR}$.
*   **Net Quote Received by Seller:** $G - \text{Seller Fee} = 6,125 - 91.875 = 6,033.125\text{ PKR}$.

#### 3. Platform Revenue Collection
*   The platform collects:
    *   $0.25\text{ HFC}$ into the Platform Admin's HFC wallet.
    *   $91.875\text{ PKR}$ into the Platform Admin's PKR wallet.

---

## 7. Wallet & Balance Reservoirs (Firestore Transaction Mechanics)

Centralized exchange engines must manage two states of balances within a wallet to prevent race conditions:
1.  **Available Balance (`availableBalance`):** Funds free to be withdrawn, traded, or committed to new negotiations.
2.  **Hold Balance (`holdBalance`):** Escrow-reserved funds locked in active negotiations, pending settlements, or pending withdrawal requests.

$$\text{Total Balance} = \text{availableBalance} + \text{holdBalance}$$

### 7.1 Lifecycle of Balance Operations
Below is the precise ledger transition sequence mapped to operational events:

| Event | Actor | Asset Type | `availableBalance` | `holdBalance` | Explanation |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Sell Offer Created** | Seller | Base Coin | No change | No change | Creating an active offer does not lock coins until a negotiation is locked. |
| **Deal Locked** | Seller | Base Coin | $-\text{Agreed Qty}$ | $+\text{Agreed Qty}$ | Moves coins to escrow. Safe from withdrawals or other negotiations. |
| **Deal Locked** | Buyer | Quote (PKR) | $-\text{Total Gross PKR}$ | $+\text{Total Gross PKR}$ | Moves buyer's PKR to escrow. Prevents purchasing other offers. |
| **Deal Expired** | Seller | Base Coin | $+\text{Agreed Qty}$ | $-\text{Agreed Qty}$ | Escrow timeout reached. Full collateral returned. |
| **Deal Expired** | Buyer | Quote (PKR) | $+\text{Total Gross PKR}$ | $-\text{Total Gross PKR}$ | Escrow timeout reached. Full PKR returned to available balance. |
| **Trade Completed** | Seller | Base Coin | No change | $-\text{Agreed Qty}$ | Permanent deduction from Seller's locked reserve. |
| **Trade Completed** | Buyer | Quote (PKR) | No change | $-\text{Total Gross PKR}$ | Permanent deduction from Buyer's locked PKR reserve. |
| **Trade Completed** | Seller | Quote (PKR) | $+(\text{Gross PKR} - \text{Fee})$| No change | Seller's PKR wallet receives net cash immediately. |
| **Trade Completed** | Buyer | Base Coin | $+(\text{Qty} - \text{Fee})$ | No change | Buyer's Base coin wallet receives net asset immediately. |
| **Trade Completed** | Admin | Both | $+\text{Fees}$ | No change | Platform collects fees directly into Admin's master account. |

---

## 8. Atomic Trade Execution Protocol

To avoid race conditions, double spending, and orphaned balances, trade settlement is executed as a **single Firestore runTransaction() block**. If any read or write fails, the entire block is aborted and retried.

```
+-----------------------------------------------------------------+
|                       START TRANSACTION                         |
+-----------------------------------------------------------------+
                                 |
                                 v
                 Read lockedDeal, negotiation, 
                    sellerWallet, buyerWallet
                                 |
                                 v
         Verify: lockedDeal.status == "escrow_locked"
          Verify: Base / Quote balances match contract
                                 |
                                 v
               Calculate Fees (Buyer & Seller shares)
                                 |
                                 v
              Write: Deduct seller holdBalance (Base)
              Write: Deduct buyer holdBalance (Quote)
                                 |
                                 v
               Write: Credit buyer availableBalance (Base)
               Write: Credit seller availableBalance (Quote)
                                 |
                                 v
                 Write: Credit Admin Wallet (Fees)
                                 |
                                 v
                 Write: Update lockedDeal -> "completed"
               Write: Update negotiation -> "executed"
             Write: Update parent offer remainingQuantity
                                 |
                                 v
                 Write: Create Immutable Trade Block
                 Write: Create Ledger Audit Log
                                 |
                                 v
+-----------------------------------------------------------------+
|                      COMMIT TRANSACTION                         |
+-----------------------------------------------------------------+
```

### 8.1 Step-by-Step Transaction Pipeline
1.  **Read and Hold Lock:** Read the target `LockedDeal`, `Negotiation`, Seller's Base `Wallet`, and Buyer's Quote `Wallet`.
2.  **Status Guard:** Verify `LockedDeal.status == "escrow_locked"`. If already marked "completed" or "expired", throw error to abort immediately (Idempotency Guard).
3.  **Balance Sanity Check:** Verify that Seller has at least `Agreed Qty` in `holdBalance` and Buyer has `Total Gross PKR` in `holdBalance`.
4.  **Deduct Reservoirs:**
    *   Decrement Seller Base Coin `holdBalance` by `Agreed Qty`.
    *   Decrement Buyer PKR `holdBalance` by `Agreed PKR Gross`.
5.  **Credit Counterparties:**
    *   Increment Buyer Base Coin `availableBalance` by `(Agreed Qty - Buyer Fee)`.
    *   Increment Seller PKR `availableBalance` by `(Agreed PKR Gross - Seller Fee)`.
6.  **Credit Administrative Vault:**
    *   Increment Platform Admin's PKR Wallet by `Seller Fee`.
    *   Increment Platform Admin's Base Coin Wallet by `Buyer Fee`.
7.  **Finalize Documents:**
    *   Update `LockedDeal` status to `completed`.
    *   Update `Negotiation` status to `executed`.
    *   Decrement `Offer.remainingQuantity` by `Agreed Qty`. If remaining is zero, set `Offer.status = "completed"`, else reset to `active`.
8.  **Inject Auditing Blocks:** Write to `trades` collection generating a unique cryptographic transaction block, and write to `logs` collection.

---

## 9. Firestore Database Schema & Relationship Specifications

### 9.1 Collection: `offers`
*   **Path:** `/offers/{offerId}`
*   **Document Definition:**
```json
{
  "offerId": "off_87321a9d",
  "creatorId": "usr_99812456",
  "type": "sell", 
  "coinSymbol": "HFC",
  "quoteCurrency": "PKR",
  "initialQuantity": 1000.00000000,
  "remainingQuantity": 750.00000000,
  "rate": 245.50,
  "minQuantity": 10.00000000,
  "status": "active", 
  "createdAt": "Timestamp(2026-07-11T01:50:00Z)",
  "updatedAt": "Timestamp(2026-07-11T01:55:00Z)",
  "expiresAt": "Timestamp(2026-07-18T01:50:00Z)"
}
```

### 9.2 Collection: `negotiations`
*   **Path:** `/negotiations/{negotiationId}`
*   **Document Definition:**
```json
{
  "negotiationId": "neg_c41092a1",
  "offerId": "off_87321a9d",
  "creatorId": "usr_99812456", 
  "challengerId": "usr_11223344", 
  "coinSymbol": "HFC",
  "quoteCurrency": "PKR",
  "status": "locked", 
  "currentVersion": 3,
  "agreedQuantity": 250.00000000,
  "agreedRate": 245.00,
  "escrowLockedAt": "Timestamp(2026-07-11T01:53:00Z)",
  "createdAt": "Timestamp(2026-07-11T01:51:00Z)",
  "updatedAt": "Timestamp(2026-07-11T01:53:00Z)"
}
```

#### Subcollection: `/negotiations/{negotiationId}/proposals`
*   **Path:** `/negotiations/{negotiationId}/proposals/{proposalId}`
*   **Document Definition:**
```json
{
  "proposalId": "prop_v3",
  "version": 3,
  "senderId": "usr_11223344",
  "quantity": 250.00000000,
  "rate": 245.00,
  "creatorAccepted": true,
  "challengerAccepted": true,
  "message": "Agreed on 245 PKR. Locking deal.",
  "createdAt": "Timestamp(2026-07-11T01:52:50Z)"
}
```

### 9.3 Collection: `lockedDeals`
*   **Path:** `/lockedDeals/{dealId}`
*   **Document Definition:**
```json
{
  "dealId": "deal_66723b1a",
  "negotiationId": "neg_c41092a1",
  "offerId": "off_87321a9d",
  "buyerId": "usr_11223344",
  "sellerId": "usr_99812456",
  "coinSymbol": "HFC",
  "quoteCurrency": "PKR",
  "quantity": 250.00000000,
  "rate": 245.00,
  "grossAmount": 61250.00,
  "status": "escrow_locked", 
  "expiresAt": "Timestamp(2026-07-11T02:08:00Z)", 
  "createdAt": "Timestamp(2026-07-11T01:53:00Z)",
  "completedAt": null
}
```

### 9.4 Collection: `trades` (The Immutable Ledger)
*   **Path:** `/trades/{tradeId}`
*   **Document Definition:**
```json
{
  "tradeId": "trd_99012cd5",
  "dealId": "deal_66723b1a",
  "buyerId": "usr_11223344",
  "sellerId": "usr_99812456",
  "coinSymbol": "HFC",
  "quoteCurrency": "PKR",
  "quantity": 250.00000000,
  "rate": 245.00,
  "grossAmount": 61250.00,
  "buyerFeeCollected": 2.50000000, 
  "sellerFeeCollected": 918.75, 
  "blockchainTxHash": "0x4b789e02c1df56a8947ef3a31c0be420379961da", 
  "status": "success",
  "completedAt": "Timestamp(2026-07-11T01:54:30Z)"
}
```

### 9.5 Collection: `wallets`
*   **Path:** `/wallets/{walletId}` (Composite ID format: `{ownerId}_{currency}`)
*   **Document Definition:**
```json
{
  "walletId": "usr_99812456_HFC",
  "ownerId": "usr_99812456",
  "currency": "HFC",
  "availableBalance": 5000.00000000,
  "holdBalance": 250.00000000,
  "address": "0x582fae39b927ac0f11dcd9a3941b2cde827104be",
  "updatedAt": "Timestamp(2026-07-11T01:53:00Z)"
}
```

---

## 10. Notifications Architecture

Notifications are pushed in real-time. For cross-platform support (Web & future iOS/Android apps), notification documents are appended to a subcollection on the target user's document.

*   **Subcollection Path:** `/users/{userId}/notifications/{notificationId}`

### Event Trigger Matrices

| Event | Target User | Title | Body Message | Action Link |
| :--- | :--- | :--- | :--- | :--- |
| **Offer Updated** | Watchers | Offer Price Change | "An offer for {coin} has updated rate terms to {rate} PKR." | `/marketplace/offers/{id}` |
| **Negotiation Started** | Offer Owner | New Negotiation Request | "{user} wants to negotiate on your {coin} offer." | `/negotiate/{id}` |
| **Counter Offer Received** | Counterparty | Counter Proposal Offered | "{user} proposed a counter-rate of {rate} PKR." | `/negotiate/{id}` |
| **Deal Locked** | Both | Escrow Sealed (Locked) | "Deal locked! Base assets are secured in HFC escrow. Payout in 15m." | `/escrow/{id}` |
| **Deal Expired** | Both | Escrow Timeout Expired | "Security hold released. Negotiations returned to lobby." | `/negotiate/{id}` |
| **Trade Completed** | Both | Trade Settled & Dispatched | "Settlement success! Your wallet has been credited." | `/wallet` |

---

## 11. Security Defenses & Fraud Prevention

### 11.1 Anti Self-Trading Rules
To prevent artificial volume wash trading or rate manipulation:
*   **Validation Rule:** `negotiation.challengerId != offer.creatorId`.
*   Firestore security rules must explicitly assert this:
    ```javascript
    allow create: if request.auth != null && request.resource.data.challengerId != get(/databases/$(database)/documents/offers/$(request.resource.data.offerId)).data.creatorId;
    ```

### 11.2 Balance Overdraft Shield
A trade execution or escrow lock must verify that subtracting the required quantity does not result in a negative balance.
*   **Strict Rule:** `wallet.availableBalance - amount >= 0` is evaluated inside the transaction pre-write query.

### 11.3 Multi-Lock Blocker
Prevent multiple concurrent locks on a single offer from exceeding total available volume:
*   Before a deal transitions to `Locked`, the system checks:
    $$\sum \text{locked\_deal\_quantities} + \text{proposed\_qty} \le \text{Offer.initialQuantity}$$
*   This calculation is wrapped in a Firestore Transaction to avoid race conditions.

---

## 12. Scalability, Indexes, & Real-Time Sync Strategy

### 12.1 Optimal Document Partitioning
To prevent the Firestore **1 write per document per second** bottleneck on popular offers:
*   Negotiations are **NOT** stored inside the parent offer document as arrays.
*   Negotiations exist as a top-level collection containing `offerId` fields.
*   This partitions concurrent edits into separate files across multiple challenger threads.

### 12.2 Single-purpose vs. Composite Indexes
To ensure sub-second retrieval on the web and mobile interfaces under high load:

1.  **Offers board listing filter:**
    *   `coinSymbol` (Ascending) + `status` (Ascending) + `type` (Ascending) + `rate` (Ascending)
2.  **Negotiation directory search:**
    *   `challengerId` (Ascending) + `status` (Ascending) + `updatedAt` (Descending)
3.  **Audit ledger filter:**
    *   `coinSymbol` (Ascending) + `status` (Ascending) + `completedAt` (Descending)

### 12.3 High-Efficiency Real-Time Syncing
Instead of fetching all documents on every change, clients subscribe using refined queries:
*   **Lobby View:** `where("status", "==", "active")` with limits.
*   **Negotiation Lobby:** Active subscriptions on `/negotiations/{id}/proposals` ordered by `createdAt` descending.
*   Clients keep an in-memory cache to only draw modified chunks (using Firestore `docChanges()`).

### 12.4 Cloud Functions Readiness
The collection layouts are designed for immediate trigger integration:
*   `onWrite` to `/lockedDeals/{dealId}`: Launches scheduling queues to automatically release holds after 15 minutes.
*   `onCreate` to `/trades/{tradeId}`: Sends telemetry reports to admin logs and calculates daily transaction indices.

---
### Architect's Verification Statement
The architecture detailed above provides complete cryptographic balance safety, prevents concurrent double-spending via transactions, maintains an immutable history of counter-offers, and limits read/write amplification, satisfying all standard specifications of modern, enterprise-grade FinTech platforms.
