
const MeasureData = {
    
    async init() {
        const data = await this.getData();
        await this.saveData(data);
        return data;
    },

    
    generateUid() {
        return 'uid_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    },

    
    async getData() {
        return new Promise((resolve) => {
            if (chrome.storage) {
                chrome.storage.sync.get(['measure_data'], (result) => {
                    resolve(result.measure_data || {
                        lastday_snapshot: 0,
                        lastday_snapshot_size: 0,
                        lastday_snapshot_size_min: 0,
                        lastday_snapshot_size_max: 0,
                        lastday_delete: 0,
                        lastday_delete_size: 0,
                        lastday_popup_open: 0
                    });
                });
            } else {
                resolve({});
            }
            
        });
    },

    
    async saveData(data) {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ measure_data: data }, resolve);
        });
    },


    
    async updatePopupOpenCounter() {
        if (!chrome.storage) return;
        
        const data = await this.getData();
        
        data.lastday_popup_open++;
        
        await this.saveData(data);
    }
};


const MeasureInit = {
    async init() {
        return new Promise((resolve) => {
            if (chrome.storage) {
                chrome.storage.sync.get(['measure_init'], (result) => {
                    resolve(result.measure_init || {});
                });
            } else {
                resolve({});
            }
        });
    },

    async save(data) {
        return new Promise((resolve) => {
            if (chrome.storage) {
                chrome.storage.sync.set({ measure_init: data }, resolve);
            } else {
                resolve();
            }
            
        });
    },

    
    isNewDay(referenceDate, compareDate = new Date()) {
        
        if (!referenceDate || typeof referenceDate !== 'string' || isNaN(new Date(referenceDate).getTime())) {
            return true;
        }
        
        const refDate = new Date(referenceDate);
        const refDay = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
        const compareDay = new Date(compareDate.getFullYear(), compareDate.getMonth(), compareDate.getDate());
        
        return refDay.getTime() !== compareDay.getTime();
    },

    
    async shouldTrack(pagePathOrEventName, isUniquePerDay) {
        const init = await this.init();
        const now = new Date();
        const lastHitKey = pagePathOrEventName;
        const lastHit = init[lastHitKey];
        const isNewDayResult = this.isNewDay(lastHit, now);

        
        if (!lastHit || isNewDayResult) {
            init[lastHitKey] = now.toISOString();
            await this.save(init);
            return { shouldTrack: true, isNewDay: isNewDayResult };
        }

        if (isUniquePerDay) return { shouldTrack: false, isNewDay: false };
        return { shouldTrack: true, isNewDay: false };
    },

    
    async resetDailyCounters() {
        const data = await MeasureData.getData();
        data.lastday_popup_open = 0;
        data.lastday_snapshot = 0;
        data.lastday_snapshot_size = 0;
        data.lastday_snapshot_size_min = 0;
        data.lastday_snapshot_size_max = 0;
        data.lastday_delete = 0;
        data.lastday_delete_size = 0;
        await MeasureData.saveData(data);
    }
};

function getSizeScale(valeur) {
    
    if (valeur <= 24) {
      return valeur.toString();
    }
    
    
    if (valeur <= 99) {
      const reste = (valeur - 25) % 5;
      const debut = valeur - reste;
      const fin = Math.min(debut + 4, 99);
      return `${debut}-${fin}`;
    }
    
    
    if (valeur <= 249) {
      const reste = (valeur - 100) % 10;
      const debut = valeur - reste;
      const fin = Math.min(debut + 9, 249);
      return `${debut}-${fin}`;
    }
    
    
    if (valeur <= 999) {
      const reste = (valeur - 250) % 25;
      const debut = valeur - reste;
      const fin = Math.min(debut + 24, 999);
      return `${debut}-${fin}`;
    }
    
    
    if (valeur <= 2499) {
      const reste = (valeur - 1000) % 50;
      const debut = valeur - reste;
      const fin = Math.min(debut + 49, 2499);
      return `${debut}-${fin}`;
    }
    
    
    if (valeur <= 4999) {
      const reste = (valeur - 2500) % 100;
      const debut = valeur - reste;
      const fin = Math.min(debut + 99, 4999);
      return `${debut}-${fin}`;
    }
    
    
    return "5000+";
}


const Measure = {
    
    async init() {
        
        await MeasureData.init();
        
        
        const init = await MeasureInit.init();
        await MeasureInit.save(init);
        
        return this;
    },


    async trackPage(path, props, isUniquePerDay) {
        if (!window.umami || typeof window.umami.track !== 'function') {
            console.warn('Umami track not available');
           return;
        }

        const trackResult = await MeasureInit.shouldTrack(path, isUniquePerDay);
        if (trackResult.shouldTrack) {
            const data = await MeasureData.getData();
            const totalData = await this.getTotalData();

            const defaultProperties = {};
            const appManifest = chrome.runtime.getManifest();
	        defaultProperties['Version'] = appManifest.version;
            const properties = Object.assign({}, defaultProperties, props);
            
            window.umami.track('pageview', properties);
            //console.log('pageview: '+path, properties);
            
        }
    },

    
    async trackEvent(event, props, isUniquePerDay) {
        if (!window.umami || typeof window.umami.track !== 'function') {
            console.warn('Umami track not available');
           return;
        }

        const trackResult = await MeasureInit.shouldTrack(event, isUniquePerDay);
        if (trackResult.shouldTrack) {
            const data = await MeasureData.getData();
            const totalData = await this.getTotalData();
            
            let defaultProperties = {}
            const appManifest = chrome.runtime.getManifest();
	        defaultProperties['Version'] = appManifest.version;

            if ('popup_open' == event ) {
                
                const init = await MeasureInit.init();
                const now = new Date();
                const lastUse = init.popup_open ? new Date(init.popup_open) : now;
                const diffTime = Math.abs(now - lastUse);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                
                let jsonViewMode = "not set";
                if (chrome.storage) {
                    try {
                        const settings = await new Promise(resolve => {
                            chrome.storage.sync.get(['settings'], result => resolve(result.settings));
                        });
                        if (settings && typeof settings.jsonDefaultViewMode !== 'undefined') {
                            jsonViewMode = settings.jsonDefaultViewMode ? "true" : "false";
                        }
                    } catch (error) {

                    }
                }

                const globalProperties = {
                    
                    "Last__PopupOpen": data.lastday_popup_open,
                    "Last__PopupOpen_days": diffDays,
                    "Last__PopupOpen_avg": diffDays > 0 ? Math.round(data.lastday_popup_open / diffDays * 100) / 100 : 0,
                    "Last__Snap": data.lastday_snapshot,
                    "Last__SnapSize": getSizeScale(Math.ceil(data.lastday_snapshot_size)),
                    "Last__SnapSize_min": getSizeScale(Math.ceil(data.lastday_snapshot_size_min)),
                    "Last__SnapSize_max": getSizeScale(Math.ceil(data.lastday_snapshot_size_max)),
                    "Last__Delete_count": data.lastday_delete,
                    "Last__DeleteSize": getSizeScale(Math.ceil(data.lastday_delete_size)),
                    "Last__SnapSize_avg": data.lastday_snapshot > 0 ? getSizeScale(Math.ceil(Math.round(data.lastday_snapshot_size / data.lastday_snapshot * 100) / 100)) : 0,
                    "Last__DeleteSize_avg": data.lastday_delete > 0 ? getSizeScale(Math.ceil(Math.round(data.lastday_delete_size / data.lastday_delete * 100) / 100)) : 0,
                    
                    "Storage__Snap_count": totalData.total_snapshots,
                    "Storage__Size": getSizeScale(Math.ceil(totalData.total_snapshots_size)),
                    "Storage__SnapSize_min": totalData.total_snapshot_size_min ? getSizeScale(Math.ceil(totalData.total_snapshot_size_min)) : 0,
                    "Storage__SnapSize_max": totalData.total_snapshot_size_max ? getSizeScale(Math.ceil(totalData.total_snapshot_size_max)) : 0,
                    "Storage__SnapSize_avg": getSizeScale(Math.ceil(totalData.total_avg_size_per_snapshot)),
                    "Storage__Hostname_count": totalData.total_snapshots_hostname,
                    
                    "UserSettings__JsonView": jsonViewMode
                };
                defaultProperties = Object.assign(defaultProperties, globalProperties)
            }

            const properties = Object.assign({}, defaultProperties);
            
            
            window.umami.track(event, properties);
            
            
            if (event === 'popup_open' && trackResult.isNewDay) {
                await MeasureInit.resetDailyCounters();
            }
        }
    },

    
    async getTotalData() {
        return new Promise((resolve) => {
            if (chrome.storage) {
                chrome.storage.local.get('snapshots', (result) => {
                    const snapshots = result.snapshots || [];
                    const sizes = snapshots.map(s => this.getSnapshotSize(s.snapshot));
                    
                    const totalData = {
                        total_snapshots: snapshots.length,
                        total_snapshots_size: sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) * 100) / 100 : 0,
                        total_snapshot_size_min: sizes.length > 0 ? Math.round(Math.min(...sizes) * 100) / 100 : 0,
                        total_snapshot_size_max: sizes.length > 0 ? Math.round(Math.max(...sizes) * 100) / 100 : 0,
                        total_avg_size_per_snapshot: sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length * 100) / 100 : 0,
                        total_snapshots_hostname: new Set(snapshots.map(s => s.context.host)).size
                    };
                    
                    resolve(totalData);
                });
            } else {
                resolve({});
            }
        });
    },

    
    getSnapshotSize(data) {
        return Math.round((JSON.stringify(data).length / 1024 / 2) * 100) / 100; 
    },

    
    async updateNewSnapshot(input) {
        const data = await MeasureData.getData();
        const sizeInKo = this.getSnapshotSize(input.snapshot);
        
        
        data.lastday_snapshot++;
        data.lastday_snapshot_size += sizeInKo;
        
        
        if (data.lastday_snapshot === 1) {
            
            data.lastday_snapshot_size_min = sizeInKo;
            data.lastday_snapshot_size_max = sizeInKo;
        } else {
            
            data.lastday_snapshot_size_min = Math.min(data.lastday_snapshot_size_min, sizeInKo);
            data.lastday_snapshot_size_max = Math.max(data.lastday_snapshot_size_max, sizeInKo);
        }

        await MeasureData.saveData(data);
    },

    
    async updateDeleteSnapshot(input) {
        if (!input || typeof input !== 'object') {
            throw new Error('Invalid input format for updateDeleteSnapshot');
        }

        const data = await MeasureData.getData();
        data.lastday_delete += input.count || 0;
        data.lastday_delete_size += Math.round((input.size || 0) * 100) / 100;
        await MeasureData.saveData(data);
    }
};


let trackingReady = false;

document.addEventListener('DOMContentLoaded', () => {
    
    Measure.init().catch(console.error);

    
    const checkUmami = setInterval(() => {
        if (window.umami && typeof window.umami.track === 'function') {
            clearInterval(checkUmami);
            trackingReady = true;
        }
    }, 100);
});
