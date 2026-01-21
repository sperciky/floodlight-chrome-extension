(function() {
    // Initialiser l'objet __dlc
    window.__dlc = window.__dlc || {
        settings: {},
        push_listening: {} // Tracker les dataLayers écoutés
    };

    // Fonction pour initialiser tous les dataLayers
    async function initializeAllDataLayers() {
        const datalayers = await findDataLayers();
        datalayers.forEach(dl => {
            listenToDataLayer(dl.name);
        });

        // Observer les nouveaux dataLayers
        const observer = new MutationObserver(async function(mutations) {
            mutations.forEach(async function(mutation) {
                if (mutation.type === 'childList') {
                    const datalayers = await findDataLayers();
                    datalayers.forEach(dl => {
                        if (window[dl.name] && !window.__dlc.push_listening[dl.name]) {
                            listenToDataLayer(dl.name);
                        }
                    });
                }
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    // Synchroniser les settings avec chrome.storage.sync
    window.postMessage({
        action: 'GET_INITIAL_SETTINGS'
    }, '*');


    

    // Écouter les messages de l'extension
    window.addEventListener('message', function(event) {
        if (event.data.action === 'GET_PAGE_DATA') {
            // Obtenir les données du dataLayer avec retry
            let retryCount = 0;
            const maxRetries = 5;
            const retryDelay = 500; // 1/2 secondes entre chaque tentative

            async function tryGetData() {
                const result = getDataLayer(event.data.datalayer);
                
                // Si le dataLayer n'est pas trouvé ou s'il y a une erreur de stringification, on réessaie
                if ((result && result.error && (result.type === 'not_found' || result.type === 'stringify_failed')) && retryCount < maxRetries) {
                    retryCount++;
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    tryGetData();
                    return;
                }

                if (result && result.error) {
                    let errorMessage;
                    switch (result.type) {
                        case 'too_large':
                            errorMessage = `DataLayer "${result.name}" is too large (${result.size} KB).`;
                            break;
                        case 'not_found':
                            errorMessage = `DataLayer "${result.name}" not found after ${maxRetries} attempts (${maxRetries * 2} seconds).`;
                            break;
                        case 'stringify_failed':
                            errorMessage = `Unable to process DataLayer "${result.name}" after ${maxRetries} attempts. It may contain circular references or complex data.`;
                            break;
                        default:
                            errorMessage = 'An unknown error occurred while processing the dataLayer.';
                    }

                    window.postMessage({
                        type: 'DATALAYER_ERROR',
                        error: {
                            type: result.type,
                            name: result.name,
                            size: result.size,
                            message: errorMessage
                        }
                    }, '*');
                } else {
                    window.postMessage({
                        type: 'DATALAYER_DATA',
                        data: JSON.stringify(result)
                    }, '*');
                }
            }

            tryGetData();
        } else if (event.data.action === 'GET_DATALAYERS') {
            // Envoyer la liste des dataLayers à l'extension
            findDataLayers().then(datalayers => {
                window.postMessage({
                    type: 'DATALAYERS_LIST',
                    data: JSON.stringify(datalayers)
                }, '*');
            });
        } else if (event.data.action === 'UPDATE_SETTINGS') {
            // Mettre à jour les settings
            window.__dlc.settings = event.data.settings;
            // Envoyer une confirmation
            window.postMessage({
                type: 'SETTINGS_UPDATED'
            }, '*');
        } else if (event.data.action === 'SET_INITIAL_SETTINGS') {
            // Initialiser les settings avec les valeurs de chrome.storage.sync
            window.__dlc.settings = event.data.settings;

            // Initialiser les dataLayers une fois que nous avons les settings
            initializeAllDataLayers();
        } else if (event.data.action === 'GET_PAGE_CONTEXT') {
            // Récupérer le contexte de la page et l'envoyer en réponse
            const pageContext = getPageContext();
            window.postMessage({
                type: 'PAGE_CONTEXT',
                data: pageContext
            }, '*');
        }
    });

    // Fonction pour récupérer les infos de contextualisation de la page (snapshots)
    function getPageContext() {
        const d = document;
        const dl = d.location;
        const db = d.body;
        const context = {};
        context.host = dl.hostname;
        context.path = dl.pathname;
        context.query = dl.query;
        context.hash = dl.hash;
        context.title = d.title;
        context.body_class = db.className;
        context.body_id = db.id;
        
        // tags
        /*
        const tags = [];
        const tests = [
            ['shopify', 'shopify'],
            ['analytics.js', 'google analytics'],
            ['fbevents.js', 'facebook pixel']
        ];
        tests.forEach(t=>{
            if (isScript(t[0])) tags.push(t[1]);
        })

        context.tags = tags.join();
        */
        return context;
    }

    function isScript(fragment) {
        if (!fragment || fragment.length<=0 ) return
        return document.querySelectorAll('script[src*="'+fragment+'"]').length ? true : false;
    }

    
    // Fonction pour nettoyer les objets du dataLayer
    function cleanDataLayerObject(obj, depth = 0) {
        // Limiter la profondeur de récursion
        const MAX_DEPTH = 10;
        if (depth > MAX_DEPTH) {
            return "[MAX_DEPTH_REACHED]";
        }
        
        // Gérer les cas spéciaux
        if (obj === null || obj === undefined) {
            return obj;
        }
        
        // Gérer les fonctions
        if (typeof obj === 'function') {
            return '[FUNCTION]';
        }
        
        // Gérer les types primitifs
        if (typeof obj !== 'object') {
            return obj;
        }
        
        // Cas particuliers pour les objets DOM
        if (obj instanceof Node || obj instanceof Window) {
            return '[DOM_ELEMENT]';
        }
        
        // Vérifier si c'est un objet Date
        if (obj instanceof Date) {
            return obj.toString();
        }
        
        // Gérer les tableaux
        if (Array.isArray(obj)) {
            try {
                return obj.map(item => cleanDataLayerObject(item, depth + 1));
            } catch (e) {
                return '[ARRAY_ERROR]';
            }
        }
        
        // Gérer les objets réguliers
        try {
            const cleanObj = {};
            for (const key in obj) {
                try {
                    // Détection des propriétés React
                    if (key.startsWith('__react') || key.startsWith('_react')) {
                        cleanObj[key] = '[REACT_PROPERTY]';
                    }
                    // Détection des éléments spécifiques à GTM
                    else if (key === 'gtm.element') { 
                        cleanObj[key] = '[HTML_ELEMENT]'; 
                    }
                    // Gestion des callbacks et timeouts
                    else if (key === 'eventCallback' || key === 'eventTimeout') { 
                        cleanObj[key] = typeof obj[key] === 'function' ? '[FUNCTION]' : obj[key]; 
                    }
                    // Détection des éléments DOM
                    else if (obj[key] instanceof Node || obj[key] instanceof Window) { 
                        cleanObj[key] = '[DOM_ELEMENT]';  
                    }
                    // Gestion des fonctions
                    else if (typeof obj[key] === 'function') { 
                        cleanObj[key] = '[FUNCTION]'; 
                    }
                    // Gestion des propriétés de prototype
                    else if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                        cleanObj[key] = '[PROTOTYPE]';
                    }
                    // Gestion des propriétés standard (récursion)
                    else { 
                        cleanObj[key] = cleanDataLayerObject(obj[key], depth + 1); 
                    }
                } catch (e) {
                    // En cas d'erreur, utiliser une valeur de remplacement
                    cleanObj[key] = '[UNSERIALIZABLE_VALUE]';
                }
            }
            return cleanObj;
        } catch (e) {
            return '[OBJECT_ERROR]';
        }
    }
    
    

    // Modifier getDataLayer pour ajouter un try/catch plus granulaire
    function getDataLayer(datalayerName) {
        // Vérifier si le dataLayer existe
        if (!window[datalayerName]) {
            return {
                error: true,
                type: 'not_found',
                name: datalayerName
            };
        }
    
        const dataLayer = window[datalayerName];
        
        try {
            // Ne pas calculer la taille en tentant de stringifier directement
            // Essayer directement le nettoyage
            try {
                // Créer une copie pour éviter les problèmes de modification
                const dataLayerCopy = Array.from(dataLayer);
                
                // Nettoyer récursivement avec la fonction améliorée
                return cleanDataLayerObject(dataLayerCopy);
            } catch (e) {
                console.error('Error cleaning dataLayer:', e);
                return {
                    error: true,
                    type: 'stringify_failed',
                    name: datalayerName
                };
            }
        } catch (e) {
            console.error('Error handling dataLayer:', e);
            return {
                error: true,
                type: 'stringify_failed',
                name: datalayerName
            };
        }
    }

    // Fonction pour trouver tous les dataLayers disponibles avec retry
    async function findDataLayers() {
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelay = 2000; // 2 secondes entre chaque tentative

        async function tryFind() {
            const datalayers = new Set();
            
            // Vérifier d'abord si window.dataLayer existe
            if (window.dataLayer) {
                datalayers.add('dataLayer');
            }
            
            // Vérifier ensuite window.google_tag_manager
            if (window.google_tag_manager) {
                Object.keys(window.google_tag_manager).forEach(key => {
                    if (key.startsWith('GTM-')) {
                        const container = window.google_tag_manager[key];
                        if (container.dataLayer && container.dataLayer.name) {
                            datalayers.add(container.dataLayer.name);
                        }
                    }
                });
            }

            // Si aucun dataLayer n'est trouvé et qu'on n'a pas atteint le nombre max de tentatives
            if (datalayers.size === 0 && retryCount < maxRetries) {
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return tryFind();
            }

            return Array.from(datalayers).map(name => ({ name }));
        }

        return tryFind();
    }

    // Fonction pour déterminer le nom d'événement
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

    // Console.log
    function logDataLayerPush(obj, name) {
        // Utiliser la fonction cleanDataLayerObject existante
        const cleanObj = cleanDataLayerObject(obj);
        
        // Formatage JSON optimisé
        const formatted = JSON.stringify(cleanObj, null, '  ')
          .slice(1, -1)  // Enlever les accolades extérieures
          .trim()        // Supprimer les espaces inutiles
          .replace(/\n  /g, '\n');  // Corriger l'indentation
        
        // Récupérer le nom de l'événement s'il existe
        const eventName = getEventName(obj);
        
        // Affichage stylisé dans la console
        console.log(
          '%c'+name+'.push(' + eventName + ')', 
          'font-size:10px; font-weight:bold; color:#fff; background:#176BEF; padding:2px 5px; display:block; margin-top:12px;'
        );
        console.log(
          '%c' + formatted, 
          'font-size:10px; color:#333; background:#f1f1f1; display:block; padding:2px 10px;'
        );
    }


    // Fonction pour écouter les pushes dans un dataLayer
    function listenToDataLayer(dataLayerName) {
        const dl = window[dataLayerName];
        if (!dl || window.__dlc.push_listening[dataLayerName]) return; // Éviter la double initialisation

        // Marquer le dataLayer comme écouté
        window.__dlc.push_listening[dataLayerName] = true;

        // Logger les éléments existants si consoleLog est activé
        if (window.__dlc.settings.consoleLog) {
            for (let i = 0; i < dl.length; i++) {
                logDataLayerPush(dl[i], dataLayerName);
            }
        }

        // Stocker la référence à la méthode push originale
        const originalPush = dl.push;
        
        // Remplacer la méthode push par notre proxy
        dl.push = function() {
            // Logger si consoleLog est activé
            if (window.__dlc.settings.consoleLog) {
                for (let i = 0; i < arguments.length; i++) {
                    logDataLayerPush(arguments[i], dataLayerName);
                }
            }
            
            // Envoyer les push en postMessage pour l'extension
            for (let i = 0; i < arguments.length; i++) {
                const cleanObj = cleanDataLayerObject(arguments[i]);
                //const cleanObj = JSON.stringify(arguments[i]);

                
                window.postMessage({
                    type: 'NEW_PUSH',
                    dataLayerName: dataLayerName,
                    data: cleanObj
                }, '*');
            }
            
            // Appeler la méthode push originale avec les mêmes arguments
            return originalPush.apply(this, arguments);
        };
    }
})();
