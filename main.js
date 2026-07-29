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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
      contents: [{
        parts: [
          { text: "i will provide you screenshot of the website so you can write alt keep it precise , meaningfull, and short , united kingdowm counrty lang an d125 char words without full stop,you have to write only images and all the headings have images so you can write alt respective heaing and gallery images" },
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
    return description ? description.trim().replace(/\n/g, ' ') : 'No description generated.';
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

    // Step 1: Discover internal pages on the landing page
    event.reply('capture-status', { text: 'Discovering website pages...', progress: 10 });
    
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    pagesToCapture.push(targetUrl);
    visitedUrls.add(targetUrl.split('#')[0].replace(/\/$/, ''));

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => a.href)
        .filter(href => href.startsWith('http'));
    });

    for (const link of links) {
      try {
        const linkParsed = new URL(link);
        if (linkParsed.hostname === startUrlParsed.hostname) {
          const normalized = link.split('#')[0].replace(/\/$/, '');
          if (!visitedUrls.has(normalized)) {
            visitedUrls.add(normalized);
            pagesToCapture.push(link);
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
        results.push({ url, filename, altText });
      } catch (e) {
        results.push({ url, filename: 'failed', altText: `Failed to capture: ${e.message}` });
      }
    }

    // Write the accessibility report CSV
    let csvContent = 'Page URL,Screenshot Filename,Generated Alt-Text\n';
    for (const r of results) {
      const safeUrl = `"${r.url.replace(/"/g, '""')}"`;
      const safeFilename = `"${r.filename.replace(/"/g, '""')}"`;
      const safeAltText = `"${r.altText.replace(/"/g, '""')}"`;
      csvContent += `${safeUrl},${safeFilename},${safeAltText}\n`;
    }
    fs.writeFileSync(path.join(outputDir, 'accessibility_report.csv'), csvContent, 'utf-8');

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
