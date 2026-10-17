# Leash Gateway

Hono service that fronts every money action: it verifies signed agent calls, runs
the pure policy engine, reserves funds in the ledger, performs step-up approval and
only then talks to PayPal. It is the **only** app allowed to hold PayPal secrets
(see `AGENTS.md` invariant #1).

Implemented today: `GET /health` and the **Gateway Admin API** under `/v1`
(docs/10-api-spec.md §1) — kitties, agents, leashes (create/top-up/pause/resume/
revoke), verified payees, plus the ledger/contributions/intents/audit feeds. The
money loop (`reserve`/`execute`), approvals, top-up orders and MCP land in later
issues.

## Run

```sh
bun run dev                 # http://localhost:8788
bun run test                # unit + route tests (no DB)
bun run test:integration    # against Neon dev (needs apps/gateway/.env DATABASE_URL)
```

`/v1` requests carry `Authorization: Bearer <GATEWAY_ADMIN_TOKEN>` plus the
`X-Kitty-User` / `X-Kitty-Timestamp` / `X-Kitty-Signature` pair; see
`src/admin/auth.ts` (`signAdminRequest`) and docs/10-api-spec.md §1.1.

Copy `.env.example` to `.env` and fill it in — see `docs/08-infrastructure.md` §3.
