# @kitty/signing

Ed25519 request signing for agent → Gateway calls (docs/05 §5). Pure TypeScript: WebCrypto only, no
I/O, no network, no `Buffer`, no Node-only API, no logging.

A bearer token that leaks is immediately usable. Kitty agents instead sign every MCP request with
their own Ed25519 private key plus a timestamp and a nonce, so a leaked header is useless and replays
are rejected.

## Wire format

```
Leash-Agent: agt_01JB…
Leash-Timestamp: 2026-11-02T08:15:30Z     // RFC 3339 UTC, second precision, ±60s
Leash-Nonce: 3f9c…                        // 16 random bytes, base64url, unique for 10 minutes
Leash-Signature: ed25519=<base64url(sig)>
```

The signed message (`\n`-joined):

```
leash-v1
<METHOD uppercased>
<pathname + query, no host>
<timestamp>
<nonce>
<sha256_hex(raw body bytes)>
```

## Agent side

```ts
import { generateAgentKeyPair, signRequest } from "@kitty/signing";

const { publicKey, privateKey } = await generateAgentKeyPair(); // store publicKey in the gateway

const headers = await signRequest({
  agentId,
  privateKey,
  method: "POST",
  path: "/mcp?kitty=kty_01J…",
  body: JSON.stringify(payload),
  now: new Date(),
});
// fetch(url, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body })
```

## Gateway side

```ts
import { createMemoryNonceStore, verifyRequest, type NonceStore, type ResolvePublicKey } from "@kitty/signing";

const result = await verifyRequest({
  headers: c.req.raw.headers,
  method: c.req.method,
  path: new URL(c.req.url).pathname + new URL(c.req.url).search,
  body: rawBodyBytes,
  now: new Date(),
  resolvePublicKey,        // (agentId) => Promise<string | null> — base64url raw public key
  nonceStore,              // { claim(agentId, nonce, expiresAt) } — Postgres in the gateway
});

if (!result.ok) return c.json({ error: result.code }, 401); // MALFORMED_HEADERS | STALE_TIMESTAMP | UNKNOWN_AGENT | BAD_SIGNATURE | NONCE_REPLAY
```

Verification order is parse → timestamp skew → resolve key → verify signature → **claim nonce last**:
only a request whose signature verifies may consume a nonce, so an attacker cannot burn an agent's
nonces.

## Tests

```sh
bun test        # 56 tests, 100% lines + 100% functions (enforced by bunfig.toml)
```
