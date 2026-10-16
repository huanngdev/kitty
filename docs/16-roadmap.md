# 16 — Roadmap & Kế hoạch theo ngày

> Hôm nay: **Fri 16/10/2026**. Hạn nội bộ nộp bài: **Wed 11/11/2026 23:59 ICT**. Hạn chót Devpost: Thu 12/11 12:00pm PST (≈ 03:00 Fri 13/11 ICT).
> Còn **26 ngày làm việc** + 1 ngày buffer. Cập nhật cột "Trạng thái" hằng ngày.

## 1. Milestones

| Mốc | Ngày | Định nghĩa "xong" |
|---|---|---|
| **M0 — Foundations** | Sat 17/10 | Monorepo chạy `bun run dev` (Turborepo); Render deploy "hello" 3 services; sandbox-check pass (invoice + payout $1) |
| **M1 — Leash core** | Thu 22/10 | `packages/leash` + ledger + gateway: tạo kitty/leash, MCP `leash_request_payout` ký Ed25519, reserve, execute Payout sandbox, webhook settle. 100% branch coverage policy engine |
| **M2 — Money loop end-to-end** | Wed 28/10 | Web: tạo event → invoices → member trả (sandbox) → Kitty tăng realtime → leash Treasurer → step-up → payout → settled. **Đây là bài nộp tối thiểu hợp lệ** |
| **M3 — Agents + Tier-1 UI** | Mon 02/11 | Planner tạo plan; Bryntum Gantt có payment gates; AG Studio dashboard; Collector + Zapier; Shopper + Channel3; injection demo bị chặn |
| **M4 — Feature freeze** | Thu 05/11 | Sub-leash, settlement, Elastic, (KERNEL nếu kịp). Sau mốc này **chỉ sửa bug & polish** |
| **M5 — Submission-ready** | Tue 10/11 | README, LICENSE, render.yaml, Postman, video upload YouTube public, submission draft đầy đủ |
| **M6 — Submitted** | Wed 11/11 | Nộp trên Devpost; test lại từ máy sạch theo README |

## 2. Kế hoạch theo ngày

### Tuần 0–1: Foundations + Leash core
| Ngày | Việc | Output |
|---|---|---|
| Fri 16/10 | Docs (bộ này) · tạo PayPal developer app sandbox · sandbox accounts · claim Render credits · form APIMatic · join Discord | docs/, accounts |
| Sat 17/10 | Scaffold monorepo (Turborepo + Bun workspaces, tsconfig base, Biome, `bun test`) · `apps/web` bằng `bunx create-next-app@latest` · `apps/gateway`/`agents`/`worker` Hono trên Bun · `packages/config` env schemas · Postgres Docker · **spike Bun** ([07](07-tech-stack.md) §6) · `render.yaml` + Dockerfiles v0 deploy · **`scripts/sandbox-check.ts`** (OAuth, invoice $1, payout $1) | **M0** |
| Sun 18/10 | `packages/paypal` (OAuth cache, Invoicing, Payouts, Orders, Refund, verify webhook) với APIMatic plugin · spike Agent Toolkit (ADR-007) | client + tests (`bun test` + MSW) |
| Mon 19/10 | `packages/ledger` (money cents, bucket entries, balanceOf) · `packages/db` schema `leash` + migrations | invariants tests |
| Tue 20/10 | `packages/leash` policy engine (evaluate, reason codes, delegation validator) + property tests (fast-check) · kích hoạt trial AG Studio + Bryntum | 100% coverage |
| Wed 21/10 | `packages/signing` (Ed25519 sign/verify, nonce) · gateway: admin API (kitties, agents, leashes), reservation transaction | |
| Thu 22/10 | gateway: MCP server (`leash_status`, `leash_check`, `leash_request_payout`), execute_intent, webhook endpoint + dedupe + state machine · test script agent giả ký request → payout sandbox → settled | **M1** |

### Tuần 2: Money loop end-to-end
| Ngày | Việc |
|---|---|
| Fri 23/10 | web: Next.js shell, Better Auth (demo accounts), layout, tokens/theme · schema `app` |
| Sat 24/10 | web: tạo event (form thủ công trước), members, vendors (verify), kitty tạo qua gateway |
| Sun 25/10 | gateway: `leash_create_invoice` + Invoicing webhook → contributions · web: trang `/pay/:requestId` (+ Orders fallback JS SDK v6) |
| Mon 26/10 | outbox → worker → SSE realtime · Overview page số liệu thật |
| Tue 27/10 | Leashes page (create/presets/revoke/pause/top-up, "Max possible loss") · Approval Inbox · approve → execute · **manual mode**: nút Send invoices / Pay vendor cho organizer |
| Wed 28/10 | Activity timeline · reconcile sweep · expiry sweep · deploy demo · quay thử luồng | 
| | | **M2 ✅ — từ đây luôn có bản nộp được** |

### Tuần 3: Agents + Tier-1 UI
| Ngày | Việc |
|---|---|
| Thu 29/10 | apps/agents: runtime loop qua **AI SDK**, MCP client có signing, tool dispatcher theo vai, agent_runs trace · **BYOK**: `packages/crypto-box`, `ai_credentials`/`model_settings`/`llm_usage`, `resolveModel()`, màn hình S21 (Anthropic + OpenAI-compatible), demo key cho tài khoản `is_demo` · Treasurer (gate mở → payout) |
| Fri 30/10 | Planner: prompt → structured plan → plan diff UI → create tasks/budget/gates |
| Sat 31/10 | **Bryntum Gantt**: tasks + deps + payment gate milestones + realtime mở gate + agent reschedule |
| Sun 01/11 | **AG Studio**: data sources, Kitty Gauge + Who still owes custom widgets, theme · kích hoạt Zapier trial + KERNEL credits |
| Mon 02/11 | Collector + **Zapier MCP** (Slack/Gmail reminders, step-up & DENY alerts) · Shopper + **Channel3** · demo-sites (Hoodie Deals injection page) · injection flow | **M3** |

### Tuần 4: Hoàn thiện + freeze
| Ngày | Việc |
|---|---|
| Tue 03/11 | Sub-leash (`leash_delegate`) Planner → Shopper · probing detector · Studio Agent Framework "Kitty Analyst" |
| Wed 04/11 | Settlement (preview + refunds) · **Elastic** (kitty-docs quotes RAG cho Planner; kitty-audit security view) |
| Thu 05/11 | (Could) KERNEL booking + live view · (Could) Scheduler leash timeline · **FEATURE FREEZE 23:59** | **M4** |
| Fri 06/11 | Bug bash toàn flow ×3 · empty/loading/error states · mobile `/pay` |
| Sat 07/11 | Seed demo + `demo:reset` · nhiều event demo cho judges · evals agent · security checklist |
| Sun 08/11 | README (EN), kiến trúc diagram, threat model, setup guide, Postman collection, LICENSE MIT, Deploy-to-Render |
| Mon 09/11 | Viết kịch bản video, quay lần 1, xem lại, sửa UI theo video |
| Tue 10/11 | Quay final, dựng, phụ đề EN, upload YouTube public · điền draft submission Devpost | **M5** |
| Wed 11/11 | Test từ máy sạch theo README · kiểm demo URL · **SUBMIT** · screenshot xác nhận | **M6** |
| Thu 12/11 | Buffer (không làm feature). Chỉ sửa nếu link hỏng. |

## 3. Critical path

```
sandbox-check (Payouts OK?) → paypal client → policy engine → gateway reserve/execute/webhook
   → web money loop (M2) → agents (Treasurer, Planner) → Gantt gates → dashboard → video
```
Bất kỳ trễ nào trên chuỗi này → cắt theo §4 ngay, không đợi.

## 4. Cut list (theo thứ tự cắt)

1. Astropods
2. KERNEL booking (giữ injection page fetch bằng HTTP thường)
3. Bryntum Scheduler/Calendar (giữ Gantt)
4. Elastic audit view (giữ RAG quotes nếu kịp, nếu không cắt cả Elastic)
5. Studio Agent Framework (giữ custom widgets)
5b. BYOK provider OpenAI / Google / OpenRouter riêng và biểu đồ usage (giữ Anthropic + OpenAI-compatible, vì OpenRouter cũng vào được qua compatible)
6. Settlement refunds tự động (giữ preview)
7. Sub-leash (giữ leash gốc cho Shopper)

**Không bao giờ cắt:** Leash Gateway + policy + signing · prefunded allocation · money loop invoice→payout với webhooks · injection-blocked demo · Gantt payment gate · AG dashboard cơ bản · BYOK tối thiểu (key mã hoá + chọn model) + demo key cho judges · manual mode · README + video.

## 5. Nhịp làm việc

- Mỗi ngày: cuối ngày deploy demo + cập nhật bảng trạng thái + ghi quyết định mới vào [20-risks-and-decisions.md](20-risks-and-decisions.md).
- Mỗi milestone: quay một đoạn screen recording ngắn (dùng lại cho video, và làm bằng chứng tiến độ).
- Kiểm tra Devpost **Updates** mỗi thứ Hai.

## 6. Bảng trạng thái

| Milestone | Trạng thái | Ghi chú |
|---|---|---|
| M0 | ⏳ | |
| M1 | ⏳ | |
| M2 | ⏳ | |
| M3 | ⏳ | |
| M4 | ⏳ | |
| M5 | ⏳ | |
| M6 | ⏳ | |
