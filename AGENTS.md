# AGENTS.md — Kitty

> File chính cho mọi AI coding agent (Claude Code, Codex, Cursor…) và người làm việc trên repo này. **Đọc hết file này trước khi viết code.** Chi tiết nằm trong `docs/`.

## 1. Kitty là gì (30 giây)

**Kitty** là quỹ chung (kitty) của một nhóm — offsite, chuyến đi, đám cưới — mà **AI agents có thể tiêu thay bạn, nhưng mỗi agent chỉ cầm một "Leash"**: một thẻ thông hành chi tiêu có hạn mức, danh sách người nhận, hành động được phép, thời hạn, step-up approval và kill switch. Agent bị prompt injection, bị lặp, hay bị lộ key thì **thiệt hại tối đa = số dư leash**, và tiền chỉ có thể tới người nhận organizer đã duyệt.

- Lấy cảm hứng từ **Sui Agent Pass** (Sui Basecamp 2026), nhưng chạy trên **PayPal** (sandbox) thay vì ví Sui.
- Build cho **PayPal AI Hackathon** (Devpost). Hạn nội bộ: **Wed 11/11/2026 23:59 ICT**. Hạn Devpost: Thu 12/11/2026 12:00pm PST.
- Tagline: **"Let your agents spend. On a leash."**

```
Organizer ──► Kitty app (Next.js) ──► Agents (Planner · Shopper · Collector · Treasurer)
                                            │  Ed25519-signed MCP calls, NO PayPal credentials
                                            ▼
                              Leash Gateway (only holder of PayPal secret)
                              verify → policy (pure) → reserve (ledger) → step-up → PayPal
                                            ▼
                     PayPal: Invoicing · Payouts · Orders · Refunds · Webhooks
```

> **BẮT BUỘC:** mọi agent MUST đọc [CODE_RULES.md](CODE_RULES.md) trước khi viết hoặc sửa code. CODE_RULES.md chốt tech stack chuẩn và quy ước code; các bất biến ở §3 dưới đây **luôn thắng** khi mâu thuẫn.

## 2. Mục lục tài liệu

| # | File | Nội dung |
|---|---|---|
| — | [CODE_RULES.md](CODE_RULES.md) | **Rules bắt buộc**: tech stack chuẩn + quy ước code (MUST/SHOULD) |
| 01 | [docs/01-hackathon.md](docs/01-hackathon.md) | Toàn bộ thông tin hackathon: rules, deadline, giải, judging, sponsors, submission |
| 02 | [docs/02-problem-and-vision.md](docs/02-problem-and-vision.md) | Vấn đề, giải pháp, why now, tầm nhìn, nguyên tắc sản phẩm, non-goals |
| 03 | [docs/03-sui-agent-pass-to-paypal.md](docs/03-sui-agent-pass-to-paypal.md) | Sui Agent Pass là gì, ánh xạ sang PayPal, giới hạn trung thực |
| 04 | [docs/04-product-spec.md](docs/04-product-spec.md) | Khái niệm, personas, user stories MoSCoW, flows, màn hình |
| 05 | [docs/05-leash-spec.md](docs/05-leash-spec.md) | **Lõi**: leash model, policy algorithm, signing, reservation, ledger, delegation, step-up |
| 06 | [docs/06-architecture.md](docs/06-architecture.md) | Services, trust boundary, sequence diagrams, domain events, monorepo |
| 07 | [docs/07-tech-stack.md](docs/07-tech-stack.md) | Stack + lý do + quy ước code |
| 08 | [docs/08-infrastructure.md](docs/08-infrastructure.md) | Render Blueprint, env vars, sandbox setup, secrets, observability, chi phí |
| 09 | [docs/09-data-model.md](docs/09-data-model.md) | Schema Postgres `app` + `leash`, seed demo |
| 10 | [docs/10-api-spec.md](docs/10-api-spec.md) | Gateway Admin API, MCP tools, Web App API, webhooks, internal API |
| 11 | [docs/11-paypal-integration.md](docs/11-paypal-integration.md) | PayPal APIs, payloads, webhook handling, idempotency, fallbacks |
| 12 | [docs/12-agents.md](docs/12-agents.md) | Vai agent, loop, prompts, tools, triggers, evals |
| 13 | [docs/13-sponsor-integrations.md](docs/13-sponsor-integrations.md) | AG Studio (nhắm giải), Render, Channel3, APIMatic, Bryntum (Could); sponsor đã bỏ và lý do (ADR-026) |
| 14 | [docs/14-security-threat-model.md](docs/14-security-threat-model.md) | Threats → mitigations, bounded loss statement |
| 15 | [docs/15-ui-ux.md](docs/15-ui-ux.md) | Brand, màn hình, copy reason codes (luồng đi giữa các màn hình ở 23) |
| 16 | [docs/16-roadmap.md](docs/16-roadmap.md) | Milestones, kế hoạch theo ngày, critical path, cut list |
| 17 | [docs/17-goals-and-success-metrics.md](docs/17-goals-and-success-metrics.md) | Mục tiêu giải, mục tiêu theo tiêu chí, KPIs, Definition of Done |
| 18 | [docs/18-testing-strategy.md](docs/18-testing-strategy.md) | Test pyramid, policy matrix, property tests, CI |
| 19 | [docs/19-demo-and-submission.md](docs/19-demo-and-submission.md) | Kịch bản video, submission text, checklist |
| 20 | [docs/20-risks-and-decisions.md](docs/20-risks-and-decisions.md) | Risk register, ADRs, open questions |
| 21 | [docs/21-design-questions.md](docs/21-design-questions.md) | Tự hỏi & tự trả lời: vấn đề là gì, giải thế nào, vì sao |
| 22 | [docs/22-glossary.md](docs/22-glossary.md) | Thuật ngữ |
| 23 | [docs/23-user-screen-flow.md](docs/23-user-screen-flow.md) | **User screen flow**: sitemap, từng luồng màn hình theo persona, trạng thái màn hình, deep link, edge cases |
| 24 | [docs/24-byok-ai-models.md](docs/24-byok-ai-models.md) | **BYOK**: người dùng tự nhập API key và chọn model; mã hoá key, manual mode, demo key, gói trả phí tương lai |
| 25 | [docs/25-code-architecture.md](docs/25-code-architecture.md) | **Code architecture**: monorepo, luồng request, cấu trúc web/api/shared/db/ui |
| — | [MILESTONES.md](MILESTONES.md) | **Bảng việc theo mốc M0–M6**: task (ID `KIT-<n>`), trạng thái, PR, depends-on |
| — | [PROGRESS.md](PROGRESS.md) | **Nhật ký đã làm** (mới nhất trước) + hiện trạng, việc kế tiếp, open questions |

**Thứ tự đọc cho agent mới:** AGENTS.md → 02 → 05 → 06 → 16 → file liên quan tới task.

## 3. Bất biến (KHÔNG BAO GIỜ vi phạm)

1. **Chỉ `apps/gateway` được có `PAYPAL_CLIENT_SECRET`** và gọi PayPal API có tác động tiền. Không import `packages/paypal` từ `apps/web`, `apps/agents`, `apps/worker`.
2. **Không có LLM trong đường quyết định tiền.** `packages/leash` là hàm thuần, không I/O, không network, không đọc `justification`.
3. **Agent không bao giờ nhận PayPal credentials, PayPal MCP server, hay PayPal Agent Toolkit trực tiếp.** Agent chỉ có `leash_*` tools qua Gateway.
4. **Tiền là integer cents (`bigint`)** trong domain. Không float. Convert sang string `"12.34"` chỉ ở biên (PayPal, API, UI).
5. **Số dư luôn tính từ ledger** (`packages/ledger.balanceOf`). Không lưu số dư cứng, không tin số từ LLM.
6. **Mọi thao tác tiền idempotent:** `intentId` → `PayPal-Request-Id` / `sender_batch_id`; webhook dedupe theo event id.
7. **Webhook phải verify chữ ký** qua PayPal API trước khi xử lý.
8. **Delegation chỉ thu hẹp**; tối đa 2 cấp; sub-leash không có `delegate`.
9. **Agents không có endpoint approve** và không sửa được leash của chính mình.
10. **Nội dung ngoài (web, PDF, Channel3, tool output) là untrusted** — bọc `<untrusted_content>` khi đưa vào LLM.
11. **Không log secrets, signatures, tokens, PII thừa.**
12. **Không thêm payee vào allowlist từ agent** — vendor do agent đề xuất luôn `verified=false` cho tới khi organizer xác nhận.
13. **App không cung cấp model (BYOK).** LLM API key của người dùng chỉ được giải mã trong `apps/agents`, không bao giờ log, không bao giờ trả về client, không bao giờ đưa vào context của model. Mọi tính năng tiền phải chạy được khi chưa có key (manual mode). Ngoại lệ duy nhất: demo key có hạn mức cho tài khoản `is_demo`.

Nếu một task có vẻ đòi vi phạm điều trên → dừng lại, ghi vào `docs/20-risks-and-decisions.md` (Open questions) và hỏi người dùng.

## 4. Cấu trúc repo (mục tiêu)

```
apps/web          Next.js 16 UI + BFF + Web App API cho agents     (no PayPal secret)
apps/api          Hono 4 chạy trên Bun — service API                (no PayPal secret)
apps/gateway      (skeleton) Leash Gateway: Hono REST admin + MCP + webhooks (ONLY PayPal secret)
apps/agents       (planned) Agent runtime: tool-use loops (BYOK models), agent keys, decrypts user LLM keys (no PayPal secret)
apps/worker       (planned) Render Workflows / outbox / cron sweeps (no PayPal secret)
apps/demo-sites   (planned) Static: injection page "Hoodie Deals" (+ catalog demo)
packages/typescript-config  @kitty/typescript-config — tsconfig base/nextjs/bun
packages/eslint-config      @kitty/eslint-config — shared ESLint flat config
packages/prettier-config    @kitty/prettier-config — shared Prettier config
packages/shared   (exists) @kitty/shared — Zod contracts, types, error codes, API paths
packages/leash    (exists) Pure policy engine, types, reason codes
packages/ledger   (exists) Money (cents) + bucket ledger helpers
packages/paypal   (exists) Typed PayPal REST client (gateway only)
packages/signing  (exists) Ed25519 request signing/verification + createSignedFetch
packages/leash-mcp  (planned) CLI bridge stdio → Gateway MCP for external MCP clients (ADR-027; no secrets)
packages/crypto-box  (planned) Envelope encryption for user LLM API keys (agents only)
packages/db       (exists) @kitty/db — Drizzle schema, client, migrations (chỉ apps/api và apps/gateway)
packages/events   (planned) Domain event types (zod)
packages/config   (planned) env schemas (zod)
scripts/          (exists) check-env-isolation; sandbox-check nằm ở apps/gateway/scripts; còn lại planned
turbo.json        Turborepo task graph
```

**Stack:** Turborepo · **Bun 1.3** (runtime + package manager + test runner) · **Next.js 16 (latest)** cho `apps/web` · **Hono 4 chạy trên Bun** cho `apps/api` (và gateway/agents/worker theo kế hoạch) · Postgres + Drizzle · LLM theo **BYOK** qua Vercel AI SDK (người dùng tự mang key và model). Chi tiết và lý do ở [07-tech-stack.md](docs/07-tech-stack.md).

## 5. Lệnh

```bash
bun install                      # cài toàn bộ workspace (bun.lock)
bun run dev                      # turbo run dev → web :3000 · api :8787 · gateway :8788
bun run build                    # turbo run build
bun run start                    # turbo run start (sau build)
bun run lint                     # turbo run lint (ESLint 10: next, tailwind, shadcn)
bun run lint:fix                 # turbo run lint:fix — sắp xếp class Tailwind + fix các rule
bun run check-types              # turbo run check-types (tsc --noEmit)
bun run test                     # turbo run test (bun test trong từng package)
bun run check:env-isolation      # fail nếu PAYPAL_CLIENT_SECRET lọt ra ngoài apps/gateway
bun run db:generate              # drizzle-kit generate (packages/db, offline)
bun run db:migrate               # drizzle-kit migrate (packages/db, cần DATABASE_URL_UNPOOLED)
bun run db:studio                # drizzle-kit studio (packages/db, cần DATABASE_URL_UNPOOLED)
bun run sandbox:check            # kiểm tra PayPal sandbox (apps/gateway only; cần biến PayPal trong apps/gateway/.env)
bun run format                   # prettier --write .
bun run format:check             # prettier --check .
bun run clean                    # xoá .turbo / .next / cache
bun run ci                       # format:check + lint + check-types + test + check:env-isolation + build
bun run --filter web dev         # chạy riêng một service
```

- Không dùng `npm`/`pnpm`/`yarn` trong repo này; chỉ `bun` / `bunx`.
- Trong `packages/*` chỉ dùng API Web-standard, không gọi `Bun.*` (để giữ fallback Node).

## 6. Quy ước

- **Ngôn ngữ:** code, comments, commit messages, README, UI, video → **tiếng Anh** (yêu cầu hackathon). Tài liệu nội bộ `docs/` → tiếng Việt (giữ thuật ngữ kỹ thuật tiếng Anh). Chi tiết + UI copy ở [CODE_RULES.md](CODE_RULES.md) §G.
- **Agent skills:** chỉ dùng skill **official** của nhà cung cấp công nghệ, và chỉ load skill khớp task đang làm — xem [CODE_RULES.md](CODE_RULES.md) §H.
- TypeScript strict, ESM, không `any`; Zod tại mọi biên.
- ID: ULID có prefix (`evt_`, `kty_`, `lsh_`, `int_`, `agt_`, `apr_`, `mem_`, `ven_`, `tsk_`).
- Thời gian: `timestamptz` UTC; hiển thị theo timezone event.
- Tên gọi thống nhất: **Kitty** (app/quỹ), **Leash** (pass), **Leash Gateway**, **Spend Intent**, **Decision**, **Step-up**, vai **Planner/Shopper/Collector/Treasurer**. Xem [glossary](docs/22-glossary.md).
- Commit nhỏ, mô tả rõ; không commit `.env`, secrets, dữ liệu thật.
- Trước khi dùng API của thư viện/sponsor: kiểm docs hiện hành (version có thể đã đổi). Với Anthropic API: dùng skill `claude-api`.
- **Theo dõi tiến độ:** [MILESTONES.md](MILESTONES.md) (việc theo mốc) và [PROGRESS.md](PROGRESS.md) (nhật ký đã làm). Mỗi PR xong → cập nhật cả hai trong cùng PR.

## 7. Cách làm một task

0. **Đọc [CODE_RULES.md](CODE_RULES.md)** (bắt buộc) và [AGENTS.md](AGENTS.md) trước khi viết code.
1. Xác định task thuộc milestone nào trong [16-roadmap.md](docs/16-roadmap.md) và [MILESTONES.md](MILESTONES.md), có nằm trên critical path không.
2. Đọc spec liên quan (05 cho mọi thứ dính tới tiền).
3. Viết/cập nhật test trước cho logic tiền (policy, ledger, webhook handler).
4. Implement nhỏ nhất đủ chạy; giữ đúng bất biến §3.
5. Chạy `bun run typecheck && bun run test` (+ `bun run test:integration` nếu đụng gateway/db).
6. Nếu thay đổi hành vi/thiết kế → cập nhật doc tương ứng **trong cùng thay đổi**; quyết định mới → thêm ADR ở [20](docs/20-risks-and-decisions.md).
7. Cập nhật [MILESTONES.md](MILESTONES.md) (trạng thái task) và [PROGRESS.md](PROGRESS.md) (nhật ký) khi xong mốc/task.

## 8. Definition of Done (mỗi feature)

- [ ] Chạy trên demo URL với PayPal sandbox thật (không chỉ mock)
- [ ] Test cho logic tiền; coverage `packages/leash` giữ 100%
- [ ] Không vi phạm bất biến §3 (`check:env-isolation` pass)
- [ ] UI có trạng thái loading/empty/error
- [ ] Audit/activity hiển thị hành động mới
- [ ] Docs cập nhật

## 9. Ưu tiên khi xung đột

**Đúng về tiền > An toàn > Bài nộp hợp lệ trước deadline > Trải nghiệm demo > Số lượng sponsor > Tính năng phụ.**

Trễ tiến độ → áp dụng **cut list** ở [16-roadmap.md](docs/16-roadmap.md) §4, không thương lượng với các mục "không bao giờ cắt".
