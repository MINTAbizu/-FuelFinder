# FuelFinder - Development Documentation
<!-- https://expo.dev/accounts/mintesenotb/projects/fuelfinder/builds/65fa0a97-8743-4b07-b4bc-1be17e8bcea9 -->

<!-- eas.cmd env:create preview --name GOOGLE_MAPS_API_KEY --value AIzaSyC9STzzaUMPylYw92VchQ1xTsLLflvOTXc --visibility secret --scope project -->


<!-- rootadmin -->
<!-- root@admin.com------Admin@1234 -->



patent970@gmail.com

@minta@bizu@123

<!-- map_key=AIzaSyCvE8A-8LUcbm3tOlmwCauM_zoJLD-m4cs -->
## Project Background
FuelFinder was developed in response to a practical and recurring transportation problem: drivers often do not know which fuel stations are open, which stations still have fuel available, how long the queue is, how far the station is, or whether the time and fuel spent reaching that station will be worthwhile. In environments where fuel supply can change quickly and customer demand can surge without warning, this lack of visibility creates wasted trips, long wait times, confusion, traffic pressure around stations, and frustration for both drivers and station operators.

At the beginning, the project idea was not simply to build another map application. The deeper goal was to reduce uncertainty in fuel access by giving users timely, location-aware, and operationally useful information. Instead of forcing people to rely on rumors, phone calls, physical observation, or trial-and-error travel, FuelFinder aims to give them a digital way to discover stations, evaluate station conditions, and make better decisions before they commit to a trip.

This means the project sits at the intersection of mobility, location services, queue management, digital payments, and station operations. From the user perspective, the app helps answer a set of real questions:
- Which station near me has fuel?
- How far away is it?
- What is the queue situation there?
- What fuel type is available?
- Can I reserve a place before I arrive?
- Can I pay in advance and reduce waiting time?
- How do I get there quickly and confirm my turn when I arrive?

These questions show why FuelFinder is larger than a traditional station directory. A normal directory can list names and coordinates, but it does not solve the operational problem of fuel access under pressure. FuelFinder tries to solve that broader problem by combining discovery, queue handling, realtime updates, payments, and check-in into one connected flow.

### Problem Context
The background of the app is rooted in the everyday inefficiencies that appear when fuel access is uncertain. In many real-world situations, customers may drive from station to station only to discover that a station is out of stock, temporarily inactive, overcrowded, or serving a fuel type they do not need. This wastes time, increases fuel consumption, causes frustration, and reduces trust in station information. At the same time, station staff may be forced to manage heavy queues manually while also answering repeated questions from customers about stock levels, expected waiting times, and payment procedures.

FuelFinder addresses this problem by treating fuel access as an information and coordination challenge. The app assumes that the main pain point is not only the physical lack of fuel, but also the lack of reliable visibility around fuel availability, queue movement, and station readiness. By improving visibility, the app aims to improve customer planning, reduce unnecessary travel, support orderly service, and make the overall station experience more predictable.

### Product Vision
The long-term vision behind FuelFinder is to become a digital coordination platform for fuel station access and station management. In that vision, the platform does not only help a driver find a nearby station. It also helps the station communicate its current operational state to customers, and it helps owners and administrators manage the station more effectively behind the scenes.

This is why the project contains both customer-facing and operator-facing capabilities. On the customer side, the focus is convenience, speed, confidence, and better decision-making. On the station side, the focus is control, operational visibility, staff coordination, payment traceability, and improved service flow. The project therefore reflects a two-sided platform model:
- Customer side: discover stations, view status, compare options, route to stations, reserve queue slots, pay, receive updates, and check in.
- Operator side: manage stations, update fuel stock, observe queue pressure, track payments, manage staff access, maintain station details, and support promotions or operational changes.

### Why The App Is Mobile-First
FuelFinder is mobile-first because the primary use case happens while people are moving. Drivers need information while they are on the road, near stations, or making quick route decisions. A desktop-first solution would not match that context well. The mobile app therefore becomes the natural center of the customer experience. It uses device capabilities such as location access, local storage, push notifications, and authentication features to support real-time usage in the field.

This mobile-first design is important to the background of the app because it shows that the project is grounded in live, practical usage rather than back-office data entry alone. The app is designed to help a person make an immediate decision in a real environment: whether to travel, which station to choose, whether to reserve a slot, and when to check in.

### Core Business Logic Behind The Platform
The app is built around a simple but powerful operational flow:
1. A customer discovers nearby stations.
2. The system shows useful context such as fuel status, queue length, distance, and route.
3. The customer can reserve a slot or join the queue.
4. Payment can be initiated digitally before or during the queue process.
5. The station can manage the queue and fuel inventory in near real time.
6. The customer checks in when arriving at the station.
7. Staff can validate the customer and move the queue forward.

This flow is important because it reveals the real background of the project: FuelFinder was designed to reduce friction from end to end, not only at the discovery stage. The system tries to connect the entire journey from search to service completion.

### Local And Market Context
A major part of the app's background is its local orientation. The project is clearly adapted to the Ethiopian context rather than being a generic global template. This is visible in several ways:
- support for multiple Ethiopian languages in the mobile experience,
- Ethiopia-specific administrative location structures such as regions, cities, and woredas,
- integration with payment platforms such as Telebirr and Chapa,
- import and enrichment workflows for Ethiopian fuel and electric station datasets,
- handling of ETB-oriented payment and station operations use cases.

This localization matters because transportation and payment behavior are highly context-dependent. An application that works well in one country may fail in another if it ignores local languages, local payment systems, and local geographic structures. FuelFinder's background therefore includes not only a technical goal, but also a localization goal: to make the platform usable and relevant in the environment it is intended to serve.

### Stakeholders And Intended Users
FuelFinder is designed for several categories of users, and this multi-role design is central to understanding the project background.

Customers are the first and most visible group. They need fast access to trustworthy information about station availability, queue conditions, route options, and payment steps. For them, the app reduces uncertainty and helps them save time.

Station staff and station managers are another important group. They need tools for handling queue progression, fuel status updates, stock awareness, and customer check-in. For them, the platform supports smoother service operations and less manual confusion.

Organization-level admins and super admins represent the management layer. They need visibility across stations, the ability to manage users and permissions, station setup, payment monitoring, location directory data, and overall operational oversight. For them, the platform serves as a control and administration system.

Because these groups have different responsibilities, the project evolved toward role-based access and scoped permissions rather than a single shared interface. That design choice shows maturity in the product background: the platform is intended to operate in a real organizational setting, not only as a single-user demo app.

### Evolution Of The Project
The project also has an architectural background worth noting. Earlier planning notes suggest the idea began as a broader startup-style concept for a production-grade system, with emphasis on scalability, monetization readiness, clean architecture, and operational seriousness. As implementation progressed, the technical realization became a React Native mobile application backed by a Node.js/Express and MongoDB backend, with additional owner/admin-facing web interfaces in the wider workspace.

This evolution is significant because it shows that FuelFinder matured from a concept about fuel discovery into a fuller ecosystem:
- a customer mobile application,
- a backend service for authentication, queue management, maps, payments, and realtime communication,
- administrative and owner workflows for station control,
- data import and location management tooling for Ethiopia-focused station records.

In other words, the app did not stay at the level of a prototype map screen. It moved toward an operational platform with live services, roles, data management, and business workflows.

### Why Realtime Features Matter
Realtime capability is a core part of the app's background because the fuel access problem is dynamic. A station that has fuel now may not have fuel later. A short queue can quickly become a long one. A customer who reserved a slot needs timely updates. Staff need queue state changes to be reflected quickly. Because of this, the project includes realtime communication and periodic synchronization so that station and queue information can remain useful while conditions change.

Without realtime or near-realtime updates, the app would be little more than a static listing system. The presence of queue events, status transitions, reservation states, and live updates shows that the app is intended to support active operations, not just passive browsing.

### Why Payments Are Part Of The Background
Payments are included because queue reservation without payment confirmation can create abuse, uncertainty, and operational inconsistency. By integrating digital payment flows, the platform adds commitment to reservations and creates a clearer transaction trail for both customers and station operators. This is especially important in a system where demand pressure can make queue slots valuable and where staff need confidence that reservations are legitimate.

The inclusion of both Telebirr and Chapa indicates that the project is trying to fit into realistic digital payment behaviors rather than treating payment as an afterthought. This broadens the app from a service-information tool into a transaction-enabled platform.

### Why Station Operations Are Central
One of the most important things to understand about FuelFinder is that it is not only a consumer convenience app. It is also an operations app. The owner and admin capabilities in the wider workspace show that the project recognizes a basic truth: customer experience at a station depends heavily on what station staff and managers can see and control internally.

For that reason, the platform includes concepts such as:
- fuel stock visibility,
- queue monitoring and advancement,
- payment review,
- station profile management,
- team and role management,
- location directory management,
- promotional and organizational controls.

This makes the app strategically stronger. Instead of relying entirely on customer-side reporting, it creates a path for station-side participation and system-level coordination.

### Broader Significance Of The Project
From a software and product perspective, FuelFinder represents an attempt to digitize a fragmented service experience. The app brings together location intelligence, operational visibility, queue discipline, digital payment, role-based administration, and localization into one coordinated platform. That makes it relevant not only as a consumer app, but also as a case study in building software for real-world service bottlenecks.

Its broader significance lies in the fact that it transforms fuel access from an informal, uncertain, and manually coordinated process into a more transparent and manageable digital workflow. Even when supply conditions are imperfect, better information and better coordination can still improve the user experience and the efficiency of station operations.

### Summary
In summary, the background of FuelFinder is the need to solve a real and costly coordination problem around fuel station access. The app was created to help customers find trustworthy station information quickly, reduce wasted travel and queue uncertainty, support digital reservation and payment, and improve the way stations manage service flow. Over time, it developed into a multi-role platform that combines customer mobility features with backend operational control, localized market relevance, and station management workflows. For that reason, FuelFinder should be understood not merely as a fuel station finder, but as a comprehensive digital system for fuel access, queue management, and station operations.

## 1. Overview
FuelFinder is a multi-part digital platform designed to improve the way customers discover fuel stations and the way stations manage daily service operations. At its center is a mobile-first customer experience supported by a backend that handles authentication, station data, queue logic, payment workflows, routing, and realtime communication. Around that core, the project also includes operational and administrative capabilities that help station staff, managers, and organization-level users keep station information accurate and service delivery coordinated.

In practical terms, FuelFinder helps connect three things that are often disconnected in real life:
- station discovery,
- station service conditions,
- and station operations.

Instead of showing only a static list of fuel stations, the system is built to show customers a more useful operational picture. That includes station proximity, fuel type availability, queue state, estimated waiting conditions, payment flow, and check-in support. At the same time, it gives operators tools to manage station records, queue progression, stock visibility, payment visibility, and access control.

### 1.1 What FuelFinder Does
FuelFinder helps users answer a very practical question: "Where should I go for fuel right now, and what will happen when I get there?" To answer that question, the platform combines location-aware station discovery with live or near-live service information. A customer can identify nearby stations, compare options, route to a selected location, reserve a queue slot, pay digitally, and later confirm their presence through a check-in flow.

From the station side, the platform supports the operational tasks that make that customer experience possible. Staff and managers can observe queue conditions, advance the queue, update station information, monitor fuel inventory, manage payments, and control user access based on role and scope. This means FuelFinder is not only a consumer application; it is also a service coordination and operations platform.

### 1.2 Main System Components
The project currently consists of several connected parts:
- A React Native (Expo) mobile app for customers.
- A Node.js/Express backend with MongoDB for authentication, station records, queue processing, payments, check-in, and realtime events.
- Owner and administrative capabilities for station, payment, user, and location management.
- Integrations for maps, routing, and geospatial station discovery using OpenStreetMap/Overpass and OSRM.
- Payment integrations using Chapa and Telebirr.
- Notification and device-oriented features such as push alerts, biometric support, and offline persistence in the mobile experience.

Together, these components form a complete workflow rather than a collection of unrelated features. The mobile app provides the customer-facing interface, the backend enforces business rules and data consistency, and the management side supports the operational reality of stations and staff.

### 1.3 High-Level User Flow
At a high level, the FuelFinder experience works like this:
1. A user opens the mobile app and authenticates or restores an existing session.
2. The app uses the user's location to fetch nearby fuel or electric stations.
3. The user reviews useful information such as distance, fuel status, queue conditions, route options, and station details.
4. The user selects a station and may reserve a queue slot or join the queue directly.
5. If required, the user completes a digital payment flow.
6. The backend updates the user's reservation or queue ticket state.
7. Realtime or refreshed data helps the user track progress while waiting.
8. When arriving at the station, the user completes the check-in process.
9. Station staff validate the customer and continue queue handling from the operator side.

This end-to-end flow is important because it shows that FuelFinder is not limited to pre-visit discovery. The platform is designed to support the full customer journey from finding a station to receiving service at the station.

### 1.4 Main Functional Areas
FuelFinder can be understood through its main functional areas:

Station discovery and mapping:
- Finds nearby fuel or electric stations.
- Uses geographic search and route calculation.
- Supports location-aware browsing and station comparison.

Queue management:
- Allows users to reserve or join a station queue.
- Tracks queue position and status changes.
- Supports station-side queue progression and ticket handling.

Payments:
- Supports reservation-linked digital payment flows.
- Integrates with Telebirr and Chapa.
- Helps confirm reservations and improve transaction traceability.

Check-in and validation:
- Helps confirm that a customer has actually arrived at the station.
- Supports OTP and QR-oriented check-in flows.
- Reduces disorder between reservation and actual service.

Realtime communication:
- Pushes queue and station updates through realtime events.
- Keeps station state more useful during fast-changing conditions.
- Supports a more responsive customer and staff experience.

Station operations:
- Enables staff, station managers, organization admins, and super admins to work with different permission levels.
- Supports station profile updates, user access management, payment review, and stock-related operations.
- Connects customer-facing information with back-office control.

Localization and resilience:
- Supports multiple Ethiopian languages.
- Uses Ethiopia-oriented location directory data.
- Includes offline storage and deferred sync behavior in the mobile experience for selected actions.

### 1.5 Supported Users And Roles
The platform is built for more than one category of user. This is one of the key reasons the project has grown beyond a simple mobile app.

Customer users:
- Discover stations.
- View status and queue information.
- Reserve slots, pay, and check in.

Operational users:
- Staff handle queue-related actions.
- Station managers supervise a station and maintain important station data.
- City or organization-level users oversee broader operational scope.

Administrative users:
- Super admins and privileged admins manage stations, users, locations, and system-level configuration tasks.

This role-based design helps ensure that each user sees only the tools and data relevant to their responsibilities.

### 1.6 Why The Architecture Matters
The architecture of FuelFinder reflects the nature of the problem it is solving. Fuel availability, queue status, and station service conditions are dynamic, not static. Because of that, the project needs more than a frontend with a map. It needs:
- a backend that can enforce queue rules and payment state,
- a geospatial data layer for station discovery,
- realtime communication for queue and station updates,
- role-based access control for operators,
- and a mobile experience capable of working under real usage conditions.

This architecture allows FuelFinder to function as a coordinated platform rather than a passive information board.

### 1.7 Overall Scope Of The Current Project
At its current scope, FuelFinder includes:
- customer authentication and session handling,
- nearby station search and routing,
- support for both fuel and electric station records,
- queue reservation and active ticket tracking,
- digital payment integration,
- station check-in workflows,
- realtime queue and station updates,
- multilingual mobile support,
- owner/admin station management capabilities,
- and Ethiopia-focused location directory and station import tooling.

For that reason, FuelFinder should be viewed as a full service platform for fuel access and station coordination. The mobile app is the most visible part of the system, but the complete project also includes backend services, operational workflows, and management tools that make the overall experience possible.

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
