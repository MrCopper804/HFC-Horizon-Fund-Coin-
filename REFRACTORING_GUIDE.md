# HFC Exchange - Refactoring, Deduplication & Structural Refinement Guide
**Author:** Principal Software Architect, Senior Technical Lead & Frontend Engineering Director  
**Version:** 2.0.0  
**Status:** Approved for Code Cleanup Operations  
**Target Codebase:** HFC Exchange Vanilla JS Architecture

---

## 1. Directory Structure Refinements

To maintain a clean codebase as the platform scales, the directory structure must be organized to separate business logic from presentation layouts.

### 1.1. Recommended Directory Realignment
```
├── /src/ (New organized root)
│   ├── /components/                 # Shared UI views (PageLayout.js)
│   ├── /services/                   # Abstraction layer for external APIs
│   │   ├── authService.js           # Authentication mutations
│   │   ├── walletService.js         # Balance ledger modifications
│   │   └── tradeService.js          # Escrow locks and signatures
│   ├── /utils/                      # Core helpers (utils.js, theme.js)
│   └── /controllers/                # Page controllers (home.js, login.js)
```

**Justification**: Transitioning from a flat layout to a structured `/src/` folder separates structural UI components from backend database connections, reducing file dependencies and improving code readability.

---

## 2. Abstraction of Database Operations

To prevent duplicate code and ensure transactional consistency across the app, all database operations must be abstracted into distinct service layers.

### 2.1. Wallet Transaction Abstraction (`walletService.js`)
Currently, balance updates are handled independently inside `deposit.js`, `withdraw.js`, and `deal-lock.js`. This logic must be consolidated into a reusable service module:

```javascript
// src/services/walletService.js
import { db } from '../firebase/firebase-config.js';
import { doc, runTransaction, increment } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

/**
 * Executes an atomic transfer from available balance to hold balance.
 * Secured by database rules.
 */
export async function lockFundsForEscrow(userId, coinSymbol, amount) {
  const userDocRef = doc(db, 'users', userId);
  const walletDocRef = doc(db, `users/${userId}/wallets`, coinSymbol);

  return runTransaction(db, async (transaction) => {
    const walletSnapshot = await transaction.get(walletDocRef);
    if (!walletSnapshot.exists()) {
      throw new Error("Wallet not initialized.");
    }

    const availableBalance = walletSnapshot.data().availableBalance || 0;
    if (availableBalance < amount) {
      throw new Error("Insufficient available balance.");
    }

    // Atomic update preventing concurrency overrides
    transaction.update(walletDocRef, {
      availableBalance: increment(-amount),
      holdBalance: increment(amount)
    });
  });
}
```

---

## 3. Consolidation of UI Elements

*   **Standardized Alerts and Spinners**: Redundant loading animations and alert templates should be consolidated into `/js/components.js`. All controllers must reference these shared UI utilities instead of rendering custom HTML elements directly.
*   **Consistent Event Handling**: Replace legacy inline event handlers with dynamic event listeners registered in the controller scripts, improving code maintainability.

---

## 4. Operational Logging Optimization

To optimize monitoring, replace simple `console.error` logs with a structured logging function that routes errors to an audit collection in Firestore, ensuring administrators can search and review system errors:

```javascript
// src/utils/logger.js
import { db } from '../firebase/firebase-config.js';
import { collection, addDoc } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

export async function logSystemEvent(category, severity, message, details = {}) {
  try {
    await addDoc(collection(db, "logs"), {
      category,
      severity,
      message,
      details,
      timestamp: new Date()
    });
  } catch (err) {
    console.warn("Audit logger failed to write to Firestore:", err);
  }
}
```
