# Floodlight DV360 Debugger

A Chrome Extension (Manifest V3) that helps debug Floodlight DV360 measurement requests in real-time.

## Purpose

This extension clearly answers the question:
**"Am I sending the correct Floodlight data payload — right now, on this page?"**

## Features

- **Real-time Floodlight Detection**: Automatically captures requests to `https://fls.doubleclick.net/*`
- **Parameter Parsing**: Extracts and displays all Floodlight parameters including:
  - Required parameters (src, type, cat, ord)
  - Sales-specific parameters (qty, cost)
  - Custom variables (u1-u100)
- **Visual Validation**: Color-coded display showing missing required parameters
- **Activity Type Detection**: Automatically identifies Counter vs Sales activities
- **Tracking Control**: Enable/disable tracking on demand
- **Data Persistence**: Optional data retention across page navigations
- **Clean Developer UI**: Easy-to-read parameter tables with validation indicators

## Installation

### Loading the Extension in Chrome

1. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/`
   - Or: Menu → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right corner

3. **Load Unpacked Extension**
   - Click "Load unpacked" button
   - Navigate to the `floodlight-chrome-extension` directory
   - Select the folder and click "Open"

4. **Verify Installation**
   - You should see "Floodlight DV360 Debugger" in your extensions list
   - The extension icon will appear in your Chrome toolbar

### Note on Extension Icons

The manifest references icon files (icon16.png, icon48.png, icon128.png) that are not included in this package. You have two options:

1. **Remove icon references**: Edit `manifest.json` and remove the `icons` and `action.default_icon` sections
2. **Add your own icons**: Create PNG icons in the specified sizes and add them to the extension directory

The extension will work without icons, though Chrome will show a default placeholder.

## Usage

### Basic Usage

1. **Open the Extension Popup**
   - Click the extension icon in your Chrome toolbar
   - The popup will open showing the main screen

2. **Navigate to a Page with Floodlight Tags**
   - Visit any page that fires Floodlight requests
   - The extension will automatically capture requests when they occur

3. **View Captured Data**
   - The most recent Floodlight request will be displayed
   - Parameters are organized into sections:
     - **Required Parameters**: Core Floodlight identifiers
     - **Sales Parameters**: Revenue and quantity data
     - **Custom Variables**: All u1-u100 parameters found
     - **Full Request URL**: Complete request for reference

### Visual Indicators

The extension uses color coding to help you quickly identify issues:

- **Green row** = Required parameter present and valid
- **Red row** = Required parameter missing (needs attention!)
- **Yellow row** = Optional parameter present
- **Grey row** = Optional parameter not present

### Tracking Control

**Enable/Disable Toggle** (Top of main screen)
- **ON (Green)**: Floodlight requests are being captured
- **OFF (Red)**: No requests are recorded
- Default state: Enabled

When tracking is disabled, no requests will be captured until you re-enable it.

### Data Management

**Clear Data Button**
- Clears all captured Floodlight data for the current tab
- Data is immediately removed from display
- Useful for testing multiple implementations

### Settings

Click the "Settings" button to access additional options:

**Persist Data Across Page Navigations**
- **OFF (Default)**: Data is cleared automatically on every new page load
- **ON**: Data is retained until you manually clear it

This is useful when:
- Testing single-page applications
- Debugging persistent tracking implementations
- Comparing data across multiple page views

## Testing the Extension

### Method 1: Using a Test Page

Create a simple HTML test page with Floodlight tags:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Floodlight Test Page</title>
</head>
<body>
  <h1>Floodlight Test Page</h1>

  <!-- Counter Floodlight -->
  <img src="https://fls.doubleclick.net/activityi;src=12345;type=counter;cat=testcat;ord=12345678?" width="1" height="1" alt=""/>

  <!-- Sales Floodlight -->
  <img src="https://fls.doubleclick.net/activityi;src=12345;type=sales;cat=purchase;qty=1;cost=99.99;u1=custom1;u2=custom2;ord=12345678?" width="1" height="1" alt=""/>

  <script>
    console.log('Floodlight tags loaded');
  </script>
</body>
</html>
```

Save this as `test.html` and open it in Chrome. The extension should capture both requests.

### Method 2: Using Chrome DevTools

1. Open Chrome DevTools (F12)
2. Go to the Network tab
3. Filter by "doubleclick.net"
4. Navigate to a page with Floodlight tags
5. Verify requests appear in both DevTools and the extension

### Method 3: Testing Missing Parameters

Create a test page with incomplete Floodlight data:

```html
<!-- Missing required parameters (type and cat) -->
<img src="https://fls.doubleclick.net/activityi;src=12345;ord=12345678?" width="1" height="1" alt=""/>
```

The extension should highlight the missing parameters in red.

### Expected Behavior

**Counter Activity Example:**
```
Activity Type: Counter
Timestamp: 14:23:45.123

Required Parameters:
✓ src: 12345 (green)
✓ type: counter (green)
✓ cat: testcat (green)
✓ ord: 12345678 (green)

Sales Parameters:
- qty: - (grey)
- cost: - (grey)
```

**Sales Activity Example:**
```
Activity Type: Sales
Timestamp: 14:23:46.456

Required Parameters:
✓ src: 12345 (green)
✓ type: sales (green)
✓ cat: purchase (green)
✓ ord: 12345678 (green)

Sales Parameters:
✓ qty: 1 (yellow)
✓ cost: 99.99 (yellow)

Custom Variables:
✓ u1: custom1
✓ u2: custom2
```

## Troubleshooting

### No Requests Are Being Captured

1. **Check tracking is enabled**: Ensure the toggle is ON (green)
2. **Verify Floodlight tags are firing**: Check Chrome DevTools Network tab
3. **Check permissions**: Ensure the extension has permission to access the page
4. **Reload the extension**: Go to `chrome://extensions/` and click the refresh icon

### Data Not Persisting

1. Check the "Persist data across page navigations" setting
2. Verify the setting is saved (toggle should remain ON after closing popup)
3. Note: By default, data is cleared on navigation (this is intended behavior)

### Extension Not Loading

1. Verify all files are present in the directory
2. Check the console for errors at `chrome://extensions/`
3. Ensure you're using Chrome (Manifest V3 support required)
4. Try removing and re-adding the extension

## Technical Details

### Architecture

- **Manifest V3**: Uses modern extension architecture
- **Service Worker**: Background script runs in service worker for efficiency
- **chrome.webRequest**: Intercepts network requests to Floodlight endpoints
- **chrome.storage.local**: Persists settings and optional data
- **chrome.tabs**: Monitors navigation for data lifecycle management

### Data Lifecycle

**Default Mode (Persistence OFF):**
1. Request captured → Stored in memory
2. Page navigation → Data cleared automatically
3. Tab closed → Data cleared

**Persistence Mode (Persistence ON):**
1. Request captured → Stored in memory AND chrome.storage.local
2. Page navigation → Data retained
3. Tab closed → Data cleared
4. Manual clear → User clicks "Clear Data" button

### Performance

- Minimal performance impact (only monitors specific URLs)
- In-memory storage for fast access
- Automatic cleanup on tab close
- No continuous polling (event-driven)

## File Structure

```
/floodlight-chrome-extension
├── manifest.json          # Extension configuration (Manifest V3)
├── background.js          # Service worker for request interception
├── popup.html            # Popup UI structure
├── popup.js              # Popup logic and interactions
├── popup.css             # Styling and visual cues
└── README.md             # This file
```

## Development

### Extending the Extension

**Adding New Parameters:**
Edit `background.js` → `parseFloodlightUrl()` function to extract additional parameters.

**Customizing UI:**
Edit `popup.css` to change colors, layouts, or add new visual elements.

**Adding Features:**
- Modify `background.js` for new background logic
- Modify `popup.js` and `popup.html` for new UI features

### Debugging

View console logs:
- Background script: `chrome://extensions/` → Click "service worker" under the extension
- Popup script: Right-click extension icon → "Inspect popup"

## Browser Compatibility

- **Chrome**: Fully supported (Manifest V3)
- **Edge**: Supported (Chromium-based)
- **Firefox**: Not supported (requires Manifest V2 adaptation)
- **Safari**: Not supported

## License

This extension is provided as-is for debugging and development purposes.

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Verify all files are present and correctly formatted
3. Check browser console for error messages
4. Ensure you're using a compatible Chrome version (v88+)

---

**Happy Debugging!** 🚀
