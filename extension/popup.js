// DOM Elements
const mainView = document.getElementById('main-view');
const settingsView = document.getElementById('settings-view');

const settingsToggleBtn = document.getElementById('settings-toggle-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const toggleOverlaysBtn = document.getElementById('toggle-overlays-btn');
const backBtn = document.getElementById('back-btn');
const saveKeyBtn = document.getElementById('save-key-btn');

const apiKeyInput = document.getElementById('api-key-input');
const providerSelect = document.getElementById('provider-select');
const geminiSettings = document.getElementById('gemini-settings');
const ollamaSettings = document.getElementById('ollama-settings');
const ollamaUrlInput = document.getElementById('ollama-url-input');
const ollamaModelSelect = document.getElementById('ollama-model-select');
const ollamaModelInput = document.getElementById('ollama-model-input');

const statusText = document.getElementById('status-text');
const settingsStatus = document.getElementById('settings-status');

const imageListContainer = document.getElementById('image-list-container');
const imageList = document.getElementById('image-list');

// State
let images = [];
let overlaysVisible = false;

// Provider Dropdown Change Event
providerSelect.addEventListener('change', () => {
  if (providerSelect.value === 'gemini') {
    geminiSettings.classList.remove('hidden');
    ollamaSettings.classList.add('hidden');
  } else {
    geminiSettings.classList.add('hidden');
    ollamaSettings.classList.remove('hidden');
  }
});

// Ollama Model Dropdown Change Event
ollamaModelSelect.addEventListener('change', () => {
  if (ollamaModelSelect.value === 'custom') {
    ollamaModelInput.classList.remove('hidden');
    ollamaModelInput.focus();
  } else {
    ollamaModelInput.classList.add('hidden');
    ollamaModelInput.value = ollamaModelSelect.value;
  }
});

// Load Settings from local storage
chrome.storage.local.get(['gemini_api_key', 'ai_provider', 'ollama_url', 'ollama_model'], (result) => {
  if (result.gemini_api_key) {
    apiKeyInput.value = result.gemini_api_key;
  }
  if (result.ai_provider) {
    providerSelect.value = result.ai_provider;
    providerSelect.dispatchEvent(new Event('change'));
  }
  if (result.ollama_url) {
    ollamaUrlInput.value = result.ollama_url;
  }
  if (result.ollama_model) {
    const model = result.ollama_model;
    if (model === 'llava' || model === 'moondream') {
      ollamaModelSelect.value = model;
      ollamaModelInput.classList.add('hidden');
      ollamaModelInput.value = model;
    } else {
      ollamaModelSelect.value = 'custom';
      ollamaModelInput.value = model;
      ollamaModelInput.classList.remove('hidden');
    }
  }
});

// View Toggle
function showSettings() {
  mainView.classList.add('hidden');
  settingsView.classList.remove('hidden');
  settingsStatus.classList.add('hidden');
}

function showMain() {
  settingsView.classList.add('hidden');
  mainView.classList.remove('hidden');
}

settingsToggleBtn.addEventListener('click', () => {
  if (settingsView.classList.contains('hidden')) {
    showSettings();
  } else {
    showMain();
  }
});

backBtn.addEventListener('click', showMain);

// Save Settings Event
saveKeyBtn.addEventListener('click', () => {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const ollamaUrl = ollamaUrlInput.value.trim();
  
  let ollamaModel = ollamaModelSelect.value;
  if (ollamaModel === 'custom') {
    ollamaModel = ollamaModelInput.value.trim() || 'llava';
  }

  chrome.storage.local.set({
    ai_provider: provider,
    gemini_api_key: apiKey,
    ollama_url: ollamaUrl,
    ollama_model: ollamaModel
  }, () => {
    settingsStatus.innerText = 'Settings saved!';
    settingsStatus.classList.remove('hidden');
    
    setTimeout(() => {
      showMain();
    }, 800);
  });
});

// Analyze Active Page Images
analyzeBtn.addEventListener('click', async () => {
  // Check settings
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(['gemini_api_key', 'ai_provider', 'ollama_url', 'ollama_model'], resolve);
  });
  
  const provider = result.ai_provider || 'gemini';
  const apiKey = result.gemini_api_key;
  const ollamaUrl = result.ollama_url || 'http://localhost:11434';
  const ollamaModel = result.ollama_model || 'llava';

  if (provider === 'gemini' && !apiKey) {
    statusText.innerHTML = '<span class="status-error">Please configure your Gemini API Key in settings first (click gear icon ⚙️).</span>';
    return;
  }

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    statusText.innerText = 'Could not access active browser tab.';
    return;
  }

  // Disable UI buttons
  analyzeBtn.disabled = true;
  toggleOverlaysBtn.disabled = true;
  statusText.className = '';
  statusText.innerText = 'Scanning active page images...';
  imageListContainer.classList.add('hidden');

  try {
    // 1. Scan images in content DOM
    chrome.tabs.sendMessage(tab.id, { action: 'scan-images' }, (response) => {
      if (chrome.runtime.lastError) {
        statusText.innerHTML = '<span class="status-error">Communication error. Try reloading the webpage first.</span>';
        analyzeBtn.disabled = false;
        return;
      }
      
      images = response?.images || [];
      if (images.length === 0) {
        statusText.innerText = 'No scan-worthy images found on this page.';
        analyzeBtn.disabled = false;
        return;
      }

      statusText.innerText = provider === 'ollama' 
        ? `Found ${images.length} images. Analyzing with Local Ollama (${ollamaModel})...`
        : `Found ${images.length} images. Analyzing with Gemini AI...`;

      // 2. Call background service worker to fetch images and run inference
      chrome.runtime.sendMessage(
        { 
          action: 'generate-alt-text', 
          images: images, 
          apiKey: apiKey, 
          url: tab.url,
          provider: provider,
          ollamaUrl: ollamaUrl,
          ollamaModel: ollamaModel
        },
        (res) => {
          if (!res || !res.success) {
            statusText.innerHTML = `<span class="status-error">Error: ${res?.error || 'Failed to call API'}</span>`;
            analyzeBtn.disabled = false;
            return;
          }

          statusText.innerText = 'Injecting overlays onto webpage...';

          // 3. Send generated alts back to content DOM
          chrome.tabs.sendMessage(tab.id, { action: 'apply-alts', alts: res.alts }, (applyRes) => {
            statusText.innerHTML = '<span class="status-success">✓ Alt analysis complete!</span>';
            analyzeBtn.disabled = false;
            toggleOverlaysBtn.disabled = false;
            toggleOverlaysBtn.innerText = 'Hide Alt Overlays';
            overlaysVisible = true;

            // Render list inside popup
            renderImageList(res.alts);
          });
        }
      );
    });
  } catch (err) {
    statusText.innerHTML = `<span class="status-error">Error: ${err.message}</span>`;
    analyzeBtn.disabled = false;
  }
});

// Toggle Overlays Click Event
toggleOverlaysBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { action: 'toggle-overlays', show: !overlaysVisible }, (res) => {
    overlaysVisible = res?.visible ?? !overlaysVisible;
    toggleOverlaysBtn.innerText = overlaysVisible ? 'Hide Alt Overlays' : 'Show Alt Overlays';
  });
});

// Render the list of images in popup
function renderImageList(altsList) {
  imageList.innerHTML = '';
  
  altsList.forEach(item => {
    const el = document.createElement('div');
    el.className = 'image-item';
    
    const info = document.createElement('div');
    info.className = 'image-info';
    info.title = item.altText;
    info.innerHTML = `<strong>${item.label}</strong>: ${item.altText}`;
    el.appendChild(info);

    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.innerText = 'Copy';
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(item.altText).then(() => {
        btn.innerText = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerText = 'Copy';
          btn.classList.remove('copied');
        }, 1200);
      });
    });
    el.appendChild(btn);

    imageList.appendChild(el);
  });
  
  imageListContainer.classList.remove('hidden');
}

// Automatically triggers analysis if settings are correct
async function autoStartAnalysis() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(['gemini_api_key', 'ai_provider'], resolve);
  });
  const provider = result.ai_provider || 'gemini';
  const apiKey = result.gemini_api_key;
  if (provider === 'gemini' && !apiKey) {
    statusText.innerHTML = '<span class="status-error">Configure your Gemini API Key in Settings to start.</span>';
    return;
  }
  // Auto-trigger analyze
  analyzeBtn.click();
}

// Initial status query on popup load
async function queryCurrentStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // 1. Check if there's an ongoing analysis in the background
  chrome.runtime.sendMessage({ action: 'get-analysis-status' }, (response) => {
    if (response && response.activeAnalysis && response.activeAnalysis.url === tab.url) {
      // Ongoing analysis detected! Set popup UI to loading state
      analyzeBtn.disabled = true;
      toggleOverlaysBtn.disabled = true;
      statusText.innerText = `Analyzing image ${response.activeAnalysis.current} of ${response.activeAnalysis.total} with Local Ollama...`;
      return;
    }

    // 2. Check if overlays are already active in the page DOM
    chrome.tabs.sendMessage(tab.id, { action: 'check-status' }, (res) => {
      if (res && res.overlaysCreated) {
        toggleOverlaysBtn.disabled = false;
        overlaysVisible = res.overlaysVisible;
        toggleOverlaysBtn.innerText = overlaysVisible ? 'Hide Alt Overlays' : 'Show Alt Overlays';
        statusText.innerHTML = '<span class="status-success">✓ Ready (Overlays loaded)</span>';
        
        // Load and render list from local database cache
        chrome.runtime.sendMessage({ action: 'get-page-alts', url: tab.url }, (cacheRes) => {
          if (cacheRes && cacheRes.alts) {
            renderImageList(cacheRes.alts);
          }
        });
      } else {
        // 3. No active analysis and no overlays loaded. Trigger analysis automatically!
        autoStartAnalysis();
      }
    });
  });
}

// Listen for progress updates & completion alerts from background worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analysis-progress') {
    statusText.innerText = `Analyzing image ${request.current} of ${request.total} with Local Ollama...`;
  }
  else if (request.action === 'analysis-complete') {
    statusText.innerHTML = '<span class="status-success">✓ Alt analysis complete!</span>';
    analyzeBtn.disabled = false;
    toggleOverlaysBtn.disabled = false;
    toggleOverlaysBtn.innerText = 'Hide Alt Overlays';
    overlaysVisible = true;
    renderImageList(request.alts);
  }
});

queryCurrentStatus().catch(console.error);
