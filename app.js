import { createApp, reactive } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

// Reaktivní stav celé aplikace
const store = reactive({
    // Výchozí obrazovka
    currentView: 'Feed info',
    menuItems: ['Import', 'Feed info', 'Agencies', 'Lines', 'Stops', 'Calendar', 'Shapes', 'Export'],
    
    // Data pro feed_info.txt
    feedInfo: {
        feed_publisher_name: '',
        feed_publisher_url: '',
        feed_lang: 'en',
        feed_start_date: '',
        feed_end_date: '',
        feed_version: '',
        feed_contact_email: '',
        feed_contact_url: '',
        customFields: [] // formát: { key: '...', value: '...' }
    },

    // Data pro agency.txt
    agencies: [
        {
            _internal_id: crypto.randomUUID(), // Unikátní ID pro Vue iteraci
            agency_id: '',
            agency_name: '',
            agency_url: '',
            agency_timezone: '',
            customFields: []
        }
    ]
});

const app = createApp({
    setup() {
        // Funkce pro přidání vlastního pole do libovolného pole (feedInfo nebo specific agency)
        const addCustomField = (targetArray) => {
            targetArray.push({ key: '', value: '' });
        };

        // Funkce pro přidání nového provozovatele
        const addAgency = () => {
            store.agencies.push({
                _internal_id: crypto.randomUUID(),
                agency_id: '',
                agency_name: '',
                agency_url: '',
                agency_timezone: '',
                customFields: []
            });
        };

        return { 
            store, 
            addCustomField, 
            addAgency 
        };
    }
});

app.mount('#app');
