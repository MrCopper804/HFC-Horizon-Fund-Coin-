# HFC Exchange - Enterprise Quality Assurance & Testing Strategy Specification
**Author:** Director of Quality Assurance, Senior Test Architect & FinTech Compliance Auditor  
**Version:** 2.0.0  
**Status:** Approved for Core System Verification  
**Scope**: Zero-Trust End-to-End Ledger and Escrow System Validation

---

## 1. Executive Summary & Quality Gates

HFC Exchange operates as a serverless peer-to-peer (P2P) cryptocurrency escrow platform dealing directly with financial ledgers, wallets, and user cash balances. Due to the transactional nature of the application, there is **zero tolerance for data corruption, balance leakage, or double-spending**.

This Quality Assurance (QA) Specification defines our global testing methodology, test suites, environment configurations, and release quality gates. It acts as the operational master plan supporting the **Lighthouse 100% SEO / PWA / Accessibility goals**, and establishes a testing framework for our decentralized, client-secured architecture.

### 1.1. Core Quality Gates
Before any branch can be merged into `main` and compiled for GitHub Pages production:
1.  **Functional Gating**: 100% of P1/P2 test cases in `TEST_CASES.md` must pass with zero critical defects.
2.  **Security Gating**: Cross-role privilege checks must verify that standard nodes cannot read or write admin-restricted paths.
3.  **Lighthouse Audit Metrics**:
    *   **Performance**: 95+ (Verified via simulated throttled 3G networks).
    *   **Accessibility**: 100 (Full WCAG 2.1 AA Compliance).
    *   **Best Practices**: 100 (No console exceptions, strict HTTPS, secure libraries).
    *   **SEO**: 100 (Structured meta tags, canonical checks, zero broken links).
    *   **PWA**: 100 (Successful offline fallback redirect, manifest validation).

---

## 2. Test Environment Matrix & Tooling Strategy

### 2.1. Environment Configuration

| Aspect | Sandbox / Local Test | Staging / Pre-Release | Production (Main) |
| :--- | :--- | :--- | :--- |
| **Hosting** | Local Host (Vite `localhost:3000`) | GitHub Pages (Gated Preview Path) | GitHub Pages (Production Root Domain) |
| **Firebase** | Emulator Suite / Dev Project | `hfc-staging` Project | `hfc-production` Project |
| **Data State**| Simulated / Random Seeds | Copy of Prod (Sanitized) | Real Financial Ledger Records |
| **User Access**| Developers / Automation | Internal QA / Select Beta Nodes | Public Client Traders & Admin Staff |

---

## 3. Scope of Testing (SOT) Suite

Our testing scope spans several critical dimensions, mapped directly to the application architecture:

```
                          ┌─────────────────────────────┐
                          │   HFC Exchange Test Suites  │
                          └──────────────┬──────────────┘
                                         │
        ┌──────────────────┬─────────────┼─────────────┬──────────────────┐
        ▼                  ▼             ▼             ▼                  ▼
┌──────────────┐   ┌──────────────┐┌───────────┐ ┌──────────────┐   ┌──────────────┐
│  Functional  │   │   Financial  ││ Security  │ │ Performance  │   │  Responsive  │
│  User Flow   │   │  Escrow/Ledger││ & Access  │ │ & Local Sync │   │  & Browsers  │
└──────────────┘   └──────────────┘└───────────┘ └──────────────┘   └──────────────┘
```

### 3.1. Functional User Flow Testing
Validates standard trader workflows: register, log in, create a P2P offer, browse active marketplace cards, initiate negotiations, chat, and trigger notification triggers.

### 3.2. Financial Escrow & Ledger Testing
Validates the mathematical accuracy of the platform.
*   **Balance Lock Validation**: Creating an active deal must immediately deduct and transfer the cryptocurrency amount from the seller's `availableBalance` to `holdBalance`.
*   **Release Settle Verification**: Signing off a payment transaction must correctly transfer the locked cryptocurrency from the seller's `holdBalance` directly to the buyer's `availableBalance`.
*   **Fee Deductions & Revenue Audit**: Ensure that any structural transaction or withdrawal fees configured in the Admin Console are deducted accurately and credited to the system-owned revenue wallets.

### 3.3. Security & Access Testing
Ensures the platform is resilient against malicious actions.
*   **Role Validation Gating**: Verify that standard users attempting to directly access URLs like `/admin/dashboard.html` or `/admin/users.html` are blocked and returned to the client portal by `authGuard.js`.
*   **Negative Balance Prevention**: Input validations and Firestore security rules must block any transaction that results in a wallet balance drops below 0.
*   **Direct URL and Direct DB Queries**: Verify that unauthorized queries directly to Firestore collections bypass the rules and fail (e.g. standard user querying `/admin/` configurations or private folders).

### 3.4. Performance & Local Sync Testing
*   **Large Datasets Resilience**: Simulate rendering 10,000 active P2P offers. Verify that pagination (`limit()` and `startAfter()`) is used correctly to prevent DOM lockup and memory leaks.
*   **Offline Mode Transitions**: Simulating network disconnection must route navigations to `offline.html` correctly, and returning online must allow recovery without loss of data.

---

## 4. Regression Testing & Release Approval Gating

To prevent regressions in future releases, a strict automated and manual regression cycle must run on the Staging environment before production deployment.

### 4.1. The Regression Checklist Run
1.  **Verify Service Worker registration**: Confirm service worker cache names have been incremented correctly to force clients to update their cache.
2.  **Run full authentication pass**: Check registration, login, and redirection gates.
3.  **Perform peer-to-peer transaction**: Initiate an offer, start a deal, exchange chat messages, upload screenshots, and complete the escrow. Verify balances update correctly on both sides.
4.  **Admin portal sign-off**: Log in as an administrator, review user accounts, check logs, and process withdrawals.
5.  **Offline capability verify**: Go offline in developer tools, navigate, confirm offline.html behaves correctly, restore network, click retry button.
