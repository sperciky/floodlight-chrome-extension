
const templateCache = {};

async function loadTemplate(name) {
    try {
        const response = await fetch(`../tpl/${name}.html`);
        if (!response.ok) throw new Error(`Failed to load template: ${name}`);
        const template = await response.text();
        return template;
    } catch (error) {
        console.error('Error loading template:', error);
        return '';
    }
}

export async function getTemplate(name) {
    if (!templateCache[name]) {
        templateCache[name] = await loadTemplate(name);
    }
    return templateCache[name];
}

export function checkStorageUsage() {
    return new Promise((resolve) => {
        if (chrome.storage) {
            chrome.storage.local.getBytesInUse(null, function(bytesInUse) {
                const QUOTA_BYTES = 5 * 1024 * 1024; 
                const usagePercent = (bytesInUse / QUOTA_BYTES * 100).toFixed(2);
                const usageMB = (bytesInUse / (1024 * 1024)).toFixed(2);
                const totalMB = 5.00;
                
                resolve({
                    usagePercent: parseFloat(usagePercent),
                    usageMB,
                    totalMB,
                    bytesInUse,
                    totalBytes: QUOTA_BYTES
                });
            });
        } else {
            resolve({
                usagePercent: 0,
                usageMB: "0.00",
                totalMB: 5.00,
                bytesInUse: 0,
                totalBytes: 5 * 1024 * 1024
            });
        }
    });
}

export function getStorageLocalSizeForKey(key) {
    return new Promise((resolve) => {
        chrome.storage.local.getBytesInUse([key], function(bytesInUse) {
            const sizeInKo = bytesInUse / 1024;
            resolve(sizeInKo);
        });
    });
}

export async function updateStorageProgress() {
    const storageInfo = await checkStorageUsage();
    const progressBar = document.querySelector('.storage-progress .progress');
    const storageText = document.querySelector('.storage-text');
    
    if (progressBar && storageText) {
        progressBar.value = storageInfo.usagePercent;
        
        
        progressBar.classList.remove('is-primary', 'is-warning', 'is-danger');
        if (storageInfo.usagePercent >= 90) {
            progressBar.classList.add('is-danger');
        } else if (storageInfo.usagePercent >= 70) {
            progressBar.classList.add('is-warning');
        } else {
            progressBar.classList.add('is-primary');
        }
        
        
        storageText.textContent = `${storageInfo.usagePercent}% (${storageInfo.usageMB}MB used of ${storageInfo.totalMB}MB)`;
    }
}

export function getEventName(obj) {
    let eventName;
                    
    if (obj.value && typeof obj.value === 'object' && obj.value.event) {
        eventName = obj.value.event;
    }
    else if (obj["0"] && typeof obj["1"] == 'object' && obj["1"].length == 0) {
        eventName = obj["0"]+' (gtag)';
    }
    else if (obj["0"] && typeof obj["1"] == 'string') {
        eventName = obj["0"]+'.'+obj["1"]+' (gtag)';
    }
    else if ((obj.value && typeof obj.value === 'object' && obj.value["0"] && obj.value["1"])) {
        eventName = obj.value["0"]+'.'+obj.value["1"]+' (gtag)';
    }
    else if (obj.event) {
        eventName = obj.event;
    }
    else {
        eventName = 'data';
    }

    return eventName;
}

export function getEventType(obj, eventName) {
    
    const eventNameLower = eventName.toLowerCase();

    
    if (Object.keys(obj).some(key => !isNaN(key))) {
        return 'gtag';
    }

    if ((obj.value && typeof obj.value === 'object' && obj.value["0"]) || obj["0"] ) {
        return 'gtag';
    }

    
    if (!obj.event && !obj.value?.event) {
        return 'data';
    }

    
    if (eventNameLower.startsWith('gtm.')) {
        return 'gtm';
    } else if (obj.ecommerce) {
        return 'ecommerce';
    } else if (eventNameLower.includes('page') || eventNameLower.includes('screen') || eventNameLower.includes('datalayer')) {
        return 'page';
    }

    
    return 'custom-event';
}

export function flattenObject(obj, keyBase = '', result = {}) {
    keyBase = keyBase === undefined || keyBase === '' ? '' : keyBase + '.';

    for (let key in obj) {
        if (obj[key] === null) {
            result[keyBase + key] = 'null';
        }
        else if (obj[key] === undefined) {
            result[keyBase + key] = 'undefined';
        }
        else if (typeof obj[key] === 'number' && isNaN(obj[key])) {
            result[keyBase + key] = 'NaN';
        }
        else if (typeof obj[key] === 'string' || typeof obj[key] === 'number' || typeof obj[key] === 'boolean') {
            result[keyBase + key] = obj[key];
        }
        else if (typeof obj[key] === 'object') {
            if (Object.keys(obj[key] || {}).length === 0) {
                
                result[keyBase + key] = Array.isArray(obj[key]) ? '[]' : '{}';
            } else {
                for (let subKey in obj[key]) {
                    flattenObject(obj[key], keyBase + key, result);
                }
            }
        }
        else {
            result[keyBase + key] = String(obj[key]);
        }
    }
    return result;
}

export function getByteSize(obj) {
    
    if (obj === null || obj === undefined) {
      return 0;
    }
    
    
    if (typeof obj === 'number') {
      
      return 8;
    }
    
    
    if (typeof obj === 'boolean') {
      
      return 4;
    }
    
    
    if (typeof obj === 'string') {
      
      return obj.length * 2;
    }
    
    
    if (typeof obj === 'string') {
      try {
        const parsed = JSON.parse(obj);
        
        return getByteSize(parsed);
      } catch (e) {
        
      }
    }
    
    
    if (typeof obj === 'object') {
      
      const objStr = JSON.stringify(obj);
      return objStr.length * 2; 
    }
    
    
    const str = String(obj);
    return str.length * 2;
}

export function initDatalayerAccordion() {
    
    const allAccordions = document.querySelectorAll('.datalayer.accordions .accordion');
    
    
    allAccordions.forEach(accordion => {
        accordion.classList.remove('is-active');
    });
}