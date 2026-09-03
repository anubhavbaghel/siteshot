// Views
const mainView = document.getElementById('main-view');
const settingsView = document.getElementById('settings-view');

// Forms & Buttons
const captureForm = document.getElementById('capture-form');
const settingsForm = document.getElementById('settings-form');
const settingsToggleBtn = document.getElementById('settings-toggle-btn');
const backToMainBtn = document.getElementById('back-to-main-btn');

// Inputs
const apiKeyInput = document.getElementById('api-key-input');
const urlInput = document.getElementById('url-input');
const submitBtn = document.getElementById('submit-btn');

// Progress & Status Containers
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');

const resultContainer = document.getElementById('result-container');
const resultMsg = document.getElementById('result-msg');
const openBtn = document.getElementById('open-btn');
const openReportBtn = document.getElementById('open-report-btn');
const retryAltBtn = document.getElementById('retry-alt-btn');

const errorContainer = document.getElementById('error-container');
const errorText = document.getElementById('error-text');
const errorRetryAltBtn = document.getElementById('error-retry-alt-btn');
const settingsStatus = document.getElementById('settings-status');

let outputFolderPath = '';
let outputReportPath = '';

// Load saved API Key on launch
const savedKey = localStorage.getItem('gemini_api_key');
if (savedKey) {
  apiKeyInput.value = savedKey;
}

// View Toggling
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

backToMainBtn.addEventListener('click', showMain);

// Save Settings Event
settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) return;

  localStorage.setItem('gemini_api_key', apiKey);
  
  settingsStatus.classList.remove('hidden');
  
  setTimeout(() => {
    showMain();
  }, 1000);
});

// Capture Submit Event
captureForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const apiKey = localStorage.getItem('gemini_api_key');
  const url = urlInput.value.trim();
  
  if (!apiKey) {
    errorText.textContent = 'Please configure your Gemini API Key in Settings first (click the gear icon ⚙️).';
    errorContainer.classList.remove('hidden');
    resultContainer.classList.add('hidden');
    return;
  }
  
  if (!url) return;

  // Reset UI
  errorContainer.classList.add('hidden');
  resultContainer.classList.add('hidden');
  progressContainer.classList.remove('hidden');
  
  progressBar.style.width = '0%';
  statusText.textContent = 'Connecting...';

  // Disable inputs during execution
  urlInput.disabled = true;
  submitBtn.disabled = true;
  settingsToggleBtn.disabled = true;
  retryAltBtn.disabled = true;
  errorRetryAltBtn.disabled = true;

  // Send request with both URL and API Key
  window.api.startCapture(url, apiKey);
});

// Listen to progress updates
window.api.onStatus((status) => {
  progressBar.style.width = `${status.progress}%`;
  statusText.textContent = status.text;
});

// Listen for completion
window.api.onComplete((data) => {
  progressContainer.classList.add('hidden');
  resultContainer.classList.remove('hidden');
  errorContainer.classList.add('hidden');
  
  outputFolderPath = data.folderPath;
  outputReportPath = data.reportPath;

  if (data.hasAiError) {
    resultMsg.innerHTML = '⚠️ Screenshots captured, but AI alt-text had an issue. You can click <strong>Retry AI Alt-Text</strong> below!';
    resultMsg.style.color = '#f59e0b';
  } else if (data.isRetry) {
    resultMsg.innerHTML = '✓ AI Alt-Texts re-analyzed & report updated successfully!';
    resultMsg.style.color = '#4ec9b0';
  } else {
    resultMsg.innerHTML = '✓ Screenshots captured & report generated successfully!';
    resultMsg.style.color = '#4ec9b0';
  }

  // Re-enable inputs
  urlInput.disabled = false;
  submitBtn.disabled = false;
  settingsToggleBtn.disabled = false;
  retryAltBtn.disabled = false;
  errorRetryAltBtn.disabled = false;
});

// Listen for errors
window.api.onError((errMessage) => {
  progressContainer.classList.add('hidden');
  
  errorText.textContent = errMessage;
  errorContainer.classList.remove('hidden');

  // If previous screenshots exist, show the retry button in the error container
  if (outputFolderPath || errMessage.includes('Retry AI Alt-Text')) {
    errorRetryAltBtn.classList.remove('hidden');
  }

  // Re-enable inputs
  urlInput.disabled = false;
  submitBtn.disabled = false;
  settingsToggleBtn.disabled = false;
  retryAltBtn.disabled = false;
  errorRetryAltBtn.disabled = false;
});

// Open folder action
openBtn.addEventListener('click', () => {
  if (outputFolderPath) {
    window.api.openFolder(outputFolderPath);
  }
});

// Open report action
openReportBtn.addEventListener('click', () => {
  if (outputReportPath) {
    window.api.openFolder(outputReportPath);
  }
});

// Reusable retry handler (re-analyzes existing screenshots without re-capturing)
function triggerRetryAlt() {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) {
    errorText.textContent = 'Please configure your Gemini API Key in Settings first (click the gear icon ⚙️).';
    errorContainer.classList.remove('hidden');
    return;
  }

  errorContainer.classList.add('hidden');
  resultContainer.classList.add('hidden');
  progressContainer.classList.remove('hidden');
  
  progressBar.style.width = '85%';
  statusText.textContent = 'Re-analyzing existing screenshots with Gemini AI...';

  urlInput.disabled = true;
  submitBtn.disabled = true;
  settingsToggleBtn.disabled = true;
  retryAltBtn.disabled = true;
  errorRetryAltBtn.disabled = true;

  window.api.retryAltGeneration(apiKey);
}

retryAltBtn.addEventListener('click', triggerRetryAlt);
errorRetryAltBtn.addEventListener('click', triggerRetryAlt);
