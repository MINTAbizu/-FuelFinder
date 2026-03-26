# FuelFinder Backend (Node.js + MongoDB)

## Stack
- Node.js + Express
- MongoDB + Mongoose
- Socket.IO (realtime queue updates)

## Quick Start
1. `cd backend`
2. `cp .env.example .env`
3. Set `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `CLIENT_ORIGIN` in `.env`
4. `npm install`
5. `npm run dev`

Server runs on `http://localhost:5000` by default.

`CLIENT_ORIGIN` can be a comma-separated list such as
`http://localhost:5174,https://fuel-centeral-command.netlify.app,https://fuel-command-center-station.netlify.app`.
Wildcard entries such as `https://*.netlify.app` are also supported.

## API
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout` (Bearer token)
- `GET /api/auth/me` (Bearer token)
- `GET /api/admin/regions`
- `POST /api/admin/regions`
- `PATCH /api/admin/regions/:regionId`
- `GET /api/admin/cities`
- `POST /api/admin/cities`
- `PATCH /api/admin/cities/:cityId`
- `POST /api/admin/locations/seed-ethiopia`
- `POST /api/queue/join`
- `POST /api/queue/reserve`
- `POST /api/queue/payments/telebirr/auth-token`
- `POST /api/queue/payments/telebirr/initiate`
- `POST /api/queue/payments/telebirr/webhook`
- `POST /api/queue/confirm-payment`
- `GET /api/queue/me/:stationId`
- `POST /api/queue/leave`
- `GET /api/queue/station/:stationId`
- `POST /api/queue/next`
- `GET /api/map/cities`
- `GET /api/map/stations`

Queue reservation flow:
1. `POST /api/queue/reserve` with `stationId`, `requestedBand` (`10-20|20-40|40+`), optional `fuelType`.
2. Optional MiniApp: `POST /api/queue/payments/telebirr/auth-token` with `authToken`.
3. `POST /api/queue/payments/telebirr/initiate` with `reservationId` to get `prepayId` and `rawRequest`.
4. Start in-app payment with Telebirr `js_fun_start_pay` using `rawRequest`.
5. Telebirr calls `/api/queue/payments/telebirr/webhook`, reservation moves to `waiting`.
6. Optional fallback: `POST /api/queue/confirm-payment` with `reservationId` + `paymentReference`.

Telebirr env vars:
- `TELEBIRR_BASE_URL`
- `TELEBIRR_FABRIC_TOKEN_PATH` (default `/payment/v1/token`)
- `TELEBIRR_AUTH_TOKEN_PATH` (default `/payment/v1/auth/authToken`)
- `TELEBIRR_PRE_ORDER_PATH` (default `/payment/v1/merchant/preOrder`)
- `TELEBIRR_FABRIC_APP_ID` (or `TELEBIRR_X_APP_KEY`)
- `TELEBIRR_APP_SECRET`
- `TELEBIRR_MERCHANT_APP_ID` (merchant appid)
- `TELEBIRR_MERCHANT_CODE` (merch_code)
- `TELEBIRR_PRIVATE_KEY` (RSA private key PEM)
- `TELEBIRR_CALLBACK_URL` (should point to `/api/queue/payments/telebirr/webhook`)
- `TELEBIRR_RETURN_URL` (optional)
- `TELEBIRR_RECEIVE_NAME` (optional)
- `TELEBIRR_SUBJECT` (optional)
- `TELEBIRR_WEBHOOK_SECRET` (recommended)

Quick flow test (reserve -> auth-token -> initiate):
`npm run telebirr:flow -- --baseUrl=https://fuelfinder-2.onrender.com --bearer=<ACCESS_TOKEN> --stationId=<STATION_ID> --authToken=<TELEBIRR_APP_TOKEN> --requestedBand=10-20 --fuelType=gasoline`

## Auth
Protected endpoints use:
- `Authorization: Bearer <accessToken>`

## Ethiopia Location Directory
- Stations can now store `regionId`, `cityId`, `subcity`, `woreda`, `landmark`, and `locationCategories`.
- The built-in `src/data/ethiopiaLocations.js` file is only a starter directory, not the full Ethiopia administrative list.
- Seed the built-in starter directory:
  `npm run locations:seed`
- Re-seed and overwrite matching seed records:
  `npm run locations:seed -- --overwrite`
- Seed the included business-facing 12-region Ethiopia directory:
  `npm run locations:seed -- --file=./examples/ethiopia-locations.business-12.json --overwrite`
- Seed a full custom Ethiopia hierarchy from JSON:
  `npm run locations:seed -- --file=./examples/ethiopia-locations.import.template.json --overwrite`

Example admin station payload:
```json
{
  "name": "Bole Fuel Center",
  "address": "Bole Road, Addis Ababa",
  "regionId": "<REGION_ID>",
  "cityId": "<CITY_ID>",
  "subcity": "Bole",
  "woreda": "03",
  "landmark": "Near Millennium Hall",
  "locationCategories": ["airport-corridor", "24-7", "cashless"],
  "latitude": 8.9806,
  "longitude": 38.7578
}
```

Import stations from JSON:
`npm run stations:import -- --file=./stations.json`

If you want every Ethiopia region, city, woreda, and station in the root admin page:
1. Prepare a full hierarchy JSON file using `examples/ethiopia-locations.import.template.json`
2. Seed it with:
   `npm run locations:seed -- --file=./path/to/ethiopia-locations.full.json --overwrite`
3. Prepare a station JSON file using `examples/stations.import.template.json`
4. Import it with:
   `npm run stations:import -- --file=./path/to/ethiopia-stations.full.json`

The owner root admin page will then display all imported regions and cities, including places that do not yet have stations.

Import Ethiopia fuel stations directly from OpenStreetMap:
1. Export a nationwide OSM station file:
   `npm run stations:export-osm -- --out=./exports/ethiopia-osm-stations.json`
2. Import it into MongoDB:
   `npm run stations:import -- --file=./exports/ethiopia-osm-stations.json`

Important for city browsing:
- The plain OSM export only guarantees coordinates and basic station metadata.
- To browse "all stations in a city", station records must have `regionId` and `cityId`.
- The safest way to get that is either:
  `npm run stations:export-osm -- --out=./exports/ethiopia-osm-stations.json --reverse --nominatimUrl=http://localhost:8080`
  and then import it, or import your own JSON that already includes `regionName` and `cityName`.

Optional location enrichment with your own Nominatim instance:
`npm run stations:export-osm -- --out=./exports/ethiopia-osm-stations.json --reverse --nominatimUrl=http://localhost:8080`

Backfill human-readable address, region, city, and woreda for already imported OSM stations:
1. Dry run:
   `npm run stations:backfill-location -- --nominatimUrl=http://localhost:8080 --limit=100`
2. Apply:
   `npm run stations:backfill-location -- --nominatimUrl=http://localhost:8080 --limit=100 --apply`

If the backfill script says it cannot reach `http://localhost:8080`, your Nominatim service is not running yet or is not reachable from this machine.

Fastest safe fallback when geocoding is unavailable:
1. Dry run a conservative text-based city matcher:
   `npm run stations:backfill-location-text -- --limit=500`
2. Apply the high-confidence matches:
   `npm run stations:backfill-location-text -- --limit=500 --apply`

Notes for OSM import:
- The exporter uses Overpass to fetch `amenity=fuel` features in Ethiopia.
- Reverse enrichment is opt-in and requires `--nominatimUrl`. This is intended for your own Nominatim instance or another approved geocoder.
- OSM is community-maintained, so it may still miss some stations or use inconsistent city/woreda names.
- OpenStreetMap data has attribution and license requirements. See: https://www.openstreetmap.org/copyright
- The public Nominatim service is not intended for nationwide bulk geocoding. See: https://operations.osmfoundation.org/policies/nominatim/

Supported station import fields:
- `name`, `address`, `latitude`, `longitude`
- `regionId` or `regionName`
- `cityId` or `cityName`
- `woredaId` or `woredaName`
- `subcity`, `woreda`, `landmark`
- `locationCategories`
- `contact`, `fuelStatus`, `isActive`
- `externalSource`, `externalSourceId`

Register payload:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+251900000000",
  "password": "StrongP@ssw0rd"
}
```

Login payload:
```json
{
  "email": "john@example.com",
  "password": "StrongP@ssw0rd"
}
```

Refresh payload:
```json
{
  "refreshToken": "<refresh token>"
}
```

## Socket.IO
Clients can join room:
- `join_station_room` with `<stationId>`

Events:
- `queue_updated`
- `ticket_called`
