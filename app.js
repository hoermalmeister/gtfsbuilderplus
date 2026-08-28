import { createApp, reactive, ref, computed, nextTick, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

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
    { key: 'stop_code', required: false }, { key: 'stop_desc', required: false }, { key: 'tts_stop_name', required: false },
    { key: 'zone_id', required: false }, { key: 'stop_url', required: false },
    { key: 'location_type', required: false }, { key: 'parent_station', required: false },
    { key: 'stop_timezone', required: false }, { key: 'wheelchair_boarding', required: false },
    { key: 'level_id', required: false }, { key: 'platform_code', required: false }, { key: 'stop_access', required: false }
]);

const tripAttributes = sortAttrs([
    { key: 'trip_headsign', required: false }, { key: 'trip_short_name', required: false },
    { key: 'direction_id', required: false }, { key: 'block_id', required: false },
    { key: 'shape_id', required: false }, { key: 'wheelchair_accessible', required: false },
    { key: 'bikes_allowed', required: false }
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

// --- HLAVNÍ STAV APLIKACE ---
const store = reactive({
    currentView: 'Import',
    feedInfo: { feed_publisher_name: '', feed_publisher_url: '', feed_lang: 'en', default_lang: '', feed_start_date: '', feed_end_date: '', feed_version: '', feed_contact_email: '', feed_contact_url: '', customFields: [] },
    agencyMode: 'grid', selectedAgency: null, agencies: [], newAgency: { agency_name: '', dynamicFields: [] },
    stopMode: 'grid', selectedStop: null, stops: [], activeStop: null,
    lineMode: 'grid', lines: [], activeLine: null, activeDirection: '0',
    calendarMode: 'grid', calendar: [], activeCalendar: null, calendarDates: [],
    newException: { service_id: '', date: '', exception_type: '1' },
    trips: [], tripMode: 'grid', activeTripRoute: null, activeTripEdit: null,
    tripGenConfig: { '0': { mode: 'single', service_id: '', start_time: '', end_time: '', interval: '' }, '1': { mode: 'single', service_id: '', start_time: '', end_time: '', interval: '' } },
    newTripStopId: '',
    transfers: [], newTransfer: { from_route_id: '', from_trip_id: '', from_stop_id: '', to_route_id: '', to_trip_id: '', to_stop_id: '', transfer_type: '0', min_transfer_time: '' },
    shapes: [], shapesSummary: [], brouterLoading: false, shapeGenConfig: { route_id: '', profile: 'car-fast' },
    
    // Import
    isImporting: false, importMessage: '', extraFiles: []
});

const app = createApp({
    setup() {
        let map = null; let markers = [];
        const coordInput = ref(''); const coordStopName = ref(''); const selectedExistingStop = ref('');

        const menuItems = computed(() => {
            return ['Import', 'Feed info', 'Agencies', 'Lines', 'Stops', 'Calendar', 'Trips', 'Transfers', 'Shapes', ...store.extraFiles.map(f => f.name), 'Export'];
        });

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

        // --- STOPS ---
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
        const getStopName = (id) => { const s = store.stops.find(s => s.stop_id === id); return s ? s.stop_name : 'Unknown'; };
        
        const addExistingStopToPattern = () => {
            if (selectedExistingStop.value) { store.activeLine.patterns[store.activeDirection].push({ stop_id: selectedExistingStop.value, timeOffsetMins: 2, timeOffsetSecs: 0 }); selectedExistingStop.value = ''; }
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
                store.activeLine.patterns[store.activeDirection].push({ stop_id: newStop.stop_id, timeOffsetMins: 2, timeOffsetSecs: 0 });
                coordInput.value = ''; coordStopName.value = '';
            }
        };

        // --- CALENDAR ---
        const startCreateCalendar = () => { store.activeCalendar = { _internal_id: generateId(), service_id: 'SRV_' + generateId().toUpperCase(), start_date: '', end_date: '', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0' }; store.calendarMode = 'create'; };
        const openCalendar = (srv) => { store.activeCalendar = srv; store.calendarMode = 'details'; };
        const saveCalendar = () => { if (store.calendarMode === 'create') store.calendar.push(store.activeCalendar); store.calendarMode = 'grid'; };
        const deleteCalendar = () => { if(confirm('Delete?')) { store.calendar = store.calendar.filter(c => c._internal_id !== store.activeCalendar._internal_id); store.calendarMode = 'grid'; } };
        const addException = () => { store.calendarDates.push({ ...store.newException }); store.newException.date = ''; };

        // --- TRIPS & TIME LOGIC ---
        const openTripManager = (line) => { store.activeTripRoute = line; store.tripMode = 'details'; };
        const getTripsForRouteAndDir = (dir) => {
            if (!store.activeTripRoute) return [];
            return store.trips.filter(t => t.route_id === store.activeTripRoute.route_id && t.direction_id === dir).sort((a, b) => (a.stop_times[0]?.departure_time || '').localeCompare(b.stop_times[0]?.departure_time || ''));
        };
        const formatGtfsTime = (totalSeconds) => {
            const h = Math.floor(totalSeconds / 3600); const m = Math.floor((totalSeconds % 3600) / 60); const s = totalSeconds % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };
        const timeStringToSeconds = (timeStr) => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':').map(Number);
            return (parts[0] || 0)*3600 + (parts[1] || 0)*60 + (parts[2] || 0);
        };
        const createTripObject = (dir, startSeconds, serviceId) => {
            const pattern = store.activeTripRoute.patterns[dir];
            let currentSeconds = startSeconds;
            const stopTimes = [];
            pattern.forEach((pStop, idx) => {
                const timeStr = formatGtfsTime(currentSeconds);
                stopTimes.push({ stop_id: pStop.stop_id, stop_sequence: idx + 1, arrival_time: timeStr, departure_time: timeStr });
                currentSeconds += (Number(pStop.timeOffsetMins) || 0) * 60 + (Number(pStop.timeOffsetSecs) || 0);
            });
            return { _internal_id: generateId(), trip_id: 'T_' + generateId().toUpperCase(), route_id: store.activeTripRoute.route_id, service_id: serviceId, direction_id: dir, stop_times: stopTimes, dynamicFields: [] };
        };
        const generateTrip = (dir) => {
            const config = store.tripGenConfig[dir];
            if (store.activeTripRoute.patterns[dir].length === 0) { alert('No stops in Journey Pattern.'); return; }
            store.trips.push(createTripObject(dir, timeStringToSeconds(config.start_time), config.service_id));
            config.start_time = ''; 
        };
        const generateBatchTrips = (dir) => {
            const config = store.tripGenConfig[dir];
            if (store.activeTripRoute.patterns[dir].length === 0) { alert('No stops in Journey Pattern.'); return; }
            let currentSecs = timeStringToSeconds(config.start_time);
            const endSecs = timeStringToSeconds(config.end_time);
            const intervalSecs = timeStringToSeconds(config.interval);
            if (intervalSecs <= 0) { alert('Interval must be > 0.'); return; }
            if (currentSecs > endSecs) { alert('Start time must be before end time.'); return; }
            while (currentSecs <= endSecs) {
                store.trips.push(createTripObject(dir, currentSecs, config.service_id));
                currentSecs += intervalSecs;
            }
            config.start_time = ''; config.end_time = ''; config.interval = '';
        };

        const openTripEdit = (trip) => { store.activeTripEdit = trip; store.tripMode = 'edit'; };
        const saveTripEdit = () => { store.activeTripEdit.stop_times.forEach((st, idx) => st.stop_sequence = idx + 1); store.tripMode = 'details'; };
        const deleteTrip = (internalId) => { if(confirm('Delete trip?')) { store.trips = store.trips.filter(t => t._internal_id !== internalId); store.tripMode = 'details'; } };
        const getAvailableTripAttributes = (key) => tripAttributes.filter(attr => attr.key === key || !store.activeTripEdit.dynamicFields.map(f=>f.key).includes(attr.key));
        const triggerTripField = (index) => {
            if (index === -1 || index === store.activeTripEdit.dynamicFields.length - 1) {
                const used = store.activeTripEdit.dynamicFields.map(f => f.key);
                const next = tripAttributes.find(attr => !used.includes(attr.key));
                if (next) store.activeTripEdit.dynamicFields.push({ key: next.key, value: '' });
            }
        };
        const moveStopTime = (index, dir) => {
            const arr = store.activeTripEdit.stop_times;
            if (index + dir < 0 || index + dir >= arr.length) return;
            const temp = arr[index]; arr[index] = arr[index + dir]; arr[index + dir] = temp;
            arr.forEach((st, idx) => st.stop_sequence = idx + 1);
        };
        const addStopToTrip = () => {
            if(store.newTripStopId) {
                store.activeTripEdit.stop_times.push({ stop_id: store.newTripStopId, stop_sequence: store.activeTripEdit.stop_times.length + 1, arrival_time: '00:00:00', departure_time: '00:00:00' });
                store.newTripStopId = '';
            }
        };

        // --- TRANSFERS ---
        const getTripsForRoute = (routeId) => store.trips.filter(t => t.route_id === routeId);
        const getStopsForTrip = (tripId) => {
            const t = store.trips.find(x => x.trip_id === tripId);
            return t ? t.stop_times.map(st => ({ stop_id: st.stop_id })) : [];
        };
        const addTransfer = () => { store.transfers.push({ ...store.newTransfer }); store.newTransfer = { from_route_id: '', from_trip_id: '', from_stop_id: '', to_route_id: '', to_trip_id: '', to_stop_id: '', transfer_type: '0', min_transfer_time: '' }; };

        // --- SHAPES GENERATION (BRouter) ---
        const isRouteShapesComplete = (routeId) => {
            const routeTrips = store.trips.filter(t => t.route_id === routeId);
            if (routeTrips.length === 0) return false;
            return routeTrips.every(t => {
                const sf = t.dynamicFields.find(f => f.key === 'shape_id');
                return sf && sf.value && sf.value.trim() !== '';
            });
        };

        const generateShapesForRoute = async () => {
            const routeId = store.shapeGenConfig.route_id;
            const profile = store.shapeGenConfig.profile;
            const routeTrips = store.trips.filter(t => t.route_id === routeId);
            
            if (routeTrips.length === 0) { alert('No trips found for this route.'); return; }
            store.brouterLoading = true;
            
            const groups = {};
            routeTrips.forEach(trip => {
                const seqKey = trip.stop_times.map(st => st.stop_id).join('|');
                if (!groups[seqKey]) groups[seqKey] = { stop_ids: trip.stop_times.map(st => st.stop_id), trips: [] };
                groups[seqKey].trips.push(trip);
            });
            
            for (const seqKey of Object.keys(groups)) {
                const group = groups[seqKey];
                if (group.stop_ids.length < 2) continue;
                
                const coordsStr = group.stop_ids.map(stopId => {
                    const s = store.stops.find(st => st.stop_id === stopId);
                    return s ? `${s.stop_lon},${s.stop_lat}` : null;
                }).filter(c => c !== null).join('|');
                
                const shapeId = `SHP_${routeId}_${generateId().toUpperCase()}`;
                let finalCoords = [];
                
                if (profile === 'straight') {
                    finalCoords = group.stop_ids.map(stopId => {
                        const s = store.stops.find(st => st.stop_id === stopId);
                        return s ? [parseFloat(s.stop_lon), parseFloat(s.stop_lat)] : null;
                    }).filter(c => c !== null);
                } else {
                    try {
                        const url = `https://brouter.de/brouter?lonlats=${coordsStr}&profile=${profile}&alternativeidx=0&format=geojson`;
                        const res = await fetch(url);
                        if (!res.ok) throw new Error('BRouter failed');
                        const geojson = await res.json();
                        if (geojson.features && geojson.features.length > 0) {
                            finalCoords = geojson.features[0].geometry.coordinates;
                        }
                    } catch (e) {
                        console.error('Routing failed', e);
                        finalCoords = group.stop_ids.map(stopId => {
                            const s = store.stops.find(st => st.stop_id === stopId);
                            return s ? [parseFloat(s.stop_lon), parseFloat(s.stop_lat)] : null;
                        }).filter(c => c !== null);
                    }
                }
                
                if (finalCoords.length > 0) {
                    finalCoords.forEach((c, idx) => { store.shapes.push({ shape_id: shapeId, shape_pt_lat: c[1].toFixed(7), shape_pt_lon: c[0].toFixed(7), shape_pt_sequence: idx + 1 }); });
                    store.shapesSummary.push({ shape_id: shapeId, route_id: routeId, points_count: finalCoords.length, trips_count: group.trips.length });
                    
                    group.trips.forEach(trip => {
                        let sf = trip.dynamicFields.find(f => f.key === 'shape_id');
                        if (!sf) trip.dynamicFields.push({ key: 'shape_id', value: shapeId });
                        else sf.value = shapeId;
                    });
                }
            }
            store.brouterLoading = false;
            updateMapData(); 
        };

        const deleteShape = (shapeId) => {
            if(confirm(`Delete Shape ${shapeId}?`)) {
                store.shapes = store.shapes.filter(s => s.shape_id !== shapeId);
                store.shapesSummary = store.shapesSummary.filter(s => s.shape_id !== shapeId);
                store.trips.forEach(t => {
                    t.dynamicFields = t.dynamicFields.filter(f => !(f.key === 'shape_id' && f.value === shapeId));
                });
                updateMapData();
            }
        };

        // --- IMPORT LOGIC (ZIP) ---
        const extractDynamic = (row, knownKeys) => {
            const dyn = [];
            Object.keys(row).forEach(k => {
                if(!knownKeys.includes(k) && row[k]) dyn.push({key: k, value: row[k]});
            });
            return dyn;
        };

        const handleImportZip = async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            store.isImporting = true;
            store.importMessage = 'Parsing ZIP file...';
            try {
                const zip = await window.JSZip.loadAsync(file);
                const parsedData = {};
                const knownFiles = ['feed_info.txt', 'agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt', 'transfers.txt', 'shapes.txt'];
                
                for (const filename of Object.keys(zip.files)) {
                    if (filename.endsWith('.txt')) {
                        const content = await zip.files[filename].async('string');
                        parsedData[filename] = window.Papa.parse(content, { header: true, skipEmptyLines: true }).data;
                    }
                }

                if (parsedData['feed_info.txt'] && parsedData['feed_info.txt'].length > 0) {
                    const row = parsedData['feed_info.txt'][0];
                    ['feed_publisher_name','feed_publisher_url','feed_lang','default_lang','feed_start_date','feed_end_date','feed_version','feed_contact_email','feed_contact_url'].forEach(k => store.feedInfo[k] = row[k] || '');
                    const knownInfo = Object.keys(store.feedInfo);
                    store.feedInfo.customFields = extractDynamic(row, knownInfo);
                }

                if (parsedData['agency.txt']) {
                    const knownAgy = ['agency_id', 'agency_name', ...agencyAttributes.map(a => a.key)];
                    store.agencies = parsedData['agency.txt'].map(row => {
                        const agyObj = {
                            _internal_id: generateId(),
                            agency_id: row.agency_id || '', 
                            agency_name: row.agency_name || '',
                            customFields: extractDynamic(row, knownAgy)
                        };
                        agencyAttributes.forEach(attr => {
                            agyObj[attr.key] = row[attr.key] || '';
                        });
                        return agyObj;
                    });
                }

                if (parsedData['stops.txt']) {
                    const knownStp = ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'];
                    store.stops = parsedData['stops.txt'].map(row => ({ _internal_id: generateId(), stop_id: row.stop_id, stop_name: row.stop_name || row.stop_id, stop_lat: row.stop_lat, stop_lon: row.stop_lon, dynamicFields: extractDynamic(row, knownStp) }));
                }

                if (parsedData['routes.txt']) {
                    const knownRte = ['route_id', 'route_short_name', 'agency_id'];
                    store.lines = parsedData['routes.txt'].map(row => ({ _internal_id: generateId(), route_id: row.route_id, route_short_name: row.route_short_name || '', agency_id: row.agency_id || '', patterns: { '0': [], '1': [] }, dynamicFields: extractDynamic(row, knownRte) }));
                }

                if (parsedData['trips.txt'] && parsedData['stop_times.txt']) {
                    const stByTrip = {};
                    parsedData['stop_times.txt'].forEach(st => { if(!stByTrip[st.trip_id]) stByTrip[st.trip_id] = []; stByTrip[st.trip_id].push(st); });
                    
                    const knownTrp = ['trip_id', 'route_id', 'service_id', 'direction_id'];
                    store.trips = parsedData['trips.txt'].map(row => {
                        const st = (stByTrip[row.trip_id] || []).sort((a,b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
                        return { _internal_id: generateId(), trip_id: row.trip_id, route_id: row.route_id, service_id: row.service_id, direction_id: row.direction_id || '0', _expanded: false, stop_times: st, dynamicFields: extractDynamic(row, knownTrp) };
                    });

                    store.lines.forEach(route => {
                        ['0', '1'].forEach(dir => {
                            const dirTrips = store.trips.filter(t => t.route_id === route.route_id && t.direction_id === dir);
                            if(dirTrips.length > 0) {
                                dirTrips.sort((a,b) => b.stop_times.length - a.stop_times.length);
                                const tpl = dirTrips[0];
                                let currSecs = timeStringToSeconds(tpl.stop_times[0].departure_time);
                                route.patterns[dir] = tpl.stop_times.map((st, idx) => {
                                    let offset = 0;
                                    if(idx < tpl.stop_times.length - 1) {
                                        const nxtSecs = timeStringToSeconds(tpl.stop_times[idx+1].arrival_time);
                                        offset = nxtSecs - currSecs;
                                        currSecs = nxtSecs;
                                    }
                                    return { stop_id: st.stop_id, timeOffsetMins: Math.floor(offset / 60), timeOffsetSecs: offset % 60 };
                                });
                            }
                        });
                    });
                }

                if (parsedData['calendar.txt']) store.calendar = parsedData['calendar.txt'].map(row => ({ _internal_id: generateId(), ...row }));
                if (parsedData['calendar_dates.txt']) store.calendarDates = parsedData['calendar_dates.txt'];
                if (parsedData['transfers.txt']) store.transfers = parsedData['transfers.txt'];
                
                if (parsedData['shapes.txt']) {
                    store.shapes = parsedData['shapes.txt'];
                    const shpGroups = {};
                    store.shapes.forEach(s => { if(!shpGroups[s.shape_id]) shpGroups[s.shape_id] = 0; shpGroups[s.shape_id]++; });
                    store.shapesSummary = Object.keys(shpGroups).map(k => ({ shape_id: k, points_count: shpGroups[k], trips_count: store.trips.filter(t => t.dynamicFields.find(f => f.key === 'shape_id' && f.value === k)).length }));
                }

                const extra = Object.keys(parsedData).filter(f => !knownFiles.includes(f));
                store.extraFiles = extra.map(filename => {
                    const rows = parsedData[filename];
                    const headers = rows.length > 0 ? Object.keys(rows[0]) : ['col1'];
                    return { name: filename, headers: headers, rows: rows };
                });

                store.importMessage = 'Feed successfully imported!';
            } catch (err) { store.importMessage = `Import Error: ${err.message}`; } 
            finally { store.isImporting = false; }
        };

        // --- EXPORT LOGIC ---
        const isExporting = ref(false);
        const exportMessage = ref('');
        const exportError = ref(false);

        const flattenDynamicFields = (obj) => {
            const flat = {};
            if (obj.dynamicFields) obj.dynamicFields.forEach(f => { if (f.key && f.value !== '') flat[f.key] = f.value; });
            if (obj.customFields) obj.customFields.forEach(f => { if (f.key && f.value !== '') flat[f.key] = f.value; });
            return flat;
        };

        const exportGTFS = async () => {
            isExporting.value = true; exportMessage.value = 'Preparing data...'; exportError.value = false;
            try {
                const zip = new window.JSZip();

                if (store.feedInfo.feed_publisher_name) {
                    const fi = { ...store.feedInfo }; delete fi.customFields;
                    zip.file("feed_info.txt", window.Papa.unparse([{ ...fi, ...flattenDynamicFields(store.feedInfo) }]));
                }

                if (store.agencies.length > 0) zip.file("agency.txt", window.Papa.unparse(store.agencies.map(a => { const { _internal_id, dynamicFields, customFields, ...rest } = a; return { ...rest, ...flattenDynamicFields(a) }; })));
                if (store.stops.length > 0) zip.file("stops.txt", window.Papa.unparse(store.stops.map(s => { const { _internal_id, dynamicFields, ...rest } = s; return { ...rest, ...flattenDynamicFields(s) }; })));
                if (store.lines.length > 0) zip.file("routes.txt", window.Papa.unparse(store.lines.map(r => { const { _internal_id, dynamicFields, patterns, ...rest } = r; return { ...rest, ...flattenDynamicFields(r) }; })));
                
                if (store.trips.length > 0) {
                    const tripsData = []; const stopTimesData = [];
                    store.trips.forEach(t => {
                        const { _internal_id, _expanded, stop_times, dynamicFields, ...rest } = t;
                        tripsData.push({ ...rest, ...flattenDynamicFields(t) });
                        stop_times.forEach(st => stopTimesData.push({ trip_id: t.trip_id, arrival_time: st.arrival_time, departure_time: st.departure_time, stop_id: st.stop_id, stop_sequence: st.stop_sequence }));
                    });
                    zip.file("trips.txt", window.Papa.unparse(tripsData)); zip.file("stop_times.txt", window.Papa.unparse(stopTimesData));
                }
                
                if (store.calendar.length > 0) zip.file("calendar.txt", window.Papa.unparse(store.calendar.map(c => { const { _internal_id, ...rest } = c; return rest; })));
                if (store.calendarDates.length > 0) zip.file("calendar_dates.txt", window.Papa.unparse(store.calendarDates));
                if (store.transfers.length > 0) zip.file("transfers.txt", window.Papa.unparse(store.transfers));
                if (store.shapes.length > 0) zip.file("shapes.txt", window.Papa.unparse(store.shapes.map(s => ({ shape_id: s.shape_id, shape_pt_lat: s.shape_pt_lat, shape_pt_lon: s.shape_pt_lon, shape_pt_sequence: s.shape_pt_sequence }))));

                store.extraFiles.forEach(f => {
                    if(f.rows.length > 0) zip.file(f.name, window.Papa.unparse(f.rows, { columns: f.headers }));
                });

                const content = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(content);
                const a = document.createElement("a"); a.href = url; a.download = "gtfs.zip"; document.body.appendChild(a); a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
                exportMessage.value = 'gtfs.zip successfully generated and downloaded!';
            } catch (error) { exportError.value = true; exportMessage.value = `Export failed: ${error.message}`; } 
            finally { isExporting.value = false; }
        };

        // --- MAP LOGIC ---
        const initMap = (containerId) => {
            map = new maplibregl.Map({ container: containerId, style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', center: [15.6792, 48.5448], zoom: 12 });
            map.on('click', (e) => {
                const lat = e.lngLat.lat.toFixed(7); const lon = e.lngLat.lng.toFixed(7);
                if (store.currentView === 'Lines' && store.lineMode !== 'grid') {
                    const newStop = { _internal_id: generateId(), stop_id: 'S_' + generateId().toUpperCase(), stop_name: `Stop ${lat.substring(0,5)}`, stop_lat: lat, stop_lon: lon, dynamicFields: [] };
                    store.stops.push(newStop);
                    store.activeLine.patterns[store.activeDirection].push({ stop_id: newStop.stop_id, timeOffsetMins: 2, timeOffsetSecs: 0 });
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
                if (store.stopMode === 'grid') {
                    store.stops.forEach(s => {
                        const el = document.createElement('div'); el.className = 'stop-icon'; el.title = s.stop_name;
                        markers.push(new maplibregl.Marker({element: el}).setLngLat([parseFloat(s.stop_lon), parseFloat(s.stop_lat)]).addTo(map));
                    });
                } else if (store.activeStop && store.activeStop.stop_lat) {
                    const el = document.createElement('div'); el.className = 'stop-icon'; el.style.background = '#2563eb';
                    markers.push(new maplibregl.Marker({element: el}).setLngLat([parseFloat(store.activeStop.stop_lon), parseFloat(store.activeStop.stop_lat)]).addTo(map));
                }
            }
            if (markers.length > 1) {
                const b = new maplibregl.LngLatBounds(); markers.forEach(m => b.extend(m.getLngLat())); map.fitBounds(b, { padding: 50 });
            } else if (markers.length === 1 && store.currentView === 'Stops') {
                map.flyTo({ center: markers[0].getLngLat(), zoom: 15 });
            }
        };

        const drawShapesOnMap = () => {
            if (!map || store.currentView !== 'Shapes') return;
            
            const style = map.getStyle();
            if (style && style.layers) style.layers.forEach(l => { if (l.id.startsWith('shp-layer-')) map.removeLayer(l.id); });
            if (style && style.sources) Object.keys(style.sources).forEach(s => { if (s.startsWith('shp-src-')) map.removeSource(s); });

            const bounds = new maplibregl.LngLatBounds();
            let hasPoints = false;

            store.shapesSummary.forEach(shpSum => {
                const shapePoints = store.shapes.filter(s => s.shape_id === shpSum.shape_id).sort((a,b) => a.shape_pt_sequence - b.shape_pt_sequence);
                if (shapePoints.length < 2) return;

                const coordinates = shapePoints.map(sp => [parseFloat(sp.shape_pt_lon), parseFloat(sp.shape_pt_lat)]);
                coordinates.forEach(c => bounds.extend(c));
                hasPoints = true;

                const route = store.lines.find(r => r.route_id === shpSum.route_id);
                let color = '#2563eb';
                if (route) {
                    const colorField = route.dynamicFields.find(f => f.key === 'route_color');
                    if (colorField && colorField.value) color = colorField.value.startsWith('#') ? colorField.value : `#${colorField.value}`;
                }

                map.addSource(`shp-src-${shpSum.shape_id}`, { 'type': 'geojson', 'data': { 'type': 'Feature', 'properties': {}, 'geometry': { 'type': 'LineString', 'coordinates': coordinates } } });
                map.addLayer({ 'id': `shp-layer-${shpSum.shape_id}`, 'type': 'line', 'source': `shp-src-${shpSum.shape_id}`, 'layout': { 'line-join': 'round', 'line-cap': 'round' }, 'paint': { 'line-color': color, 'line-width': 4 } });
            });

            if (hasPoints) map.fitBounds(bounds, { padding: 50 });
        };

        const updateMapData = () => {
            if (!map) return;
            if (!map.isStyleLoaded()) {
                map.once('load', () => { drawMarkers(); drawShapesOnMap(); });
            } else {
                drawMarkers(); drawShapesOnMap();
            }
        };

        watch(() => [store.currentView, store.lineMode, store.stopMode, store.activeDirection, store.activeLine?.patterns, store.stops, store.activeStop?.stop_lat], async () => {
            await nextTick();
            const inLines = store.currentView === 'Lines' && store.lineMode !== 'grid';
            const inStops = store.currentView === 'Stops';
            const inShapes = store.currentView === 'Shapes';
            
            if (inLines || inStops || inShapes) {
                const containerId = inLines ? 'map-container-lines' : (inStops ? 'map-container-stops' : 'map-container-shapes');
                if (map && map.getContainer().id !== containerId) { map.remove(); map = null; }
                if (!map) initMap(containerId); else map.resize();
                updateMapData();
            } else {
                if (map) { map.remove(); map = null; }
            }
        }, { deep: true });

        return {
            store, menuItems, agencyAttributes, commonTimezones, routeAttributes, routeTypes, stopAttributes, tripAttributes,
            coordInput, coordStopName, selectedExistingStop, openAgency, deleteSelectedAgency, startCreateAgency, getAvailableAttributes, triggerAgencyField, saveNewAgency, addCustomField,
            startCreateLine, openLine, saveLine, getAvailableLineAttributes, triggerLineField, getStopName, addExistingStopToPattern, addStopFromCoords,
            startCreateStop, openStop, saveStop, getAvailableStopAttributes, triggerStopField,
            startCreateCalendar, openCalendar, saveCalendar, deleteCalendar, addException,
            openTripManager, getTripsForRouteAndDir, generateTrip, generateBatchTrips, 
            openTripEdit, saveTripEdit, deleteTrip, getAvailableTripAttributes, triggerTripField, moveStopTime, addStopToTrip,
            getTripsForRoute, getStopsForTrip, addTransfer, generateShapesForRoute, deleteShape, isRouteShapesComplete,
            handleImportZip, isExporting, exportMessage, exportError, exportGTFS
        };
    }
});
app.mount('#app');
