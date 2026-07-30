const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer-core');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 450,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Helper to find Chrome installation
function findChromePath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
  ];
  
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }

  // Fallback search in user's puppeteer cache folder
  const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
  if (fs.existsSync(cacheDir)) {
    const findExe = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          const fp = path.join(dir, f);
          const stat = fs.statSync(fp);
          if (stat.isDirectory()) {
            const found = findExe(fp);
            if (found) return found;
          } else if (f === 'chrome.exe') {
            return fp;
          }
        }
      } catch (err) {}
      return null;
    };
    const found = findExe(cacheDir);
    if (found) return found;
  }
  return null;
}

// Auto scroll function to trigger lazy load images
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 150;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 60);
    });
  });
  // Settle time for renders
  await new Promise(r => setTimeout(r, 2000));
}

const ENCODED_XOR_KEY = 'ChplCilzGQV9AT8hIz8lGgkCHgQmBxEHJS84GQl7EgUxHj0cOQUHJjMuLDEKADkqfGY9ESw=';

function getDecryptedApiKey() {
  const xorStr = Buffer.from(ENCODED_XOR_KEY, 'base64').toString('utf-8');
  let result = '';
  const keyChar = 'K';
  for (let i = 0; i < xorStr.length; i++) {
    result += String.fromCharCode(xorStr.charCodeAt(i) ^ keyChar.charCodeAt(0));
  }
  return result;
}

const GEMINI_API_KEY = getDecryptedApiKey();

// Helper to generate alt-text using Gemini API
async function generateAltText(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
      contents: [{
        parts: [
          { text: "i will provide you screenshot of the website so you can write alt keep it precise , meaningfull, and short , united kingdowm counrty lang an d125 char words without full stop,you have to write only images and all the headings have images so you can write alt respective heaing and gallery images. Format the output with the image name/location on one line, followed by the alt-text on the next line (with no bullet points, hyphens, or prefixes on the alt-text line itself) so it can be double-clicked to select and copy." },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Image
            }
          }
        ]
      }]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return `Failed to generate alt-text (${response.status})`;
    }

    const result = await response.json();
    const description = result.candidates?.[0]?.content?.parts?.[0]?.text;
    return description ? description.trim() : 'No description generated.';
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

// Normalize URLs to filenames
function getSafeFilename(urlStr) {
  try {
    const parsed = new URL(urlStr);
    let name = parsed.hostname + parsed.pathname;
    name = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '');
    return name ? `${name}.png` : 'homepage.png';
  } catch (e) {
    return 'page.png';
  }
}

// IPC listener for starting capture
ipcMain.on('start-capture', async (event, targetUrl) => {
  const chromePath = findChromePath();
  if (!chromePath) {
    event.reply('capture-error', 'Could not locate Google Chrome. Please install Chrome to use this app.');
    return;
  }

  let startUrlParsed;
  try {
    startUrlParsed = new URL(targetUrl);
  } catch (err) {
    event.reply('capture-error', 'Invalid URL format. Please enter a valid URL.');
    return;
  }

  // Create a timestamped folder inside SiteShot_Captures to version each run
  const siteName = startUrlParsed.hostname.replace(/[^a-zA-Z0-9]/g, '_');
  const timestamp = new Date().toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replace(/:/g, '-');
  
  const outputDir = path.join(os.homedir(), 'Downloads', 'SiteShot_Captures', `${siteName}_${timestamp}`);
  fs.mkdirSync(outputDir, { recursive: true });

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const visitedUrls = new Set();
    const queue = [{ url: targetUrl, depth: 0 }];
    const pagesToCapture = [];
    const pageTitles = {};

    // Step 1: Discover internal pages on the landing page
    event.reply('capture-status', { text: 'Discovering website pages...', progress: 10 });
    
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    pagesToCapture.push(targetUrl);
    visitedUrls.add(targetUrl.split('#')[0].replace(/\/$/, ''));
    
    let landingTitle = await page.title();
    landingTitle = landingTitle ? landingTitle.trim() : 'Home';
    pageTitles[targetUrl.split('#')[0].replace(/\/$/, '')] = landingTitle;

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .filter(a => a.href && a.href.startsWith('http'))
        .map(a => ({
          href: a.href,
          text: a.innerText.trim() || a.getAttribute('aria-label') || ''
        }));
    });

    for (const item of links) {
      try {
        const linkParsed = new URL(item.href);
        if (linkParsed.hostname === startUrlParsed.hostname) {
          const normalized = item.href.split('#')[0].replace(/\/$/, '');
          
          if (!pageTitles[normalized]) {
            let cleanText = item.text.replace(/[\r\n\t]+/g, ' ').trim();
            if (!cleanText) {
              const pathParts = linkParsed.pathname.split('/').filter(Boolean);
              if (pathParts.length > 0) {
                cleanText = pathParts[pathParts.length - 1]
                  .replace(/[-_]/g, ' ')
                  .replace(/\b\w/g, c => c.toUpperCase());
              } else {
                cleanText = 'Home';
              }
            }
            pageTitles[normalized] = cleanText;
          }

          if (!visitedUrls.has(normalized)) {
            visitedUrls.add(normalized);
            pagesToCapture.push(item.href);
          }
        }
      } catch (err) {}
    }

    // Limit to max 15 pages to keep it fast/lightweight
    const totalPages = Math.min(pagesToCapture.length, 15);
    const results = [];

    // Step 2: Capture screenshots and generate alt-text
    for (let i = 0; i < totalPages; i++) {
      const url = pagesToCapture[i];
      const progressPercent = 20 + Math.round((i / totalPages) * 75);
      
      event.reply('capture-status', { 
        text: `Capturing page ${i + 1}/${totalPages}...`, 
        progress: progressPercent 
      });

      const normalizedUrl = url.split('#')[0].replace(/\/$/, '');
      const pageTitle = pageTitles[normalizedUrl] || 'Home';

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await autoScroll(page);
        
        const filename = getSafeFilename(url);
        const filepath = path.join(outputDir, filename);
        
        await page.screenshot({
          path: filepath,
          fullPage: true
        });

        event.reply('capture-status', { 
          text: `Generating AI Alt-Text for page ${i + 1}/${totalPages}...`, 
          progress: Math.min(progressPercent + 3, 95)
        });

        const altText = await generateAltText(filepath);
        results.push({ url, filename, pageTitle, altText });
      } catch (e) {
        results.push({ url, filename: 'failed', pageTitle, altText: `Failed to capture: ${e.message}` });
      }
    }

    // Write the accessibility report HTML file
    let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SiteShot Accessibility Report - ${siteName}</title>
  <style>
    :root {
      --bg-color: #0f172a;
      --card-bg: #1e293b;
      --text-color: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --success: #10b981;
      --border: #334155;
    }
    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
    }
    header {
      background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
      padding: 2.5rem 2rem;
      border-bottom: 1px solid var(--border);
      text-align: center;
    }
    header h1 {
      margin: 0;
      font-size: 2.2rem;
      letter-spacing: -0.025em;
      color: #60a5fa;
    }
    header p {
      margin: 0.5rem 0 0 0;
      color: var(--text-muted);
      font-size: 1rem;
    }
    .container {
      max-width: 1100px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    .page-section {
      background-color: var(--card-bg);
      border-radius: 12px;
      border: 1px solid var(--border);
      margin-bottom: 2.5rem;
      overflow: hidden;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
    }
    .page-header {
      background-color: rgba(255, 255, 255, 0.03);
      padding: 1.2rem 1.5rem;
      border-bottom: 1px solid var(--border);
    }
    .page-header h2 {
      margin: 0;
      font-size: 1.4rem;
      color: #93c5fd;
    }
    .page-content {
      display: flex;
      flex-direction: column;
      padding: 1.5rem;
      gap: 1.5rem;
    }
    @media (min-width: 768px) {
      .page-content {
        flex-direction: row;
      }
    }
    .screenshot-column {
      flex: 1;
      max-width: 320px;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .screenshot-thumbnail {
      width: 100%;
      border-radius: 8px;
      border: 1px solid var(--border);
      cursor: zoom-in;
      transition: transform 0.2s, border-color 0.2s;
    }
    .screenshot-thumbnail:hover {
      transform: scale(1.02);
      border-color: var(--accent);
    }
    .screenshot-link {
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.2s;
    }
    .screenshot-link:hover {
      color: var(--accent);
    }
    .alts-column {
      flex: 2;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .alt-block {
      background-color: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem 1.2rem;
      position: relative;
      cursor: pointer;
      transition: border-color 0.2s, background-color 0.2s;
    }
    .alt-block:hover {
      border-color: var(--accent);
      background-color: rgba(59, 130, 246, 0.05);
    }
    .image-label {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.4rem;
      font-weight: bold;
    }
    .alt-text-content {
      font-size: 1rem;
      line-height: 1.5;
      color: var(--text-color);
      white-space: pre-wrap;
    }
    .alt-block.copied {
      border-color: var(--success) !important;
      background-color: rgba(16, 185, 129, 0.08) !important;
    }
    .copy-hint {
      position: absolute;
      top: 0.8rem;
      right: 1rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .alt-block:hover .copy-hint {
      opacity: 1;
    }
    /* Toast styles */
    .toast-container {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--success);
      color: white;
      padding: 0.8rem 1.5rem;
      border-radius: 50px;
      font-size: 0.9rem;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s, bottom 0.3s;
    }
    .toast-container.show {
      opacity: 1;
      bottom: 2.5rem;
    }
  </style>
</head>
<body>
  <header>
    <h1>SiteShot Accessibility Report</h1>
    <p>Site: <strong>${siteName.replace(/_/g, '.')}</strong> | Generated: ${new Date().toLocaleString()}</p>
  </header>
  <div class="container">
`;

    for (const r of results) {
      const lines = r.altText.split('\n').map(l => l.trim()).filter(Boolean);
      let altBlocksHtml = '';
      
      for (let j = 0; j < lines.length; j += 2) {
        const label = lines[j];
        const text = lines[j + 1] || 'No description.';
        
        const cleanLabel = label.replace(/^[-*\s]+/, '').replace(/:$/, '').trim();
        const cleanText = text.replace(/^[-*\s]+/, '').trim();
        
        altBlocksHtml += `
          <div class="alt-block" onclick="copyAltText(this)">
            <div class="image-label">${cleanLabel}</div>
            <div class="alt-text-content">${cleanText}</div>
            <span class="copy-hint">Click to copy</span>
          </div>`;
      }

      htmlContent += `
    <div class="page-section">
      <div class="page-header">
        <h2>${r.pageTitle}</h2>
      </div>
      <div class="page-content">
        <div class="screenshot-column">
          <a href="${r.filename}" target="_blank">
            <img class="screenshot-thumbnail" src="${r.filename}" alt="${r.pageTitle} Screenshot">
          </a>
          <a class="screenshot-link" href="${r.filename}" target="_blank">View full-size screenshot</a>
        </div>
        <div class="alts-column">
          ${altBlocksHtml || `<div style="color: var(--text-muted);">No images found or analyzed.</div>`}
        </div>
      </div>
    </div>
`;
    }

    htmlContent += `
  </div>
  <div class="toast-container" id="toast">Alt-text copied to clipboard!</div>

  <script>
    function copyAltText(element) {
      const text = element.querySelector('.alt-text-content').innerText;
      
      navigator.clipboard.writeText(text).then(() => {
        // Flash animation
        element.classList.add('copied');
        
        // Show Toast
        const toast = document.getElementById('toast');
        toast.innerText = 'Copied: "' + (text.length > 40 ? text.substring(0, 40) + '...' : text) + '"';
        toast.classList.add('show');
        
        setTimeout(() => {
          element.classList.remove('copied');
        }, 1000);
        
        setTimeout(() => {
          toast.classList.remove('show');
        }, 2000);
      }).catch(err => {
        console.error('Could not copy text: ', err);
      });
    }
  </script>
</body>
</html>`;

    fs.writeFileSync(path.join(outputDir, `Siteshot_${siteName}_Alts.html`), htmlContent, 'utf-8');

    await browser.close();
    event.reply('capture-complete', outputDir);
  } catch (err) {
    if (browser) await browser.close();
    event.reply('capture-error', err.message);
  }
});

// IPC listener to open output directory
ipcMain.on('open-folder', (event, folderPath) => {
  shell.openPath(folderPath);
});
