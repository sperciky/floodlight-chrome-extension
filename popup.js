// Popup UI logic for Floodlight debugger

// DOM Elements
const mainScreen = document.getElementById('mainScreen');
const settingsScreen = document.getElementById('settingsScreen');
const trackingToggle = document.getElementById('trackingToggle');
const trackingStatus = document.getElementById('trackingStatus');
const persistToggle = document.getElementById('persistToggle');
const clearBtn = document.getElementById('clearBtn');
const settingsBtn = document.getElementById('settingsBtn');
const backBtn = document.getElementById('backBtn');
const noDataState = document.getElementById('noDataState');
const accordionContainer = document.getElementById('accordionContainer');
const endpointFilter = document.getElementById('endpointFilter');
const configIdFilter = document.getElementById('configIdFilter');

// Track which accordion is currently open
let currentOpenIndex = null;
let lastDataLength = 0;

// Store all data (unfiltered)
let allFloodlightData = [];

// Current filter settings
let filters = {
  endpoint: 'both',
  configId: 'all'
};

/**
 * Initialize the popup
 */
function init() {
  loadSettings();
  loadFloodlightData();
  setupEventListeners();
}

/**
 * Load settings from storage
 */
function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    if (response) {
      trackingToggle.checked = response.trackingEnabled;
      updateTrackingStatus(response.trackingEnabled);

      persistToggle.checked = response.persistData;
    }
  });

  // Load filter preferences
  chrome.storage.local.get(['endpointFilter', 'configIdFilter'], (result) => {
    if (result.endpointFilter) {
      filters.endpoint = result.endpointFilter;
      endpointFilter.value = result.endpointFilter;
    }
    if (result.configIdFilter) {
      filters.configId = result.configIdFilter;
      configIdFilter.value = result.configIdFilter;
    }
  });
}

/**
 * Load Floodlight data from background script
 */
function loadFloodlightData() {
  console.log('[Popup] Requesting Floodlight data...');
  chrome.runtime.sendMessage({ action: 'getFloodlightData' }, (response) => {
    console.log('[Popup] Received response:', response);
    if (response && response.data && Array.isArray(response.data) && response.data.length > 0) {
      console.log('[Popup] Displaying data:', response.data);

      // Store all data
      allFloodlightData = response.data;

      // Update config ID dropdown
      updateConfigIdDropdown(response.data);

      // Apply filters and display
      const filteredData = applyFilters(response.data);
      displayAccordions(filteredData);
    } else {
      console.log('[Popup] No data, showing empty state');
      allFloodlightData = [];
      showNoDataState();
    }
  });
}

/**
 * Apply filters to data array
 */
function applyFilters(dataArray) {
  let filtered = dataArray;

  // Filter by endpoint type
  if (filters.endpoint !== 'both') {
    filtered = filtered.filter(data => data.endpointType === filters.endpoint);
  }

  // Filter by config ID
  if (filters.configId !== 'all') {
    filtered = filtered.filter(data => data.required.src === filters.configId);
  }

  return filtered;
}

/**
 * Update config ID dropdown with unique IDs from data
 */
function updateConfigIdDropdown(dataArray) {
  // Extract unique config IDs
  const configIds = new Set();
  dataArray.forEach(data => {
    if (data.required.src) {
      configIds.add(data.required.src);
    }
  });

  // Get current selection
  const currentSelection = configIdFilter.value;

  // Rebuild dropdown
  configIdFilter.innerHTML = '<option value="all">All IDs</option>';

  // Sort IDs and add to dropdown
  Array.from(configIds).sort().forEach(id => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    if (id === currentSelection) {
      option.selected = true;
    }
    configIdFilter.appendChild(option);
  });
}

/**
 * Display multiple Floodlight requests as accordions
 */
function displayAccordions(dataArray) {
  noDataState.style.display = 'none';
  accordionContainer.style.display = 'block';

  // Only rebuild if data length changed (new requests added)
  if (dataArray.length === lastDataLength) {
    return; // No changes, keep existing accordions with their state
  }

  // Store which accordion was open before rebuilding
  const wasOpen = currentOpenIndex;

  // Rebuild accordions
  accordionContainer.innerHTML = '';

  dataArray.forEach((data, index) => {
    const accordionItem = createAccordionItem(data, index);
    accordionContainer.appendChild(accordionItem);

    // Restore open state if this was the open accordion
    // Or auto-open the first (newest) item if it's new
    if (index === wasOpen || (wasOpen === null && index === 0 && dataArray.length > lastDataLength)) {
      accordionItem.classList.add('active');
      currentOpenIndex = index;
    }
  });

  lastDataLength = dataArray.length;
}

/**
 * Create an accordion item for a single Floodlight request
 */
function createAccordionItem(data, index) {
  const accordion = document.createElement('div');
  accordion.className = 'accordion-item';
  accordion.dataset.index = index;

  // Create accordion header with title format: "activity_group (config_id)"
  const title = `${data.required.type || 'unknown'} (${data.required.src || 'unknown'})`;

  // Determine endpoint badge text and class
  const endpointBadge = data.endpointType === 'fls' ? 'FLS' :
                        data.endpointType === 'ad' ? 'AD' :
                        'UNKNOWN';
  const endpointClass = data.endpointType || 'unknown';

  accordion.innerHTML = `
    <div class="accordion-header">
      <div class="accordion-title">
        <span class="accordion-position">#${index + 1}</span>
        <span class="accordion-name">${title}</span>
        <span class="accordion-badge ${data.activityType.toLowerCase()}">${data.activityType}</span>
        <span class="accordion-badge endpoint-${endpointClass}">${endpointBadge}</span>
      </div>
      <div class="accordion-timestamp">${formatTimestamp(new Date(data.timestamp))}</div>
      <span class="accordion-arrow">▼</span>
    </div>
    <div class="accordion-body">
      ${createAccordionBody(data)}
    </div>
  `;

  // Add click handler to header
  const header = accordion.querySelector('.accordion-header');
  header.addEventListener('click', () => toggleAccordion(accordion));

  return accordion;
}

/**
 * Create the body content for an accordion
 */
function createAccordionBody(data) {
  let html = '';

  // Required Parameters Section
  html += `
    <div class="param-section">
      <h4>Required Parameters</h4>
      <table class="param-table">
        <tbody>
          ${createParamRow('Floodlight Config ID', data.required.src, true)}
          ${createParamRow('Activity Group', data.required.type, true)}
          ${createParamRow('Activity Tag', data.required.cat, true)}
          ${createParamRow('Order/Random', data.required.ord, true)}
        </tbody>
      </table>
    </div>
  `;

  // Sales Parameters Section
  const hasSalesParams = data.sales.qty || data.sales.cost;
  html += `
    <div class="param-section">
      <h4>Sales Parameters</h4>
      <table class="param-table">
        <tbody>
          ${createParamRow('Quantity', data.sales.qty, false)}
          ${createParamRow('Revenue', data.sales.cost, false)}
        </tbody>
      </table>
    </div>
  `;

  // Custom Variables Section
  const customKeys = Object.keys(data.custom);
  if (customKeys.length > 0) {
    html += `
      <div class="param-section">
        <h4>Custom Variables (${customKeys.length})</h4>
        <table class="param-table">
          <tbody>
    `;

    customKeys.sort((a, b) => {
      const numA = parseInt(a.substring(1));
      const numB = parseInt(b.substring(1));
      return numA - numB;
    });

    customKeys.forEach(key => {
      html += createParamRow(key, data.custom[key], false);
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
  }

  // Full URL Section
  html += `
    <div class="param-section">
      <h4>Full Request URL</h4>
      <div class="url-box">
        <code>${escapeHtml(data.url)}</code>
      </div>
    </div>
  `;

  return html;
}

/**
 * Create a parameter table row
 */
function createParamRow(label, value, isRequired) {
  const hasValue = value !== null && value !== undefined && value !== '';
  let rowClass = '';
  let valueContent = '';

  if (!hasValue) {
    if (isRequired) {
      rowClass = 'row-error';
      valueContent = '<span class="missing required">Missing (Required)</span>';
    } else {
      rowClass = 'row-optional';
      valueContent = '<span class="missing optional">-</span>';
    }
  } else {
    rowClass = isRequired ? 'row-valid' : 'row-present';
    valueContent = `<span>${escapeHtml(String(value))}</span>`;
  }

  return `
    <tr class="${rowClass}">
      <td class="param-name">${escapeHtml(label)}</td>
      <td class="param-value">${valueContent}</td>
    </tr>
  `;
}

/**
 * Toggle accordion open/closed
 */
function toggleAccordion(accordion) {
  const isActive = accordion.classList.contains('active');
  const index = parseInt(accordion.dataset.index);

  if (isActive) {
    // Close this accordion
    accordion.classList.remove('active');
    currentOpenIndex = null;
  } else {
    // Close all other accordions
    document.querySelectorAll('.accordion-item.active').forEach(item => {
      item.classList.remove('active');
    });

    // Open this accordion
    accordion.classList.add('active');
    currentOpenIndex = index;
  }
}

/**
 * Show no data state
 */
function showNoDataState() {
  noDataState.style.display = 'block';
  accordionContainer.style.display = 'none';
  currentOpenIndex = null;
  lastDataLength = 0;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');

  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Update tracking status text and style
 */
function updateTrackingStatus(enabled) {
  if (enabled) {
    trackingStatus.textContent = 'Tracking Enabled';
    trackingStatus.className = 'status-text enabled';
  } else {
    trackingStatus.textContent = 'Tracking Disabled';
    trackingStatus.className = 'status-text disabled';
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Tracking toggle
  trackingToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    updateTrackingStatus(enabled);

    chrome.runtime.sendMessage({
      action: 'updateSettings',
      trackingEnabled: enabled
    });
  });

  // Persistence toggle
  persistToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;

    chrome.runtime.sendMessage({
      action: 'updateSettings',
      persistData: enabled
    });
  });

  // Endpoint filter
  endpointFilter.addEventListener('change', (e) => {
    filters.endpoint = e.target.value;
    chrome.storage.local.set({ endpointFilter: e.target.value });

    // Reapply filters and update display
    const filteredData = applyFilters(allFloodlightData);
    lastDataLength = -1; // Force rebuild
    displayAccordions(filteredData);
  });

  // Config ID filter
  configIdFilter.addEventListener('change', (e) => {
    filters.configId = e.target.value;
    chrome.storage.local.set({ configIdFilter: e.target.value });

    // Reapply filters and update display
    const filteredData = applyFilters(allFloodlightData);
    lastDataLength = -1; // Force rebuild
    displayAccordions(filteredData);
  });

  // Clear data button
  clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clearData' }, () => {
      allFloodlightData = [];
      showNoDataState();
    });
  });

  // Settings button
  settingsBtn.addEventListener('click', () => {
    mainScreen.classList.remove('active');
    settingsScreen.classList.add('active');
  });

  // Back button
  backBtn.addEventListener('click', () => {
    settingsScreen.classList.remove('active');
    mainScreen.classList.add('active');
  });

  // Refresh data every second when popup is open
  setInterval(loadFloodlightData, 1000);
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', init);
