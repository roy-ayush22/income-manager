# Income Manager API

A simple Express + PostgreSQL (via Prisma) API for tracking personal income, with cookie-based session authentication.

## Tech Stack

- **Express** — HTTP server
- **Prisma + PostgreSQL** — database access
- **express-session + connect-pg-simple** — server-side session storage (sessions persisted in Postgres)
- **argon2** — password hashing
- **zod** — request body validation

## Prerequisites

- Node.js and [pnpm](https://pnpm.io)
- A running PostgreSQL instance
- [Postman](https://www.postman.com/downloads/) (desktop or web app)

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a `.env` file in the project root with:

   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/income_manager"
   SESSION_SECRET="some-long-random-string"
   NODE_ENV="development"
   ```

   - `DATABASE_URL` — your Postgres connection string.
   - `SESSION_SECRET` — used to sign the session ID cookie. Use a long random value.
   - `NODE_ENV` — keep as `development` locally. In production this must be `production` so cookies are marked `Secure` (HTTPS only).

3. Run Prisma migrations to create the schema (this also lets `connect-pg-simple` create its own `session` table on first run via `createTableIfMissing: true`):

   ```bash
   npx prisma migrate dev
   ```

4. Start the dev server:

   ```bash
   pnpm dev
   ```

   The API will be available at `http://localhost:3000`.

## Authentication model

This API uses **cookie-based sessions**, not JWTs or bearer tokens:

- On successful `/signin`, the server creates a session record in Postgres (in the `session` table) and sends back a `Set-Cookie: connect.sid=...` header.
- Every subsequent request to a protected route must **send that cookie back** for the server to recognize you as logged in.
- `/signout` destroys the session server-side and clears the cookie — this is a real, immediate logout (unlike stateless JWTs).

**In Postman, this means you must let Postman manage cookies automatically** — see the setup note below before testing.

## Postman Setup

1. Create a new Postman **Collection** called `Income Manager`.
2. Add a Collection-level variable (or Postman Environment variable):
   - `baseUrl` = `http://localhost:3000`
3. **Enable cookie handling:** Postman automatically stores and resends cookies per domain via its built-in **Cookie Jar**, as long as you're hitting the same `baseUrl` (`localhost:3000`) across requests in the same Postman session. You don't need to manually copy the cookie between requests — just:
   - Make sure "Automatically follow redirects" and cookie jar are on default settings (they are, out of the box).
   - Run requests **in order** within the same Postman session/tab so the session cookie persists.
   - You can inspect stored cookies anytime via Postman's **Cookies** link (below the Send button) → look for `connect.sid` under `localhost`.

If you ever want to verify what's stored: click **Cookies** in Postman → `localhost` → you should see a `connect.sid` cookie appear after a successful `/signin`.

## Endpoints

### 1. Sign up — `POST /signup`

Creates a new user account. No authentication required.

- **URL:** `{{baseUrl}}/signup`
- **Method:** `POST`
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "Passw0rd!"
  }
  ```

**Password rules** (enforced by zod): 6–24 characters, at least one uppercase letter, one lowercase letter, and one special character from `!@#$%^&*()<>?:`.

**Success — `201 Created`:**

```json
{ "message": "user created successfully" }
```

**Errors:**

- `400 Bad Request` — validation failed:
  ```json
  { "error": ["password must contain a upper case letter"] }
  ```
- `401 Unauthorized` — email already registered:
  ```json
  { "error": "user already exists, please signin" }
  ```

---

### 2. Sign in — `POST /signin`

Authenticates a user and starts a session. Sets the `connect.sid` cookie in the response.

- **URL:** `{{baseUrl}}/signin`
- **Method:** `POST`
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**
  ```json
  {
    "email": "jane@example.com",
    "password": "Passw0rd!"
  }
  ```

**Success — `200 OK`:**

```json
{ "message": "signed in successfully" }
```

Check the **Cookies** panel in Postman — you should now see `connect.sid` set for `localhost`. This cookie will automatically be attached to all future requests to `{{baseUrl}}`.

**Errors:**

- `400 Bad Request` — validation failed (bad email format, password too short, etc.)
- `404 Not Found`:
  ```json
  { "error": "user not found, please signup" }
  ```
- `401 Unauthorized`:
  ```json
  { "error": "invalid password" }
  ```

---

### 3. Create / update income record — `POST /user/income`

**Requires an active session** (must have signed in first, in the same Postman session so the cookie is attached).

This endpoint is an **upsert**: the first call creates your income record, and every subsequent call updates the same record (one income record per user, matched by `userId`).

- **URL:** `{{baseUrl}}/user/income`
- **Method:** `POST`
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**
  ```json
  {
    "salary": 60000,
    "businessIncome": 15000,
    "otherIncome": 2000
  }
  ```

**Success — `200 OK`:**

```json
{
  "message": "record updated",
  "incomeRecord": {
    "id": 1,
    "income": 60000,
    "businessIncome": 15000,
    "otherIncome": 2000,
    "userId": 1,
    "createdAt": "2026-09-17T10:00:00.000Z",
    "updatedAt": "2026-09-17T10:00:00.000Z"
  }
}
```

Run the same request again with different numbers — you'll get the same `id` back with updated values and a newer `updatedAt`, confirming it updates rather than duplicating.

**Errors:**

- `400 Bad Request` — missing/invalid fields (`salary`, `businessIncome`, `otherIncome` must all be numbers):
  ```json
  { "error": ["Invalid input: expected number, received string"] }
  ```
- `401 Unauthorized` — not signed in / no valid session cookie attached:
  ```json
  { "error": "not signed in" }
  ```

---

### 4. Sign out — `POST /signout`

**Requires an active session.** Destroys the session server-side (deletes the row from the Postgres `session` table) and clears the cookie.

- **URL:** `{{baseUrl}}/signout`
- **Method:** `POST`
- **Headers:** none required (no body needed)

**Success — `200 OK`:**

```json
{ "message": "signout out successfully" }
```

**Errors:**

- `401 Unauthorized` — no active session:
  ```json
  { "error": "not signed in" }
  ```
- `500 Internal Server Error` — session destroy failed:
  ```json
  { "error": "could not sign out" }
  ```

After this, check Postman's **Cookies** panel — `connect.sid` should be gone (or invalidated). Any further request to `/user/income` should now return `401`.

## Suggested test flow (run in this order)

1. `POST /signup` — create a user → expect `201`.
2. `POST /signup` again with the same email → expect `401` (duplicate check).
3. `POST /signin` with correct credentials → expect `200`, cookie set.
4. `POST /signin` with wrong password → expect `401`.
5. `POST /user/income` (while signed in) with initial values → expect `200`, note the `id` in the response.
6. `POST /user/income` again with different values → expect `200`, **same `id`**, updated values, newer `updatedAt`.
7. `POST /signout` → expect `200`.
8. `POST /user/income` again (after signout) → expect `401`, confirming the session was really destroyed.

## Notes / Known limitations

- Sessions last 24 hours (`cookie.maxAge` in `src/index.ts`) or until `/signout` is called.
- There is currently no `GET` endpoint to fetch the signed-in user's income record — only create/update via `POST /user/income`.
- Passwords are hashed with `argon2` and never stored or returned in plaintext.
  `
