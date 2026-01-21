// Background service worker for Floodlight debugger

// In-memory storage for captured requests (per tab)
let capturedRequests = {};

// Tracking state (enabled by default)
let trackingEnabled = true;

// Persistence setting (off by default)
let persistData = false;

// Initialize settings from storage
chrome.storage.local.get(['trackingEnabled', 'persistData'], (result) => {
  if (result.trackingEnabled !== undefined) {
    trackingEnabled = result.trackingEnabled;
  }
  if (result.persistData !== undefined) {
    persistData = result.persistData;
  }
});

// Listen for storage changes to update settings in real-time
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.trackingEnabled) {
      trackingEnabled = changes.trackingEnabled.newValue;
    }
    if (changes.persistData) {
      persistData = changes.persistData.newValue;
    }
  }
});

/**
 * Parse URL parameters from a Floodlight request
 * @param {string} url - The full request URL
 * @returns {Object} - Parsed parameters
 */
function parseFloodlightUrl(url) {
  const urlObj = new URL(url);
  const params = {};

  // Extract all URL parameters
  for (const [key, value] of urlObj.searchParams.entries()) {
    params[key] = value;
  }

  // Required parameters
  const requiredParams = ['src', 'type', 'cat', 'ord'];

  // Sales-specific parameters
  const salesParams = ['qty', 'cost'];

  // Custom variables (u1-u100)
  const customVars = {};
  for (let i = 1; i <= 100; i++) {
    const key = `u${i}`;
    if (params[key]) {
      customVars[key] = params[key];
    }
  }

  // Determine if this is a Counter or Sales activity
  const hasSalesParams = params.qty || params.cost;
  const activityType = hasSalesParams ? 'Sales' : 'Counter';

  return {
    timestamp: new Date().toISOString(),
    url: url,
    activityType: activityType,
    required: {
      src: params.src || null,
      type: params.type || null,
      cat: params.cat || null,
      ord: params.ord || null
    },
    sales: {
      qty: params.qty || null,
      cost: params.cost || null
    },
    custom: customVars,
    allParams: params
  };
}

/**
 * Listen for Floodlight requests
 */
chrome.webRequest.onCompleted.addListener(
  (details) => {
    // Only capture if tracking is enabled
    if (!trackingEnabled) {
      return;
    }

    // Parse the Floodlight request
    const parsedData = parseFloodlightUrl(details.url);

    // Store the request for the specific tab
    capturedRequests[details.tabId] = parsedData;

    // If persistence is enabled, also save to chrome.storage.local
    if (persistData) {
      chrome.storage.local.set({
        [`floodlight_data_${details.tabId}`]: parsedData
      });
    }

    console.log('[Floodlight Debugger] Captured request:', parsedData);
  },
  {
    urls: ["https://fls.doubleclick.net/*"]
  }
);

/**
 * Listen for tab updates (page navigation)
 * Clear data when navigating to a new page (unless persistence is enabled)
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only act on navigation commit (page load start)
  if (changeInfo.status === 'loading' && changeInfo.url) {
    // If persistence is disabled, clear the data
    if (!persistData) {
      delete capturedRequests[tabId];
      chrome.storage.local.remove(`floodlight_data_${tabId}`);
      console.log(`[Floodlight Debugger] Cleared data for tab ${tabId} (new navigation)`);
    }
  }
});

/**
 * Listen for tab removal to clean up memory
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  delete capturedRequests[tabId];
  chrome.storage.local.remove(`floodlight_data_${tabId}`);
});

/**
 * Handle messages from popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getFloodlightData') {
    // Get current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;

        // First check in-memory storage
        if (capturedRequests[tabId]) {
          sendResponse({ data: capturedRequests[tabId] });
        } else if (persistData) {
          // If persistence is enabled, check chrome.storage
          chrome.storage.local.get([`floodlight_data_${tabId}`], (result) => {
            const data = result[`floodlight_data_${tabId}`] || null;
            sendResponse({ data: data });
          });
          return true; // Will respond asynchronously
        } else {
          sendResponse({ data: null });
        }
      } else {
        sendResponse({ data: null });
      }
    });
    return true; // Will respond asynchronously
  }

  if (request.action === 'clearData') {
    // Clear data for current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;
        delete capturedRequests[tabId];
        chrome.storage.local.remove(`floodlight_data_${tabId}`);
        sendResponse({ success: true });
      }
    });
    return true;
  }

  if (request.action === 'getSettings') {
    chrome.storage.local.get(['trackingEnabled', 'persistData'], (result) => {
      sendResponse({
        trackingEnabled: result.trackingEnabled !== undefined ? result.trackingEnabled : true,
        persistData: result.persistData || false
      });
    });
    return true;
  }

  if (request.action === 'updateSettings') {
    const settings = {};
    if (request.trackingEnabled !== undefined) {
      settings.trackingEnabled = request.trackingEnabled;
      trackingEnabled = request.trackingEnabled;
    }
    if (request.persistData !== undefined) {
      settings.persistData = request.persistData;
      persistData = request.persistData;
    }

    chrome.storage.local.set(settings, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
