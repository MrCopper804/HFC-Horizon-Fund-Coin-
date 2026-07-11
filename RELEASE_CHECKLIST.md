# HFC Exchange - Production Release Verification Checklist
**Author:** Lead QA Analyst, Principal Frontend Architect & Lead System Operator  
**Version:** 2.0.0  
**Status:** Approved for Core Execution  
**Execution Context:** Manual Pre-Flight Checks & Automated Verification Protocols

---

## 1. Automated Pre-Release Inspections

Before executing any manual checks, developers **must** verify compilation and styling conformity in their local developer environment:

```bash
# 1. Clean-install all standard dependencies from package.lock
npm ci

# 2. Run TypeScript and linter compiler checks
npm run lint

# 3. Build and verify production pack output (creates /dist/)
npm run build
```
*   **Success Criterion**: Command processes complete without a single warning or syntax exception. If warnings appear, resolve them before proceeding.

---

## 2. Phase-by-Phase Manual Verification Protocols

Ensure that the application executes flawlessly under varied network situations and system configurations. Follow this structured checklist before approving version releases:

### 2.1. Phase A: Authentication Gates
*   [ ] **Account Creation (Register)**: Attempt to create an account with a weak password (<8 characters). Verify that validation triggers catch this error. Complete creation with valid credentials and verify that the user's data is initialized in Firestore with default zero balances.
*   [ ] **Sign In (Login)**: Confirm that incorrect passwords trigger clear, helpful UI alerts without leaking server details. Log in successfully and verify that the app redirects to `/dashboard.html`.
*   [ ] **Role Separation**: Confirm that standard clients cannot load paths under `/admin/` and are automatically returned to `/dashboard.html` by `authGuard.js`.

### 2.2. Phase B: Wallet Operations
*   [ ] **Deposit Funds (PKR)**: Request a deposit of 10,000 PKR on `/deposit.html`. Upload a sample transaction receipt screenshot. Confirm that the status is set to "Pending Review" and can be viewed in the Admin dashboard.
*   [ ] **Withdraw Assets**: Enter a destination address and attempt to withdraw more than the available wallet balance. Confirm that the system blocks the transaction and warns the user. Request a valid withdrawal and confirm that the funds are marked as "Locked" in the balance list.

### 2.3. Phase C: P2P Escrow & Trading
*   [ ] **Create Offer**: Post a new offer to sell USDT at 285 PKR on `/offer.html`. Confirm that the offer is instantly visible in the public board on `/marketplace.html`.
*   [ ] **Deal Locking (Escrow)**: Open the newly created offer using a secondary testing account. Click "Start Deal" to enter the workspace. Verify that the system locks the seller's assets inside the escrow vault.
*   [ ] **Chat Terminal**: Send multiple messages in the transaction chat. Verify that messages sync in real-time between both browser windows.
*   [ ] **Multi-Sig Validation**: Simulate a payment release. Have the buyer upload proof of payment, have the seller verify and sign off, and confirm that the locked cryptocurrency is correctly transferred to the buyer's balance.

### 2.4. Phase D: PWA & Offline Resilience
*   [ ] **Service Worker Loading**: Inspect Chrome DevTools (Application -> Service Workers) and confirm that `service-worker.js` is registered and active.
*   [ ] **Pre-Caching Audit**: Confirm that Bootstrap CSS and core JS assets are loaded from the static cache when page reloads occur.
*   [ ] **Offline Screen Fallback**: Simulate network disconnection (DevTools Offline Mode). Refresh `/dashboard.html` and verify that the user is redirected to the `/offline.html` glassmorphic screen. Turn the connection back on, click "Re-Verify Connection Node", and confirm that the app redirects the user back to the home portal.

### 2.5. Phase E: Search Indexing & Meta Audit
*   [ ] **HTML Validation**: Inspect the head of `/index.html` and confirm that all primary keywords, viewport, canonical paths, Open Graph targets, and Apple-Mobile integration variables match the master specification in `SEO.md`.
*   [ ] **Robots Rules**: Confirm `/robots.txt` is present and blocking `/admin/` and personal `/dashboard.html` access, while allowing `/marketplace.html`.
*   [ ] **Google Rich Snippet Verification**: Paste `/structured-data.jsonld` into schema validator programs to ensure zero markup parse errors.

---

## 3. Post-Deployment Hot-Smoke Sign-Off

Immediately following production pushes to GitHub Pages, perform a live verification check on the deployed URL to ensure the environment is operating correctly:

| Verification Target | Expected Operational Outcome | Sign-off Initials |
| :--- | :--- | :--- |
| **PWA Installation** | Browser reveals install option in URL or action button. | |
| **Secure JWT Sessions** | Refreshing `/dashboard.html` keeps the user logged in without requiring sign-in. | |
| **Real-time Synchronization**| Opening two views side-by-side shows real-time chat updates. | |
| **File Storage Vault** | Transaction screenshot uploads complete without permissions errors. | |
| **Asset Security** | Attempting to access raw Firestore tables directly fails. | |
