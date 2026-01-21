(function() {
    let v = chrome.runtime.getManifest().version;
    let el = document.querySelector('.app-footer > .version')
    el.innerText = 'version '+ v;
})();

document.addEventListener('DOMContentLoaded', async function() {

    
    

    // Incrémenter le compteur d'ouverture de popup
    await MeasureData.updatePopupOpenCounter();

    // Initialiser le tracking de page
    await Measure.trackEvent('popup_open', {}, true);

    // Variables globales
    window.parsedDatalayers = {};
    window.currentDataLayer = 'dataLayer'; // Nom du dataLayer actuel
    window.activeTabId = null; // ID du tab actif
    // GTM Injector functionality temporarily disabled
    // window.gtmInjectorSettings = {}; // Paramètres GTM Injector
    
    // Récupérer l'ID du tab actif
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs.length > 0) {
            const tab = tabs[0];
            window.activeTabId = tab.id;
        }
    });
    
    // Écouter les nouveaux push du dataLayer
    chrome.runtime.onMessage.addListener(function(message, sender) {
        if (message.action === 'NEW_PUSH') {
            // Vérifier que le message provient du tab actif
            if (sender.tab && sender.tab.id === window.activeTabId) {
                // Ajouter le nouveau push au dataLayer correspondant
                const dataLayerName = message.dataLayerName;
                const pushData = message.data;
                
                // Initialiser le tableau si nécessaire
                if (!window.parsedDatalayers[dataLayerName]) {
                    window.parsedDatalayers[dataLayerName] = [];
                }
                
                // Ajouter le push au début du tableau
                window.parsedDatalayers[dataLayerName].unshift(pushData);
                
                // Si c'est le dataLayer actuellement affiché, mettre à jour l'interface
                if (dataLayerName === window.currentDataLayer) {
                    addNewPushToUI(pushData, dataLayerName);
                }
            }
        }
    });
    
    // Fonction pour générer le HTML d'un accordéon à partir d'un objet de données
    async function generateAccordionHTML(obj, options = {}) {
        try {
            const { 
                customId = null, 
                position = 0, 
                eventIndex = 0,
                dataLayerName = window.currentDataLayer
            } = options;
            
            // Récupérer le nom de l'événement
            let name = getEventName(obj);
            let type = getEventType(obj, name);
            
            // Formater le JSON
            const formattedJson = JSON.stringify(obj, null, 2)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            
            // Préparer les données pour le template
            const flatData = Object.entries(flattenObject(obj)).map(([key, value]) => {
                let typeColor;
                const valueType = typeof value;
                
                // Traiter les valeurs spéciales comme des mots-clés
                if (value === 'null' || value === 'undefined' || value === 'NaN' || value === '[]' || value === '{}') {
                    typeColor = 'keyword';
                }
                // Traiter les types standards
                else if (valueType === 'string') typeColor = 'string';
                else if (valueType === 'number') typeColor = 'number';
                else if (valueType === 'boolean') typeColor = 'keyword';
                else typeColor = 'string';
                
                return {
                    key: key,
                    value: value,
                    type: valueType,
                    typeColor: typeColor,
                    special: key.toLowerCase() === 'event' || key.toLowerCase() === 'value.event' ? 'event' : 'standard'
                };
            });
            
            // Créer les données pour le template de l'accordéon
            const accordionData = {
                id: customId || eventIndex,
                position: position,
                name: name,
                type: type,
                object_data: formattedJson,
                object_flat: flatData,
                jsonDefaultViewMode: window.settings.jsonDefaultViewMode,
                event_index: eventIndex
            };
            
            // Charger et rendre le template
            const template = await getTemplate('datalayer-accordion');
            const rendered = Mustache.render(template, accordionData);
            
            // Créer un conteneur temporaire pour appliquer highlight.js
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = rendered;
            
            // Appliquer highlight.js sur tous les blocs de code
            tempDiv.querySelectorAll('pre code:not([data-highlighted="true"])').forEach((block) => {
                hljs.highlightElement(block);
                block.setAttribute('data-highlighted', 'true');
            });
            
            return tempDiv.innerHTML;
        } catch (error) {
            //console.error('Erreur lors de la génération de l\'accordéon:', error);
            return '';
        }
    }
    
    // Fonction pour ajouter un nouveau push à l'interface
    async function addNewPushToUI(pushData, dataLayerName) {
        try {
            // Générer le HTML de l'accordéon
            const rendered = await generateAccordionHTML(pushData, {
                customId: 'new-push-' + Date.now(),
                position: window.parsedDatalayers[dataLayerName].length,
                eventIndex: 0,
                dataLayerName: dataLayerName
            });
            
            // Ajouter le nouvel accordéon en tête de liste dans le conteneur .accordions.datalayer
            const accordionsContainer = document.querySelector('.accordions.datalayer');
            if (accordionsContainer) {
                // Créer un élément temporaire pour parser le HTML rendu
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = rendered;
                
                // Récupérer l'élément accordéon du template
                const newAccordion = tempDiv.firstChild;
                
                // Ajouter au début de la liste des accordéons
                if (accordionsContainer.firstChild) {
                    accordionsContainer.insertBefore(newAccordion, accordionsContainer.firstChild);
                } else {
                    accordionsContainer.appendChild(newAccordion);
                }
            }
        } catch (error) {
            //console.error('Erreur lors de l\'ajout du nouveau push:', error);
        }
    }

    // Initialiser les toggles
    const consoleLogToggle = document.querySelector('.toggle-log input[type="checkbox"]');

    // Fonction commune pour envoyer des messages au tab actif
    async function sendMessageToActiveTab(message) {
        return new Promise((resolve) => {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const tab = tabs[0];
                if (tab && tab.url && tab.url.startsWith('http')) {
                    chrome.tabs.sendMessage(tab.id, message, resolve);
                } else {
                    resolve(null);
                }
            });
        });
    }

    // Fonction pour obtenir la limite de quota
    function getQuotaLimit() {
        return 100;
    }

    // Fonction pour obtenir le nombre actuel de snapshots
    async function getSnapshotCount() {
        return new Promise((resolve) => {
            if (chrome.storage) {
                chrome.storage.local.get('snapshots', function(result) {
                    const snapshots = result.snapshots || [];
                    resolve(snapshots.length);
                });
            } else {
                resolve(0);
            }
        });
    }

    // Fonction pour mettre à jour le bouton snapshot
    async function updateSnapshotButton() {
        const storageInfo = await checkStorageUsage();
        const template = await getTemplate('snapshot-popup-button');
        const isStorageCritical = chrome.storage ? storageInfo.usagePercent >= 95 : true;
        const snapshotCount = await getSnapshotCount();
        const snapshotLimit = getQuotaLimit();
        const isQuotaLimit = snapshotCount >= snapshotLimit;
        
        const templateData = {
            buttonClass: isQuotaLimit ? 'is-warning' : (isStorageCritical ? 'is-danger' : 'is-primary'),
            icon: isQuotaLimit ? 'fas fa-exclamation-triangle' : (isStorageCritical ? 'fas fa-exclamation-triangle' : 'fas fa-camera'),
            text: isQuotaLimit ? 'Quota limit' : (isStorageCritical ? 'Storage limit' : 'Snapshot'),
            isStorageCritical: isStorageCritical,
            isQuotaLimit: isQuotaLimit,
            snapshotCount: snapshotCount,
            snapshotLimit: snapshotLimit
        };
        
        const rendered = Mustache.render(template, templateData);
        const buttonContainer = document.querySelector('.snapshot-button-container');
        if (buttonContainer) {
            buttonContainer.innerHTML = rendered;
        }
        
        return isStorageCritical;
    }

    // Fonction pour les paramètres par défaut
    function getDefaultSettings() {
        return {
            consoleLog: false,
            jsonDefaultViewMode: false,
            gtm_injector: false,
            gtm_injector_datalayer: '',
            gtm_injector_container: ''
        };
    }
    

    // Fonction pour mettre à jour le select
    function updateSelect(datalayerName) {
        const select = document.getElementById('datalayer-select');
        if (select) {
            select.value = datalayerName;
        }
    }

    // Fonction pour sauvegarder un paramètre spécifique
    function updateSetting(key, value) {
        window.settings[key] = value;
        chrome.storage.sync.set({settings: window.settings}, function() {
            // Mettre à jour tous les conteneurs ouverts après la sauvegarde
            updateAllOpenContainers();
        });
    }

    // Fonction pour mettre à jour tous les conteneurs ouverts
    function updateAllOpenContainers() {
        $('.accordion.is-active').each(function() {
            const $accordion = $(this);
            const isJsonDefault = window.settings?.jsonDefaultViewMode;
            const viewType = isJsonDefault ? 'json' : 'flat';

            // Mettre à jour les onglets
            const $tabs = $accordion.find('.dl-object-toggle');
            $tabs.each(function() {
                const $tab = $(this);
                const isJsonTab = $tab.hasClass('js-toggle-json');
                $tab.removeClass('active');
                if ((isJsonTab && isJsonDefault) || (!isJsonTab && !isJsonDefault)) {
                    $tab.addClass('active');
                    $tab.closest('li').addClass('is-active');
                } else {
                    $tab.closest('li').removeClass('is-active');
                }
            });

            // Mettre à jour le contenu
            $accordion.find('.dl-object-flat, .dl-object-json').removeClass('active');
            $accordion.find(`.dl-object-${viewType}`).addClass('active');
        });
    }

    // Fonction pour configurer les écouteurs d'événements des éléments du dropdown
    function setupDropdownItemListeners(dropdown) {
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const value = item.dataset.value;
                window.currentDataLayer = value;
                dropdown.querySelector('.selected-value').textContent = value;
                
                // Mettre à jour la classe active
                dropdown.querySelectorAll('.dropdown-item').forEach(i => {
                    i.classList.toggle('is-active', i === item);
                });
                
                // Fermer le dropdown
                dropdown.classList.remove('is-active');
                
                // Sauvegarder le dataLayer sélectionné
                chrome.storage.sync.set({ lastDataLayer: value });
                
                // Charger les données du nouveau dataLayer
                loadDataLayerData(value);
            });
        });
    }

    // Fonction pour mettre à jour la liste des dataLayers dans le dropdown
    async function updateDataLayersList(dropdown) {
        // Ajouter l'indicateur de chargement
        const selectedValue = dropdown.querySelector('.selected-value');
        selectedValue.classList.add('is-loading');
        
        // Envoyer une requête pour obtenir la liste à jour des dataLayers
        const response = await sendMessageToActiveTab({
            action: "GET_DATALAYERS"
        });
        
        if (response && response.data) {
            const datalayers = JSON.parse(response.data);
            console.log(datalayers);
            
            // Ajouter isFirst pour le premier élément
            const dataLayersWithFirst = datalayers.map((dl, index) => ({
                ...dl,
                isFirst: index === 0
            }));
            
            // Récupérer le template et faire le rendu
            const template = await getTemplate('dropdown-item');
            const rendered = Mustache.render(template, { dropdownItems: dataLayersWithFirst });
            
            // Mettre à jour le contenu du dropdown
            dropdown.querySelector('.dropdown-content').innerHTML = rendered;
            
            // Retirer l'indicateur de chargement
            selectedValue.classList.remove('is-loading');
            
            // Mettre à jour la classe active
            dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                item.classList.toggle('is-active', item.dataset.value === window.currentDataLayer);
            });
            
            // Réappliquer les écouteurs d'événements aux nouveaux éléments
            setupDropdownItemListeners(dropdown);
        } else {
            // Si erreur ou pas de réponse, retirer l'indicateur de chargement
            selectedValue.classList.remove('is-loading');
        }
    }

    async function renderMessage(options = {}) {
        const messageBlock = document.querySelector('.dlmessage-block');
        if (!messageBlock) return;

        // Si clear est true ou aucune option n'est fournie, on vide le bloc
        if (options.clear || Object.keys(options).length === 0) {
            messageBlock.innerHTML = '';
            return;
        }

        // Préparer les données pour le template
        const templateData = {
            isMessage: true,
            isLoading: options.type === 'loading',
            isError: options.type === 'error',
            errorMessage: options.message
        };

        // Charger et rendre le template
        const template = await getTemplate('popup-message');
        messageBlock.innerHTML = Mustache.render(template, templateData);
    }

    // Fonction commune pour charger les données du dataLayer
    async function loadDataLayer(datalayerName, options = {}) {
        const messageBlock = document.querySelector('.dlmessage-block');
        const { hideMsgBlock = true, timeout = 500 } = options;
        
        if (hideMsgBlock) {
            messageBlock.classList.add('hidden');
        }
        
        let hasError = false;
        
        // Fonction pour afficher un message avec gestion de la classe hidden
        const showMessage = async (msgOptions) => {
            await renderMessage(msgOptions);
            if (msgOptions.type === 'error') {
                hasError = true;
            }
        };
        
        if (timeout > 0) {
            setTimeout(() => {
                if (hideMsgBlock && !hasError) {
                    messageBlock.classList.remove('hidden');
                }
            }, timeout);
        }
        
        showMessage({ type: 'loading' });
        
        const response = await sendMessageToActiveTab({
            action: "GET_PAGE_DATA",
            datalayer: datalayerName || window.currentDataLayer
        });
        
        if (response && response.data) {
            await renderDataLayer(response.data, datalayerName || window.currentDataLayer);
            showMessage({ clear: true }); // Effacer le message une fois les données chargées
        } else if (response && response.error) {
            showMessage({
                type: 'error',
                message: response.error.message || `DataLayer "${response.error.name}" not found.`
            });
        }
    }

    // Spécialisation pour le chargement initial
    function loadInitialDataLayer() {
        return loadDataLayer(window.currentDataLayer, { hideMsgBlock: false, timeout: 0 });
    }

    // Spécialisation pour le chargement après sélection d'un dataLayer
    function loadDataLayerData(datalayerName) {
        return loadDataLayer(datalayerName, { hideMsgBlock: true, timeout: 100 });
    }

    // Fonction pour sauvegarder le snapshot du dataLayer
    async function saveSnapshot(dataLayer, dataLayerName) {
        // Vérifier les limites avant d'enregistrer
        const storageInfo = await checkStorageUsage();
        const snapshotCount = await getSnapshotCount();
        const snapshotLimit = getQuotaLimit();
        
        // Vérifier si on dépasse les limites
        if (storageInfo.usagePercent >= 95 || snapshotCount >= snapshotLimit) {
            return false;
        }

        return new Promise((resolve) => {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const tab = tabs[0];
                if (tab && tab.url) {
                    // Envoyer un message pour obtenir le contexte de la page
                    chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_CONTEXT" }, function(response) {
                        if (response && response.data) {
                            // Utiliser le contexte de la page retourné par getPageContext()
                            const pageContext = response.data;
                            
                            // Générer un ID unique
                            const randomString = Math.random().toString(36).substring(2, 33) +
                                                Math.random().toString(36).substring(2, 33);
                            const uniqueId = `snap_${randomString.substring(0, 31)}`;
                            
                            // Créer le nouveau modèle de données en combinant le contexte de la page
                            // avec les données calculées ici
                            const newSnapshot = {
                                id: uniqueId,
                                context: {
                                    host: pageContext.host,
                                    path: pageContext.path,
                                    query: pageContext.query,
                                    hash: pageContext.hash,
                                    title: pageContext.title,
                                    body_class: pageContext.body_class,
                                    body_id: pageContext.body_id,
                                    name: dataLayerName,
                                    size: dataLayer.length,
                                    ts: Math.floor(Date.now() / 1000),
                                    byte: getByteSize(dataLayer),
                                    kilo_octet: Math.round((getByteSize(dataLayer)/1024/2)*100)/100
                                },
                                snapshot: dataLayer
                            };

                            // Récupérer les snapshots existants et ajouter le nouveau
                            chrome.storage.local.get('snapshots', function(result) {
                                let snapshots = result.snapshots || [];
                                snapshots.push(newSnapshot);
                                
                                // Sauvegarder dans chrome.storage.local
                                chrome.storage.local.set({ snapshots: snapshots }, function() {
                                    resolve(true);
                                });
                            });
                        } else {
                            // Fallback au comportement précédent si le contexte n'est pas disponible
                            const url = new URL(tab.url);
                            
                            // Générer un ID unique
                            const randomString = Math.random().toString(36).substring(2, 33) +
                                                Math.random().toString(36).substring(2, 33);
                            const uniqueId = `snap_${randomString.substring(0, 31)}`;
                            
                            // Créer le nouveau modèle de données
                            const newSnapshot = {
                                id: uniqueId,
                                context: {
                                    host: url.hostname,
                                    path: url.pathname,
                                    query: url.search,
                                    hash: url.hash,
                                    title: tab.title,
                                    name: dataLayerName,
                                    size: dataLayer.length,
                                    ts: Math.floor(Date.now() / 1000),
                                    byte: getByteSize(dataLayer),
                                    kilo_octet: Math.round((getByteSize(dataLayer)/1024/2)*100)/100
                                },
                                snapshot: dataLayer
                            };

                            // Récupérer les snapshots existants et ajouter le nouveau
                            chrome.storage.local.get('snapshots', function(result) {
                                let snapshots = result.snapshots || [];
                                snapshots.push(newSnapshot);
                                
                                // Sauvegarder dans chrome.storage.local
                                chrome.storage.local.set({ snapshots: snapshots }, function() {
                                    resolve(true);
                                });
                            });
                        }
                    });
                } else {
                    resolve(false);
                }
            });
        });
    }

    // Initialiser le toggle console.log
    if (consoleLogToggle) {
        // Récupérer l'état depuis chrome.storage.sync
        if (chrome.storage) {
            chrome.storage.sync.get(['settings'], function(result) {
                const settings = result.settings || getDefaultSettings();
                consoleLogToggle.checked = settings.consoleLog;
            });
        }
        
        // Gérer le changement d'état
        consoleLogToggle.addEventListener('change', function() {
            updateSetting('consoleLog', this.checked);
            // Envoyer les settings à la page
            sendMessageToActiveTab({
                action: "UPDATE_SETTINGS",
                settings: window.settings
            });
        });
    }
    
    // GTM Injector functionality temporarily disabled
    // Initialiser le GTM Injector
    // const gtmInjectorToggle = document.querySelector('.toggle-gtm-injector input[type="checkbox"]');
    // if (gtmInjectorToggle) {
    //     // Récupérer l'état depuis chrome.storage.sync
    //     if (chrome.storage) {
    //         chrome.storage.sync.get(['settings'], function(result) {
    //             const settings = result.settings || getDefaultSettings();
    //             
    //             // Mettre à jour le toggle
    //             gtmInjectorToggle.checked = settings.gtm_injector || false;
    //             
    //             // Mettre à jour les champs
    //             const datalayerInput = document.getElementById('gtm-injector-datalayer');
    //             const containerInput = document.getElementById('gtm-injector-container');
    //             
    //             if (datalayerInput) {
    //                 datalayerInput.value = settings.gtm_injector_datalayer || '';
    //             }
    //             
    //             if (containerInput) {
    //                 containerInput.value = settings.gtm_injector_container || '';
    //             }
    //             
    //             // Afficher/masquer la boîte GTM Injector en fonction de l'état du toggle
    //             const gtmInjectorBox = document.querySelector('.gtm-injector-box');
    //             if (gtmInjectorBox) {
    //                 gtmInjectorBox.classList.toggle('is-active', gtmInjectorToggle.checked);
    //             }
    //         });
    //     }
    //     
    //     // Gérer le changement d'état du toggle
    //     gtmInjectorToggle.addEventListener('change', function() {
    //         // Afficher/masquer la boîte GTM Injector
    //         const gtmInjectorBox = document.querySelector('.gtm-injector-box');
    //         if (gtmInjectorBox) {
    //             gtmInjectorBox.classList.toggle('is-active', this.checked);
    //         }
    //         
    //         // Sauvegarder l'état
    //         updateSetting('gtm_injector', this.checked);
    //     });
    //     
    //     // Gérer le clic sur le bouton Save
    //     const saveButton = document.getElementById('gtm-injector-save');
    //     if (saveButton) {
    //         saveButton.addEventListener('click', function() {
    //             // Récupérer l'icône
    //             const iconElement = saveButton.querySelector('.icon i');
    //             
    //             // Masquer l'icône pendant le chargement
    //             if (iconElement) {
    //                 iconElement.style.display = 'none';
    //             }
    //             
    //             // Ajouter la classe is-loading pendant la sauvegarde
    //             saveButton.classList.add('is-loading');
    //             
    //             // Sauvegarder les paramètres
    //             const success = saveGtmInjectorSettings();
    //             
    //             if (success) {
    //                 // Récupérer les valeurs des champs
    //                 const datalayerInput = document.getElementById('gtm-injector-datalayer');
    //                 const containerInput = document.getElementById('gtm-injector-container');
    //                 const gtmInjectorToggle = document.querySelector('.toggle-gtm-injector input[type="checkbox"]');
    //                 
    //                 // Envoyer un message au service worker pour mettre à jour les paramètres GTM
    //                 chrome.runtime.sendMessage({
    //                     action: 'UPDATE_GTM_SETTINGS',
    //                     enabled: gtmInjectorToggle.checked,
    //                     container: containerInput.value.trim(),
    //                     datalayer: datalayerInput.value.trim() || 'dataLayer'
    //                 });
    //             }
    //             
    //             // Retirer la classe is-loading après un court délai
    //             setTimeout(() => {
    //                 saveButton.classList.remove('is-loading');
    //                 
    //                 // Réafficher l'icône
    //                 if (iconElement) {
    //                     iconElement.style.display = '';
    //                 }
    //                 
    //                 // Ajouter une classe de feedback visuel en fonction du résultat
    //                 if (success) {
    //                     saveButton.classList.add('is-success');
    //                     setTimeout(() => {
    //                         saveButton.classList.remove('is-success');
    //                     }, 1000);
    //                 } else {
    //                     saveButton.classList.add('is-danger');
    //                     setTimeout(() => {
    //                         saveButton.classList.remove('is-danger');
    //                     }, 1000);
    //                 }
    //             }, 300);
    //         });
    //     }
    // }
    
    // Initialisation des settings avec chrome.storage.sync
    await new Promise((resolve) => {
        if (chrome.storage) {
            chrome.storage.sync.get(['settings', 'lastDataLayer'], function(result) {
                window.settings = result.settings || getDefaultSettings();
                // Restaurer le dernier dataLayer sélectionné
                if (result.lastDataLayer) {
                    window.currentDataLayer = result.lastDataLayer;
                    updateSelect(result.lastDataLayer);
                }
                // Vérifier l'utilisation du stockage
                checkStorageUsage().then(storageInfo => {
                    //console.log(`Utilisation du stockage: ${storageInfo.bytesInUse} octets sur ${storageInfo.totalBytes} octets (${storageInfo.usagePercent}%)`);
                });
                resolve();
            });
        } else {
            resolve();
        }
    });

    // Charger la liste des dataLayers
    const response = await sendMessageToActiveTab({
        action: "GET_DATALAYERS"
    });
    
    if (response && response.data) {
        const datalayers = JSON.parse(response.data);
        
        // Mettre à jour le dropdown
        const dropdown = document.getElementById('datalayer-select');
        if (dropdown) {
            // Ajouter isFirst pour le premier élément
            const dataLayersWithFirst = datalayers.map((dl, index) => ({
                ...dl,
                isFirst: index === 0
            }));
            
            // Récupérer le template et faire le rendu
            const template = document.getElementById('datalayer-select-template').innerHTML;
            const rendered = Mustache.render(template, { datalayers: dataLayersWithFirst });
            
            // Mettre à jour le contenu du dropdown
            dropdown.querySelector('.dropdown-content').innerHTML = rendered;

            // Mettre à jour le texte sélectionné
            const selectedValue = dropdown.querySelector('.selected-value');
            selectedValue.classList.remove('is-loading');
            
            // Vérifier si le dataLayer sauvegardé existe dans la liste
            const savedDataLayerExists = datalayers.some(dl => dl.name === window.currentDataLayer);
            
            if (!savedDataLayerExists && datalayers.length > 0) {
                // Si le dataLayer sauvegardé n'existe pas, sélectionner le premier
                window.currentDataLayer = datalayers[0].name;
                dropdown.querySelector('.selected-value').textContent = datalayers[0].name;
                // Sauvegarder le nouveau dataLayer
                chrome.storage.sync.set({ lastDataLayer: datalayers[0].name });
                // Charger les données du nouveau dataLayer
                loadDataLayerData(datalayers[0].name);
            } else if (window.currentDataLayer) {
                // Restaurer la sélection précédente
                dropdown.querySelector('.selected-value').textContent = window.currentDataLayer;
                // Mettre à jour la classe active
                dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                    item.classList.toggle('is-active', item.dataset.value === window.currentDataLayer);
                });
            }

            // Gérer l'ouverture/fermeture du dropdown avec mise à jour des dataLayers au clic
            const dropdownTrigger = dropdown.querySelector('.dropdown-trigger');
            dropdownTrigger.addEventListener('click', async (e) => {
                e.preventDefault();
                // Basculer la classe active
                const isOpening = !dropdown.classList.contains('is-active');
                dropdown.classList.toggle('is-active');
                
                // Si le dropdown s'ouvre, mettre à jour la liste des dataLayers
                if (isOpening) {
                    await updateDataLayersList(dropdown);
                }
            });

            // Configurer les écouteurs d'événements sur les items
            setupDropdownItemListeners(dropdown);

            // Fermer le dropdown quand on clique en dehors
            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target)) {
                    dropdown.classList.remove('is-active');
                }
            });
        }
    }

    // Fonction renderDataLayer utilisant generateAccordionHTML
    async function renderDataLayer(data, datalayerName) {
        try {
            const parsedData = JSON.parse(data);

            if (Array.isArray(parsedData) && parsedData.length > 0) {
                // Effacer le message de chargement
                await renderMessage({ clear: true });
                
                // Stocker les données dans l'objet global
                window.parsedDatalayers[datalayerName] = parsedData;

                // Générer les accordéons pour chaque objet
                const accordions = await Promise.all(parsedData.reverse().map(async (obj, index) => {
                    const html = await generateAccordionHTML(obj, {
                        position: parsedData.length - index,
                        eventIndex: index,
                        dataLayerName: datalayerName
                    });
                    return { pushObject: html };
                }));

                // Rendre le template principal avec les accordéons
                const template = await getTemplate('datalayer-accordions');
                const rendered = Mustache.render(template, { objects: accordions });
                
                // Mettre à jour le DOM
                const dlObjects = document.getElementById('dl-objects');
                dlObjects.innerHTML = rendered;

                // Initialiser l'accordéon après le rendu
                initDatalayerAccordion();

            } else {
                // Afficher un message si le dataLayer est vide
                const dlObjects = document.getElementById('dl-objects');
                if (dlObjects) {
                    dlObjects.innerHTML = '<div class="notification is-link">This datalayer was found but appears to be empty...</div>';
                }
                await renderMessage({
                    type: 'error',
                    message: 'This datalayer was found but appears to be empty...'
                });
            }
        } catch (error) {
            await renderMessage({
                type: 'error',
                message: 'Error loading datalayer: ' + error.message
            });
        }
    }

    // Charger les données initiales du dataLayer
    loadInitialDataLayer();

    // Observer les changements dans le conteneur dl-objects
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                setTimeout(() => {
                    initDatalayerAccordion();
                    // Appliquer highlight.js sur les nouveaux blocs de code
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            node.querySelectorAll('pre code:not([data-highlighted="true"])').forEach((block) => {
                                hljs.highlightElement(block);
                                block.setAttribute('data-highlighted', 'true');
                            });
                        }
                    });
                }, 0);
            }
        });
    });

    // Démarrer l'observation
    const dlObjects = document.getElementById('dl-objects');
    if (dlObjects) {
        observer.observe(dlObjects, {
            childList: true
        });
    }

    // Gestionnaire pour la recherche d'événements
    $(document).on('input', '.js-event-search', function() {
        const searchValue = $(this).val().toLowerCase();
        $('.accordion').each(function() {
            const eventName = $(this).find('.dl-object-name').text().toLowerCase();
            if (eventName.includes(searchValue)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });

    // Gestionnaire pour effacer la recherche
    $(document).on('click', '.js-clear-search', function() {
        const $searchInput = $('.js-event-search');
        $searchInput.val('').trigger('input');
    });

    // Gestion des interactions UI
    $(document).ready(function() {
        // Gestion des clics sur les headers d'accordéon
        $(document).on('click', '.accordion-toggle', function(e) {
            e.preventDefault();
            e.stopPropagation();

            const $clickedAccordion = $(this).closest('.accordion');
            const isActive = $clickedAccordion.hasClass('is-active');

            // Fermer tous les accordéons
            $('.accordion').each(function() {
                $(this).removeClass('is-active');
                $(this).find('.accordion-body').hide();
            });

            // Si l'accordéon n'était pas actif, l'ouvrir
            if (!isActive) {
                $clickedAccordion.addClass('is-active');
                $clickedAccordion.find('.accordion-body').show();

                // Appliquer la vue par défaut sauvegardée
                const isJsonDefault = window.settings?.jsonDefaultViewMode;
                const viewType = isJsonDefault ? 'json' : 'flat';

                // Mettre à jour les onglets
                const $tabs = $clickedAccordion.find('.dl-object-toggle');
                $tabs.each(function() {
                    const $tab = $(this);
                    const isJsonTab = $tab.hasClass('js-toggle-json');
                    $tab.removeClass('active');
                    if ((isJsonTab && isJsonDefault) || (!isJsonTab && !isJsonDefault)) {
                        $tab.addClass('active');
                        $tab.closest('li').addClass('is-active');
                    } else {
                        $tab.closest('li').removeClass('is-active');
                    }
                });

                // Mettre à jour le contenu
                $clickedAccordion.find('.dl-object-flat, .dl-object-json').removeClass('active');
                $clickedAccordion.find(`.dl-object-${viewType}`).addClass('active');
            }
        });

        // Gestion des tabs (avec délégation d'événements)
        $(document).on('click', '.dl-object-toggle', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const $tab = $(this);
            const viewType = $tab.hasClass('js-toggle-json') ? 'json' : 'flat';
            
            // Mettre à jour le paramètre dans chrome.storage.sync
            updateSetting('jsonDefaultViewMode', viewType === 'json');
            
            // Mettre à jour l'interface
            const $accordion = $tab.closest('.accordion');
            const $tabs = $accordion.find('.tabs');
            
            $tabs.find('li').removeClass('is-active');
            $tabs.find('.dl-object-toggle').removeClass('active');
            
            $tab.addClass('active');
            $tab.closest('li').addClass('is-active');
            
            $accordion.find('.dl-object-flat, .dl-object-json').removeClass('active');
            $accordion.find(`.dl-object-${viewType}`).addClass('active');
        });

        // Gestionnaire pour copier le JSON
        $(document).on('click', '.js-copy-push-datalayer', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const $button = $(this);
            const $accordion = $button.closest('.accordion');
            const $code = $accordion.find('code.language-json');
            const jsonText = $code.text();
            
            // Copier le texte dans le presse-papiers
            navigator.clipboard.writeText(jsonText).then(() => {
                // Sauvegarder le texte original du bouton
                const $buttonText = $button.find('span:not(.icon)');
                const originalText = $buttonText.text();
                
                // Changer le texte en "copied"
                $buttonText.text('copied');
                
                // Restaurer le texte original après 1 seconde
                setTimeout(() => {
                    $buttonText.text(originalText);
                }, 1000);
            });
        });

        // Ajouter le listener pour le bouton snapshot
        $(document).on('click', 'button.snapshot-button', async function(e) {
            e.preventDefault();
            e.stopPropagation();

            const currentDatalayerData = window.parsedDatalayers[window.currentDataLayer];
            if (currentDatalayerData && currentDatalayerData.length > 0) {
                // Feedback visuel
                const $button = $(this);
                $button.addClass('is-loading');
                
                // Tenter de sauvegarder le snapshot
                const saved = await saveSnapshot(currentDatalayerData, window.currentDataLayer);
                
                if (saved) {
                    // Mettre à jour les compteurs pour le nouveau snapshot
                    await Measure.updateNewSnapshot({
                        snapshot: currentDatalayerData
                    });
                }
                
                setTimeout(async () => {
                    $button.removeClass('is-loading');
                    // Mettre à jour le bouton après la tentative de sauvegarde
                    await updateSnapshotButton();
                }, 250);
            }
        });

        // Mettre à jour le bouton snapshot au chargement
        updateSnapshotButton();
    });
});
