import { createApp, reactive } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

// Definice GTFS atributů podle oficiální specifikace
const agencyAttributes = [
    { key: 'agency_url', required: true },
    { key: 'agency_timezone', required: true },
    { key: 'agency_lang', required: false },
    { key: 'agency_phone', required: false },
    { key: 'agency_fare_url', required: false },
    { key: 'agency_email', required: false },
    { key: 'cemv_support', required: false }
];

// --- AUTOMATICKÉ GENEROVÁNÍ IANA ČASOVÝCH ZÓN ---
// Moderní prohlížeče (Chrome, Firefox, Safari) podporují získání všech IANA zón přes Intl API.
let commonTimezones = [];
try {
    // Vrátí pole stringů jako: ["Africa/Abidjan", "Africa/Accra", ..., "Europe/Prague", ...]
    commonTimezones = Intl.supportedValuesOf('timeZone');
} catch (e) {
    // Fallback pro velmi staré prohlížeče
    commonTimezones = [
        'Europe/Prague', 'Europe/London', 'America/New_York', 'Asia/Tokyo', 'UTC'
    ];
}

const store = reactive({
    currentView: 'Agencies',
    menuItems: ['Import', 'Feed info', 'Agencies', 'Lines', 'Stops', 'Calendar', 'Shapes', 'Export'],
    
    // AGENCIES STAV
    agencyMode: 'grid', // Možnosti: 'grid', 'create', 'details'
    selectedAgency: null,
    agencies: [],
    
    // Dočasný stav pro vytváření nového dopravce
    newAgency: {
        agency_name: '',
        dynamicFields: [] // Bude obsahovat pole { key: '...', value: '...' }
    },

    feedInfo: { /* ... ponech jak bylo ... */ customFields: [] }
});

const app = createApp({
    setup() {
        // --- FUNKCE PRO ZOBRAZENÍ A DETAIL ---
        const openAgency = (agency) => {
            store.selectedAgency = agency;
            store.agencyMode = 'details';
        };

        const deleteSelectedAgency = () => {
            if(confirm('Are you sure you want to delete this agency?')) {
                store.agencies = store.agencies.filter(a => a._internal_id !== store.selectedAgency._internal_id);
                store.agencyMode = 'grid';
            }
        };

        // --- FUNKCE PRO VYTVÁŘENÍ (PROGRESSIVE DISCLOSURE) ---
        const startCreateAgency = () => {
            store.newAgency = { agency_name: '', dynamicFields: [] };
            store.agencyMode = 'create';
        };

        // Získá atributy do dropdownu: ty, které buď ještě nebyly použity, nebo jsou právě vybrány v tomto řádku
        const getAvailableAttributes = (currentKey) => {
            const usedKeys = store.newAgency.dynamicFields.map(f => f.key);
            return agencyAttributes.filter(attr => attr.key === currentKey || !usedKeys.includes(attr.key));
        };

        // Hlavní kouzlo: Pokud uživatel klikne (focus) do posledního pole, přidáme automaticky další
        const triggerNextField = (index) => {
            // index === -1 znamená, že jsme klikli do jména (agency_name)
            // Jinak zkontrolujeme, zda klikáme do úplně posledního dynamického pole
            if (index === -1 || index === store.newAgency.dynamicFields.length - 1) {
                const usedKeys = store.newAgency.dynamicFields.map(f => f.key);
                // Najdeme první atribut z listu, který ještě není v usedKeys
                const nextAvailable = agencyAttributes.find(attr => !usedKeys.includes(attr.key));
                
                if (nextAvailable) {
                    store.newAgency.dynamicFields.push({
                        key: nextAvailable.key,
                        value: ''
                    });
                }
            }
        };

        const saveNewAgency = () => {
            // Automatické generování agency_id (bezpečná metoda pro prohlížeč)
            const generatedId = 'A' + Math.random().toString(36).substring(2, 7).toUpperCase();
            
            const newAgencyObj = {
                _internal_id: crypto.randomUUID(),
                agency_id: generatedId,
                agency_name: store.newAgency.agency_name,
                customFields: []
            };

            // Nastavíme všechny ostatní atributy jako prázdné stringy, aby byly v datech přítomné
            agencyAttributes.forEach(attr => newAgencyObj[attr.key] = '');

            // Přepíšeme je těmi, co uživatel dynamicky vyplnil
            store.newAgency.dynamicFields.forEach(f => {
                if(f.value.trim() !== '') {
                    newAgencyObj[f.key] = f.value;
                }
            });

            store.agencies.push(newAgencyObj);
            store.agencyMode = 'grid';
        };

        const addCustomField = (targetArray) => {
            targetArray.push({ key: '', value: '' });
        };

        // Vystavení do šablony
        return { 
            store, agencyAttributes, commonTimezones, openAgency, deleteSelectedAgency, 
            startCreateAgency, getAvailableAttributes, triggerNextField, 
            saveNewAgency, addCustomField 
        };
    }
});

app.mount('#app');
