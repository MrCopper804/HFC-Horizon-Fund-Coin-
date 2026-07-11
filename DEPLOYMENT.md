# HFC Exchange - Enterprise Production Deployment & Hosting Specification
**Author:** Lead DevOps Architect, Principal Firebase Infrastructure Engineer & Security Specialist  
**Version:** 2.0.0  
**Status:** Approved for Core Deployment  
**Target Platform:** GitHub Pages (Static Frontend Node) + Google Cloud Firebase (Serverless Backend)

---

## 1. Multi-Environment Configuration Strategy

HFC Exchange operates on a serverless frontend-to-backend paradigm. To isolate development, staging/testing, and production workloads securely without server-side compilation, we utilize a **Multi-Project Firebase Strategy**.

```
                ┌──────────────────────────────────────────────────┐
                │          Static Client Asset Deployment          │
                └────────────────────────┬─────────────────────────┘
                                         │
                    Isolating environments on static hosting:
                    - Dev: Local Dev Server Node (Vite localhost)
                    - Test: GitHub Pages Staging Branch/Subpath
                    - Prod: GitHub Pages Main/Release Branch (Primary Domain)
                                         │
                 ┌───────────────────────┼────────────────────────┐
                 ▼                       ▼                        ▼
     ┌───────────────────────┐ ┌───────────────────┐ ┌────────────────────────┐
     │ Dev Firebase Project  │ │ Staging Firebase  │ │   Prod Firebase Project│
     │ - hfc-dev             │ │ - hfc-staging     │ │   - hfc-production     │
     │ - Open security rules │ │ - Gated users   │ │   - Strict multi-sig rules│
     └───────────────────────┘ └───────────────────┘ └────────────────────────┘
```

### 1.1. Environment Credentials Isolation
To manage Firebase credentials cleanly, the configuration inside `/firebase/firebase-config.js` is automatically routed based on the runtime hostname or build parameters:

```javascript
// Example Client-Side Environment Router
const hostname = window.location.hostname;

const devConfig = {
  apiKey: "AIzaSyDevPlaceholderKey_789012345",
  authDomain: "hfc-dev.firebaseapp.com",
  projectId: "hfc-dev",
  storageBucket: "hfc-dev.appspot.com"
};

const stagingConfig = {
  apiKey: "AIzaSyStagingPlaceholderKey_456789012",
  authDomain: "hfc-staging.firebaseapp.com",
  projectId: "hfc-staging",
  storageBucket: "hfc-staging.appspot.com"
};

const prodConfig = {
  apiKey: "AIzaSyProdPlaceholderKey_123456789", // Production restriction active
  authDomain: "hfc-production.firebaseapp.com",
  projectId: "hfc-production",
  storageBucket: "hfc-production.appspot.com"
};

let activeConfig = devConfig;
if (hostname === "hfc-exchange.github.io" || hostname === "hfc-exchange.com") {
  activeConfig = prodConfig;
} else if (hostname.includes("staging") || hostname.includes("preview")) {
  activeConfig = stagingConfig;
}

export { activeConfig };
```

---

## 2. GitHub Pages Deployment Architecture

GitHub Pages serves as the redundant, CDN-backed static host for HFC Exchange. 

### 2.1. Git Branching Strategy
We enforce a secure Gitflow branching structure for release promotion:

```
  dev  ------------------●--------● (Local feature sandboxes)
                          \      /
  test --------------------●----● (GitHub Pages Staging Preview)
                            \  /
  main ----------------------● (Production Gatekeeper - Production Release)
```

1.  **`dev` (Development Branch)**: Integration sandbox. Active peer testing occurs here. Auto-deploys to local testing previews.
2.  **`test` (Staging/Release Candidate Branch)**: Pre-flight testing environment. Used to perform manual regression audits and security reviews.
3.  **`main` (Production Branch)**: Fully hardened release channel. Direct commits are strictly prohibited. Merges require senior engineer approval, successful compilation checks, and passed security rule tests.

### 2.2. Production Deployment Steps
For standard static deployment, we compile assets with Vite and push to the deployment branch:

```bash
# 1. Checkout main branch and verify local cleanliness
git checkout main
git pull origin main

# 2. Run compilation and verification suite
npm ci
npm run lint
npm run build

# 3. Deploy the compiled 'dist' output directory to GitHub Pages (gh-pages branch)
npx gh-pages -d dist --branch gh-pages --message "Release: Deploying Version v2.0.0"
```

### 2.3. Handling Single Page Application (SPA) Routing & 404 Pages
Because GitHub Pages is a static server, deep-linking directly to routes like `/dashboard.html` or reloading `/marketplace.html` can trigger standard HTTP 404 errors. 

We solve this using two primary methods:
1.  **Strict Extension Navigation**: Avoid virtual directory routing. In our architecture, pages are resolved as physical `.html` documents (e.g. `/wallet.html`, `/deposit.html`), allowing native static resolution.
2.  **404.html Redirection Script**: Create a custom `/public/404.html` that captures the path, loads the routing context, and redirects the browser back to `index.html` with query parameters to restore client state.

---

## 3. Google Cloud Firebase Configuration & Hardening

The HFC Exchange depends on Google Cloud Firebase services for authorization, decentralized records, and storage vaults.

### 3.1. Firebase Authentication Gating
1.  **Authorized Domains**: In the Firebase Console (Authentication -> Settings -> Authorized Domains), you **must** restrict token generation to authorized origins only.
    *   `localhost` (Development)
    *   `127.0.0.1` (Local loopback)
    *   `hfc-exchange.github.io` (Staging/Production Host)
    *   `hfc-exchange.com` (Future custom domain proxy)
2.  **User Verification Enforcements**:
    *   Password policies must mandate a minimum of 8 characters, requiring mixed alphanumeric parameters.
    *   Enable User Account Enumeration Protection (prevents malicious actors from guessing registered trader emails).

### 3.2. Cloud Firestore Rules & Indexes Deployment
Never configure Firestore security rules via the web browser console, as this can lead to human error and lack of version history. Deploy configurations directly from Git:

```bash
# Verify Firebase CLI authentication
firebase login

# Deploy local security rules and composite index structures to active production environment
firebase deploy --only firestore:rules,firestore:indexes
```

### 3.3. Firebase Storage Vault Gating
User screenshot receipts and identification files uploaded to `deposits/{userId}` must be securely gated. Deploy storage rules directly:

```bash
# Deploy storage security regulations
firebase deploy --only storage
```

---

## 4. Monitoring, Audit Logs & Performance Tracking

FinTech environments demand deep observability to detect operational anomalies, liquidity blocks, or transaction lags.

### 4.1. Firebase Console Core Monitors
*   **Authentication Monitor**: Track active registered nodes, authorization failure trends, and token invalidation events.
*   **Firestore Read/Write/Delete Volumes**: Set alerts in the Google Cloud Console if operations exceed standard limits (e.g., spike of 20,000 document reads in under 1 minute), which could indicate a run-away client loop.
*   **Storage Bandwidth Traces**: Monitor media bandwidth usage. Large file uploads suggest client-side downscaling is failing.

### 4.2. Client-Side Error Catching & Auditing Console
HFC Exchange implements a client-side global exception listener inside `/js/utils.js` or `pwa-init.js` to catch unhandled errors and log them to the local `logs` collection on Firestore for operational review:

```javascript
// Core Error Log Collector
window.addEventListener('error', (event) => {
  const errorDetails = {
    message: event.message,
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    errorStack: event.error ? event.error.stack : null,
    timestamp: new Date(),
    userAgent: navigator.userAgent
  };
  
  // Asynchronously transmit log to Firestore audit database safely
  import('./firebase/firebase-config.js').then(({ db }) => {
    import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js').then(({ collection, addDoc }) => {
      addDoc(collection(db, "logs"), {
        category: "client_exception",
        severity: "error",
        payload: errorDetails,
        timestamp: new Date()
      }).catch(err => console.error("Logger terminal backup failed:", err));
    });
  });
});
```

---

## 5. Enterprise Backup & Disaster Recovery (DR)

### 5.1. Automated Firestore Database Exports
To prevent catastrophic data loss, set up daily database exports to a secure Cloud Storage bucket:

1.  **Configure Bucket**: Create a private storage bucket in Google Cloud (e.g., `gs://hfc-firestore-backups`).
2.  **Scheduled Export Script (Cloud Scheduler + Cloud Functions)**:
    ```typescript
    import { onSchedule } from "firebase-functions/v2/scheduler";
    import firestore from "firebase-admin/firestore";
    
    export const scheduledFirestoreBackup = onSchedule("0 2 * * *", async (event) => {
      const client = new firestore.v1.FirestoreAdminClient();
      const databaseName = client.databasePath('hfc-production', '(default)');
      
      try {
        const [responses] = await client.exportDocuments({
          name: databaseName,
          outputUriPrefix: "gs://hfc-firestore-backups",
          collectionIds: [] // Leave empty to export all collections
        });
        console.log(`Export successfully initiated. Operation name: ${responses.name}`);
      } catch (err) {
        console.error("Scheduled Firestore export failed:", err);
      }
    });
    ```

### 5.2. Disaster Recovery Playbook (Incident Mitigation)
*   **Scenario A: Production Security Rule Leak (Data Compromise)**:
    1.  Immediately lock down writes by applying the "emergency lockdown ruleset" via Firebase CLI:
        ```javascript
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /{document=**} {
              allow read, write: if false; // Lockdown active
            }
          }
        }
        ```
    2.  Audit change logs to isolate compromised files.
    3.  Repair specific rules, test in Staging environment, and re-deploy.
*   **Scenario B: Malicious Client UI Injection (XSS)**:
    1.  Immediately rollback the static deployment to the previous stable release commit on GitHub:
        ```bash
        git checkout gh-pages
        git reset --hard HEAD~1
        git push origin gh-pages --force
        ```
    2.  Clear the browser cache using the PWA Service Worker reload event.
    3.  Repair source code and commit a security patch.
