# HFC Exchange - Production Launch Day Checklist (LAUNCH_CHECKLIST.md)
**Author:** Principal Release Manager, Senior DevOps Engineer & Security Administrator  
**Version:** 2.0.0  
**Status:** Approved for Core Execution  
**Execution Context**: Launch Day / Go-Live Operations

This checklist outlines the critical verification gates that must be completed on Launch Day before HFC Exchange is opened to the public. Each item represents a blocking requirement that must be checked and signed off by its respective owner.

---

## 1. Pre-Launch Infrastructure & Configuration Audit

Before opening trade portals, verify the integrity of all cloud infrastructure systems:

*   [ ] **GitHub Repository Validation**:
    *   Confirm the `main` branch is locked, requiring reviewer approvals for merges.
    *   Verify the latest production code commit is tagged and built.
*   [ ] **Firebase Project Gating**:
    *   Confirm the active client environment is connected to the production project (`hfc-production`).
    *   Verify Firestore database region is configured for low-latency P2P access in Pakistan (e.g., `asia-south1`).
*   [ ] **Security Rules Integrity**:
    *   Verify `firestore.rules` are deployed. Check that standard clients are blocked from writing to `admin/` settings and metadata.
    *   Verify `storage.rules` are deployed, limiting receipt image viewing to the uploader and administrators.
*   [ ] **Firestore Index Deployment**:
    *   Verify composite indexes are created in Firestore. Confirm that queries sorting active offers by amount/rate on `/marketplace.html` run successfully without throwing missing-index exceptions.
*   [ ] **Authorized Web Domains**:
    *   In the Firebase Console (Authentication -> Settings -> Authorized Domains), confirm only the following domains are listed:
        1. `localhost` / `127.0.0.1` (Development sandboxes only)
        2. `hfc-exchange.github.io` (Staging/Production Host)
        3. `hfc-exchange.com` (Primary production proxy)
*   [ ] **Production Admin Accounts**:
    *   Verify the list of authorized administrators. Confirm all non-essential testing/development credentials have been deleted.

---

## 2. Initial Exchange Setup & Token Allocation

The following initialization steps must be performed directly on the production ledger prior to user onboarding:

*   [ ] **Create Initial Admin Account**:
    *   Register the primary administrator account (e.g., `admin@hfc-exchange.com`).
    *   Manually set `role: "admin"` in the corresponding Firestore user document.
*   [ ] **Create Initial Exchange Settings Document**:
    *   Initialize the global `settings` collection in Firestore with the following parameters:
        *   `maintenanceMode`: `false`
        *   `tradingFee`: `0.01` (1% transaction fee)
        *   `minDeposit`: `1000` PKR
        *   `maxDeposit`: `1000000` PKR
        *   `minWithdrawal`: `1000` PKR
*   [ ] **Create Initial HFC Coin Document**:
    *   Create the "HFC" coin entry in the `/coins` database collection.
    *   Set **Total Supply** to `1000 HFC`.
*   [ ] **Assign Total Supply to Admin Wallet**:
    *   Manually credit `1000 HFC` directly to the primary Administrator's wallet document.
    *   Ensure all other wallets are initialized at `0.00 HFC`.
*   [ ] **Verify Ledger Supply Balance**:
    *   Confirm that the sum of all HFC tokens across all user wallets equals exactly `1000 HFC`.

---

## 3. Core Functional & Security Verification Gates

Perform these final functional checks on the live deployment:

*   [ ] **Registration & Login Gate**: Create a new test user account, verify default wallet balances are zero, log out, and sign back in.
*   [ ] **Deposit Flow Gate**: Submit a PKR deposit request, upload a receipt image, approve it via the Admin console, and verify the user's PKR balance updates instantly.
*   [ ] **Offer & Escrow Gate**: Create a P2P sell offer, open it using a separate client account, lock the escrow, exchange real-time chat messages, and complete the trade. Verify balances on both sides update correctly.
*   [ ] **Privilege Separation Gate**: Verify that standard user accounts cannot load paths under `/admin/` and are automatically returned to `/dashboard.html`.

---

## 4. Emergency Backup & Disaster Recovery Readiness

*   [ ] **Automatic Database Backups**: Verify that Firestore scheduled exports are active and targeting a secure Google Cloud bucket.
*   [ ] **Configuration Backup**: Store copy files of the local `firebase-blueprint.json` and environmental variables in the secure corporate storage vault.
*   [ ] **Disaster Recovery Playbook**: Confirm all operational staff have copies of the `/ROLLBACK_PLAN.md` and know how to trigger an emergency maintenance lockdown.
