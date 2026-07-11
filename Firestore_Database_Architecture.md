# HFC Exchange - Firestore Database Architecture Specification
**Author:** Lead Backend & Firebase Architect  
**Version:** 1.0.0  
**Status:** Approved for Production  
**Target Scale:** 100,000+ Active Users, Unlimited Listed Cryptocurrencies, Real-time P2P Escrow Negotiations

---

## 1. Architectural Overview

HFC Exchange operates on a serverless, real-time, event-driven ledger model. The backend architecture leverages **Firebase Authentication** for identity management and user sessions, **Cloud Firestore** for flexible, highly available, low-latency document storage, and **Cloud Storage** for transactional artifacts (e.g., proof-of-payment screenshots).

To support **100,000+ active users** with high write concurrency, complex order matching, and real-time P2P negotiations, our database schema adheres to the following principles:
- **Normalized Sub-collections vs. Root Collections:** High-throughput transactional data (e.g., `negotiations`, `trades`, `lockedDeals`) is organized as top-level root collections to prevent Firestore document size limitations (1MB max per document) and ensure query flexibility across all nodes.
- **Idempotent State Machines:** Transactions, deposits, and withdrawals follow a strict, uni-directional state machine (`pending` ➔ `completed` / `failed` / `cancelled`) backed by transactional safety guidelines (atomic batches and transactions).
- **Auditability and Compliance:** Every balance movement results in a read-only, immutable `transactions` document, ensuring an audit trail that can be verified against cold storage states.
- **Future-Proof for Cloud Functions & Mobile:** Every schema uses server-assigned values (`serverTimestamp()`), standard data types, and specific triggers for future push notifications, live analytics, and automated escrow expiry loops.

---

## 2. Database Collections Schema Specification

This section documents the 13 required collections, their document schemas, types, requirements, index recommendations, and relationships.

---

### 2.1. `users` (Root Collection)
* **Purpose:** Stores core user profile, identity verification (KYC), account roles, node status, and notification preferences.
* **Relationships:**
  - `uid` maps 1:1 with Firebase Auth UID.
  - Parent to `wallets` (if modeled as sub-collection, though kept as root with `ownerId` reference for multi-wallet operations).
* **Document ID format:** `{userId}` (Maps directly to Firebase Auth `uid`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `uid` | String | Yes | Unique Firebase Authentication user ID. |
| `fullName` | String | Yes | User's full legal name. |
| `username` | String | Yes | Unique handle (e.g., `lahore_node_88`). |
| `email` | String | Yes | User's verified email address. |
| `phone` | String | Yes | User's verified phone number. |
| `role` | String | Yes | Access control role: `user`, `operator`, `moderator`, `admin`. |
| `status` | String | Yes | Account state: `pending_kyc`, `verified`, `suspended`. |
| `profileImage` | String | No | URL of the profile picture hosted on Firebase Storage. |
| `createdAt` | Timestamp | Yes | Server timestamp of user registration. |
| `lastLogin` | Timestamp | Yes | Server timestamp of last session authorization. |
| `preferences` | Map | Yes | Settings map (e.g., `theme`, `mfaEnabled`, `notifications`). |

#### JSON Representation:
```json
{
  "uid": "u8H2kP9s1LmN3b5v7c9x",
  "fullName": "Muhammad Asif",
  "username": "asif_trader_pkr",
  "email": "asif@hfc-exchange.com",
  "phone": "+923001234567",
  "role": "user",
  "status": "verified",
  "profileImage": "https://firebasestorage.googleapis.com/.../profiles/u8H2kP9s1.png",
  "createdAt": "2026-07-10T08:10:00Z",
  "lastLogin": "2026-07-10T08:25:00Z",
  "preferences": {
    "theme": "dark",
    "mfaEnabled": true,
    "emailNotifications": true,
    "pushNotifications": false
  }
}
```

---

### 2.2. `wallets` (Root Collection)
* **Purpose:** Stores financial balances for each currency asset per user.
* **Relationships:**
  - Linked to `users` collection via `ownerId`.
  - Linked to `coins` collection via `currency` (matching coin symbol).
* **Document ID format:** `{ownerId}_{currency}` (Composite ID enforces uniqueness per asset per user).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `walletId` | String | Yes | Format: `{ownerId}_{currency}`. |
| `ownerId` | String | Yes | UID of the wallet owner. |
| `currency` | String | Yes | Coin symbol identifier (e.g., `BTC`, `HFC`, `PKR`). |
| `symbol` | String | Yes | Visual symbol prefix or suffix (e.g., `฿`, `₨`). |
| `availableBalance` | Number (Double) | Yes | Balance available for direct trades or withdrawals. |
| `holdBalance` | Number (Double) | Yes | Funds temporarily locked in active negotiations/escrows. |
| `address` | String | Yes | Public key / deposit address of the node wallet. |
| `updatedAt` | Timestamp | Yes | Server timestamp of the last balance adjustment. |

#### JSON Representation:
```json
{
  "walletId": "u8H2kP9s1LmN3b5v7c9x_BTC",
  "ownerId": "u8H2kP9s1LmN3b5v7c9x",
  "currency": "BTC",
  "symbol": "BTC",
  "availableBalance": 0.450000,
  "holdBalance": 0.050000,
  "address": "bc1q3s9f8g7h6j5k4l3m2n1p0q",
  "updatedAt": "2026-07-10T08:15:30Z"
}
```

---

### 2.3. `coins` (Root Collection)
* **Purpose:** Defines the available cryptocurrencies listed on the exchange platform.
* **Relationships:**
  - Used dynamically by `wallets`, `offers`, and `trades` to validate supported assets.
* **Document ID format:** `{symbol}` (e.g., `BTC`, `ETH`, `HFC`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `coinId` | String | Yes | Lowercase unique symbol key (e.g., `hfc`). |
| `name` | String | Yes | Coin display name (e.g., `HFC Coin`). |
| `symbol` | String | Yes | Uppercase ticker (e.g., `HFC`). |
| `logo` | String | Yes | SVG/PNG path for rendering the asset icon. |
| `description` | String | No | Details of the cryptographic utility. |
| `totalSupply` | Number | Yes | Absolute minted cap. |
| `circulatingSupply` | Number | Yes | Actively floating supply. |
| `ownerUid` | String | No | UID of the issuing company/project entity. |
| `status` | String | Yes | Operating state: `active`, `suspended`, `maintenance`. |
| `createdAt` | Timestamp | Yes | Time when the asset was listed on HFC. |

#### JSON Representation:
```json
{
  "coinId": "hfc",
  "name": "HFC Coin",
  "symbol": "HFC",
  "logo": "/images/coins/hfc.png",
  "description": "Native peer-to-peer liquidity and utility gas token.",
  "totalSupply": 100000000,
  "circulatingSupply": 45000000,
  "ownerUid": "admin_hfc_exchange_co",
  "status": "active",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

---

### 2.4. `offers` (Root Collection)
* **Purpose:** Represents the active P2P marketplace order book where users publish intents to buy or sell.
* **Relationships:**
  - Linked to `users` via `creatorUid`.
  - Linked to `coins` via `coinSymbol`.
* **Document ID format:** Auto-generated UUID (`{offerId}`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `offerId` | String | Yes | Auto-generated document ID. |
| `type` | String | Yes | Order direction: `buy` or `sell`. |
| `coinSymbol` | String | Yes | Crypto asset being traded (e.g., `USDT`). |
| `pricePKR` | Number (Double) | Yes | Settlement price per unit in Pakistani Rupees (PKR). |
| `quantity` | Number (Double) | Yes | Total order quantity created. |
| `remainingQuantity` | Number (Double) | Yes | Remaining unfilled quantity available for trades. |
| `creatorUid` | String | Yes | UID of the user who published the offer. |
| `status` | String | Yes | State: `active`, `partially_filled`, `filled`, `cancelled`, `expired`. |
| `expiresAt` | Timestamp | Yes | Time when the offer is automatically removed from active order book. |
| `createdAt` | Timestamp | Yes | Server timestamp of offer creation. |

#### JSON Representation:
```json
{
  "offerId": "off_9xK2mP4s8R",
  "type": "sell",
  "coinSymbol": "USDT",
  "pricePKR": 278.45,
  "quantity": 5000.00,
  "remainingQuantity": 3500.00,
  "creatorUid": "u8H2kP9s1LmN3b5v7c9x",
  "status": "partially_filled",
  "expiresAt": "2026-07-15T08:10:00Z",
  "createdAt": "2026-07-10T08:10:00Z"
}
```

---

### 2.5. `negotiations` (Root Collection)
* **Purpose:** A dedicated, real-time negotiation lobby initiated when a peer clicks "Trade Now" on a marketplace offer. Supporst active counter-offers and multi-party chat.
* **Relationships:**
  - Linked to `offers` via `offerId`.
  - Linked to `users` as `buyerUid` and `sellerUid`.
* **Document ID format:** Auto-generated UUID (`{negotiationId}`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `negotiationId` | String | Yes | Auto-generated document ID. |
| `offerId` | String | Yes | Target Marketplace Offer ID. |
| `buyerUid` | String | Yes | UID of the buying peer node. |
| `sellerUid` | String | Yes | UID of the selling peer node. |
| `currentPrice` | Number (Double) | Yes | Latest proposed negotiation price in PKR. |
| `quantity` | Number (Double) | Yes | Target asset quantity under negotiation. |
| `status` | String | Yes | State: `negotiating`, `accepted`, `rejected`, `locked`, `expired`. |
| `messages` | Array (Maps) | Yes | Real-time chat messages array (structured for low-overhead read/write). |
| `createdAt` | Timestamp | Yes | When the trade negotiation channel was opened. |
| `updatedAt` | Timestamp | Yes | Timestamp of the last counter-offer, status change, or message. |

#### Message Map Structure inside `messages` Array:
- `messageId` (String)
- `senderUid` (String)
- `text` (String)
- `type` (String) - `chat`, `counter_offer`, `system`
- `timestamp` (Timestamp)
- `proposalData` (Map, Optional) - Details of counter-offers (`pricePKR`, `quantity`).

#### JSON Representation:
```json
{
  "negotiationId": "neg_5tY3mK8s2P",
  "offerId": "off_9xK2mP4s8R",
  "buyerUid": "buyer_node_uid_44",
  "sellerUid": "u8H2kP9s1LmN3b5v7c9x",
  "currentPrice": 277.50,
  "quantity": 1500.00,
  "status": "negotiating",
  "messages": [
    {
      "messageId": "msg_001",
      "senderUid": "buyer_node_uid_44",
      "text": "Can you do 277 PKR per USDT for 1500 USDT?",
      "type": "counter_offer",
      "timestamp": "2026-07-10T08:12:00Z",
      "proposalData": {
        "pricePKR": 277.00,
        "quantity": 1500.00
      }
    },
    {
      "messageId": "msg_002",
      "senderUid": "u8H2kP9s1LmN3b5v7c9x",
      "text": "Meet me in the middle at 277.50, and I will lock escrow immediately.",
      "type": "counter_offer",
      "timestamp": "2026-07-10T08:14:15Z",
      "proposalData": {
        "pricePKR": 277.50,
        "quantity": 1500.00
      }
    }
  ],
  "createdAt": "2026-07-10T08:11:00Z",
  "updatedAt": "2026-07-10T08:14:15Z"
}
```

---

### 2.6. `lockedDeals` (Root Collection)
* **Purpose:** Represents active escrow holds where assets are mathematically locked in HFC platform's virtual contract vault, preventing unilateral withdrawals during fiat bank transfers.
* **Relationships:**
  - Spawns from a successful `negotiations` or `offers` agreement.
  - Generates a finalized `trades` block upon successful completion.
* **Document ID format:** Auto-generated UUID (`{dealId}`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `dealId` | String | Yes | Auto-generated escrow lock ID. |
| `offerId` | String | Yes | Source marketplace offer. |
| `buyerUid` | String | Yes | Buying peer (who pays PKR fiat). |
| `sellerUid` | String | Yes | Selling peer (whose crypto is locked in escrow). |
| `lockedAmount` | Number (Double) | Yes | Equivalent PKR escrow value. |
| `lockedCoins` | Number (Double) | Yes | Exact cryptocurrency units locked. |
| `coinSymbol` | String | Yes | Ticker of locked coin (e.g., `USDT`). |
| `expiresAt` | Timestamp | Yes | Auto-expiry time (usually 30 minutes) before escrow automatically cancels. |
| `status` | String | Yes | State: `escrow_locked`, `pkr_paid`, `disputed`, `released`, `cancelled`. |
| `createdAt` | Timestamp | Yes | Time when assets moved into escrow. |

#### JSON Representation:
```json
{
  "dealId": "deal_3pL2mN9k5S",
  "offerId": "off_9xK2mP4s8R",
  "buyerUid": "buyer_node_uid_44",
  "sellerUid": "u8H2kP9s1LmN3b5v7c9x",
  "lockedAmount": 416250.00,
  "lockedCoins": 1500.00,
  "coinSymbol": "USDT",
  "expiresAt": "2026-07-10T08:45:00Z",
  "status": "escrow_locked",
  "createdAt": "2026-07-10T08:15:00Z"
}
```

---

### 2.7. `trades` (Root Collection)
* **Purpose:** Stores the finalized transactional records of filled P2P escrows for reporting, user trading volumes, and history logs.
* **Relationships:**
  - Formed from completed `lockedDeals`.
  - Contributes directly to the public ticker stats.
* **Document ID format:** Auto-generated UUID (`{tradeId}`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `tradeId` | String | Yes | Auto-generated trade record ID. |
| `dealId` | String | Yes | Reference to originating locked escrow deal. |
| `buyerUid` | String | Yes | Buyer user ID. |
| `sellerUid` | String | Yes | Seller user ID. |
| `coin` | String | Yes | Target asset (e.g., `USDT`). |
| `price` | Number (Double) | Yes | Settlement price per unit in PKR. |
| `quantity` | Number (Double) | Yes | Quantity exchanged. |
| `buyerFee` | Number (Double) | Yes | Trade matching fee charged to buyer (0.1% baseline). |
| `sellerFee` | Number (Double) | Yes | Trade matching fee charged to seller (0.1% baseline). |
| `total` | Number (Double) | Yes | Combined total in PKR settled. |
| `status` | String | Yes | Final state: `success`, `disputed_refunded`. |
| `completedAt` | Timestamp | Yes | Server timestamp of escrow release. |

#### JSON Representation:
```json
{
  "tradeId": "trade_7mR5vP1s3X",
  "dealId": "deal_3pL2mN9k5S",
  "buyerUid": "buyer_node_uid_44",
  "sellerUid": "u8H2kP9s1LmN3b5v7c9x",
  "coin": "USDT",
  "price": 277.50,
  "quantity": 1500.00,
  "buyerFee": 1.50,
  "sellerFee": 1.50,
  "total": 416250.00,
  "status": "success",
  "completedAt": "2026-07-10T08:24:12Z"
}
```

---

### 2.8. `transactions` (Root Collection)
* **Purpose:** Core cryptographic ledger auditing system. Every balance change in any user wallet MUST produce a read-only document here.
* **Relationships:**
  - Linked to `users` via `userId`.
* **Document ID format:** Auto-generated UUID with prefix `tx_` (`tx_{timestamp}_{uuid}`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `txId` | String | Yes | Unique immutable ledger transaction ID. |
| `userId` | String | Yes | Target user node ID. |
| `type` | String | Yes | Category: `deposit`, `withdrawal`, `trade_buy`, `trade_sell`, `fee`, `adjustment`. |
| `amount` | Number (Double) | Yes | Balance delta value. |
| `currency` | String | Yes | Currency ticker affected. |
| `status` | String | Yes | Verification status: `pending`, `completed`, `failed`. |
| `txHash` | String | Yes | Cryptographic hash representing the transaction signatures. |
| `createdAt` | Timestamp | Yes | Server timestamp of ledger creation. |

#### JSON Representation:
```json
{
  "txId": "tx_1762749301_8s2p",
  "userId": "u8H2kP9s1LmN3b5v7c9x",
  "type": "trade_sell",
  "amount": -1500.00,
  "currency": "USDT",
  "status": "completed",
  "txHash": "0x4e7b8a1c90dfd31b098276f5de997235a92a11b0",
  "createdAt": "2026-07-10T08:24:12Z"
}
```

---

### 2.9. `deposits` (Root Collection)
* **Purpose:** Logs users' fiat PKR and on-chain crypto bank deposits. Evaluated by Admin Nodes.
* **Relationships:**
  - Linked to `users` via `userId`.
* **Document ID format:** Auto-generated UUID (`dep_{id}`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `depositId` | String | Yes | Unique deposit tracking ID. |
| `userId` | String | Yes | User node UID. |
| `amount` | Number (Double) | Yes | Total value declared. |
| `currency` | String | Yes | Asset ticker (e.g., `PKR`). |
| `method` | String | Yes | Channel: `bank_transfer`, `easypaisa`, `onchain_wallet`. |
| `transactionId` | String | Yes | Bank reference / transaction identifier. |
| `screenshotUrl` | String | No | Image link of the receipt uploaded to Firebase Storage. |
| `status` | String | Yes | State: `pending`, `approved`, `rejected`. |
| `adminUid` | String | No | UID of the staff node confirming the transaction. |
| `createdAt` | Timestamp | Yes | Time when user uploaded the proof. |
| `processedAt` | Timestamp | No | Time of administrative validation. |

#### JSON Representation:
```json
{
  "depositId": "dep_4rM7pB2s1N",
  "userId": "u8H2kP9s1LmN3b5v7c9x",
  "amount": 250000.00,
  "currency": "PKR",
  "method": "bank_transfer",
  "transactionId": "FT-20260710-8849201",
  "screenshotUrl": "https://firebasestorage.googleapis.com/.../receipts/dep_4rM7pB2s1N.jpg",
  "status": "approved",
  "adminUid": "admin_audit_officer_01",
  "createdAt": "2026-07-10T08:01:00Z",
  "processedAt": "2026-07-10T08:05:00Z"
}
```

---

### 2.10. `withdrawals` (Root Collection)
* **Purpose:** Logs outbox cashout queues (PKR or crypto withdrawal targets).
* **Relationships:**
  - Linked to `users` via `userId`.
* **Document ID format:** Auto-generated UUID (`wit_{id}`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `withdrawalId` | String | Yes | Unique withdrawal tracking ID. |
| `userId` | String | Yes | User node UID. |
| `amount` | Number (Double) | Yes | Quantity requested to cash out. |
| `currency` | String | Yes | Asset ticker. |
| `method` | String | Yes | Destination channel (e.g., `hbl_bank`, `onchain_address`). |
| `accountDetails` | Map | Yes | Destination attributes (e.g., `iban`, `bankName`, `cryptoAddr`). |
| `fee` | Number (Double) | Yes | Deducted platform gas fee. |
| `status` | String | Yes | State: `pending`, `processing`, `dispatched`, `rejected`. |
| `adminUid` | String | No | UID of staff authorizer who authorized the payout. |
| `createdAt` | Timestamp | Yes | Request initiation time. |
| `processedAt` | Timestamp | No | Dispatch completion time. |

#### JSON Representation:
```json
{
  "withdrawalId": "wit_2yK9s1N3mL",
  "userId": "u8H2kP9s1LmN3b5v7c9x",
  "amount": 50000.00,
  "currency": "PKR",
  "method": "bank_transfer",
  "accountDetails": {
    "bankName": "Habib Bank Limited",
    "accountTitle": "Muhammad Asif",
    "iban": "PK21HABB00001234567890"
  },
  "fee": 50.00,
  "status": "pending",
  "adminUid": null,
  "createdAt": "2026-07-10T08:21:00Z",
  "processedAt": null
}
```

---

### 2.11. `notifications` (Root Collection)
* **Purpose:** Real-time client-side event updates, system alerts, and negotiation triggers.
* **Relationships:**
  - Linked to `users` via `userUid`.
* **Document ID format:** Auto-generated UUID (`not_{id}`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `notificationId` | String | Yes | Document identifier. |
| `userUid` | String | Yes | Recipient user UID. |
| `title` | String | Yes | Display header. |
| `message` | String | Yes | Dynamic message body. |
| `type` | String | Yes | Level: `info`, `success`, `warning`, `danger`, `negotiation`. |
| `readStatus` | Boolean | Yes | Flag for read status tracker. |
| `actionLink` | String | No | Path redirection target (e.g., `/negotiation.html?id=neg_5tY3mK`). |
| `createdAt` | Timestamp | Yes | Time of issuance. |

#### JSON Representation:
```json
{
  "notificationId": "not_1s2p9k3mLn",
  "userUid": "u8H2kP9s1LmN3b5v7c9x",
  "title": "Escrow Secured Successfully",
  "message": "Your sell offer of 1500 USDT has been locked in virtual escrow. Verify PKR receipt.",
  "type": "negotiation",
  "readStatus": false,
  "actionLink": "negotiation.html?id=neg_5tY3mK8s2P",
  "createdAt": "2026-07-10T08:15:05Z"
}
```

---

### 2.12. `settings` (Root Collection)
* **Purpose:** Global environment configurations, operating variables, network constraints, and dynamic fees.
* **Relationships:** Key-value structure. No relational attributes.
* **Document ID format:** Unified config keys (e.g., `exchange_config`).

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `tradingFeePercent` | Number (Double) | Yes | Escrow trade platform fee percentage (e.g., `0.1`). |
| `withdrawalFeePKR` | Number (Double) | Yes | Flat charge for cashouts in PKR. |
| `supportedCoins` | Array (Strings) | Yes | Symbols permitted for listing. |
| `maintenanceMode` | Boolean | Yes | Emergency switch toggling trading access. |
| `minTradeLimitPKR` | Number | Yes | Base currency floor for opening P2P orders. |
| `lastUpdatedBy` | String | Yes | Admin UID who applied configuration changes. |
| `updatedAt` | Timestamp | Yes | Last edit timestamp. |

#### JSON Representation:
```json
{
  "tradingFeePercent": 0.10,
  "withdrawalFeePKR": 50.00,
  "supportedCoins": ["HFC", "BTC", "ETH", "USDT", "SOL"],
  "maintenanceMode": false,
  "minTradeLimitPKR": 5000,
  "lastUpdatedBy": "admin_sys_infrastructure",
  "updatedAt": "2026-07-01T12:00:00Z"
}
```

---

### 2.13. `logs` (Root Collection)
* **Purpose:** Cryptographic audit trail logging for security operations, administrative actions, and critical failure events.
* **Relationships:**
  - Map variables dynamically. Holds reference to triggering user/admin.
* **Document ID format:** Standard auto-generated UUID with temporal sort prefix.

#### Schema Fields:
| Field Name | Data Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `logId` | String | Yes | Unique event ID. |
| `category` | String | Yes | Level: `security`, `admin_action`, `system_exception`. |
| `severity` | String | Yes | Priority: `low`, `medium`, `high`, `critical`. |
| `actorId` | String | Yes | Triggering identity (Admin, User, or System process). |
| `action` | String | Yes | Specific action verb (e.g., `user_suspended`, `config_modified`). |
| `ipAddress` | String | Yes | Source network address. |
| `details` | Map | Yes | Dynamic dictionary with debugging details. |
| `timestamp` | Timestamp | Yes | Server timestamp of the logged action. |

#### JSON Representation:
```json
{
  "logId": "log_20260710_x92s8k",
  "category": "security",
  "severity": "critical",
  "actorId": "admin_compliance_audit_02",
  "action": "user_suspended",
  "ipAddress": "110.33.14.82",
  "details": {
    "targetUserId": "suspicious_trader_uid_99",
    "reason": "Repeated dispute creation and fake bank transfer proof submissions.",
    "mfaEnforced": true
  },
  "timestamp": "2026-07-10T08:24:12Z"
}
```

---

## 3. Recommended Firestore Security Rules (`firestore.rules`)

To enforce strict role-based access control, transaction non-repudiation, and field validation across all 13 collections, implement the following declarative rules.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Global helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    
    function isAdmin() {
      return isAuthenticated() && 
        resource.data.role == 'admin' || getUserData().role == 'admin';
    }

    // 1. Users Rule
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow create: if isOwner(userId) && request.resource.data.role == 'user';
      allow update: if isOwner(userId) && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['role', 'uid'])) || isAdmin();
      allow delete: if isAdmin();
    }

    // 2. Wallets Rule
    match /wallets/{walletId} {
      allow read: if isAuthenticated() && (resource.data.ownerId == request.auth.uid || isAdmin());
      // Only cloud functions or admins adjust wallets directly to prevent clients from writing arbitrary balances
      allow create, update: if isAdmin(); 
      allow delete: if false; 
    }

    // 3. Coins Rule
    match /coins/{symbol} {
      allow read: if true; // Public trade data
      allow write: if isAdmin();
    }

    // 4. Offers Rule
    match /offers/{offerId} {
      allow read: if true; // Public order book
      allow create: if isAuthenticated() && request.resource.data.creatorUid == request.auth.uid;
      allow update: if isAuthenticated() && (resource.data.creatorUid == request.auth.uid || isAdmin());
      allow delete: if isAuthenticated() && resource.data.creatorUid == request.auth.uid && resource.data.status == 'active';
    }

    // 5. Negotiations Rule
    match /negotiations/{negotiationId} {
      allow read: if isAuthenticated() && (resource.data.buyerUid == request.auth.uid || resource.data.sellerUid == request.auth.uid || isAdmin());
      allow create: if isAuthenticated() && (request.resource.data.buyerUid == request.auth.uid || request.resource.data.sellerUid == request.auth.uid);
      allow update: if isAuthenticated() && (resource.data.buyerUid == request.auth.uid || resource.data.sellerUid == request.auth.uid || isAdmin());
      allow delete: if false; // Audit trail must persist
    }

    // 6. Locked Deals Rule
    match /lockedDeals/{dealId} {
      allow read: if isAuthenticated() && (resource.data.buyerUid == request.auth.uid || resource.data.sellerUid == request.auth.uid || isAdmin());
      allow create: if isAdmin(); // Highly sensitive state. Only triggered server-side
      allow update: if isAuthenticated() && (resource.data.buyerUid == request.auth.uid || resource.data.sellerUid == request.auth.uid || isAdmin());
      allow delete: if false;
    }

    // 7. Trades Rule
    match /trades/{tradeId} {
      allow read: if isAuthenticated() && (resource.data.buyerUid == request.auth.uid || resource.data.sellerUid == request.auth.uid || isAdmin());
      allow create, update, delete: if isAdmin(); // Formed automatically upon lockedDeal completion
    }

    // 8. Transactions Rule
    match /transactions/{txId} {
      allow read: if isAuthenticated() && (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid; // Allows user to log intent
      allow update, delete: if isAdmin(); // Ledger modifications are admin-locked
    }

    // 9. Deposits Rule
    match /deposits/{depositId} {
      allow read: if isAuthenticated() && (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
      allow update: if isAdmin(); // Admin confirms deposits
      allow delete: if false;
    }

    // 10. Withdrawals Rule
    match /withdrawals/{withdrawalId} {
      allow read: if isAuthenticated() && (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
      allow update: if isAdmin(); // Admin executes payouts
      allow delete: if false;
    }

    // 11. Notifications Rule
    match /notifications/{notificationId} {
      allow read: if isAuthenticated() && resource.data.userUid == request.auth.uid;
      allow create: if isAdmin(); // Only system/admins push notifications
      allow update: if isAuthenticated() && resource.data.userUid == request.auth.uid && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['readStatus']);
      allow delete: if isAuthenticated() && resource.data.userUid == request.auth.uid;
    }

    // 12. Settings Rule
    match /settings/{configKey} {
      allow read: if true; // Public parameters
      allow write: if isAdmin();
    }

    // 13. Logs Rule
    match /logs/{logId} {
      allow read, write: if isAdmin(); // Auditing restricted to security compliance officer
    }
  }
}
```

---

## 4. Recommended Composite Indexes

To maintain sub-100ms querying speeds across massive database volumes, the following multi-field queries require composite indexes.

### 4.1. Marketplace Offers Filtering (Order Book)
* **Required Query:** Retrieve active offers of a specific coin type, sorted by creation date or price.
* **Fields:**
  - `coinSymbol` (Ascending)
  - `status` (Ascending)
  - `pricePKR` (Descending)
  - `createdAt` (Descending)

### 4.2. User Wallets Overview
* **Required Query:** Fetch all wallet balances for a user, sorted by balance value for visual prioritization.
* **Fields:**
  - `ownerId` (Ascending)
  - `availableBalance` (Descending)

### 4.3. Active Escrows & Locked Deals Tracking
* **Required Query:** Query all locked deals for a specific buyer/seller that have not yet expired.
* **Fields:**
  - `buyerUid` (Ascending)
  - `status` (Ascending)
  - `expiresAt` (Ascending)

### 4.4. Live Chat & Negotiations Audit
* **Required Query:** Filter negotiations for a user based on latest updates to show active lobbies in dashboard.
* **Fields:**
  - `buyerUid` (Ascending)
  - `status` (Ascending)
  - `updatedAt` (Descending)

---

## 5. Performance, Concurrency, and Scalability Best Practices

1. **Avoid the 1-Write-Per-Second Limit on Documents:**
   - Instead of keeping a single `global_stats` document containing total platform volume (which would fail at 100,000+ users due to the Firestore write frequency limit), use **Distributed Counters**.
   - Store shard documents under a `/stats_shards` sub-collection, and sum their values client-side or during serverless aggregations.

2. **Idempotence in Transaction Records:**
   - Generate unique transaction IDs (`txId`) deterministically using hash parameters (e.g., `userId + timestamp + action`). This prevents double-spend or double-deposit bugs if a user double-clicks or experiences connection latency.

3. **Sub-collections vs. Map Arrays for High Concurrency:**
   - In negotiations, messages are limited to the most recent chat events. If chat logs exceed 500+ items, do not write them inside a single array in the negotiation document (due to the 1MB document cap). Instead, move messages to a sub-collection: `/negotiations/{negotiationId}/messages/{messageId}`.

4. **Prepare for Cloud Functions Integrations:**
   - The fields `createdAt`, `status`, and `expiresAt` are fully indexed. This allows easy integration of a serverless Cron task (Cloud Scheduler + Cloud Functions) that queries expired deals daily: `db.collection('lockedDeals').where('status', '==', 'escrow_locked').where('expiresAt', '<', now)` and cancels them automatically, releasing hold balances.

---
