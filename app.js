// Načtení Vue přímo z CDN
import { createApp, reactive, onMounted, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

// 1. Globální stav (nahrazuje Pinia z předchozího příkladu)
const store = reactive({
    stops: [],
    addStop(lat, lon) {
        const newId = `stop_${this.stops.length + 1}`;
        this.stops.push({
            id: newId,
            name: `Zastávka ${this.stops.length + 1}`,
            lat: lat,
            lon: lon
        });
    }
});

// 2. Hlavní Vue aplikace
const app = createApp({
    setup() {
        let map = null;
        let markers = [];

        onMounted(() => {
            // Inicializace mapy (open-source podklad)
            map = new maplibregl.Map({
                container: 'map',
                style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
                center: [14.42, 50.08], // Praha
                zoom: 11
            });

            // Kliknutí do mapy zavolá naši funkci ve store
            map.on('click', (e) => {
                store.addStop(e.lngLat.lat, e.lngLat.lng);
            });
        });

        // 3. Sledování změn: Když se změní zastávky, překresli markery v mapě
        watch(() => store.stops, (newStops) => {
            // Smažeme staré markery
            markers.forEach(m => m.remove());
            markers = [];

            // Vytvoříme nové podle aktuálních dat
            newStops.forEach(stop => {
                const el = document.createElement('div');
                el.style.backgroundColor = '#e74c3c';
                el.style.width = '12px';
                el.style.height = '12px';
                el.style.borderRadius = '50%';
                el.style.border = '2px solid white';
                el.style.cursor = 'pointer';

                const marker = new maplibregl.Marker({ element: el })
                    .setLngLat([stop.lon, stop.lat])
                    .addTo(map);
                
                markers.push(marker);
            });
        }, { deep: true });

        // Vystavíme store do HTML šablony
        return { store };
    }
});

// Spuštění aplikace
app.mount('#app');
