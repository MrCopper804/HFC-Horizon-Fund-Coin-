# HFC Exchange - Production Bug Report Template
**Standard Operating Procedure**: All issues detected during QA iterations, UAT cycles, or production operations must be recorded using this template to streamline engineering triage and remediation.

---

## 1. Issue Classification

*   **Defect ID**: `HFC-BUG-[AUTO-INCREMENT]`
*   **Title**: *[HFC-MODULE-NAME] Clear, concise description of the observed bug* (e.g., *[WALLET] Balance hold state fails to release after transaction cancellation*)
*   **Priority**: 
    *   [ ] **P0 (Urgent)**: Production outage, active security vulnerability, severe data loss, or locked ledger. Requires 24/7 remediation.
    *   [ ] **P1 (High)**: Core feature is broken (e.g., unable to lock escrows, login fails, cannot sign off on payments) with no workaround.
    *   [ ] **P2 (Medium)**: Non-blocking feature broken (e.g., chat message styling aligned incorrectly, user cannot change profile avatar), or workaround is available.
    *   [ ] **P3 (Low)**: Minor UI alignment glitch, typo, or minor performance latency under heavy load.
*   **Severity**:
    *   [ ] **S1 (Blocker)**: Complete system crash, unhandled loop, or data leak.
    *   [ ] **S2 (Critical)**: Major function fails to execute.
    *   [ ] **S3 (Major)**: Minor function fails, or major function has a straightforward workaround.
    *   [ ] **S4 (Minor)**: Visual, structural cosmetic flaws.

---

## 2. Environment Metrics

*   **Deployment URL**: `https://hfc-exchange.github.io/`
*   **Build Target**: Production (Main Branch) / Staging (Test Branch) / Local Emulator
*   **User Role**: Trader Client / Platform Admin / Anonymous Web Visitor
*   **Operating System**: macOS Sequoia v15.1 / Windows 11 / Android 14 / iOS 18
*   **Browser Version**: Google Chrome v125.0.x / Safari Mobile / Mozilla Firefox

---

## 3. Steps to Reproduce

1.  Log into a standard trader account on `/login.html`.
2.  Navigate to `/marketplace.html` and click "Start Deal" on any active USDT offer.
3.  Once inside `/deal-lock.html`, click the "Cancel Escrow Negotiation" action.
4.  Navigate back to `/wallet.html`.
5.  Observe the balances displayed in the wallet list.

---

## 4. Observed vs. Expected Outcomes

*   **Expected Result**: The locked USDT amount should be released from `holdBalance` and credited back to `availableBalance` instantly.
*   **Actual Result**: `holdBalance` remains elevated. Refreshing the browser does not clear the hold state, indicating that the status change did not sync with the Firestore transaction ledger.
*   **Console Errors**:
    ```logs
    Uncaught (in promise) FirebaseError: Missing or insufficient permissions.
    at Object.updateDoc (/js/utils.js:45:12)
    ```

---

## 5. Visual Attachments & Trace Logs

*   *Insert screenshots of the console exceptions, network failures, or layout anomalies here.*
*   *Insert file upload logs or ledger state dump exports.*
