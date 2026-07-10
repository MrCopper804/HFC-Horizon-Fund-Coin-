# HFC Exchange - Design System & Project Foundation

Welcome to the **HFC Exchange Design System and Project Foundation**. This project establishes the complete, production-ready visual identity, reusable component standards, typography scale, global CSS variables, and clean folder layouts for all future application screens.

It is built strictly on **HTML5, CSS3, Bootstrap 5, Vanilla JS (ES6 Modules), and Bootstrap Icons**, fully supporting responsive mobile-first configurations, premium dark theme aesthetics, and smooth glassmorphic interfaces.

---

## 🎨 Design System CSS Variables

All styling attributes are driven by standard CSS Custom Properties declared on the `:root` element. **Never hardcode hex values or spacing metrics.**

### Brand & Accent Colors
- `--hfc-primary`: `#00f2fe` — Electric Neon Cyan (Main Brand highlight color)
- `--hfc-secondary`: `#4f5b66` — Sleek steel-gray
- `--hfc-bg`: `#080a0e` — Ultra-dark obsidian black (Main Canvas)
- `--hfc-surface`: `rgba(17, 21, 29, 0.65)` — Glassmorphic dark surface
- `--hfc-accent`: `#7928ca` — Tech purple gradient accent
- `--hfc-accent-gold`: `#f0b90b` — Premium gold for coin badges and priority balances

### Semantic Colors
- `--hfc-success`: `#0ecb81` — Bullish green
- `--hfc-warning`: `#f3ba2f` — Pending amber
- `--hfc-danger`: `#f6465d` — Bearish scarlet red
- `--hfc-info`: `#02a1fc` — Announcement sky-blue

### Spacing & Metrics
- Border Radii: `--hfc-radius-sm` (8px), `--hfc-radius-md` (12px), `--hfc-radius-lg` (16px)
- Glassmorphism Blur: `--hfc-glass-blur` (16px), `--hfc-glass-blur-sm` (8px)

---

## 📂 Stylesheets Architecture

The CSS is modularized into dedicated files located under `css/` to prevent monolithic code blobs and enable simple layout extensions:

1. **`theme.css`**: Imports professional Google Fonts (*Inter*, *Space Grotesk*, and *JetBrains Mono*), defines global custom property tokens, and resets core HTML parameters.
2. **`animations.css`**: Manages micro-animations, fade-ins, slide-ins, pulse glows, floating icons, loading spinners, and skeletal shimmer pulses.
3. **`components.css`**: Styles all core layout elements: glassmorphic cards, buttons, custom floating form inputs, badges, status pills, sticky-header tables, toasts, and modals.
4. **`utilities.css`**: Supplies utility extensions for text-glows, background blur sizes, gap spacings, custom rounded borders, and font weight weights.
5. **`style.css`**: The master entry point. Imports all other modular stylesheets and structures the global page layout grid (Sidebar + Navbar + Main).

---

## 💻 Vanilla Component Integration (ES6 Modules)

All interactive component utilities are managed by the `HFCComponents` class inside `/js/components.js`.

### 1. Toast Notifications
To trigger a luxury glassmorphic notification banner:
```js
import { HFCComponents } from '/js/components.js';

// Types: 'success', 'warning', 'danger', 'info', or 'primary'
HFCComponents.showToast('Transfer of 1.25 BTC initiated!', 'success');
```

### 2. Overlay Modals
To open or close any dialog with a smooth sliding transition and backdrop-blur overlay:
```js
// Open modal
HFCComponents.openModal('tradeConfirmModal');

// Close modal
HFCComponents.closeModal('tradeConfirmModal');
```

### 3. Sidebar Responsive Collapse
Automatically wire sidebar collapsing buttons:
```js
HFCComponents.initSidebar();
```

---

## 🛠️ Project Usage Guide

For all future pages (e.g., Dashboard, Login, or Marketplace), ensure the head of the HTML document correctly imports Bootstrap and our Master Design System styles:

```html
<head>
  <!-- Bootstrap 5 & Icons -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
  
  <!-- Master Stylesheet -->
  <link rel="stylesheet" href="/css/style.css">
</head>
```

---

## 🔥 Firebase Foundation & Reusable Authentication System

A complete enterprise-grade Firebase database, storage, and authentication foundation has been fully integrated into HFC Exchange. 

### 📂 File Structure
*   **`/firebase/firebase.js`**: Central singleton initializer for the Firebase Web App context, Auth, Firestore, and Cloud Storage.
*   **`/firebase/auth.js`**: Reusable authenticated registration, login, profile updates, and error-translating modules.
*   **`/firebase/firestore.js`**: Hardened wrapper for document operations, atomic transaction flows, list querying, and dynamic permissions validation.
*   **`/firebase/storage.js`**: Safe upload pipelines validating dimensions, sizes (5MB cap), and MIME types with secure deletion controllers.
*   **`/js/authGuard.js`**: Client-side page interceptor restricting unauthenticated routes or administrative areas.
*   **`/js/session.js`**: High-performance local caching synchronizing stateful changes between client memory and Firebase auth instances.
*   **`/js/utils.js`**: Shared validation utilities, custom date/time formatters, and dynamic loading overrides.

### 🛡️ zero-trust Firestore Security rules (`firestore.rules`)
The backend is protected by a Zero-Trust Attribute-Based Access Control (ABAC) matrix validating:
1.  **Identity Matching**: Modifying profiles or balances requires strict matching of direct auth session tokens.
2.  **Terminal State Locking**: Completed or failed trade ledger entries are locked from subsequent mutations.
3.  **No Unconstrained Queries**: Rule-level checks block generic list-scraping by verifying query filters client-side.
4.  **Field Immutability**: Core operational values (like UIDs, currencies, created dates) are locked after creation.

