<!--
Sync Impact Report - Constitution Update
Version Change: [none] → 1.0.0
Rationale: Initial constitution establishment for real-time sports dashboard backend

Added Sections:
- Core Principles (7 principles focused on real-time systems, code quality, testing, performance)
- Real-Time System Requirements
- Development Workflow
- Governance

Modified Principles: None (initial version)

Templates Requiring Updates:
- ✅ .specify/templates/plan-template.md (verified: Constitution Check section present, aligns with governance)
- ✅ .specify/templates/spec-template.md (verified: Testing requirements align with Principle IV)
- ✅ .specify/templates/tasks-template.md (verified: Test-first workflow matches TDD discipline)

Follow-up TODOs: None
-->

# Sportz WebSocket Dashboard Constitution

## Core Principles

### I. Real-Time First
**MUST** prioritize low-latency communication patterns for all live data flows. WebSocket connections MUST deliver score updates and play-by-play commentary within 10 milliseconds under normal load conditions. All APIs handling live data MUST be designed for streaming over request/response where applicable. Polling is forbidden for real-time features.

**Rationale**: The core value proposition is real-time sports updates. Sub-10ms latency ensures competitive parity with professional sports platforms and maintains user engagement during critical game moments.

### II. Connection Stability & Heartbeat Monitoring
**MUST** implement ping/pong heartbeat mechanisms for all WebSocket connections. Ghost connections (silent disconnects) MUST be detected within 30 seconds. Connection state MUST be tracked with proper cleanup on disconnect. Reconnection logic MUST include exponential backoff with jitter.

**Rationale**: WebSocket connections are fragile over mobile networks and behind firewalls. Proactive health checks prevent resource leaks, server crashes from ghost connections, and ensure reliable real-time delivery.

### III. Message Protocol & Type Safety
**MUST** define explicit message schemas for all WebSocket events using TypeScript interfaces or JSON schemas. Every message MUST include a `type` field for intent routing and a `timestamp` field for ordering. Server MUST validate incoming messages against schemas before processing. Unknown message types MUST be logged and rejected with clear error responses.

**Rationale**: Type-safe messaging prevents runtime errors, enables protocol versioning, simplifies debugging, and makes the system maintainable as event types grow.

### IV. Test-First Development (NON-NEGOTIABLE)
**MUST** write tests before implementation following TDD discipline. Test progression MUST be: (1) Write test cases, (2) User/team approval, (3) Verify tests fail, (4) Implement feature, (5) Verify tests pass. Unit tests MUST cover core business logic (>80% coverage). Integration tests MUST verify WebSocket handshake, message routing, database transactions, and API contracts.

**Rationale**: Real-time systems are difficult to debug in production. TDD catches race conditions, connection edge cases, and data consistency bugs early. Tests serve as living documentation for complex WebSocket flows.

### V. Performance & Scalability Standards
**MUST** measure and enforce performance budgets:
- WebSocket broadcast latency: <10ms (P95)
- Database query response: <50ms (P95)
- API endpoint response: <100ms (P95)
- Memory usage per connection: <5KB
- Maximum concurrent connections: 10,000 (single instance target)

**MUST** implement backpressure handling to prevent memory blowup. Load testing MUST be performed before any release affecting connection handling or message routing.

**Rationale**: Real-time systems fail ungracefully under load. Defined budgets enable early detection of regressions. Backpressure prevents cascading failures during traffic spikes.

### VI. Observability & Structured Logging
**MUST** implement structured logging (JSON format) with correlation IDs across all layers. Log levels MUST follow: ERROR (system failures), WARN (degraded state), INFO (significant business events), DEBUG (diagnostic details). Metrics MUST track: active connections, message throughput, latency percentiles, error rates, database pool utilization. Health check endpoint MUST return service status, dependency health, and key metrics.

**Rationale**: Debugging distributed real-time systems requires tracing individual message flows. Structured logs enable log aggregation, alerting, and forensic analysis. Metrics expose performance degradation before user impact.

### VII. Security & Rate Limiting
**MUST** implement rate limiting on WebSocket connections (message rate) and REST endpoints (request rate). Authentication MUST be validated before WebSocket upgrade. Input validation MUST sanitize all user-provided data. DDoS protection MUST be enabled at application layer (e.g., Arcjet). Secrets MUST never be committed to version control.

**Rationale**: WebSocket endpoints are DDoS vectors. Message flooding can crash servers. Rate limiting protects service availability. Input validation prevents injection attacks.

## Real-Time System Requirements

### Technology Stack (Mandatory)
- **Runtime**: Node.js (LTS version, event-driven architecture for WebSocket scalability)
- **Web Framework**: Express.js (REST API, WebSocket handshake, middleware)
- **WebSocket Library**: `ws` (native WebSocket implementation for maximum control)
- **Database**: PostgreSQL (relational data integrity, JSONB for flexible schemas)
- **ORM**: Drizzle ORM (type-safe queries, migration management, zero runtime overhead)
- **Security**: Arcjet (rate limiting, bot protection, DDoS mitigation)
- **Monitoring**: Site24x7 or equivalent (uptime, latency, error tracking)

### Architecture Constraints
- **Separation of Concerns**: WebSocket logic MUST be decoupled from HTTP routes. Database access MUST go through repository layer. Business logic MUST be framework-agnostic.
- **Database Connection Pooling**: MUST use connection pooling with limits (max 20 connections per instance). Long-running queries MUST be avoided in real-time message handlers.
- **Environment Configuration**: MUST use `.env` files for secrets and environment-specific config. MUST never hardcode credentials, API keys, or connection strings.

### Message Patterns
- **Broadcast**: Send to all connected clients (e.g., score updates for popular matches)
- **Unicast**: Send to specific client (e.g., user-specific notifications)
- **Room/Channel**: Send to subscribed clients (e.g., specific match subscribers)
- **Pub/Sub**: Decouple publishers from subscribers for scalability (future: Redis pub/sub for multi-instance scaling)

### Error Handling
- Network errors MUST trigger client reconnection logic
- Database errors MUST be logged with context, clients receive generic error message
- Invalid messages MUST be rejected with descriptive error sent to client
- Server errors MUST NOT crash the process (graceful degradation)

## Development Workflow

### Code Quality Gates
1. **Linting**: MUST pass ESLint checks with Airbnb or Standard config (zero warnings tolerance)
2. **Type Safety**: MUST use JSDoc for type hints or migrate to TypeScript for critical modules
3. **Code Review**: AI code review (CodeRabbit) MUST pass before merge. Human review MUST verify business logic correctness and security implications
4. **Testing**: MUST pass all unit tests, integration tests, and load tests before merge

### Git Workflow
- **Feature Branches**: All work MUST happen on feature branches (`feature/<name>`)
- **Commit Messages**: MUST follow conventional commits (feat, fix, chore, docs, test, refactor)
- **Pull Requests**: MUST include description, test plan, performance impact assessment
- **Main Branch Protection**: MUST pass all CI checks before merge

### Database Migrations
- Schema changes MUST use Drizzle migrations (`npm run db:generate`, `npm run db:migrate`)
- Migrations MUST be reversible where possible
- Production migrations MUST be tested on staging environment first
- Breaking schema changes MUST include migration plan and downtime estimates

### Testing Strategy
- **Unit Tests**: Pure functions, business logic, data transformations
- **Integration Tests**: WebSocket handshake, message routing, database CRUD, API endpoints
- **Load Tests**: WebSocket connection limits, message throughput, database query performance
- **Manual Testing**: UI integration, cross-browser WebSocket compatibility, network resilience

## Governance

### Constitutional Authority
This constitution supersedes all other practices, coding guidelines, and architectural decisions. Any deviation MUST be documented with justification and approval from project maintainers.

### Amendment Process
1. Propose change via pull request to this file
2. Document rationale, impact analysis, migration plan
3. Obtain approval from majority of maintainers
4. Update version number according to semantic versioning
5. Propagate changes to dependent templates and documentation

### Compliance Verification
- All pull requests MUST reference constitution principles where applicable
- Code reviews MUST verify adherence to performance budgets, testing standards, and security requirements
- Quarterly audits MUST assess compliance with architectural constraints and logging standards

### Complexity Justification
Any introduction of new libraries, frameworks, or architectural patterns MUST include written justification addressing:
- Problem being solved that existing stack cannot handle
- Performance implications
- Maintenance burden
- Learning curve for team

### Runtime Development Guidance
For day-to-day development instructions beyond constitutional principles, refer to project README.md and inline code documentation.

**Version**: 1.0.0 | **Ratified**: 2026-04-12 | **Last Amended**: 2026-04-12
