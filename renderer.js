const form = document.getElementById('capture-form');
const urlInput = document.getElementById('url-input');
const submitBtn = document.getElementById('submit-btn');

const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');

const resultContainer = document.getElementById('result-container');
const openBtn = document.getElementById('open-btn');

const errorContainer = document.getElementById('error-container');
const errorText = document.getElementById('error-text');

let outputFolderPath = '';

form.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const url = urlInput.value.trim();
  if (!url) return;

  // Reset UI
  errorContainer.classList.add('hidden');
  resultContainer.classList.add('hidden');
  progressContainer.classList.remove('hidden');
  
  progressBar.style.width = '0%';
  statusText.textContent = 'Connecting...';

  // Disable inputs
  urlInput.disabled = true;
  submitBtn.disabled = true;

  // Send request
  window.api.startCapture(url);
});

// Listen to progress updates
window.api.onStatus((status) => {
  progressBar.style.width = `${status.progress}%`;
  statusText.textContent = status.text;
});

// Listen for completion
window.api.onComplete((folderPath) => {
  progressContainer.classList.add('hidden');
  resultContainer.classList.remove('hidden');
  
  outputFolderPath = folderPath;

  // Re-enable inputs
  urlInput.disabled = false;
  submitBtn.disabled = false;
});

// Listen for errors
window.api.onError((errMessage) => {
  progressContainer.classList.add('hidden');
  
  errorText.textContent = errMessage;
  errorContainer.classList.remove('hidden');

  // Re-enable inputs
  urlInput.disabled = false;
  submitBtn.disabled = false;
});

// Open folder action
openBtn.addEventListener('click', () => {
  if (outputFolderPath) {
    window.api.openFolder(outputFolderPath);
  }
});
