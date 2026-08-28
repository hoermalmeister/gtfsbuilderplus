import { createApp, reactive, ref, onMounted, watch, nextTick } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

// --- GTFS SPECIFIKACE ---
const agencyAttributes = [
    { key: 'agency_url', required: true },
    { key: 'agency_timezone', required: true },
    { key: 'agency_lang', required: false },
    { key: 'agency_phone', required: false },
    { key: 'agency_fare_url', required: false },
    { key: 'agency_email', required: false },
    { key: 'cemv_support', required: false }
];

const routeAttributes = [
    { key: 'route_long_name', required: false },
    { key: 'route_desc', required: false },
    { key: 'route_type', required: true },
    { key: 'route_url', required: false },
    { key: 'route_color', required: false },
    { key: 'route_text_color', required: false },
    { key: 'route_sort_order', required: false },
    { key: 'continuous_pickup', required: false },
    { key: 'continuous_drop_off', required: false },
    { key: 'network_id', required: false }
];

const routeTypes = [
    { value: '0', label: '0 - Tram / Streetcar' },
    { value: '1', label: '1 - Subway / Metro' },
    { value: '2', label: '2 - Rail' },
    { value: '3', label: '3 - Bus' },
    { value: '4', label: '4 - Ferry' },
    { value: '11', label: '11 - Trolleybus' },
    { value: '12', label: '12 - Monorail' }
];

const generateId = () => Math.random().toString(36).substring(2, 9);

// --- REAKTIVNÍ STAV APLIKACE ---
const store = reactive({
    currentView: 'Lines',
    menuItems: ['Import', 'Feed info', 'Agencies', 'Lines', 'Stops', 'Trips', 'Calendar', 'Shapes', 'Export'],
    
    agencies: [], 
    
    // ZASTÁVKY
    stops: [],
    
    // LINKY
    lineMode: 'grid', // 'grid', 'create', 'details'
    lines: [],
    activeLine: null,
    activeDirection: '0', // '0' = Outbound, '1' = Inbound
});

const app = createApp({
    setup() {
        let map = null;
        let markers = [];
        const coordInput = ref('');
        const selectedExistingStop = ref('');

        // --- MAPA A JEJÍ INICIALIZACE ---
        const initMap = () => {
            if (map) return; // Inicializovat jen jednou
            map = new maplibregl.Map({
                container: 'map-container',
                style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
                center: [15.6792, 48.5448], // Z tvého příkladu
                zoom: 12
            });

            map.on('click', (e) => {
                if (store.currentView !== 'Lines' || store.lineMode === 'grid') return;
                
                // Klik do mapy vytvoří novou zastávku a ihned ji přidá do vzoru linky
                const lat = e.lngLat.lat.toFixed(7);
                const lon = e.lngLat.lng.toFixed(7);
                
                const newStop = {
                    _internal_id: generateId(),
                    stop_id: 'S_' + generateId().toUpperCase(),
                    stop_name: `Stop ${lat.substring(0,5)}, ${lon.substring(0,5)}`,
                    stop_lat: lat,
                    stop_lon: lon,
                    dynamicFields: []
                };
                
                store.stops.push(newStop);
                store.activeLine.patterns[store.activeDirection].push({
                    stop_id: newStop.stop_id,
                    timeOffset: 2 // Výchozí doba jízdy k této zastávce: 2 min
                });
            });
        };

        // Kreslení markerů podle aktuálně vybrané linky a směru
        const drawMarkers = () => {
            if (!map) return;
            markers.forEach(m => m.remove());
            markers = [];

            if (!store.activeLine) return;

            const patternStops = store.activeLine.patterns[store.activeDirection];
            patternStops.forEach((pStop, idx) => {
                const stopData = store.stops.find(s => s.stop_id === pStop.stop_id);
                if (stopData) {
                    const el = document.createElement('div');
                    el.className = 'stop-number'; // Použije CSS třídu z HTML
                    el.innerHTML = idx + 1;
                    
                    const marker = new maplibregl.Marker(el)
                        .setLngLat([parseFloat(stopData.stop_lon), parseFloat(stopData.stop_lat)])
                        .addTo(map);
                    markers.push(marker);
                }
            });

            // Přizpůsobení mapy tak, aby obsáhla všechny body
            if (markers.length > 1) {
                const bounds = new maplibregl.LngLatBounds();
                markers.forEach(m => bounds.extend(m.getLngLat()));
                map.fitBounds(bounds, { padding: 50 });
            }
        };

        // Když se otevře detail linky (a zobrazí se pravý panel), inicializuj/překresli mapu
        watch(() => [store.currentView, store.lineMode, store.activeDirection, store.activeLine?.patterns], async () => {
            if (store.currentView === 'Lines' && store.lineMode !== 'grid') {
                await nextTick(); // Počkej, až Vue vykreslí div #map-container
                if (!map) initMap();
                else map.resize(); // Pokud už existuje, ale změnil velikost, musí se probudit
                drawMarkers();
            }
        }, { deep: true });


        // --- LOGIKA PRO LINKY ---
        const startCreateLine = () => {
            store.activeLine = {
                _internal_id: generateId(),
                route_id: 'R_' + generateId().toUpperCase(),
                route_short_name: '',
                agency_id: '',
                dynamicFields: [],
                patterns: { '0': [], '1': [] } // Obousměrný vzor
            };
            store.activeDirection = '0';
            store.lineMode = 'create';
        };

        const openLine = (line) => {
            store.activeLine = line;
            store.activeDirection = '0';
            store.lineMode = 'details';
        };

        const saveLine = () => {
            if (store.lineMode === 'create') store.lines.push(store.activeLine);
            store.lineMode = 'grid';
        };

        const getAvailableLineAttributes = (currentKey) => {
            const usedKeys = store.activeLine.dynamicFields.map(f => f.key);
            return routeAttributes.filter(attr => attr.key === currentKey || !usedKeys.includes(attr.key));
        };

        const triggerLineField = (index) => {
            if (index === -1 || index === store.activeLine.dynamicFields.length - 1) {
                const usedKeys = store.activeLine.dynamicFields.map(f => f.key);
                const nextAvailable = routeAttributes.find(attr => !usedKeys.includes(attr.key));
                if (nextAvailable) {
                    store.activeLine.dynamicFields.push({
                        key: nextAvailable.key,
                        value: nextAvailable.key === 'route_type' ? '3' : '' // Výchozí bus, pokud vyskočí typ
                    });
                }
            }
        };

        // --- ZASTÁVKY A PARSOVÁNÍ SOUŘADNIC ---
        const getStopName = (id) => {
            const s = store.stops.find(s => s.stop_id === id);
            return s ? s.stop_name : 'Unknown Stop';
        };

        const addExistingStopToPattern = () => {
            if (selectedExistingStop.value) {
                store.activeLine.patterns[store.activeDirection].push({
                    stop_id: selectedExistingStop.value,
                    timeOffset: 2
                });
                selectedExistingStop.value = ''; // Reset selectu
            }
        };

        const addStopFromCoords = () => {
            // Regulární výraz pro různé formáty zápisu GPS: odstraní mezery, najde dvě čísla
            const input = coordInput.value.replace(/\s+/g, '');
            const regex = /([+-]?\d+\.?\d*)[NnSs]?\s*,\s*([+-]?\d+\.?\d*)[EeWw]?/;
            const match = input.match(regex);
            
            if (match) {
                let lat = parseFloat(match[1]);
                let lon = parseFloat(match[2]);
                
                // Korekce jih/západ
                if (input.toUpperCase().includes('S') && lat > 0) lat = -lat;
                if (input.toUpperCase().includes('W') && lon > 0) lon = -lon;

                const latStr = lat.toFixed(7);
                const lonStr = lon.toFixed(7);

                const newStop = {
                    _internal_id: generateId(),
                    stop_id: 'S_' + generateId().toUpperCase(),
                    stop_name: `Stop ${latStr.substring(0,5)}`,
                    stop_lat: latStr,
                    stop_lon: lonStr,
                    dynamicFields: []
                };
                
                store.stops.push(newStop);
                store.activeLine.patterns[store.activeDirection].push({
                    stop_id: newStop.stop_id,
                    timeOffset: 2
                });
                coordInput.value = ''; // Vyčištění pole
            } else {
                alert('Invalid coordinate format. Try: 48.5448150N, 15.6792536E');
            }
        };

        return { 
            store, routeTypes, coordInput, selectedExistingStop,
            startCreateLine, openLine, saveLine, 
            getAvailableLineAttributes, triggerLineField, 
            getStopName, addExistingStopToPattern, addStopFromCoords
        };
    }
});

app.mount('#app');
