# Tech Stack & Architecture Choices

---

## The Guiding Principle

Every choice here follows one rule: **own the complexity, don't hide it.** Paid services and abstraction libraries are great for shipping fast, but they make it impossible to understand what's actually happening. When something breaks in production — and it will — you need to know exactly what's going on at every layer.

---

## Runtime & Server

**Node.js** is the core runtime. The reason is fundamental to the problem we're solving. Node runs on a single-threaded event loop, which means it doesn't spawn a new thread for every incoming connection. For a system holding thousands of persistent open connections simultaneously, this is exactly the right model. A thread-per-connection approach would exhaust server memory long before we hit serious scale.

**Express** sits on top of Node as the HTTP layer. It handles the REST side of the application — creating matches, fetching match lists, loading historical commentary. Express is deliberately kept thin here. It's not doing the heavy lifting; it's just routing HTTP traffic cleanly. Critically, we wrap Express in Node's native HTTP server so that both the REST API and the WebSocket server can share a single port. One port, two protocols.

---

## Real-Time Communication

**WS library** — not Socket.IO, not Pusher, not Ably. This is the most important technical decision in the project.

Socket.IO is a full management suite built on top of WebSockets. It handles reconnections, rooms, fallbacks, and acknowledgements automatically. That sounds like a good thing until you realize it means you have no idea what's actually happening on the wire. Every message carries hidden overhead. The protocol is Socket.IO's protocol, not the WebSocket protocol.

Managed services like Pusher are even further removed — you don't even run the server. You pay for a black box.

The WS library implements the raw WebSocket protocol with minimal overhead. It maps almost directly to the browser's native WebSocket API. When something goes wrong, there's nowhere to hide — which means there's nowhere to not understand. Once you've built rooms, heartbeats, reconnection logic, and subscription management by hand using WS, picking up Socket.IO later takes about ten minutes because you already know what every feature is doing underneath.

---

## Database

**PostgreSQL** via **Neon** as the managed cloud provider.

The database is the source of truth. WebSockets are the distribution layer. This distinction matters enormously. If a user refreshes their page mid-match, the WebSocket connection closes and reopens — but the match state, the score, the commentary history all need to survive that. They live in the database, not in memory.

PostgreSQL is chosen over a NoSQL alternative because our data has clear relational structure. A commentary event belongs to a match. A match has two teams and a score. These relationships are well-defined and benefit from schema enforcement rather than flexible schema chaos.

Neon specifically because it provides serverless PostgreSQL with instant provisioning — no database server to manage, no connection pool configuration at the start, just a connection string and you're running.

**Drizzle ORM** sits between the application code and the database. Drizzle is chosen over Prisma or raw SQL for a specific reason: it's lightweight, generates standard SQL that you can actually read, and doesn't introduce a separate query engine process. The schema is defined in code, migrations are generated as readable SQL files, and the query builder feels close enough to raw SQL that you're never confused about what query is being sent.

---

## Validation

**Zod** for all input validation on REST endpoints.

Every piece of data coming from the outside world — request bodies, query parameters, URL params — is validated against a Zod schema before it touches the database. This isn't optional safety theatre. Without it, a client sending a string where a number is expected can corrupt data or crash a handler silently.

Zod also serves as the boundary between untyped external input and trusted internal data. Once something passes a Zod schema, the rest of the application can treat it as reliable. The validation errors Zod returns are structured objects, not cryptic strings, which means meaningful error messages can be returned to clients automatically.

---

## Security

**ArcJet** for rate limiting and bot protection.

WebSocket servers face a class of attacks that REST APIs don't. A persistent connection is expensive to maintain. If a bot can open 10,000 connections from a single IP, the server runs out of memory holding sockets before a single real fan connects. Traditional security middleware designed for request-response cycles doesn't map cleanly onto persistent connections.

ArcJet provides two layers of protection. For the REST API, a sliding window rate limiter allows 50 requests per 10-second window per IP — enough headroom for real users, a hard ceiling for scrapers. For WebSocket handshakes, the limit tightens to 5 connection attempts per 2 seconds, stopping connection floods before they complete the upgrade. Bot detection runs on top of both, blocking automated traffic while allowing legitimate crawlers like search engines and link preview generators.

Critically, ArcJet is integrated at the HTTP upgrade event — before the WebSocket handshake completes — not after. Rejecting a bad actor before the tunnel opens is cheaper than opening the tunnel and then closing it.

---

## Architecture Pattern

**Hybrid REST + WebSocket with Pub/Sub subscriptions.**

This is not a choice between REST and WebSockets. It's a deliberate split of responsibility based on what each protocol is actually good at.

REST handles everything that is command-driven or state-retrieval: create a match, get the list of matches, fetch historical commentary for a match that just loaded. These are request-response interactions with clear inputs and outputs. WebSocket would be wasteful here.

WebSockets handle everything that is event-driven: a goal was scored, a commentary event was added, a match status changed. These are server-initiated pushes that happen at unpredictable times. REST would require polling — constant, wasteful, laggy polling — to approximate this behavior.

The pub/sub layer sits inside the WebSocket server. Rather than broadcasting every event to every connected client — which becomes catastrophic at scale — clients explicitly subscribe to specific matches. A fan watching Match A sends a subscribe message with the match ID. From that point, commentary events for Match A are pushed only to clients subscribed to Match A. Events for Match B never reach them. When the client disconnects, all subscriptions are cleaned up immediately to prevent memory from accumulating with dead references.

---

## Observability & Deployment

**Site24/7 APM** for application performance monitoring in production.

Uptime checks — is the server responding yes or no — are not enough for a WebSocket system. The metrics that actually matter are event loop delay (is Node falling behind processing messages), memory growth over time (are ghost connections accumulating), request throughput (how many events per second is the system processing), and handler latency (which specific routes are slowing down under load). Site24/7's APM agent instruments the Node process directly and surfaces all of these without requiring manual instrumentation.

**Hostinger managed Node.js hosting** for deployment.

This is a deliberate rejection of serverless for this specific use case. Serverless platforms like Lambda or Vercel functions are optimized for short-lived requests — they spin up, handle a request, and spin down. A WebSocket connection that stays open for 90 minutes while a match is live is the exact opposite of that model. Managed Node.js hosting provides an always-on runtime where connections persist as long as they need to, without cold starts killing the handshake or platform-imposed timeouts severing live connections.

---

## What's Deliberately Left Out

**No Redis yet.** The pub/sub subscription registry lives in process memory. This works perfectly for a single server instance. The known limitation is that if you run two server instances, a client connected to Server 1 won't receive events broadcast from Server 2. The solution — a Redis message broker as a central broadcast layer — is the next logical step but is intentionally deferred to keep the core architecture legible.

**No Socket.IO.** Understanding why Socket.IO exists is only possible after you've built what it automates. The order matters.

**No managed WebSocket service.** The entire point is to own the implementation. Pusher and Ably are valid production choices for teams optimizing for delivery speed. They're the wrong choice for understanding how any of this works.