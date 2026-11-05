# Clinic Booking API (Koya Assessment)

A Node.js and Express booking API, a simple HTML/CSS/JavaScript interface, and persistent PostgreSQL storage on Neon. **Levels 1 to 4 are implemented**.

## Setup and migration

1. Clone the repository and run `npm install` (Node.js 20+).
2. If this is a fresh database, execute `sql/001_init.sql` in the Neon SQL Editor.
3. **New for Level 4:** execute `sql/002_idempotency.sql` in the *same* Neon database. It creates the `idempotency_keys` table used for reliable retry handling.
4. Create `.env` from `.env.example` with your `DATABASE_URL`, `API_KEY` and `PORT=3000`. Keep existing secrets private. `.env` and `.env.local` are gitignored.
5. Run `npm test`; start with `npm run dev`; open `http://localhost:3000`; enter your API key in the frontend.
6. In a separate terminal run `npm run test:api`. **CAUTION: this script calls `/reset` multiple times and deletes all development bookings and slots. Never run it against a live/submitted system.**

## Assessment endpoints

Every API request requires `X-API-Key: <your API_KEY>`.

| Method | Path | Behaviour |
| --- | --- | --- |
| POST | `/reset` | Replace all slots, including past slots; clear bookings and idempotency records |
| GET | `/slots?provider=...` | All slots in ascending `start` order; optional case-sensitive provider filter |
| POST | `/bookings` | Book a future slot; optionally pass `Idempotency-Key` |
| GET | `/bookings/:id` | Look up one booking |
| DELETE | `/bookings/:id` | Cancel; makes its slot available for a new confirmed booking |
| GET | `/bookings?email=...&limit=10&cursor=...` | Oldest-first booking history for an email, including cancelled bookings |

### Level 4 idempotency

The optional `Idempotency-Key` header is persisted in PostgreSQL. For the **same key and JSON body**, the API returns the **original HTTP status and JSON response** without creating another booking, even after a cancellation or server restart. The same key with a different JSON body returns **HTTP 422** with `{ "error": "..." }`. Different JSON field ordering counts as the same body. Validation errors and conflicts are also persisted and replayed for the same key. Omitting the header retains ordinary booking behaviour.

The implementation uses the primary key on `idempotency_keys` and a row lock inside the same transaction as the booking. Two simultaneous requests using the same key are serialised by PostgreSQL, not JavaScript process memory. Failed transactions roll back the idempotency record, making a safe retry possible.

### Level 4 pagination

`GET /bookings` requires `email` (case-insensitive matching); `limit` defaults to 10 and must be an integer from 1 to 50. The optional `cursor` is the opaque `next_cursor` value returned by the preceding page. Responses look like:

```json
{
  "bookings": [{
    "id": "...", "slot_id": "s1", "name": "Ada Obi",
    "email": "ada@example.com", "status": "confirmed",
    "created_at": "2026-11-05T09:34:14.247Z"
  }],
  "next_cursor": null
}
```

The cursor combines a microsecond-precision PostgreSQL creation timestamp and a booking ID, so pages do not skip or repeat entries with the same timestamp. The last page returns `"next_cursor": null`. Invalid limits and cursors return HTTP 400.

### Level 3 cancellation and concurrency

A partial unique PostgreSQL index permits **no more than one confirmed booking per slot**, even under simultaneous requests. Cancelling a booking changes its status to `cancelled`, preserves its creation time, and makes the slot available again. A repeated cancellation returns 409. Missing bookings return 404.

### Level 2 validation and authentication

An incorrect or missing `X-API-Key` returns 401. Invalid booking input and a slot already started return 400; unknown slots return 404; confirmed booking conflicts return 409. Emails are stored in lower case, and names/emails are trimmed.

## Verification

```bash
npm test
npm run dev
# In another terminal, only for a disposable development database:
npm run test:api
```

The integration script covers Level 1 through Level 4, including: 12 concurrent bookings for one slot (only one 201); 8 simultaneous retries with one idempotency key (all 201 with the same ID); replaying responses after cancellation; invalid body reuse (422); and multi-page retrieval without duplicates.

## Deployment

Use Render for the web service with the included `render.yaml`; set **both `DATABASE_URL` and `API_KEY`** as Render environment variables. Use your persistent Neon PostgreSQL database. Run SQL migrations before deploying, then test the production HTTPS endpoints without executing the destructive smoke test. Do not commit or expose credentials.

## Next step

Level 5: at most five booking attempts per email in a rolling 60-second period, including failed attempts; the sixth returns 429 with a whole-second `Retry-After` header. Store counts in the database for consistency across deployments.

Specification: https://koyaacademy.com/assessment-api
