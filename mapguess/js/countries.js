const countriesData = {
    "type": "FeatureCollection",
    "features": []
};

const usStatesData = {
    "type": "FeatureCollection",
    "features": []
};

// Load country data from local JSON file
function loadWorldData() {
    return fetch('/static/countries.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load country data');
            }
            return response.json();
        })
        .then(data => {
            if (!data || !data.features) {
                throw new Error('Invalid country data format');
            }
            countriesData.features = data.features.map(feature => ({
                type: "Feature",
                properties: {
                    NAME: feature.properties.name || feature.properties.NAME,
                    ISO_A3: feature.properties.iso_a3 || feature.properties.ISO_A3
                },
                geometry: feature.geometry
            }));
            return countriesData;
        });
}

// Load US states data from local JSON file
function loadUSData() {
    return fetch('/static/us-states.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load US states data');
            }
            return response.json();
        })
        .then(data => {
            if (!data || !data.features) {
                throw new Error('Invalid US states data format');
            }
            usStatesData.features = data.features.map(feature => ({
                type: "Feature",
                properties: {
                    NAME: feature.properties.name,
                    id: feature.id // Use the state ID directly
                },
                geometry: feature.geometry
            }));
            return usStatesData;
        });
}

// Handle errors in the UI
function showDataError(error) {
    console.error('Error loading data:', error);
    const feedback = document.getElementById('feedback');
    if (feedback) {
        feedback.textContent = 'Error loading geographic data. Please refresh the page.';
        feedback.className = 'alert alert-danger';
        feedback.classList.remove('d-none');
    }
}

// Export the data loading functions
window.geoData = {
    loadWorldData,
    loadUSData,
    showDataError
};