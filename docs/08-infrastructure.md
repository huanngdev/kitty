# 08 — Infrastructure & Deployment

## 1. Môi trường

| Env | Mục đích | PayPal | Hosting | Dữ liệu |
|---|---|---|---|---|
| `local` | Dev hằng ngày | Sandbox (app "Kitty Dev") | `bun run dev` (Turborepo) + Postgres Docker | Seed |
| `preview` | (tuỳ chọn) PR preview | Sandbox | Render Preview Environments | Seed |
| `demo` | **URL nộp cho judges + quay video** | Sandbox (app "Kitty Demo") | Render | Seed demo cố định + reset script |

**Không có production.** Toàn bộ chạy PayPal **sandbox** đúng yêu cầu hackathon.

## 2. Render Blueprint (`render.yaml`) — phác thảo

> Postgres **không** nằm trong Render: dùng **Neon** (xem §2.1). `render.yaml` chỉ khai báo service.

```yaml
services:
  - type: web
    name: kitty-web
    runtime: docker
    dockerfilePath: ./apps/web/Dockerfile
    dockerContext: .
    healthCheckPath: /api/health
    envVars:
      - key: DATABASE_URL
        sync: false                                # Neon pooled connection string
      - key: DATABASE_URL_UNPOOLED
        sync: false                                # Neon direct connection string (migrations only)
      - key: GATEWAY_URL
        fromService: { type: web, name: kitty-gateway, envVarKey: RENDER_EXTERNAL_URL }
      - key: AGENTS_URL
        fromService: { type: pserv, name: kitty-agents, property: hostport }
      - fromGroup: kitty-web-secrets

  - type: web
    name: kitty-gateway
    runtime: docker
    dockerfilePath: ./apps/gateway/Dockerfile
    dockerContext: .
    healthCheckPath: /health
    envVars:
      - key: DATABASE_URL
        sync: false                                # Neon pooled connection string
      - key: DATABASE_URL_UNPOOLED
        sync: false                                # Neon direct connection string (migrations only)
      - fromGroup: kitty-gateway-secrets      # PAYPAL_CLIENT_SECRET chỉ ở đây

  - type: pserv
    name: kitty-agents
    runtime: docker
    dockerfilePath: ./apps/agents/Dockerfile
    dockerContext: .
    envVars:
      - fromGroup: kitty-agents-secrets       # AI_KEYS_MASTER_KEY, DEMO_LLM_*, agent private keys, Channel3, Zapier, KERNEL, Elastic

  - type: worker
    name: kitty-worker                        # fallback nếu không dùng Render Workflows
    runtime: docker
    dockerfilePath: ./apps/worker/Dockerfile
    dockerContext: .

  - type: cron
    name: kitty-sweeps                        # fallback cron
    schedule: "*/1 * * * *"
    runtime: docker
    dockerfilePath: ./apps/worker/Dockerfile
    dockerContext: .
    dockerCommand: bun src/sweep.ts

  - type: web
    name: kitty-demo-sites
    runtime: static
    buildCommand: curl -fsSL https://bun.sh/install | bash && ~/.bun/bin/bun install && ~/.bun/bin/bun run --filter demo-sites build
    staticPublishPath: apps/demo-sites/dist
```

### 2.1 Neon (serverless Postgres)

Không còn `databases:` trong `render.yaml` — Postgres chạy trên **Neon**:

- Một **Neon project**, mỗi môi trường một **branch**: `main` (prod), `dev`, `preview`, `test`.
- App (web BFF, gateway, worker) kết nối bằng **pooled** connection string → `DATABASE_URL`, driver `postgres` (postgres.js) với `prepare: false` (PgBouncer transaction mode).
- Migrations (`drizzle-kit`) dùng **direct/unpooled** connection string → `DATABASE_URL_UNPOOLED`.
- `@neondatabase/serverless` (HTTP driver) **không** dùng trong `apps/api`: Leash cần transaction tương tác với `SELECT … FOR UPDATE`.

### Dockerfile mẫu cho service Hono/Bun (dùng `turbo prune`)
```dockerfile
# apps/gateway/Dockerfile — tương tự cho agents, worker
FROM oven/bun:1.3 AS prune
WORKDIR /repo
COPY . .
RUN bunx turbo@2 prune gateway --docker

FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY --from=prune /repo/out/json/ .
RUN bun install --frozen-lockfile

FROM oven/bun:1.3 AS run
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prune /repo/out/full/ .
ENV NODE_ENV=production
USER bun
EXPOSE 8787
CMD ["bun", "apps/gateway/src/index.ts"]
```
- Web (`apps/web/Dockerfile`): thêm bước `bun run --filter web build` (chạy `next build`), dùng `output: "standalone"` trong `next.config.ts`, rồi `CMD ["bun", "--bun", "apps/web/server.js"]`. Nếu spike cho thấy Next phải chạy trên Node: dùng base `node:22-slim` + cài Bun để install, chạy `node apps/web/server.js`.
- Render tự inject `PORT`; mọi service đọc `process.env.PORT`.

> Cú pháp chính xác (đặc biệt `fromService`, `dockerCommand`, Workflows) phải kiểm lại theo docs Render khi scaffold. Render Workflows được cấu hình theo docs https://render.com/docs/workflows; nếu tính năng chưa sẵn cho account → dùng `worker` + `cron` ở trên (đã thiết kế outbox để hai cách tương đương).

## 3. Biến môi trường

Mỗi app parse env bằng Zod trong `src/env.ts` (schema riêng cho từng app) — thiếu biến là crash ngay khi khởi động.

### `kitty-gateway` (DUY NHẤT có PayPal secret)
| Biến | Mô tả |
|---|---|
| `DATABASE_URL` | Neon pooled (role `kitty_gateway`) |
| `DATABASE_URL_UNPOOLED` | Neon direct — **chỉ** cho migrations |
| `PAYPAL_ENV` | `sandbox` |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | app sandbox |
| `PAYPAL_WEBHOOK_ID` | id webhook đã đăng ký (dùng verify signature) |
| `PLATFORM_PAYPAL_EMAIL` | email business account platform |
| `GATEWAY_ADMIN_TOKEN` | service token cho web BFF (kèm user id ký HMAC) |
| `GATEWAY_INTERNAL_TOKEN` | token cho worker |
| `LEASH_MAX_EXPIRY_DAYS` | mặc định 30 |
| `LEASH_PROBING_PAUSE` | `true` trong demo |

### `kitty-web`
| Biến | Mô tả |
|---|---|
| `DATABASE_URL` | Neon pooled (role `kitty_web`) |
| `DATABASE_URL_UNPOOLED` | Neon direct — **chỉ** cho migrations |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | auth |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | public, cho JS SDK v6 |
| `GATEWAY_URL`, `GATEWAY_ADMIN_TOKEN` | gọi admin API |
| `AGENTS_URL`, `AGENTS_INTERNAL_TOKEN` | gọi agent runtime |
| `AG_STUDIO_LICENSE_KEY` | trial |
| `BRYNTUM_*` | (trial dùng package trial, không cần key) |

### `kitty-agents`
| Biến | Mô tả |
|---|---|
| `AI_KEYS_MASTER_KEY` | Master key (32 byte, base64) để giải mã LLM API keys của người dùng (BYOK). **Chỉ service agents có** |
| `AI_KEYS_MASTER_KEY_VERSION` | Version của master key, phục vụ rotation |
| `DEMO_LLM_PROVIDER`, `DEMO_LLM_API_KEY`, `DEMO_LLM_DAILY_RUNS` | Key của team, **chỉ** dùng cho tài khoản `is_demo` (demo organizer, judges), có hạn mức ([24](24-byok-ai-models.md) §7) |
| `AGENT_KEYS_JSON` | map `agentId → ed25519 private key` (MVP; xem §6) — hoặc `AGENT_MASTER_SEED` để derive key per agent |
| `GATEWAY_MCP_URL` | `https://kitty-gateway…/mcp` |
| `WEB_APP_API_URL`, `WEB_APP_API_TOKEN` | app tools |
| `CHANNEL3_API_KEY` | |
| `ZAPIER_MCP_URL` (+ token theo docs Zapier) | |
| `ELASTIC_URL`, `ELASTIC_API_KEY` | |
| `KERNEL_API_KEY` | |

### `kitty-worker`
`DATABASE_URL` (đọc outbox), `GATEWAY_INTERNAL_TOKEN`, `AGENTS_URL`, `ELASTIC_*`, `RENDER_*` (Workflows).

Bun tự load file `.env` theo thư mục chạy. Vẫn phải parse bằng Zod để fail sớm, và **mỗi app có `.env` riêng**: không đặt PayPal secret ở `.env` gốc của repo, vì mọi service chạy từ gốc sẽ đọc được.

**File mẫu:** mỗi app có `.env.example` riêng — `apps/web/.env.example`, `apps/api/.env.example`, `apps/gateway/.env.example` (`packages/db` thêm ở task sau) — copy thành `.env` khi dev. **Không có `.env.example` ở gốc repo.** `.gitignore` bỏ qua `.env*` nhưng giữ `.env.example`.

**Port local:** `apps/web` :3000 · `apps/api` :8787 · `apps/gateway` :8788 (agents đặt sau, dự kiến :8789). Mỗi service đọc `PORT` từ env; Render tự inject khi deploy.

**Kiểm tra tự động (CI):** script `scripts/check-env-isolation.ts` — fail nếu `PAYPAL_CLIENT_SECRET` xuất hiện trong env schema của bất kỳ app nào ngoài gateway.

## 4. PayPal sandbox setup

1. developer.paypal.com → **Apps & Credentials** → tạo app **"Kitty Demo"** (sandbox), bật: Payouts, Invoicing, Accept payments.
2. **Sandbox accounts** (Testing Tools → Sandbox Accounts):
   | Vai | Loại | Email gợi ý |
   |---|---|---|
   | Platform (Kitty) | Business | `kitty-platform@…` (tài khoản gắn với app) |
   | Organizer Mai | Personal | `mai.organizer@…` |
   | Members (5) | Personal | `tuan.member@…`, `linh.member@…`, … |
   | Vendors | Business | `homestay@…`, `bus@…`, `catering@…`, `merch-shop@…` |
   | Attacker | Personal | `refund-desk@…` (để chứng minh DENY) |
3. Nạp số dư sandbox lớn cho platform account (để payout được trước khi có đủ tiền thu — chỉ dùng trong test; ledger vẫn chặn theo Kitty).
4. **Webhooks**: đăng ký URL `https://<gateway>/webhooks/paypal` với events: `INVOICING.INVOICE.PAID`, `INVOICING.INVOICE.CANCELLED`, `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTSBATCH.DENIED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.FAILED`, `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`, `PAYMENT.PAYOUTS-ITEM.RETURNED`, `PAYMENT.PAYOUTS-ITEM.BLOCKED`, `PAYMENT.PAYOUTS-ITEM.DENIED`. Lưu `PAYPAL_WEBHOOK_ID`.
5. Local dev: expose gateway bằng tunnel (cloudflared/ngrok) và đăng ký webhook thứ hai cho app "Kitty Dev".
6. Script `scripts/sandbox-check.ts`: lấy token, tạo invoice $1, payout $1 tới vendor, in kết quả → chạy **ngày đầu tiên** để phát hiện sớm quyền Payouts.

## 5. Sponsor accounts checklist

| Sponsor | Việc | Khi nào |
|---|---|---|
| Render | Claim $50 credits, tạo workspace, kiểm Workflows | 16–17/10 |
| APIMatic | Điền form free subscription; cài Context Plugin cho Claude Code | 16/10 |
| Postman | Fork PayPal collection vào workspace Kitty | 17/10 |
| Elastic | Trial 14 ngày (ela.st/elastic-paypal-hackathon) → Serverless project "Search"/"Vector" → **ghi ngày hết hạn, tự gia hạn 30 ngày trước demo** | ~28/10 (để không hết trước judging) |
| AG Grid | Trial 45 ngày | ~20/10 (hết ~04/12 — **cần xin gia hạn trên Discord để phủ judging 1–15/12**) |
| Bryntum | Trial 45 ngày | ~20/10 (như trên) |
| Channel3 | Sign up, key + promo `PAYPAL-HACKATHON-2026` | 28/10 |
| Zapier | Account mới → 14 ngày Pro; cấu hình MCP với Slack + Gmail | **~01/11** (để còn hiệu lực khi quay video; free plan sau đó phải vẫn đủ cho demo) |
| KERNEL | Claim $50 credits | 01/11 |
| Astropods | (COULD) | nếu dư thời gian |

⚠️ **Trial hết hạn trong judging (1–15/12) là rủi ro thật**: demo URL phải vẫn chạy. Giải pháp: (1) hỏi sponsor trên Discord về license cho hackathon; (2) app phải **degrade gracefully** — nếu AG/Bryntum license lỗi vẫn hiển thị (watermark trial chấp nhận được); nếu Zapier/Elastic/KERNEL lỗi → feature flag tắt, core flow vẫn chạy. Ghi trong [20-risks-and-decisions.md](20-risks-and-decisions.md).

## 6. Secrets & keys

- Secrets nằm trong **Render Environment Groups**, mỗi service một group; không bao giờ commit `.env` (chỉ `.env.example`).
- Agent keys: MVP sinh bằng `scripts/gen-agent-keys.ts`; private key vào `kitty-agents-secrets`; public key đăng ký vào Gateway khi tạo agent (`POST /v1/agents`). Mỗi event có 4 agent → derive bằng HKDF từ `AGENT_MASTER_SEED` + `agentId` để không phải quản lý nhiều key thủ công.
- Rotation: `POST /v1/agents/:id/rotate-key` (COULD).

## 7. Observability

| Gì | Công cụ |
|---|---|
| Logs | pino JSON → Render logs |
| Audit (nghiệp vụ) | `leash.audit_events` (append-only) + index Elastic `kitty-audit` |
| Agent traces | Bảng `app.agent_runs` (mỗi tool call, latency, tokens) — hiển thị trên Activity |
| Health | `/health` mỗi service; Render health checks |
| Alerts | Domain event `leash.intent_denied` severity high → Slack (Zapier) |

## 8. Backup & reset demo

- `bun run demo:reset` — xoá dữ liệu event demo, seed lại "Da Lat Offsite" ở trạng thái đầu video. Dùng trước mỗi lần quay và trước judging.
- Neon có **branch + point-in-time restore** (theo plan); với demo, script seed là đủ.

## 9. Chi phí ước tính (tháng 11–12)

| Hạng mục | Ước tính |
|---|---|
| Render (web + gateway + pserv + worker) | ~$30–45/tháng → phủ một phần bởi $50 credits |
| Neon Postgres | Free tier đủ cho demo; ~$19/tháng nếu cần plan trả phí (branch + PITR) |
| LLM (demo key của team, dùng cho dev, video, judges) | ~$20–60. Người dùng thật tự trả qua key của họ (BYOK) |
| Sponsors khác | Free/trial/credits |
