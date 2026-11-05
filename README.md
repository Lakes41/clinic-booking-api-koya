# Clinic Booking API (Koya Assessment)

Level 1 implementation using Node.js, Express and PostgreSQL on Neon. Also includes a patient booking webpage at `/`.

## Requirements

- Node.js 20+
- Neon PostgreSQL database

## Setup

1. `npm install`
2. In Neon, create a PostgreSQL project, open SQL Editor, and run `sql/001_init.sql`.
3. Copy `.env.example` to `.env` and replace `DATABASE_URL` with the Neon pooled connection string. Never commit `.env`.
4. `npm test`
5. `npm run dev`
6. Visit `http://localhost:3000`.

## Endpoints implemented in Level 1

| Method | Path | Description |
| --- | --- | --- |
| POST | `/reset` | Replace all slots and delete bookings |
| GET | `/slots` | List slots ordered by start; optional `?provider=...` |
| POST | `/bookings` | Create confirmed booking |
| GET | `/bookings/:id` | Retrieve booking by ID |

Run `npm run test:api` after server startup and Neon migration. **Warning:** the smoke test calls `/reset` and deletes all previous booking data.

## Next levels

Level 2: require X-API-Key on ALL API endpoints, harden validation. Level 3: cancel bookings. Level 4: idempotency keys and cursor pagination. Level 5: per-email rate limiting. Deployment: HTTPS on Render with Neon as persistent database.

For the assessment specification, see https://koyaacademy.com/assessment-api.
