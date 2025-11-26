# User Report System Implementation

## Overview
This document describes the implementation of a user reporting system for WorldGuessr that allows players to report other users after playing ranked games. Reports are submitted by users and reviewed by moderators on the mod dashboard.

## Components Implemented

### 1. Database Model (`models/Report.js`)
A new MongoDB model for storing reports with the following fields:
- Reporter and reported user information (userId and username)
- Reason (inappropriate_username, cheating, or other)
- Description (up to 500 characters / ~100 words)
- Game context (gameId and gameType)
- Status tracking (pending, reviewed, dismissed, action_taken)
- Moderator notes and review information
- Timestamps

### 2. Report Modal (`components/reportModal.js`)
A user-facing modal component that:
- Displays when a user clicks the report button
- Allows selection of report reason from dropdown
- Provides textarea for description (100 word limit with counter)
- Validates input (minimum 5 words)
- Submits report to backend API
- Shows appropriate success/error messages

### 3. Game Over Screen Integration (`components/roundOverScreen.js`)
Modified to include:
- Report button that appears after ranked duel games
- Only visible to logged-in users
- Only appears when there's an opponent to report
- Opens the report modal with opponent information
- Uses FaFlag icon for visual indication

### 4. API Endpoints

#### Submit Report (`api/submitReport.js`)
- POST endpoint for submitting new reports
- Validates all input fields
- Prevents self-reporting
- Checks for duplicate reports (same reporter, same reported user, same game)
- Rate limiting (max 5 reports per hour per user)
- Verifies reporter is not banned
- Returns success/error response

#### Get Reports (`api/mod/getReports.js`)
- POST endpoint for fetching reports (staff only)
- Supports status filtering (pending, reviewed, dismissed, action_taken, all)
- Pagination support (limit and skip)
- Returns reports with stats summary
- Provides counts by status for dashboard metrics

### 5. Mod Dashboard Updates (`components/modDashboard.js`)
Enhanced with:
- New "Reports" tab alongside "User Lookup"
- Stats bar showing total, pending, reviewed, and action taken counts
- Status filter dropdown to filter reports
- Report cards displaying:
  - Status badge and timestamp
  - Reporter and reported user (clickable to lookup)
  - Reason and description
  - Game ID and type
  - Report ID for reference
- Refresh button to reload reports
- Empty state when no reports exist

### 6. CSS Styling (`styles/modDashboard.module.css`)
Added comprehensive styling for:
- Tab navigation with active state indicators
- Stats bar with grid layout
- Filter bar with dropdown and refresh button
- Report cards with hover effects
- Status badges with color coding
- Responsive design for mobile devices

## Features

### User-Facing Features
1. **Report Button**: Visible after ranked games for logged-in users
2. **Report Modal**: Easy-to-use interface for submitting reports
3. **Validation**: Ensures quality reports with minimum word count
4. **Feedback**: Toast notifications for success/error states

### Moderator Features
1. **Reports Tab**: Dedicated section in mod dashboard
2. **Statistics**: Overview of report counts by status
3. **Filtering**: View reports by status (pending, reviewed, etc.)
4. **User Lookup**: Click usernames to investigate reporter or reported user
5. **Report Details**: Complete context including game ID and description

### Security Features
1. **Authentication**: Only logged-in users can submit reports
2. **Authorization**: Only staff can view reports
3. **Rate Limiting**: Prevents spam (5 reports per hour)
4. **Duplicate Prevention**: Can't report same user for same game twice
5. **Ban Checking**: Banned users cannot submit reports
6. **Self-Report Prevention**: Users cannot report themselves

## Database Schema

### Report Collection
```javascript
{
  reportedBy: {
    accountId: String (MongoDB _id),
    username: String
  },
  reportedUser: {
    accountId: String (MongoDB _id),
    username: String
  },
  reason: String (enum),
  description: String (max 500 chars),
  gameId: String,
  gameType: String (enum),
  status: String (enum, default: 'pending'),
  moderatorNotes: String,
  reviewedBy: {
    accountId: String (MongoDB _id),
    username: String
  },
  reviewedAt: Date,
  createdAt: Date
}
```

### Indexes
- `{ status: 1, createdAt: -1 }` - For filtering by status
- `{ 'reportedUser.accountId': 1, createdAt: -1 }` - For user history
- `{ 'reportedBy.accountId': 1, createdAt: -1 }` - For reporter history
- `{ gameId: 1 }` - For game context lookup

### Security Note
**Important:** User identification in reports uses MongoDB `_id` (accountId), NOT the `secret` token. The `secret` is used only for authenticating the reporter's session when submitting the report. Exposing secrets would be a massive security vulnerability.

## API Routes

### POST `/api/submitReport`
**Request Body:**
```json
{
  "secret": "reporter_session_secret",
  "reportedUserAccountId": "reported_user_mongodb_id",
  "reportedUsername": "username",
  "reason": "cheating",
  "description": "Detailed description...",
  "gameId": "game_id",
  "gameType": "ranked_duel"
}
```

**Security Note:** The `secret` is only used to authenticate the reporter. The `reportedUserAccountId` is the MongoDB `_id` of the reported user (as seen in game player data), NOT their secret token.

**Response:**
```json
{
  "message": "Report submitted successfully",
  "reportId": "mongodb_id"
}
```

### POST `/api/mod/getReports`
**Request Body:**
```json
{
  "secret": "staff_secret",
  "status": "pending",
  "limit": 50,
  "skip": 0
}
```

**Response:**
```json
{
  "reports": [...],
  "stats": {
    "total": 10,
    "pending": 5,
    "reviewed": 3,
    "dismissed": 1,
    "action_taken": 1
  },
  "pagination": {
    "total": 10,
    "limit": 50,
    "skip": 0,
    "hasMore": false
  }
}
```

## Future Enhancements (Not Implemented)
The following features were explicitly NOT implemented as per requirements:
- Taking action on reports (ban, warn, etc.)
- Updating report status
- Adding moderator notes
- Report resolution workflow

These can be added in a future update when the action mechanism is designed.

## Testing Checklist
- [ ] Report button appears after ranked duel games
- [ ] Report button only visible to logged-in users
- [ ] Report modal opens with correct user information
- [ ] Reason dropdown works correctly
- [ ] Description word counter works
- [ ] Form validation prevents invalid submissions
- [ ] Reports are saved to database
- [ ] Reports appear in mod dashboard
- [ ] Status filtering works
- [ ] Stats are calculated correctly
- [ ] Username click-through to user lookup works
- [ ] Rate limiting prevents spam
- [ ] Duplicate prevention works
- [ ] Mobile responsive design works

## Notes
- The report system only appears for ranked games (duel mode where `multiplayerState?.gameData?.public` is false)
- Reports are stored permanently unless manually deleted from database
- The system is designed to be extended with action mechanisms in the future

