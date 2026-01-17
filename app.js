// Flight Finder App
const RADIUS_MILES = 100;
const MILES_TO_KM = 1.60934;
const RADIUS_KM = RADIUS_MILES * MILES_TO_KM;

// DOM Elements
const findFlightsBtn = document.getElementById('findFlights');
const searchManualBtn = document.getElementById('searchManual');
const manualLatInput = document.getElementById('manualLat');
const manualLonInput = document.getElementById('manualLon');
const statusDiv = document.getElementById('status');
const locationInfoDiv = document.getElementById('locationInfo');
const flightStatsDiv = document.getElementById('flightStats');
const flightListDiv = document.getElementById('flightList');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const userLatSpan = document.getElementById('userLat');
const userLonSpan = document.getElementById('userLon');
const flightCountSpan = document.getElementById('flightCount');
const lastUpdateSpan = document.getElementById('lastUpdate');

// State
let userLocation = null;

// Event Listeners
findFlightsBtn.addEventListener('click', findNearbyFlights);
searchManualBtn.addEventListener('click', searchManualLocation);

// Main function to find nearby flights
async function findNearbyFlights() {
    try {
        // Reset UI
        hideError();
        flightListDiv.innerHTML = '';

        // Get user location
        updateStatus('Getting your location...');
        showLoading();

        userLocation = await getUserLocation();

        // Search with the location
        await searchFlightsAtLocation(userLocation);

    } catch (error) {
        hideLoading();
        showError(error.message);
        updateStatus('');
    }
}

// Function to search flights using manual coordinates
async function searchManualLocation() {
    try {
        // Reset UI
        hideError();
        flightListDiv.innerHTML = '';

        // Validate inputs
        const lat = parseFloat(manualLatInput.value);
        const lon = parseFloat(manualLonInput.value);

        if (isNaN(lat) || isNaN(lon)) {
            showError('Please enter valid latitude and longitude values.');
            return;
        }

        if (lat < -90 || lat > 90) {
            showError('Latitude must be between -90 and 90.');
            return;
        }

        if (lon < -180 || lon > 180) {
            showError('Longitude must be between -180 and 180.');
            return;
        }

        showLoading();
        updateStatus('Searching flights at specified location...');

        userLocation = {
            latitude: lat,
            longitude: lon
        };

        // Search with the manual location
        await searchFlightsAtLocation(userLocation);

    } catch (error) {
        hideLoading();
        showError(error.message);
        updateStatus('');
    }
}

// Common function to search flights at a given location
async function searchFlightsAtLocation(location) {
    // Display user location
    userLatSpan.textContent = location.latitude.toFixed(4);
    userLonSpan.textContent = location.longitude.toFixed(4);
    locationInfoDiv.classList.remove('hidden');

    // Fetch flights
    updateStatus('Fetching flight data...');
    const flights = await fetchFlights(location);

    // Filter flights by distance
    updateStatus('Calculating distances...');
    const nearbyFlights = filterNearbyFlights(flights, location);

    // Display results
    hideLoading();
    displayFlights(nearbyFlights);

    // Fetch route information for nearby flights (async, non-blocking)
    enrichFlightsWithRouteData(nearbyFlights);

    // Update stats
    flightCountSpan.textContent = nearbyFlights.length;
    lastUpdateSpan.textContent = new Date().toLocaleTimeString();
    flightStatsDiv.classList.remove('hidden');

    updateStatus(`Found ${nearbyFlights.length} flights within ${RADIUS_MILES} miles`);
}

// Get user's geolocation
function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
            },
            (error) => {
                let errorMessage = 'Unable to get your location. ';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage += 'Please allow location access.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage += 'Location information is unavailable.';
                        break;
                    case error.TIMEOUT:
                        errorMessage += 'Location request timed out.';
                        break;
                    default:
                        errorMessage += 'An unknown error occurred.';
                }
                reject(new Error(errorMessage));
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

// Fetch flights from OpenSky Network API
async function fetchFlights(location) {
    // Calculate bounding box (rough approximation)
    // 1 degree latitude ≈ 69 miles
    // 1 degree longitude varies by latitude, but we'll use a rough approximation
    const latDegrees = RADIUS_MILES / 69;
    const lonDegrees = RADIUS_MILES / (69 * Math.cos(location.latitude * Math.PI / 180));

    const minLat = location.latitude - latDegrees;
    const maxLat = location.latitude + latDegrees;
    const minLon = location.longitude - lonDegrees;
    const maxLon = location.longitude + lonDegrees;

    const url = `https://opensky-network.org/api/states/all?lamin=${minLat}&lomin=${minLon}&lamax=${maxLat}&lomax=${maxLon}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch flight data: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.states || data.states.length === 0) {
            return [];
        }

        // Parse flight data
        return data.states.map(state => ({
            icao24: state[0],
            callsign: state[1] ? state[1].trim() : 'Unknown',
            origin_country: state[2],
            longitude: state[5],
            latitude: state[6],
            altitude: state[7], // meters
            velocity: state[9], // m/s
            heading: state[10], // degrees
            vertical_rate: state[11], // m/s
            on_ground: state[8],
            origin: null, // Will be populated if available
            destination: null // Will be populated if available
        })).filter(flight =>
            flight.latitude !== null &&
            flight.longitude !== null &&
            !flight.on_ground
        );

    } catch (error) {
        throw new Error(`Error fetching flights: ${error.message}`);
    }
}

// Enrich flights with route data (origin/destination airports)
async function enrichFlightsWithRouteData(flights) {
    // Fetch route data for each flight asynchronously
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400; // 24 hours ago

    for (const flight of flights) {
        try {
            // Try to get flight information from OpenSky
            const url = `https://opensky-network.org/api/flights/aircraft?icao24=${flight.icao24}&begin=${oneDayAgo}&end=${now}`;
            const response = await fetch(url);

            if (response.ok) {
                const flightData = await response.json();

                // Find the most recent flight that matches or is close to current time
                if (flightData && flightData.length > 0) {
                    const recentFlight = flightData[flightData.length - 1];
                    flight.origin = recentFlight.estDepartureAirport || 'N/A';
                    flight.destination = recentFlight.estArrivalAirport || 'N/A';

                    // Update the flight card in the DOM
                    updateFlightCard(flight);
                }
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.log(`Could not fetch route for ${flight.callsign}:`, error);
            // Keep origin/destination as null
        }
    }
}

// Update a flight card's route information
function updateFlightCard(flight) {
    const cards = document.querySelectorAll('.flight-card');
    cards.forEach(card => {
        const callsignElem = card.querySelector('.callsign');
        if (callsignElem && callsignElem.textContent === flight.callsign) {
            const routeElem = card.querySelector('.route-info');
            if (routeElem && flight.origin && flight.destination) {
                routeElem.textContent = `${flight.origin} → ${flight.destination}`;
                routeElem.classList.remove('loading');
            }
        }
    });
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    const distanceMiles = distanceKm / MILES_TO_KM;

    return {
        km: distanceKm,
        miles: distanceMiles
    };
}

function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

// Filter flights within radius
function filterNearbyFlights(flights, location) {
    return flights
        .map(flight => {
            const distance = calculateDistance(
                location.latitude,
                location.longitude,
                flight.latitude,
                flight.longitude
            );
            return {
                ...flight,
                distance: distance
            };
        })
        .filter(flight => flight.distance.miles <= RADIUS_MILES)
        .sort((a, b) => a.distance.miles - b.distance.miles);
}

// Display flights in the UI
function displayFlights(flights) {
    flightListDiv.innerHTML = '';

    if (flights.length === 0) {
        flightListDiv.innerHTML = `
            <div class="no-flights">
                <h3>No flights found</h3>
                <p>There are no flights within ${RADIUS_MILES} miles of your location at this time.</p>
                <p>Try again in a few moments as flight data updates regularly.</p>
            </div>
        `;
        return;
    }

    flights.forEach(flight => {
        const card = createFlightCard(flight);
        flightListDiv.appendChild(card);
    });
}

// Create a flight card element
function createFlightCard(flight) {
    const card = document.createElement('div');
    card.className = 'flight-card';

    const altitudeFeet = flight.altitude ? Math.round(flight.altitude * 3.28084) : 'N/A';
    const speedMph = flight.velocity ? Math.round(flight.velocity * 2.23694) : 'N/A';
    const heading = flight.heading !== null ? Math.round(flight.heading) : 'N/A';
    const verticalRate = flight.vertical_rate ? Math.round(flight.vertical_rate * 196.85) : 0;
    const verticalRateText = verticalRate > 0 ? `Climbing (${verticalRate} ft/min)` :
                            verticalRate < 0 ? `Descending (${Math.abs(verticalRate)} ft/min)` :
                            'Level';

    const routeText = (flight.origin && flight.destination)
        ? `${flight.origin} → ${flight.destination}`
        : 'Loading route...';

    card.innerHTML = `
        <div class="callsign">${flight.callsign}</div>
        <div class="route-info ${!flight.origin ? 'loading' : ''}">${routeText}</div>
        <div class="flight-info">
            <span class="label">Origin Country:</span>
            <span class="value">${flight.origin_country}</span>
        </div>
        <div class="flight-info">
            <span class="label">Altitude:</span>
            <span class="value">${altitudeFeet} ft</span>
        </div>
        <div class="flight-info">
            <span class="label">Speed:</span>
            <span class="value">${speedMph} mph</span>
        </div>
        <div class="flight-info">
            <span class="label">Heading:</span>
            <span class="value">${heading}°</span>
        </div>
        <div class="flight-info">
            <span class="label">Vertical Rate:</span>
            <span class="value">${verticalRateText}</span>
        </div>
        <div class="distance">${flight.distance.miles.toFixed(1)} miles away</div>
    `;

    return card;
}

// UI Helper functions
function updateStatus(message) {
    statusDiv.textContent = message;
}

function showLoading() {
    loadingDiv.classList.remove('hidden');
    findFlightsBtn.disabled = true;
    searchManualBtn.disabled = true;
}

function hideLoading() {
    loadingDiv.classList.add('hidden');
    findFlightsBtn.disabled = false;
    searchManualBtn.disabled = false;
}

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideError() {
    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';
}
