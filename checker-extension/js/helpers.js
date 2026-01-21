
function checkStorageUsage() {
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
            resolve();
        }
    });
}


function getEventName(obj) {
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

    return eventName
}


function getEventType(obj, eventName) {
    
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



function flattenObject(obj, keyBase = '', result = {}) {
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

function getByteSize(obj) {
    
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


function initDatalayerAccordion() {
    //console.log('initAccordion called');
    
    
    const allAccordions = document.querySelectorAll('.datalayer.accordions .accordion');
    //console.log('Nombre d\'accordéons trouvés:', allAccordions.length);
    
    
    allAccordions.forEach(accordion => {
        accordion.classList.remove('is-active');
    });
}

