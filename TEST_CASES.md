# HFC Exchange - Production Master Test Suite Specification (TEST_CASES.md)
**Author:** Principal Software Test Architect & FinTech QA Engineer  
**Version:** 2.0.0  
**Status:** Approved for Core Execution  
**Execution Context**: Manual Verification & Automation Blueprints

---

## 1. Authentication & Security Gateways (AUTH)

### TC-AUTH-001: User Registration Validation & DB Initialization
*   **Description**: Verify user can register an account, and that they are initialized in Firestore with standard user attributes.
*   **Priority / Severity**: High / Block-level
*   **Preconditions**: User is on `/register.html`, email address is unused, Firebase connection is active.
*   **Test Steps**:
    1. Enter standard valid email address (e.g., `testtrader@hfc.com`).
    2. Enter an invalid short password (e.g., `12345`). Click Register.
    3. Verify that the linter/validator blocks submission and reveals a password validation error.
    4. Enter a strong password (e.g., `P@ssword123!`). Click Register.
    5. Navigate to the user console and verify registration completed.
    6. (QA Admin Audit) Verify the `users` collection in Firestore has created a document with matching `uid`, setting balances to `0.00` and `role` to `"user"`.
*   **Expected Result**: Short passwords fail with a UI alert. Strong passwords succeed, redirect the user to `/dashboard.html`, and create a default client-level DB entry.

### TC-AUTH-002: User Login Security Gating
*   **Description**: Verify invalid credentials are blocked and valid credentials allow access.
*   **Priority / Severity**: High / Critical
*   **Preconditions**: User is on `/login.html`, a valid user account exists.
*   **Test Steps**:
    1. Enter a registered email but an incorrect password. Click Login.
    2. Verify that the UI displays a clear login failure alert without crashing or leaking server variables.
    3. Enter the correct password and email. Click Login.
*   **Expected Result**: Failed attempts are caught with a user-facing warning. Valid login redirects to `/dashboard.html` and persists JWT token securely in LocalStorage/SessionState.

### TC-AUTH-003: Auth Guard Role-Based Routing (Security Gating)
*   **Description**: Verify non-admin users cannot bypass directory structures and access admin screens.
*   **Priority / Severity**: High / Critical (Zero-Trust)
*   **Preconditions**: User is logged in with standard client permissions (`role` set to `"user"`).
*   **Test Steps**:
    1. Manually enter `/admin/dashboard.html` in the browser address bar.
    2. Verify if the page renders admin controls or redirects.
    3. Manually enter `/admin/users.html`.
*   **Expected Result**: `authGuard.js` intercepts page load, checks current user role, blocks access immediately, and redirects back to `/dashboard.html`.

---

## 2. Wallet & Balance Ledger System (WAL)

### TC-WAL-001: PKR Deposit Request & Admin Audit
*   **Description**: Verify deposit requests are recorded on the ledger, and balance is updated after admin verification.
*   **Priority / Severity**: High / Critical
*   **Preconditions**: Logged-in trader, wallet balance is `0.00`.
*   **Test Steps**:
    1. Navigate to `/deposit.html`.
    2. Select Bank Transfer deposit, input amount `50,000` PKR, and upload a dummy screenshot receipt. Click Submit.
    3. Verify that the transaction is marked "Pending" in the transaction log on `/wallet.html`.
    4. Log in as an Administrator and navigate to `/admin/deposits.html`.
    5. Click "Approve Deposit" on the corresponding transaction document.
    6. Log back in as the trader and check `/wallet.html`.
*   **Expected Result**: Deposit request creates a ledger entry. After admin verification, the trader's balance updates instantly to `50,000.00` PKR.

### TC-WAL-002: Over-Draft & Negative Balance Prevention (Self-Protection)
*   **Description**: Verify withdrawals or offer escrow holdings cannot bypass balance limitations, preventing negative wallets.
*   **Priority / Severity**: High / Critical
*   **Preconditions**: Logged-in trader with balance of `1,000` PKR.
*   **Test Steps**:
    1. Navigate to `/withdraw.html`.
    2. Enter a withdrawal request of `10,000` PKR. Click Submit.
    3. Inspect the UI for error alerts.
*   **Expected Result**: System blocks submission, displaying a validation error: "Insufficient balance for withdrawal". No ledger records or Firestore updates are executed.

---

## 3. P2P Escrow Trading Engine (TRD)

### TC-TRD-001: P2P Offer Creation and Market Placement
*   **Description**: Verify a user can post a buy/sell offer and it appears on the public market board.
*   **Priority / Severity**: Medium / Major
*   **Preconditions**: Logged-in trader.
*   **Test Steps**:
    1. Navigate to `/offer.html`.
    2. Select "Sell", Asset type "USDT", Amount "500", Rate "285" PKR/USDT. Click Create Offer.
    3. Log out and navigate to `/marketplace.html` (public gateway).
    4. Apply filters for "USDT" and "Sell".
*   **Expected Result**: The newly created offer card is listed on `/marketplace.html`, displaying correct rates and amounts.

### TC-TRD-002: Escrow Lock and holdBalance Transition
*   **Description**: Verify that starting a transaction locks the seller's assets, transferring them from availableBalance to holdBalance.
*   **Priority / Severity**: High / Critical
*   **Preconditions**: Seller has 1,000 USDT in available balance. Buyer opens the seller's offer.
*   **Test Steps**:
    1. Buyer navigates to `/marketplace.html`, selects the seller's offer, and clicks "Start Trade".
    2. Review the seller's wallet balances.
*   **Expected Result**: The amount of USDT specified in the transaction is immediately deducted from the seller's `availableBalance` and added to `holdBalance`. This is secured by Firestore rules preventing unauthorized balance releases.

### TC-TRD-003: Real-Time Chat Synchronization
*   **Description**: Verify chat messages in a trade are delivered instantly to both negotiators.
*   **Priority / Severity**: Medium / Major
*   **Preconditions**: Two browsers open, logged in as Buyer and Seller in the same active deal room.
*   **Test Steps**:
    1. Buyer enters message: "Transferring PKR now via JazzCash." and clicks Send.
    2. Check the seller's screen without refreshing.
*   **Expected Result**: The message appears on the seller's screen in real-time (<1 second), utilizing Firestore snapshot listeners.

---

## 4. PWA, Performance & Offline Support (PWA)

### TC-PWA-001: Offline Fallback & Connection Recovery
*   **Description**: Verify client can gracefully redirect to a clean offline card during a connectivity failure, and return to the active gateway when restored.
*   **Priority / Severity**: Medium / Major
*   **Preconditions**: App is loaded, PWA service worker is active.
*   **Test Steps**:
    1. Go to Chrome DevTools -> Application -> Service Workers. Confirm worker is registered.
    2. Toggle Network mode to "Offline" in DevTools.
    3. Click on a navigation item, or reload `/dashboard.html`.
    4. Confirm redirection to `/offline.html`.
    5. Toggle Network back to "Online" in DevTools.
    6. Click "Re-Verify Connection Node" on the offline page.
*   **Expected Result**: Client redirects to the offline screen when connection fails. Clicking retry triggers a hardware network check, displaying a success toast and returning to `/index.html` once online.
