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
const dataDisplay = document.getElementById('dataDisplay');

// Data display elements
const activityType = document.getElementById('activityType');
const timestamp = document.getElementById('timestamp');
const requiredParams = document.getElementById('requiredParams');
const salesParams = document.getElementById('salesParams');
const customParams = document.getElementById('customParams');
const customVarsSection = document.getElementById('customVarsSection');
const fullUrl = document.getElementById('fullUrl');

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
}

/**
 * Load Floodlight data from background script
 */
function loadFloodlightData() {
  console.log('[Popup] Requesting Floodlight data...');
  chrome.runtime.sendMessage({ action: 'getFloodlightData' }, (response) => {
    console.log('[Popup] Received response:', response);
    if (response && response.data) {
      console.log('[Popup] Displaying data:', response.data);
      displayData(response.data);
    } else {
      console.log('[Popup] No data, showing empty state');
      showNoDataState();
    }
  });
}

/**
 * Display Floodlight data in the UI
 */
function displayData(data) {
  noDataState.style.display = 'none';
  dataDisplay.style.display = 'block';

  // Activity Type
  activityType.textContent = data.activityType;
  activityType.className = 'badge ' + (data.activityType === 'Sales' ? 'badge-sales' : 'badge-counter');

  // Timestamp
  const date = new Date(data.timestamp);
  timestamp.textContent = formatTimestamp(date);

  // Required Parameters
  displayRequiredParams(data.required);

  // Sales Parameters
  displaySalesParams(data.sales);

  // Custom Variables
  displayCustomParams(data.custom);

  // Full URL
  fullUrl.textContent = data.url;
}

/**
 * Display required parameters table
 */
function displayRequiredParams(required) {
  requiredParams.innerHTML = '';

  const params = [
    { name: 'src', label: 'Floodlight Config ID', value: required.src },
    { name: 'type', label: 'Activity Group', value: required.type },
    { name: 'cat', label: 'Activity Tag', value: required.cat },
    { name: 'ord', label: 'Order/Random', value: required.ord }
  ];

  params.forEach(param => {
    const row = createParamRow(param.label, param.value, true);
    requiredParams.appendChild(row);
  });
}

/**
 * Display sales parameters table
 */
function displaySalesParams(sales) {
  salesParams.innerHTML = '';

  const params = [
    { name: 'qty', label: 'Quantity', value: sales.qty },
    { name: 'cost', label: 'Revenue', value: sales.cost }
  ];

  params.forEach(param => {
    const row = createParamRow(param.label, param.value, false);
    salesParams.appendChild(row);
  });
}

/**
 * Display custom variables table
 */
function displayCustomParams(custom) {
  customParams.innerHTML = '';

  const customKeys = Object.keys(custom);

  if (customKeys.length === 0) {
    customVarsSection.style.display = 'none';
    return;
  }

  customVarsSection.style.display = 'block';

  customKeys.sort((a, b) => {
    const numA = parseInt(a.substring(1));
    const numB = parseInt(b.substring(1));
    return numA - numB;
  });

  customKeys.forEach(key => {
    const row = createParamRow(key, custom[key], false);
    customParams.appendChild(row);
  });
}

/**
 * Create a parameter table row
 */
function createParamRow(label, value, isRequired) {
  const row = document.createElement('tr');

  // Parameter name cell
  const nameCell = document.createElement('td');
  nameCell.textContent = label;
  nameCell.className = 'param-name';

  // Value cell
  const valueCell = document.createElement('td');
  valueCell.className = 'param-value';

  if (value === null || value === undefined || value === '') {
    // Missing or empty value
    if (isRequired) {
      valueCell.innerHTML = '<span class="missing required">Missing (Required)</span>';
      row.className = 'row-error';
    } else {
      valueCell.innerHTML = '<span class="missing optional">-</span>';
      row.className = 'row-optional';
    }
  } else {
    // Value present
    valueCell.textContent = value;
    if (isRequired) {
      row.className = 'row-valid';
    } else {
      row.className = 'row-present';
    }
  }

  row.appendChild(nameCell);
  row.appendChild(valueCell);

  return row;
}

/**
 * Show no data state
 */
function showNoDataState() {
  noDataState.style.display = 'block';
  dataDisplay.style.display = 'none';
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

  // Clear data button
  clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clearData' }, () => {
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
