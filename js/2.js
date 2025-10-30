// =========================
// Variables Globales
// =========================
let map;
let markers = [];
let infoWindow;
let promedioMarker = null; // 🟢 marcador de promedio
let distanceCircle = null;
let farthestNearestLine = null;

const initialCenter = { lat: 30.378746, lng: -107.880062 };
let center = { ...initialCenter };
let currentSearch = "Tacos, comida, restaurantes";
let currentPlaces = [];
const restaurantListElement = document.getElementById("restaurants-list");
let getPhotoUrlFunction;

// =========================
// Inicializa Mapa
// =========================
async function initMap() {
    const { Place, getPhotoUrl } = await google.maps.importLibrary("places");
    getPhotoUrlFunction = getPhotoUrl;

    map = new google.maps.Map(document.getElementById("map"), {
        center: center,
        zoom: 14,
        mapId: "ITSNCG-MAP",
    });

    infoWindow = new google.maps.InfoWindow();

    await findPlaces(currentSearch);
    setupNavListeners();
    setupFilterListeners();
}

// =========================
// Limpiar Marcadores
// =========================
function clearMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];

    if (promedioMarker) { promedioMarker.setMap(null); promedioMarker = null; }
    if (distanceCircle) { distanceCircle.setMap(null); distanceCircle = null; }
    if (farthestNearestLine) { farthestNearestLine.setMap(null); farthestNearestLine = null; }

    if (infoWindow) infoWindow.close();
    if (restaurantListElement) restaurantListElement.innerHTML = "";
}

// =========================
// Agregar Marcador y Listado
// =========================
async function addMarkerAndDisplay(place, bounds) {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    const marker = new AdvancedMarkerElement({
        map,
        position: place.location,
        title: place.displayName
    });

    bounds.extend(place.location);
    markers.push(marker);

    marker.addListener("click", () => {
        infoWindow.close();
        const content = `
            <div class="info-window-content">
                <h6 class="fw-bold">${place.displayName}</h6>
                <p>${place.formattedAddress || "Dirección no disponible"}</p>
                <div class="rating text-warning">⭐ ${place.rating || "N/A"}</div>
            </div>
        `;
        infoWindow.setContent(content);
        infoWindow.open({ anchor: marker, map: map, shouldFocus: false });
        map.panTo(place.location);
    });

    displayRestaurant(place);
}

// =========================
// Mostrar restaurantes en lista lateral
// =========================
async function displayRestaurant(place) {
    if (!restaurantListElement) return;

    let photoUrl = "https://via.placeholder.com/500x200?text=No+Photo";
    if (place.photos && place.photos.length > 0) {
        try { photoUrl = place.photos[0].getURI({ maxWidth: 500, maxHeight: 200 }); } catch(e){ }
    }

    let statusText = place.businessStatus === "OPERATIONAL"
        ? '<span class="text-success fw-bold">Abierto</span>'
        : '<span class="text-danger fw-bold">Estado Desconocido</span>';

    const reviewCount = place.userRatingCount ? ` (${place.userRatingCount} Comentarios)` : '';

    const card = `
        <div class="restaurant-card p-3" onclick="map.panTo({lat: ${place.location.lat}, lng: ${place.location.lng}}); map.setZoom(17);">
            <img src="${photoUrl}" class="w-100 restaurant-img" alt="${place.displayName}" loading="lazy">
            <h6 class="mt-3 mb-1 fw-bold">${place.displayName}</h6>
            <p class="mb-1 text-muted">${place.formattedAddress || 'Dirección no disponible'}</p>
            <p class="mb-2 text-muted">${statusText}</p>
            <div class="rating text-warning">⭐ ${place.rating || 'N/A'}${reviewCount}</div>
        </div>
    `;
    restaurantListElement.innerHTML += card;
}

// =========================
// Buscar lugares
// =========================
async function findPlaces(searchText) {
    clearMarkers();
    currentSearch = searchText;

    const { Place } = await google.maps.importLibrary("places");

    const request = {
        textQuery: searchText,
        fields: ["displayName", "location", "businessStatus", "rating", "photos", "formattedAddress", "userRatingCount"],
        locationBias: center,
        isOpenNow: true,
        language: "es-MX",
        maxResultCount: 20,
        region: "mx",
        useStrictTypeFiltering: false
    };

    try {
        const { places } = await Place.searchByText(request);
        currentPlaces = places;

        if (places.length) processAndDisplayPlaces(places);
        else restaurantListElement.innerHTML = `<p class='text-center mt-4'>No se encontraron resultados para "${searchText}".</p>`;
    } catch (error) {
        console.error(error);
        restaurantListElement.innerHTML = `<p class='text-center mt-4 text-danger'>Error: ${error.message}</p>`;
    }
}

// =========================
// Procesar y mostrar resultados
// =========================
async function processAndDisplayPlaces(places) {
    const { LatLngBounds } = await google.maps.importLibrary("core");
    const bounds = new LatLngBounds();

    markers.forEach(m => m.setMap(null));
    markers = [];
    restaurantListElement.innerHTML = "";

    for (const place of places) await addMarkerAndDisplay(place, bounds);
    if (places.length > 0) {
        map.fitBounds(bounds);
        createPromedioMarker(places);  // 🔹 Marcador promedio
        locateFarthestAndNearest(places);
    }
}

// =========================
// 🔸 Marcador promedio con pin personalizado
// =========================
function createPromedioMarker(places) {
    let sumLat = 0;
    let sumLng = 0;
    let validPlaces = 0;

    for (const place of places) {
        const lat = place.location?.lat;
        const lng = place.location?.lng;
        if (typeof lat === "number" && typeof lng === "number") {
            sumLat += lat;
            sumLng += lng;
            validPlaces++;
        }
    }

    if (validPlaces > 0) {
        const avgLat = sumLat / validPlaces;
        const avgLng = sumLng / validPlaces;

        if (promedioMarker) promedioMarker.setMap(null);

        promedioMarker = new google.maps.Marker({
            position: { lat: avgLat, lng: avgLng },
            map: map,
            title: "Promedio de los lugares",
            icon: {
                url: "./icono/pin.webp", // tu imagen personalizada
                scaledSize: new google.maps.Size(45, 45),
            },
        });

        promedioMarker.addListener("click", () => {
            infoWindow.close();
            infoWindow.setContent(`
                <div class="fw-bold">📍 Promedio de los lugares encontrados</div>
                <div>Latitud: ${avgLat.toFixed(6)}</div>
                <div>Longitud: ${avgLng.toFixed(6)}</div>
            `);
            infoWindow.open({ anchor: promedioMarker, map });
        });
    }
}

// =========================
// Categorías Navbar
// =========================
function setupNavListeners() {
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const category = link.textContent.trim();
            let searchKeywords = "Punto de interés";
            if (category === "Restaurant") searchKeywords = "Restaurantes, Comida";
            if (category === "Coffee Shop") searchKeywords = "Cafeterías, Café";
            if (category === "Gas Station") searchKeywords = "Gasolineras, Estaciones de Servicio";
            if (category === "Hotels") searchKeywords = "Hoteles, Hospedaje, Alojamiento";
            if (category === "Groceries") searchKeywords = "Tiendas de abarrotes, Supermercados";

            const locationInput = document.getElementById("location-input");
            const currentCity = locationInput.value || "Nuevo Casas Grandes";
            findPlaces(`${searchKeywords} en ${currentCity}`);
        });
    });
}

// =========================
// Filtros
// =========================
function setupFilterListeners() {
    const ratedBtn = document.querySelector('.filter-btn:nth-child(1)');
    const nearestBtn = document.querySelector('.filter-btn:nth-child(2)');

    ratedBtn.addEventListener('click', () => {
        const sorted = [...currentPlaces].sort((a,b) => (b.rating||0)-(a.rating||0));
        processAndDisplayPlaces(sorted);
    });

    nearestBtn.textContent = "Más Comentarios";
    nearestBtn.addEventListener('click', () => {
        const sorted = [...currentPlaces].sort((a,b) => (b.userRatingCount||0)-(a.userRatingCount||0));
        processAndDisplayPlaces(sorted);
    });

    const filterRadiusBtn = document.createElement('button');
    filterRadiusBtn.className = 'btn btn-outline-info filter-btn me-2';
    filterRadiusBtn.innerHTML = '<i class="fa fa-circle"></i> Filtrar Radio (1km)';
    filterRadiusBtn.addEventListener('click', () => filterPlacesByRadius(1000));
    ratedBtn.parentNode.appendChild(filterRadiusBtn);
}

// =========================
// Distancia
// =========================
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = lat1*Math.PI/180;
    const phi2 = lat2*Math.PI/180;
    const dPhi = (lat2-lat1)*Math.PI/180;
    const dLambda = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dPhi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dLambda/2)**2;
    return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function filterPlacesByRadius(radiusInMeters) {
    if (!currentPlaces.length || !promedioMarker) return;
    const avgLat = promedioMarker.getPosition().lat();
    const avgLng = promedioMarker.getPosition().lng();

    const filtered = currentPlaces.filter(p => getDistance(avgLat, avgLng, p.location.lat, p.location.lng) <= radiusInMeters);

    if (distanceCircle) distanceCircle.setMap(null);
    distanceCircle = new google.maps.Circle({
        map, center: {lat: avgLat, lng: avgLng},
        radius: radiusInMeters,
        strokeColor:"#0000FF", fillColor:"#0000FF", fillOpacity:0.15, strokeWeight:2
    });

    processAndDisplayPlaces(filtered);
}

// =========================
// Más cercano y más lejano
// =========================
async function locateFarthestAndNearest(places) {
    if (places.length < 2 || !promedioMarker) return;

    const centerLat = promedioMarker.getPosition().lat();
    const centerLng = promedioMarker.getPosition().lng();
    let nearest = null, farthest = null, minD=Infinity, maxD=0;

    places.forEach(p=>{
        const d=getDistance(centerLat,centerLng,p.location.lat,p.location.lng);
        if(d<minD){ minD=d; nearest=p; }
        if(d>maxD){ maxD=d; farthest=p; }
    });

    if(!nearest||!farthest) return;
    if(farthestNearestLine) farthestNearestLine.setMap(null);

    const farLine = new google.maps.Polyline({ path:[{lat:centerLat,lng:centerLng}, farthest.location], strokeColor:'#FF0000', strokeOpacity:1, strokeWeight:2, map });
    const nearLine = new google.maps.Polyline({ path:[{lat:centerLat,lng:centerLng}, nearest.location], strokeColor:'#00FF00', strokeOpacity:1, strokeWeight:2, map });
    farthestNearestLine = { setMap: (m)=>{ farLine.setMap(m); nearLine.setMap(m); } };
}

// =========================
// Búsqueda ciudad
// =========================
async function searchCityAndPlaces(cityName) {
    const { Geocoder } = await google.maps.importLibrary("geocoding");
    const geocoder = new Geocoder();

    geocoder.geocode({ address: cityName }, (results, status) => {
        if(status==="OK" && results[0]){
            const newLoc = results[0].geometry.location;
            center.lat=newLoc.lat(); center.lng=newLoc.lng();
            map.setCenter(newLoc);
            findPlaces(`Restaurantes en ${cityName}`);
        } else alert(`No se pudo encontrar "${cityName}"`);
    });
}

// =========================
// Eventos DOM
// =========================
document.addEventListener("DOMContentLoaded", () => {
    const searchButton = document.getElementById("search-btn");
    const locationInput = document.getElementById("location-input");

    if(searchButton && locationInput){
        searchButton.addEventListener("click", ()=>{ const txt=locationInput.value.trim(); if(txt) searchCityAndPlaces(txt); });
        locationInput.addEventListener("keydown", (e)=>{ if(e.key==="Enter") searchButton.click(); });
    }
});
