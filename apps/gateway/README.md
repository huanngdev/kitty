# Leash Gateway

Hono service that fronts every money action: it verifies signed agent calls, runs
the pure policy engine, reserves funds in the ledger, performs step-up approval and
only then talks to PayPal. It is the **only** app allowed to hold PayPal secrets
(see `AGENTS.md` invariant #1).

This is currently a skeleton: only `GET /health` is implemented.

## Run

```sh
bun run dev     # http://localhost:8788
bun run test
```

Copy `.env.example` to `.env` and fill it in — see `docs/08-infrastructure.md` §3.
