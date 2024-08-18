const fs = require('fs');
const path = require('path');

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of the Earth in meters
    const toRad = angle => angle * (Math.PI / 180);

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

function removeNearbyPoints(data, maxDistance) {
    const result = [];
    const toRemove = new Set();

    for (let i = 0; i < data.length; i++) {
        if (toRemove.has(i)) continue;

        const { lat: lat1, lng: lng1 } = data[i];
        let isNearby = false;

        for (let j = i + 1; j < data.length; j++) {
            if (toRemove.has(j)) continue;

            const { lat: lat2, lng: lng2 } = data[j];
            if (haversineDistance(lat1, lng1, lat2, lng2) < maxDistance) {
                toRemove.add(j);
                console.log(`Removed point ${j} (${lat2}, ${lng2}) near point ${i} (${lat1}, ${lng1})`);
                isNearby = true;
            }
        }

        if (!isNearby) {
            result.push(data[i]);
        }
    }

    return result;
}

// Read JSON file
fs.readFile(path.join(__dirname, 'map.json'), 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading file:', err);
        return;
    }

    try {
        const jsonData = JSON.parse(data);
        const maxDistance = 100; // Maximum distance in meters
        const filteredData = removeNearbyPoints(jsonData, maxDistance);

        // Write filtered data to a new file
        fs.writeFile(path.join(__dirname, 'filtered_map.json'), JSON.stringify(filteredData, null, 2), err => {
            if (err) {
                console.error('Error writing file:', err);
            } else {
                console.log('Filtered data has been saved to filtered_map.json');
            }
        });
    } catch (err) {
        console.error('Error parsing JSON:', err);
    }
});
