// Écouter les messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_PAGE_DATA") {
        sendResponse({data: request.data});
        return true;
    }
    
    return true;
});
