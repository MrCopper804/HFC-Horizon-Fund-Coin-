# HFC Exchange - User Acceptance Testing (UAT) Checklist
**Author:** Lead QA Architect, Senior Product Owner & Operations Integrity Lead  
**Version:** 2.0.0  
**Status:** Approved for Business Stakeholder Sign-off

This User Acceptance Testing (UAT) Checklist defines the criteria that must be verified by business stakeholders, administrative operators, finance personnel, and support agents before HFC Exchange can be cleared for production launch on GitHub Pages.

---

## 1. End User Acceptance Checklist (P2P Traders)

Traders require a frictionless, secure, and intuitive interface that safeguards their cryptocurrency assets during peer-to-peer exchanges.

*   [ ] **Onboarding & Registration**: Traders can register using their email addresses, verify account configurations, and complete sign-in.
*   [ ] **Wallet Console**: Confirm that wallet balances update automatically following trades, and that the "hold" balance correctly isolates funds in active negotiations.
*   [ ] **PKR Deposits**: Verify that users can initiate bank transfers or mobile wallet (Easypaisa/JazzCash) deposits and upload proof of payment.
*   [ ] **Marketplace Navigation**: Ensure users can filter offers by coin, type (Buy/Sell), and payment method.
*   [ ] **P2P Escrow Negotiations**:
    *   [ ] Click "Start Deal" to lock the seller's assets inside the secure escrow.
    *   [ ] Exchange real-time chat messages and upload receipts in the deal room.
    *   [ ] Complete the trade via a multi-sig workflow, updating available balances for both parties.
*   [ ] **PWA Offline Mode**: Verify that if a trader loses internet connection, a clean offline card is displayed and their unsaved changes are preserved.

---

## 2. Platform Operator & Admin Acceptance Checklist

System administrators manage user access, verify KYC documents, audit operations, and configure platform settings.

*   [ ] **Secure Gatekeeper Access**: Verify that only authorized admin staff can access the administrative dashboard.
*   [ ] **User Registry & Verification**: Confirm administrators can review user profiles, update verified statuses, and manually modify wallet balances.
*   [ ] **Coin Configuration Dashboard**: Confirm administrators can configure active cryptocurrencies, set transaction fees, and update min/max deposit limits.
*   [ ] **System Health & Logs**: Verify that operational audits and exceptions are compiled and searchable inside `/admin/audit-logs.html`.

---

## 3. Financial & Treasury Staff Acceptance Checklist

The finance team manages the fiat PKR ledger, approves deposits, and executes crypto releases from the cold-vault queue.

*   [ ] **Pending Deposit Processing**: Finance staff can review submitted deposit screenshot receipts, verify incoming cash, and click "Approve" to credit the user's wallet.
*   [ ] **Withdrawal Queue Approvals**:
    *   [ ] Confirm withdrawal requests are queue-managed inside `/admin/withdrawals.html`.
    *   [ ] Verify the system blocks over-draft or double-spending requests.
    *   [ ] Verify that after processing a cold-vault withdrawal, the user's locked balances are permanently deducted.
*   [ ] **Platform Revenue Tracking**: Verify system-deducted transaction fees are accurately calculated and accumulated in the corporate revenue vaults.

---

## 4. Customer Support & Dispute Agents Acceptance Checklist

Dispute agents monitor ongoing transactions and intervene to resolve trade disputes or escrow deadlocks.

*   [ ] **Active Trade Monitoring**: Support staff can view active escalations and access transaction chats.
*   [ ] **Dispute Resolution Triggers**: Support agents can intervene in a deadlocked trade and resolve the dispute by releasing the escrowed funds to either the buyer or the seller.
*   [ ] **Account Audits**: Support agents can search user trade histories to investigate fraudulent activity or address complaints.

---

## 5. Stakeholder Operational Sign-off

This signature sheet formally approves the deployment of the current release version of HFC Exchange:

```
Release Version: v2.0.0
Build Commit Hash: [COMMIT_HASH]

Authorized Business Sponsor Sign-off:
Signature: __________________________   Date: _______________

Authorized QA Director Sign-off:
Signature: __________________________   Date: _______________

Authorized Lead Architect Sign-off:
Signature: __________________________   Date: _______________
```
