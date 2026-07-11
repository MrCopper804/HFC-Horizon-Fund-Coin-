# HFC Exchange - PKR Deposit & Withdrawal Workflow Specification
**Author:** Lead FinTech Architect, Principal Database Engineer & Fraud Systems Designer  
**Version:** 1.0.0  
**Status:** Approved for Production  
**Target Class:** Institutional & Retail Fiat-Crypto Gateways (EasyPaisa, JazzCash, Commercial Bank Transfers)

---

## 1. Architectural Objectives & Core Design Patterns

HFC Exchange utilizes a strictly controlled **Double-Entry Ledger Pattern** for all cash-in (deposit) and cash-out (withdrawal) workflows. Because fiat banking transactions are processed asynchronously outside the blockchain environment, our database workflows must bridge the gap between bank confirmations and digital balance updates with 100% mathematical consistency.

### Core Architectural Principles:
1. **Separation of Concerns:** Client apps only register "Intents" (e.g., requesting a deposit or withdrawal). Only authorized **Admin/Operator Nodes** or verified **Serverless Cloud Functions** can commit final ledger writes to credit or debit user balances.
2. **Transactional Mutex (Double-Spend Mitigation):** Any state update (e.g., changing status from `pending` to `approved`) must execute inside an **Atomic Firestore Transaction**. If two operators try to approve the same withdrawal simultaneously, one will succeed and the other will fail due to optimistic locking.
3. **Immutability of the Ledger:** Once a transaction document is added to `/transactions`, it can never be deleted or updated. Discrepancies must be settled using adjusting entries (reversals), never by modifying existing logs.

---

## 2. Complete PKR Deposit Workflow

This workflow maps the multi-stage path of a user sending Pakistani Rupees (PKR) via EasyPaisa, JazzCash, or Bank Transfer, and receiving digital credentials in their HFC account balance.

```
       [ USER ]                          [ FIRESTORE ]                     [ ADMIN PANEL ]
  ┌─────────────────┐                 ┌─────────────────┐                ┌─────────────────┐
  │ Initiate Deposit│ ──────────────> │ Create Pending  │                │ Render Pending  │
  │ Enter TxID,     │                 │ Deposit Doc     │                │ Deposit Row     │
  │ Upload Receipt  │                 └────────┬────────┘                └────────┬────────┘
  └─────────────────┘                          │                                  │
                                               │                                  │
                                               ▼                                  ▼
  ┌─────────────────┐                 ┌─────────────────┐                ┌─────────────────┐
  │ Receive Success │ <────────────── │ Update Wallet   │ <───────────── │ Confirm Bank &  │
  │ Toast & Notification│             │ & Log Ledger    │                │ Click 'Approve' │
  └─────────────────┘                 └─────────────────┘                └─────────────────┘
```

### Stage 2.1: User Initiation (Client Side)
1. User navigates to the **Deposit Page** and is presented with available payment gateway options (e.g., *EasyPaisa*, *JazzCash*, *Habib Bank Limited (HBL)*).
2. User enters the target deposit amount (e.g., 50,000 PKR).
3. The client-side form queries `/settings/exchange_config` to validate that the amount is within the configured limits (`minDepositLimitPKR <= amount <= maxDepositLimitPKR`).
4. The user sends the cash via their bank/wallet application to the HFC platform bank account details displayed on the screen.
5. The bank/wallet system returns a unique **Transaction ID (TxID)** (e.g., 37-character telco string or bank transfer code).
6. User inputs the TxID into the HFC platform and uploads a screenshot of the payment receipt.
7. The client uploads the receipt image to Firebase Storage at the path: `/users/{uid}/receipts/dep_{timestamp}.jpg`.
8. Upon successful upload, the client writes a new document to the `/deposits` collection:
   - Sets `status` = `"pending"`.
   - Populates bank receipt metadata, screenshot URL, and the unique `transactionId`.
9. Simultaneously, a pending notification is created in `/notifications` to confirm the deposit request is in queue.

### Stage 2.2: Administrative Review & Reconciliation (Operator Side)
1. The pending deposit appears in real-time on the **Admin Console** via a Firestore snapshot listener filtered on `status == "pending"`.
2. The administrative auditor logs into the corporate bank portal to verify the actual arrival of funds matching the user's uploaded `transactionId` and receipt amount.
3. The administrator chooses to either **Approve** or **Reject** the deposit.

#### Case A: Admin Approves
1. The Admin clicks "Approve". This triggers an **Atomic Firestore Transaction**:
   - Reads the `/deposits/{depositId}` document to verify `status` is still `"pending"`. (Prevents race conditions).
   - Updates the deposit document: `status` = `"approved"`, `adminUid` = `{operator_uid}`, `processedAt` = `serverTimestamp()`.
   - Reads the user's PKR wallet document at `/wallets/{userId}_PKR`. If it doesn't exist, initializes it.
   - Increments `wallets/{userId}_PKR.availableBalance` by the approved deposit amount.
   - Writes an immutable record to `/transactions`:
     - `type` = `"deposit"`, `amount` = `+amount`, `currency` = `"PKR"`, `status` = `"completed"`, `txHash` = `"0x" + generate_hash()`.
   - Writes a success notification to `/notifications` informing the user that their deposit has cleared.

#### Case B: Admin Rejects
1. The Admin clicks "Reject" and provides a reason (e.g., *"Receipt screenshot blurred"* or *"Funds not received in corporate account"*).
2. The atomic transaction:
   - Updates `/deposits/{depositId}`: `status` = `"rejected"`, `rejectionReason` = `"..."`, `adminUid` = `{operator_uid}`, `processedAt` = `serverTimestamp()`.
   - Writes a warning notification to `/notifications` alerting the user of the rejection, along with instructions to re-submit with the correct receipt.

---

## 3. Complete PKR Withdrawal Workflow

This workflow maps how a user cash out their digital PKR balances back into their physical bank accounts or mobile wallets.

### Stage 3.1: User Cash-Out Request (Client Side)
1. User navigates to the **Withdraw Page**.
2. User enters the target cash-out amount and selects their withdrawal method (e.g., *EasyPaisa*, *HBL Bank*).
3. User enters their recipient bank account details (Bank Name, Account Title, IBAN).
4. Client-side validators check the request:
   - **Limit Validation:** Queries `/settings/exchange_config` to ensure the amount complies with minimum and maximum withdrawal rules.
   - **Balance Validation:** Queries `/wallets/{userId}_PKR` to verify that `availableBalance >= amount`.
5. User clicks "Confirm Withdrawal".
6. The client executes an **Atomic Transaction** on Firestore:
   - Reads `/wallets/{userId}_PKR` and verifies that the available balance is indeed sufficient.
   - Subtracts the `amount` from the wallet's `availableBalance`.
   - Adds the `amount` to the wallet's `holdBalance`. (This prevents the user from double-spending or using these funds in P2P trade negotiations while the withdrawal is in processing).
   - Writes a new document to `/withdrawals` with:
     - `status` = `"pending"`.
     - `fee` = `amount * 0.02` (2% standard platform fee processing charge).
     - `netAmount` = `amount - fee`.
     - `accountDetails` = `{ iban: ..., title: ... }`.
   - Writes a tracking record to `/transactions` with `type` = `"withdrawal"`, `amount` = `-amount`, `status` = `"pending"`.

### Stage 3.2: Administrative Execution & Payout (Operator Side)
1. The withdrawal ticket appears on the admin panel queue.
2. The Admin Operator checks user status, account compliance logs, and the payout destination.
3. The Admin logs into the commercial banking terminal or business gateway and initiates a bank transfer matching the user's destination details and `netAmount`.
4. Once the bank transfer completes and returns a banking reference number, the Admin updates the withdrawal status.

#### Case A: Admin Confirms Payment Dispatch
1. The Admin inputs the payment reference code and clicks "Confirm Paid".
2. Firestore Transaction:
   - Verifies the withdrawal document `status` is currently `"pending"`.
   - Updates `/withdrawals/{withdrawalId}`: `status` = `"dispatched"`, `adminUid` = `{operator_uid}`, `processedAt` = `serverTimestamp()`, `paymentReference` = `"{reference}"`.
   - Reads the user's PKR wallet document `/wallets/{userId}_PKR`.
   - Subtracts the `amount` from `holdBalance`. (The hold is now permanently released since the fiat has left the system).
   - Updates the associated ledger entry in `/transactions/{txId}`: `status` = `"completed"`, `txHash` = `"{payout_tx_hash}"`.
   - Sends a dispatch notification to the user.

#### Case B: Admin Rejects Payout (Reversal)
1. If the user provided an invalid IBAN or failed compliance screening, the Admin clicks "Reject".
2. Firestore Transaction:
   - Updates `/withdrawals/{withdrawalId}`: `status` = `"rejected"`, `rejectionReason` = `"..."`, `adminUid` = `{operator_uid}`, `processedAt` = `serverTimestamp()`.
   - Reads `/wallets/{userId}_PKR`.
   - Subtracts the `amount` from `holdBalance` and adds it back to `availableBalance`. (Funds are returned to the user's active wallet balance).
   - Updates the associated `/transactions/{txId}` document: `status` = `"failed"`.
   - Sends a critical notification explaining the bank rejection.

---

## 4. Order Lifecycle & Status System

To ensure a deterministic, auditable transactional timeline, deposits and withdrawals must adhere strictly to the following state machine transitions. No other transitions are permitted.

```
       DEPOSIT STATE MACHINE                  WITHDRAWAL STATE MACHINE
       
             [ pending ]                            [ pending ]
                  │                                      │
         ┌────────┴────────┐                    ┌────────┴────────┐
         ▼                 ▼                    ▼                 ▼
    [ approved ]      [ rejected ]        [ dispatched ]     [ rejected ]
```

### Detailed Status Definitions:
- **`pending`:** The initial state of an intent. For deposits, funds have been sent by the user but are unverified in HFC corporate bank records. For withdrawals, user funds are locked in the `holdBalance` awaiting admin review.
- **`approved` (Deposits Only):** Transaction is finalized. Money has safely arrived in HFC accounts; user's wallet is credited.
- **`dispatched` (Withdrawals Only):** Transaction is finalized. Physical money has been successfully wired to the user's destination IBAN; hold balances are permanently debited.
- **`rejected`:** Request has failed validation, KYC checks, or banking reconciliation. For deposits, no balance change occurs. For withdrawals, hold balances are fully restored back to available balances.

---

## 5. System Validation, Limits, and Idempotency Rules

To protect the exchange against mathematical inaccuracies and database abuse, the transaction logic enforces several strict system invariants.

### 5.1. Velocity & Amount Boundaries
These limits are configured globally inside `/settings/exchange_config`:
- **Deposits Limits:**
  - Minimum Deposit: 5,000 PKR
  - Maximum Deposit: 1,000,000 PKR per transaction
- **Withdrawal Limits:**
  - Minimum Withdrawal: 1,000 PKR
  - Maximum Withdrawal: 500,000 PKR per transaction
  - Platform processing fee is hardcoded to exactly **2.0%** of the withdrawal total.

### 5.2. Duplicate Transaction ID (TxID) Prevention
To prevent malicious users from uploading the same bank transfer confirmation code multiple times to receive double credits, the deposit system enforces unique TxID indexes:
- Before creating a `/deposits` document, the database checks if any document in the `/deposits` collection already contains the matching `transactionId`.
- **Constraint Rule:** If a match is found, the creation is rejected with an exception error: `"This bank transaction reference number has already been claimed on our platform."`

### 5.3. Invalid Screenshot & Fraud Handling
- Screenshot receipt images are saved on Firebase Cloud Storage with strict rules allowing read access only to authenticated admins and the upload owner.
- Metadata is scanned to verify image headers. If an operator marks a screenshot as fake or edited during review, they reject the deposit and label it under compliance review. The user's KYC node may be automatically flagged for investigation.

---

## 6. Multi-Channel Notification Dispatch System

The following structured notification templates are generated dynamically inside the `/notifications` collection during transitions. They trigger real-time client-side alerts and prepare payloads for future mobile app push delivery.

```json
{
  "deposit_submitted": {
    "title": "Deposit Under Review",
    "message": "We have received your request to deposit {amount} PKR. Our treasury node is currently auditing payment code {txid}.",
    "type": "info"
  },
  "deposit_approved": {
    "title": "Deposit Cleared",
    "message": "Your payment of {amount} PKR has been verified. {amount} PKR has been successfully credited to your portfolio balance sheet.",
    "type": "success"
  },
  "deposit_rejected": {
    "title": "Deposit Unverified",
    "message": "Your deposit request for {amount} PKR was rejected due to: {reason}. Please review your submitted bank details.",
    "type": "danger"
  },
  "withdrawal_submitted": {
    "title": "Withdrawal Initiated",
    "message": "Your withdrawal of {amount} PKR is processing. A 2% network fee ({fee} PKR) has been applied. {net} PKR is queued for bank transfer.",
    "type": "info"
  },
  "withdrawal_approved": {
    "title": "Payout Dispatched",
    "message": "Success! {amount} PKR has been sent to your designated account. Reference code: {bank_ref}.",
    "type": "success"
  },
  "withdrawal_rejected": {
    "title": "Withdrawal Reversed",
    "message": "Your cashout request of {amount} PKR has been rejected. Reason: {reason}. Your locked funds have been fully returned to your available wallet.",
    "type": "danger"
  }
}
```

---

## 7. Cryptographic Administrative Auditing & Log Design

To prevent internal fraud, security breaches, or compliance gaps, every single interaction with the deposit/withdrawal system produces a security log inside the `/logs` collection. This ensures a transparent, tamper-evident record of actions taken by both users and system operators.

### Schema Structure for Audit Logging:
- `logId` (String) - Composite format: `log_fiat_{timestamp}_{hash}`
- `category` - `"fiat_reconciliation"`
- `severity` - `"info"` | `"warning"` | `"critical"`
- `actorId` - The UID of the operator, user, or system node executing the change.
- `action` - The exact action executed: `"deposit_review_started"`, `"deposit_approved"`, `"withdrawal_dispatched"`, `"payout_rejection_reversal"`.
- `ipAddress` - Network endpoint client IP address at the time of the action (provided via server gateway headers).
- `details` - Map container containing exact before/after snapshots of the records.

#### Example Admin Log Payload (Deposit Approval Audit):
```json
{
  "logId": "log_fiat_1762749411_a38f",
  "category": "fiat_reconciliation",
  "severity": "info",
  "actorId": "admin_audit_officer_01",
  "action": "deposit_approved",
  "ipAddress": "110.33.14.82",
  "details": {
    "depositId": "dep_4rM7pB2s1N",
    "recipientUserId": "u8H2kP9s1LmN3b5v7c9x",
    "amountPKR": 250000.00,
    "claimedBankTxID": "FT-20260710-8849201",
    "walletPreBalance": 0.00,
    "walletPostBalance": 250000.00
  },
  "timestamp": "2026-07-10T08:05:00Z"
}
```

---

## 8. Security & Fraud Mitigation

Financial transaction systems require defense-in-depth mechanisms. HFC Exchange secures its boundaries using several strategies:

### 8.1. Preventing Duplicate Submissions (Double Click or Network Lag)
- **Client Debounce:** Submit buttons are disabled instantly upon the first click, displaying a loading spinner.
- **Server Lock (Atomic Verification):** When the Firestore database receives a request to create a deposit or withdrawal document, it utilizes a unique transaction ID constraint (described in Section 5.2). If a request with the exact same details arrives within a 10-second threshold, it is automatically discarded as a duplicate network packet.

### 8.2. Preventing Double Approvals (Operator Concurrency)
- **The Problem:** Two operators open the pending withdrawals queue simultaneously. Both see a 100,000 PKR withdrawal. Both click "Confirm Paid" at the exact same moment.
- **The Solution:** Both button clicks trigger a Firestore Transaction on `/withdrawals/{withdrawalId}`.
  - The database transaction locks the document and reads the current state.
  - Operator 1's transaction succeeds, updating the status to `"dispatched"`.
  - Operator 2's transaction is executed milliseconds later. It reads the status, sees that the state has already changed to `"dispatched"`, and automatically aborts the operation, throwing a safe warning toast: *"This transaction has already been processed by another team member."*

### 8.3. Balance Inconsistency Shield (Atomic Rollbacks)
- Balances are NEVER updated in separate, disconnected steps.
- If a withdrawal is approved, the debit from the user's `holdBalance` and the update to the transaction status must succeed or fail together. If one part of the database write fails (e.g., due to a network disconnect), the entire transaction is automatically rolled back, returning both values to their pre-write state.

### 8.4. Unauthorized Operator Approval Block
- All administrative endpoints require verification signatures checked directly against the user profile role in Firestore.
- Firestore Security Rules (Section 3 of our Database Architecture) mandate that only profiles with `getUserData().role == 'admin'` have write access to `/deposits` and `/withdrawals` status fields. Any direct client manipulation of these documents will immediately return a `Permission Denied` exception.

---

## 9. Firestore Collection Interactions & Relational Transactions Flow

The table below outlines which collections are modified, their state transitions, and the data schema updates involved during the core stages of the Deposit and Withdrawal pipelines.

| Step | Initiated By | Collections Modified | Relationships Maintained | Action Performed |
| :--- | :--- | :--- | :--- | :--- |
| **1. Create Deposit** | End User | `/deposits`<br>`/notifications` | Linked to `/users/{uid}` | Create a deposit record with status `pending`. Log the uploaded screenshot and transaction reference ID. |
| **2. Clear Deposit** | Admin Node | `/deposits`<br>`/wallets`<br>`/transactions`<br>`/notifications`<br>`/logs` | Linked to `/wallets/{uid}_PKR` | Atomic Transaction: Mark deposit as `approved`. Credit user available balance. Log completed transaction with a unique transaction hash. Log admin action. |
| **3. Request Cashout** | End User | `/withdrawals`<br>`/wallets`<br>`/transactions`<br>`/notifications` | Linked to `/wallets/{uid}_PKR` | Atomic Transaction: Verify available balance. Debit available balance and credit hold balance. Create a withdrawal record in `pending` status. |
| **4. Dispatch Payout** | Admin Node | `/withdrawals`<br>`/wallets`<br>`/transactions`<br>`/notifications`<br>`/logs` | Linked to `/wallets/{uid}_PKR` | Atomic Transaction: Mark withdrawal as `dispatched`. Debit hold balance permanently. Log completed withdrawal with a banking reference code. |
| **5. Reject Payout** | Admin Node | `/withdrawals`<br>`/wallets`<br>`/transactions`<br>`/notifications`<br>`/logs` | Linked to `/wallets/{uid}_PKR` | Atomic Transaction: Mark withdrawal as `rejected`. Debit hold balance and credit available balance. Mark transaction as `failed`. |

---
