// Settings page for managing account templates

let templates = {};
let currentEditingId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadTemplates();
  attachEventListeners();
});

function attachEventListeners() {
  document.getElementById('backBtn').addEventListener('click', () => {
    window.close();
  });

  document.getElementById('addTemplateBtn').addEventListener('click', () => {
    showFormView();
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    exportTemplates();
  });

  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', (e) => {
    importTemplates(e.target.files[0]);
  });

  document.getElementById('cancelBtn').addEventListener('click', () => {
    showListView();
  });

  document.getElementById('cancelBtn2').addEventListener('click', () => {
    showListView();
  });

  document.getElementById('templateForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveTemplate();
  });

  document.getElementById('deleteBtn').addEventListener('click', () => {
    deleteTemplate();
  });
}

// Load templates from storage
function loadTemplates() {
  chrome.storage.local.get(['floodlightTemplates'], (result) => {
    templates = result.floodlightTemplates || {};
    renderTemplateList();
  });
}

// Render template list
function renderTemplateList() {
  const templateList = document.getElementById('templateList');
  const templateIds = Object.keys(templates);

  if (templateIds.length === 0) {
    templateList.innerHTML = `
      <div class="empty-state">
        <p>No templates configured yet.</p>
        <p class="help-text">Create a template to enrich Floodlight data with custom parameter names and activity group mappings.</p>
      </div>
    `;
    return;
  }

  templateList.innerHTML = templateIds.map(configId => {
    const template = templates[configId];
    const customParamCount = Object.keys(template.customParams || {}).length;
    const activityGroupCount = Object.keys(template.activityGroups || {}).length;

    return `
      <div class="template-card" data-config-id="${configId}">
        <div class="template-header">
          <div class="template-title">
            <h3>${template.name || 'Unnamed Template'}</h3>
            <span class="config-id-badge">Config ID: ${configId}</span>
          </div>
          <div class="template-actions">
            <button class="btn-icon edit-btn" data-config-id="${configId}" title="Edit">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.249.249 0 00.108-.064l6.286-6.286z"/>
              </svg>
            </button>
            <button class="btn-icon delete-btn" data-config-id="${configId}" title="Delete">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H13v8.75a1.75 1.75 0 01-1.75 1.75h-6.5A1.75 1.75 0 013 13.25V4.5h-.25a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.5 4.5v8.75c0 .138.112.25.25.25h6.5a.25.25 0 00.25-.25V4.5h-7zm2.5 2.5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 017 7zm2.75.75a.75.75 0 00-1.5 0v4.5a.75.75 0 001.5 0v-4.5z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="template-stats">
          <div class="stat">
            <span class="stat-value">${customParamCount}</span>
            <span class="stat-label">Custom Parameters</span>
          </div>
          <div class="stat">
            <span class="stat-value">${activityGroupCount}</span>
            <span class="stat-label">Activity Groups</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach event listeners to edit and delete buttons
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const configId = e.currentTarget.getAttribute('data-config-id');
      editTemplate(configId);
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const configId = e.currentTarget.getAttribute('data-config-id');
      if (confirm(`Are you sure you want to delete the template for Config ID: ${configId}?`)) {
        delete templates[configId];
        saveTemplatesToStorage();
        renderTemplateList();
      }
    });
  });
}

// Show form view
function showFormView(template = null) {
  document.getElementById('listView').classList.add('hidden');
  document.getElementById('formView').classList.remove('hidden');

  if (template) {
    // Edit mode
    document.getElementById('formTitle').textContent = 'Edit Template';
    document.getElementById('configId').value = currentEditingId;
    document.getElementById('configId').disabled = true;
    document.getElementById('templateName').value = template.name || '';
    document.getElementById('customParams').value = formatAsKeyValue(template.customParams || {});
    document.getElementById('activityGroups').value = formatAsKeyValue(template.activityGroups || {});
    document.getElementById('deleteBtn').classList.remove('hidden');
  } else {
    // Add mode
    document.getElementById('formTitle').textContent = 'Add Template';
    document.getElementById('configId').disabled = false;
    document.getElementById('templateForm').reset();
    document.getElementById('deleteBtn').classList.add('hidden');
    currentEditingId = null;
  }
}

// Show list view
function showListView() {
  document.getElementById('formView').classList.add('hidden');
  document.getElementById('listView').classList.remove('hidden');
  document.getElementById('templateForm').reset();
  currentEditingId = null;
}

// Edit template
function editTemplate(configId) {
  currentEditingId = configId;
  showFormView(templates[configId]);
}

// Delete template
function deleteTemplate() {
  if (!currentEditingId) return;

  if (confirm(`Are you sure you want to delete the template for Config ID: ${currentEditingId}?`)) {
    delete templates[currentEditingId];
    saveTemplatesToStorage();
    showListView();
    renderTemplateList();
  }
}

// Save template
function saveTemplate() {
  const configId = document.getElementById('configId').value.trim();
  const templateName = document.getElementById('templateName').value.trim();
  const customParamsInput = document.getElementById('customParams').value.trim();
  const activityGroupsInput = document.getElementById('activityGroups').value.trim();

  if (!configId) {
    alert('Please enter a Floodlight Config ID');
    return;
  }

  try {
    const customParams = parseMapping(customParamsInput);
    const activityGroups = parseMapping(activityGroupsInput);

    templates[configId] = {
      name: templateName,
      customParams,
      activityGroups,
      updatedAt: new Date().toISOString()
    };

    saveTemplatesToStorage();
    showListView();
    renderTemplateList();
  } catch (error) {
    alert(`Error parsing input: ${error.message}`);
  }
}

// Save templates to storage
function saveTemplatesToStorage() {
  chrome.storage.local.set({ floodlightTemplates: templates }, () => {
    console.log('Templates saved:', templates);
  });
}

// Parse mapping from multiple formats (TSV, Key-Value, JSON)
function parseMapping(input) {
  if (!input) return {};

  const trimmed = input.trim();

  // Try JSON format first
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      throw new Error('Invalid JSON format');
    }
  }

  // Parse TSV or Key-Value format
  const result = {};
  const lines = trimmed.split('\n');

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Skip section headers like "Custom Parameters:" or "Activity Groups:"
    if (line.endsWith(':')) continue;

    // Try TSV (tab-separated)
    if (line.includes('\t')) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts[1].trim();
        if (key && value) {
          result[key] = value;
        }
      }
    }
    // Try Key-Value (equals-separated)
    else if (line.includes('=')) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim(); // Handle values with '='
        if (key && value) {
          result[key] = value;
        }
      }
    }
  }

  return result;
}

// Format object as key-value for display
function formatAsKeyValue(obj) {
  return Object.entries(obj)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

// Export templates as JSON file
function exportTemplates() {
  if (Object.keys(templates).length === 0) {
    alert('No templates to export. Please create templates first.');
    return;
  }

  const dataStr = JSON.stringify(templates, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `floodlight-templates-${timestamp}.json`;

  // Create download link
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(dataBlob);
  downloadLink.download = filename;
  downloadLink.click();

  // Clean up
  URL.revokeObjectURL(downloadLink.href);

  console.log('Templates exported:', templates);
}

// Import templates from JSON file
function importTemplates(file) {
  if (!file) return;

  if (!file.name.endsWith('.json')) {
    alert('Please select a valid JSON file');
    return;
  }

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const importedTemplates = JSON.parse(e.target.result);

      // Validate the structure
      if (typeof importedTemplates !== 'object' || importedTemplates === null) {
        throw new Error('Invalid template format');
      }

      // Count how many templates will be imported/overwritten
      const existingCount = Object.keys(templates).filter(id => importedTemplates[id]).length;
      const newCount = Object.keys(importedTemplates).length - existingCount;

      let message = `Import ${Object.keys(importedTemplates).length} template(s)?`;
      if (existingCount > 0) {
        message += `\n\n⚠️ This will overwrite ${existingCount} existing template(s).`;
      }
      if (newCount > 0) {
        message += `\n${newCount} new template(s) will be added.`;
      }

      if (!confirm(message)) {
        // Reset file input
        document.getElementById('importFile').value = '';
        return;
      }

      // Merge imported templates with existing ones
      templates = { ...templates, ...importedTemplates };

      // Save to storage
      saveTemplatesToStorage();

      // Refresh display
      renderTemplateList();

      alert(`Successfully imported ${Object.keys(importedTemplates).length} template(s)!`);

      console.log('Templates imported:', importedTemplates);
    } catch (error) {
      alert(`Error importing templates: ${error.message}`);
      console.error('Import error:', error);
    }

    // Reset file input
    document.getElementById('importFile').value = '';
  };

  reader.onerror = () => {
    alert('Error reading file');
    document.getElementById('importFile').value = '';
  };

  reader.readAsText(file);
}
