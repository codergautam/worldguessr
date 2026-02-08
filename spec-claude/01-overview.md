# WorldGuessr - Overview & Architecture
n

## What is WorldGuessr
- Free GeoGuessr alternative web game
- Players are dropped into a Google Street View panorama and must guess the location on a map
- Singleplayer and multiplayer modes
- Community-created maps, leaderboards, ELO rating system
- Currently a Next.js web app, being ported to React Native

## Current Tech Stack (Web)
- **Frontend**: Next.js 14, React 18, Leaflet/react-leaflet (guess map with Google tile layers), Google Street View Embed API (panoramas via iframe)
- **Backend API**: Next.js API routes + separate Express/Node.js API server
- **WebSocket Server**: uWebSockets.js (separate Node.js process)
- **Database**: MongoDB with Mongoose ODM
- **Auth**: Google OAuth 2.0, CrazyGames SDK JWT
- **Caching**: recachegoose (Mongoose query caching), in-memory caches
- **Styling**: Plain CSS + SCSS (no CSS framework)
- **i18n**: Custom hook-based system, 5 languages (en, es, fr, de, ru)
- **Key Libraries**: react-responsive-modal, react-toastify, chart.js, react-icons, bad-words, @googlemaps/js-api-loader

Our goal with this project is to create an exact replica of this web client in React Native, while minimizing bloat and ensuring a smoother experience (so not just a simple iframe, need to rebuild everything in a better manner while keeping exact same style and functionality)

## Project Structure
```
worldguessr/
├── pages/              # Next.js pages (routes)
│   ├── api/            # REST API endpoints (Next.js API routes)
│   ├── index.js        # Home page (auto-redirects by language)
│   ├── en.js, es.js, fr.js, de.js, ru.js  # Localized home pages
│   ├── leaderboard/    # Leaderboard page
│   ├── map.js          # Map detail/preview page
│   ├── maps.js         # Maps browsing page
│   ├── user.js         # Public user profile page
│   ├── mod.js          # Moderator dashboard
│   ├── learn.js        # Learning mode page
│   ├── svEmbed.js      # Street View embed (iframe target)
│   └── banned.js       # Banned user page
├── api/                # Standalone API handlers (used by external server)
├── ws/                 # WebSocket server
│   ├── ws.js           # Main WS server + message handlers
│   └── classes/
│       ├── Game.js     # Game state machine
│       └── Player.js   # Player class
├── components/         # React components
│   ├── home.js         # Main game controller (huge - manages all state)
│   ├── gameUI.js       # In-game interface (guess button, minimap, timer)
│   ├── streetview/     # Street View components
│   ├── maps/           # Map browsing/creation components
│   ├── auth/           # Authentication utilities
│   ├── utils/          # Utility functions
│   └── ui/             # Shared UI components
├── models/             # Mongoose database models
├── public/             # Static assets (locales, country data, images)
│   ├── locales/        # Translation JSON files
│   ├── countries.json  # Country list
│   └── officialCountryMaps.json  # Built-in map definitions
├── styles/             # CSS/SCSS files
├── serverUtils/        # Server-side utilities
└── clientConfig.js     # Client configuration (API URLs)
```

## Architecture for React Native

### What Stays the Same
- All backend APIs (no changes needed)
- WebSocket server and protocol
- Game logic on server (multiplayer)
- Database and data models
- Authentication flow (exchange tokens with same API)

### What Changes
| Web | React Native |
|-----|-------------|
| Next.js pages/routing | React Navigation (stack + tab navigators) |
| Leaflet map (react-leaflet + Google tiles) | `react-native-webview` with embedded Leaflet HTML (free, no SDK billing) |
| Google Street View iframe (Embed API) | `react-native-webview` loading same embed URL |
| CSS/SCSS | StyleSheet / styled-components |
| localStorage | AsyncStorage or MMKV |
| Browser WebSocket | React Native WebSocket (built-in) |
| react-responsive-modal | React Native Modal or bottom sheets |
| react-toastify | react-native-toast-message |
| next/image | React Native Image / FastImage |
| next/router | React Navigation hooks |
| Google OAuth (web popup) | @react-native-google-signin |
| chart.js | react-native-chart-kit or Victory Native |

### Client Config
The RN app should define the following constants (hardcoded or in a config file):
- `apiUrl`: `https://api.worldguessr.com` — Base URL for all REST API calls
- `wsUrl`: `wss://server.worldguessr.com/wg` — WebSocket server URL (path `/wg` is required)
- `googleMapsEmbedKey`: `AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI` — Used for Street View embed URLs

The web app derives these from env vars in `clientConfig.js`. The RN app should store them in a global config context.

### App Entry Point Flow
1. App launches -> fetch client config
2. Check for stored auth token (AsyncStorage)
3. If token exists -> verify with `/api/googleAuth` (POST with secret)
4. Show home screen (with or without auth)
5. Initialize WebSocket connection (for multiplayer, friends, player count)

## Key Considerations for Mobile
- **Performance**: Street View in WebView can be heavy. Consider lazy loading and memory management.
- **Offline**: The app requires internet. Show appropriate offline states.
- **Deep Links**: Support `/map/:slug` and `/user?username=X` deep links.
- **Push Notifications**: Not in web version but could add for friend invites.
- **Haptics**: Add haptic feedback for guess placement and score reveals.
- **Gestures**: The guess map should support pinch-to-zoom and pan gestures natively.
