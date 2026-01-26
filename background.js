// Background service worker for Floodlight debugger
console.log('[Floodlight Debugger] Service worker starting...');

// In-memory storage for captured requests (per tab) - stores array of requests
let capturedRequests = {};

// Tracking state (enabled by default)
let trackingEnabled = true;

// Persistence setting (off by default)
let persistData = false;

// Initialize settings and restore captured data from storage
chrome.storage.local.get(null, (result) => {
  // Load settings
  if (result.trackingEnabled !== undefined) {
    trackingEnabled = result.trackingEnabled;
  }
  if (result.persistData !== undefined) {
    persistData = result.persistData;
  }

  // Restore captured requests from storage (service worker may have restarted)
  Object.keys(result).forEach(key => {
    if (key.startsWith('floodlight_data_')) {
      const tabId = parseInt(key.replace('floodlight_data_', ''));
      if (!isNaN(tabId) && Array.isArray(result[key])) {
        capturedRequests[tabId] = result[key];
        console.log(`[Floodlight Debugger] Restored ${result[key].length} requests for tab ${tabId} from storage`);
        // Update badge for restored tab
        updateBadgeForTab(tabId);
      }
    }
  });

  console.log('[Floodlight Debugger] Initialization complete. Captured requests restored:', Object.keys(capturedRequests).length, 'tabs');
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
    // If filter settings changed, update all tab badges
    if (changes.endpointFilter || changes.configIdFilter) {
      updateAllTabBadges();
    }
  }
});

/**
 * Apply filters to requests (same logic as popup.js)
 */
function applyFiltersToRequests(requests, endpointFilter, configIdFilter) {
  let filtered = requests;

  // Filter by endpoint type
  if (endpointFilter && endpointFilter !== 'both') {
    filtered = filtered.filter(data => data.endpointType === endpointFilter);
  }

  // Filter by config ID
  if (configIdFilter && configIdFilter !== 'all') {
    filtered = filtered.filter(data => data.required && data.required.src === configIdFilter);
  }

  return filtered;
}

/**
 * Update badge for a specific tab
 */
function updateBadgeForTab(tabId) {
  // Get filter settings from storage
  chrome.storage.local.get(['endpointFilter', 'configIdFilter'], (result) => {
    const endpointFilter = result.endpointFilter || 'both';
    const configIdFilter = result.configIdFilter || 'all';

    // Get requests for this tab
    const requests = capturedRequests[tabId] || [];

    // Apply filters
    const filteredRequests = applyFiltersToRequests(requests, endpointFilter, configIdFilter);
    const count = filteredRequests.length;

    // Update badge
    chrome.action.setBadgeText({
      tabId: tabId,
      text: count > 0 ? String(count) : '',
    });

    chrome.action.setBadgeBackgroundColor({
      tabId: tabId,
      color: '#667eea', // Match extension's purple theme
    });

    console.log(`[Floodlight Debugger] Updated badge for tab ${tabId}: ${count} requests`);
  });
}

/**
 * Update badges for all tabs with captured requests
 */
function updateAllTabBadges() {
  Object.keys(capturedRequests).forEach(tabId => {
    updateBadgeForTab(parseInt(tabId));
  });
}

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
    console.log('[Floodlight Debugger] Memory state:', Object.keys(capturedRequests));

    // Always persist to storage (to survive service worker restarts in Manifest V3)
    const storageKey = `floodlight_data_${details.tabId}`;
    chrome.storage.local.set({
      [storageKey]: capturedRequests[details.tabId]
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Floodlight Debugger] Storage save FAILED:', chrome.runtime.lastError);
      } else {
        console.log(`[Floodlight Debugger] Successfully saved to storage with key: ${storageKey}`);

        // Verify it was saved
        chrome.storage.local.get([storageKey], (result) => {
          if (result[storageKey]) {
            console.log(`[Floodlight Debugger] Verified: ${storageKey} has ${result[storageKey].length} requests in storage`);
          } else {
            console.error(`[Floodlight Debugger] Verification FAILED: ${storageKey} not found in storage!`);
          }
        });
      }
    });

    // Update badge count for this tab
    updateBadgeForTab(details.tabId);

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
      // Clear badge
      chrome.action.setBadgeText({ tabId: tabId, text: '' });
    }
  }
});

/**
 * Listen for tab removal to clean up memory
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  delete capturedRequests[tabId];
  chrome.storage.local.remove(`floodlight_data_${tabId}`);
  // Badge is automatically cleared when tab is removed
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
        if (capturedRequests[tabId] && capturedRequests[tabId].length > 0) {
          console.log('[Floodlight Debugger] Returning data from memory:', capturedRequests[tabId]);
          sendResponse({ data: capturedRequests[tabId] });
        } else {
          // If not in memory, check chrome.storage (may have survived service worker restart)
          console.log('[Floodlight Debugger] No memory data, checking storage...');
          chrome.storage.local.get([`floodlight_data_${tabId}`], (result) => {
            const data = result[`floodlight_data_${tabId}`] || null;
            console.log('[Floodlight Debugger] Storage data:', data);

            // Restore to memory if found in storage
            if (data && Array.isArray(data) && data.length > 0) {
              capturedRequests[tabId] = data;
              console.log('[Floodlight Debugger] Restored data to memory from storage');
            }

            sendResponse({ data: data });
          });
          return true; // Will respond asynchronously
        }
      } else {
        console.log('[Floodlight Debugger] No active tab found');
        sendResponse({ data: null });
      }
    });
    return true; // Will respond asynchronously
  }

  if (request.action === 'getAllFloodlightData') {
    console.log('[Floodlight Debugger] getAllFloodlightData request received');
    console.log('[Floodlight Debugger] Current memory state:', Object.keys(capturedRequests));
    console.log('[Floodlight Debugger] All captured requests by tab:', capturedRequests);

    // First, check if we need to restore any data from storage
    chrome.storage.local.get(null, (result) => {
      console.log('[Floodlight Debugger] All storage keys:', Object.keys(result));

      // Find all floodlight data keys
      const floodlightDataKeys = Object.keys(result).filter(key => key.startsWith('floodlight_data_'));
      console.log('[Floodlight Debugger] Floodlight data keys in storage:', floodlightDataKeys);

      // Restore any data from storage that's not in memory
      floodlightDataKeys.forEach(key => {
        const tabId = key.replace('floodlight_data_', '');
        if (Array.isArray(result[key])) {
          console.log(`[Floodlight Debugger] Found ${result[key].length} requests for tab ${tabId} in storage`);

          if (!capturedRequests[tabId]) {
            capturedRequests[tabId] = result[key];
            console.log(`[Floodlight Debugger] Restored ${result[key].length} requests for tab ${tabId} from storage`);
          } else {
            console.log(`[Floodlight Debugger] Tab ${tabId} already in memory with ${capturedRequests[tabId].length} requests`);
          }
        }
      });

      console.log('[Floodlight Debugger] Final memory state:', Object.keys(capturedRequests));

      // Aggregate data from all tabs
      let allData = [];
      Object.keys(capturedRequests).forEach(tabId => {
        if (capturedRequests[tabId] && Array.isArray(capturedRequests[tabId])) {
          console.log(`[Floodlight Debugger] Adding ${capturedRequests[tabId].length} requests from tab ${tabId}`);
          allData = allData.concat(capturedRequests[tabId]);
        }
      });

      console.log('[Floodlight Debugger] Total aggregated requests:', allData.length);

      // Sort by timestamp (most recent first)
      allData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Limit to 100 requests total
      if (allData.length > 100) {
        allData = allData.slice(0, 100);
      }

      console.log('[Floodlight Debugger] Returning aggregated data from all tabs:', allData.length, 'requests');
      console.log('[Floodlight Debugger] First few requests:', allData.slice(0, 3));
      sendResponse({ data: allData.length > 0 ? allData : null });
    });
    return true;
  }

  if (request.action === 'clearData') {
    // Clear data for all tabs
    console.log('[Floodlight Debugger] Clearing all data from all tabs');

    // Clear in-memory data and badges
    const tabIds = Object.keys(capturedRequests).map(id => parseInt(id));
    capturedRequests = {};

    // Clear badges for all tabs
    tabIds.forEach(tabId => {
      chrome.action.setBadgeText({ tabId: tabId, text: '' });
    });

    // Always clear persisted data from storage (since we always persist now)
    // First, get all storage keys to find all floodlight_data_* entries
    chrome.storage.local.get(null, (result) => {
      const keysToRemove = Object.keys(result).filter(key => key.startsWith('floodlight_data_'));

      if (keysToRemove.length > 0) {
        console.log('[Floodlight Debugger] Removing storage keys:', keysToRemove);
        chrome.storage.local.remove(keysToRemove, () => {
          console.log('[Floodlight Debugger] All data cleared from storage');
          sendResponse({ success: true });
        });
      } else {
        console.log('[Floodlight Debugger] No storage data to clear');
        sendResponse({ success: true });
      }
    });

    console.log('[Floodlight Debugger] Memory cleared');
    return true; // Will respond asynchronously
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
