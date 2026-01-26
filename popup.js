// Popup UI logic for Floodlight debugger

// DOM Elements
const mainScreen = document.getElementById('mainScreen');
const settingsScreen = document.getElementById('settingsScreen');
const trackingToggle = document.getElementById('trackingToggle');
const trackingStatus = document.getElementById('trackingStatus');
const persistToggle = document.getElementById('persistToggle');
const persistToggleHeader = document.getElementById('persistToggleHeader');
const detachBtn = document.getElementById('detachBtn');
const clearBtn = document.getElementById('clearBtn');
const settingsBtn = document.getElementById('settingsBtn');
const backBtn = document.getElementById('backBtn');
const noDataState = document.getElementById('noDataState');
const accordionContainer = document.getElementById('accordionContainer');
const endpointToggleButtons = document.querySelectorAll('.three-state-toggle .toggle-option');
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

// Templates for enriching display
let templates = {};

/**
 * Initialize the popup
 */
function init() {
  loadSettings();
  loadTemplates();
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
      if (persistToggleHeader) {
        persistToggleHeader.checked = response.persistData;
      }
    }
  });

  // Load filter preferences
  chrome.storage.local.get(['endpointFilter', 'configIdFilter'], (result) => {
    if (result.endpointFilter) {
      filters.endpoint = result.endpointFilter;
      // Update three-state toggle
      endpointToggleButtons.forEach(btn => {
        if (btn.dataset.value === result.endpointFilter) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
    if (result.configIdFilter) {
      filters.configId = result.configIdFilter;
      configIdFilter.value = result.configIdFilter;
    }
  });
}

/**
 * Load templates from storage
 */
function loadTemplates() {
  chrome.storage.local.get(['floodlightTemplates'], (result) => {
    templates = result.floodlightTemplates || {};
    console.log('[Popup] Loaded templates:', templates);
  });
}

/**
 * Load Floodlight data from background script
 * Always shows data from all browser tabs
 */
function loadFloodlightData() {
  console.log('[Popup] Requesting Floodlight data from all tabs...');

  // Request data from all tabs
  chrome.runtime.sendMessage({ action: 'getAllFloodlightData' }, (response) => {
    console.log('[Popup] Received response:', response);

    if (!response) {
      console.error('[Popup] No response from background script!');
      allFloodlightData = [];
      showNoDataState();
      return;
    }

    if (!response.data) {
      console.log('[Popup] Response has no data property');
      allFloodlightData = [];
      showNoDataState();
      return;
    }

    if (!Array.isArray(response.data)) {
      console.error('[Popup] Response data is not an array:', typeof response.data);
      allFloodlightData = [];
      showNoDataState();
      return;
    }

    console.log('[Popup] Response data length:', response.data.length);

    if (response.data.length > 0) {
      console.log('[Popup] Displaying data:', response.data);
      console.log('[Popup] First request:', response.data[0]);

      // Store all data
      allFloodlightData = response.data;

      // Update config ID dropdown
      updateConfigIdDropdown(response.data);

      // Apply filters and display
      console.log('[Popup] Current filters:', filters);
      const filteredData = applyFilters(response.data);
      console.log('[Popup] Filtered data length:', filteredData.length);

      if (filteredData.length > 0) {
        displayAccordions(filteredData);
      } else {
        console.log('[Popup] All data filtered out, showing empty state');
        showNoDataState();
      }
    } else {
      console.log('[Popup] Response data is empty array');
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

    // Restore open state only if this was the previously open accordion
    if (index === wasOpen) {
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

  // Get template for this config ID
  const template = templates[data.required.src];

  // Try to find matching activity in activities mapping
  let activityName = null;
  let matchedActivity = null;
  if (template && template.activities) {
    // Find activity by matching floodlight_id, group_tag_string, and activity_tag_string
    for (const [key, activity] of Object.entries(template.activities)) {
      if (activity.floodlight_id === data.required.src &&
          activity.group_tag_string === data.required.type &&
          activity.activity_tag_string === data.required.cat) {
        activityName = activity.name;
        matchedActivity = activity;
        break;
      }
    }
  }

  // Check if expected parameters are missing or undefined
  let hasMissingParams = false;
  let hasUndefinedParams = false;

  // First, check expected parameters (if activity is defined)
  if (matchedActivity && matchedActivity.custom_parameters && Array.isArray(matchedActivity.custom_parameters)) {
    matchedActivity.custom_parameters.forEach(param => {
      const customValue = data.custom[param];
      const salesValue = data.sales[param];
      const allParams = { ...data.custom, ...data.sales };

      // Check if parameter exists in the payload at all
      if (!(param in allParams)) {
        hasMissingParams = true;
      }
      // Check if parameter exists but has undefined/null value
      else if (!customValue && !salesValue ||
               customValue === 'undefined' || customValue === 'null' ||
               salesValue === 'undefined' || salesValue === 'null') {
        hasUndefinedParams = true;
      }
    });
  }

  // Also check ALL custom and sales parameters for string "undefined" or "null"
  // This catches undefined values even when no template is configured
  if (!hasUndefinedParams) {
    const allParams = { ...data.custom, ...data.sales };
    Object.values(allParams).forEach(value => {
      if (value === 'undefined' || value === 'null' || value === '') {
        hasUndefinedParams = true;
      }
    });
  }

  // If no activity match, fall back to activityGroups mapping for cat parameter
  let displayName = activityName;
  if (!displayName && template && template.activityGroups && data.required.cat) {
    displayName = template.activityGroups[data.required.cat];
  }
  // Final fallback to raw cat value
  if (!displayName) {
    displayName = data.required.cat || 'unknown';
  }

  // Create accordion header with title format: "activity_name (config_id)"
  const title = `${displayName} (${data.required.src || 'unknown'})`;

  // Determine endpoint badge text and class
  const endpointBadge = data.endpointType === 'fls' ? 'FLS' :
                        data.endpointType === 'ad' ? 'AD' :
                        'UNKNOWN';
  const endpointClass = data.endpointType || 'unknown';

  // Warning badges for missing and undefined parameters
  const missingBadge = hasMissingParams ? '<span class="accordion-badge params-missing">⊘ Params Missing</span>' : '';
  const undefinedBadge = hasUndefinedParams ? '<span class="accordion-badge params-undefined">⚠ Undefined Value</span>' : '';

  accordion.innerHTML = `
    <div class="accordion-header">
      <div class="accordion-title">
        <span class="accordion-position">#${index + 1}</span>
        <span class="accordion-name">${title}</span>
        <span class="accordion-badge ${data.activityType.toLowerCase()}">${data.activityType}</span>
        <span class="accordion-badge endpoint-${endpointClass}">${endpointBadge}</span>
        ${missingBadge}
        ${undefinedBadge}
      </div>
      <div class="accordion-timestamp">${formatTimestamp(new Date(data.timestamp))}</div>
      <span class="accordion-arrow">▼</span>
    </div>
    <div class="accordion-body">
      ${createAccordionBody(data, matchedActivity)}
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
function createAccordionBody(data, matchedActivity = null) {
  let html = '';

  // Get template for this config ID
  const template = templates[data.required.src];

  // Get activity name from matched activity
  let activityName = matchedActivity ? matchedActivity.name : null;

  // Enrich Activity Group label
  let activityGroupLabel = 'Activity Group';
  if (activityName) {
    activityGroupLabel = `Activity Group (${activityName})`;
  } else if (template && template.activityGroups && data.required.type) {
    const mappedName = template.activityGroups[data.required.type];
    if (mappedName) {
      activityGroupLabel = `Activity Group (${mappedName})`;
    }
  }

  // Enrich Activity Tag label
  let activityTagLabel = 'Activity Tag';
  if (activityName) {
    activityTagLabel = `Activity Tag (${activityName})`;
  } else if (template && template.activityGroups && data.required.cat) {
    const mappedName = template.activityGroups[data.required.cat];
    if (mappedName) {
      activityTagLabel = `Activity Tag (${mappedName})`;
    }
  }

  // Required Parameters Section
  html += `
    <div class="param-section">
      <h4>Required Parameters</h4>
      <table class="param-table">
        <tbody>
          ${createParamRow('Floodlight Config ID', data.required.src, true)}
          ${createParamRow(activityGroupLabel, data.required.type, true)}
          ${createParamRow(activityTagLabel, data.required.cat, true)}
          ${createParamRow('Order/Random', data.required.ord, true)}
        </tbody>
      </table>
    </div>
  `;

  // Expected Parameters Section (if activity has custom_parameters defined)
  if (matchedActivity && matchedActivity.custom_parameters && Array.isArray(matchedActivity.custom_parameters)) {
    const expectedParams = matchedActivity.custom_parameters;
    html += `
      <div class="param-section">
        <h4>Expected Parameters (${expectedParams.length})</h4>
        <table class="param-table">
          <tbody>
    `;

    expectedParams.forEach(param => {
      // Check custom parameters first, then sales parameters
      const customValue = data.custom[param];
      const salesValue = data.sales[param];
      const value = customValue || salesValue;
      const allParams = { ...data.custom, ...data.sales };

      // Get friendly name from template if available
      let paramLabel = param;
      if (template && template.customParams && template.customParams[param]) {
        paramLabel = `${param} (${template.customParams[param]})`;
      }

      // Check if parameter is missing from payload entirely
      if (!(param in allParams)) {
        html += `
          <tr class="row-missing">
            <td class="param-name">${escapeHtml(paramLabel)}</td>
            <td class="param-value"><span class="missing-param">⊘ Not in Payload</span></td>
          </tr>
        `;
      }
      // Check if parameter exists but has undefined/null value
      else if (!value || value === 'undefined' || value === 'null') {
        html += `
          <tr class="row-undefined">
            <td class="param-name">${escapeHtml(paramLabel)}</td>
            <td class="param-value"><span class="undefined-param">⚠ Undefined/Null</span></td>
          </tr>
        `;
      }
      // Parameter exists and has a valid value
      else {
        html += `
          <tr class="row-valid">
            <td class="param-name">${escapeHtml(paramLabel)}</td>
            <td class="param-value"><span>${escapeHtml(String(value))}</span></td>
          </tr>
        `;
      }
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
  }

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
      // Enrich custom parameter label if template exists
      let paramLabel = key;
      if (template && template.customParams && template.customParams[key]) {
        paramLabel = `${key} (${template.customParams[key]})`;
      }
      html += createParamRow(paramLabel, data.custom[key], false);
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

  // Persistence toggle (in settings screen)
  if (persistToggle) {
    persistToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;

      chrome.runtime.sendMessage({
        action: 'updateSettings',
        persistData: enabled
      });

      // Sync with header toggle
      if (persistToggleHeader) {
        persistToggleHeader.checked = enabled;
      }
    });
  }

  // Persistence toggle (in header)
  if (persistToggleHeader) {
    persistToggleHeader.addEventListener('change', (e) => {
      const enabled = e.target.checked;

      chrome.runtime.sendMessage({
        action: 'updateSettings',
        persistData: enabled
      });

      // Sync with settings toggle
      if (persistToggle) {
        persistToggle.checked = enabled;
      }
    });
  }

  // Detach button - open debugger in separate window
  if (detachBtn) {
    detachBtn.addEventListener('click', () => {
      chrome.windows.create({
        url: chrome.runtime.getURL('detached.html'),
        type: 'popup',
        width: 800,
        height: 600
      });
    });
  }

  // Endpoint toggle (three-state)
  endpointToggleButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const value = e.target.dataset.value;

      // Update active state
      endpointToggleButtons.forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');

      // Update filter
      filters.endpoint = value;
      chrome.storage.local.set({ endpointFilter: value });

      // Reapply filters and update display
      const filteredData = applyFilters(allFloodlightData);
      lastDataLength = -1; // Force rebuild
      displayAccordions(filteredData);
    });
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

  // Settings button - open settings page in new window
  settingsBtn.addEventListener('click', () => {
    chrome.windows.create({
      url: chrome.runtime.getURL('settings.html'),
      type: 'popup',
      width: 1000,
      height: 700
    });
  });

  // Listen for template changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.floodlightTemplates) {
      console.log('[Popup] Templates updated, reloading...');
      loadTemplates();
      // Force refresh display to show enriched labels
      lastDataLength = -1;
      const filteredData = applyFilters(allFloodlightData);
      displayAccordions(filteredData);
    }
  });

  // Refresh data every second when popup is open
  setInterval(loadFloodlightData, 1000);
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', init);
