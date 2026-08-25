async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function fetchImageBase64(urlStr) {
  if (urlStr.startsWith('data:')) {
    const parts = urlStr.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const data = parts[1];
    return { mimeType: mime, data: data };
  }
  
  const response = await fetch(urlStr);
  if (!response.ok) {
    throw new Error(`Failed to fetch image URL: status ${response.status}`);
  }
  const blob = await response.blob();
  const base64Data = await blobToBase64(blob);
  return {
    mimeType: blob.type || 'image/png',
    data: base64Data
  };
}

async function generateAltTexts(images, apiKey) {
  const parts = [];
  
  let prompt = "I will provide you multiple images. Write a precise, meaningful, and short alt-text for each image. Use United Kingdom English. Keep descriptions under 125 characters, with no full stop at the end. You must output the results in the exact order of the images provided, starting directly with the image label on one line, followed by the alt-text on the next line (no bullets, hyphens, or prefixes). Do not include any introduction, greetings, explanations, or markdown headings. Start directly with the first image label.\n\n";
  prompt += "The images are provided in this ordering:\n";
  
  images.forEach((img, idx) => {
    prompt += `Image ${idx + 1}: ${img.label}\n`;
  });
  
  parts.push({ text: prompt });
  
  // Fetch and convert all images in parallel
  const fetchedParts = await Promise.all(
    images.map(async (img) => {
      try {
        const result = await fetchImageBase64(img.src);
        return {
          inlineData: {
            mimeType: result.mimeType,
            data: result.data
          }
        };
      } catch (err) {
        console.error('Failed to process image:', img.src, err);
        return null;
      }
    })
  );
  
  // Filter out failed fetches
  const validFetchedParts = fetchedParts.filter(Boolean);
  if (validFetchedParts.length === 0) {
    throw new Error('No images could be successfully fetched and processed.');
  }
  
  parts.push(...validFetchedParts);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  const payload = { contents: [{ parts }] };

  let retries = 4;
  let delay = 4000;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 429 || response.status === 503) {
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errText}`);
      }

      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err) {
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

function parseResponse(rawText, images) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  
  for (let k = 0; k < images.length; k++) {
    const labelLineIndex = k * 2;
    const textLineIndex = k * 2 + 1;
    
    const label = lines[labelLineIndex] || images[k].label;
    const text = lines[textLineIndex] || 'Guessed image representation.';
    
    const cleanLabel = label.replace(/^[-*\s\d.]+(\s+)?/, '').replace(/:$/, '').trim();
    const cleanText = text.replace(/^[-*\s]+/, '').trim();
    
    results.push({
      id: images[k].id,
      src: images[k].src,
      label: cleanLabel,
      altText: cleanText
    });
  }
  return results;
}

async function generateAltTextsOllama(images, ollamaUrl, ollamaModel) {
  const alts = [];
  for (let k = 0; k < images.length; k++) {
    if (activeAnalysis) {
      activeAnalysis.current = k + 1;
    }
    // Send progress update to popup
    chrome.runtime.sendMessage({
      action: 'analysis-progress',
      current: k + 1,
      total: images.length
    }).catch(() => {});

    const img = images[k];
    let base64Result;
    try {
      base64Result = await fetchImageBase64(img.src);
    } catch (err) {
      console.error('Failed to fetch image base64:', img.src, err);
      alts.push({
        id: img.id,
        src: img.src,
        label: img.label,
        altText: 'Failed to retrieve image.'
      });
      continue;
    }

    const payload = {
      model: ollamaModel,
      prompt: "Write a precise, meaningful, and short alt-text for this image. Use United Kingdom English. Keep description under 125 characters, with no full stop at the end. Response should be only the description itself, nothing else.",
      images: [base64Result.data],
      stream: false
    };

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Ollama Server Error: status ${response.status}`);
    }

    const json = await response.json();
    const text = json.response.trim();

    alts.push({
      id: img.id,
      src: img.src,
      label: img.label,
      altText: text
    });
  }
  return alts;
}

let activeAnalysis = null; // { url, current, total }

// Service worker message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generate-alt-text') {
    const provider = request.provider || 'gemini';
    activeAnalysis = { url: request.url, current: 0, total: request.images.length };
    
    if (provider === 'ollama') {
      generateAltTextsOllama(request.images, request.ollamaUrl, request.ollamaModel)
        .then(alts => {
          activeAnalysis = null;
          // Automatically save to local database cache
          if (request.url) {
            chrome.storage.local.set({ [request.url]: alts });
          }
          // Notify popup if it is open
          chrome.runtime.sendMessage({ action: 'analysis-complete', url: request.url, alts: alts }).catch(() => {});
          
          sendResponse({ success: true, alts: alts });
        })
        .catch(err => {
          activeAnalysis = null;
          sendResponse({ success: false, error: err.message });
        });
    } else {
      generateAltTexts(request.images, request.apiKey)
        .then(rawResponse => {
          activeAnalysis = null;
          const alts = parseResponse(rawResponse, request.images);
          // Automatically save to local database cache
          if (request.url) {
            chrome.storage.local.set({ [request.url]: alts });
          }
          // Notify popup if it is open
          chrome.runtime.sendMessage({ action: 'analysis-complete', url: request.url, alts: alts }).catch(() => {});
          
          sendResponse({ success: true, alts: alts });
        })
        .catch(err => {
          activeAnalysis = null;
          sendResponse({ success: false, error: err.message });
        });
    }
    return true; // Keep message channel open for async response
  }
  else if (request.action === 'get-page-alts') {
    chrome.storage.local.get([request.url], (result) => {
      sendResponse({ alts: result[request.url] || null });
    });
    return true;
  }
  else if (request.action === 'get-analysis-status') {
    sendResponse({ activeAnalysis: activeAnalysis });
    return true;
  }
});
