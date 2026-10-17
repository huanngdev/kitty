# MILESTONES — Việc theo mốc

> Việc của Kitty chia theo 7 mốc **M0–M6**. Tên mốc, ngày và định nghĩa "xong" ở [docs/16-roadmap.md](docs/16-roadmap.md) §1.
> Trạng thái: ✅ xong · 🟡 đang làm · ⬜ chưa làm · ❌ bỏ (ADR-026) · 💤 Could.
> Nhật ký bằng chứng theo ngày: [PROGRESS.md](PROGRESS.md). Quyết định: [docs/20-risks-and-decisions.md](docs/20-risks-and-decisions.md).
> `KIT-<n>` là số định danh việc trong repo này (không link ra tracker ngoài). Mỗi PR xong → cập nhật file này **và** PROGRESS.md trong cùng PR.

Ngày trong ngoặc là ngày dự kiến theo kế hoạch ngày ở [docs/16](docs/16-roadmap.md) §2.

## M0 — Foundations · Sat 17/10 (trễ nhất Sun 18/10)

Monorepo + CI (đã có); `render.yaml` + Dockerfiles; web/api/gateway chạy trên Render + Neon; `sandbox:check` pass (invoice + payout $1); webhook PayPal trỏ về gateway đã deploy.

- ✅ **KIT-9** — Monorepo foundation: env, gateway skeleton, shared/db/ui, data layer, auth · PR #3, #4, #6
- ✅ **KIT-12** — Local env + Neon dev branch + migrations đầu tiên · 0000/0001 trên Neon dev, `/api/auth/ok` OK
- ✅ **KIT-18** — PayPal sandbox app + accounts; `sandbox:check` PASS · invoice `INV2-PFV4-L46E-W9B5-HRH6`, payout batch `5MEDF5LQ7GRWQ` · PR #6
- ⬜ **KIT-8** — Render Blueprint + deploy "hello" (web, api, gateway) · 17/10 · depends-on: KIT-9
- ✅ **KIT-10** — Runtime spike: Neon pooler `SELECT … FOR UPDATE` + Ed25519 WebCrypto trên Bun · docs/07 §6

## M1 — Leash core · Thu 22/10

`packages/leash` + ledger + gateway: tạo kitty/leash, MCP ký Ed25519, reserve, execute Payout sandbox, webhook settle. **Còn:** đường tiền vào (invoice), approvals, 4 tool MCP, MCP đúng spec, chạy live trên URL đã deploy.

- ✅ **KIT-19** — `@kitty/signing` Ed25519 request signing · PR #7
- ✅ **KIT-17** — `packages/leash` policy engine thuần (100% branch coverage + property tests) · PR #8
- ✅ **KIT-11** — `@kitty/ledger` cents money + bucket ledger · PR #9
- ✅ **KIT-13** — Schema `leash` + migration · PR #10
- ✅ **KIT-15** — `@kitty/paypal` typed REST client · PR #11
- ✅ **KIT-6** — Gateway Admin API `/v1` (kitties, agents, leashes) · PR #12 (migration 0004 trên Neon dev)
- ✅ **KIT-16** — Reserve + execute Payout có idempotency · PR #13 (migration 0005; payout sandbox thật OK)
- ✅ **KIT-5** — Gateway MCP server 5 tool (`leash_status`, `leash_check`, `leash_request_payout`, `leash_intent_status`, `leash_activity`) · PR #16
- ✅ **KIT-7** — PayPal webhook endpoint: verify, dedupe, settle · PR #17
- ⬜ **KIT-58** — **Tiền vào (ưu tiên số 1, R16):** `leash_create_invoice` + webhook `INVOICING.INVOICE.PAID` → ledger `member_contribution` → `kitty.available` + endpoint "collect" cho organizer · 19/10 · depends-on: KIT-6
- ⬜ **KIT-57** — Approvals: `POST /v1/approvals/:id/approve` / `reject`, approve → execute, hết hạn 15' → release hold · 18/10 · depends-on: KIT-6
- ⬜ **KIT-59** — 4 tool MCP còn lại: `leash_send_reminder`, `leash_request_refund`, `leash_delegate`, `leash_create_invoice` · 20/10 · depends-on: KIT-5, KIT-58
- ⬜ **KIT-60** — MCP đúng spec: `GET`/`DELETE /mcp` → 405, tool annotations (`readOnlyHint`/`destructiveHint`/`idempotentHint`), resource `leash://status` · 20/10 · depends-on: KIT-5
- ⬜ **KIT-61** — Chạy live trên URL đã deploy: invoice → paid → kitty tăng → payout → settled · 22/10 · depends-on: KIT-8, KIT-58, KIT-16
- ⬜ **KIT-14** — M1 end-to-end: agent giả ký request → payout sandbox → settled (script + screen capture) · 22/10 · depends-on: KIT-16, KIT-7

## M2 — Money loop end-to-end (bài nộp tối thiểu hợp lệ) · Wed 28/10

Web: tạo event (form) → members/vendors → gửi invoice → member trả (sandbox) → Kitty tăng → leash Treasurer → step-up → approve → payout → settled; payment gate mở trên timeline; manual mode đủ dùng.

- ✅ **KIT-24** — Web shell: sign in/up, tài khoản demo, app layout, theme · PR #14 (đã qua UI reset PR #19 + UI-QA PR #22)
- 🟡 **KIT-64** — Auth: email/password + GitHub + PayPal login, authorization middleware (verify email, account linking policy, Settings → Account, rate limit DB) · PR mở, **owner review auth trước khi merge**- ✅ **KIT-30** — App schema + api modules (events, members, vendors, budget lines) · PR #15 (migration 0008, smoke:events OK)
- ⬜ **KIT-21** — Tạo event, members, vendors (verify), kitty qua gateway · 21/10 · depends-on: KIT-30, KIT-12
- ❌ **KIT-22** — `leash_create_invoice` + Invoicing webhook → contributions · gộp vào **KIT-58** (re-plan đưa tiền vào lên M1)
- ⬜ **KIT-27** — Trang `/pay/:requestId` + Orders fallback (JS SDK v6) · 22/10 · depends-on: KIT-58
- ⬜ **KIT-29** — Outbox → worker → SSE realtime; Overview số liệu thật · 25–26/10 · depends-on: KIT-21
- ⬜ **KIT-23** — Leashes page: create/presets/pause/revoke/top-up, "Max possible loss" · 23/10 · depends-on: KIT-6
- ⬜ **KIT-25** — Approval Inbox: step-up approve → execute · 24/10 · depends-on: KIT-57
- ⬜ **KIT-26** — Manual mode: gửi invoice + trả vendor không cần agent · 24/10 · depends-on: KIT-58
- ⬜ **KIT-28** — Activity timeline + reconcile/expiry sweep · 25–26/10 · depends-on: KIT-29
- ⬜ **KIT-63** — Payment-gate timeline (shadcn) — **never-cut** · 27/10 · depends-on: KIT-30
- ⬜ **KIT-20** — Deploy demo + quay clip M2 walkthrough · 28/10 · depends-on: KIT-8
- ✅ **fix** — `LinkButton` cho nút điều hướng · PR #20
- ✅ **fix** — UI-QA: `proxy.ts` xác thực session thật, nhãn nút demo rõ ("Try the demo (for judges)"), shell mobile gọn · PR #22
- ✅ **fix** — Logo owner thật: SVG light/dark crop zero-padding, `<Logo />` đổi theo theme, favicon `icon.svg` theo OS · PR #25

## M3 — Agents + MCP + Tier-1 UI · Mon 02/11

`apps/agents` (AI SDK loop, MCP client có ký) + BYOK tối thiểu + demo key; Treasurer + Shopper chạy thật; injection demo bị chặn; `leash-mcp` + màn hình "Connect an external agent"; AG Studio dashboard; Planner tạo plan.

- ⬜ **KIT-31** — `apps/agents` runtime: AI SDK loop, MCP client ký bằng `createSignedFetch`, tool dispatcher theo vai, `agent_runs` trace · 29/10 · depends-on: KIT-16, KIT-58
- ⬜ **KIT-34** — BYOK tối thiểu: `packages/crypto-box`, `ai_credentials`/`model_settings`/`llm_usage`, `resolveModel()`, màn hình S21, demo key cho `is_demo` · 29/10 · depends-on: KIT-31
- ⬜ **KIT-38** — Treasurer agent: payment gate mở → payout qua leash · 30/10 · depends-on: KIT-31, KIT-63
- ⬜ **KIT-62** — `packages/leash-mcp` (bridge stdio → `/mcp` có ký) + màn hình "Connect an external agent" (ADR-027) · 31/10 · depends-on: KIT-5, KIT-60
- ⬜ **KIT-46** — AG Studio dashboard: Kitty Gauge + Who still owes (custom widgets) — **giữ** (never-cut) · 01/11
- ⬜ **KIT-33** — Planner agent: prompt → structured plan → plan diff → tasks/budget/gates · 02/11 · depends-on: KIT-31
- ⬜ **KIT-41** — Demo sites + prompt-injection-blocked demo (Hoodie Deals) · 30/10 · depends-on: KIT-38
- ⬜ **KIT-43** — Shopper agent + Channel3 product search · 04/11 (Should) · depends-on: KIT-31
- ❌ **KIT-44** — Collector agent + Zapier MCP reminders/alerts · bỏ (ADR-026). Nhắc nợ còn lại dạng PayPal Invoicing `/remind` ở KIT-59, thông báo step-up/DENY là in-app.
- ❌ **Astropods** — host Collector agent (C5) · bỏ (ADR-026)

## M4 — Feature freeze · Thu 05/11

Sub-leash Planner → Shopper, settlement, Collector nhắc nợ, AG Studio Agent Framework, Channel3 (nếu kịp). Sau mốc này **chỉ sửa bug & polish**.

- ⬜ **KIT-32** — Sub-leash delegation (`leash_delegate`) + probing detector · 03/11 · depends-on: KIT-17
- ⬜ **KIT-42** — Settlement preview + refunds · 04/11 · depends-on: KIT-16
- ⬜ **KIT-39** — AG Studio Agent Framework "Kitty Analyst" · 03/11 (cut list #3)
- ⬜ **KIT-40** — Bryntum Scheduler leash timeline · chỉ khi dư thời gian (cut list #1)
- 💤 **KIT-35** — Bryntum Gantt với payment gates + realtime → Could · 05/11 nếu mọi thứ khác đã xong (thay timeline shadcn)
- ❌ **KIT-36** — Elastic: quotes RAG cho Planner + audit view · bỏ (ADR-026)
- ❌ **KIT-37** — KERNEL booking + live view · bỏ (ADR-026) (action `browser_booking` giữ trong spec, không build)
- ⬜ **KIT-45** — Feature freeze checkpoint 05/11 23:59: cập nhật bảng trạng thái, áp cut list · 05/11

## M5 — Submission-ready · Tue 10/11

README (kèm MCP quickstart), LICENSE, `render.yaml`, video upload YouTube public, submission draft đầy đủ.

- ⬜ **KIT-54** — Bug bash toàn flow ×3 + loading/empty/error states + mobile `/pay` · 06/11
- ⬜ **KIT-47** — Seed demo data, `demo:reset`, tài khoản judge, evals agent, security checklist · 07/11
- ⬜ **KIT-52** — README (EN): what/why/how, architecture diagram, PayPal APIs used, MCP quickstart (`leash-mcp`), setup, threat model, honest limits + LICENSE + Deploy-to-Render · 08/11
- ❌ **KIT-49** — Postman collection (+ APIMatic) · bỏ (ADR-026); thay bằng hướng dẫn MCP Inspector + `leash-mcp` trong README (KIT-62, KIT-52)
- ⬜ **KIT-53** — Video demo: kịch bản, quay, dựng, phụ đề EN, upload YouTube public · 09–10/11
- ⬜ **KIT-51** — Draft submission Devpost đầy đủ · 10/11

## M6 — Submitted · Wed 11/11

Nộp trên Devpost; test lại từ máy sạch theo README.

- ⬜ **KIT-50** — Clean-machine test theo README + kiểm demo URL · 11/11
- ⬜ **KIT-48** — Submit trên Devpost + screenshot xác nhận · 11/11

## Tổng hợp

| Mốc | ✅ xong | 🟡 đang làm | ⬜ chưa làm | ❌ bỏ | 💤 Could | Tổng |
|---|---|---|---|---|---|---|
| M0 — Foundations | 4 | 0 | 1 | 0 | 0 | 5 |
| M1 — Leash core | 9 | 0 | 6 | 0 | 0 | 15 |
| M2 — Money loop | 4 | 0 | 9 | 1 | 0 | 14 |
| M3 — Agents + Tier-1 UI | 0 | 0 | 8 | 2 | 0 | 10 |
| M4 — Feature freeze | 0 | 0 | 5 | 2 | 1 | 8 |
| M5 — Submission-ready | 0 | 0 | 5 | 1 | 0 | 6 |
| M6 — Submitted | 0 | 0 | 2 | 0 | 0 | 2 |
| **Tổng** | **17** | **0** | **36** | **6** | **1** | **60** |

> Trạng thái theo mốc (bức tranh lớn): M0 🟡 · M1 🟡 · M2 🟡 · M3–M6 ⏳ — xem [docs/16](docs/16-roadmap.md) §6.
