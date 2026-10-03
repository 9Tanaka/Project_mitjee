# Authenticated Call Center WebSocket

Status (2 October 2026): implemented outer transport; actual loopback socket integration tests
use in-memory training and fake speech. Live Azure/Groq and authenticated browser+MySQL E2E
are separate and **NOT RUN** in this phase. See [verification](realtime-verification.md).

## Runtime and deployment boundary

`npm run dev` / `npm start` use `scripts/serve.mjs` and a custom persistent Node HTTP server.
Next.js serves the existing pages/HTTP routes; `ws` handles `/api/call/:sessionId/socket` upgrades
on the same origin. `npm run dev:http` / `npm run start:http` remain HTTP-only alternatives.
This is not a serverless WebSocket deployment. The process binds 127.0.0.1; configure PORT and
the canonical AUTH_URL consistently. An external deployment needs a trusted TLS reverse proxy
that preserves Host, Origin, cookies and WebSocket Upgrade. No deployment was performed.

The custom server creates an isolated application/Prisma pool rather than sharing class instances
with Next's bundled HTTP runtime. Training/account HTTP share their existing pool; socket calls use
a second lazy pool. Each is capped at eight connections (up to sixteen per process). They share
database rows, immutable templates, revision CAS and idempotency, not Auth.js request context.
Only primitive speech admission/rate maps are shared across both module graphs in the process.
Multiple processes would need distributed admission/rate controls and a reviewed deployment plan.

## Authentication and authority

Upgrade checks the exact configured Origin and Host, strict path, no query, existing Auth.js
encrypted cookie, and owned ACTIVE Call Center session. It does not accept a browser ownerId or
Bearer token. Cookie decoding uses official Auth.js `getToken`, including secure/chunked cookies
and expiry; `trainingUserId` must be a UUID. Each message rechecks auth and session binding.
Foreign and nonexistent sessions receive the same not-found response. Current JWT revocation
limitations remain unchanged; this phase does not add an auth bypass or independent identity store.

Transport schema accepts only:

| Client message | Payload |
|---|---|
| `resume` | No identity/variant fields; returns persisted public session |
| `text` | Existing message input: turnId, expectedRevision, text |
| `voice` | turnId, expectedRevision, audio/wav, bounded audioBase64 |

Server messages: `ready`, `processing`, `committed`, `voice`, `error`. `committed` always contains
an existing dialogue commit, not a speculative AI delta. Model output cannot directly control state,
assessment, critical failure or variant. Action buttons continue through existing HTTP domain paths.

## Bounds and recovery

- Maximum 20 sockets plus pending handshakes, two sockets per authenticated owner.
- Five-second upgrade deadline releases capacity even if an auth lookup never settles.
- 1,300,000 bytes per JSON frame; binary frames and compression are disabled. Voice sends a
  complete short recording, not unbounded chunks. Invalid/concurrent frames close the connection.
- One operation per socket; shared 12 messages/minute/owner rate and speech bounds from [Voice](voice.md).
- Outbound queued bytes plus next serialized frame cannot exceed 6 MiB; overflow terminates.
- Ping every 15 seconds; missing pong terminates at the next heartbeat. Ten-minute maximum lifetime.
- Frontend uses a six-second opening deadline and 70-second operation deadline. A new recording
  creates a new short-lived socket; it is not a permanent background reconnect loop.
- Transport failure can retry the identical voice request over HTTP. Text HTTP is always available.
  Reload/reconnect resumes persisted state; committed turns replay without provider regeneration.
- If a socket closes after dialogue has begun, a valid turn may still commit under the existing
  dialogue deadline/CAS. The next retry/resume retrieves it. Disconnect does not roll back history.

There is no audio persistence, arbitrary command channel, WebRTC, continuous streaming, voice
biometrics, or production moderation. Limits are demo assumptions, not verified performance targets.

## Tests

`npm run test:websocket` includes real loopback `ws` connections with fake speech and in-memory
domain services: rejected auth/ownership/category, strict schema, replay, stale revision, rate and
connection bounds, heartbeat, handshake timeout capacity, and retained HTTP/text behavior.
Cookie tests use real Auth.js token encoding/decoding independently of database credentials.
These tests do not claim a live database-backed browser sign-in/voice E2E pass.
