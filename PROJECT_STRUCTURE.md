# HFC Exchange - Comprehensive Project Structure & Asset Inventory
**Author:** Lead Frontend Engineer & Repository Systems Administrator  
**Version:** 2.0.0  
**Status:** Approved for Core Reference  
**Target Architecture:** Vanilla JS (ES6 Modules) + Bootstrap 5 + Single-Page Application (SPA) Directory Structure

---

## 1. Directory Tree & Architecture Overview

HFC Exchange utilizes a modular, zero-dependency client structure. Logic is cleanly separated between presentation files (`.html` in root), centralized styles (`/css/`), global design utilities (`/js/`), and page-specific JS controller modules (`/assets/js/`).

```
├── / (Root Directory)
│   ├── index.html                   # Platform Landing Gate & Features Guide
│   ├── login.html                   # Secured Operator Access Login Interface
│   ├── register.html                # Node Onboarding & Account Registration
│   ├── marketplace.html             # Peer-to-Peer (P2P) Live Offer Directory
│   ├── dashboard.html               # Active Trader Workspace / Escrow Overview
│   ├── wallet.html                  # Multi-Currency Wallet Vault console
│   ├── deposit.html                 # Deposit Request & Account Provisioning Portal
│   ├── withdraw.html                # Secure Cold-Vault Withdrawal Portal
│   ├── deal-lock.html               # Multi-Sig Locked-Deal Negotiation Room
│   ├── offer.html                   # Secure Escrow Offer Creation Form
│   ├── offer-details.html           # Live Negotiator View & Chat Terminal
│   ├── trade-history.html           # Auditable Completed Settlements Ledger
│   ├── notifications.html           # Security Alerts & Active Deal Updates Ticker
│   ├── design-system.html           # Glassmorphic Styling Palette Playground
│   │
│   ├── .env.example                 # Public Environment Variable Template
│   ├── package.json                 # Core Dev Dependencies & Build Scripts
│   ├── tsconfig.json                # TypeScript Module Resolution Constraints
│   ├── vite.config.ts               # Core Dev Server & Bundling Engine Config
│   │
│   ├── firestore.rules              # Enterprise Cloud Firestore Security Rules
│   ├── firestore.indexes.json       # Composite Multi-Query Databases Indexing
│   ├── storage.rules                # Secure Verification Upload Bucket Rules
│   ├── firebase-blueprint.json      # Structured Firestore Database Schema Blueprint
│   │
│   ├── PWA.md                       # Progressive Web App Architecture Specification
│   ├── SEO.md                       # Master Search Optimization & Metadata Specification
│   ├── DEPLOYMENT.md                # Multi-Environment Infrastructure Strategy
│   ├── PROJECT_STRUCTURE.md         # This repository-mapping documentation file
│   ├── VERSIONING.md                # Release Tagging & Changelog Policy
│   ├── RELEASE_CHECKLIST.md         # Manual Pre-Flight Verification Protocols
│   │
│   ├── /public/ (Vite Compiled Static Root Assets)
│   │   ├── manifest.json            # PWA OS Integration Configurations
│   │   ├── service-worker.js        # High-Performance Offline Caching Interceptor
│   │   ├── offline.html             # Glassmorphic Offline Fallback Screen
│   │   ├── offline-controller.js    # Connectivity Validation Ticker
│   │   ├── pwa-init.js              # Client PWA Orchestrator Bootloader
│   │   ├── browserconfig.xml        # Windows Tile Custom Styling Definitions
│   │   ├── structured-data.jsonld   # JSON-LD Google Rich Snippet Mapping
│   │   └── /icons/                  # Transformed Vector Platform Logos
│   │       ├── icon.svg             # Modern Infinite Vector Standard
│   │       ├── icon-192.png         # Launcher Standard (PWA)
│   │       ├── icon-512.png         # Splash HD Standard (PWA)
│   │       └── icon-maskable.png    # Adaptive Android Standard (PWA)
│   │
│   ├── /css/ (Global Styles)
│   │   └── style.css                # Glassmorphic System Design Tokens Master
│   │
│   ├── /js/ (Core Global Shared JS Modules)
│   │   ├── authGuard.js             # Session Verification & Portal Interceptor
│   │   ├── loader.js                # Core UI Frame Spinning Loading Shield
│   │   ├── utils.js                 # Shared Business Math, Toasts & Formatting
│   │   ├── theme.js                 # Theme Toggles and Colors
│   │   └── components.js            # Modals, Toasts and UI Controls
│   │
│   ├── /components/ (Reusable Presentation Frames)
│   │   └── PageLayout.js            # Glassmorphic Navigation Rails, Footers & Sidebars
│   │
│   ├── /assets/js/ (Page-Specific Business Logic Modules)
│   │   ├── home.js                  # Landing Page Animations & Spot Rates Controller
│   │   ├── login.js                 # Secure Login Form & State Handler
│   │   ├── register.js              # Onboarding Steps & Local Validations
│   │   ├── marketplace.js           # P2P Active Board Filtering & UI Card Stream
│   │   ├── dashboard.js             # Active Escrow Tracker & Trade Status Listener
│   │   ├── wallet.js                # Crypto Balances Renderer & Hold Calculation
│   │   ├── deposit.js               # Deposit Request Steps & Receipt Document Submits
│   │   ├── withdraw.js              # Multi-Factor Withdrawal Validations
│   │   ├── offer.js                 # Offer Creation Mechanics
│   │   ├── offer-details.js         # Real-time Chat, Status Changes & File Sharing
│   │   ├── deal-lock.js             # Multi-Sig Active Verification Control Room
│   │   ├── trade-history.js         # Completed Deals Table Filter Engine
│   │   └── notifications.js         # Security Log Lists & Action Clearances
│   │
│   ├── /admin/ (Platform Operator Restricted Area)
│   │   ├── login.html               # Gatekeeper Portal Access Login Form
│   │   ├── dashboard.html           # Administrative Health Center & Stat Panels
│   │   ├── users.html               # User Registry, KYC Approvals & Wallet Balances
│   │   ├── coins.html               # Hot-Wallet Liquidity and Coin Configurations
│   │   ├── deposits.html            # PKR Ledger Verification & Deposit Confirmations
│   │   ├── withdrawals.html         # Cold-Vault Escrow Sign-offs & Queue Processing
│   │   └── audit-logs.html          # Operational Event Logging & Interception Tracking
│   │
│   └── /assets/js/ (Admin Logic Modules)
│       ├── admin-login.js           # System operator access mechanics
│       ├── admin-dashboard.js       # Global Stats & System Liquidity Controller
│       ├── admin-users.js           # KYC approvals and user wallet manipulation
│       ├── admin-coins.js           # Coin parameter updates and transaction fees
│       ├── admin-deposits.js        # Deposit verification and manual balance additions
│       ├── admin-withdrawals.js     # Cold-vault withdrawal releases
│       └── admin-audit-logs.js      # Global event logs and security checks
```

---

## 2. Directory Separation of Concerns Guidelines

To prevent file bloating and maintain top-tier performance standards, developers **must** adhere to the following file-handling rules:

### 2.1. Rule 1: No Inline Styling or Inline Scripts
All elements must reference Tailwind utility classes or custom global design tokens in `/css/style.css`. Absolutely no `<style>` blocks are permitted in `.html` markup. All event handlers must be attached dynamically in `.js` modules (using `addEventListener`) rather than using attributes like `onclick=""` or `onload=""`.

### 2.2. Rule 2: Reusable Global Framework
Do not redefine utility methods like formatting currencies, showing quick toasts, parsing numbers, or verifying auth states.
*   **Authentication Gates**: Import `/js/authGuard.js` to automatically redirect users to appropriate gates depending on registration credentials.
*   **Financial Formats & Toasts**: Import utility tools directly from `/js/utils.js`.
*   **Layout Frameworks**: Import `/components/PageLayout.js` to render the unified glassmorphic header navigation rail, sidebars, active notification dots, and footers consistently across all views.

### 2.3. Rule 3: Single-Page Controller Modularization
Each page in the root directory possesses exactly **one** dedicated controller module in `/assets/js/` to coordinate user interactions and backend syncs. Do not share controllers or load multiple logic scripts per page. This guarantees files are lightweight and easily debugged.
