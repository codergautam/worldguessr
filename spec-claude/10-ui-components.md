# UI Components

## Component Inventory

This maps the web components to suggested React Native equivalents.

### Core Game Components

| Web Component | Purpose | RN Equivalent |
|---------------|---------|---------------|
| `StreetView` | Google Street View panorama | `react-native-webview` loading Google Maps Embed API URL (see Street View section below) |
| `Map` (Leaflet + Google tiles) | Guess placement map | `react-native-webview` with embedded Leaflet HTML page (keeps it free — no Maps SDK billing) |
| `GameUI` | Game overlay (timer, score, guess button) | Custom overlay with `Animated` |
| `RoundOverScreen` | End-of-round/game results | Full-screen modal with `ScrollView` |
| `BannerText` | Status banners ("Finding game...") | Animated banner component |

### Navigation & Layout

| Web Component | Purpose | RN Equivalent |
|---------------|---------|---------------|
| `Navbar` | Top navigation bar | Custom header or React Navigation header |
| `Home` | Main game controller | Home screen with state management |
| `MultiplayerHome` | Multiplayer lobby/queue UI | Multiplayer screen |
| `LocalizedHome` | Language redirect wrapper | Not needed (handle in nav) |

### Modals

| Web Component | Purpose | RN Equivalent |
|---------------|---------|---------------|
| `AccountModal` | Profile/account management | Bottom sheet or full-screen modal |
| `SetUsernameModal` | First-time username setup | Full-screen modal |
| `SuggestAccountModal` | Account creation prompt | Bottom sheet |
| `SettingsModal` | App settings | Settings screen or bottom sheet |
| `MapsModal` | Map browsing/selection | Full-screen modal with FlatList |
| `FriendsModal` | Friend management | Full-screen modal |
| `PartyModal` | Private game settings | Bottom sheet |
| `CountrySelectorModal` | Country picker for games | Full-screen modal with search |
| `PendingNameChangeModal` | Forced name change | Full-screen modal |
| `WhatsNewModal` | Changelog display | Bottom sheet |
| `AlertModal` | Error/warning alerts | React Native Alert or custom |
| `ReportModal` | Player reporting | Bottom sheet with form |
| `DiscordModal` | Discord promotion | Bottom sheet with link |
| `InfoModal` | Information display | Bottom sheet |

### Map Components

| Web Component | Purpose | RN Equivalent |
|---------------|---------|---------------|
| `MapsModal` | Map discovery container | Screen with sections |
| `MapView` (maps/) | Map grid layout | FlatList with grid |
| `MapTile` | Individual map card | Card component |
| `MakeMapForm` | Map creation form | Form screen |
| `useMapSearch` | Debounced map search | Custom hook (same logic) |

### Profile Components

| Web Component | Purpose | RN Equivalent |
|---------------|---------|---------------|
| `PublicProfile` | Public user profile | Profile screen |
| `AccountView` | Profile tab content | Tab view content |
| `EloView` | ELO tab content | Tab view content |
| `XPGraph` | XP/ELO progression chart | react-native-chart-kit |
| `CountryFlag` | Country flag emoji/image | Text or Image component |

### Utility Components

| Web Component | Purpose | RN Equivalent |
|---------------|---------|---------------|
| `ChatBox` | In-game chat | FlatList + TextInput |
| `OnboardingText` | Tutorial text | Custom component |
| `AnimatedCounter` | Animated score counter | Animated.Value |
| `Ad` (bannerAdNitro) | Advertisement banner | AdMob or similar |
| `HomeNotice` | Home screen notices | Banner component |

## Key UI Patterns

### Guess Map (Mini Map — WebView + Leaflet)

The web app uses **Leaflet** (react-leaflet) with **Google tile layers** (not a paid Maps SDK). For RN, use `react-native-webview` loading a bundled HTML file that contains Leaflet. This keeps it **completely free** — no Google Maps SDK or billing needed.

**Tile URL pattern** (used by Leaflet TileLayer):
```
https://mt{s}.google.com/vt/lyrs={mapType}&x={x}&y={y}&z={z}&hl={lang}&scale=2
```
- `{s}`: Subdomain rotation: `0`, `1`, `2`, `3`
- `{mapType}`: `m` (roadmap), `s` (satellite), `y` (hybrid) — default `m`
- `{lang}`: Language code from i18n (e.g., `en`)

**Communication between RN and WebView:**
- RN → WebView: `postMessage` to update pin position, show answer markers, set bounds/extent, show hint circle
- WebView → RN: `onMessage` to receive tap coordinates (user placing a guess pin)

**Mini map behavior:**
- Starts collapsed (small icon in corner)
- Taps to expand to ~40% of screen
- Shows world map (or bounded to game region via `extent` bounds)
- User taps to place/move pin marker
- "Guess" button appears when pin placed
- After guess: expands to full screen showing answer with polyline from guess to actual location
- Shows other players' guesses in multiplayer (after round ends)

**Hint circle:**
- When hint is used, a red circle is drawn on the map
- Center is offset randomly from actual location (5-70% of radius) using seeded random
- Radius: `5000000 / 20000 * maxDist` meters

### Street View (WebView Implementation)

The web app uses a Google Maps Embed API iframe. The RN app should use `react-native-webview` loading the same URL.

**URL Construction:**
```
https://www.google.com/maps/embed/v1/streetview?location={lat},{long}&key=AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI&fov=100&language=en
```

**Parameters:**
- `location`: `{lat},{long}` — the panorama coordinates
- `key`: Google Maps Embed API key (the Embed API is free, no billing required)
- `fov`: Field of view, always `100`
- `language`: Always `en`

**Note:** The web app currently does NOT use `panoId`, `heading`, or `pitch` parameters (they are commented out in the source). Only `location` is used.

**WebView props to set:**
- `source={{ uri: streetViewUrl }}`
- `style`: full screen, dark background (#1a1a2e) to prevent white flash
- `allowsInlineMediaPlayback={true}`
- Sizing: 100% width, extend height beyond viewport (web uses `calc(100vh + 300px)` with `translateY(-285px)` to hide Google branding at bottom)

**Game behavior:**
- Takes full screen during guessing
- Supports: pan (drag), zoom (pinch), move (tap arrows) — all handled by Google's embed
- NM+NPZ mode: Apply CSS class `nmpz` via injected JS to disable interaction
- Loading state: dark background (#1a1a2e)
- Reload: re-set the URL on the WebView to force a fresh panorama load

### Timer Display
- Countdown timer for multiplayer rounds
- Uses server time sync for accuracy
- Visual: centered at top, large font
- Colors: normal → yellow (< 10s) → red (< 5s)

### Score Display
- Running total in corner
- Animated increment on point award
- For duels: health bar (5000 → 0)

### Round Indicator
- "Round X / Y" format
- Top-left position

## Responsive Design Notes
The web app uses these breakpoints for map grid:
- Desktop (1400px+): 6 tiles per row
- Laptop (1200px): 5 per row
- Wide tablet (1000px): 4 per row
- Tablet (768px): 3 per row
- Mobile (480px): 2 per row

For React Native, use device width to determine column count:
- Phone portrait: 2 columns
- Phone landscape: 3 columns
- Tablet portrait: 3-4 columns
- Tablet landscape: 5-6 columns

## Color Scheme
The app uses a dark theme with green accents:
```
Primary green: #245734
Primary dark: #112b18
Primary light: #3a7a52
Card background: rgba(0, 0, 0, 0.3)
Text: white / rgba(255, 255, 255, 0.8)
Overlay: rgba(0, 0, 0, 0.8)
```

## Animation Patterns
- Modal entrance: slide up with ease-out
- Score counter: animated increment
- Map tile hover: scale(1.02) with shadow increase
- Banner text: fade in/out
- Toast notifications: slide in from top
- Loading spinner: rotating circle
