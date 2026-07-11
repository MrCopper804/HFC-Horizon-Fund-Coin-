# HFC Exchange - Production Rollback & Incident Response Plan (ROLLBACK_PLAN.md)
**Author:** Head of Release Integrity, Chief Security Officer & Infrastructure Architect  
**Version:** 2.0.0  
**Status:** Approved for Core Operations  
**Execution Context**: Emergency Incident Management / Database & Host Rollbacks

This document outlines the operational procedures for activating emergency containment, deploying hot-fixes, or rolling back deployment targets on GitHub Pages and Firebase in the event of a catastrophic system failure on Launch Day or subsequent production updates.

---

## 1. Incident Severity Levels & Incident Control Team

When an issue is flagged on the live exchange, triage it immediately using the following severity matrix:

| Severity | Definition | Trigger Conditions | Action Team |
| :--- | :--- | :--- | :--- |
| **Severity 1 (S1)** | Catastrophic Outage | Direct balance loss, multi-sig escrow bypass, unauthorized admin access, or complete server/host failure. | RM, IL, CSO (Chief Security Officer) |
| **Severity 2 (S2)** | Critical Loss | Non-functional core feature (e.g., users cannot upload receipts, P2P chats are failing) with no workaround. | RM, IL, QA Lead |
| **Severity 3 (S3)** | Major / Medium | Intermittent glitches, slow load times, layout misalignments, or minor features broken. | RM, QA Team |

---

## 2. Emergency Isolation: Activating Maintenance Mode

If an S1 or S2 incident is active on the production network, the Infrastructure Lead (IL) or Release Manager (RM) must immediately lock down client interactions before diagnosing the issue.

### Step 2.1: Activating Global Maintenance Mode
1.  Navigate to the Firestore Console -> `settings` collection.
2.  Locate the global configuration document and edit the field:
    *   Set `maintenanceMode` to `true`.
3.  **Client-Side Behavior**: The unified layout controller (`PageLayout.js` or global index checks) intercepts this change in real-time, displays a glassmorphic "System Under Maintenance" overlay across all pages, and blocks all active trading, deposits, and withdrawal inputs.

### Step 2.2: Applying Emergency Firestore Lockdown Rules
If the incident involves an active security exploit or a potential database leak, deploy the emergency lockdown ruleset immediately via Firebase CLI:

```bash
# Deploy emergency rules that block all reads/writes for standard clients
firebase deploy --only firestore:rules --message "Emergency Lockdown ruleset active"
```

The content of the emergency rules file (`firestore.rules` under active rollback configuration):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false; // Blocks all operations
    }
  }
}
```

---

## 3. Deployment Rollback Procedures

### Procedure A: Rolling Back Static Frontends on GitHub Pages
If the client application has an active vulnerability, severe visual break, or crashing scripts, revert the live static server instantly:

1.  Identify the commit hash of the previous stable production release (e.g., `v1.9.1` or the stable pre-launch commit).
2.  Force-revert the compiled `gh-pages` branch back to the stable state:
    ```bash
    # Checkout gh-pages branch locally
    git checkout gh-pages
    git pull origin gh-pages
    
    # Reset the local branch to the previous stable release commit
    git reset --hard origin/gh-pages~1
    
    # Force push the rollback commit to the repository
    git push origin gh-pages --force
    ```
3.  Flush CDN caches immediately to ensure users download the stable files.

### Procedure B: Reverting Database Security Rules
If a newly deployed security rule causes client blocks or validation breaks:

1.  Revert the `firestore.rules` and `storage.rules` local source code files using Git:
    ```bash
    git checkout HEAD~1 -- firestore.rules storage.rules
    ```
2.  Redeploy the reverted rules:
    ```bash
    firebase deploy --only firestore:rules,storage:rules --message "Reverting to previous stable rules version"
    ```

### Procedure C: Reverting Database Schema or Balance Records
If a database modification causes ledger corruption:

1.  Lock writing privileges by setting `maintenanceMode: true` in the global settings.
2.  Isolate corrupted documents.
3.  If corruption is widespread, restore the database from the previous nightly Firestore backup located in the secure Google Cloud Storage bucket (`gs://hfc-firestore-backups`):
    ```bash
    gcloud firestore import gs://hfc-firestore-backups/[BACKUP_TIMESTAMP_FOLDER]
    ```

---

## 4. User Communication & Incident Recovery Guidance

*   **Transparency**: If maintenance mode is active for more than 15 minutes, post a status update confirming that maintenance is underway to implement optimization updates.
*   **Balance Restoration Guarantees**: Reassure users that active escrows are tracked by secure historical snapshots and that ledger balances are fully secured.
*   **Verification Sign-off**: Before restoring access (by setting `maintenanceMode: false`), the QA Lead must run a full validation check on the isolated staging environment and confirm that all core systems are healthy.
