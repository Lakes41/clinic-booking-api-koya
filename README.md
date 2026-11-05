# Clinic Booking API (Koya Assessment)

Node.js + Express + Neon PostgreSQL. Levels 1 to 3 implemented, with a simple frontend at `/`.

## Local setup

1. Install Node.js 20 or later and run `npm install`.
2. In the Neon SQL Editor, execute `sql/001_init.sql` (only needed once).
3. Create `.env` with `DATABASE_URL`, `PORT=3000` and `API_KEY`. Use `openssl rand -hex 32` to generate a strong key. **Never commit `.env` or `.env.local`.**
4. Run `npm test`.
5. Start the API with `npm run dev` and open `http://localhost:3000`.
6. Enter your API key into the frontend form. The key is kept in memory in the browser and is not embedded in static JavaScript.
7. From another terminal run `npm run test:api`. **WARNING**: It resets all slots and bookings; use only against a development database.

## Levels 1–3 endpoints

All API endpoints require the HTTP header `X-API-Key: <your API_KEY>`.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/reset` | Replace all slots and delete existing bookings, even when slots are in the past |
| GET | `/slots` | List slots sorted by start, optional exact-match `?provider=...` |
| POST | `/bookings` | Book an upcoming, unreserved slot; validate details |
| GET | `/bookings/:id` | Retrieve one booking by ID |
| DELETE | `/bookings/:id` | Cancel a confirmed booking (200); missing booking (404); already cancelled (409) |

A missing or incorrect API key returns HTTP `401` and `{ "error": "..." }`. Invalid booking fields and past slots return `400`; unknown slots return `404`; duplicate confirmed bookings return `409`. The PostgreSQL partial unique index `one_confirmed_booking_per_slot` makes simultaneous booking requests safe. A cancellation changes the stored status to `cancelled`, releases the slot for rebooking, and preserves the booking history.

## Next steps

Level 4: idempotency and cursor pagination. Level 5: per-email rate limiting. Deploy to HTTPS on Render when ready.

Specification: https://koyaacademy.com/assessment-api

## Level 3 verification

`npm run test:api` checks: successful cancellation (200), the cancelled booking still retrievable, duplicate cancellation (409), missing booking (404), the slot becoming available, successful rebooking, and **12 simultaneous booking attempts** for one slot. Exactly one must return 201 and the other 11 must return 409.

Run the existing `sql/001_init.sql` in Neon if you have not already done so; it defines the required partial unique index. No new database migration is needed for this level if Level 1 was set up correctly.

**Warning:** the smoke test calls `/reset` twice and deletes existing development bookings. Never run it on submitted or production data.
