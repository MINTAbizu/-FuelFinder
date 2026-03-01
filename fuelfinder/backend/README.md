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

## API
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout` (Bearer token)
- `GET /api/auth/me` (Bearer token)
- `POST /api/queue/join`
- `POST /api/queue/reserve`
- `POST /api/queue/confirm-payment`
- `GET /api/queue/me/:stationId`
- `POST /api/queue/leave`
- `GET /api/queue/station/:stationId`
- `POST /api/queue/next`

Queue reservation flow:
1. `POST /api/queue/reserve` with `stationId`, `requestedBand` (`10-20|20-40|40+`), optional `fuelType`.
2. Complete payment in client/payment gateway.
3. `POST /api/queue/confirm-payment` with `reservationId` + `paymentReference`.
4. Ticket becomes `waiting` and gets a queue `position`.

## Auth
Protected endpoints use:
- `Authorization: Bearer <accessToken>`

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
