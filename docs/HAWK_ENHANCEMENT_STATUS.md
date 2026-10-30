# Hawk enhancement execution ledger

Specification: `HAWK_ENHANCEMENT_PLAN.md` plus the user's phased request. Base: `e03a77c`. Work occurs on `codex/hawk-rebuild-hardening`; origin/main was `5877b46` at preflight. The existing rebuild is already committed and the working tree was clean.

Ruling: Execute the supplied, explicitly approved plan inline. User authorization includes migrations, phase commits, fast-forwarding main, and pushing origin/main. Never stage environment files or credentials.

Ruling: The document's aggregate 49 count is not a numbered 49-item specification. The following 49 acceptance checks decompose its concrete requirements and include AFK ownership and both voice-move handlers from the user's request. No requirements are discarded.

Ruling: Native Discord owners/admins/ManageGuild users receive guild-scoped owner/editor access, replacing the earlier viewer-only design. Global dashboard allowlisting remains separate from guild permission overrides.

## Phase 1 — Security

- [x] 01 User override reads/writes/deletes never modify global dashboard access.
- [x] 02 Discord owners receive owner access in their own guild.
- [x] 03 Administrator/ManageGuild receive editor access in their own guild.
- [x] 04 Unauthenticated health probes work.
- [x] 05 Unknown-peer OTP limits are account-scoped without a shared lockout bucket.
- [x] 06 Mutation origin matching requires exact scheme/hostname/port and rejects absent origins.
- [x] 07 OTP request requires CSRF.
- [x] 08 OTP verify requires CSRF.
- [x] 09 OTP issuance/storage/verification use SHA-256; schema supports hashes.

## Phase 2 — Bot and economy

- [x] 10 Reset cash and bank without deleting a balance record.
- [x] 11 Preserve all daily/work/income cooldown timestamps on reset.
- [x] 12 Work transaction locks balance before cooldown check.
- [x] 13 Slut transaction locks balance before cooldown check.
- [x] 14 Crime transaction locks balance before cooldown check.
- [x] 15 Rob transaction locks attacker/victim in deterministic order.
- [x] 16 Role income collection transaction locks before cooldown check.
- [x] 17 Welcome buttons require ManageGuild.
- [x] 18 Welcome modals require ManageGuild.
- [x] 19 PVC creation does not grant ManageChannels.
- [x] 20 PVC select handlers do not grant ManageChannels.
- [x] 21 Native Discord Administrator is recognized in bot authority.
- [x] 22 PVC operations fetch channels after cache eviction.
- [x] 23 Confession submission cooldown matches suggestions.
- [x] 24 Confession guild blacklist matches suggestions.
- [x] 25 Command cooldown is reserved before execution; input errors can release it.
- [x] 26 Purge role requires ManageRoles.
- [x] 27 AFK nickname restoration only touches a nickname set by the bot, once.

## Phase 3 — API and schema

- [x] 28 General configuration patches preserve omitted fields.
- [x] 29 PVC configuration patches preserve omitted fields.
- [x] 30 Suggestion/confession schema is ensured.
- [x] 31 Guild audit schema is ensured.
- [x] 32 All required store columns are ensured.
- [x] 33 Economy user IDs and numbers are validated and bounded.
- [x] 34 Public audit POST injection is removed.
- [x] 35 Test welcome suppresses mentions.

## Phase 4 — UI and theme

- [x] 36 Simulator selects an available role after asynchronous loading.
- [x] 37 PVC save includes auto_cleanup.
- [x] 38 Light theme defines every semantic RGB palette token.
- [x] 39 SaveBar success/error backgrounds retain precedence.
- [x] 40 Canvas surface/background colors use semantic tokens.
- [x] 41 Canvas node/edge/inspector colors respect theme tokens.
- [x] 42 Role arguments use RolePicker.
- [x] 43 Channel arguments use ChannelPicker.
- [x] 44 Protected API 401 redirects to session-expired login; OTP failures stay in login.
- [x] 45 Welcome simulator receives avatar placeholders unchanged.

## Phase 5 — Voice and games

- [x] 46 Mines inactivity settles winnings and removes the active session.
- [x] 47 Suggestion mutex wait is bounded to 5000 ms and released in finally.
- [x] 48 Confession mutex wait is bounded to 5000 ms and released in finally.
- [x] 49 Drag/remove member moves check destination permissions for bot and member.

## Verification and delivery

Each phase requires both TypeScript checks with zero errors and relevant regression tests before its Conventional Commit. Final delivery requires the complete bot/component suites, production build, secret scan of staged changes, independent branch review, fast-forward main, and a verified normal push to origin/main. Logs are retained under ignored `.rebuild/enhancement/`.

Phase 1 verified: bot/web TypeScript both exit 0; npm test 155/155; production build exit 0. Migration 034 applied to PostgreSQL; SHA-256 verified. Ruling: underlying permissions service must also stop synthesizing guild overrides from global dashboard grants. Session cookies remain Secure in production and SameSite Strict.

Phase 2 verified: both TypeScript checks exit 0; npm test 170/170; production build exit 0. Migration 035 applied. Live PostgreSQL eight-way work/slut/crime/rob/role-income races and cooldown-preserving resets pass. AFK records store ownership and exact original/assigned nicknames; restoration preserves manual nickname changes. Existing VM tests now use ES2022 to reflect real iterable semantics.

Phase 3 verified: both TypeScript checks exit 0; npm test 177/177; production build exit 0. Migration 036 applied. Fresh standalone dashboard schema creation verified inside a rolled-back PostgreSQL schema; partial updates and explicit clears verified against persisted rows. Balance mutation and audit transaction commit together. Money is capped at 1e12 per supplied document, below Number.MAX_SAFE_INTEGER. PVC cleanup storage added here because a UI-only payload change would still lose state.

Phase 4 verified: both TypeScript checks exit 0; root tests 177/177; React tests 11/11; production build exit 0. All 46 dark RGB tokens are explicitly defined in light mode. Text and node palette contrast on panel/card surfaces: dark minimum 6.18:1, light minimum 4.83:1. Separate accent text colors preserve the specified accent fill. Canvas uses actual guild roles/channels; API redirects exclude OTP/auth 401 responses.

Phase 5 verified: both TypeScript checks exit 0; npm test 182/182; production build exit 0. Initial and refreshed Mines timers share settlement/pruning, retain failed credits for retry, and reject forged initial cashout/invalid tiles. Panel waiters return busy after 5s without stealing the current lock. Destination access checked for moving member and bot. Full lint: 0 errors, 3 existing warnings. Fresh review underway before final delivery.

Final independent review corrections verified: native Administrator command authority retains Discord role hierarchy; actual Tailwind output contains themed canvas panel utilities. Existing PVC owner ManageChannels grants are repaired on reuse/startup with transient-failure retries. Auto-cleanup parks paid rentals and restores metadata/access rules via migration 037 and cascading foreign keys. Joins, cleanup, purchases and expiry/auto-pay scheduler operations serialize per owner and reread current records. Payment and rental credit commit atomically before Discord creation; failed attachment removes the new channel while retaining paid credit. A null JTC configuration never charges ordinary disconnects. Startup permission-repair failures cannot prevent the scheduler from running.

Final code gates: root suite 197/197, React suite 11/11, both TypeScript checks exit 0, lint 0 errors/0 warnings, production build exit 0, credential-pattern scan 0 matches and no tracked runtime env files. PostgreSQL rollback/commit and channel-ID/ACL-cascade regressions passed; migrations 034–037 applied. Independent reviewer found no remaining blockers. One overlapping build caused an intermediate generated-file collision; the subsequent single build completed successfully. Live connection verification and Git delivery follow below.

Live verification on 2026-10-06: production process started with node dist/start.js, gateway shard ready, public /api/health HTTP 200 with botReady=true. Discord API verifies bot access to both configured Main Server and Yolo (Test) guilds. Anonymous protected API returns 401; OTP mutation without Origin/CSRF returns 403. Live Socket.IO handshake is reachable and returns Unauthorized for anonymous subscriptions. Browser login renders, theme toggles, and light panel/sidebar RGB values are 255 255 255. No Discord messages or configuration mutations were sent during these checks. Authenticated dashboard telemetry was not exercised because no OTP-authenticated browser session was available.

Delivery: five phase commits plus the final independent-review correction commit are complete. Main is fast-forwarded to the final verification commit and pushed normally to origin/main; the final response confirms remote SHA equality and clean worktree after the push. Runtime env files and ignored verification logs are excluded from Git.
