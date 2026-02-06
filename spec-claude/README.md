# WorldGuessr React Native Specification

Complete specification for rebuilding the WorldGuessr web application as a React Native mobile app. This document set contains everything a React Native developer needs to replicate all functionality from the existing Next.js web client.

## Document Index

| # | Document | Description |
|---|----------|-------------|
| 01 | [Overview & Architecture](./01-overview.md) | Tech stack, project structure, architecture decisions |
| 02 | [Screens & Navigation](./02-screens-and-navigation.md) | All screens, navigation flow, screen states |
| 03 | [Game Modes & Gameplay](./03-game-modes.md) | Singleplayer, multiplayer, duels, onboarding, scoring |
| 04 | [API Reference](./04-api-reference.md) | Complete REST API documentation (40 endpoints) |
| 05 | [WebSocket Protocol](./05-websocket-protocol.md) | Real-time multiplayer protocol, all message types |
| 06 | [Authentication](./06-authentication.md) | Google OAuth, CrazyGames SDK, session management |
| 07 | [Maps System](./07-maps-system.md) | Official maps, community maps, map creation |
| 08 | [User System](./08-user-system.md) | Profiles, friends, leaderboards, ELO/leagues |
| 09 | [Data Models](./09-data-models.md) | Database schemas, data structures |
| 10 | [UI Components](./10-ui-components.md) | Component inventory mapped to RN equivalents |
| 11 | [Internationalization](./11-i18n.md) | Multi-language support, translation system |

## Key Architecture Notes for React Native

- **Backend is shared**: The RN app connects to the same API server and WebSocket server as the web app. No backend changes needed.
- **Street View**: The web app uses Google Maps Embed API via iframe. For RN, use `react-native-webview` loading the same Street View embed URL (see 10-ui-components.md for URL format).
- **Guess Map**: The web app uses Leaflet (react-leaflet) with Google tile layers for the guess map. For RN, use `react-native-webview` with a Leaflet-based HTML page to keep it free (no Google Maps SDK billing required).
- **Real-time**: WebSocket communication uses raw `WebSocket` API (not Socket.IO). Compatible with RN's built-in WebSocket.
- **Storage**: Replace `localStorage` with `AsyncStorage` or `react-native-mmkv`.
- **Auth**: Google Sign-In via `@react-native-google-signin/google-signin`, then exchange token with the same API.

## Server Endpoints

- **API Base URL**: `https://api.worldguessr.com`
- **WebSocket URL**: `wss://server.worldguessr.com/wg`
- These can be hardcoded in the RN app or loaded from a config

## Quick Start for RN Developer

1. Read **01-overview.md** for architecture context
2. Read **06-authentication.md** to implement login
3. Read **02-screens-and-navigation.md** for the app structure
4. Read **03-game-modes.md** for core gameplay
5. Read **05-websocket-protocol.md** for multiplayer
6. Use **04-api-reference.md** as ongoing reference
