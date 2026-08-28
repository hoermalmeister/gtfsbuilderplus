import { createApp, reactive, ref, onMounted, watch, nextTick } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

const agencyAttributes = [
    { key: 'agency_url', required: true }, { key: 'agency_timezone', required: true },
    { key: 'agency_lang', required: false }, { key: 'agency_phone', required: false },
    { key: 'agency_fare_url', required: false }, { key: 'agency_email', required: false },
    { key: 'cemv_support', required: false }
];

const routeAttributes = [
    { key: 'route_long_name', required: false }, { key: 'route_desc', required: false },
    { key: 'route_type', required: true }, { key: 'route_url', required: false },
    { key: 'route_color', required: false }, { key: 'route_text_color', required: false },
    { key: 'route_sort_order', required: false }, { key: 'continuous_pickup', required: false },
    { key: 'continuous_drop_off', required: false }, { key: 'network_id', required: false }
];

const routeTypes = [
    { value: '0', label: '0 - Tram' }, { value: '1', label: '1 - Subway' },
    { value: '2', label: '2 - Rail' }, { value: '3', label: '3 - Bus' },
    { value: '4', label: '4 - Ferry' }, { value: '11', label: '11 - Trolleybus' },
    { value: '12', label: '12 - Monorail' }
];

let commonTimezones = [];
try { commonTimezones = Intl.supportedValuesOf('timeZone'); } 
catch (e) { commonTimezones = ['Europe/Prague', 'UTC']; }

const generateId = () => Math.random().toString(36).substring(2, 9);

const store = reactive({
    currentView: 'Feed info',
    menuItems: ['Import', 'Feed info', 'Agencies', 'Lines', 'Stops', 'Trips', 'Calendar', 'Shapes', 'Export'],
    
    feedInfo: { feed_publisher_name: '', feed_publisher_url: '', feed_lang: 'en', feed_start_date: '', feed_end_date: '', feed_version: '', feed_contact_email: '', feed_contact_url: '', customFields: [] },
    
    agencyMode: 'grid', selectedAgency: null, agencies: [],
    newAgency: { agency_name: '', dynamicFields: [] },
    
    stops: [],
    
    lineMode: 'grid', lines: [], activeLine: null, activeDirection: '0'
});

const app = createApp({
    setup() {
        let map = null; let markers = [];
        const coordInput = ref(''); const selectedExistingStop = ref('');

        // --- AGENCIES ---
        const openAgency = (agency) => { store.selectedAgency = agency; store.agencyMode = 'details'; };
        const deleteSelectedAgency = () => { if(confirm('Delete?')) { store.agencies = store.agencies.filter(a => a._internal_id !== store.selectedAgency._internal_id); store.agencyMode = 'grid'; }};
        const startCreateAgency = () => { store.newAgency = { agency_name: '', dynamicFields: [] }; store.agencyMode = 'create'; };
        const getAvailableAttributes = (key) => agencyAttributes.filter(attr => attr.key === key || !store.newAgency.dynamicFields.map(f=>f.key).includes(attr.key));
        const triggerAgencyField = (index) => {
            if (index === -1 || index === store.newAgency.dynamicFields.length - 1) {
                const used = store.newAgency.dynamicFields.map(f => f.key);
                const next = agencyAttributes.find(attr => !used.includes(attr.key));
                if (next) store.newAgency.dynamicFields.push({ key: next.key, value: '' });
            }
        };
        const saveNewAgency = () => {
            const newObj = { _internal_id: generateId(), agency_id: 'A' + generateId().toUpperCase(), agency_name: store.newAgency.agency_name, customFields: [] };
            agencyAttributes.forEach(attr => newObj[attr.key] = '');
            store.newAgency.dynamicFields.forEach(f => { if(f.value.trim() !== '') newObj[f.key] = f.value; });
            store.agencies.push(newObj); store.agencyMode = 'grid';
        };
        const addCustomField = (arr) => arr.push({ key: '', value: '' });

        // --- LINES ---
        const startCreateLine = () => {
            store.activeLine = { _internal_id: generateId(), route_id: 'R_' + generateId().toUpperCase(), route_short_name: '', agency_id: '', dynamicFields: [], patterns: { '0': [], '1': [] }};
            store.activeDirection = '0'; store.lineMode = 'create';
        };
        const openLine = (line) => { store.activeLine = line; store.activeDirection = '0'; store.lineMode = 'details'; };
        const saveLine = () => { if (store.lineMode === 'create') store.lines.push(store.activeLine); store.lineMode = 'grid'; };
        const getAvailableLineAttributes = (key) => routeAttributes.filter(attr => attr.key === key || !store.activeLine.dynamicFields.map(f=>f.key).includes(attr.key));
        const triggerLineField = (index) => {
            if (index === -1 || index === store.activeLine.dynamicFields.length - 1) {
                const used = store.activeLine.dynamicFields.map(f => f.key);
                const next = routeAttributes.find(attr => !used.includes(attr.key));
                if (next) store.activeLine.dynamicFields.push({ key: next.key, value: next.key === 'route_type' ? '3' : '' });
            }
        };

        // --- STOPS & MAP ---
        const getStopName = (id) => { const s = store.stops.find(s => s.stop_id === id); return s ? s.stop_name : 'Unknown'; };
        const addExistingStopToPattern = () => {
            if (selectedExistingStop.value) { store.activeLine.patterns[store.activeDirection].push({ stop_id: selectedExistingStop.value, timeOffset: 2 }); selectedExistingStop.value = ''; }
        };
        const addStopFromCoords = () => {
            const match = coordInput.value.replace(/\s+/g, '').match(/([+-]?\d+\.?\d*)[NnSs]?\s*,\s*([+-]?\d+\.?\d*)[EeWw]?/);
            if (match) {
                let lat = parseFloat(match[1]); let lon = parseFloat(match[2]);
                if (coordInput.value.toUpperCase().includes('S') && lat > 0) lat = -lat;
                if (coordInput.value.toUpperCase().includes('W') && lon > 0) lon = -lon;
                const newStop = { _internal_id: generateId(), stop_id: 'S_' + generateId().toUpperCase(), stop_name: `Stop ${lat.toFixed(5)}`, stop_lat: lat.toFixed(7), stop_lon: lon.toFixed(7), dynamicFields: [] };
                store.stops.push(newStop);
                store.activeLine.patterns[store.activeDirection].push({ stop_id: newStop.stop_id, timeOffset: 2 });
                coordInput.value = '';
            }
        };

        const initMap = () => {
            if (map) return;
            map = new maplibregl.Map({ container: 'map-container', style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', center: [15.6792, 48.5448], zoom: 12 });
            map.on('click', (e) => {
                if (store.currentView !== 'Lines' || store.lineMode === 'grid') return;
                const newStop = { _internal_id: generateId(), stop_id: 'S_' + generateId().toUpperCase(), stop_name: `Stop ${e.lngLat.lat.toFixed(5)}`, stop_lat: e.lngLat.lat.toFixed(7), stop_lon: e.lngLat.lng.toFixed(7), dynamicFields: [] };
                store.stops.push(newStop);
                store.activeLine.patterns[store.activeDirection].push({ stop_id: newStop.stop_id, timeOffset: 2 });
            });
        };
        const drawMarkers = () => {
            if (!map) return;
            markers.forEach(m => m.remove()); markers = [];
            if (!store.activeLine) return;
            store.activeLine.patterns[store.activeDirection].forEach((pStop, idx) => {
                const s = store.stops.find(st => st.stop_id === pStop.stop_id);
                if (s) {
                    const el = document.createElement('div'); el.className = 'stop-number'; el.innerHTML = idx + 1;
                    markers.push(new maplibregl.Marker({element: el}).setLngLat([parseFloat(s.stop_lon), parseFloat(s.stop_lat)]).addTo(map));
                }
            });
            if (markers.length > 1) {
                const b = new maplibregl.LngLatBounds(); markers.forEach(m => b.extend(m.getLngLat())); map.fitBounds(b, { padding: 50 });
            }
        };
        watch(() => [store.currentView, store.lineMode, store.activeDirection, store.activeLine?.patterns], async () => {
            if (store.currentView === 'Lines' && store.lineMode !== 'grid') {
                await nextTick();
                if (!map) initMap(); else map.resize();
                drawMarkers();
            }
        }, { deep: true });

        return {
            store, agencyAttributes, commonTimezones, routeAttributes, routeTypes, coordInput, selectedExistingStop,
            openAgency, deleteSelectedAgency, startCreateAgency, getAvailableAttributes, triggerAgencyField, saveNewAgency, addCustomField,
            startCreateLine, openLine, saveLine, getAvailableLineAttributes, triggerLineField, getStopName, addExistingStopToPattern, addStopFromCoords
        };
    }
});
app.mount('#app');
