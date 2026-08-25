let detectedImages = [];
let overlaysCreated = false;
let overlaysVisible = false;

// Extract the actual image source, checking common lazy-load data-attributes
function getRealImageSrc(img) {
  const lazyAttributes = [
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-fallback-src'
  ];
  for (const attr of lazyAttributes) {
    const val = img.getAttribute(attr);
    if (val && val.trim().startsWith('http')) {
      return val.trim();
    }
  }
  
  // Check srcset for a high-res image
  const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
  if (srcset) {
    const urls = srcset.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean);
    const lastUrl = urls[urls.length - 1]; // Take largest/highest res image
    if (lastUrl && lastUrl.trim().startsWith('http')) {
      return lastUrl.trim();
    }
  }
  
  return img.src || '';
}

// Normalize URL as a clean key
function getSimpleLabel(img) {
  let label = img.getAttribute('alt') || img.getAttribute('title') || '';
  if (!label) {
    // Guess label from class names or ID
    const searchString = (img.className + ' ' + img.id).toLowerCase();
    if (searchString.includes('logo')) label = 'Logo Image';
    else if (searchString.includes('banner') || searchString.includes('hero')) label = 'Banner Image';
    else if (searchString.includes('avatar') || searchString.includes('user')) label = 'User Profile Image';
    else if (searchString.includes('gallery') || searchString.includes('photo')) label = 'Gallery Image';
    else {
      // Guess from path name
      try {
        const src = getRealImageSrc(img);
        const url = new URL(src);
        const filename = url.pathname.split('/').pop();
        label = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ') + ' Image';
      } catch (e) {
        label = 'Page Image';
      }
    }
  }
  // Title case the guessed label
  return label.replace(/\b\w/g, l => l.toUpperCase()).trim();
}

function scanImages() {
  const images = Array.from(document.querySelectorAll('img'));
  detectedImages = [];
  
  let validIndex = 0;
  images.forEach((img) => {
    const src = getRealImageSrc(img);
    if (!src || src.startsWith('data:image/gif') || src.startsWith('data:image/svg+xml') || src.startsWith('data:image/png;base64,iVBORw0KGgoAAA')) {
      // Skip spacer gifs / placeholder inline svgs / base64 empty structures
      return;
    }

    const width = img.naturalWidth || img.clientWidth || parseInt(img.getAttribute('width') || '100');
    const height = img.naturalHeight || img.clientHeight || parseInt(img.getAttribute('height') || '100');
    
    // Ignore small structural arrows/spacers (less than 16px)
    if (width < 16 || height < 16) return;
    
    // Check visibility
    const style = window.getComputedStyle(img);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      return;
    }

    validIndex++;
    let id = img.getAttribute('data-siteshot-id');
    if (!id) {
      id = 'ss-img-' + validIndex + '-' + Math.random().toString(36).substr(2, 5);
      img.setAttribute('data-siteshot-id', id);
    }

    detectedImages.push({
      id: id,
      src: src,
      alt: img.alt || '',
      label: `${getSimpleLabel(img)}`
    });
  });

  return detectedImages;
}

function removeExistingOverlays() {
  document.querySelectorAll('.siteshot-overlay-wrapper').forEach(el => el.remove());
  overlaysCreated = false;
  overlaysVisible = false;
}

function injectAltOverlays(altsData) {
  removeExistingOverlays();
  
  const pageImages = Array.from(document.querySelectorAll('img'));
  
  altsData.forEach((item, idx) => {
    // 1. Try matching by exact image source URL
    let img = pageImages.find(i => i.src === item.src);
    
    // 2. Fallback matching by previously assigned unique ID
    if (!img) {
      img = document.querySelector(`img[data-siteshot-id="${item.id}"]`);
    }
    
    // 3. Fallback matching by sequence index
    if (!img && idx < pageImages.length) {
      img = pageImages[idx];
    }
    
    if (!img) return;

    // Ensure ID is associated
    let id = img.getAttribute('data-siteshot-id');
    if (!id) {
      id = item.id;
      img.setAttribute('data-siteshot-id', id);
    }

    const rect = img.getBoundingClientRect();
    
    // Create absolute positioned wrapper box matching image bounds
    const wrapper = document.createElement('div');
    wrapper.className = 'siteshot-overlay-wrapper';
    wrapper.style.top = (rect.top + window.scrollY) + 'px';
    wrapper.style.left = (rect.left + window.scrollX) + 'px';
    wrapper.style.width = rect.width + 'px';
    wrapper.style.height = rect.height + 'px';

    // Highlight border around the image (starts green/uncopied)
    const borderBox = document.createElement('div');
    borderBox.className = 'siteshot-border-box';
    wrapper.appendChild(borderBox);

    // Interactive Alt Text Tooltip Badge
    const badge = document.createElement('div');
    badge.className = 'siteshot-badge';
    
    const badgeLabel = document.createElement('span');
    badgeLabel.className = 'siteshot-badge-label';
    badgeLabel.innerText = item.label || 'Image';
    badge.appendChild(badgeLabel);

    const badgeText = document.createElement('span');
    badgeText.className = 'siteshot-badge-text';
    badgeText.innerText = item.altText;
    badge.appendChild(badgeText);

    // Click to copy action
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(item.altText).then(() => {
        badge.classList.add('copied');
        borderBox.classList.add('copied');
        
        // Brief toast notification
        showToast('Alt-text copied!');
      });
    });

    wrapper.appendChild(badge);
    document.body.appendChild(wrapper);
  });

  overlaysCreated = true;
  overlaysVisible = true;
}

function toggleOverlays(show) {
  const overlays = document.querySelectorAll('.siteshot-overlay-wrapper');
  overlays.forEach(el => {
    if (show) {
      el.classList.remove('siteshot-hidden');
    } else {
      el.classList.add('siteshot-hidden');
    }
  });
  overlaysVisible = show;
}

function showToast(message) {
  let toast = document.getElementById('siteshot-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'siteshot-toast';
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// IPC Message Listener from extension Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scan-images') {
    const images = scanImages();
    sendResponse({ images: images });
  } 
  else if (request.action === 'apply-alts') {
    injectAltOverlays(request.alts);
    sendResponse({ success: true });
  } 
  else if (request.action === 'toggle-overlays') {
    toggleOverlays(request.show);
    sendResponse({ visible: overlaysVisible });
  } 
  else if (request.action === 'check-status') {
    sendResponse({ 
      overlaysCreated: overlaysCreated, 
      overlaysVisible: overlaysVisible,
      imagesCount: detectedImages.length
    });
  }
  return true;
});

// Auto-load overlays from local database cache on initialization
function init() {
  // Query background worker for cached alt-texts for this page
  chrome.runtime.sendMessage({ action: 'get-page-alts', url: window.location.href }, (response) => {
    if (response && response.alts) {
      if (document.readyState === 'complete') {
        scanImages();
        injectAltOverlays(response.alts);
      } else {
        window.addEventListener('load', () => {
          scanImages();
          injectAltOverlays(response.alts);
        });
      }
    }
  });
}

init();
