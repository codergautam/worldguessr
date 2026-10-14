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

// Spatial hash on 3D points on the sphere. Chord length <= arc length, so any
// point within maxDistance lies in one of the 27 cells around the query cell.
function removeNearbyPoints(data, maxDistance) {
    const R = 6371000;
    const toRad = angle => angle * (Math.PI / 180);
    const cellKey = (x, y, z) => `${x},${y},${z}`;

    const cells = new Map();
    const cellCoords = data.map(({ lat, lng }, i) => {
        const cosLat = Math.cos(toRad(lat));
        const cx = Math.floor(R * cosLat * Math.cos(toRad(lng)) / maxDistance);
        const cy = Math.floor(R * cosLat * Math.sin(toRad(lng)) / maxDistance);
        const cz = Math.floor(R * Math.sin(toRad(lat)) / maxDistance);
        const key = cellKey(cx, cy, cz);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(i);
        return [cx, cy, cz];
    });

    const result = [];
    const removed = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++) {
        if (removed[i]) continue;

        const { lat: lat1, lng: lng1 } = data[i];
        const [cx, cy, cz] = cellCoords[i];
        const nearby = [];

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const bucket = cells.get(cellKey(cx + dx, cy + dy, cz + dz));
                    if (!bucket) continue;
                    for (const j of bucket) {
                        if (j <= i || removed[j]) continue;
                        const { lat: lat2, lng: lng2 } = data[j];
                        if (haversineDistance(lat1, lng1, lat2, lng2) < maxDistance) {
                            nearby.push(j);
                        }
                    }
                }
            }
        }

        nearby.sort((a, b) => a - b);
        for (const j of nearby) {
            removed[j] = 1;
            console.log(`Removed point ${j} (${data[j].lat}, ${data[j].lng}) near point ${i} (${lat1}, ${lng1})`);
        }

        if (nearby.length === 0) {
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
