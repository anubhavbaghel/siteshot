const form = document.getElementById('capture-form');
const apiKeyInput = document.getElementById('api-key-input');
const urlInput = document.getElementById('url-input');
const submitBtn = document.getElementById('submit-btn');

const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');

const resultContainer = document.getElementById('result-container');
const openBtn = document.getElementById('open-btn');
const openReportBtn = document.getElementById('open-report-btn');

const errorContainer = document.getElementById('error-container');
const errorText = document.getElementById('error-text');

let outputFolderPath = '';
let outputReportPath = '';

// Load saved API Key from localStorage
const savedKey = localStorage.getItem('gemini_api_key');
if (savedKey) {
  apiKeyInput.value = savedKey;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const apiKey = apiKeyInput.value.trim();
  const url = urlInput.value.trim();
  if (!apiKey || !url) return;

  // Save API Key locally
  localStorage.setItem('gemini_api_key', apiKey);

  // Reset UI
  errorContainer.classList.add('hidden');
  resultContainer.classList.add('hidden');
  progressContainer.classList.remove('hidden');
  
  progressBar.style.width = '0%';
  statusText.textContent = 'Connecting...';

  // Disable inputs
  apiKeyInput.disabled = true;
  urlInput.disabled = true;
  submitBtn.disabled = true;

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
  
  outputFolderPath = data.folderPath;
  outputReportPath = data.reportPath;

  // Re-enable inputs
  apiKeyInput.disabled = false;
  urlInput.disabled = false;
  submitBtn.disabled = false;
});

// Listen for errors
window.api.onError((errMessage) => {
  progressContainer.classList.add('hidden');
  
  errorText.textContent = errMessage;
  errorContainer.classList.remove('hidden');

  // Re-enable inputs
  apiKeyInput.disabled = false;
  urlInput.disabled = false;
  submitBtn.disabled = false;
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
