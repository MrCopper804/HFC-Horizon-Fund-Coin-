# HFC Exchange - Production Post-Launch Monitoring Specification (POST_LAUNCH_MONITORING.md)
**Author:** Head of Production Support, Lead Systems Engineer & Security Operations Lead  
**Version:** 2.0.0  
**Status:** Approved for Core Execution  
**Execution Context**: Post-Launch Observability / Performance Auditing

This document outlines the monitoring strategies, metrics, dashboards, and automated alert parameters required to maintain optimal application performance, ledger accuracy, and transaction security for HFC Exchange.

---

## 1. Firebase Service Console Dashboards

Support and DevOps teams must actively monitor the Firebase Console across three primary domains:

### 1.1. Firebase Authentication Activity
*   **Active Users**: Track the volume of daily/hourly sign-ins to establish typical usage baselines.
*   **Verification Latency**: Monitor the time taken for newly registered nodes to complete email verification.
*   **Failure Rates**: Set alerts for high volumes of consecutive login failures, which could indicate credential-stuffing attacks.

### 1.2. Cloud Firestore Performance & Usage Metrics
*   **Operation Counts**: Track Reads, Writes, and Deletes. A sudden spike in Reads (e.g., exceeding 50,000 per minute) indicates an infinite loop in a client-side layout listener.
*   **Query Executions**: Track long-running queries or queries failing due to missing composite indexes.
*   **Active Connections**: Monitor the number of concurrent active connections. This helps track the number of active traders online at any given time.

### 1.3. Cloud Storage Bandwidth
*   **Download & Upload Quantities**: Track image upload rates for transaction screenshot verification.
*   **Asset Processing**: Monitor file upload sizes. If files average >10MB, implement client-side downscaling configurations in `/assets/js/deposit.js` to optimize storage usage and bandwidth.

---

## 2. Platform Financial Logs & Transaction Audits

The platform ledger must be monitored continuously to prevent fraud, liquidity shortages, or escrow lockouts.

```
                  ┌────────────────────────────────────────┐
                  │      Continuous Audit Checkpoints      │
                  └───────────────────┬────────────────────┘
                                      │
       ┌──────────────────────────────┼──────────────────────────────┐
       ▼                              ▼                              ▼
┌──────────────┐               ┌──────────────┐               ┌──────────────┐
│  Fiat Ledger │               │ Crypto Vault │               │ Escrow Gating│
│ PKR Deposits │               │ HFC Balance  │               │ Active Locks │
│ vs Approvals │               │ Total Supply │               │ holdBalance  │
└──────────────┘               └──────────────┘               └──────────────┘
```

### 2.1. Fiat Ledger Auditing
*   **Daily Reconciliation**: Confirm that the total PKR balance credited across all user wallets matches the verified incoming deposits processed by the finance team.
*   **Approval Response Time**: Monitor the time taken for a deposit to transition from "Pending Review" to "Approved" (target: <15 minutes).

### 2.2. Crypto Supply Auditing
*   **Total Supply Audit**: Ensure that the sum of available and hold balances for HFC across all user wallets never exceeds the initialized limit of `1000 HFC`.
*   **Direct Mutation Detection**: Query the Firestore `users` collection to check for any modifications that bypass transaction documents, triggering security alerts if unauthorized updates are found.

### 2.3. P2P Escrow Active Gating
*   **Hold Balance Check**: Confirm that `holdBalance` is only active for users with active trades.
*   **Dispute Frequency**: Monitor the volume of trades that require dispute resolution or support agent intervention.
*   **Trade Abandonment**: Identify trades that have been active for >2 hours without updates. Support agents should review these cases for potential trade deadlocks.

---

## 3. Browser-Level Performance & Error Logging

Because HFC Exchange runs client-side, real-time error tracking and client-side observability are critical for identifying edge cases and user-facing issues.

### 3.1. Client Exception Capture Engine
Unhandled browser exceptions are captured and transmitted to the `logs` collection in Firestore:

```javascript
// Browser Error Watcher Initializer
window.addEventListener('unhandledrejection', (event) => {
  const errorDetails = {
    message: event.reason ? event.reason.message : 'Unhandled Promise Rejection',
    stack: event.reason ? event.reason.stack : null,
    timestamp: new Date(),
    path: window.location.pathname
  };
  
  // Submit exception details to the security audit collection
  transmitProductionLog("promise_rejection", "warning", errorDetails);
});

function transmitProductionLog(category, severity, payload) {
  import('./firebase/firebase-config.js').then(({ db }) => {
    import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js').then(({ collection, addDoc }) => {
      addDoc(collection(db, "logs"), {
        category: category,
        severity: severity,
        payload: payload,
        timestamp: new Date()
      }).catch(err => console.warn("Log fallback fail:", err));
    });
  });
}
```

### 3.2. Performance Core Metrics (CWV Monitoring)
Support engineers should monitor Core Web Vitals on real user devices:
*   **LCP (Largest Contentful Paint)**: Must be <2.5 seconds. Optimize by preloading global stylesheets and using small vector images.
*   **FID (First Input Delay)**: Must be <100 milliseconds. Keep initial script loading lightweight to avoid locking the main thread.
*   **CLS (Cumulative Layout Shift)**: Must be <0.1. Ensure layout containers have explicit dimensions to prevent shifts as content loads.
