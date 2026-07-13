# Environment Variables Documentation

This document lists all supported environment variables for the WorldGuessr project. Environment variables should be set in a `.env.local` file in the project root for local development, or configured in your deployment environment.

## 🚨 Required Variables

These variables are essential for the application to function properly:

### Database Configuration

```bash
# MongoDB connection string
MONGODB=mongodb://localhost:27017/worldguessr
# OR for MongoDB Atlas:
# MONGODB=mongodb+srv://username:password@cluster.mongodb.net/worldguessr

# Redis connection string for caching and sessions
REDIS_URI=redis://localhost:6379
# OR for Redis Cloud:
# REDIS_URI=redis://username:password@host:port
```

### Google Authentication (Required for multiplayer)

```bash
# Google OAuth Client ID (publicly visible)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

# Google OAuth Client Secret (server-side only)
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

## 🌐 Server Configuration

### Port Configuration

```bash
# API server port (default: 3001)
API_PORT=3001

# WebSocket server port (default: 3002)
WS_PORT=3002

# Next.js development server runs on port 3000 by default
```

### Environment Mode

```bash
# Node.js environment mode
NODE_ENV=development
# OR
NODE_ENV=production
```

## 🌍 Client Configuration (Public Variables)

These variables are exposed to the browser and must be prefixed with `NEXT_PUBLIC_`:

### API Endpoints

```bash
# API server URL (publicly visible)
NEXT_PUBLIC_API_URL=localhost:3001
# OR for production:
# NEXT_PUBLIC_API_URL=api.yourwebite.com

# WebSocket server host (publicly visible)
NEXT_PUBLIC_WS_HOST=localhost:3002
# OR for production:
# NEXT_PUBLIC_WS_HOST=ws.yourwebsite.com
```

### Platform Integrations

```bash
# Enable CoolMath Games mode
NEXT_PUBLIC_COOLMATH=true

# Enable Poki.com integration
NEXT_PUBLIC_POKI=true

# Maps.co API key for geocoding (if using)
NEXT_PUBLIC_MAPSCO=your_mapsco_api_key
```

## 🔧 Optional Features

### Discord Integration

```bash
# Discord webhook URL for main server notifications
DISCORD_WEBHOOK=https://discord.com/api/webhooks/your_webhook_url

# Discord webhook URL for WebSocket server notifications
DISCORD_WEBHOOK_WS=https://discord.com/api/webhooks/your_ws_webhook_url
```

### AI Features (Currently Disabled)

```bash
# OpenAI API key for AI-generated clues (feature currently commented out)
# OPENAI_API_KEY=your_openai_api_key
```

### Maintenance Mode

```bash
# Secret key for enabling/disabling maintenance mode
MAINTENANCE_SECRET=your_secure_maintenance_secret
```

### Duel Bots (WebSocket Server)

Bot backfill for ranked 1v1 and 2v2 matchmaking (`ws/botUtils.js`). ⚠️ **Both flags are ON by default** — leaving them unset means bots are live in production; set them to `off` to disable. Read once at ws server boot.

```bash
# Bot backfill for struggling/new players:
#   (unset)           - bots ENABLED (default): newbies (0 wins or <10%
#                       winrate, per mode) whom the pairing pass couldn't
#                       serve get a bot opponent (1v1) or a full bot opposing
#                       team (2v2). Humans always get first refusal.
#   DUEL_BOTS=off     - no bot backfill at all
#   DUEL_BOTS=instant - TESTING ONLY, never set in prod: skips every
#                       eligibility gate (guests included) — anyone left
#                       unmatched after a pairing pass gets a bot immediately
DUEL_BOTS=off

# Bot country flags. ON by default (weighted toward the game's real player
# countries); set to off to spawn bots flagless (renders exactly like a user
# who never set a flag).
DUEL_BOT_FLAGS=off
```

## 📱 Platform-Specific Configuration

### CoolMath Games

When deploying to CoolMath Games, set:

```bash
NEXT_PUBLIC_COOLMATH=true
```

This enables:
- CoolMath Games specific UI modifications
- Ad integration handling
- Username filtering and guest name handling
- Disabled community features

### Poki.com

When deploying to Poki.com, set:

```bash
NEXT_PUBLIC_POKI=true
```

This enables:
- Poki SDK integration (NitroPay/AdInPlay are skipped entirely)
- `PokiSDK.commercialBreak()` interstitials at the same break points as the CrazyGames midgame ads
- Account features hidden (same treatment as CoolMathGames): no login button, no ranked/2v2, no suggest-login modals, no social/external links
- GA events tagged with `platform: "poki"` via `getPlatform()`

Build with `pnpm build:poki`. The static export lands in `.next-poki/`, and the Poki-ready archive is written to `builds-submission/worldguessr-poki.zip`.

Poki hosting constraints the build/packaging pipeline handles (all were 404-everything bugs at some point):

1. **Nested per-deploy path**: Poki serves each upload from `https://<sub>.gdn.poki.com/<uuid>/index.html` where the `<uuid>` changes per version, so nothing can be root-absolute and no basePath can be hardcoded. `next.config.js` sets `assetPrefix: '.'` for Poki builds (relative `./_next/...` script/css refs, webpack publicPath `./_next/`), and `lib/basePath.js` derives the deploy folder at runtime from the entry document's directory so `asset()`/`navigate()` resolve correctly.
2. **CSS `url()` resolves relative to the CSS file**, not the page — `scripts/packagePoki.mjs` rewrites `url(_next/static/media/...)` in exported CSS to `url(../media/...)` (fonts, Leaflet icons) and fails the build if any such ref survives.
3. **Prerendered HTML** bakes root-absolute public asset refs (`/street2.webp`, `/loader.webp`, `/icon.ico`) — the packager rewrites them document-relative, depth-aware, only when the target is a real exported file (route links are left alone).
4. **Prod endpoints must be baked at build time**: `build:poki` pins `NEXT_PUBLIC_API_URL=api.worldguessr.com`, `NEXT_PUBLIC_AUTH_URL=gauth.worldguessr.com`, `NEXT_PUBLIC_WS_HOST=server.worldguessr.com` so a dev `.env` (LAN IPs) can never leak into a platform submission.
5. **ZIP entry paths must use forward slashes**: the packager writes them itself and rejects backslashes. Do not re-zip with PowerShell's `Compress-Archive` — on Windows it records `_next\static\...` entries and every nested asset 404s on Poki.

Warning: with `output: 'export'`, Next still writes build internals to `.next` regardless of `NEXT_DIST_DIR`, so never run any build while `pnpm dev` is running — it corrupts the dev server (stop dev, delete `.next`, restart to recover).

### CrazyGames

CrazyGames integration is detected automatically via URL parameters (`?crazygames=true`), no environment variable needed.

## 🚀 Example Configuration Files

### Development (.env.local)

```bash
# Database
MONGODB=mongodb://localhost:27017/worldguessr
REDIS_URI=redis://localhost:6379

# Google Auth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=123456789-abcdefghijk.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_client_secret

# Server Configuration
API_PORT=3001
WS_PORT=3002
NODE_ENV=development

# Client Configuration
NEXT_PUBLIC_API_URL=localhost:3001
NEXT_PUBLIC_WS_HOST=localhost:3002

# Optional: Discord notifications
DISCORD_WEBHOOK=https://discord.com/api/webhooks/your_webhook_url
DISCORD_WEBHOOK_WS=https://discord.com/api/webhooks/your_ws_webhook_url

# Optional: Maintenance mode
MAINTENANCE_SECRET=your_secure_secret
```

### Production (.env.production)

```bash
# Database (production URLs)
MONGODB=mongodb+srv://username:password@cluster.mongodb.net/worldguessr
REDIS_URI=redis://username:password@redis-host:port

# Google Auth (production credentials)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=prod_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=prod_client_secret

# Server Configuration
API_PORT=3001
WS_PORT=3002
NODE_ENV=production

# Client Configuration (production URLs)
NEXT_PUBLIC_API_URL=api.worldguessr.com
NEXT_PUBLIC_WS_HOST=ws.worldguessr.com

# Discord notifications
DISCORD_WEBHOOK=https://discord.com/api/webhooks/prod_webhook
DISCORD_WEBHOOK_WS=https://discord.com/api/webhooks/prod_ws_webhook

# Maintenance mode
MAINTENANCE_SECRET=production_maintenance_secret
```

### Platform-Specific: CoolMath Games

```bash
# All standard variables plus:
NEXT_PUBLIC_COOLMATH=true

# Note: Some features are automatically disabled in CoolMath mode:
# - Community maps
# - Chat functionality
# - User-generated content features
```

## 🛠️ Variable Usage by Component

### Server Components (`server.js`)
- `MONGODB` - Database connection
- `API_PORT` - Server port
- `NODE_ENV` - Environment mode
- `DISCORD_WEBHOOK` - Discord notifications
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - OAuth validation
- `GOOGLE_CLIENT_SECRET` - OAuth server-side

### WebSocket Server (`ws/ws.js`)
- `MONGODB` - Database connection
- `REDIS_URI` - Session storage
- `WS_PORT` - WebSocket port
- `NODE_ENV` - Environment mode
- `DISCORD_WEBHOOK_WS` - WebSocket notifications
- `MAINTENANCE_SECRET` - Maintenance mode control
- `DUEL_BOTS` / `DUEL_BOT_FLAGS` - Duel bot backfill toggles (ON unless `off`)
- `DEBUG_ELO_CHANGES` - set to `true` to log ELO wiring at match creation

### Client Configuration (`clientConfig.js`)
- `NEXT_PUBLIC_API_URL` - API endpoint
- `NEXT_PUBLIC_WS_HOST` - WebSocket endpoint

### Authentication (`api/googleAuth.js`)
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth validation

### Platform Integration (`components/headContent.js`)
- `NEXT_PUBLIC_COOLMATH` - CoolMath Games mode
- `NEXT_PUBLIC_POKI` - Poki.com integration

## 🔍 Debugging Environment Issues

### Common Issues

1. **Database Connection Failed**
   - Check `MONGODB` connection string
   - Ensure database is running and accessible
   - Verify network connectivity

2. **Authentication Not Working**
   - Verify `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set
   - Check `GOOGLE_CLIENT_SECRET` is correct
   - Ensure Google OAuth is configured properly

3. **WebSocket Connection Issues**
   - Check `WS_PORT` matches client expectations
   - Verify `NEXT_PUBLIC_WS_HOST` is accessible
   - Ensure `REDIS_URI` is working for session storage

4. **Platform-Specific Features Not Working**
   - Verify platform environment variables are set correctly
   - Check if features are properly gated behind environment checks

### Environment Validation

The application will log warnings for missing critical environment variables:
- `[MISSING-ENV WARN] MONGODB env variable not set`
- `[MISSING-ENV WARN] REDIS_URI env variable not set`
- `[MISSING-ENV WARN] NEXT_PUBLIC_GOOGLE_CLIENT_ID env variable not set`
- `[MISSING-ENV WARN] GOOGLE_CLIENT_SECRET env variable not set`

### Maintenance Mode Usage

To enable maintenance mode (requires `MAINTENANCE_SECRET` to be set):

```bash
# Enable maintenance mode
curl http://your-ws-server.com/setmaintenance/your_secret/true

# Disable maintenance mode
curl http://your-ws-server.com/setmaintenance/your_secret/false
```

## 📋 Quick Setup Checklist

For a minimal working setup, ensure these variables are set:

- [ ] `MONGODB` - Database connection
- [ ] `REDIS_URI` - Redis connection
- [ ] `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - Google OAuth client
- [ ] `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- [ ] `NEXT_PUBLIC_API_URL` - API server URL
- [ ] `NEXT_PUBLIC_WS_HOST` - WebSocket server URL

Optional but recommended:
- [ ] `DISCORD_WEBHOOK` - For monitoring and notifications
- [ ] `MAINTENANCE_SECRET` - For emergency maintenance mode

## 🔐 Security Notes

- **Never commit `.env` files to version control**
- **Use different credentials for development and production**
- **Rotate secrets regularly, especially `MAINTENANCE_SECRET`**
- **Monitor Discord webhooks for unusual activity**
- **Ensure `GOOGLE_CLIENT_SECRET` is never exposed to clients**

---

For additional help with environment configuration, check the application startup logs for specific warnings about missing or misconfigured variables.
