# HFC Exchange - Release Versioning & Changelog Protocol
**Author:** Principal Release Manager & Systems Compliance Lead  
**Version:** 2.0.0  
**Status:** Approved for Core Operations  
**Target Standard:** Semantic Versioning 2.0.0 (SemVer) + Unified Git Changelogs

---

## 1. Semantic Versioning (SemVer) Implementation

HFC Exchange strictly implements Semantic Versioning (SemVer) 2.0.0 to track the maturity and evolution of the decentralized escrow application. Every version identifier contains exactly three integers formatted as: `MAJOR.MINOR.PATCH`

```
                         ┌─── MAJOR (Incompatible Architecture Shifts)
                         │ ┌── MINOR (New Secured Functional Modules)
                         │ │ ┌─ PATCH (Bug Fixes & Security Hardening)
                         ▼ ▼ ▼
                        v2.0.0
```

### 1.1. Increment Definitions
1.  **PATCH (e.g. `2.0.0` -> `2.0.1`)**: Applied for non-breaking bug resolutions, spelling adjustments, style improvements, dependency security patches, and localized UI alignment updates.
2.  **MINOR (e.g. `2.0.0` -> `2.1.0`)**: Applied when introducing new non-breaking features, adding novel coin types, configuring extra payment options (e.g., adding local bank networks), or releasing secondary page modules without altering existing trade structures.
3.  **MAJOR (e.g. `2.0.0` -> `3.0.0`)**: Applied when architectural transformations occur that break compatibility. Examples:
    *   Transitioning from Firebase SDK v12 to standard REST APIs.
    *   Complete restructure of the Firestore escrow collection schemas (`offers` or `deals`).
    *   Revamping the multi-sig cold-vault verification workflow.

---

## 2. Release Tagging & Branch Control

To preserve audit compliance histories, releases are permanently tagged in the git repository:

### 2.1. Version Release Workflow
When a release candidate has passed all pre-flight inspections, follow these steps:

```bash
# 1. Update version in package.json
# Ensure "version": "2.0.0" is updated in the file manifest

# 2. Tag the commit with proper lightweight annotation
git tag -a v2.0.0 -m "Release: Production deployment of secure PWA & SEO package"

# 3. Push release tags to main origin repository
git push origin v2.0.0
```

### 2.2. Tag Validation Rules
*   Every tag **must** start with a lowercase `v` prefix followed by the version digits (e.g., `v2.0.0`).
*   Pre-release testing versions are annotated with a hyphen suffix (e.g., `v2.0.0-rc.1` represent Release Candidate 1).

---

## 3. Standard Production Changelog

### v2.0.0 — Stable Production Release (2026-07-11)
*   **Security & Gating**: Implemented complete Firebase Firestore Security Rules and Storage validation boundaries.
*   **PWA Integrations**: 
    *   Configured web-app manifest (`manifest.json`) supporting standalone workspace presentation.
    *   Built a highly optimized client-caching Service Worker (`service-worker.js`) with proactive pre-caches for static layouts and core Bootstrap CDN files.
    *   Designed a glassmorphic offline error card fallback (`offline.html`) with manual peer reconnect triggers.
    *   Exempted sensitive authentication APIs and real-time database streams from service-worker cache indexes.
*   **Search Engine Optimization**:
    *   Injected complete canonical markers, semantic descriptions, Open Graph visual elements, and Twitter cards into core entry portals.
    *   Configured `robots.txt` blocking standard search crawler discovery of administrative dashboards and confidential client workspace portfolios.
    *   Organized structured JSON-LD micro-data arrays.

### v1.0.0 — Initial Core Rollout
*   Released core P2P trading functionalities.
*   Created secure client wallet systems tracking PKR deposits and crypto holdings.
*   Engineered real-time chat terminals within individual deal pages.
*   Designed the operational Admin Portal.
