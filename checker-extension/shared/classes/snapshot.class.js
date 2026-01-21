import { getEventName, getEventType, flattenObject } from '/utils/utils.js';
/**
 * Classe Snapshot pour gérer les données et le rendu des snapshots de dataLayer
 */
export class Snapshot {
    /**
     * Crée une instance de Snapshot
     * @param {Object} rawData - Données brutes du snapshot
     */
    constructor(rawData) {
      this.id = rawData.id;
      this.context = rawData.context;
      this.snapshotData = rawData.snapshot;
      this.timestamp = rawData.context.ts;
      this.formattedDate = this._formatDate(this.timestamp, 'fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      this.formattedTime = this._formatTime(this.timestamp, 'fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      this.formattedFullDate = new Date(this.timestamp * 1000).toLocaleString();
      
      this.host = rawData.context.host;
      this.path = rawData.context.path;
      this.query = rawData.context.query || '';
      this.hash = rawData.context.hash || '';
      this.datalayerName = rawData.context.name;
      this.kiloOctet = rawData.context.kilo_octet;
      
      this.eventList = this._processEvents();
    }
  
    /**
     * Formate la date à partir d'un timestamp
     * @private
     * @param {number} timestamp - Timestamp en secondes
     * @param {string} locale - Locale pour le formatage
     * @param {Object} options - Options de formatage
     * @returns {string} Date formatée
     */
    _formatDate(timestamp, locale = 'fr-FR', options = {}) {
      const date = new Date(timestamp * 1000);
      return date.toLocaleDateString(locale, options);
    }
  
    /**
     * Formate l'heure à partir d'un timestamp
     * @private
     * @param {number} timestamp - Timestamp en secondes
     * @param {string} locale - Locale pour le formatage
     * @param {Object} options - Options de formatage
     * @returns {string} Heure formatée
     */
    _formatTime(timestamp, locale = 'fr-FR', options = {}) {
      const date = new Date(timestamp * 1000);
      return date.toLocaleTimeString(locale, options);
    }
  
    /**
     * Traite les événements dans les données du snapshot
     * @private
     * @returns {Array} Liste des événements traités
     */
    _processEvents() {
      const events = new Set();
      const eventsList = [];
      
      this.snapshotData.forEach(obj => {
        let eventName = getEventName(obj);
        const eventType = getEventType(obj, eventName);
        
        if (!events.has(eventName) && !['gtm', 'gtag'].includes(eventType)) {
          events.add(eventName);
          eventsList.push({ 
            name: eventName, 
            type: eventType
          });
        }
      });
  
      const typeOrder = {
        'page': 1,
        'ecommerce': 2,
        'custom-event': 3
      };
  
      const filteredEventsList = eventsList.filter(event => event.type !== 'data');
      filteredEventsList.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
      
      return filteredEventsList;
    }
  
    /**
     * Retourne l'URL complète du snapshot
     * @returns {string} URL complète
     */
    getFullUrl() {
      return `https://${this.host}${this.path}${this.query}${this.hash}`;
    }
  
    /**
     * Retourne les données formatées pour la table DataTable
     * @returns {Object} Données formatées pour la table
     */
    getTableRowData() {
      console.log('getTableRowData appelé pour snapshot:', this.id);
      return {
        id: this.id,
        formattedDate: this.formattedDate,
        formattedTime: this.formattedTime,
        timestamp: this.timestamp,
        context: this.context,
        eventList: this.eventList
      };
    }
  
    /**
     * Retourne les données formatées pour le template de détails
     * @returns {Object} Données formatées pour le template
     */
    getTemplateData() {
      return {
        context: this.context,
        formattedTimestamp: this.formattedFullDate,
        fullPath: this.path + this.query + this.hash,
        url: this.getFullUrl(),
        snapshot: { id: this.id },
        datalayerKiloOctet: `${this.kiloOctet} Ko`
      };
    }
  
    /**
     * Rendu de la vue détaillée du snapshot
     * @param {Function} templateGetter - Fonction pour récupérer un template
     * @returns {Promise<string>} Contenu HTML rendu
     */
    async renderDetailView(templateGetter) {
      const template = await templateGetter('snapshot-details');
      return Mustache.render(template, this.getTemplateData());
    }
  
    /**
     * Rendu du contenu du dataLayer
     * @param {Function} templateGetter - Fonction pour récupérer un template
     * @returns {Promise<string>} Contenu HTML rendu
     */
    async renderDataLayerContent(templateGetter) {
      try {
        const parsedData = this.snapshotData;
  
        if (Array.isArray(parsedData)) {
          // Créer une copie du tableau pour éviter de modifier l'original
          const dataToRender = [...parsedData];
          const templateData = {
            objects: await Promise.all(dataToRender.reverse().map(async (obj, index) => {
              const name = getEventName(obj);
              const type = getEventType(obj, name);
  
              const formattedJson = JSON.stringify(obj, null, 2)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
              
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
                id: index,
                position: index + 1,
                name: name,
                type: type,
                object_data: formattedJson,
                object_flat: flatData,
                jsonDefaultViewMode: window.settings?.jsonDefaultViewMode || false,
                event_index: index
              };
  
              // Rendre le template de l'accordéon
              const accordionTemplate = await templateGetter('datalayer-accordion');
              return Mustache.render(accordionTemplate, accordionData);
            }))
          };
  
          // Rendre le template principal avec les accordéons
          const template = await templateGetter('datalayer-accordions');
          const rendered = Mustache.render(template, {
            objects: templateData.objects.map(html => ({ pushObject: html }))
          });
          
          // Créer un conteneur temporaire pour appliquer highlight.js
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = rendered;
          
          // Appliquer highlight.js sur tous les blocs de code qui n'ont pas encore été traités
          tempDiv.querySelectorAll('pre code:not([data-highlighted="true"])').forEach((block) => {
            hljs.highlightElement(block);
            block.setAttribute('data-highlighted', 'true');
          });
          
          return tempDiv.innerHTML;
        }
        
        return '';
      } catch (error) {
        return `<div class="message is-danger">
          <div class="message-body">
            Error rendering dataLayer: ${error.message}
          </div>
        </div>`;
      }
    }
  
    /**
     * Vérifie si le snapshot correspond à un terme de recherche
     * @param {string} term - Terme de recherche
     * @returns {boolean} Vrai si le snapshot correspond au terme
     */
    matchSearchTerm(term) {
      if (!term) return true;
      
      const termLower = term.toLowerCase();
      const searchableParts = [
        this.host,
        this.path,
        this.datalayerName,
        ...this.eventList.map(e => e.name)
      ];
      
      return searchableParts.some(part => 
        part && part.toString().toLowerCase().includes(termLower)
      );
    }
  
    /**
     * Vérifie si le snapshot correspond aux filtres d'hôte et de dataLayer
     * @param {Array} hostnames - Noms d'hôtes filtrés
     * @param {Array} datalayers - Noms de dataLayers filtrés
     * @returns {boolean} Vrai si le snapshot correspond aux filtres
     */
    matchFilters(hostnames = [], datalayers = []) {
      const hostMatch = hostnames.length === 0 || hostnames.includes(this.host);
      const dataLayerMatch = datalayers.length === 0 || datalayers.includes(this.datalayerName);
      
      return hostMatch && dataLayerMatch;
    }
  
    /**
     * Retourne la liste des noms d'événements
     * @returns {Array} Liste des noms d'événements
     */
    getEventNames() {
      return this.eventList.map(e => e.name);
    }
  
    /**
     * Vérifie si le snapshot contient un événement d'un type spécifique
     * @param {string} type - Type d'événement à vérifier
     * @returns {boolean} Vrai si le snapshot contient ce type d'événement
     */
    hasEventType(type) {
      return this.eventList.some(e => e.type === type);
    }
  }


  /**
 * Classe SnapshotCollection pour gérer une collection de snapshots
 */
export class SnapshotCollection {
  /**
   * Crée une collection de snapshots
   * @param {Array} snapshots - Tableau d'objets Snapshot
   */
  constructor(snapshots = []) {
    this.snapshots = snapshots;
  }

  /**
   * Ajoute un snapshot à la collection
   * @param {Snapshot} snapshot - Snapshot à ajouter
   */
  add(snapshot) {
    this.snapshots.push(snapshot);
  }

  /**
   * Transforme des données brutes en collection de snapshots
   * @param {Array} rawData - Données brutes des snapshots
   * @returns {SnapshotCollection} Nouvelle collection de snapshots
   */
  static fromRawData(rawData) {
    const snapshots = rawData.map(data => new Snapshot(data));
    return new SnapshotCollection(snapshots);
  }

  /**
   * Filtre la collection selon un terme de recherche et des filtres
   * @param {string} searchTerm - Terme de recherche
   * @param {Array} hostnames - Filtres d'hôtes
   * @param {Array} datalayers - Filtres de dataLayers
   * @returns {Array} Snapshots filtrés
   */
  filter(searchTerm = '', hostnames = [], datalayers = []) {
    return this.snapshots.filter(snapshot => 
      snapshot.matchSearchTerm(searchTerm) && 
      snapshot.matchFilters(hostnames, datalayers)
    );
  }

  /**
   * Trie la collection de snapshots
   * @param {Function} compareFn - Fonction de comparaison
   * @returns {SnapshotCollection} Collection triée
   */
  sort(compareFn) {
    this.snapshots.sort(compareFn);
    return this;
  }

  /**
   * Trie la collection par timestamp (du plus récent au plus ancien)
   * @returns {SnapshotCollection} Collection triée
   */
  sortByTimestampDesc() {
    return this.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Retourne un snapshot par son ID
   * @param {string} id - ID du snapshot
   * @returns {Snapshot|undefined} Le snapshot trouvé ou undefined
   */
  findById(id) {
    return this.snapshots.find(snapshot => snapshot.id === id);
  }

  /**
   * Retourne tous les noms d'hôtes uniques dans la collection
   * @returns {Array} Tableau des noms d'hôtes uniques
   */
  getUniqueHostnames() {
    const hostnames = new Set();
    this.snapshots.forEach(snapshot => {
      if (snapshot.host) {
        hostnames.add(snapshot.host);
      }
    });
    return Array.from(hostnames);
  }

  /**
   * Retourne tous les noms de dataLayers uniques dans la collection
   * @returns {Array} Tableau des noms de dataLayers uniques
   */
  getUniqueDatalayers() {
    const datalayers = new Set();
    this.snapshots.forEach(snapshot => {
      if (snapshot.datalayerName) {
        datalayers.add(snapshot.datalayerName);
      }
    });
    return Array.from(datalayers);
  }

  /**
   * Retourne le nombre de snapshots dans la collection
   * @returns {number} Nombre de snapshots
   */
  get length() {
    return this.snapshots.length;
  }

  /**
   * Accès aux snapshots sous forme de tableau
   * @returns {Array} Tableau des snapshots
   */
  toArray() {
    return [...this.snapshots];
  }

  /**
   * Supprime des snapshots par IDs
   * @param {Array} ids - Tableau d'IDs à supprimer
   * @returns {SnapshotCollection} Collection filtrée
   */
  removeByIds(ids) {
    this.snapshots = this.snapshots.filter(snapshot => !ids.includes(snapshot.id));
    return this;
  }

  /**
   * Retourne des snapshots par IDs
   * @param {Array} ids - Tableau d'IDs à récupérer
   * @returns {Array} Snapshots trouvés
   */
  getByIds(ids) {
    return this.snapshots.filter(snapshot => ids.includes(snapshot.id));
  }
}