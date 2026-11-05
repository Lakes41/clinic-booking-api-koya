# Clinic Booking API | Koya Assessment

A Node.js/Express REST API, a vanilla JavaScript appointment booking page and durable Neon PostgreSQL storage. **Assessment Levels 1 to 5 are implemented.**

## Local setup

1. Use Node.js 20+ and run `npm install`.
2. In the **same Neon database**, run SQL files in order using Neon SQL Editor:
   - `sql/001_init.sql`: slots and bookings, with the unique confirmed-booking index (already run for Level 1).
   - `sql/002_idempotency.sql`: idempotency key storage (already run for Level 4).
   - **NEW** `sql/003_rate_limit.sql`: booking attempts and `retry_after_seconds` column.
   You **do not** need to rerun 001 and 002 if you have already applied them.
3. Keep your existing `.env` file (never commit it):
   ```dotenv
   DATABASE_URL=postgresql://YOUR_NEON_CONNECTION_STRING
   API_KEY=YOUR_LONG_SECRET_KEY
   PORT=3000
   ```
   `.env.local` is also ignored by Git, but the app loads `.env` by default.
4. Run `npm test` for unit tests.
5. Run `npm run dev` and open `http://localhost:3000`.
6. In another terminal, run `npm run test:api` to test the actual Neon-backed API.

**CAUTION:** `test:api` calls `POST /reset` repeatedly and **deletes all bookings and slots**. Only run it on a disposable development database. Never run it on the submitted production instance.

## Endpoint contract

All API requests require `X-API-Key: <your API_KEY>`; missing/wrong keys return `401` and `{"error":"..."}`.

| Method | Endpoint | Behaviour |
| --- | --- | --- |
| POST | `/reset` | Replace all slots, clear bookings, idempotency records and rate-limit test state |
| GET | `/slots?provider=...` | All slots oldest first; optional exact-case provider filter |
| POST | `/bookings` | Create booking; optional `Idempotency-Key` request header |
| GET | `/bookings/:id` | Return a booking or 404 |
| DELETE | `/bookings/:id` | Cancel a confirmed booking or return 404/409 |
| GET | `/bookings?email=...&limit=10&cursor=...` | Oldest-first paginated booking history |

Booking responses are JSON with `id`, `slot_id`, `name`, `email`, `status`, `created_at`. Slot responses include `id`, `provider`, `start`, `end`, `available`. All error bodies use `{"error":"..."}`.

### Level 5: Rate limiting

- Every **new** `POST /bookings` operation containing a nonempty string email is charged to that normalised email (`trim().toLowerCase()`) before booking validation. This includes invalid emails, invalid booking fields, nonexistent slots, already-started slots and slot conflicts.
- At most five attempts are processed for the same email in a rolling 60-second period. The next returns HTTP `429`, with `{"error":"Too many booking attempts for this email"}` and a `Retry-After` response header containing a positive integer number of seconds until a new attempt is permitted.
- Different email addresses have independent allowances. Requests with no usable email cannot be assigned to a particular email's allowance; they still return the normal validation error.
- The rate-limit check and insertion run in the same PostgreSQL transaction as a new booking attempt. A database advisory transaction lock serialises requests **by email**, so seven simultaneous new attempts cannot slip through a five-attempt limit, including across multiple server instances.
- A completed `Idempotency-Key` **replay** is not a new booking operation. It returns the same original status, JSON body and (for cached 429 responses) `Retry-After` header without charging another attempt. A changed body for an existing key returns 422.
- Rate-limit counters are stored in PostgreSQL and survive process restarts. Expired rows for an email are pruned when that email is used again.

### Levels 1 through 4

- `/reset` includes past slots and deletes existing bookings.
- Booking checks missing/invalid details (400), missing slot (404) and a slot already started (400). Names and emails are trimmed; emails are stored in lower case.
- A PostgreSQL partial unique index permits only one **confirmed** booking per slot. Atomic cancellation frees the slot while keeping the cancelled record.
- Optional `Idempotency-Key`: same key/body replays original response (including booking ID), even after cancellation or concurrent requests; same key with a different body returns 422. Keys are stored transactionally in PostgreSQL.
- Booking history is filtered by case-insensitive email and sorted oldest first. `limit` defaults to 10, accepts integers from 1 through 50. Use returned `next_cursor` as the next request's `cursor`. The last page has `next_cursor: null`.

## Local verification

```bash
npm test
npm run dev
# In a second terminal connected to your disposable development DB:
npm run test:api
```

The smoke test covers Levels 1–5, including 12 bookings racing for a single slot (only one 201); eight concurrent retries with the same idempotency key (all same ID); cursor pagination; five failed booking attempts followed by a 429; other-email independence; and seven simultaneous attempts from a single email (five 201, two 429).

## Deploy to Render with Neon

1. Push the repository to GitHub; verify that `.env` and `.env.local` are **not** tracked.
2. In Neon, run `sql/003_rate_limit.sql` in the correct database and branch. Existing 001/002 migrations can be left as is.
3. In Render, use **New > Web Service**, connect the GitHub repository `clinic-booking-api-koya`, select the Free instance (if available), set build command `npm install`, start command `npm start`. The included `render.yaml` is an optional Blueprint configuration.
4. Under Render **Environment**, add secret variables `DATABASE_URL` (your Neon PostgreSQL connection string) and `API_KEY` (same key you use locally). Do not add quotation marks. `NODE_ENV=production` is optional.
5. Deploy. Open your Render `https://...onrender.com/` homepage, enter your API key, and verify it lists slots. Use `curl -i https://YOUR-RENDER-URL/slots` **without** the key to verify HTTP 401; then test with the key in an HTTP header, without placing the key in a URL.
6. After submission, leave the deployment unchanged and avoid `POST /reset` on the public service. Free Render services can spin down after inactivity; Neon holds persistent data separately.

Spec: <https://koyaacademy.com/assessment-api>
