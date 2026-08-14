// Master kill switch for the stamps economy. DEFAULTS ON. Production needs no
// STAMPS_ENABLED entry at all; only the literal string "false" turns it off.
//
// IT USED TO FAIL CLOSED (`=== 'true'`), and that polarity is what cost the
// entire stamps economy once already. An unset variable and an unread variable
// are indistinguishable to `=== 'true'`, so ws.js loading dotenv a few
// milliseconds too late produced the exact same value as a deliberate "stamps
// off": grantGameStamps returned on its first line for every game ever played,
// silently, with no error and no row in the database (see the header of
// ws/ws.js). Fail-closed only protects you when "off" is the safe state. Once
// the feature has shipped, "off" is a silent product outage, and the failure
// mode it was guarding against — a deploy carrying the code but not the config —
// is now the DEFAULT deploy, because the config no longer exists.
//
// The kill switch itself is kept, unlike the retired RATING_V2 rollout flag
// (deleted with the v1 engine after the Aug 2026 migration). The two were not
// symmetric:
//   - Flipping RATING_V2 off would have run v1 arithmetic over a v2 rating
//     scale — not a lever, a bug. The real revert is rollbackRatingV2.js.
//   - Flipping this off is safe at ANY instant: grantStamps() short-circuits
//     before it makes contact with the database, so nothing is minted, nothing
//     is half-written, and no ledger key is burned. That is a lever worth
//     having without a deploy.
//
// To kill stamps in an emergency: set STAMPS_ENABLED=false and restart. Balances
// and the ledger are untouched; grants simply stop.
//
// The value is trimmed and lower-cased before it is compared. An emergency
// switch is typed under pressure, and `FALSE`, `False` or a trailing space
// matching nothing — leaving the economy running while the operator believes
// they killed it — is a worse failure than any strictness buys back. "0" is
// accepted for the same reason.
const kill = String(process.env.STAMPS_ENABLED ?? '').trim().toLowerCase();
export const STAMPS_ENABLED = !(kill === 'false' || kill === '0');
