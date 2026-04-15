# Sportz WebSocket — Live Cricket Commentary Platform

A Node.js backend service that polls the Cricbuzz API (via RapidAPI) for live ball-by-ball cricket commentary and broadcasts it in real-time to fans over WebSocket. The data flow is: Cricbuzz REST API → Node.js poller (every 15–30 s) → PostgreSQL (Neon) → WebSocket push to connected fans. The REST and WebSocket server share a single port using Express v5 and the `ws` library.

## Quick Start

See [specs/001-live-sports-commentary-platform/quickstart.md](specs/001-live-sports-commentary-platform/quickstart.md) for the full setup guide including environment variables, database migration, seeding, and end-to-end validation steps.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon pooler connection string |
| `RAPIDAPI_KEY` | Yes | Cricbuzz via RapidAPI — server-side only |
| `ARCJET_KEY` | Yes | ArcJet rate limiting key |
| `ARCJET_ENV` | Dev only | Set to `development` to disable ArcJet blocking locally |
| `PORT` | No | Default: `8000` |
| `POLL_INTERVAL_MS` | No | Default: `15000` (15 s) |
