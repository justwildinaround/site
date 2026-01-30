-- Cloudflare D1 schema for bookings

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                 -- YYYY-MM-DD (local Ottawa date)
  start_time TEXT NOT NULL,           -- HH:MM (local)
  duration_min INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,

  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','expired')),

  expires_at_ms INTEGER,              -- only for pending holds

  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,

  location TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  vehicle_size TEXT,
  package TEXT,
  addons TEXT,
  notes TEXT,

  approve_token TEXT,
  reject_token TEXT,
  pay_token TEXT,

  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_tokens ON bookings(approve_token, reject_token, pay_token);
