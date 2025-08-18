class CountryGuesser {
    constructor() {
        this.score = 0;
        this.timer = 0;
        this.timerInterval = null;
        this.gameActive = true;
        this.map = null;
        this.countryLayers = {};
        this.foundCountries = new Set();
        this.totalCountries = 0;
        this.wrongGuesses = {};
        this.currentTargetCountry = null;
        this.currentMode = 'world';
        this.geoData = null;
        this.skipDebounceTimer = null;

        this.initializeElements();
        this.initializeMap();
    }

    initializeElements() {
        this.playAgainButton = document.getElementById('play-again');
        this.timerDisplay = document.getElementById('timer');
        this.scoreDisplay = document.getElementById('score');
        this.countryNameDisplay = document.getElementById('country-name');
        this.feedbackDisplay = document.getElementById('feedback');
        this.progressDisplay = document.getElementById('progress');
        this.skipButton = document.getElementById('skip-country');
        this.modeSelector = document.getElementById('game-mode');

        this.skipButton.addEventListener('click', () => this.skipCurrentCountry());
        this.modeSelector.addEventListener('change', () => this.handleModeChange());
        this.playAgainButton.addEventListener('click', () => this.startGame());
    }

    getRegionId(feature) {
        return this.currentMode === 'world' 
            ? feature.properties.ISO_A3 
            : feature.properties.id;
    }

    getRegionName(feature) {
        return feature.properties.NAME;
    }

    async loadGameData() {
        try {
            if (this.currentMode === 'world') {
                this.geoData = await window.geoData.loadWorldData();

                // keep only countries, the world data includes extra non recognized territories
                const recognizedCountries = [
                  "Costa Rica", "Nicaragua", "Haiti", "Dominican Rep.", "El Salvador", "Guatemala", 
                  "Cuba", "Honduras", "United States of America", "Canada", "Mexico", "Belize", 
                  "Panama", "Greenland", "Trinidad and Tobago", "Grenada", "St. Vin. and Gren.", 
                  "Barbados", "Saint Lucia", "Dominica", "Antigua and Barb.", "St. Kitts and Nevis", 
                  "Jamaica", "Bermuda", "Indonesia", "Malaysia", "Cyprus", "India", "China", 
                  "Israel", "Palestine", "Lebanon", "Syria", "South Korea", "North Korea", "Bhutan", 
                  "Oman", "Uzbekistan", "Kazakhstan", "Tajikistan", "Mongolia", "Vietnam", 
                  "Cambodia", "United Arab Emirates", "Georgia", "Azerbaijan", "Turkey", "Laos", 
                  "Kyrgyzstan", "Armenia", "Iraq", "Iran", "Qatar", "Saudi Arabia", "Pakistan", 
                  "Thailand", "Kuwait", "Timor-Leste", "Brunei", "Myanmar", "Bangladesh", 
                  "Afghanistan", "Turkmenistan", "Jordan", "Nepal", "Yemen", "Philippines", 
                  "Sri Lanka", "Taiwan", "Japan", "Singapore", "Bahrain", "Chile", "Bolivia", 
                  "Peru", "Argentina", "Suriname", "Guyana", "Brazil", "Uruguay", "Ecuador", 
                  "Colombia", "Paraguay", "Venezuela", "Ethiopia", "S. Sudan", "Somalia", 
                  "Kenya", "Malawi", "Tanzania", "Morocco", "Congo", "Dem. Rep. Congo", "Namibia", 
                  "South Africa", "Libya", "Tunisia", "Zambia", "Sierra Leone", "Guinea", 
                  "Liberia", "Central African Rep.", "Sudan", "Djibouti", "Eritrea", 
                  "Côte d'Ivoire", "Mali", "Senegal", "Nigeria", "Benin", "Angola", "Botswana", 
                  "Zimbabwe", "Chad", "Algeria", "Mozambique", "eSwatini", "Burundi", "Rwanda", 
                  "Uganda", "Lesotho", "Cameroon", "Gabon", "Niger", "Burkina Faso", "Togo", 
                  "Ghana", "Guinea-Bissau", "Egypt", "Mauritania", "Eq. Guinea", "Gambia", 
                  "Madagascar", "Comoros", "São Tomé and Principe", "Cabo Verde", "France", 
                  "Ukraine", "Belarus", "Lithuania", "Russia", "Czechia", "Germany", "Estonia", 
                  "Latvia", "Norway", "Sweden", "Finland", "Luxembourg", "Belgium", "North Macedonia", 
                  "Albania", "Kosovo", "Spain", "Denmark", "Romania", "Hungary", "Slovakia", 
                  "Poland", "Ireland", "United Kingdom", "Greece", "Austria", "Italy", 
                  "Switzerland", "Netherlands", "Liechtenstein", "Serbia", "Croatia", "Slovenia", 
                  "Bulgaria", "San Marino", "Monaco", "Andorra", "Montenegro", "Bosnia and Herz.", 
                  "Portugal", "Moldova", "Vatican", "Iceland", "Malta", "Papua New Guinea", 
                  "Australia", "Fiji", "New Zealand", "Kiribati", "Marshall Is.", "Cook Is.", 
                  "Tonga", "Samoa", "Solomon Is.", "Tuvalu", "Nauru", "Micronesia", "Vanuatu", 
                  "Palau"
                ];

                this.geoData.features = this.geoData.features.filter(feature => recognizedCountries.includes(feature.properties.NAME))
                
                this.map.setView([20, 0], 2);
                this.map.setMaxBounds([[-90, -180], [90, 180]]);
            } else {
                this.geoData = await window.geoData.loadUSData();
                this.map.setView([39.8283, -98.5795], 4);
                this.map.setMaxBounds([[24.396308, -125.000000], [49.384358, -66.934570]]);
            }
            this.initializeRegions();
            this.startGame();
        } catch (error) {
            window.geoData.showDataError(error);
        }
    }

    initializeRegions() {
        const features = this.geoData.features;
        this.totalCountries = features.length;

        features.forEach(feature => {
            const layer = L.geoJSON(feature, {
                style: {
                    fillColor: '#6c757d',
                    weight: 1,
                    opacity: 1,
                    color: '#343a40',
                    fillOpacity: 0.7
                }
            }).addTo(this.map);

            const regionId = this.getRegionId(feature);
            layer.on('click', () => {
                if (this.gameActive && !this.foundCountries.has(regionId)) {
                    this.handleCountryClick(regionId, layer, this.getRegionName(feature));
                }
            });

            this.countryLayers[regionId] = layer;
        });
        this.updateProgress();
    }

    startGame() {
        this.score = 0;
        this.timer = 0;
        this.lastFindTime = 0;
        this.foundCountries.clear();
        this.wrongGuesses = {};
        this.gameActive = true;
        this.resetMap();
        this.startTimer();
        this.updateDisplay();
        this.selectRandomCountry();
        this.playAgainButton.classList.add('d-none');
    }

    resetMap() {
        Object.entries(this.countryLayers).forEach(([id, layer]) => {
            if (this.foundCountries.has(id)) {
                layer.setStyle({
                    fillColor: '#198754',
                    fillOpacity: 0.7,
                    weight: 1,
                    opacity: 1,
                    color: '#198754'
                });
            } else {
                layer.setStyle({
                    fillColor: '#6c757d',
                    weight: 1,
                    opacity: 1,
                    color: '#343a40',
                    fillOpacity: 0.7
                });
            }
        });
    }

    selectRandomCountry() {
        const availableCountries = this.geoData.features.filter(
            country => !this.foundCountries.has(this.getRegionId(country))
        );

        if (availableCountries.length === 0) {
            this.endGame();
            return;
        }

        const randomCountry = availableCountries[Math.floor(Math.random() * availableCountries.length)];
        this.currentTargetCountry = randomCountry;
        this.countryNameDisplay.textContent = this.getRegionName(randomCountry);
        this.wrongGuesses[this.getRegionId(randomCountry)] = 0;
    }

    startTimer() {
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.timer++;
            const minutes = Math.floor(this.timer / 60);
            const seconds = this.timer % 60;
            this.timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    handleCountryClick(regionId, layer, regionName) {
        const targetRegionName = this.countryNameDisplay.textContent;
        const correct = regionName === targetRegionName;

        if (correct) {
            const pointsEarned = this.calculatePoints(regionId);
            this.score += pointsEarned;
            this.foundCountries.add(regionId);
            this.showFeedback(`Found ${regionName}! +${pointsEarned} points`, 'success');

            layer.setStyle({
                fillColor: '#198754',
                fillOpacity: 0.7,
                weight: 1,
                opacity: 1,
                color: '#198754'
            });

            this.updateProgress();
            this.selectRandomCountry();
        } else {
            if (!this.foundCountries.has(regionId)) {
                layer.setStyle({
                    fillColor: '#dc3545',
                    fillOpacity: 0.7,
                    weight: 1,
                    opacity: 1,
                    color: '#dc3545'
                });

                setTimeout(() => {
                    if (!this.foundCountries.has(regionId)) {
                        layer.setStyle({
                            fillColor: '#6c757d',
                            fillOpacity: 0.7,
                            weight: 1,
                            opacity: 1,
                            color: '#343a40'
                        });
                    }
                }, 2000);
            }

            this.wrongGuesses[this.getRegionId(this.currentTargetCountry)]++;
            this.showFeedback(`That's ${regionName}, not ${targetRegionName}. Try again!`, 'danger');
        }

        this.updateDisplay();
    }

    calculatePoints(regionId) {
        let points = 100;
        const fails = this.wrongGuesses[regionId] || 0;
        points -= fails * 10;
        const timeSinceLastFind = this.timer - (this.lastFindTime || 0);
        points -= Math.min(timeSinceLastFind * 2, 50);
        this.lastFindTime = this.timer;
        return Math.max(points, 10);
    }

    showFeedback(message, type) {
        if (this.feedbackTimeout) {
            clearTimeout(this.feedbackTimeout);
        }

        this.feedbackDisplay.textContent = message;
        this.feedbackDisplay.className = `alert alert-${type}`;
        this.feedbackDisplay.classList.remove('d-none');
        this.feedbackDisplay.style.opacity = '1';

        this.feedbackDisplay.style.animation = 'none';
        this.feedbackDisplay.offsetHeight;
        this.feedbackDisplay.style.animation = 'feedbackPulse 0.3s ease';

        this.feedbackTimeout = setTimeout(() => {
            this.feedbackDisplay.style.opacity = '0';
            setTimeout(() => {
                this.feedbackDisplay.classList.add('d-none');
            }, 300);
        }, 3000);
    }

    updateDisplay() {
        this.scoreDisplay.textContent = this.score;
    }

    updateProgress() {
        const foundCount = this.foundCountries.size;
        this.progressDisplay.textContent = `${foundCount}/${this.totalCountries}`;
    }

    skipCurrentCountry() {
        if (!this.gameActive || this.skipDebounceTimer) {
            return;
        }

        this.skipButton.disabled = true;
        this.skipDebounceTimer = setTimeout(() => {
            this.skipDebounceTimer = null;
            this.skipButton.disabled = false;
        }, 1000);

        if (!this.currentTargetCountry?.properties) {
            this.selectRandomCountry();
            return;
        }

        const regionId = this.getRegionId(this.currentTargetCountry);
        const regionName = this.getRegionName(this.currentTargetCountry);

        if (!regionId || !this.countryLayers[regionId]) {
            console.error('Invalid region data for skipping');
            this.selectRandomCountry();
            return;
        }

        try {
            this.foundCountries.add(regionId);
            const layer = this.countryLayers[regionId];
            layer.setStyle({
                fillColor: '#ffc107',
                fillOpacity: 0.7,
                weight: 1,
                opacity: 1,
                color: '#ffc107'
            });

            this.showFeedback(`Skipped ${regionName}`, 'warning');
            this.updateProgress();
            this.selectRandomCountry();
        } catch (error) {
            console.error('Error in skipCurrentCountry:', error);
            this.skipButton.disabled = false;
            this.showFeedback('Error skipping region. Please try again.', 'danger');mainc
        }
    }

    resetGame() {
        this.score = 0;
        this.timer = 0;
        clearInterval(this.timerInterval);
        this.gameActive = true;
        this.foundCountries.clear();
        this.wrongGuesses = {};
        this.currentTargetCountry = null;

        Object.values(this.countryLayers).forEach(layer => {
            this.map.removeLayer(layer);
        });
        this.countryLayers = {};

        if (this.skipDebounceTimer) {
            clearTimeout(this.skipDebounceTimer);
        }
    }

    async handleModeChange() {
        const newMode = this.modeSelector.value;
        if (newMode !== this.currentMode) {
            this.currentMode = newMode;
            this.resetGame();
            await this.loadGameData();
        }
    }

    endGame() {
        this.gameActive = false;
        clearInterval(this.timerInterval);
        const minutes = Math.floor(this.timer / 60);
        const seconds = this.timer % 60;
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        this.showFeedback(
            `Congratulations! You found all ${this.totalCountries} regions in ${timeString} with ${this.score} points!`,
            'success'
        );
        this.playAgainButton.classList.remove('d-none');
    }
    initializeMap() {
        try {
            this.map = L.map('world-map', {
                center: [20, 0],
                zoom: 2,
                minZoom: 2,
                maxZoom: 6,
                maxBounds: [[-90, -180], [90, 180]]
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                subdomains: 'abcd',
                maxZoom: 18
            }).addTo(this.map);

            this.loadGameData();
        } catch (error) {
            console.error('Error initializing map:', error);
            this.showFeedback('Error loading map. Please refresh the page.', 'danger');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CountryGuesser();
});