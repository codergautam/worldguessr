# Screens & Navigation

## Navigation Structure

The app has a simple screen-based navigation (not tab-based). The main state is managed by a `screen` variable that switches between views.

### Screen States
```
"home"          → Main menu / landing page
"singleplayer"  → Active singleplayer game
"multiplayer"   → Multiplayer lobby, queue, or active game
"onboarding"    → First-time tutorial
```

### Suggested React Navigation Structure
```
Stack Navigator (Root)
├── HomeScreen
│   ├── (Modal) AccountModal
│   ├── (Modal) SettingsModal
│   ├── (Modal) MapsModal
│   ├── (Modal) FriendsModal
│   ├── (Modal) SetUsernameModal
│   ├── (Modal) SuggestAccountModal
│   ├── (Modal) WhatsNewModal
│   └── (Modal) PendingNameChangeModal
├── SingleplayerGameScreen
│   ├── StreetViewComponent
│   ├── GameUIOverlay
│   └── RoundOverScreen
├── MultiplayerScreen
│   ├── MultiplayerHome (lobby/queue)
│   ├── StreetViewComponent
│   ├── GameUIOverlay
│   ├── RoundOverScreen
│   ├── (Modal) PartyModal (game settings for host)
│   └── (Modal) CountrySelectorModal
├── OnboardingScreen
├── LeaderboardScreen
├── MapDetailScreen (map preview/info page)
├── UserProfileScreen (public profiles)
├── ModDashboardScreen (staff only)
└── BannedScreen
```

---

## Screen Details

### 1. Home Screen (`/` or `/en`, `/es`, etc.)

**Purpose**: Main landing page with game mode selection buttons.

**Layout**:
- Top: Navbar with logo, online player count, settings gear, friends icon
- Center: Game title/logo with banner text
- Main area:
  - "Singleplayer" button → starts singleplayer game
  - "Play Online" button → queues for public unranked multiplayer
  - "Ranked Duel" button → queues for ranked duel (requires login + ELO)
  - "Play with Friends" button → creates private game
  - "Join Game" button → enter 6-digit game code
- Bottom: Map selection display, social links (Discord, GitHub, YouTube)
- Overlays: Various modals (account, settings, maps, friends)

**State on Load**:
- Fetch client config
- Check auth session
- Connect WebSocket (for player count, friend notifications)
- Check for pending name change
- Check for maintenance mode
- Show onboarding if first visit

**Key Actions**:
| Action | Result |
|--------|--------|
| Click Singleplayer | Set screen="singleplayer", load first location |
| Click Play Online | Connect WS, send `unrankedDuel` message, show "Finding game..." |
| Click Ranked Duel | Connect WS, send `publicDuel` message, show "Finding game..." with ELO range |
| Click Play with Friends | Connect WS, send `createPrivateGame`, show lobby |
| Click Join Game | Show game code input, send `joinPrivateGame` with code |
| Click Map name | Open MapsModal |
| Click Gear icon | Open SettingsModal |
| Click Profile/Login | Open AccountModal or trigger Google Sign-In |
| Click Friends icon | Open FriendsModal |

---

### 2. Singleplayer Game Screen

**Purpose**: Active singleplayer game with Street View and guess map.

**Layout (during guessing)**:
- Full screen: Street View panorama (can move, pan, zoom unless NM/NPZ)
- Bottom-right: Mini map (expandable, shows on click/tap)
  - OpenLayers/react-native-maps map for placing guess pin
  - "Guess" button (enabled when pin is placed)
- Top-left: Round indicator "Round X / Y"
- Top-right: Score display
- Optional: Hint button, compass

**Layout (after guessing / showing answer)**:
- Full screen: Answer map showing:
  - Green marker = actual location
  - Red marker = player's guess
  - Line connecting them
  - Distance in km
  - Points earned this round
- Buttons: "Next Round" or "View Results" (last round)

**Layout (game over)**:
- RoundOverScreen component showing:
  - Total score with animated counter
  - All rounds summary (expandable)
  - For each round: thumbnail, distance, points
  - XP earned
  - "Play Again" and "Home" buttons
  - Share button

**Game Flow**:
1. Load location → show Street View → player explores
2. Player taps mini map → places pin on guess map
3. Player presses "Guess" → calculate points, show answer
4. Player presses "Next" → load next location
5. After 5 rounds → show RoundOverScreen
6. Submit game to `/api/storeGame` (if logged in)

---

### 3. Multiplayer Screen

**Sub-states**:

#### 3a. Queue/Finding Game
- Shows "Finding game..." banner
- For ranked duels: shows ELO range (e.g., "ELO Range: 800 - 1200")
- Cancel button to leave queue

#### 3b. Lobby (Private Games)
- Shows game code (6-digit number)
- Player list with usernames
- Host controls:
  - Start game button (need 2+ players)
  - Settings (rounds, time, map, NM/NPZ modes)
  - Invite friends button
- Non-host: waiting state with player list

#### 3c. Active Multiplayer Game
- Same as singleplayer but with:
  - Timer counting down (top center)
  - Opponent scores visible
  - Chat box (bottom-left)
  - For duels: health bars instead of score (5000 → 0)

#### 3d. Round Results (Multiplayer)
- After each round:
  - All players' guesses shown on map
  - Points awarded shown
  - Leaderboard for current standings
  - Timer until next round

#### 3e. Game Over (Multiplayer)
- Final standings
- For ranked duels:
  - Winner/loser announcement
  - ELO change display (+X / -X)
  - New ELO and league shown
- "Play Again" (re-queues) or "Home" button
- Option to report player

---

### 4. Onboarding Screen

**Purpose**: First-time tutorial for new users.

**Flow**:
1. Show country selection buttons (e.g., US, France, Brazil, etc.)
2. Player selects country → loads Street View location in that country
3. Player guesses on map
4. Show result with educational feedback
5. Repeat for 5 rounds
6. Show completion screen with total score
7. "Start Playing" button → set `onboarding_done` in storage, go to home

---

### 5. Leaderboard Screen (`/leaderboard`)

**Purpose**: Global rankings.

**Layout**:
- Tab selector: "XP" / "ELO"
- Toggle: "All Time" / "Today"
- Table:
  - Rank #
  - Country flag
  - Username (clickable → profile)
  - Score (XP or ELO)
  - Daily change (for "Today" view)
- "Your Rank" section at bottom (if logged in)
- Search bar to find specific user's rank

---

### 6. Map Detail Screen (`/map/:slug`)

**Purpose**: Preview and info about a specific map.

**Layout**:
- Map name and creator
- Description (short and long)
- Stats: plays, hearts, location count
- Street View carousel (cycles through 5 sample locations)
- Interactive map showing all location markers
- "Play" button → starts singleplayer with this map
- "Heart" button → like/unlike

---

### 7. User Profile Screen (`/user?username=X`)

**Purpose**: Public user profile page.

**Layout**:
- Username with country flag
- Profile tabs: "Profile" / "ELO"
- Profile tab:
  - Member since date
  - Total XP
  - Games played
  - Profile views
  - XP progression chart
- ELO tab:
  - Current ELO and league badge
  - Duel stats (wins/losses/ties/win rate)
  - ELO rank
  - ELO progression chart
- Report username button (if logged in)
- Add friend button (if logged in)

---

### 8. Settings Modal

**Options**:
- Language selector (en, es, fr, de, ru)
- Distance units (km / miles)
- Map type for guess map (OpenStreetMap variants)
- Show RAM usage (debug)

---

### 9. Account Modal

**Tabs**:
- **Profile**: Account info, country flag selector, username change, stats
- **ELO**: ELO rating, league, duel stats, progression chart
- **Friends List**: Managed via FriendsModal
- **Moderation**: Own moderation history, ELO refunds, submitted reports

---

### 10. Maps Modal

**Layout**:
- Left sidebar: Category navigation (Country Maps, Spotlight, Popular, Recent)
- Main area: Scrollable grid of map tiles
- Search bar at top
- Each tile shows: name, creator, hearts, location count, play count
- Click tile → select map for gameplay

---

### 11. Banned Screen (`/banned`)

Shows banned message with reason and expiry (if temp ban).

---

## Modal Inventory

| Modal | Trigger | Purpose |
|-------|---------|---------|
| AccountModal | Click profile/avatar | View/edit profile, stats |
| SetUsernameModal | First login (no username) | Set initial username |
| SuggestAccountModal | After 3 singleplayer games as guest | Prompt to create account |
| SettingsModal | Click gear icon | App settings |
| MapsModal | Click map name or "Change Map" | Browse and select maps |
| FriendsModal | Click friends icon | Manage friends, send/accept requests |
| PartyModal | Host in private game lobby | Configure game settings |
| CountrySelectorModal | In PartyModal, click country | Select country for game map |
| PendingNameChangeModal | Forced name change active | Submit new username |
| WhatsNewModal | New changelog entries | Show latest updates |
| AlertModal | Connection issues | Display error/warning |
| DiscordModal | Promotional trigger | Link to Discord server |
| ReportModal | In RoundOverScreen | Report player for cheating/username |
| InfoModal | Various info triggers | Display information |
