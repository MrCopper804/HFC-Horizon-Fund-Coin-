# HFC Exchange Security Architecture & Compliance Document
## Enterprise Zero-Trust security guidelines for Client-Side Firebase Architecture

---

## 1. EXECUTIVE SUMMARY

HFC Exchange operates on a serverless, frontend-authoritative infrastructure utilizing Google Cloud Firebase (Authentication, Firestore, and Cloud Storage). 

Because there is no custom backend server or custom API gateway intermediate layer, all data integrity, state transitions, client interactions, and privilege levels are **strictly governed and validated at the database engine level** through:
1. **Firestore Security Rules (`firestore.rules`)**
2. **Firebase Storage Security Rules (`storage.rules`)**
3. **Structured Composite Database Indexes (`firestore.indexes.json`)**

This security document outlines the RBAC (Role-Based Access Control) matrix, the authorization and authentication flows, known design bounds of client-secured applications, and our standardized migration roadmap to **Google Cloud Functions v2** to establish a fully server-authoritative backend.

---

## 2. USER ROLES & ACCESS MATRIX

The HFC Exchange platform defines six key user roles, enabling granular operational isolation (Least Privilege Principle):

| Role | Access Level | Description |
| :--- | :--- | :--- |
| **`guest`** | Read Only (Public) | Unauthenticated visitor. Can view active Coin listings and public system settings. No other collection access. |
| **`user`** | Read & Write (Self) | Authenticated standard client. Can read own profile, manage own wallet configuration, initiate own P2P offers, chats, negotiations, and submit pending deposit/withdrawal requests. Cannot alter balances, other profiles, or historical logs. |
| **`admin`** | Full Read & Write | Administrative super-user. Holds master access across all collections and documents. Able to override, delete, adjust balances, and update settings. |
| **`moderator`** | Read & Write (Markets) | Future-Ready moderator role. Can manage coin lists, edit/archive marketplace offers, and access user directories. Cannot adjust wallets, balances, deposits, or withdrawals. |
| **`finance`** | Read & Write (Ledgers) | Future-Ready finance Auditor. Authoritative control over approval/rejection of deposits, withdrawals, and wallet balance adjustments. Cannot alter core settings, coin listing details, or negotiations. |
| **`support`** | Read & Write (Tickets) | Future-Ready helpdesk agent. Can view user profiles, check chat negotiations, examine locked deals, and review trade lists to resolve disputes. Cannot alter financial balances, deposits, or core configurations. |

---

## 3. FIRESTORE COLLECTION POLICIES

The standard rules defined in `firestore.rules` protect each collection against unauthorized client-side tampering:

### 3.1. `users`
*   **Create**: Allowed only if the authenticated client's UID matches the document ID, and the initial role is defaulted to `'user'` and status is `'active'`.
*   **Read**: Any authenticated user can read profiles (necessary for showing username/avatar inside trade lobbies).
*   **Update**: Allowed only for the profile owner. Security rules **strictly forbid** updating `uid`, `email`, `createdAt`, `role` (to prevent privilege escalation), or `status` (to prevent self-unsuspension).
*   **Delete**: Restricted strictly to `admin` role.

### 3.2. `wallets`
*   **Create**: Standard users can initialize their own wallet with a balance strictly set to `0`.
*   **Read**: Restricted to wallet owners, `admin`, `finance`, and `support` roles.
*   **Update**: Standard users can update secondary configurations (e.g., payout address) but are **strictly blocked from modifying the `balance` field**. Wallet balance updates are restricted entirely to `admin` and `finance` roles.
*   **Delete**: Restricted strictly to `admin` role.

### 3.3. `walletTransactions` & `transactions`
*   **Create**: Standard users can append transaction records corresponding to their own actions.
*   **Read**: Restricted to transaction owner, `admin`, `finance`, and `support` roles.
*   **Update / Delete**: **Denied Globally (`if false`)**. Once a transaction record is published, it remains immutable to prevent history falsification.

### 3.4. `coins`
*   **Read**: Publicly readable by all visitors (`guest` or `user`).
*   **Create / Update**: Restricted to `admin` and `moderator` roles.
*   **Delete**: Restricted strictly to `admin` role.

### 3.5. `offers` (P2P Listings)
*   **Create**: Allowed for any authenticated user. Status must start as `'active'`.
*   **Read**: Allowed for any authenticated user to view the offer book.
*   **Update**: Allowed only for the offer owner, `admin`, or `moderator`. The owner **cannot edit** the offer if the current status is no longer `'active'` (i.e. locked, completed, or cancelled).
*   **Delete**: Restricted to `admin` or the offer owner if it remains in `'active'` state.

### 3.6. `negotiations` (Direct Chat Lobbies)
*   **Read / Write**: Restricted strictly to the designated `buyerId`, `sellerId`, `admin`, or `support` roles.
*   **Update**: Fields `buyerId`, `sellerId`, and `createdAt` must remain unchanged.

### 3.7. `lockedDeals`
*   **Read / Write**: Restricted strictly to the designated `buyerId`, `sellerId`, `admin`, `support`, or `finance` roles.

### 3.8. `trades`
*   **Read**: Limited to designated participants (`buyerId` or `sellerId`), `admin`, `support`, or `finance` roles.
*   **Create / Update**: Allowed for participants to progress the trade, or for admins to settle disputes.

### 3.9. `deposits` & `withdrawals`
*   **Create**: Allowed for standard users to submit requests. The initial state must strictly be `'pending'`.
*   **Read**: Restricted to request owner, `admin`, `finance`, and `support`.
*   **Update**: Standard users can only transition their own requests from `'pending'` to `'cancelled'`. Transition to `'approved'` or `'rejected'` is restricted strictly to `admin` and `finance` roles.
*   **Delete**: Restricted strictly to `admin` role.

### 3.10. `notifications`
*   **Read**: Allowed only for the notification's target recipient (`userId`/`userUid`) or `admin`.
*   **Create**: Restricted to `admin`, `support`, or `moderator` roles.
*   **Update**: Recipient can only update the `isRead`/`read` field to mark notifications.
*   **Delete**: Allowed for recipient or `admin`.

### 3.11. `settings`
*   **Read**: Publicly readable.
*   **Write**: Restricted strictly to `admin` role.

### 3.12. `logs` (Security Trail)
*   **Read**: Restricted strictly to `admin` and `support` roles.
*   **Create**: Allowed for any signed-in client (required to log audit events in frontend-only architecture).
*   **Update / Delete**: **Denied Globally (`if false`)**. All published security logs are immutable and tamper-proof.

---

## 4. STORAGE SECURITY POLICIES

The `storage.rules` governs file uploads to prevent resource abuse, malicious content injections, or cross-tenant data leaks:

1.  **Ownership Verification**: Users can only upload files into paths corresponding to their UID (e.g. `/profile_images/{userId}/` or `/deposits/{userId}/`).
2.  **MIME Type Enforcement**: Only allowed image types (`image/png`, `image/jpeg`, `image/webp` and SVG for coins) are permitted.
3.  **Strict File Size Validation**:
    *   **Profile Images**: Limited to **5MB**.
    *   **Payment Receipts / Screenshots**: Limited to **10MB**.
    *   **Coin Icons**: Limited to **2MB**.
4.  **Admin Directory Access**: Only `admin` or specified helper roles can write to common directory targets (e.g. `/coins/`).

---

## 5. AUTHENTICATION & AUTHORIZATION FLOW

```
[Guest Client]
      │
      ▼
[Sign In / Registration via Firebase Auth]
      │
      ▼
[Standard Session Token Generated]
      │
      ├──────► [Query /users/{uid} Document to fetch User Role]
      │                     │
      ▼                     ▼
[Storage rules / Firestore rules evaluate token and Role on every query]
      │                     │
      ├─► if userRole == 'admin'   ──► Allow privileged administrative overrides
      ├─► if userRole == 'finance' ──► Allow deposit approvals & manual balance edits
      └─► if userRole == 'user'    ──► Allow self-managed CRUD operations
```

---

## 6. FRONTEND-ONLY ARCHITECTURE LIMITATIONS

Securing an enterprise financial application purely using Firestore Security Rules has inherent architectural limits:

1.  **Lack of Multi-Document Atomic Validation**:
    *   While Firestore supports multi-document reads inside rules using `get()` and `exists()`, client-side writes affecting multiple collections (e.g. transferring balances between standard users) cannot be guaranteed to be fully atomic or checked comprehensively inside rules alone.
2.  **Exposed Business Logic**:
    *   Since trade execution rules and fee rates reside in front-end JavaScript files, malicious clients could theoretical modify their local client code. Even though **Firestore rules protect the database from saving malicious mutations**, the user-experience can degrade.
3.  **Third-Party API Secrets**:
    *   Without a backend, integrating external banking rails, coin trackers, or SMS gateways forces credentials onto the client, raising extraction risks (mitigated by setting up proxy APIs).

---

## 7. MIGRATION ROADMAP TO GOOGLE CLOUD FUNCTIONS

To transition HFC Exchange to a zero-trust, server-authoritative enterprise platform, follow this Google Cloud Functions migration path:

### Step 1: Restrict Client Writes
Deploy new firestore rules that block direct client writes on critical operations:
```javascript
match /wallets/{walletId} {
  allow write: if false; // Deny direct client mutations entirely!
}
```

### Step 2: Implement Callable HTTPS Functions
Move core transaction workflows into Firebase Cloud Functions:
*   `requestDeposit(amount, currency)`: Validates payment parameters and appends a secure pending record.
*   `approveDeposit(depositId)`: Privileged function verifying bank ledger and writing securely to the user's `wallets` balance.
*   `executeTrade(offerId, amount)`: Performs safe lock, verify, transfer, and transaction log writes atomically inside a single Cloud Firestore transactional container.

### Step 3: Example Server-Side Transaction Code
```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const executeTrade = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const db = getFirestore();
  const { offerId, amount } = request.data;

  return db.runTransaction(async (transaction) => {
    const offerRef = db.collection("offers").doc(offerId);
    const offerSnap = await transaction.get(offerRef);

    if (!offerSnap.exists || offerSnap.data()?.status !== "active") {
      throw new HttpsError("failed-precondition", "Offer is no longer active.");
    }

    // Execute atomic balance mutations and log transfers on server-side...
    return { success: true, timestamp: new Date().toISOString() };
  });
});
```
