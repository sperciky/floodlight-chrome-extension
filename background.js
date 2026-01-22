// Background service worker for Floodlight debugger
console.log('[Floodlight Debugger] Service worker starting...');

// In-memory storage for captured requests (per tab) - stores array of requests
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
 * Floodlight uses semicolon-separated parameters in the URL path
 * Example: https://12345.fls.doubleclick.net/activityi;src=12345;type=counter;cat=test;ord=123
 * @param {string} url - The full request URL
 * @returns {Object} - Parsed parameters
 */
function parseFloodlightUrl(url) {
  const urlObj = new URL(url);
  const params = {};

  // Extract parameters from the URL path (semicolon-separated)
  // Floodlight parameters come after /activity or /activityi in the path
  const pathname = urlObj.pathname;

  // Find the part after /activity or /activityi
  const activityMatch = pathname.match(/\/activity[^;]*(;.*)/);
  if (activityMatch && activityMatch[1]) {
    // Split by semicolons and parse key=value pairs
    const pathParams = activityMatch[1].substring(1); // Remove leading semicolon
    const paramPairs = pathParams.split(';');

    paramPairs.forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value !== undefined) {
        params[key] = decodeURIComponent(value);
      }
    });
  }

  // Also extract standard query string parameters (after ?)
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

  // Determine endpoint type (fls.doubleclick.net vs ad.doubleclick.net)
  let endpointType = 'unknown';
  if (url.includes('fls.doubleclick.net')) {
    endpointType = 'fls';
  } else if (url.includes('ad.doubleclick.net')) {
    endpointType = 'ad';
  }

  return {
    timestamp: new Date().toISOString(),
    url: url,
    activityType: activityType,
    endpointType: endpointType,
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
console.log('[Floodlight Debugger] Setting up webRequest listeners...');

// Test listener for ALL requests to see if webRequest is working at all
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.url.includes('doubleclick')) {
      console.log('[Floodlight Debugger] onBeforeRequest - Doubleclick request detected!', details.url);
    }
  },
  { urls: ["<all_urls>"] }
);

// Main listener for completed Floodlight requests
chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log('[Floodlight Debugger] onCompleted FIRED for:', details.url.substring(0, 100));

    // Filter for Floodlight/doubleclick URLs only
    if (!details.url.includes('doubleclick.net')) {
      console.log('[Floodlight Debugger] onCompleted - Not a doubleclick URL, skipping');
      return;
    }

    // Filter for activity endpoints only (not favicon, etc)
    // Note: Floodlight uses both /activity and /activityi
    if (!details.url.includes('/activity') && !details.url.includes('/activityi')) {
      console.log('[Floodlight Debugger] onCompleted - Not an activity URL, skipping');
      return;
    }

    console.log('[Floodlight Debugger] onCompleted - Request intercepted!', details.url);
    console.log('[Floodlight Debugger] Tracking enabled:', trackingEnabled);
    console.log('[Floodlight Debugger] Tab ID:', details.tabId);

    // Only capture if tracking is enabled
    if (!trackingEnabled) {
      console.log('[Floodlight Debugger] Tracking disabled, skipping');
      return;
    }

    // Parse the Floodlight request
    const parsedData = parseFloodlightUrl(details.url);
    console.log('[Floodlight Debugger] Parsed data:', parsedData);

    // Initialize array for this tab if it doesn't exist
    if (!capturedRequests[details.tabId]) {
      capturedRequests[details.tabId] = [];
    }

    // Add the new request to the beginning of the array (most recent first)
    capturedRequests[details.tabId].unshift(parsedData);

    // Limit to last 50 requests per tab to avoid memory issues
    if (capturedRequests[details.tabId].length > 50) {
      capturedRequests[details.tabId] = capturedRequests[details.tabId].slice(0, 50);
    }

    console.log('[Floodlight Debugger] Stored in memory for tab', details.tabId, `(Total: ${capturedRequests[details.tabId].length})`);

    // If persistence is enabled, also save to chrome.storage.local
    if (persistData) {
      chrome.storage.local.set({
        [`floodlight_data_${details.tabId}`]: capturedRequests[details.tabId]
      });
      console.log('[Floodlight Debugger] Saved to storage');
    }

    console.log('[Floodlight Debugger] Request captured successfully');
  },
  { urls: ["<all_urls>"] }
);

// Error listener to catch failed/cancelled requests
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.url.includes('doubleclick')) {
      console.log('[Floodlight Debugger] onErrorOccurred - Request failed/cancelled!', details.url);
      console.log('[Floodlight Debugger] Error details:', details.error);
    }
  },
  { urls: ["<all_urls>"] }
);

// Additional test listener with onResponseStarted
chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    if (details.url.includes('doubleclick')) {
      console.log('[Floodlight Debugger] onResponseStarted - Doubleclick response!', details.url);
    }
  },
  { urls: ["<all_urls>"] }
);

console.log('[Floodlight Debugger] All webRequest listeners registered');

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
    console.log('[Floodlight Debugger] getFloodlightData request received');
    console.log('[Floodlight Debugger] All captured requests by tab:', capturedRequests);
    console.log('[Floodlight Debugger] Available tab IDs:', Object.keys(capturedRequests));

    // Get current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;
        console.log('[Floodlight Debugger] Current tab ID:', tabId);
        console.log('[Floodlight Debugger] Current tab URL:', tabs[0].url);
        console.log('[Floodlight Debugger] Data exists for this tab:', !!capturedRequests[tabId]);

        if (capturedRequests[tabId]) {
          console.log('[Floodlight Debugger] Found', capturedRequests[tabId].length, 'requests in memory');
        }

        // First check in-memory storage
        if (capturedRequests[tabId]) {
          console.log('[Floodlight Debugger] Returning data from memory:', capturedRequests[tabId]);
          sendResponse({ data: capturedRequests[tabId] });
        } else if (persistData) {
          // If persistence is enabled, check chrome.storage
          console.log('[Floodlight Debugger] No memory data, checking storage...');
          chrome.storage.local.get([`floodlight_data_${tabId}`], (result) => {
            const data = result[`floodlight_data_${tabId}`] || null;
            console.log('[Floodlight Debugger] Storage data:', data);
            sendResponse({ data: data });
          });
          return true; // Will respond asynchronously
        } else {
          console.log('[Floodlight Debugger] No data found for tab', tabId);
          console.log('[Floodlight Debugger] Available tabs with data:', Object.keys(capturedRequests));
          sendResponse({ data: null });
        }
      } else {
        console.log('[Floodlight Debugger] No active tab found');
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
