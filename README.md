# SiteShot - Website Accessibility Alt-Text Suite
SiteShot is an AI-powered accessibility alt-text generation and validation suite designed to help content editors, developers, and SEO professionals quickly generate, review, and copy alt-text descriptions. 
This repository contains two matching tools:
1. **SiteShot Chrome Extension**: An in-page interactive tool that scans the active browser tab, highlights images, saves results in a local database cache, and generates alt-texts using either Google Gemini or local Ollama.
2. **SiteShot Desktop App**: An Electron-based desktop app that crawls multi-page websites headlessly, resolves lazy-loading elements, and generates a unified interactive HTML alt-text report.
---
## 🔌 1. SiteShot Chrome Extension (Manifest V3)
The Chrome Extension is the recommended tool for in-context analysis, working directly on live pages, preview sites, draft URLs, and pages behind logins/paywalls.
### Key Features
* **In-Page Overlay Badges**: Highlights all images on the page with a colored border and an alt-text tooltip card.
* **Interactive checklist UX**: Clicking an alt-text card copies it to your clipboard and permanently changes the border from **green** (pending) to **red** (copied) to track progress.
* **Auto-Start on Click**: Analyzes the page automatically as soon as the extension is opened if no overlays or active runs exist.
* **Local Database Caching**: Stores generated descriptions in `chrome.storage.local`. Navigating back to previously analyzed pages automatically restores the overlays with **0 new API requests consumed**.
* **Local Ollama Support**: Run visual inference completely offline on your own PC. Supports vision models like `llava` (accurate) and `moondream` (lightweight and fast on CPU).
* **Robust Lazy-Loading Parser**: Automatically resolves images using lazy-loading attributes (`data-src`, `data-lazy-src`, `srcset`) to guarantee all images are captured.
### Installation
1. Open Google Chrome and go to `chrome://extensions/`.
2. Toggle **Developer mode** (top-right corner) to ON.
3. Click **Load unpacked** (top-left corner).
4. Select the `extension/` folder from this repository.
5. Click the Extensions icon (puzzle piece) in the toolbar and pin **SiteShot**.
### Local Ollama Setup (Optional)
To run local models on your machine:
1. Download and install [Ollama](https://ollama.com/).
2. Run the vision model of your choice in your terminal:
   ```bash
   ollama run moondream
   ```
3. Set the `OLLAMA_ORIGINS` environment variable to `*` to allow browser extensions to connect:
   * **Windows (PowerShell)**:
     ```powershell
     $env:OLLAMA_ORIGINS="*"
     ollama serve
