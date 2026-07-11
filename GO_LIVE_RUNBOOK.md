# HFC Exchange - Go-Live Runbook (GO_LIVE_RUNBOOK.md)
**Author:** Lead Release Manager, Head of Operations & Systems Engineer  
**Version:** 2.0.0  
**Status:** Approved for Core Execution  
**Execution Context**: Launch Day Sequential Actions (T-Minus 3 Hours to T-Plus 1 Hour)

This runbook defines the exact sequence of actions, terminal commands, and verification gates required to deploy HFC Exchange to GitHub Pages and initialize production Firebase databases on Launch Day.

---

## 1. Timeline & Operational Roles

On launch day, three core coordinators must manage the launch window:
*   **Release Manager (RM)**: Commands the overall sequence, triggers builds, tags commits, and manages Git pushes.
*   **Infrastructure Lead (IL)**: Manages Firestore database collections, security rules, indexes, and authorized domains.
*   **QA Lead (QL)**: Executes live post-deployment smoke tests and confirms core financial transactions.

```
+-------------------------------------------------------------------------+
|                          LAUNCH DAY SEQUENCE                            |
+-------------------------------------------------------------------------+
|                                                                         |
|   [T-3h: Pre-Flight]                                                    |
|     IL deploys Firestore Security Rules & Indexes                       |
|     RM configures production env variables                              |
|                                                                         |
|   [T-1h: Deployment]                                                    |
|     RM builds production pack & deploys to gh-pages                     |
|     RM tags version v2.0.0 in git repository                            |
|                                                                         |
|   [T-30m: Setup]                                                        |
|     IL registers Admin account & initializes global setting documents    |
|     IL mints 1000 HFC tokens into Admin Cold Vault                      |
|                                                                         |
|   [T-0: GO-LIVE]                                                        |
|     RM disables Maintenance Mode in Firestore config                    |
|     QL executes final smoke checks on live URL                          |
|     Marketing opens trade channels & releases announcements             |
|                                                                         |
+-------------------------------------------------------------------------+
```

---

## 2. Step-by-Step Sequence of Operations

### Step 2.1: Pre-Flight Database Configuration (T-Minus 3 Hours)
*   **Actor**: Infrastructure Lead (IL)
*   **Actions**:
    1. Log in to Firebase CLI and deploy the final security rules and database composite index files:
       ```bash
       firebase use hfc-production
       firebase deploy --only firestore:rules,firestore:indexes,storage:rules
       ```
    2. Open the Firebase Console -> Authentication -> Settings -> Authorized Domains. Confirm only production URLs and local loopbacks are authorized.
    3. Ensure Firebase Storage billing rules are healthy and set up to store user receipts.

### Step 2.2: Compile and Deploy Static Frontends (T-Minus 1 Hour)
*   **Actor**: Release Manager (RM)
*   **Actions**:
    1. Pull the latest approved commit from the `test` branch into `main`:
       ```bash
       git checkout main
       git pull origin main
       ```
    2. Clean install dependencies and run compiling scripts to create the `/dist/` folder:
       ```bash
       npm ci
       npm run lint
       npm run build
       ```
    3. Deploy the compiled web application folder onto GitHub Pages:
       ```bash
       npx gh-pages -d dist --branch gh-pages --message "Release: v2.0.0 Production Launch"
       ```
    4. Tag the commit with the official production version tag:
       ```bash
       git tag -a v2.0.0 -m "Release: Production Launch Version v2.0.0"
       git push origin v2.0.0
       ```

### Step 2.3: Initial Account & Database Seed Setup (T-Minus 30 Minutes)
*   **Actor**: Infrastructure Lead (IL)
*   **Actions**:
    1. Navigate to the live URL: `https://hfc-exchange.github.io/register.html`.
    2. Register the primary Administrative account (e.g., `admin@hfc-exchange.com`).
    3. Access the Firestore Console, find the document for `admin@hfc-exchange.com` in the `users` collection, and edit the fields:
       *   Set `role` to `"admin"`
       *   Set `isVerified` to `true`
    4. Initialize the global platform configuration document inside the `/settings` collection:
       ```json
       {
         "maintenanceMode": true,
         "tradingFee": 0.01,
         "minDeposit": 1000,
         "maxDeposit": 1000000,
         "minWithdrawal": 1000
       }
       ```
    5. Initialize the standard HFC token inside the `/coins` collection:
       ```json
       {
         "symbol": "HFC",
         "name": "HFC Token",
         "totalSupply": 1000,
         "isTradingEnabled": true
       }
       ```
    6. Credit the Admin user's wallet document:
       *   Set `HFC` balance to `1000`
       *   Set `HFC_hold` balance to `0`
    7. Query the entire Firestore database and confirm that the total HFC supply equals exactly 1000, and that no other wallet has HFC tokens.

### Step 2.4: Go-Live Transition (T-Minus 0)
*   **Actor**: Release Manager (RM)
*   **Actions**:
    1. Log in to the Admin Dashboard interface or use the Firebase Console to update the global settings:
       *   Set `maintenanceMode` to `false`.
    2. Force client-side updates by triggering the service worker update sequence.

### Step 2.5: Live Post-Launch Smoke Checking (T-Plus 10 Minutes)
*   **Actor**: QA Lead (QL)
*   **Actions**:
    1. Open a clean browser window, navigate to the live URL, and complete the full test script outlined in the Post-Deployment validation protocols of `RELEASE_CHECKLIST.md`.
    2. Confirm that real-time chats work, screenshots upload successfully, and wallets update accurately without throwing console errors.

### Step 2.6: Announcements & Launch Coordination (T-Plus 30 Minutes)
*   **Actor**: Head of Operations
*   **Actions**:
    1. Send internal notifications to Support Agents confirming that the exchange is fully operational.
    2. Post announcements on official marketing channels.
