# Maps System

## Map Types

### 1. World Map ("all")
- Default map, includes worldwide locations
- maxDist: 20,000 km
- Locations generated randomly using Google Street View API
- Filters out trekker/unofficial coverage

### 2. Official Country Maps
- 195+ countries pre-defined in `/public/officialCountryMaps.json`
- Each has: name, slug, descriptions, maxDist, countryCode, extent (bounding box)
- Locations served from `/countryLocations/{countryCode}`
- Examples: `{ slug: "us", name: "United States", maxDist: 5000, countryCode: "US" }`

### 3. Community Maps
- User-created maps stored in MongoDB
- Require staff approval before public listing
- 5 to 100,000 locations per map
- Auto-calculated maxDist from location spread

## Map Data Structure
```json
{
  "slug": "my-cool-map",
  "name": "My Cool Map",
  "created_by": "user-mongodb-id",
  "map_creator_name": "CreatorUsername",
  "created_at": "2024-01-01T00:00:00Z",
  "lastUpdated": "2024-06-01T00:00:00Z",
  "plays": 200,
  "hearts": 50,
  "data": [
    { "lat": 48.8566, "lng": 2.3522, "heading": 90, "pitch": 0, "panoId": "abc123" }
  ],
  "description_short": "Famous landmarks (20-100 chars)",
  "description_long": "Detailed description (100-1000 chars)",
  "accepted": true,
  "in_review": false,
  "reject_reason": null,
  "resubmittable": false,
  "countryMap": null,
  "official": false,
  "maxDist": 5000,
  "spotlight": false
}
```

## Location Object
```json
{
  "lat": 48.8566,
  "lng": 2.3522,
  "heading": 90,
  "pitch": 0,
  "zoom": null,
  "panoId": "google-pano-id"
}
```

## Map Discovery (mapHome API)
Returns categorized sections:
- **My Maps**: User's created maps
- **Liked Maps**: User's hearted maps
- **Country Maps**: Official country maps
- **Recent**: Recently updated community maps (80 min cache)
- **Popular**: Most-hearted maps (160 min cache)
- **Spotlight**: Featured/curated maps (800 min cache)

## Map Search
- POST `/api/map/searchMap` with query (min 3 chars)
- MongoDB text search on name, description, creator
- Ranked: exact match > starts with > contains > by hearts
- Max 50 results, 10 second cache

## Map Creation Flow
```
1. User opens "Make Map" form
2. Enters: name (3-30 chars), short description (20-100), long description (100-1000)
3. Uploads location data (JSON with lat/lng objects)
4. Validates: min 5 locations, valid coordinates, profanity check
5. POST /api/map/action { action: "create", ... }
6. Map goes to "in_review" status
7. Staff approves or rejects via mod dashboard
8. If approved: appears in public listings
9. If rejected: creator notified, may resubmit if allowed
```

## Map Interaction
- **Heart/Like**: Toggle via POST /api/map/heartMap (500ms cooldown)
- **Play**: Select map → starts game with that map's locations
- **Delete**: Creator or staff can delete via DELETE /api/map/delete

## Map Selection in Game
```
1. User taps map name / "Change Map" on home screen
2. Maps modal opens with grid of map tiles
3. User browses categories or searches
4. Taps a map tile → map selected
5. Game options updated: location, maxDist, extent, official flag
6. When game starts, locations fetched from selected map
```

## Map Constants
- MIN_LOCATIONS: 5
- MAX_LOCATIONS: 100,000
- MAX_NAME_LENGTH: 30
- MIN_NAME_LENGTH: 3
- MAX_SHORT_DESCRIPTION_LENGTH: 100
- MIN_SHORT_DESCRIPTION_LENGTH: 20
- MAX_LONG_DESCRIPTION_LENGTH: 1000
- MIN_LONG_DESCRIPTION_LENGTH: 100
- MIN_MAP_INTERVAL: 1 hour between submissions
