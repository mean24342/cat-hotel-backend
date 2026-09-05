# Cat Hotel Backend Foundation

Express + PostgreSQL backend foundation covering: DB schema, connection
pooling, and the User Management + Reward Points REST modules.

## Setup

```bash
npm install
cp .env.example .env    # then edit DATABASE_URL for your local Postgres
npm run db:migrate      # applies sql/001..006 in order
npm run dev              # starts on http://localhost:4000
```

## Project structure

```
sql/                   Ordered SQL migrations (run by scripts/run-migrations.js)
src/
  config/               env loading + pg connection pool
  middleware/            validate (Zod), 404 handler, central error handler
  utils/                 ApiError, asyncHandler
  validators/            Zod schemas per resource
  services/              DB access + business logic (point integrity lives here)
  controllers/           thin HTTP layer over services
  routes/                Express routers
  app.js                 Express app assembly
  server.js               process entrypoint + graceful shutdown
```

## Endpoints implemented

**Users**
- `POST   /api/v1/users`
- `GET    /api/v1/users?page=&limit=&search=`
- `GET    /api/v1/users/:id`
- `PATCH  /api/v1/users/:id`
- `DELETE /api/v1/users/:id`

**Reward Points**
- `GET  /api/v1/points/:userId/balance`
- `GET  /api/v1/points/:userId/history?page=&limit=`
- `POST /api/v1/points/:userId/adjust`  — body: `{ points, entry_type, reference_type?, reference_id?, note? }`

## Point integrity, in short

`points_ledger` is append-only; `users.points_balance` is a denormalized
cache updated in the same DB transaction as every ledger insert, guarded by
`SELECT ... FOR UPDATE` (row lock) to prevent concurrent-request race
conditions, plus a non-negative-balance check enforced both in the service
layer and via a DB `CHECK` constraint. Full reasoning is documented inline
in `src/services/points.service.js`.

## LINE OA Integration (added)

**LINE Login (OAuth)**
- `GET  /api/v1/auth/line/login`     — redirect entry point; frontend just links here
- `GET  /api/v1/auth/line/callback`  — LINE redirects here with `code`/`state`; upserts the user and sets a session cookie
- `GET  /api/v1/auth/session`        — returns the current signed-in user (requires session cookie)
- `POST /api/v1/auth/logout`         — clears the session cookie

See `frontend-example/login.html` and `frontend-example/callback.html` for a minimal working frontend.

**Messaging API webhook**
- `POST /api/v1/line/webhook` — signature-verified LINE Messaging webhook. Mounted in `app.js` **before** `express.json()` — see the comment there, this ordering is required for signature verification to work.

**Chatbot command**
- Sending `Points` (any case) to the OA replies with the sender's current balance and tier, read live from PostgreSQL via `points.service.js`. Logic lives in `src/services/line-bot.service.js`.

## Required LINE channels & credentials

You need **two separate channels** under one Provider in the [LINE Developers Console](https://developers.line.biz/console/):

1. **LINE Login channel** → gives you `LINE_LOGIN_CHANNEL_ID` + `LINE_LOGIN_CHANNEL_SECRET`. Register your callback URL (`LINE_LOGIN_CALLBACK_URL`) in this channel's LINE Login settings — it must match exactly.
2. **Messaging API channel** (your Official Account) → gives you `LINE_MESSAGING_CHANNEL_SECRET` and a `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` (issue a long-lived token from the channel's Messaging API tab). Set the Webhook URL to `https://<your-domain>/api/v1/line/webhook` and turn "Use webhook" on. Turn off LINE's auto-reply/greeting messages if you want only your bot's replies.

For local development, LINE requires a public HTTPS URL for both the Login callback and the webhook — use a tunnel tool (e.g. `ngrok http 4000`) and point both URLs at the generated `https://...ngrok...` domain.

## Booking System

**Browsing (public, no sign-in required)**
- `GET  /api/v1/bookings/rooms` — list active rooms
- `GET  /api/v1/bookings/availability?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD` — "Get Available Slots": every active room with an `is_available` flag, checked against existing active bookings *and* `room_blockouts` (staff-set maintenance/unavailability windows)
- `POST /api/v1/bookings/quote` `{ room_id, check_in, check_out }` — price/availability preview before committing

**Authenticated**
- `POST   /api/v1/bookings` `{ pet_id, room_id, check_in, check_out, special_requests? }` — creates the booking
- `GET    /api/v1/bookings/me?page=&limit=&status=`
- `GET    /api/v1/bookings/:id`
- `PATCH  /api/v1/bookings/:id/cancel`

**Double-booking prevention (defense in depth):**
1. `SELECT ... FOR UPDATE` locks the target room row for the duration of the booking transaction, serializing concurrent attempts on the same room.
2. The `bookings` table's Postgres `EXCLUDE USING gist` constraint (see `sql/004`) makes an overlapping active booking on the same room structurally impossible to commit, regardless of what code path inserted it — this is the real guarantee; the row lock just makes the app-level error message reliable instead of racy.

**Pending points:** at booking creation, `booking.service.js` computes points via `config/points-rules.js` and stores them on the linked `purchases.points_earned` row — but does **not** touch `points_ledger`/`users.points_balance` yet. Crediting spendable points before payment would let someone book, bank points, and abandon the booking. Full reasoning is in the docstring above `createBooking()`.

## Payment System (Stripe)

- `POST /api/v1/payments/bookings/:bookingId/intent` — creates (or idempotently reuses) a Stripe PaymentIntent for a pending booking, `payment_method_types: ['card', 'promptpay']`. Returns `{ client_secret, publishable_key, amount, currency }`.
- `POST /api/v1/payments/webhook` — signature-verified Stripe webhook. Mounted in `app.js` **before** `express.json()`, using `express.raw({ type: 'application/json' })` instead — Stripe's signature check needs the exact raw body bytes.

See `frontend-example/checkout.html` for the Stripe.js Payment Element integration (card + PromptPay in one flow).

**Unlock points on payment (the "pending → active" conversion):** `payment.service.handleSuccessfulPayment()` runs one transaction that (1) marks the payment `paid` — guarded by `WHERE status = 'pending'`, which doubles as the idempotency check, since Stripe can and does deliver webhooks more than once — (2) confirms the booking, and (3) calls `points.service.adjustPoints()` **composed into the same transaction** (see the `externalClient` param added there) to credit `purchases.points_earned` into the real ledger/balance. All three happen atomically or none do.

We listen to both `charge.succeeded` (as requested) and `payment_intent.succeeded` (Stripe's recommended event, since PromptPay is an asynchronous/delayed-notification method) — both funnel into the same idempotent handler, so listening to both is safe.

**Required Stripe config:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (from your webhook endpoint's signing secret in the Stripe Dashboard, or printed by `stripe listen` locally), `STRIPE_PUBLISHABLE_KEY`. For local webhook testing: `stripe listen --forward-to localhost:4000/api/v1/payments/webhook`.

## Frontend (plain HTML/CSS/JS, no build step)

A full multi-page site lives in `frontend/`: home, LINE Login + callback, room-availability search & booking, Stripe checkout, payment-status polling, and a profile page (points balance, points history, booking history). All pages talk directly to the Express API via `fetch` (see `frontend/js/api.js`) — no framework, no bundler.

**Run it locally:**
```bash
# from the frontend/ folder, any static file server works, e.g.:
npx serve -l 3000 frontend
```
Then set `FRONTEND_URL=http://localhost:3000` in the backend's `.env` (required for CORS + the LINE Login redirect target) and open `http://localhost:3000/index.html`.

**Pages:**
| File | Purpose |
|---|---|
| `index.html` | Home — hero, feature highlights, room preview |
| `login.html` | LINE Login entry point |
| `auth-callback.html` | Lands here after LINE redirects back; confirms the session, then continues to wherever the user was headed |
| `booking.html` | Search availability → pick a room → pick/add a pet → confirm booking |
| `checkout.html` | Stripe Payment Element (card + PromptPay) |
| `booking-confirmation.html` | Polls the booking's real status after Stripe redirects back — payment confirmation only ever comes from the webhook, never from the redirect itself |
| `profile.html` | Points balance/tier, points history, booking history (with cancel) |

`js/api.js` and `js/nav.js` are shared by every page (fetch wrapper + injected header/footer/session-aware nav) — this is a static site, so there's no framework to share these automatically.

### There is no live/public link by default
This is source code — nothing is deployed anywhere until *you* deploy it. See **Deploy** below for how to get a real, shareable URL.

## Deploy

Three deploy files are included; pick whichever fits:

**A) Self-hosted, via Docker Compose** (`Dockerfile`, `docker-compose.yml`) — runs Postgres + the backend on your own server/VM:
```bash
docker compose up -d db
docker compose --profile tools run --rm migrate   # once, on a fresh database
docker compose up -d backend
```
Serve `frontend/` with any static file server/nginx alongside it.

**B) Managed hosting — Render + Netlify:**
1. Backend + database: in the Render dashboard, "New +" → "Blueprint", point it at this repo (`render.yaml` provisions the web service and a Postgres database together). Render will prompt you to fill in the `sync: false` secrets (LINE/Stripe keys, `JWT_SECRET`, `FRONTEND_URL`).
2. Frontend: deploy the `frontend/` folder to Netlify (`netlify.toml` is already there — no build command needed, it just publishes the folder as-is). Vercel or any static host works the same way.
3. **After both have real URLs**, wire them together:
   - Set the backend's `FRONTEND_URL` to the Netlify URL.
   - Edit `frontend/js/config.js` and change the fallback to the Render backend's URL (or inject `window.CATNAP_API_BASE` another way), then redeploy the frontend.
   - Update the LINE Login channel's registered callback URL to `https://<your-backend>/api/v1/auth/line/callback`, and the Messaging API channel's webhook URL to `https://<your-backend>/api/v1/line/webhook`.
   - Add a Stripe webhook endpoint pointing at `https://<your-backend>/api/v1/payments/webhook`, listening for `payment_intent.succeeded`, `charge.succeeded`, and `payment_intent.payment_failed`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
   - Run migrations against the production database once (Render's dashboard has a shell, or run `docker compose --profile tools run --rm migrate` pointed at the production `DATABASE_URL`).

Either way, Stripe keys stay in **test mode** until you've verified the full flow end-to-end.

## Not yet included (next steps)

- Rich menu / Flex Message replies for the LINE bot (currently plain text only).
- Refund handling and point clawback if a paid booking is later cancelled.
- A scheduled job to auto-expire long-unpaid `pending` bookings/PaymentIntents.
- Pet photo/vaccination-doc upload UI (backend column exists, no upload flow yet).
- Automated tests.
