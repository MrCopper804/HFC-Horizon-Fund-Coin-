# HFC Exchange - Folder Structure Documentation

This documentation provides a comprehensive overview of the established file architecture for the **HFC Exchange** project. It specifies directories, describes naming conventions, and maps out where to implement new features.

---

## 📂 Master Directory Map

The directory structure is organized into modular folders to guarantee strict separation of concerns, easy page-loading speeds, and simple deployment to GitHub Pages.

```
/
├── admin/                    # Centralized Administrator files & dashboard stats
│   └── README.md             # Documentation for admin layouts
├── assets/                   # Shared design files, Figma exports, and workspace logs
│   └── placeholder.txt
├── components/               # Stateful, reusable Vanilla JS ES6 component classes
│   └── README.md
├── css/                      # Core styling structure
│   ├── theme.css             # Design tokens, CSS variables, and Google Fonts
│   ├── style.css             # Master orchestrator layout stylesheet
│   ├── components.css        # Reusable component style definitions
│   ├── utilities.css         # Text glows, border radii, and blur properties
│   └── animations.css        # Custom keyframe animations, hovers, and pulses
├── firebase/                 # Decentralized Firebase SDK v12 connection setup
│   └── firebase-config.js    # Lazy-loaded Auth, Firestore, and Storage clients
├── fonts/                    # Local backup of web-fonts (.woff, .woff2)
│   └── placeholder.txt
├── icons/                    # Custom project-specific SVG and favicon vectors
│   └── placeholder.txt
├── images/                   # Static branding images, illustrations, and coin logos
│   └── placeholder.txt
├── js/                       # Core client-side behavioral scripts
│   ├── components.js         # Interactive triggers (toasts, modals, tabs)
│   └── theme.js              # Theme customization storage handlers
├── public/                   # Static manifest JSONs, robots.txt, or assets
│   └── placeholder.txt
├── index.html                # Design System Showcase & Component Playground
└── README.md                 # Design System documentation overview
```

---

## 📝 Architectural Conventions

To maintain a pristine project layout as additional features are introduced, developers must adhere to the following code and folder standards:

### 1. Naming Conventions
- **CSS Classes**: All custom classes use the `hfc-` prefix to avoid clashing with standard Bootstrap 5 layouts (e.g. `.card-glass`, `.btn-hfc-primary`, `.hfc-main-container`).
- **Filenames**: Lowercase separated by dashes (`kebab-case`) (e.g. `firebase-config.js`, `theme.css`).
- **Vanilla ES Modules**: PascalCase for class declarations (e.g. `export class HFCComponents {}`).

### 2. Styling Rules
- **No Inline Styles**: Never use inline `style="..."` attributes. Apply custom helper classes in `utilities.css` or modify parameters in `theme.css`.
- **Responsive-First Design**: Always start layouts focusing on smaller mobile screens, and scale up using Bootstrap responsive prefixes (`md:`, `lg:`, `xl:`).

### 3. Component Reusability
- Declare HTML structures in templates or render functions inside the `/components/` folder.
- Drive dynamic contents (e.g., wallet values, ticker feeds) with standard, clean, data-binding inputs rather than hardcoded labels.
- Trigger actions through custom events or modular JavaScript imports.
