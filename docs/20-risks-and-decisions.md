# 20 — Risks, Decisions (ADR) & Open Questions

## 1. Risk register

| ID | Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu | Trigger hành động |
|---|---|---|---|---|---|
| R1 | **Payouts không dùng được trong sandbox app** | Trung bình | Rất cao | `sandbox-check` ngày 17/10; hỏi Discord; fallback [11](11-paypal-integration.md) §6 | sandbox-check fail |
| R2 | Ôm quá nhiều sponsor → không xong core | Cao | Cao | **ADR-024**: chỉ AG Grid nhắm giải; bỏ Zapier/Elastic/KERNEL/Astropods/Postman; Bryntum → Could; cut list; feature freeze 05/11 | Trễ milestone > 1 ngày |
| R3 | Trial AG Studio hết trong judging (1–15/12) | Trung bình | Trung bình | Kích hoạt **01/11** (45 ngày → hết ~16/12); xin license hackathon trên Discord; degrade gracefully | 7 ngày trước hết hạn |
| R4 | Webhook sandbox chậm/không đến khi quay video | Trung bình | Trung bình | Reconcile sweep + "Sync now"; quay nhiều take | Webhook > 30s |
| R5 | LLM không ổn định khi demo (plan khác nhau mỗi lần) | Trung bình | Trung bình | Seed + temperature thấp; prompt cố định trong video; cache plan | Eval fail |
| R6 | Render Workflows chưa sẵn/khác kỳ vọng | Trung bình | Thấp | Outbox + worker + cron tương đương | Spike 17/10 |
| R7 | AG Studio (và Bryntum nếu dùng) + Next.js SSR xung đột | Trung bình | Trung bình | Dynamic import `ssr:false`; spike khi kích hoạt trial | Build lỗi |
| R8 | Bug double-spend / ledger lệch | Thấp | Rất cao (mất uy tín) | Property tests, concurrency tests, job kiểm I1 | Bất kỳ test fail |
| R9 | Judges không chạy được local | Trung bình | Trung bình | Hosted demo là chính; Docker compose; README thử trên máy sạch | — |
| R10 | Vấn đề pháp lý (money transmission) bị judges hỏi | Thấp | Thấp | Nói rõ: sandbox; production cần licensed partner / PayPal-native mechanisms | — |
| R11 | Thương hiệu: dùng "Agent Pass"/"Sui"/"PayPal" trong tên | Thấp | Trung bình | Tên Kitty/Leash; chỉ "inspired by" | — |
| R12 | Một người làm, ốm/quá tải | Trung bình | Cao | M2 sớm (28/10) = luôn có bản nộp được | — |
| R13 | Judges không có API key nên không thử được agents | Cao | Cao | Demo key có hạn mức cho tài khoản `is_demo` (ADR-015); manual mode | — |
| R14 | Provider khác nhau xử lý tool calling khác nhau → agent chạy lệch | Trung bình | Trung bình | AI SDK chuẩn hoá; eval chạy với ≥2 provider; chặn model không hỗ trợ tools | Eval fail trên một provider |
| R15 | Lộ API key người dùng | Thấp | Rất cao (uy tín) | Envelope encryption, redaction test, không trả plaintext ([24](24-byok-ai-models.md) §5) | — |
| R16 | **Chưa có đường tiền vào Kitty** (audit 17/10): chưa có invoice/top-up, webhook `INVOICING.*` bị bỏ qua → `kitty.available` luôn 0 → mọi leash có allocation > 0 bị `ALLOCATION_EXCEEDS_KITTY_AVAILABLE` | **Đang xảy ra** | Rất cao (chặn M2) | Ưu tiên số 1 tuần này: `leash_create_invoice` + webhook `INVOICING.INVOICE.PAID` → ledger ([16](16-roadmap.md) 18–19/10) | Chưa xong 20/10 |
| R17 | MCP client bên ngoài (Claude Desktop, Claude Code, Cursor) đổi hành vi hoặc spec MCP đổi → `leash-mcp` hỏng khi quay video/judging | Trung bình | Trung bình | Test với MCP Inspector + ≥2 client; pin version MCP SDK; README ghi version đã test (ADR-025) | Client không list được tools |
| R18 | Đối thủ cùng ý tưởng "spend limit cho agent" (vd repo PayGuard Agent dùng Agent Toolkit) | Trung bình | Trung bình | Nhấn điểm khác biệt: quỹ nhóm, delegation chỉ thu hẹp, ledger + bounded loss bằng prefunding, Payouts có leash, kill switch, agent ngoài qua `leash-mcp` | — |

## 2. Architecture Decision Records

### ADR-001 — Prefunded envelope thay vì charge trực tiếp tài khoản user
- **Bối cảnh:** Bounded loss cần giới hạn không phụ thuộc hoàn toàn vào việc Gateway đúng.
- **Quyết định:** Agent chỉ tiêu tiền **đã thu vào Kitty và đã cấp vào leash** (ledger). Không dùng vault/billing agreement để charge user theo nhu cầu trong MVP.
- **Hệ quả:** + Loss bị chặn bởi số tiền thật đã cấp. − Tiền nằm ở tài khoản platform (vấn đề custody nếu production → cần partner/PayPal-native mechanism).

### ADR-002 — Gateway là service riêng, duy nhất giữ PayPal secret
- **Quyết định:** `apps/gateway` tách biệt; web/agents/worker không có secret. CI kiểm.
- **Hệ quả:** + Câu chuyện bảo mật đứng vững, Gateway tái sử dụng như MCP server. − Thêm một service, thêm hop mạng.

### ADR-003 — Policy engine thuần, không LLM
- **Quyết định:** `packages/leash.evaluate()` là hàm thuần, deterministic. `justification` của agent không ảnh hưởng.
- **Hệ quả:** Test 100%, giải thích được, không bị injection.

### ADR-004 — Ed25519 request signing cho agents
- **Quyết định:** Mỗi agent một keypair; ký method+path+timestamp+nonce+body hash.
- **Thay thế bị loại:** bearer token (dễ lộ), mTLS (phức tạp trên Render).

### ADR-005 — Collect bằng Invoicing, trả bằng Payouts
- **Quyết định:** Inbound = Invoicing v2 (+ Orders fallback); outbound = Payouts; refund = captures refund.
- **Thay thế bị loại:** Multiparty/partner (cần onboarding), Orders có payee là vendor (cần buyer approve mỗi lần — không tự động).

### ADR-006 — Ledger double-entry dạng bucket, tiền là cents bigint
- **Quyết định:** Xem [05](05-leash-spec.md) §8. Số dư luôn tính từ ledger.

### ADR-007 — Công cụ AI của PayPal (Agent Toolkit / MCP server) chỉ chạy sau leash *(cập nhật 17/10; chờ spike 18/10)*
- **Bối cảnh (kiểm 17/10):** PayPal có hai thứ khác nhau: (1) **PayPal AI-Toolkit** (https://github.com/paypal/AI-Toolkit) — plugin cho coding assistant (Claude Code, Codex, Cursor) nối vào MCP sandbox; (2) **`@paypal/agent-toolkit`** (v1.11, 09/2026, https://github.com/paypal/agent-toolkit) — thư viện runtime cho agent. Toolkit và PayPal MCP server (remote `mcp.sandbox.paypal.com`, local `@paypal/mcp`) có tool cho Invoices, Orders/Refunds, Disputes, Shipment, Catalog, Subscriptions, Reporting — **không có Payouts**. Auth bằng client credentials của app → đưa cho agent là phá bounded loss.
- **Quyết định:** Agents **không bao giờ** nhận Toolkit/MCP của PayPal (bất biến #3). Gateway dùng `@paypal/agent-toolkit` làm executor cho invoice/order/refund **sau khi** policy ALLOW **nếu** spike xác nhận truyền được `PayPal-Request-Id` (idempotency, bất biến #6) và đủ field cần; nếu không → `packages/paypal` REST cho tất cả. Payouts và verify webhook luôn qua `packages/paypal`.
- **Submission:** chỉ ghi "PayPal Agent Toolkit" trong Built With khi code chạy trên demo thật sự gọi nó ([21](21-design-questions.md) F5). Pitch: *"PayPal's agent tools, on a leash"* + Kitty bổ sung **Payouts có leash** — thứ Toolkit/MCP của PayPal chưa có.
- **Dev tooling:** AI-Toolkit plugin + APIMatic Context Plugin dùng trong Claude Code khi code `packages/paypal`; ghi rõ là dev tooling.

### ADR-008 — Turborepo + Bun + Next.js (latest) + Hono trên Bun
- **Quyết định:** Monorepo TypeScript do **Turborepo** điều phối; **Bun 1.3** là package manager, runtime và test runner; `apps/web` dùng **Next.js 16 (latest)**; gateway/agents/worker dùng **Hono 4 chạy trên Bun**; Postgres + Drizzle (driver postgres.js). Chi tiết ở [07](07-tech-stack.md).
- **Lý do:** Một công cụ thay cho Node + pnpm + tsx + Vitest; Hono native trên Bun; Hono RPC chia sẻ type API sang Next; dev loop nhanh.
- **Hệ quả:** + Đơn giản, nhanh. − Rủi ro tương thích Bun với một số package → giữ `packages/*` chỉ dùng API Web-standard và chọn driver chạy được cả Node; spike ngày 17/10 ([07](07-tech-stack.md) §6).
- **Fallback:** service nào có package lỗi trên Bun thì chạy service đó trên Node 22; code không đổi.
- **Kết quả spike (17/10 — KIT-10, [07](07-tech-stack.md) §6):** postgres.js transaction `SELECT … FOR UPDATE` qua Neon pooled URL (`prepare: false`) serialize đúng (5/5 vòng, 1 decrement/vòng) → **PASS**; Ed25519 qua WebCrypto `crypto.subtle` trên Bun sign/verify OK → **PASS**. Các dòng còn lại của bảng §6 (Next 16, AG Studio + Bryntum, MCP SDK, AI SDK, Render image) **chưa chạy**.

### ADR-009 — Một leash active mỗi agent (MVP)
- **Lý do:** Agent không cần chọn leash → không thể "chọn nhầm/chọn trộm". Gateway tra leash theo agent.

### ADR-010 — Delegation tối đa 2 cấp, chỉ thu hẹp
- **Lý do:** Đủ cho demo Planner → Shopper; giảm bề mặt lỗi.

### ADR-011 — Channel3 cho discovery, fulfilment qua demo vendor
- **Lý do:** Sandbox không checkout được tại retailer thật; trung thực trong UI/README.

### ADR-012 — Docs nội bộ tiếng Việt, mọi thứ hướng judges tiếng Anh
- **Lý do:** Team làm việc nhanh hơn bằng tiếng Việt; hackathon yêu cầu tiếng Anh cho submission.

### ADR-013 — BYOK: app không cung cấp model
- **Quyết định (16/10):** Người dùng tự nhập API key và chọn model (default + theo vai). Kitty không trả tiền model cho người dùng thật. Chi tiết ở [24](24-byok-ai-models.md).
- **Lý do:** Không cần billing trong hackathon; người dùng tự chọn model và nhà cung cấp; củng cố thông điệp "an toàn tiền không phụ thuộc model".
- **Hệ quả:** + Chi phí vận hành gần 0, linh hoạt. − Thêm bước onboarding; phải mã hoá key; phải hỗ trợ nhiều provider; cần manual mode khi chưa có key.
- **Tương lai:** gói trả phí Kitty tự cấp model = credential `source='platform'` + `llm_usage` metering + PayPal Subscriptions.

### ADR-014 — Vercel AI SDK làm lớp provider, vòng lặp agent vẫn tự viết
- **Quyết định:** Dùng `ai@7.x` + provider packages để gọi model; giữ vòng lặp, tool dispatcher và guardrails của mình.
- **Thay thế bị loại:** chỉ dùng `@anthropic-ai/sdk` (khoá vào một provider); tự viết adapter cho từng provider (tốn thời gian).

### ADR-015 — Demo key có hạn mức cho tài khoản demo và judges
- **Quyết định:** `DEMO_LLM_API_KEY` của team chỉ dùng cho `is_demo = true`, có hạn mức run/ngày và token/run. Ghi rõ trên UI và README.
- **Lý do:** Rules yêu cầu judges dùng thử miễn phí; BYOK không được làm judges kẹt lại.

### ADR-016 — Frontend data layer: axios + TanStack Query, logic trong hooks, contract ở @kitty/shared
- **Bối cảnh:** cần một cách gọi API type-safe, nhất quán giữa `apps/web` và `apps/api`; tránh logic rải trong component.
- **Quyết định:** HTTP qua **axios** (một instance/app, interceptor + `withCredentials` cho cookie Better Auth); server state qua **TanStack Query v5**; **mọi logic ở hooks** (`use-*`), component chỉ JSX; contract là **Zod schema trong `@kitty/shared`** (type = `z.infer`), parse cả request (server) lẫn response (client).
- **Thay thế bị loại:** Hono RPC `hc<AppType>` (type phụ thuộc shape router Hono, không validate runtime, không dùng chung được cho response ở client), `fetch` trực tiếp, nhiều thư viện state.
- **Hệ quả:** + một nguồn sự thật cho contract, validate runtime hai đầu, dễ test (hook tách khỏi UI). − thêm 2 dependency; phải giữ schema đồng bộ khi đổi API.

### ADR-017 — Cloudflare R2 cho object storage qua S3 API với presigned URL
- **Bối cảnh:** cần lưu file (ảnh/PDF báo giá…) nhưng không muốn proxy file lớn qua API.
- **Quyết định:** dùng **Cloudflare R2** qua **S3 API** (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`); `apps/api` sinh **presigned URL**; browser upload **trực tiếp** lên R2; bucket key + metadata lưu ở Postgres. R2 credentials **không bao giờ** ra browser hay service khác.
- **Thay thế bị loại:** S3/GCS (chi phí/egress), proxy upload qua API (tốn băng thông, timeout).
- **Hệ quả:** + không proxy file, không lộ credential. − thêm AWS SDK; cần cấu hình CORS cho bucket.

### ADR-018 — Neon serverless Postgres với Drizzle + postgres.js
- **Bối cảnh:** cần Postgres có branch cho dev/preview/test mà không tự vận hành DB.
- **Quyết định:** dùng **Neon** (serverless Postgres). ORM giữ **Drizzle**; driver **`postgres` (postgres.js)** qua TCP: **pooled** URL (`DATABASE_URL`, `prepare: false` cho PgBouncer transaction mode) cho app, **direct/unpooled** URL (`DATABASE_URL_UNPOOLED`) cho `drizzle-kit` migrations. `@neondatabase/serverless` (HTTP) chỉ dùng cho edge/serverless runtime, **không** trong `apps/api`. Better Auth vẫn **self-host ở `apps/api`** với Drizzle adapter; Neon Auth / Data API / object storage **không** dùng (trừ khi có ADR mới).
- **Thay thế bị loại:** Render Postgres (không có branch), Neon HTTP driver (không hỗ trợ transaction tương tác `SELECT … FOR UPDATE` mà Leash cần).
- **Hệ quả:** + branch theo môi trường, scale-to-zero, PITR. − thêm nhà cung cấp; phải phân biệt pooled/unpooled.

### ADR-019 — ESLint sở hữu thứ tự class Tailwind (better-tailwindcss) + @shadcn/lint; bỏ prettier-plugin-tailwindcss
- **Bối cảnh:** Prettier plugin và ESLint cùng sort class sẽ đánh nhau; cần rule cho design system mà agent kiểm được.
- **Quyết định:** dùng **`eslint-plugin-better-tailwindcss`** (class order, duplicate, whitespace, conflicting, unknown) và **`@shadcn/lint`** (no-raw-colors, no-arbitrary-values, no-inline-styles, require-static-classes, no-restyle) ở mức `error`, auto-fix qua `bun run lint:fix` / fix-on-save. **Bỏ** `prettier-plugin-tailwindcss`. `no-unknown-classes` chỉ bật ở better-tailwindcss (một nguồn duy nhất, tránh report hai lần).
- **Hệ quả:** + một nguồn duy nhất cho thứ tự class, + rule design system cho agent. − dev phải bật ESLint fix-on-save (đã commit `.vscode/settings.json`).

### ADR-020 — Chỉ dùng agent skill chính thức, load khi task liên quan
- **Bối cảnh:** nhiều agentic tool cung cấp "skill"; skill lạ có thể mâu thuẫn quy ước repo.
- **Quyết định:** chỉ cài **skill chính thức của nhà cung cấp công nghệ** (Neon, shadcn/ui, Turborepo, Better Auth, Vercel React). Skill là tài liệu tham khảo: `CODE_RULES.md` và `AGENTS.md` **thắng** khi mâu thuẫn (ví dụ skill Neon gợi ý Neon Auth → bỏ qua, ta dùng Better Auth). Chỉ load skill khớp công nghệ task đang đụng. Thêm skill mới cần ADR. Cập nhật bằng CLI (`bunx skills update`, `bunx neon@latest skills update`), không sửa tay.
- **Hệ quả:** + agent có hướng dẫn chính thức, đúng phiên bản. − có vendor content trong repo (`.agents/skills`, `.claude/skills`) → ignore khỏi lint/format.

### ADR-021 — Payee verification do gateway sở hữu; `member:*` giới hạn action (KIT-6)
- **Bối cảnh:** bất biến #12 cấm agent tự thêm payee vào allowlist; docs/10 §1 ghi "`member:*` is allowed for create_invoice/refund only" nhưng preset Collector (docs/05 §12) có `create_invoice` + `send_reminder` với `member:*`.
- **Quyết định:** bảng `leash.verified_payees (kitty_id, email, verified_by, verified_at)` do gateway sở hữu; chỉ organizer (owner kitty) gọi `POST/DELETE /v1/kitties/:id/payees`. Leash create/top-up chỉ nhận email đã verify (lowercase) → nếu không `PAYEE_NOT_VERIFIED`. `member:*` không cần verify nhưng chỉ hợp lệ khi **mọi** action của leash ⊆ `{create_invoice, refund, send_reminder}` (loại trừ `payout`, `create_order`, `delegate`, `browser_booking` — đều trả cho vendor ngoài). Admin auth = bearer token + HMAC-SHA256(userId ‖ timestamp ‖ rawBody), ±60 s.
- **Hệ quả:** + agent không thể tự mở rộng payee; verify idempotent (upsert). − `member:*` nới hơn câu chữ "create_invoice/refund only" một action không mang payee (`send_reminder`) để giữ preset Collector; top-up kiểm lại payee để một vendor bị bỏ verify không lách qua.

### ADR-022 — Web shell: session check ở (app) layout, demo login ở API, dark mode bằng next-themes (KIT-24)
- **Bối cảnh:** cần lớp vỏ app thật đầu tiên: trang `/sign-in` `/sign-up`, tài khoản demo, layout có sidebar, theme light/dark. `apps/web` không được giữ PayPal secret hay tự quản session (Better Auth nằm ở `apps/api`), và UI copy phải tiếng Anh.
- **Quyết định:**
  1. **Bảo vệ route 2 lớp:** `proxy.ts` (Next 16, tên mới của middleware) chỉ kiểm **sự tồn tại** của session cookie bằng `getSessionCookie` để redirect `/{app}` → `/sign-in?next=…` (giữ deep link, chống open-redirect bằng `safeNextPath`); check thật nằm ở `(app)/layout.tsx` gọi `GET /api/auth/get-session` qua rewrite `/api` với cookie của request rồi parse bằng `authSessionSchema` (`@kitty/shared/auth`). Web **không** import auth instance của API.
  2. **`(app)`, `/`, `/sign-in` export `instant = false`** — đây là route cần dữ liệu theo request (auth) nên stream một shell rỗng vô nghĩa; blocking là hành vi đúng (Next 16 Cache Components).
  3. **Demo login ở server, mặc định TẮT:** `POST /api/demo-sign-in` (mount ngoài `/api/auth/*` để không bị catch-all của Better Auth nuốt) gọi `auth.api.signInEmail({ asResponse: true })` với `DEMO_USER_PASSWORD` trong env của `apps/api` rồi trả nguyên response (kèm `Set-Cookie`). Browser không bao giờ thấy mật khẩu demo (bất biến #11). Endpoint chỉ tồn tại khi `DEMO_LOGIN_ENABLED=true` (mặc định `false`; bật chỉ ở deployment demo cho judges) — tắt thì trả **404** `DEMO_LOGIN_DISABLED`, và mọi request đều bị **rate limit 10 lần / 10 phút / IP** (`x-forwarded-for`) → **429** `RATE_LIMITED` theo shape lỗi chung. Web biết có nên hiện nút hay không nhờ `GET /api/demo-sign-in/status` → `{ enabled: boolean }` (`demoLoginStatusSchema`).
  4. **`is_demo` là additional field của Better Auth user** (`user.additionalFields`, `input: false`) + cột `app.user.is_demo` (Drizzle); seed `apps/api/scripts/seed-demo-users.ts` (root script `seed:demo-users`) dùng `auth.api.signUpEmail` — không tự hash mật khẩu — và idempotent.
  5. **Dark mode bằng `next-themes`** (`attribute="class"`), token brand ở `packages/ui/src/styles/globals.css`, toggle ở top bar với `useSyncExternalStore` để tránh lệch hydration.
  6. **Tôn trọng `@shadcn/lint` no-restyle:** không truyền class layout vào component shadcn — bọc trong `div`/`span` thường (đúng pattern đã có ở `page.tsx` cũ).
- **Hệ quả:** + web giữ đúng ranh giới (không session/secret của auth), deep link sống qua sign-in, demo một chạm. − mọi layout class phải qua wrapper (hơi dài dòng); `next-themes` là dependency mới của `apps/web`; route app là blocking (chấp nhận vì đã auth-gated).
### ADR-023 — Tạo event kèm kitty bằng compensating flow, không 2PC (KIT-30)
- **Bối cảnh:** `POST /api/events` vừa ghi `app.events` (Postgres) vừa gọi gateway tạo `leash.kitties`. Hai service/DB khác nhau nên không thể một transaction.
- **Quyết định:** insert event (chưa có `kitty_id`) → gọi `POST /v1/kitties` → ghi `kitty_id`. Nếu bước 2/3 lỗi thì **xoá lại event** rồi ném lỗi. Gateway giữ idempotency/ownership như thường. Bất biến "một event = một kitty" giữ được ở phía event (không có event thiếu kitty).
- **Hệ quả:** + đơn giản, không cần 2PC/saga hạ tầng; lỗi gateway phổ biến (chưa cấu hình, mạng) → event không được tạo, đúng kỳ vọng. − trường hợp hiếm kitty tạo xong nhưng ghi `kitty_id` lỗi để lại kitty mồ côi (xem Q13); không ảnh hưởng tiền vì kitty rỗng.

### ADR-024 — Thu hẹp sponsor theo luật cộng dồn giải (17/10)
- **Bối cảnh:** Rules: một project thắng tối đa 1 Grand Prize/Honorable Mention **+ 1** giải sponsor. Kiểm Devpost 17/10: Zapier, Elastic, KERNEL, Astropods, Postman **không có giải sponsor**. Audit code 17/10: gateway lõi đã xong nhưng chưa có đường tiền vào (R16), `apps/agents`, `apps/worker`, màn hình nghiệp vụ trên web, deploy — trong khi plan cũ còn 10 sponsor.
- **Quyết định:**
  1. **Sponsor nhắm giải: AG Grid (AG Studio)** — 5 suất giải (1st $5k), tiêu chí "polish + Studio Agent Framework", có judge của AG Grid.
  2. **Giữ (tính năng thật):** Render (hosting — dùng thật), Channel3 (Shopper discovery — chỉ khi gọi API thật; không kịp → catalog demo), APIMatic (dev tooling).
  3. **Bryntum → Could.** Payment gate vẫn "không bao giờ cắt" nhưng render bằng timeline shadcn của mình; Bryntum Gantt chỉ là bản nâng cấp nếu dư thời gian sau M4.
  4. **Bỏ khỏi scope hackathon:** Zapier (nhắc nợ = PayPal Invoicing `/remind` qua `leash_send_reminder`; thông báo step-up/DENY = in-app), Elastic, KERNEL (action `browser_booking` giữ trong spec nhưng không build), Astropods, Postman collection (thay bằng hướng dẫn MCP Inspector + `leash-mcp` trong README).
- **Thay thế bị loại:** giữ 10 sponsor (không tăng tổng tiền tối đa, kéo trễ critical path); bỏ cả AG Grid (mất giải sponsor lớn nhất).
- **Hệ quả:** + thời gian dồn vào money loop, agents, MCP; + Design mạch lạc hơn. − Thông báo ngoài app chỉ còn email của PayPal (invoice, reminder), không có Slack. − Ít sponsor được xét hơn (không ảnh hưởng tổng tiền tối đa).

### ADR-025 — `leash-mcp`: bridge stdio để MCP client bên ngoài dùng một leash (17/10)
- **Bối cảnh:** Gateway MCP yêu cầu ký Ed25519 từng request (ADR-004: nonce + timestamp + hash body). MCP client phổ biến (Claude Desktop, Claude Code, Cursor, MCP Inspector) chỉ gửi header cố định hoặc OAuth → **không kết nối được**. Luận điểm "Leash cho mọi agent" ([02](02-problem-and-vision.md) §6, tiêu chí Impact ở [17](17-goals-and-success-metrics.md)) chưa có bằng chứng chạy được.
- **Quyết định:** package `packages/leash-mcp` (CLI có `bin`, chạy bằng `bunx`/`npx`, chỉ dùng API Node-compatible):
  1. `leash-mcp init` sinh keypair Ed25519 **trên máy người dùng**, lưu private key ở file cấu hình local (quyền `600`), in public key.
  2. Organizer dán public key vào màn hình **"Connect an external agent"** (trang Leashes) → `apps/api` gọi Gateway `POST /v1/agents` (đăng ký key) → cấp leash như mọi agent khác.
  3. `leash-mcp` (mặc định) chạy MCP server **stdio**, chuyển tiếp mọi JSON-RPC sang `POST /mcp` của Gateway, ký bằng `createSignedFetch` (`@kitty/signing`). Bridge không có PayPal credential, không có logic policy, không cache số dư (bất biến #5) — chỉ là đường ống ký.
  4. README có snippet cấu hình cho Claude Desktop, Claude Code, Cursor, MCP Inspector.
- **Thay thế bị loại:** bearer token / OAuth 2.1 cho remote MCP ngay trong hackathon (ngược ADR-004: token lộ là dùng được; xem lại sau hackathon với token ràng buộc khoá như DPoP); cho agent ngoài gọi Admin API (sai trust boundary).
- **Hệ quả:** + chứng minh "any agent" bằng demo thật (cảnh "Claude Desktop bị lừa → DENY"); + judges thử agent bằng client của họ, không cần BYOK; + private key không rời máy người dùng. − thêm một package public (publish npm hay chạy từ repo — Q14); − phải bám spec MCP hiện hành (2026-07-28).
- **Bất biến giữ nguyên:** agent ngoài chỉ có `leash_*` tools (#3), không approve, không sửa leash của mình (#9), mọi quyết định tiền vẫn qua policy thuần (#2).

## 3. Open questions (cần trả lời, có hạn)

| # | Câu hỏi | Ai/cách trả lời | Hạn |
|---|---|---|---|
| Q1 | Payouts sandbox có cần bật thêm gì? | sandbox-check + Discord | 17/10 |
| Q2 | Invoicing sandbox có gửi email/payer-view link dùng được để demo? | sandbox-check | 18/10 |
| Q3 | Refund invoice payment qua `captures/{id}/refund` có chạy với invoice? Capture id lấy ở đâu trong webhook? | spike | 19/10 |
| Q4 | `@paypal/agent-toolkit` có cho truyền `PayPal-Request-Id` (idempotency) và đủ field cho invoice/order/refund không? (Đã biết 17/10: không có Payouts — ADR-007) | spike | 18/10 |
| Q5 | Render Workflows SDK TypeScript có sẵn cho account? | spike | 17/10 |
| Q6 | AG Studio license trial có watermark? Có gia hạn cho judging? | Discord AG Grid | 20/10 |
| Q7 | Bryntum trial có hạn chế render production build? | **Chỉ hỏi nếu dùng Bryntum** (Could — ADR-024) | — |
| Q8 | ~~Zapier MCP free plan đủ cho demo trong judging?~~ | **Đóng** — bỏ Zapier (ADR-024) | — |
| Q9 | ~~Elastic Jina inference endpoint id chính xác?~~ | **Đóng** — bỏ Elastic (ADR-024) | — |
| Q11 | AI SDK v7 tool calling ổn định với Anthropic + một OpenAI-compatible endpoint (OpenRouter/Ollama) trên Bun? | spike | 29/10 |
| Q12 | Payout `RETURNED`/`REFUNDED` đến **sau khi** intent đã `settled`: tiền đã rời ledger sang `external:payee` nên không thể hoàn tác bằng bút toán nội bộ (KIT-7 chỉ ghi `paypal_objects` + audit alert, không đụng ledger). Xử lý thế nào: bút toán bù `external:payee → kitty:available` với txn riêng, hay chỉnh tay ở trang settling? | spike + ADR | 01/11 |
| Q10 | Làm solo hay team? Nếu team: chia vai (Gateway/ledger · Web/UI · Agents/sponsors) | quyết định của bạn | 17/10 |
| Q13 | Nếu tạo kitty xong mà `apps/api` ghi `kitty_id` lỗi (event đã xoá), kitty mồ côi trong `leash.kitties`. Cần endpoint `DELETE /v1/kitties/:id` (organizer, chưa có ledger) hay reconcile sweep? | quyết định + issue sau | 25/10 |
| Q14 | `leash-mcp` phát hành thế nào: publish npm (cần scope/tên public) hay chạy từ repo (`bunx github:…`)? | quyết định | 30/10 |
| Q15 | Remote PayPal MCP có tool commerce (`search_product`, `create_cart`, `checkout_cart`, header `x-feature-flags: commerce:true`, hiện chỉ gift card) — có chạy trong sandbox không? Nếu có, Shopper dùng qua leash được không? (không chặn critical path) | thử | 25/10 |
