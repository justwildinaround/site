# Detail’N Co. — Site

This repo is a static site designed to be hosted on **Cloudflare Pages** (it already contains `/functions/api/*` endpoints).

## Booking system (approve / reject by email)

This repo now includes a booking page + backend that works like:

1. Customer submits a booking request on `/booking.html`
2. The requested slot is **soft-held for 45 minutes**
3. The business receives an email with **Approve** + **Reject** buttons
4. Clicking a button updates the booking status + emails the customer 
5. Approved bookings (and non-expired pending holds) block availability on the site

### Working hours encoded
- **Weekdays:** 4:30pm–10:00pm
- **Saturday/Sunday:** 5:00am–10:00pm
- Availability grid is in **30-minute** increments, and duration is variable.

---

## Setup (Cloudflare Pages + D1)

### 1) Create a D1 database
In Cloudflare Dashboard:
- Workers & Pages → D1 → Create database (example name: `detailnco-bookings`)

Run the schema:
- Open the DB → Console / Queries → paste `schema.sql` and run it

### 2) Bind the DB to your Pages project
Cloudflare Pages → your project → Settings → Functions → **D1 database bindings**
- Binding name: `DB`
- Database: your D1 db

### 3) Environment variables
Cloudflare Pages → Settings → Environment Variables:

- `BUSINESS_EMAIL` = `detailnco2@gmail.com` (or your business inbox)
- `PUBLIC_BASE_URL` = `https://YOURDOMAIN.COM` (so approve/reject links work on prod)
- `MAIL_FROM` = `bookings@YOURDOMAIN.COM` (recommended)

> Note: The code uses **MailChannels** to send email. For best deliverability,
> use a domain email (`MAIL_FROM`) and add proper SPF/DKIM at your DNS provider.

### 4) Deploy
Push to GitHub → Cloudflare Pages builds automatically.

---

## Files added
- `booking.html` — booking request UI
- `booking.js` — availability + submit logic
- `functions/api/bookings/*` — backend endpoints
  - `availability.js`
  - `create.js`
  - `approve.js`
  - `reject.js`
- `schema.sql` — D1 schema

---

## Local dev (optional)
If you use Wrangler locally, you can run Pages dev and bind D1, but the quickest path is deploying on Cloudflare Pages and testing on a preview URL.
