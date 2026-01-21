
function injectScript() {
    
    if (document.querySelector('script[src*="datalayer-checker.js"]')) {
        
        return;
    }

    const script = document.createElement('script');
    script.id = 'datalayer-checker-script';
    script.src = chrome.runtime.getURL('js/datalayer-checker.js');
    script.onload = function() {
        
        chrome.storage.sync.get(['settings'], function(result) {
            const settings = result.settings || { consoleLog: false };
            window.postMessage({
                action: 'SET_INITIAL_SETTINGS',
                settings: settings
            }, '*');
        });
        
    };
    (document.head || document.documentElement).appendChild(script);
}


injectScript();


window.addEventListener('message', function(event) {
    
    if (event.data && event.data.type === 'NEW_PUSH') {
        
        chrome.runtime.sendMessage({
            action: 'NEW_PUSH',
            dataLayerName: event.data.dataLayerName,
            data: event.data.data,
            tabId: chrome.runtime.id 
        });
    } 
    
});




chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    
    
    if (request.action === "GET_PAGE_DATA") {
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelay = 500; 

        function tryGetData() {
            
            window.postMessage({ 
                action: 'GET_PAGE_DATA',
                datalayer: request.datalayer || 'dataLayer'
            }, '*');

            
            const timeout = setTimeout(() => {
                if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(tryGetData, retryDelay);
                } else {
                    sendResponse({error: "Timeout waiting for response after multiple retries"});
                }
            }, 1000); 

            window.addEventListener('message', function handler(event) {
                if (event.data.type === 'DATALAYER_ERROR') {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    
                    
                    sendResponse({
                        error: {
                            ...event.data.error,
                            message: event.data.error.message || (() => {
                                switch (event.data.error.type) {
                                    case 'too_large':
                                        return `Your dataLayer "${event.data.error.name}" is too large (${event.data.error.size} KB).`;
                                    case 'not_found':
                                        return `DataLayer "${event.data.error.name}" not found.`;
                                    case 'stringify_failed':
                                        return `Unable to process dataLayer "${event.data.error.name}". It may contain circular references or invalid data.`;
                                    default:
                                        return 'An unknown error occurred while processing the dataLayer.';
                                }
                            })()
                        }
                    });
                } else if (event.data.type === 'DATALAYER_DATA') {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    sendResponse({
                        data: event.data.data,
                        isLoading: false,
                        isError: false
                    });
                }
            });
        }

        tryGetData();
    } else if (request.action === "GET_DATALAYERS") {
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelay = 2000; 
        const timeoutDelay = 10000; 

        function tryGetDataLayers() {
            
            window.postMessage({ 
                action: 'GET_DATALAYERS'
            }, '*');

            
            const timeout = setTimeout(() => {
                if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(tryGetDataLayers, retryDelay);
                } else {
                    sendResponse({error: `Timeout waiting for response after ${maxRetries} attempts (${maxRetries * 2} seconds)`});
                }
            }, timeoutDelay);

            window.addEventListener('message', function handler(event) {
                if (event.data.type === 'DATALAYERS_LIST') {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    const datalayers = JSON.parse(event.data.data);
                    if (datalayers.length > 0) {
                        
                        sendResponse({data: event.data.data});
                    } else if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(tryGetDataLayers, retryDelay);
                    } else {
                        sendResponse({data: event.data.data});
                    }
                }
            });
        }

        tryGetDataLayers();
    } else if (request.action === "PUSH_TO_DATALAYER") {
        try {
            
            const data = JSON.parse(request.data);
            
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('js/datalayer-checker.js');
            script.onload = function() {
                
                window.pushToDataLayer(data);
                
                sendResponse({status: "success"});
            };
            document.head.appendChild(script);
        } catch (error) {
            
            sendResponse({status: "error", message: error.message});
        }
    } else if (request.action === "UPDATE_SETTINGS") {
        
        window.postMessage({ 
            action: 'UPDATE_SETTINGS',
            settings: request.settings
        }, '*');

        
        let responded = false;
        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'SETTINGS_UPDATED' && !responded) {
                responded = true;
                window.removeEventListener('message', handler);
                sendResponse({status: "success"});
            }
        });

        
        setTimeout(() => {
            if (!responded) {
                responded = true;
                sendResponse({status: "success"});
            }
        }, 100);
    } else if (request.action === 'GET_INITIAL_SETTINGS') {
        
        chrome.storage.sync.get(['settings'], function(result) {
            const settings = result.settings || { consoleLog: false/*, spaAutoTrack: false*/ };
            window.postMessage({
                action: 'SET_INITIAL_SETTINGS',
                settings: settings
            }, '*');
        });
    } else if (request.action === 'GET_PAGE_CONTEXT') {
        
        window.postMessage({ 
            action: 'GET_PAGE_CONTEXT'
        }, '*');

        
        window.addEventListener('message', function handler(event) {
            if (event.data.type === 'PAGE_CONTEXT') {
                window.removeEventListener('message', handler);
                sendResponse({
                    data: event.data.data
                });
            }
        });
    }

    return true; 
});
