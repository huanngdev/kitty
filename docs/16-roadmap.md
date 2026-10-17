# 16 — Roadmap & Kế hoạch theo ngày

> Cập nhật: **Sat 17/10/2026** — re-plan sau review chiến lược + audit code ([ADR-026](20-risks-and-decisions.md), [ADR-027](20-risks-and-decisions.md)). Hạn nội bộ nộp bài: **Wed 11/11/2026 23:59 ICT**. Hạn chót Devpost: Thu 12/11 12:00pm PST (≈ 03:00 Fri 13/11 ICT).
> Còn **25 ngày** + 1 ngày buffer. Cập nhật bảng trạng thái (§6) mỗi tối.

## 1. Milestones

| Mốc | Ngày | Định nghĩa "xong" |
|---|---|---|
| **M0 — Foundations** | Sat 17/10 (trễ nhất Sun 18/10) | Monorepo + CI (đã có); `render.yaml` + Dockerfiles; web/api/gateway chạy trên Render + Neon; `sandbox:check` pass (invoice + payout $1); webhook PayPal trỏ về gateway đã deploy |
| **M1 — Leash core** | Thu 22/10 | Đã có: policy engine, ledger, signing, MCP 5 tool, reserve → payout, webhook payout + reconcile. **Còn:** đường tiền vào (`leash_create_invoice` + webhook `INVOICING.INVOICE.PAID` → ledger), approve/reject + hết hạn approval, 4 tool MCP còn thiếu, MCP đúng spec (405 cho GET/DELETE, tool annotations), chạy live trên URL đã deploy |
| **M2 — Money loop end-to-end** | Wed 28/10 | Web: tạo event (form) → members/vendors → gửi invoice → member trả (sandbox) → Kitty tăng → cấp leash Treasurer → step-up → approve → payout → settled; payment gate mở trên timeline; manual mode đủ dùng. **Đây là bài nộp tối thiểu hợp lệ** |
| **M3 — Agents + MCP + Tier-1 UI** | Mon 02/11 | `apps/agents` (AI SDK loop, MCP client có ký) + BYOK tối thiểu + demo key; Treasurer + Shopper chạy thật; injection demo bị chặn; **`leash-mcp`** + màn hình "Connect an external agent" (Claude Desktop / Claude Code kết nối được); AG Studio dashboard; Planner tạo plan |
| **M4 — Feature freeze** | Thu 05/11 | Sub-leash Planner → Shopper, settlement, Collector nhắc nợ, AG Studio Agent Framework, Channel3 (nếu kịp). Sau mốc này **chỉ sửa bug & polish** |
| **M5 — Submission-ready** | Tue 10/11 | README (kèm MCP quickstart), LICENSE, `render.yaml`, video upload YouTube public, submission draft đầy đủ |
| **M6 — Submitted** | Wed 11/11 | Nộp trên Devpost; test lại từ máy sạch theo README |

## 2. Kế hoạch theo ngày

### Đã xong (16–17/10)
Bộ docs 01–25 · monorepo Turborepo + Bun + CI · `packages/leash` (100% coverage, property tests) · `packages/ledger` · `packages/signing` (+ `createSignedFetch`) · `packages/paypal` (Payouts, Invoicing, Orders, Refunds, verify webhook) · `packages/db` (schema `leash`; schema `app`: events, members, vendors, budget lines, auth) · gateway: admin `/v1` (kitties, agents, leashes, payees, audit), reserve → execute payout, MCP 5 tool (KIT-5), webhook payout + reconcile (KIT-7) · `apps/api`: Better Auth, demo login, events/members/vendors/budget lines + tạo kitty (KIT-30) · web: sign in/up, app shell, theme (KIT-24) · runtime spike (KIT-10) · 647 test pass.

**Sau re-plan (17/10, đã merge lên main):** test layout theo package `test/` (KIT-56, PR #18) · UI reset — shadcn cài trực tiếp trong `apps/web`, xoá `packages/ui`, `<Logo />` (KIT-55, PR #19) · `LinkButton` dùng chung (PR #20) · UI-QA — `proxy.ts` xác thực session thật thay vì chỉ tin cookie, nhãn nút demo rõ ("Try the demo (for judges)"), shell mobile gọn (PR #22).

### Tuần 0–1: Deploy + đóng vòng tiền ở gateway
| Ngày | Việc | Output |
|---|---|---|
| Sat 17/10 | `render.yaml` + Dockerfiles (web, api, gateway) · deploy lên Render + Neon · `sandbox:check` pass · đăng ký webhook PayPal trỏ về gateway đã deploy · re-plan docs (ADR-026, ADR-027) | **M0** |
| Sun 18/10 | Spike ADR-007 (`@paypal/agent-toolkit` trong gateway: có `PayPal-Request-Id` không?) → chốt · approvals: `POST /v1/approvals/:id/approve` / `reject`, approve → execute, hết hạn 15' → release hold | ADR-007 chốt |
| Mon 19/10 | `leash_create_invoice` (Toolkit hoặc REST) + webhook `INVOICING.INVOICE.PAID` → ledger `member_contribution` → `kitty.available` · endpoint "collect" cho organizer (manual mode) | Tiền vào được (R16) |
| Tue 20/10 | `leash_send_reminder` (Invoicing `/remind`), `leash_request_refund`, `leash_delegate` (validator có sẵn) · MCP đúng spec: GET/DELETE `/mcp` → 405, tool annotations (`readOnlyHint` / `destructiveHint` / `idempotentHint`), resource `leash://status` | 9/9 tool |
| Wed 21/10 | Web: `/events` gọi API thật, tạo event (form), Overview khung, People (members + vendors, verify vendor) | |
| Thu 22/10 | Web: Collect (gửi invoice) + `/pay/:requestId` (payer-view link + Orders fallback JS SDK v6) · chạy live: invoice → paid → kitty tăng → payout → settled trên URL đã deploy | **M1** |

### Tuần 2: Money loop end-to-end trên web
| Ngày | Việc |
|---|---|
| Fri 23/10 | Leashes page: create/presets/pause/revoke/top-up, "Max possible loss", "Explain this leash" |
| Sat 24/10 | Approval Inbox + Approval detail (approve → execute) · manual "Pay vendor" cho organizer |
| Sun 25/10 | `apps/worker`: outbox → SSE (fallback polling 10s) · reconcile + expiry sweep (Render cron) |
| Mon 26/10 | Activity timeline · Overview số liệu thật · schema `app` cho tasks + payment gates |
| Tue 27/10 | Plan: **timeline payment gate (shadcn)** — gate 🔒/🔓 tự mở theo ledger event |
| Wed 28/10 | Deploy · chạy trọn money loop ×2 trên demo URL · quay clip |
| | **M2 ✅ — từ đây luôn có bản nộp được** |

### Tuần 3: Agents + MCP + AG Studio
| Ngày | Việc |
|---|---|
| Thu 29/10 | `apps/agents`: loop qua **AI SDK**, MCP client ký bằng `createSignedFetch`, tool dispatcher theo vai, `agent_runs` trace · **BYOK** tối thiểu: `packages/crypto-box`, `ai_credentials`/`model_settings`/`llm_usage`, `resolveModel()`, màn hình S21 (Anthropic + OpenAI-compatible), demo key cho tài khoản `is_demo` |
| Fri 30/10 | Treasurer (gate mở → payout intent) + Shopper (payout trong leash) · `apps/demo-sites`: trang "Hoodie Deals" có injection · luồng injection → DENY → banner đỏ → Revoke |
| Sat 31/10 | **`packages/leash-mcp`** (`init` sinh keypair trên máy người dùng, stdio → `/mcp` có ký) + màn hình "Connect an external agent" · test với MCP Inspector, Claude Desktop, Claude Code (ADR-027) |
| Sun 01/11 | Kích hoạt trial **AG Studio** (45 ngày → ~16/12, phủ judging) · Money Room: Kitty Gauge + Who still owes (custom widgets), theme, layout preset |
| Mon 02/11 | Planner: prompt → structured plan → plan diff → tạo tasks/budget/gates | **M3** |

### Tuần 4: Hoàn thiện + freeze
| Ngày | Việc |
|---|---|
| Tue 03/11 | Sub-leash Planner → Shopper (`leash_delegate`) · probing detector · AG Studio Agent Framework "Kitty Analyst" |
| Wed 04/11 | Settlement (preview + refunds) · Collector: gửi invoice + nhắc qua `leash_send_reminder` (cron) · (Should) Channel3 cho Shopper |
| Thu 05/11 | Buffer cho M4 · (Could) Bryntum Gantt thay timeline nếu mọi thứ khác đã xong · **FEATURE FREEZE 23:59** | **M4** |
| Fri 06/11 | Bug bash toàn flow ×3 · empty/loading/error states · mobile `/pay` |
| Sat 07/11 | Seed demo + `demo:reset` · nhiều event demo cho judges · evals agent (injection 5 biến thể) · security checklist |
| Sun 08/11 | README (EN): what/why/how, architecture diagram, **PayPal APIs used**, **MCP quickstart (`leash-mcp`)**, setup, threat model, honest limits · LICENSE MIT · Deploy-to-Render |
| Mon 09/11 | Viết kịch bản video, quay lần 1, xem lại, sửa UI theo video |
| Tue 10/11 | Quay final, dựng, phụ đề EN, upload YouTube public · điền draft submission Devpost | **M5** |
| Wed 11/11 | Test từ máy sạch theo README · kiểm demo URL · **SUBMIT** · screenshot xác nhận | **M6** |
| Thu 12/11 | Buffer (không làm feature). Chỉ sửa nếu link hỏng. |

## 3. Critical path

```
deploy + sandbox-check → approvals + tiền vào bằng invoice (R16) → web money loop (M2)
   → agents (Treasurer, Shopper) + injection demo → leash-mcp → AG dashboard → video
```
Bất kỳ trễ nào trên chuỗi này → cắt theo §4 ngay, không đợi.

## 4. Cut list (theo thứ tự cắt)

1. Bryntum Gantt (đã là Could — giữ timeline shadcn)
2. Channel3 (Shopper dùng catalog trong `apps/demo-sites`)
3. AG Studio Agent Framework (giữ custom widgets)
4. Collector tự động theo cron (giữ nút "Send reminder" thủ công)
5. BYOK provider OpenAI / Google / OpenRouter riêng và biểu đồ usage (giữ Anthropic + OpenAI-compatible, vì OpenRouter cũng vào được qua compatible)
6. Settlement refunds tự động (giữ preview)
7. Sub-leash (giữ leash gốc cho Shopper)

**Đã bỏ khỏi scope hackathon ([ADR-026](20-risks-and-decisions.md)):** Zapier, Elastic, KERNEL, Astropods, Postman collection.

**Không bao giờ cắt:** Leash Gateway + policy + signing · prefunded allocation · money loop invoice → payout với webhooks trên URL đã deploy · approve/reject step-up · injection-blocked demo · payment gate (timeline) · AG dashboard cơ bản · `leash-mcp` với ≥1 MCP client bên ngoài · BYOK tối thiểu (key mã hoá + chọn model) + demo key cho judges · manual mode · README + video.

## 5. Nhịp làm việc

- Mỗi ngày: cuối ngày deploy demo + cập nhật [MILESTONES.md](../MILESTONES.md) / [PROGRESS.md](../PROGRESS.md) + ghi quyết định mới vào [20-risks-and-decisions.md](20-risks-and-decisions.md).
- Mỗi milestone: quay một đoạn screen recording ngắn (dùng lại cho video, và làm bằng chứng tiến độ).
- Kiểm tra Devpost **Updates** mỗi thứ Hai.

## 6. Bảng trạng thái

| Milestone | Trạng thái | Ghi chú (17/10) |
|---|---|---|
| M0 | 🟡 | Monorepo, CI, script `sandbox:check` có; chưa có `render.yaml` / deploy |
| M1 | 🟡 | Code lõi xong (policy, ledger, signing, MCP 5/9 tool, payout + webhook payout + reconcile); thiếu tiền vào (invoice), approvals, 4 tool, chạy live |
| M2 | 🟡 | ~25%: API events/members/vendors/budget lines + tạo kitty; web mới có auth + shell (đã qua UI reset PR #19 và UI-QA PR #22) |
| M3 | ⏳ | `apps/agents`, `leash-mcp`, BYOK, AG Studio chưa bắt đầu |
| M4 | ⏳ | Chỉ có delegation validator trong `packages/leash` |
| M5 | ⏳ | LICENSE có; README còn sơ khai |
| M6 | ⏳ | |

> Trạng thái chi tiết theo từng task: [MILESTONES.md](../MILESTONES.md). Nhật ký đã làm: [PROGRESS.md](../PROGRESS.md).
