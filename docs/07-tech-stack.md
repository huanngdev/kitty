# 07 — Tech Stack

> Stack chốt: **Turborepo + Bun + Next.js (latest) + Hono chạy trên Bun**.
> Nguyên tắc chọn: **ship nhanh trong 27 ngày**, **một runtime + một ngôn ngữ**, **type-safe đầu-cuối**, mỗi lựa chọn đều có lý do, và ưu tiên công cụ sponsor khi thật sự hợp.
> Version dưới đây là bản mới nhất trên npm tại **16/10/2026**. Pin chính xác trong `package.json` khi scaffold; luôn đọc docs hiện hành trước khi dùng API của thư viện.

## 1. Bộ ba lõi

### 1.1 Turborepo — điều phối monorepo
| Mục | Giá trị |
|---|---|
| Version | `turbo@2.11.x` |
| Vai trò | Chạy task (`dev`, `build`, `test`, `typecheck`, `lint`) theo dependency graph giữa `apps/*` và `packages/*`, cache kết quả, chạy song song |
| Package manager | **Bun workspaces** (`"workspaces": ["apps/*", "packages/*"]`, lockfile `bun.lock`), khai báo `"packageManager": "bun@1.3.14"` để Turborepo nhận đúng |
| Deploy | `turbo prune <app> --docker` để build image tối thiểu cho từng service |

`turbo.json` (phác thảo):
```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "dev":       { "cache": false, "persistent": true },
    "test":      { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^typecheck"] },
    "lint":      {}
  }
}
```

**Q: Vì sao Turborepo chứ không phải Bun workspaces trơn hay Nx?**
A: Bun workspaces lo cài đặt và liên kết package, nhưng không có task graph và cache. Turborepo thêm đúng hai thứ đó mà gần như không cần cấu hình. Nx mạnh hơn nhưng nặng, không đáng với 27 ngày.

### 1.2 Bun — runtime + package manager + test runner
| Mục | Giá trị |
|---|---|
| Version | `bun@1.3.14` (đã cài trên máy dev) |
| Dùng cho | Cài package, chạy script, **runtime cho Hono services** (gateway, agents, worker), **runtime cho Next.js** (`bun --bun next …`, có fallback Node — §1.3), test runner (`bun test`) |
| Tính năng tận dụng | Chạy TypeScript trực tiếp (không cần build cho services), tự load `.env`, `Bun.serve` nhanh, Web Crypto (Ed25519), `bun test` tương thích Jest, `bun build --compile` (tuỳ chọn) |

**Q: Vì sao Bun?**
A: Một công cụ thay cho 4 thứ (Node + pnpm + tsx + Vitest). Hono được thiết kế cho runtime Web-standard như Bun nên chạy gọn: `export default app` là xong. Cài và khởi động nhanh hơn nhiều, nên vòng lặp dev ngắn lại.

**Q: Rủi ro của Bun là gì?**
A: Một số package Node dùng API ít phổ biến có thể lệch hành vi. Các SDK quan trọng (AI SDK và provider packages, MCP SDK, postgres.js, Drizzle, Better Auth) đều chạy trên Bun, nhưng vẫn phải **spike ngày 17/10** (xem §6). Nếu một package lỗi trên Bun, chỉ service dùng nó chuyển sang Node; code không đổi vì ta chỉ dùng Web-standard API.

### 1.3 Next.js (latest) — frontend + BFF
| Mục | Giá trị |
|---|---|
| Version | **`next@16.x` (latest: 16.4.2)** + `react@19.3` / `react-dom@19.3` |
| Router | App Router, React Server Components, Server Actions cho mutation đơn giản |
| Bundler | Turbopack (mặc định cho `next dev` và `next build` ở Next 16) |
| Runtime | `bun --bun next dev` / `bun --bun next start`. **Fallback:** `bun run next start` (Next tự chạy trên Node) nếu spike thấy lỗi |
| Middleware | Next 16 dùng file `proxy.ts` (tên mới của `middleware.ts`) cho auth redirect |
| Gọi gateway/agents | Qua **axios** + **TanStack Query**, contract là Zod schema trong **`@kitty/shared`** (type = `z.infer`). *(Hono RPC `hc<AppType>` đã được cân nhắc và thay thế — xem ADR-016.)* |

**Q: Vì sao không làm frontend bằng Hono JSX hoặc Vite SPA cho đồng bộ với Bun?**
A: Trang `/pay` public cần SSR nhanh; AG Studio và Bryntum có wrapper React tốt; Next cho routing, layout, auth và streaming chat sẵn. Hono vẫn là backend cho mọi service còn lại.

### 1.4 Hono trên Bun — mọi backend service
| Mục | Giá trị |
|---|---|
| Version | `hono@4.13.x` |
| Services | `apps/gateway` (Leash Gateway), `apps/agents` (agent runtime), `apps/worker` (jobs/outbox) |
| Entry | `export default { port: env.PORT, fetch: app.fetch }` → Bun tự `serve`. Mỗi app khai báo default trong `src/env.ts` (api 8787, gateway 8788) |
| Middleware dùng | `hono/logger` (thay bằng pino), `hono/secure-headers`, `hono/body-limit`, `hono/timeout`, `zValidator` (`@hono/zod-validator`), middleware tự viết `leashSignature()` cho Ed25519 |
| MCP | **`@hono/mcp@0.3.x` + `@modelcontextprotocol/sdk@1.32.x`**: Streamable HTTP transport gắn vào route `POST /mcp` của gateway |
| Type sharing | Contract là Zod schema trong **`@kitty/shared`** (`z.infer` cho type). Không dùng Hono RPC `hc<AppType>` (xem ADR-016) |
| Raw body cho webhook | `await c.req.text()` trước khi parse JSON (cần raw cho verify chữ ký PayPal) |

Ví dụ entry gateway:
```ts
// apps/gateway/src/index.ts
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { adminRoutes } from "./admin";
import { mcpRoutes } from "./mcp";
import { webhookRoutes } from "./webhooks";
import { env } from "./env"; // zod-validated

const app = new Hono()
  .use(secureHeaders())
  .get("/health", (c) => c.json({ ok: true }))
  .route("/v1", adminRoutes)
  .route("/mcp", mcpRoutes)
  .route("/webhooks", webhookRoutes);

export type GatewayApp = typeof app;
export default { port: env.PORT, fetch: app.fetch };
```

## 2. Toàn bộ stack

| Lớp | Lựa chọn | Thay thế đã cân nhắc | Lý do |
|---|---|---|---|
| Ngôn ngữ | **TypeScript 5.x strict** toàn bộ | Python cho agents | Share types (Leash, events, money) giữa mọi service |
| Monorepo | **Turborepo 2.11** | Nx, Bun workspaces trơn | Task graph + cache, cấu hình tối thiểu |
| Runtime + PM | **Bun 1.3.14** | Node 22 + pnpm | Một công cụ; Hono native; dev loop nhanh |
| Frontend | **Next.js 16.4 (App Router) + React 19.3** | Vite SPA, Hono JSX | SSR `/pay`, ecosystem React cho AG/Bryntum |
| UI components | **shadcn/ui** (+ `lucide-react`) | MUI, Chakra, Ant | Mọi component đến từ shadcn/ui hoặc compose từ primitive; không thêm component library khác |
| HTTP client (web) | **axios** (một instance/app ở `src/lib/http.ts`) | `fetch` trực tiếp | baseURL từ env, `withCredentials` cho cookie Better Auth, interceptor normalize lỗi |
| Server state | **TanStack Query v5** | SWR, tự viết | Cache + invalidation; query key factory; `queryOptions()` |
| Form | **react-hook-form + `@hookform/resolvers/zod`** | Formik | Schema lấy từ `@kitty/shared` |
| Client state | React state trước; **Zustand** (tuỳ chọn) | Redux | Chỉ cho cross-component client state; không chứa server data |
| Data contracts | **`@kitty/shared` (Zod v4)** | Hono RPC `hc<AppType>` | Một nguồn sự thật cho web + api; type = `z.infer` |
| Styling | **Tailwind CSS 4 + `cn()` (clsx + tailwind-merge)** | CSS-in-JS | Nhanh; token dùng chung với AG Studio/Bryntum |
| Gantt/Scheduler/Calendar | **Bryntum (React wrappers, trial)** | frappe-gantt | Sponsor; dependency engine thật cho payment gate |
| Dashboard | **AG Studio (React) + Studio Agent Framework** | Recharts | Sponsor; NL → widget |
| Backend HTTP | **Hono 4.13 trên Bun** | Express, Fastify, Elysia | Web-standard, nhẹ, RPC types, middleware gọn |
| MCP | **`@hono/mcp` + `@modelcontextprotocol/sdk`** (Streamable HTTP) | stdio | Gateway là MCP server từ xa |
| DB | **Neon** (serverless PostgreSQL 16) | Render Postgres, SQLite | Branch theo dev/preview/test; pooled URL cho app, unpooled cho migrations; `SELECT … FOR UPDATE` cần TCP |
| Object storage | **Cloudflare R2** (S3 API + presigned URL) | S3, GCS | Chỉ khi cần file; browser upload trực tiếp, key/metadata ở Postgres |
| ORM / driver | **Drizzle ORM 0.45 + `postgres` (postgres.js)** | Prisma, `Bun.sql` | Chạy cả Bun lẫn Node (giữ được fallback); kiểm soát transaction/lock |
| Migrations | **drizzle-kit** (`bunx drizzle-kit generate/migrate`) | | |
| Validation | **Zod** (+ `@hono/zod-validator`) | Valibot | Env, API, MCP tool input, events |
| Auth | **Better Auth 1.7** (email + password, demo accounts seed sẵn) | Auth.js, Clerk | Judges login bằng credentials trong README; chạy trên Bun |
| LLM | **BYOK: người dùng tự mang API key + chọn model** (Anthropic, OpenAI, Google, OpenRouter, OpenAI-compatible). App không cung cấp model ([24](24-byok-ai-models.md)) | App trả tiền model | Không cần billing trong hackathon; người dùng tự chọn model; an toàn tiền không phụ thuộc model |
| Lớp provider LLM | **Vercel AI SDK `ai@7.x`** + `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider`, `@ai-sdk/openai-compatible` | Tự viết adapter cho từng provider | Một interface tool calling cho mọi provider |
| Mã hoá API key | **`packages/crypto-box`**: envelope encryption AES-256-GCM (Web Crypto) | Lưu plaintext, KMS ngoài | Đủ an toàn cho hackathon, chạy được cả Bun lẫn Node |
| Agent loop | Tự viết (tool-use loop + MCP client), gọi model qua AI SDK | LangGraph, Claude Agent SDK | Kiểm soát hoàn toàn, dễ giải thích, không bị khoá vào một provider |
| Signing | **Ed25519** qua `@noble/curves` | Web Crypto, HMAC | Cùng một code chạy ở mọi runtime; Gateway chỉ giữ public key |
| IDs | **ULID có prefix** (`ulidx`) | UUID | Sắp theo thời gian, dễ đọc log |
| Money | **Integer cents (`bigint`)** + helper `Money` | float, decimal.js | Không sai số |
| Jobs | **Render Workflows** | BullMQ + Redis | Sponsor; fallback: worker Hono/Bun poll outbox + Render Cron |
| Search/RAG | **Elastic Serverless** (`semantic_text` + Jina, hybrid) | pgvector | Sponsor |
| Product data | **Channel3 API/MCP** | scraping | Sponsor |
| Browser agent | **KERNEL** (+ `playwright-core` qua CDP) | Browserbase | Sponsor |
| Notifications | **Zapier MCP** (Slack, Gmail, Calendar) | Slack SDK | Sponsor; không phải tự build OAuth |
| Unit/integration test | **`bun test`** + **fast-check** (property) | Vitest | Có sẵn trong Bun, API giống Jest |
| HTTP mock | **MSW 2** (`msw/node`, mock qua axios adapter) | nock | Mock PayPal API |
| E2E | **Playwright** (`bunx playwright test`) | Cypress | |
| Lint + format | **ESLint 10 (flat config qua `@kitty/eslint-config`) + Prettier 3 (`@kitty/prettier-config`)** | Biome | Chuẩn phổ biến; tách plugin theo framework (Next/Hono); format ổn định và đồng nhất toàn monorepo |
| Logging | **pino** (JSON) | console | Có redact secrets |
| CI | **GitHub Actions** + `oven-sh/setup-bun` + Turborepo cache | | typecheck · lint · test · env-isolation |
| Hosting | **Render** (Blueprint `render.yaml`, Docker runtime với image `oven/bun:1.3`) | Vercel + Fly | Sponsor; mọi service một chỗ |
| API dev | **Postman** | | Sponsor |
| AI coding | **Claude Code + APIMatic Context Plugin cho PayPal** | | Sponsor |

## 3. Model LLM theo vai

**Model do người dùng chọn** (BYOK, xem [24-byok-ai-models.md](24-byok-ai-models.md)). Kitty chỉ đưa ra **gợi ý mặc định** khi người dùng dùng key Anthropic:

| Vai | Gợi ý | Yêu cầu tối thiểu với mọi model |
|---|---|---|
| Planner | `claude-opus-5-5` | Tool calling + structured output |
| Shopper, Treasurer | `claude-sonnet-5-5` | Tool calling |
| Collector (nhắc nợ ngắn) | `claude-haiku-5-5` | Tool calling |

Tài khoản demo/judge dùng **demo key** của team, có hạn mức ([24](24-byok-ai-models.md) §7).

> Trước khi code phần gọi Anthropic: kiểm lại model ID, giá và tham số hiện hành (skill `claude-api`). Với provider khác: đọc docs của provider đó và của AI SDK.

## 4. PayPal

| Nhu cầu | Dùng |
|---|---|
| Server-side REST | **`packages/paypal`**: client mỏng tự viết trên **axios** (instance riêng, OAuth2 client credentials có cache, retry, `PayPal-Request-Id`). Chỉ gateway import |
| Tham khảo schema | PayPal Server SDK (TypeScript) / APIMatic Context Plugin |
| Agent tools | **Không đưa PayPal Agent Toolkit trực tiếp cho agent.** Gateway có thể dùng Toolkit *bên trong*, sau khi policy ALLOW (ADR-007) |
| Client checkout | **PayPal JS SDK v6** trên trang `/pay` và trang nạp quỹ |

## 5. Cách chạy

```bash
bun install                         # cài toàn bộ workspace
bun run dev                         # turbo run dev → web :3000, api :8787, gateway :8788, agents :8789 (sau), worker
bun run build                       # turbo run build
bun run test                        # turbo run test (bun test trong từng package)
bun run check-types                 # turbo run check-types (tsc --noEmit)
bun run check:env-isolation         # fail nếu PAYPAL_CLIENT_SECRET lọt ra ngoài apps/gateway
bun run lint                        # eslint .
bun run --filter gateway dev        # chạy riêng một service
bunx drizzle-kit migrate            # migrate DB
```

Script trong từng app:
| App | `dev` | `start` |
|---|---|---|
| `apps/web` | `bun --bun next dev` | `bun --bun next start` |
| `apps/gateway` | `bun --hot src/index.ts` | `bun src/index.ts` |
| `apps/agents` | `bun --hot src/index.ts` | `bun src/index.ts` |
| `apps/worker` | `bun --hot src/index.ts` | `bun src/index.ts` (`bun src/sweep.ts` cho cron) |

Services Hono chạy thẳng file `.ts`, không cần bước build; `build` chỉ chạy `tsc --noEmit` để kiểm type. Riêng Next có `next build`.

## 6. Spike ngày 17/10 (bắt buộc trước khi code nhiều)

| Kiểm | Pass khi | Nếu fail |
|---|---|---|
| `bun --bun next build && start` với Next 16.4 + Tailwind 4 + Better Auth | Trang + auth chạy | Next chạy trên Node (`bun run next start`); Render image cài thêm Node |
| AG Studio + Bryntum render trong Next 16 (client components, `dynamic(..., { ssr: false })`) | Hiển thị đúng | Bọc trong client-only component; báo sponsor trên Discord |
| `@hono/mcp` + MCP SDK trên Bun: agent client gọi tool được qua Streamable HTTP | Tool call thành công | Dùng transport của MCP SDK trực tiếp với `c.req.raw` |
| postgres.js + Drizzle transaction `FOR UPDATE` trên Bun | 2 transaction đồng thời bị serialize | `Bun.sql` driver của Drizzle |
| AI SDK (`ai@7`) + `@ai-sdk/anthropic` + `@ai-sdk/openai-compatible` streaming và tool calling trên Bun | Stream + tool call được với ít nhất 2 provider | Chạy agents trên Node |
| Render deploy Docker image `oven/bun:1.3` | Health check xanh | Native runtime + cài Bun trong build command |

Ghi kết quả vào ADR-008 ở [20-risks-and-decisions.md](20-risks-and-decisions.md).

## 7. Quy ước code

- ESM, path alias `@kitty/*` cho packages (khai báo trong `tsconfig` base ở `packages/config`).
- Không `any`. Zod parse tại mọi biên (HTTP, MCP tool input, webhook, env).
- Chỉ dùng API Web-standard/đa runtime (`Request`, `Response`, `crypto`, axios) trong `packages/*`. Không dùng API riêng của Bun (`Bun.*`) trong packages, để giữ được fallback sang Node. `Bun.*` chỉ được dùng trong entry file của apps.
- Tiền: chỉ dùng `Money` (cents bigint) trong domain; convert sang string ở biên.
- Thời gian: lưu UTC `timestamptz`; hiển thị theo timezone event.
- Lỗi domain: `throw new KittyError(code, details)`. Không throw string.
- Log: pino JSON, có `requestId`, `intentId`, `agentId`; redact secret, token, signature, PII.
- Code, comments, commit messages, README: **tiếng Anh**. Docs nội bộ trong `docs/`: tiếng Việt.
