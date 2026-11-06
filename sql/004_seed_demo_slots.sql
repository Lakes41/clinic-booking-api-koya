-- Koya Clinic Booking API: non-destructive demonstration appointment slots.
-- Run in the Neon SQL Editor for the same database used by Render.
-- This is an INSERT, NOT /reset: existing bookings and slots are retained.
-- Creates up to 120 slots: 3 fictional providers x 2 appointments x 20 weekdays.
-- Appointment times are local to Lagos/Abuja (Africa/Lagos, UTC+01:00).
-- Safe to rerun: unique IDs and ON CONFLICT DO NOTHING prevent duplicates.

BEGIN;

WITH workdays AS (
  SELECT d::date AS appointment_day
  FROM generate_series(
    ((now() AT TIME ZONE 'Africa/Lagos')::date + 1)::timestamp,
    ((now() AT TIME ZONE 'Africa/Lagos')::date + 35)::timestamp,
    INTERVAL '1 day'
  ) AS days(d)
  WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
  ORDER BY d
  LIMIT 20
),
timetable(provider_code, provider, appointment_time) AS (
  VALUES
    ('amina', 'Dr Amina Yusuf', TIME '09:00'),
    ('amina', 'Dr Amina Yusuf', TIME '13:30'),
    ('daniel', 'Dr Daniel Okafor', TIME '10:00'),
    ('daniel', 'Dr Daniel Okafor', TIME '14:30'),
    ('grace', 'Dr Grace Adeyemi', TIME '11:00'),
    ('grace', 'Dr Grace Adeyemi', TIME '15:30')
)
INSERT INTO slots (id, provider, start_time, end_time)
SELECT
  'demo-' || to_char(w.appointment_day, 'YYYYMMDD')
          || '-' || t.provider_code
          || '-' || to_char(t.appointment_time, 'HH24MI'),
  t.provider,
  ((w.appointment_day + t.appointment_time) AT TIME ZONE 'Africa/Lagos'),
  ((w.appointment_day + t.appointment_time) AT TIME ZONE 'Africa/Lagos')
    + INTERVAL '30 minutes'
FROM workdays w
CROSS JOIN timetable t
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verify newly inserted demo slots:
SELECT provider,
       COUNT(*) AS total_slots,
       MIN(start_time AT TIME ZONE 'Africa/Lagos') AS first_local_slot,
       MAX(start_time AT TIME ZONE 'Africa/Lagos') AS last_local_slot
FROM slots
WHERE id LIKE 'demo-%'
GROUP BY provider
ORDER BY provider;

-- Optional cleanup, NOT executed:
-- To remove older smoke-test slots ONLY if they have never had a booking,
-- run the following separately after verifying the result of the INSERT.
-- DELETE FROM slots s
-- WHERE s.id LIKE 'smoke-%'
--   AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id);
-- Booked or historically booked slots are deliberately preserved.
