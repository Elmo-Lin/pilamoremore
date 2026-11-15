# Pila More More backend

REST API for Pila More More, a record-keeping app for Pilates studios. It covers the studio
(an owner plus the teachers they invite), students, class logs with spring settings and reps,
session packages with their transaction ledger, appointments and the monthly subscription.

Spring Boot 4 · Java 17 · Spring Security (JWT, HS256) · **Cloud Firestore** (Firebase emulator locally)

## Run locally

Requirements: Java 17+ for the app, plus [firebase-tools](https://firebase.google.com/docs/cli) and a
**Java 21+** runtime for the Firestore emulator (`brew install openjdk@21`).

```bash
cd backend
./scripts/dev.sh        # Firestore emulator (data kept in ./data/firestore) + API on http://localhost:8080/api
./scripts/test.sh       # test suite against a throwaway emulator
```

If your default `java` is older than 21, prefix both with `JAVA_HOME=$(/usr/libexec/java_home -v 21)`.

Or run the pieces yourself:

```bash
firebase emulators:start --only firestore --project demo-pilamoremore   # emulator on 127.0.0.1:8085, UI on :4000
./mvnw spring-boot:run                                                  # "dev" profile → emulator + demo mode
```

Then point the frontend at it:

```bash
cd frontend
echo "VITE_API_URL=http://localhost:8080/api" > .env.local
npm run dev             # http://localhost:5173 → 「示範」 → 選一個示範身分
```

The first demo sign-in imports the frontend's demo studio (owner, a teacher, students and their
class history). Every demo account's password is `demo1234`. Browse the data at
http://localhost:4000/firestore.

New accounts must verify their email before using the API (`403 email_unverified`). Locally no
mail is sent: the verification link is printed in the backend log (`Mail not configured; would send …`).

## Firestore layout

```
users/{userId}          login identity: role, passwordHash (bcrypt), coachId (= studio), active
emails/{email}          {userId}: guarantees unique email (written in the same transaction)
invites/{code}          one-time invite for a student or a teacher (14 days)
exercises/{id}          a studio's custom moves (tagged with its coachId); built-in moves live in code
billingOrders/  passwordResets/  emailVerifications/  loginGuards/  pushSubscriptions/  reminderRuns/
coaches/{coachId}       the studio (kind: studio, maxCoaches, subscription); everything in it is a subcollection:
  students/  workouts/  packages/  transactions/  metrics/  appointments/  goals/  payments/
  ledgers/{studentId}   lock token for ledger writes (not a balance)
```

- **Studios only.** Signing up (`/auth/register-studio`, or Google/Apple with `accountType: studio`)
  always creates a studio with its owner. There are no solo teachers or self-practitioners.
- Roles: `owner` (runs the studio and also teaches), `coach` (a teacher invited by the owner) and
  `student` (invited by a teacher). Teachers and students join with an invite code, never by
  signing up.
- A **studio** is `coaches/{id}` with the owner's ID. The owner invites teachers (`maxCoaches`
  seats, owner included). Students belong to the studio: `students/{id}.assignedCoachId` is the
  teacher who teaches them (absent = the owner), so the owner can hand a student, with all their
  history, to another teacher. Teachers see only their own students; the owner sees everything.
  Removing a teacher hands their students to someone else and ends the teacher's sign-in on the next request.
- **Moves**: the built-in Pilates repertoire lives in `store/ExerciseCatalog` (generated from
  `frontend/src/data/exercises.ts`; the two must match). Equipment: reformer, mat, cadillac,
  chair, barrel, props, other. Studios add custom moves, visible only inside that studio.
- Workouts embed exercises and sets. A set records `springs` (free text, e.g. `1紅1藍`, max 20
  characters, trimmed, blank stored as absent) and `reps`. Cardio (jump board, walking) uses `durationSec`.
- Goals are personal (`targetReps` 1–200): students set their own, and teachers can read them.
- Timestamps are native Firestore Timestamps.
- Queries filter by a single field and sort in memory, so **no composite indexes** are needed.
- `firestore.rules` **denies all client access**. Only this backend, which uses
  server credentials and bypasses rules, may read or write. Browsers never talk
  to Firestore directly.

## Deploying (Firebase / Google Cloud)

1. In the Firebase project (`pilamoremore`), enable Firestore (Native mode).
2. Deploy the deny-all rules: `firebase deploy --only firestore:rules --project pilamoremore`.
3. Deploy the API to **Cloud Run** (`./mvnw spring-boot:build-image` or a Dockerfile).
   Use a service account with `roles/datastore.user`. Credentials are picked up
   automatically, so no key file is needed.
4. Set env vars on Cloud Run:
   - `GOOGLE_CLOUD_PROJECT=pilamoremore`
   - `PILA_JWT_SECRET` (at least 32 random bytes)
   - `PILA_CORS_ORIGINS=https://<your-hosting-domain>`
   - Leave `PILA_DEMO_ENABLED` unset (off).
   - `PILA_APP_URL` / `PILA_API_URL`: the public app URL and API URL (NewebPay sends people and results back there).
   - `PILA_RESEND_API_KEY` + `PILA_MAIL_FROM` for email (verification, password reset, invites).
   - `GOOGLE_CLIENT_ID` for Google sign-in, and the `NEWEBPAY_*` shop keys for payments (see below).
5. Host the frontend on **Firebase Hosting**, built with `VITE_API_URL` set to the
   API URL. Alternatively, add a Hosting rewrite `/api/** → Cloud Run service` so
   the app and the API share one origin.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8080` | |
| `GOOGLE_CLOUD_PROJECT` | `demo-pilamoremore` | Firebase / GCP project ID |
| `FIRESTORE_DATABASE_ID` | `(default)` | |
| `FIRESTORE_EMULATOR_HOST` | unset (`127.0.0.1:8085` in the dev profile) | When set, the app uses the emulator |
| `PILA_JWT_SECRET` | dev-only value | **Must be set in production** (≥ 32 bytes) |
| `PILA_JWT_TTL_HOURS` | `168` | Token lifetime |
| `PILA_CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173` | Comma-separated frontend origins |
| `PILA_DEMO_ENABLED` | `false` (`true` in the dev profile) | Enables `/api/demo/*` |
| `PILA_DEMO_PASSWORD` | `demo1234` | Password given to imported demo accounts |
| `PILA_APP_URL` | `http://localhost:5173` | Frontend origin; links in emails and NewebPay's return go there |
| `PILA_API_URL` | `http://localhost:8080/api` | Public API base; NewebPay posts results to `/billing/newebpay/*` |
| `PILA_VERIFY_EMAIL` | `true` | Require email verification before using the API |
| `PILA_RESEND_API_KEY` / `PILA_MAIL_FROM` | unset (mail logged, not sent) | Resend credentials and sender |
| `PILA_ADMIN_EMAILS` | unset | Comma-separated verified emails that see `/admin` |
| `PILA_PUSH_PUBLIC_KEY` / `PILA_PUSH_PRIVATE_KEY` | unset (reminders off) | VAPID keys for Web Push class reminders |
| `PILA_REMINDER_KEY` | unset | Shared secret for the scheduler calling `/internal/reminders` |
| `GOOGLE_CLIENT_ID` | unset (Google sign-in off) | OAuth client ID (Web application); the frontend's `VITE_GOOGLE_CLIENT_ID` must match |
| `APPLE_*` | unset (Sign in with Apple off) | Sign in with Apple credentials |
| `NEWEBPAY_MERCHANT_ID` / `NEWEBPAY_HASH_KEY` / `NEWEBPAY_HASH_IV` | unset (payments off) | NewebPay shop credentials (HashKey 32 chars, HashIV 16) |
| `NEWEBPAY_BASE_URL` | `https://ccore.newebpay.com` (sandbox) | `https://core.newebpay.com` for live payments |

> `/api/demo/import` is unauthenticated and **wipes all studio and user data**.
> It is off by default. Only the local `dev` profile turns it on.

## Subscriptions

Studios pay monthly; teachers and students are free. There is one plan, **Team**: NT$999 a month
for 3 teachers (owner included) and 100 active students. Add-ons: +NT$99 per 10 students and
+NT$199 per extra teacher seat. The numbers live in `billing/Plans.java`, and
`frontend/src/lib/billing.ts` mirrors them.

- **Trial**: 30 days from sign-up, no card. Changing add-ons during the trial is free. When the
  trial or a paid period lapses (3 days' grace after a missed renewal), the studio turns
  **read-only**: every write returns `402 subscription_required` (`billing/WriteGuard`), reads keep
  working, nothing is deleted.
- **Who pays**: only the owner manages billing (`canManage`); teachers see the status.
- **Limits**: only `active` students count; every active or invited teacher takes a seat. Going over
  never deletes anything; adding students/teachers returns `409 student_limit` / `seats_full`.
- **NewebPay**: subscribing creates a monthly credit-card mandate (定期定額), first month charged
  at once. Each renewal arrives at `/api/billing/newebpay/period-notify` and extends the period.
  More add-ons are on immediately after a one-time MPG payment of the prorated difference; the
  mandate's amount is then changed for the next period (`AlterAmt`). Fewer add-ons are scheduled
  for the next renewal. Cancelling terminates the mandate; the studio stays writable until the
  period ends. Callbacks are idempotent and authenticated by decrypting with the shop's HashKey/HashIV.
- **Before going live**: run the whole flow on NewebPay's sandbox. The field names and API
  versions in `billing/NewebPay.java` follow the 定期定額 / MPG specs and must be checked against the
  spec versions issued with your merchant account. **E-invoices (電子發票) are not issued yet.**

## Business rules enforced server-side

- **Balances are never stored.** Each package's remaining sessions are
  `totalSessions + Σ adjustments − (deductions − reversals)`, computed from the
  append-only `session_transactions` ledger.
- **Saving a class log never bills.** A deduction is a separate request
  (`POST /workouts/{id}/deduction`). It works only on `coached` + `completed`
  workouts, only once (until reversed), and draws from the oldest package that
  still has sessions.
- **Students' own practice (`independent`) can never be deducted.**
- **No balance can go negative.** This covers adjustments and deductions, and
  a package's total can't be edited below what has already been used.
- **History is append-only.** Undoing a deduction adds a `reversal` row, and a
  deducted workout can't be deleted.
- **Concurrent ledger writes are serialized** with Firestore transactions. Each
  one reads and bumps the student's `ledgers/{studentId}` token, and each
  deduction also touches the workout.
- **Row-level access.** Everything lives under the studio's own document. A teacher only sees
  their own students; a student only sees their own records, never the teacher's private notes,
  and may only create or edit their own independent practice. Other users' IDs return `404` so
  their existence isn't revealed.

## API

All routes are under `/api`, return JSON, and except auth/health/demo/payment callbacks need
`Authorization: Bearer <token>`. Errors are `{status, code, message}`, with `message` in zh-TW
ready to show to users. IDs may be supplied by the client (`prefix_xxxx`, e.g. `wk_ab12cd34`),
so offline-created records keep stable IDs.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/register-studio` | public | Owner sign-up with a studio name → token |
| POST | `/auth/login` | public | Email + password → token |
| POST | `/auth/google`, `/auth/apple` | public | Sign in; a new account needs `accountType: studio` + `studio` |
| POST | `/auth/activate` | public | Student or teacher sets a password with an invite code → token |
| POST | `/auth/verify-email`, `/auth/verify-email/resend` | public / any | Email verification |
| POST | `/auth/forgot-password`, `/auth/reset-password` | public | Password reset by mailed link |
| POST | `/auth/refresh` | any | Fresh token |
| GET | `/auth/me` | any | Current user |
| GET | `/bootstrap` | any | Everything the caller may see (frontend `AppData` shape) |
| POST | `/studio/coaches` | owner | Invite a teacher (uses a seat) → invite code |
| POST | `/studio/coaches/{id}/invite` | owner | New code for a teacher who has not activated |
| POST | `/studio/coaches/{id}/deactivate` | owner | `{transferTo}` takes their students; frees the seat |
| PUT | `/students/{id}/coach` | owner | Hand a student to another active teacher |
| GET/POST/PUT | `/exercises[/{id}]` | teacher | Catalog; custom moves for the studio |
| GET/POST | `/students` | teacher | List / create |
| GET/PUT/DELETE | `/students/{id}` | teacher (GET: the student too) | Read / replace / delete (`?deleteAccount=true` also removes their sign-in) |
| POST | `/students/{id}/invite` | teacher | One-time invite code (14 days) |
| GET | `/students/{id}/balance` | teacher, the student | Derived balance per package |
| GET/POST | `/students/{id}/packages` | teacher (GET: the student too) | Session packages |
| GET | `/students/{id}/transactions` | teacher, the student | Ledger |
| GET/POST | `/students/{id}/metrics` | teacher, the student | Body measurements |
| PUT/DELETE | `/packages/{id}` | teacher | Edit / delete (only if no history) |
| POST | `/packages/{id}/adjustments` | teacher | Manual ± with reason |
| PUT | `/me/package-presets` | teacher | Quick-select package options |
| GET | `/workouts?studentId=` | teacher, the student | List |
| GET/PUT/DELETE | `/workouts/{id}` | teacher; student for own independent | Read / create-or-replace (drafts autosave) / delete |
| POST | `/workouts/{id}/deduction` | teacher | Deduct one session |
| POST | `/workouts/{id}/deduction/reversal` | teacher | Undo with reason |
| PUT/DELETE | `/goals/{id}` | student | Own goals |
| GET/PUT/DELETE | `/appointments[/{id}]` | teacher (GET: student sees own) | Schedule |
| GET | `/billing` | owner, teacher | Plan, limits, payments (owner) |
| POST | `/billing/subscribe`, `/billing/change`, `/billing/cancel` | owner | NewebPay checkout / add-ons / cancel |
| POST | `/billing/newebpay/*` | NewebPay | Payment callbacks |
| GET/DELETE | `/me/deletion`, `/me` | any | What deleting the account removes / delete it (an owner deletes the whole studio) |
| GET/PUT/POST | `/push/*` | any | Class reminder subscriptions |
| GET/PUT | `/admin/*` | admin emails | Overview, users, 永久版 grants |
| GET | `/health` | public | Liveness |
| GET | `/demo/status`, POST `/demo/import`, POST `/demo/login` | public, demo only | Demo data and one-click login |

## Layout

```
src/main/java/com/example/backend/
  auth/      JWT issuing/verification, SecurityConfig, AuthService, Google/Apple sign-in, rate limiting
  admin/     Admin overview and 永久版 grants
  billing/   Plans (Team + add-ons), SubscriptionService, NewebPay, WriteGuard
  common/    ApiException + global error handler, ID rules, allowed domain values (goals, equipment)
  domain/    Firestore document classes (one per collection)
  mail/      Resend mail (logged when not configured)
  push/      Web Push class reminders
  store/     Firestore client config, document codec, Db helpers (paths, transactions), move catalog
  service/   Business logic: Ledger (balance derivation), Workouts, Students, Studio, Goals, Bootstrap
  web/       REST controllers + DTOs (wire format mirrors frontend/src/types)
  demo/      Demo import / login (disabled unless PILA_DEMO_ENABLED=true)
firebase.json, firestore.rules, firestore.indexes.json   Firebase project config (emulator, deny-all rules)
scripts/dev.sh, scripts/test.sh                          Emulator-wrapped dev server and tests
```
