# Provider research: PostgreSQL and ElevenLabs

**Research snapshot:** 2026-10-22. Official documentation checked on this date. This is evidence and implementation guidance for ASTRA, not an architecture or provider-selection decision.

## Findings for the implementation owner

- The repository is currently Prisma ORM 7.10.0 on MySQL/MariaDB with `@prisma/adapter-mariadb`; no Supabase project or credentials were inspected. A PostgreSQL target requires a provider/schema/migration and adapter transition, not just a connection-string swap.
- Prisma 7 PostgreSQL runtime uses `@prisma/adapter-pg` and `PrismaPg`; put the CLI/migration URL in `prisma.config.ts` and use a separate direct URL for migrations. Select the runtime endpoint only after confirming the actual deployment/network shape.
- ElevenLabs officially lists Thai (`th`) for Eleven v4 and v3. Its synchronous TTS endpoint returns audio bytes; PCM S16LE at 16 kHz is supported and listed for Free, Starter, and Creator plans. The local app requires a RIFF/WAVE container, so raw PCM must be wrapped (or a direct WAV response independently verified) before returning it.
- Make the ElevenLabs model id required/configurable with no guessed default. The API endpoint defaults to `eleven_multilingual_v2`, whose listed 29 languages do not include Thai; `language_code` is ignored if the chosen model does not support it.

## Local contracts and call sites

The current voice wire contract is strict: `audio/wav`, canonical RIFF/WAVE PCM, mono, 16,000 Hz, signed 16-bit little-endian. The browser microphone creates that format. `src/speech/contracts.ts` sets a 30-second input limit (`MAX_AUDIO_BYTES` 960,044 bytes including the canonical header) and 10-second speech timeout. `src/application/voice-service.ts` passes abort signals to STT/TTS and caps synthesized audio at 4 MiB; a TTS failure after dialogue commit returns text with audio marked unavailable.

Current voice integration points:

- Provider factory: `src/server/voice-runtime.ts` calls `createSpeechProvider()` and currently injects one Azure object as both STT and TTS. Azure implementation is `src/providers/azure-speech.ts`.
- Contracts and orchestration: `src/speech/contracts.ts`, `src/application/voice-service.ts`.
- HTTP and WebSocket voice paths: `src/http/voice-handler.ts`, `src/http/speech-handler.ts`, `src/realtime/call-server.ts`, wired by `src/server/serve.ts`.
- Public response MIME and base64 projection: `src/public-api/voice.ts`; browser playback: `src/frontend/voice.tsx`; microphone WAV encoding: `src/frontend/microphone.ts`.

This inventory describes the current seam only; it does not prescribe how STT and TTS should be redesigned.

## Prisma 7 and Supabase connection guidance

Prisma 7 PostgreSQL uses `provider = "postgresql"`, installs `@prisma/adapter-pg`, and constructs `new PrismaPg({ connectionString })` for `new PrismaClient({ adapter })`. Prisma's v7 docs show a pooled URL for the runtime client and a direct URL read by `prisma.config.ts` for CLI and migration commands. Supabase independently recommends its direct endpoint for migrations, `pg_dump`, backups, restore, and replication because these tools require a stable single session.

| Supabase connection | Documented role | Important constraints |
| --- | --- | --- |
| Direct, port 5432 | Migrations and persistent backend when network supports it | IPv6 by default; IPv4 requires the add-on. |
| Shared session pooler, port 5432 | Persistent backend on IPv4-only network; prepared-statement-capable alternative | Use host/user copied from the project Connect dialog. |
| Shared transaction pooler, port 6543 | Serverless/edge functions with many short-lived connections | No prepared statements, query pipelining, or session state across transactions. Copy host/user from Connect; do not derive the pooler hostname. |

The repository has both `vercel.json` and a custom Node HTTP/WebSocket entry point (`scripts/serve.mjs`, `src/server/serve.ts`). This is not enough to determine whether production uses persistent Node or Vercel functions. Confirm that deployment/runtime shape and network IP support before selecting a runtime URL. Supabase’s serverless guidance also recommends a small per-instance client pool; Prisma 7 `pg` adapter defaults are `max: 10`, `connectionTimeoutMillis: 0` (no timeout), `idleTimeoutMillis: 10s`, and no connection lifetime limit. These differ from the current MariaDB adapter configuration (pool limit 8, 10-second connect and 15-second acquire timeouts); explicitly tune rather than assuming defaults are equivalent.

### Prepared statements: version-specific nuance

Supabase’s Prisma troubleshooting guide says to add `pgbouncer=true` for its transaction pooler. Prisma’s v7 PgBouncer guide likewise documents the flag for Supavisor, but its current page specifically warns against the flag with PgBouncer 1.21+ and directs migrations to a direct URL. A Prisma-hosted article dated 2026-10-19 says Prisma ORM 7 with `@prisma/adapter-pg` uses unnamed statements by default, and names/caches statements only when `statementNameGenerator` is configured. Therefore do not apply a generic `pgbouncer=true` rule without checking the exact adapter, connection string, and pooler behavior. If transaction pooling is selected, keep statement naming unset unless needed and verify the chosen configuration against the deployed Supavisor endpoint; migrations still use direct.

### TLS

Supabase distinguishes encryption from identity verification: PostgreSQL `sslmode=require` encrypts but does not verify the CA or hostname. `verify-full` verifies both and is the strongest documented mode; Supabase says to download the project CA certificate and configure trust. The current repository already requires a trusted CA and `rejectUnauthorized: true` for remote MariaDB connections. Preserve server identity verification in the PostgreSQL adapter path; do not downgrade to encryption-only for convenience. When configuring `pg` with an explicit SSL object, avoid conflicting connection-string SSL parameters that may replace that object.

### SQL semantics to preserve or deliberately change

- Current Prisma `DateTime` fields have no native-type annotation. MySQL migrations use `DATETIME(3)`, and application values are converted through JS `Date`/epoch milliseconds; the current adapter sets UTC. Prisma’s PostgreSQL default `DateTime` maps to `timestamp(3)` without time zone. PostgreSQL `timestamp` does not itself store an instant/time zone, while `timestamptz` stores an instant and renders using the session time zone. Choose and test an explicit UTC/instant convention for columns, `now()` defaults, and imports; do not silently rely on differing DB/session defaults.
- The MySQL migrations use more than one collation: `utf8mb4_0900_bin` and `utf8mb4_unicode_ci`. They differ in case/accent behavior and trailing-space comparison; PostgreSQL’s database/column collation and any ICU or functional-index choices can change equality, sorting, and uniqueness. Inventory affected string keys and define target comparisons intentionally.
- Training persistence uses an optimistic compare-and-swap update (`WHERE id AND revision`, increment revision, require exactly one row) inside a `ReadCommitted` transaction; child writes are in the same transaction. Quiz persistence also uses conditional revision/status updates and creates its receipt in the transaction; aggregate reads use `RepeatableRead`. PostgreSQL `READ COMMITTED` rechecks an update predicate after waiting on a concurrent row update, so the CAS pattern can retain one-winner behavior, but validate affected-row counts, conflicts/retries, idempotency receipts, constraints, and rollback behavior in migration acceptance tests. Preserve the explicit quiz read isolation where required.

## ElevenLabs TTS contract fit

The documented one-shot endpoint is `POST https://api.elevenlabs.io/v1/text-to-speech/:voice_id`; it accepts JSON containing `text` and optional `model_id`, returns generated audio, and selects output with the `output_format` query parameter. The documented format naming is codec/sample-rate/bitrate. Authentication uses `xi-api-key`; keep the credential server-side and never return it or upstream error bodies in client errors/logs. The request can be ordinary non-streaming fetch; propagate the existing `AbortSignal` to fetch so the 10-second app deadline and disconnect cancellation can abort provider work. Treat non-2xx responses, malformed bytes, and abort/timeout as the app’s generic speech-unavailable path.

Current official model docs list Thai (`th`) for Eleven v4 and v3; v4 is the current flagship with a 10,000-character limit, v3 lists 5,000. The endpoint reference defaults `model_id` to `eleven_multilingual_v2`, but the documented supported-language list for that 29-language model excludes Thai and the endpoint states that unsupported `language_code` values are ignored. Set a model id from configuration and fail closed if missing; ASTRA should verify actual workspace/voice access and Thai quality before selecting the configured value.

For this endpoint family, the official API capability docs describe PCM as signed 16-bit little-endian and list 8, 16, 22.05, and 24 kHz PCM as available on Free, Starter, and Creator plans; 44.1 kHz PCM is Pro/Scale/Business. The official OpenAPI schema for the standard `POST /v1/text-to-speech/{voice_id}` endpoint now confirms the exact `output_format` enum value `pcm_16000` (and also lists `wav_16000`). The approved implementation choice remains `pcm_16000` plus backend WAV wrapping; the listed WAV option does not change that decision. The enum/schema evidence verifies the request value, but it does not verify access for a particular ElevenLabs account, voice, or model, which remain live gates. Validate even byte length and the 4 MiB cap while reading the PCM response, then create a canonical 44-byte RIFF/WAVE header for mono 16 kHz PCM16 (32,000 bytes/second) and return it as `audio/wav`. The provider docs state no response-byte limit; the local 4 MiB limit remains the applicable cap.

## Official references (checked 2026-10-22)

- [Prisma ORM 7 PostgreSQL](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql) — PostgreSQL provider, `@prisma/adapter-pg`, direct CLI versus pooled runtime example.
- [Prisma ORM 7 PgBouncer configuration](https://docs.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer) and [connection-pool defaults](https://docs.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool).
- [Supabase database connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [Prisma troubleshooting](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting), and [SSL enforcement / verification modes](https://supabase.com/docs/guides/platform/ssl-enforcement).
- [Prisma prepared-statement article (2026-10-19)](https://www.prisma.io/postgres/prepared-statement-already-exists) — adapter-pg statement naming note.
- [ElevenLabs TTS API reference](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [official OpenAPI schema](https://api.elevenlabs.io/openapi.json) (standard TTS endpoint enum includes `pcm_16000` and `wav_16000`), [model language and character-limit overview](https://elevenlabs.io/docs/overview/models), [API audio-format support](https://elevenlabs.io/docs/help-center/troubleshooting/what-audio-formats-do-you-support), and [TTS capability guide](https://elevenlabs.io/docs/overview/capabilities/text-to-speech).
- [ElevenLabs language support](https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support). For clarity, the [Text-to-Dialogue WAV changelog](https://elevenlabs.io/docs/changelog/2026/2/2) is a different endpoint and is not evidence that standard text-to-speech accepts `wav_16000`.
