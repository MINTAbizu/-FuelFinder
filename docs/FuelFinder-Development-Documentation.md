# FuelFinder - Development Documentation
<!-- https://expo.dev/accounts/mintesenotb/projects/fuelfinder/builds/65fa0a97-8743-4b07-b4bc-1be17e8bcea9 -->

<!-- eas.cmd env:create preview --name GOOGLE_MAPS_API_KEY --value AIzaSyC9STzzaUMPylYw92VchQ1xTsLLflvOTXc --visibility secret --scope project -->


<!-- rootadmin -->
<!-- root@admin.com------Admin@1234 -->





map_key=AIzaSyCvE8A-8LUcbm3tOlmwCauM_zoJLD-m4cs
## 1. Overview
FuelFinder is a mobile-first fuel station discovery and queue management app. It includes:
- A React Native (Expo) client for customers.
- A Node.js/Express backend with MongoDB for auth, queues, stations, payments, and realtime updates.
- Admin APIs for station and staff management.
- Integrations for maps and payments (OSM/Overpass + OSRM routing, Chapa, Telebirr).

The project is a monorepo with the mobile app and backend colocated in the same repo.

## 2. Repository Layout
Workspace root: `fuelfinder/`

Top-level:
- `App.js` - Main React Native app entry.
- `index.js` - Expo root registration.
- `app.json` - Expo config (icons, permissions, Sentry, etc.).
- `eas.json` - EAS build profiles.
- `package.json` - Mobile app dependencies and scripts.
- `assets/` - App icons and splash images.
- `android/` - Generated Android native project (Expo prebuild).
- `backend/` - Node/Express backend.
- `src/` - Mobile app source code.
- `design.text` - Product roadmap and planning notes (legacy, not code).

## 3. Tech Stack
Mobile:
- React Native (Expo)
- React Navigation (stack + tabs)
- React Query
- Axios
- AsyncStorage
- react-native-maps + expo-location
- i18next + expo-localization
- Sentry (React Native)
- Zustand (dependency present; not currently used)

Backend:
- Node.js + Express
- MongoDB + Mongoose
- JSON Web Tokens (JWT) for auth
- Socket.IO for realtime events
- Chapa payments integration
- Telebirr payments integration
- Overpass API for nearby fuel stations (OpenStreetMap)
- OSRM for driving routes

## 4. Running the Project (Development)
Prereqs:
- Node.js 18+ (required for fetch in backend scripts)
- MongoDB
- Expo CLI / EAS CLI

### 4.1 Mobile App
From `fuelfinder/`:
- `npm install`
- `npm run start`

Other commands:
- `npm run android`
- `npm run ios`
- `npm run web`

### 4.2 Backend
From `fuelfinder/backend/`:
- `npm install`
- `npm run dev`

Server defaults:
- `http://0.0.0.0:5000`

## 5. Environment Variables
Do NOT commit secrets. The `.env` files in this repo contain real values; use them locally but do not share.

### 5.1 Mobile (`fuelfinder/src/.env`)
Current keys found:
- `EXPO_PUBLIC_API_BASE_URL` - Base URL for backend; `/api` appended automatically.
- `DSN` - Sentry DSN used in `App.js`.
- `SENTRY_ORG` - Sentry organization name.
- `SENTRY_PROJECT` - Sentry project name.
- `CHAPA_SECRET_KEY` - Present in file but should NOT be on client. Move to backend only.
- `Test Public key` - Invalid env key (contains spaces). Should be removed or commented.
- `Encryption key` - Invalid env key (contains spaces). Should be removed or commented.

Notes:
- `src/component/services/api.js` builds `API_BASE_URL` and appends `/api` if missing.
- `EXPO_PUBLIC_*` variables are exposed to the client. Avoid secrets here.

### 5.2 Backend (`fuelfinder/backend/.env`)
Current keys found:
- `PORT`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `MONGODB_URI`
- `CLIENT_ORIGIN`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `ADMIN_REGISTRATION_KEY` (not used in code)
- `BOOTSTRAP_ADMIN_KEY`
- `BASE_URL`
- `CHAPA_SECRET_KEY`
- `CHAPA_PLATFORM_FEE_BIRR`
- `CHAPA_CURRENCY` (not used in code)
- `CHAPA_CALLBACK_URL` (not used; callback is built from `BASE_URL`)
- `CHAPA_RETURN_URL`
- `CHECKIN_ALLOW_OUTSIDE_RADIUS`
- `TELEBIRR_BASE_URL`
- `TELEBIRR_GATEWAY_PATH`
- `TELEBIRR_FABRIC_TOKEN_PATH`
- `TELEBIRR_AUTH_TOKEN_PATH`
- `TELEBIRR_PRE_ORDER_PATH`
- `TELEBIRR_FABRIC_APP_ID`
- `TELEBIRR_APP_SECRET`
- `TELEBIRR_MERCHANT_APP_ID`
- `TELEBIRR_MERCHANT_CODE`
- `TELEBIRR_CALLBACK_URL`
- `TELEBIRR_RETURN_URL`
- `TELEBIRR_PRIVATE_KEY`
- `Test Public key` - Invalid env key (contains spaces). Should be removed or commented.
- `Encryption key` - Invalid env key (contains spaces). Should be removed or commented.

Important derived config:
- JWT expiry defaults to `15m` access and `30d` refresh if not set.
- `CLIENT_ORIGIN` is used for CORS; supports comma-separated list, `*` in non-prod.
- `BASE_URL` is used to build Chapa callback URL.

## 6. Mobile App Architecture
Entry:
- `index.js` registers `App` with Expo.
- `App.js` is the main component.

### 6.1 Providers
`App.js` wraps:
- `SafeAreaProvider`
- `QueryClientProvider` (React Query)
- `LanguageProvider` (i18n)
- `AuthProvider` (auth + token refresh)

### 6.2 Navigation
`App.js` builds navigation with:
- Root stack for `Login` and `Register`.
- Tab navigator for `Home`, `Map` (placeholder), `Alerts` (placeholder), `Profile`.
- Nested Home stack for `HomeScreen` and `StationDetails`.

Note: There are legacy navigation components in `src/component/navigation` that are not used by `App.js`.

### 6.3 Auth Flow
Files:
- `src/component/context/AuthContext.jsx`
- `src/component/screens/auth/LoginScreen.jsx`
- `src/component/screens/auth/RegisterScreen.jsx`

Auth behavior:
- Uses access/refresh tokens with automatic refresh on 401.
- Tokens stored in AsyncStorage keys:
  - `ff_access_token`
  - `ff_refresh_token`
  - `ff_user`
- On app start, session is restored and `/auth/me` is called.

### 6.4 i18n and Localization
Files:
- `src/i18n/i18n.js`
- `src/i18n/supportedLanguages.js`
- `src/i18n/locales/*.json`

Supported language codes:
- `am`, `om`, `ti`, `so`, `aa`, `sid`, `wal`, `hdy`, `har`, `stv`, `kbr`, `gez`, `en`

Language selection:
- Stored in AsyncStorage key `fuelfinder_language`.
- `LanguageContext` initializes i18n based on device locale.

### 6.5 API Client
File: `src/component/services/api.js`
- Base URL from `EXPO_PUBLIC_API_BASE_URL` or defaults to `https://fuelfinder-2.onrender.com`.
- Automatically appends `/api` if missing.
- Exposes `setApiAccessToken` to inject Bearer token for requests.

### 6.6 Services
File: `src/component/services/authService.js`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

File: `src/component/services/queueService.js`
- Queue reserve/join/leave
- Reservation status
- Telebirr payment endpoints
- Chapa payments (`/payments/initialize`, `/payments/verify/:txRef`)
- Station check-in endpoints

File: `src/component/services/realtimeSocket.js`
- Socket.IO client using `API_BASE_URL` without `/api`.
- Emits `join_station_room` / `leave_station_room` and listens to:
  - `queue_updated`
  - `station_fuel_updated`
  - `ticket_called`

### 6.7 Key Screens
Home:
- `src/component/screens/home/HomeScreen.jsx`
- Map with nearby stations (calls `/map/nearby-fuel`).
- Station list with status filters, fuel filters, and sorting.
- Routing to a station via `/map/route`.

Station details:
- `src/component/screens/home/StationDetails.jsx`
- Shows station details, fuel inventory, queue, and user ticket.
- Reserve queue + pay via Chapa.
- Check-in flow with OTP + QR code.
- Realtime polling for ticket status.

Profile:
- Implemented directly inside `App.js`.
- Uses AsyncStorage for user preferences.

Auth:
- `LoginScreen.jsx` and `RegisterScreen.jsx`.

Placeholders/legacy:
- `src/component/navigation/*` and `src/component/Station/StationDetails.jsx` are legacy and not wired in `App.js`.
- `Map` and `Alerts` tabs currently render placeholders.

## 7. Backend Architecture
Entry:
- `backend/src/server.js` loads env, connects MongoDB, and starts server + Socket.IO.
- `backend/src/app.js` sets up middleware and routes.

### 7.1 Middleware
- `cors` with allowed origins from `CLIENT_ORIGIN`.
- `helmet` for security headers.
- `morgan` logging.
- JSON body parsing with raw body saved for webhook signature checks.
- `auth` middleware for JWT auth.
- `authorize` for role/scope checks.
- `rateLimiters` for auth endpoints.
- `auditLog` for admin write actions.

### 7.2 Socket.IO
File: `backend/src/socket/index.js`
- Authenticated sockets using JWT.
- Events:
  - `join_station_room`
  - `leave_station_room`
  - Server emits `queue_updated`, `station_fuel_updated`, `ticket_called`.

### 7.3 Models
User (`backend/src/models/User.js`):
- Roles: `customer`, `staff`, `station_manager`, `city_manager`, `org_admin`, `super_admin`.
- Supports scope fields: `organizationId`, `cityIds`, `stationIds`, `branchIds`.

Station (`backend/src/models/Station.js`):
- Fuel inventory, fuel status, location (GeoJSON Point).
- Indexed for geospatial queries.

QueueTicket (`backend/src/models/QueueTicket.js`):
- Status machine: `pending_payment`, `waiting`, `called`, `served`, `cancelled`, `expired`.
- Unique active ticket per user+station.
- Tracks payment, check-in, and position.

PaymentTransaction (`backend/src/models/PaymentTransaction.js`):
- Chapa payment records.

Report (`backend/src/models/Report.js`):
- User reports on fuel status/queue length.

AuditLog (`backend/src/models/AuditLog.js`):
- Admin actions audit log.

### 7.4 Core Services
Map service (`backend/src/services/mapService.js`):
- Overpass API for fuel stations near lat/lon.
- OSRM routing for directions.
- Builds station addresses from OSM tags; reverse geocodes missing addresses.

Chapa service (`backend/src/services/chapa.service.js`):
- Initialize and verify payment via Chapa API.

Telebirr service (`backend/src/services/telebirr.js`):
- Uses Fabric token + auth token + pre-order flow.
- Requires TELEBIRR env variables.

### 7.5 API Endpoints
Base: `/api`

Health:
- `GET /api/health`

Auth:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout` (auth required)
- `GET /api/auth/me` (auth required)
- `POST /api/auth/bootstrap-super-admin` (requires `BOOTSTRAP_ADMIN_KEY`)

Queue:
- `POST /api/queue/reserve` (auth)
- `POST /api/queue/join` (auth)
- `GET /api/queue/me/:stationId` (auth)
- `POST /api/queue/leave` (auth)
- `POST /api/queue/next` (staff roles + scope)
- `GET /api/queue/station/:stationId`
- `GET /api/queue/station/:stationId/fuel-status`
- `PATCH /api/queue/station/:stationId/fuel-stock` (staff roles + scope)
- `GET /api/queue/reservation/:reservationId` (auth)

Check-in:
- `POST /api/queue/check-in/start` (auth)
- `POST /api/queue/check-in/verify` (staff roles + scope)
- `POST /api/queue/validate-id` (staff roles + scope)

Telebirr payments:
- `POST /api/queue/payments/telebirr/auth-token` (auth)
- `POST /api/queue/payments/telebirr/initiate` (auth)
- `POST /api/queue/payments/telebirr/webhook` (no auth)
- `POST /api/queue/confirm-payment` (auth)

Chapa payments:
- `POST /api/payments/initialize` (auth)
- `GET /api/payments/verify/:tx_ref` (auth)
- `GET|POST /api/payments/callback` (webhook)

Map:
- `GET /api/map/nearby-fuel?lat=&lon=&radius=`
- `GET /api/map/route?fromLat=&fromLon=&toLat=&toLon=`

Admin (auth + role required):
- `GET /api/admin/ping`
- `GET /api/admin/scope-check`
- `GET /api/admin/organizations/options` (super_admin)
- `GET /api/admin/users` (super_admin)
- `POST /api/admin/users/create-admin` (super_admin)
- `PATCH /api/admin/users/:userId` (super_admin)
- `PATCH /api/admin/users/:userId/block` (super_admin)
- `POST /api/admin/users/:userId/force-logout` (super_admin)
- `GET /api/admin/stations` (super_admin, org_admin)
- `POST /api/admin/stations` (super_admin, org_admin)
- `PATCH /api/admin/stations/:stationId` (super_admin, org_admin)
- `PATCH /api/admin/stations/:stationId/active` (super_admin, org_admin)
- `GET /api/admin/payments` (super_admin, org_admin)

### 7.6 Queue System Behavior
Key logic (queueController):
- Status transitions enforced by `STATUS_TRANSITIONS`.
- `pending_payment` reservations expire after `PAYMENT_WINDOW_MINUTES` (10 minutes).
- `waiting` tickets expire after `WAITING_WINDOW_MINUTES` (default 120).
- `called` tickets expire after 5 minutes.
- Positions recalculated for waiting tickets on changes.
- Fuel inventory is consumed on successful payment; restored on cancellation.
- Check-in requires geofence radius (250m) and location accuracy, unless bypassed in dev.

### 7.7 Payment Flows
Chapa:
1. Reserve queue slot (`/queue/reserve`).
2. Initialize payment (`/payments/initialize`).
3. User completes Chapa checkout.
4. Backend verifies payment (`/payments/verify/:tx_ref`) or webhook (`/payments/callback`).
5. Ticket moves to `waiting`.

Telebirr:
1. Reserve queue slot (`/queue/reserve`).
2. Exchange Telebirr auth token.
3. Initiate pre-order to get `prepayId` and `rawRequest`.
4. Telebirr webhook marks payment confirmed.

### 7.8 Security
- JWT access + refresh tokens, stored hashed refresh tokens.
- `express-rate-limit` on auth endpoints.
- CORS restricted to `CLIENT_ORIGIN`.
- Audit logging for admin actions.

## 8. Scripts (Backend)
Located in `backend/scripts/`.

- `telebirr-flow.js` - Test Telebirr flow end-to-end via CLI.
- `merge-stations.js` - Merge duplicate stations (dry run by default, use `--apply`).
- `backfill-station-addresses.js` - Reverse geocode missing addresses (dry run by default).

## 9. Expo / EAS Configuration
`app.json`:
- App name, icons, splash, permissions, Sentry config.
- Android permissions include background + fine/coarse location.

`eas.json`:
- `development`, `preview`, `production` profiles.
- `EXPO_PUBLIC_API_BASE_URL` is set for preview and production builds.

### 9.1 Sentry (EAS Builds)
Release builds upload source maps via `@sentry/react-native` Gradle tasks. EAS builds will fail if an auth token
is not provided.

Recommended setup:
1. Create a Sentry auth token (scope: `project:releases`; add `org:read` if required).
2. Store it as an EAS secret (do not commit it to git):
   - `eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value "<your_token>"`

Optional (disable uploads):
- Set `SENTRY_DISABLE_AUTO_UPLOAD=true` in the relevant `eas.json` build profile if you want to skip uploads.

## 10. Known Gaps and Legacy Code
- Multiple legacy navigation and screen files exist but are unused by `App.js`.
- `design.text` is a product roadmap and references Django; backend is Node/Express.
- `src/store`, `src/hooks`, `src/services`, `src/theme`, `src/types`, `src/utils` are empty.
- Some `.env` keys have spaces and should be fixed or commented out.
- Client `.env` contains payment secrets; these should be removed.

## 11. Suggested Development Workflow
- Run backend first and ensure MongoDB connectivity.
- Use `EXPO_PUBLIC_API_BASE_URL` pointing to your backend.
- Verify auth flow (register, login, refresh).
- Test map endpoints for nearby stations and routing.
- Validate payment flows (Chapa or Telebirr).
- Test realtime updates with Socket.IO.

## 12. Files of Interest (Quick Index)
Mobile:
- `App.js`
- `src/component/context/AuthContext.jsx`
- `src/component/context/LanguageContext.jsx`
- `src/component/services/api.js`
- `src/component/services/authService.js`
- `src/component/services/queueService.js`
- `src/component/services/realtimeSocket.js`
- `src/component/screens/home/HomeScreen.jsx`
- `src/component/screens/home/StationDetails.jsx`
- `src/component/screens/auth/LoginScreen.jsx`
- `src/component/screens/auth/RegisterScreen.jsx`

Backend:
- `backend/src/server.js`
- `backend/src/app.js`
- `backend/src/controllers/queueController.js`
- `backend/src/controllers/chapapayment.controller.js`
- `backend/src/controllers/authController.js`
- `backend/src/controllers/mapController.js`
- `backend/src/routes/*.js`
- `backend/src/models/*.js`
- `backend/src/services/*.js`
- `backend/src/socket/index.js`

End of document.







































Here’s a **30/60/90‑day plan** sized for **1 developer**, focused on drivers + single‑station owners. I’m assuming you already have auth, queue, stations, and payments in place (from your repo).

**30 Days (Core Value)**
1. **Driver**
   - Live station list with price + last‑updated timestamp.
   - Queue time + fuel‑in‑stock status on station cards.
   - Favorites (save stations).
2. **Owner**
   - Lightweight owner update screen: fuel status + queue open/close.
   - Basic owner dashboard: today’s visits + average wait time.
3. **Backend**
   - Endpoints for price update, fuel status, queue open/close, favorites.
   - Simple analytics: visits/queues per day.
4. **UX**
   - Clear badges for “Fresh” vs “Stale” data.

**60 Days (Stickiness)**
1. **Driver**
   - Price drop alerts for favorites.
   - ETA + total time comparison (price vs wait vs detour).
2. **Owner**
   - Low‑stock alerts.
   - Simple promo posting (time‑boxed discount).
3. **Backend**
   - Alert scheduler + notification service.
   - Promo model + “active promo” query.

**90 Days (Monetization & Trust)**
1. **Driver**
   - Verified station badges.
   - Savings summary (weekly/monthly).
2. **Owner**
   - Premium analytics: peak times, return users, promo effectiveness.
   - Reputation tools (respond to reports).
3. **Backend**
   - Verification workflow.
   - Analytics export (CSV).

If you want, I can map this into exact **screens + API routes** you already have and create a **task backlog** for the next 2 weeks.


























cd fuelfinder/backend

$env:OWNER_EMAIL="owner@station.com"
$env:OWNER_PASSWORD="StrongPassword123"
$env:OWNER_NAME="Station Owner"
$env:OWNER_ROLE="station_manager"

$env:OWNER_CREATE_STATION="true"
$env:OWNER_STATION_NAME="Mintes Fuel Hub"
$env:OWNER_STATION_ADDRESS="Bole, Addis Ababa"
$env:OWNER_STATION_LAT="8.9806"
$env:OWNER_STATION_LON="38.7578"

npm run owner:bootstrap








cd fuelfinder/backend

$env:OWNER_EMAIL="owner@station.com"
$env:OWNER_PASSWORD="StrongPassword123"
$env:OWNER_NAME="Station Owner"
$env:OWNER_ROLE="station_manager"
$env:OWNER_STATION_ID="PUT_EXISTING_STATION_OBJECT_ID_HERE"

npm run owner:bootstrap
