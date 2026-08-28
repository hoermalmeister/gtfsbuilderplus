import { createApp, reactive, ref, nextTick, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

// --- TŘÍDĚNÍ ATRIBUTŮ (Required první) ---
const sortAttrs = (arr) => arr.sort((a, b) => (a.required === b.required) ? 0 : a.required ? -1 : 1);

const agencyAttributes = sortAttrs([
    { key: 'agency_url', required: true }, { key: 'agency_timezone', required: true },
    { key: 'agency_lang', required: false }, { key: 'agency_phone', required: false },
    { key: 'agency_fare_url', required: false }, { key: 'agency_email', required: false },
    { key: 'cemv_support', required: false }
]);

const routeAttributes = sortAttrs([
    { key: 'route_type', required: true }, { key: 'route_long_name', required: false }, 
    { key: 'route_desc', required: false }, { key: 'route_url', required: false },
    { key: 'route_color', required: false }, { key: 'route_text_color', required: false },
    { key: 'route_sort_order', required: false }, { key: 'continuous_pickup', required: false },
    { key: 'continuous_drop_off', required: false }, { key: 'network_id', required: false }
]);

const stopAttributes = sortAttrs([
    { key: 'stop_code', required: false }, { key: 'stop_desc', required: false },
    { key: 'zone_id', required: false }, { key: 'stop_url', required: false },
    { key: 'location_type', required: false }, { key: 'parent_station', required: false },
    { key: 'stop_timezone', required: false }, { key: 'wheelchair_boarding', required: false },
    { key: 'level_id', required: false }, { key: 'platform_code', required: false }
]);

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
    // Přeřazené menu
    menuItems: ['Import', 'Feed info', 'Agencies', 'Lines', 'Stops', 'Calendar', 'Trips', 'Shapes', 'Export'],
    
    // Doplněno o default_lang
    feedInfo: { feed_publisher_name: '', feed_publisher_url: '', feed_lang: 'en', default_lang: '', feed_start_date: '', feed_end_date: '', feed_version: '', feed_contact_email: '', feed_contact_url: '', customFields: [] },
    
    agencyMode: 'grid', selectedAgency: null, agencies: [],
    newAgency: { agency_name: '', dynamicFields: [] },
    
    stopMode: 'grid', selectedStop: null, stops: [], activeStop: null,
    
    lineMode: 'grid', lines: [], activeLine: null, activeDirection: '0',

    // CALENDAR (kalendář a výjimky)
    calendarMode: 'grid', calendar: [], activeCalendar: null,
    calendarDates: [],
    newException: { service_id: '', date: '', exception_type: '1' }
});

const app = createApp({
    setup() {
        let map = null; let markers = [];
        const coordInput = ref(''); const coordStopName = ref(''); const selectedExistingStop = ref('');

        // --- AGENCIES ---
        const openAgency = (a) => { store.selectedAgency = a; store.agencyMode = 'details'; };
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

        // --- STOPS LOGIC ---
        const startCreateStop = () => {
            store.activeStop = { _internal_id: generateId(), stop_id: 'S_' + generateId().toUpperCase(), stop_name: '', stop_lat: '', stop_lon: '', dynamicFields: [] };
            store.stopMode = 'create';
        };
        const openStop = (stop) => { store.activeStop = stop; store.stopMode = 'details'; };
        const saveStop = () => { if (store.stopMode === 'create') store.stops.push(store.activeStop); store.stopMode = 'grid'; };
        const getAvailableStopAttributes = (key) => stopAttributes.filter(attr => attr.key === key || !store.activeStop.dynamicFields.map(f=>f.key).includes(attr.key));
        const triggerStopField = (index) => {
            if (index === -1 || index === store.activeStop.dynamicFields.length - 1) {
                const used = store.activeStop.dynamicFields.map(f => f.key);
                const next = stopAttributes.find(attr => !used.includes(attr.key));
                if (next) store.activeStop.dynamicFields.push({ key: next.key, value: '' });
            }
        };

        // --- CALENDAR LOGIC ---
        const startCreateCalendar = () => {
            store.activeCalendar = {
                _internal_id: generateId(), service_id: 'SRV_' + generateId().toUpperCase(),
                start_date: '', end_date: '',
                monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0'
            };
            store.calendarMode = 'create';
        };
        const openCalendar = (srv) => { store.activeCalendar = srv; store.calendarMode = 'details'; };
        const saveCalendar = () => { if (store.calendarMode === 'create') store.calendar.push(store.activeCalendar); store.calendarMode = 'grid'; };
        const deleteCalendar = () => { 
            if(confirm('Delete this service?')) { 
                store.calendar = store.calendar.filter(c => c._internal_id !== store.activeCalendar._internal_id); 
                store.calendarMode = 'grid'; 
            }
        };
        const addException = () => {
            store.calendarDates.push({ ...store.newException });
            store.newException.date = ''; // Reset jen u data, id a type zachováme pro rychlejší sypání
        };

        // --- STOP HELPERS ---
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
                
                const finalName = coordStopName.value.trim() || `Stop ${lat.toFixed(5)}`;
                const newStop = { _internal_id: generateId(), stop_id: 'S_' + generateId().toUpperCase(), stop_name: finalName, stop_lat: lat.toFixed(7), stop_lon: lon.toFixed(7), dynamicFields: [] };
                store.stops.push(newStop);
                store.activeLine.patterns[store.activeDirection].push({ stop_id: newStop.stop_id, timeOffset: 2 });
                coordInput.value = ''; coordStopName.value = '';
            }
        };

        // --- MAP LOGIC ---
        const initMap = (containerId) => {
            map = new maplibregl.Map({ container: containerId, style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', center: [15.6792, 48.5448], zoom: 12 });
            map.on('click', (e) => {
                const lat = e.lngLat.lat.toFixed(7); const lon = e.lngLat.lng.toFixed(7);
                
                if (store.currentView === 'Lines' && store.lineMode !== 'grid') {
                    const newStop = { _internal_id: generateId(), stop_id: 'S_' + generateId().toUpperCase(), stop_name: `Stop ${lat.substring(0,5)}`, stop_lat: lat, stop_lon: lon, dynamicFields: [] };
                    store.stops.push(newStop);
                    store.activeLine.patterns[store.activeDirection].push({ stop_id: newStop.stop_id, timeOffset: 2 });
                } 
                else if (store.currentView === 'Stops' && store.stopMode !== 'grid') {
                    store.activeStop.stop_lat = lat; store.activeStop.stop_lon = lon;
                    if (!store.activeStop.stop_name) store.activeStop.stop_name = `Stop ${lat.substring(0,5)}`;
                }
            });
        };
        const drawMarkers = () => {
            if (!map) return;
            markers.forEach(m => m.remove()); markers = [];
            
            if (store.currentView === 'Lines' && store.activeLine) {
                store.activeLine.patterns[store.activeDirection].forEach((pStop, idx) => {
                    const s = store.stops.find(st => st.stop_id === pStop.stop_id);
                    if (s) {
                        const el = document.createElement('div'); el.className = 'stop-number'; el.innerHTML = idx + 1;
                        markers.push(new maplibregl.Marker({element: el}).setLngLat([parseFloat(s.stop_lon), parseFloat(s.stop_lat)]).addTo(map));
                    }
                });
            } else if (store.currentView === 'Stops') {
                store.stops.forEach(s => {
                    const el = document.createElement('div'); el.className = 'stop-icon';
                    markers.push(new maplibregl.Marker({element: el}).setLngLat([parseFloat(s.stop_lon), parseFloat(s.stop_lat)]).addTo(map));
                });
            }
            if (markers.length > 1) {
                const b = new maplibregl.LngLatBounds(); markers.forEach(m => b.extend(m.getLngLat())); map.fitBounds(b, { padding: 50 });
            }
        };

        watch(() => [store.currentView, store.lineMode, store.stopMode, store.activeDirection, store.activeLine?.patterns, store.stops], async () => {
            await nextTick();
            const inLines = store.currentView === 'Lines' && store.lineMode !== 'grid';
            const inStops = store.currentView === 'Stops' && store.stopMode !== 'grid';
            
            if (inLines || inStops) {
                const containerId = inLines ? 'map-container-lines' : 'map-container-stops';
                if (map && map.getContainer().id !== containerId) { map.remove(); map = null; }
                if (!map) initMap(containerId); else map.resize();
                drawMarkers();
            } else {
                if (map) { map.remove(); map = null; }
            }
        }, { deep: true });

        return {
            store, agencyAttributes, commonTimezones, routeAttributes, routeTypes, stopAttributes, 
            coordInput, coordStopName, selectedExistingStop,
            openAgency, deleteSelectedAgency, startCreateAgency, getAvailableAttributes, triggerAgencyField, saveNewAgency, addCustomField,
            startCreateLine, openLine, saveLine, getAvailableLineAttributes, triggerLineField, getStopName, addExistingStopToPattern, addStopFromCoords,
            startCreateStop, openStop, saveStop, getAvailableStopAttributes, triggerStopField,
            startCreateCalendar, openCalendar, saveCalendar, deleteCalendar, addException
        };
    }
});
app.mount('#app');
