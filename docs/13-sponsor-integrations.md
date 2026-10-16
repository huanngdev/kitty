# 13 — Sponsor Integrations

## 0. Chiến lược

**Q: Nên tích hợp bao nhiêu sponsor?**
A: Luật thưởng: tối đa **1 giải chính/Honorable Mention + 1 giải sponsor**. Tích hợp nhiều sponsor chỉ tăng *số giải được xét*. Nhưng tích hợp gượng ép làm giảm điểm **Design** (mạch lạc). ⇒ Chia ba bậc:

| Bậc | Sponsor | Mức độ | Lý do |
|---|---|---|---|
| **Tier 1 — nhắm giải** | **AG Grid (AG Studio)**, **Bryntum** | Sâu, tuỳ biến, có agent | Pool lớn ($10k / 5 suất AG; 3 suất Bryntum), hợp tự nhiên (dashboard tiền, timeline có payment gate) |
| **Tier 2 — tính năng thật** | **Channel3**, **Render**, **Zapier**, **Elastic** | Một tính năng hoàn chỉnh mỗi cái | Mỗi cái giải một việc thật trong flow |
| **Tier 3 — dev tooling / bonus** | **APIMatic**, **Postman**, **KERNEL**, **Astropods** | Dùng trong quá trình build hoặc COULD | Ghi trong submission; KERNEL/Astropods cắt được |

**Giải sponsor ưu tiên:** AG Grid 1st ($5k) > AG Grid 2nd/3rd > Bryntum > Channel3 > APIMatic.

---

## 1. AG Grid — AG Studio (Tier 1)

**Mục tiêu theo tiêu chí AG Grid nêu:** *"covers both what your dashboard looks like and how you build it… custom widgets, theming, layout tools… Studio Agent Framework: a custom agent talking to Studio's built-in agents, or a swapped-in harness."*

### Dùng ở đâu
Trang **`/events/:id/money` — "Kitty Money Room"** và một tab **"Leash Control Center"**.

### Widgets
| Widget | Loại | Dữ liệu |
|---|---|---|
| **Kitty Gauge** (custom) | Custom widget: con mèo "đầy bụng" theo % đã thu | contributions vs target |
| **Who still owes** (custom) | Scoreboard thân thiện (avatar, emoji, không đỏ chói) — đúng ý tưởng "Nudge-bot" AG gợi ý | members × paid/unpaid |
| Spend by category | Bar (AG Charts) | budget lines vs settled |
| Leash usage | Bullet/progress per leash | allocation, held, spent |
| **Blocked attempts** | Grid + sparkline | intents DENY theo reason code |
| Cash flow | Area chart theo thời gian | ledger |
| Ledger grid | AG Grid, filter/group | ledger entries |

### Theming & layout
- Theme Kitty (màu, font, bo góc) đồng bộ với Tailwind tokens; dark mode.
- 2 layout preset: "Organizer overview" và "Security view".

### Studio Agent Framework
- **Custom agent "Kitty Analyst"** nói chuyện với built-in agents của Studio: organizer hỏi *"Which leash was blocked the most this week?"* / *"Show food spend vs budget per day"* → agent truy vấn data source của Studio → tạo/sửa widget.
- Data source: endpoint read-only `/api/events/:id/analytics/*` (web BFF → Gateway), **không cho agent dashboard quyền tiền**.

### Bắt đầu
- Boilerplate: https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate (đọc trước để copy setup AG Studio + PayPal).
- Docs: Quick Start, Custom Widgets & Theming, Studio Agent Framework (links ở [01-hackathon.md](01-hackathon.md)).
- Trial 45 ngày: kích hoạt ~20/10.

### "Definition of done" để cạnh tranh giải
- [ ] ≥2 custom widgets (Kitty Gauge, Who still owes)
- [ ] Theme riêng + layout preset
- [ ] Studio Agent Framework: custom agent tạo widget từ câu hỏi, quay được trong video (≤15s)
- [ ] Realtime: widget cập nhật khi webhook về

---

## 2. Bryntum (Tier 1)

**Tiêu chí Bryntum nêu:** *"the cleanest timeline, the smartest resource booking, or an agent that drives the schedule itself."* Ý tưởng gợi ý của họ trùng Kitty: *"payment tranches marked as dependencies, so a late PayPal payment visibly blocks the next phase"* và *"Agent-driven rescheduler… watches PayPal payment events and automatically moves or flags milestones"*.

### Dùng ở đâu
| Component | Màn hình | Nội dung |
|---|---|---|
| **Gantt** (Must) | `/events/:id/plan` | Tasks + dependencies; **payment gate = milestone ẩn "💰 Kitty ≥ $X"** mà task phụ thuộc; gate đóng → task 🔒 và Gantt hiển thị bị chặn; webhook → gate mở → engine tự dời lịch |
| **Scheduler** (Could) | `/events/:id/leashes` | "Leash timeline": mỗi agent một resource row; event bar = khoảng hiệu lực leash; marker = intents (xanh ALLOW, vàng STEP_UP, đỏ DENY) |
| **Calendar** (Could) | `/m/:token` | Lịch trình cho member |

### Agent-driven rescheduler
- Payout vendor `failed`/trễ → Treasurer gọi `app.update_task` (dời hoặc flag) → Gantt cập nhật realtime và hiện ghi chú "Moved by Treasurer: payout to Highland Bus failed (RETURNED)".

### Kỹ thuật
- Package trial: `@bryntum/gantt@npm:@bryntum/gantt-trial` (tương tự cho scheduler/calendar) + wrapper React.
- Data: CrudManager load/sync qua `/api/events/:id/gantt` (tasks, dependencies); ghi lại khi organizer kéo thả.
- Gate milestone render bằng `taskRenderer`/icon; read-only khi gate đóng.

### Definition of done
- [ ] Gantt với ≥12 tasks, dependencies, 2 payment gates
- [ ] Gate mở tự động từ webhook (quay được)
- [ ] Agent reschedule 1 task khi payout fail
- [ ] (Could) Scheduler leash timeline

---

## 3. Channel3 (Tier 2)

**Yêu cầu của họ:** gọi API/MCP **thực chất** (search, enrichment, recommendations) — chỉ nhắc tên là không đủ.

- Shopper dùng Channel3 search: `"custom embroidered hoodie"` + filter giá → 3 product cards (ảnh, giá, retailer, variants).
- Enrichment: lấy chi tiết sản phẩm để Shopper so sánh và viết lý do chọn.
- Fulfilment trong demo: payout tới **demo vendor** (merch-shop sandbox) — UI ghi rõ (xem [04-product-spec.md](04-product-spec.md) §6).
- Key: https://trychannel3.com/developers + promo `PAYPAL-HACKATHON-2026` (20.000 credits). MCP: https://trychannel3.com/mcp. Docs: https://docs.trychannel3.com.
- Cache kết quả search 24h (tiết kiệm credits, demo ổn định).

---

## 4. Render (Tier 2 — hạ tầng)

- Toàn bộ deploy bằng **Blueprint** `render.yaml` (web, gateway, private service agents, worker/workflows, cron, static demo sites, Postgres).
- **Render Workflows** cho durable tasks: `execute_intent`, `process_outbox`, `reminder_sweep`, `leash_expiry_sweep`, `reconcile_payouts`, `settle_event`, `index_audit`. Ưu điểm kể trong submission: retry tự động, chạy song song (vd 12 invoice cùng lúc), quan sát từng task.
- Credits $50: https://credits-portal-mmdm.onrender.com/claim/paypal-ai-hackathon.
- README có nút **"Deploy to Render"**.

---

## 5. Zapier MCP (Tier 2)

- Collector & alerting gửi qua Zapier MCP: **Slack** (kênh #da-lat-offsite, DM organizer), **Gmail** (nhắc nợ), **Google Calendar** (gửi lịch cho members — Could).
- Step-up approval notification: tin Slack có deep link "Review in Kitty".
- High-severity DENY alert: "🚨 Shopper tried to pay refund-desk@scam.example $2,000 — blocked by leash. [Revoke leash]".
- Docs: https://docs.zapier.com/mcp/get-started/quickstart. Trial Pro 14 ngày → kích hoạt sát ngày quay (~01/11); kiểm tra free plan có đủ cho judges xem không, nếu không → feature flag hiển thị "notification preview" trong app.

---

## 6. Elastic (Tier 2)

Hai index:
| Index | Nội dung | Dùng cho |
|---|---|---|
| `kitty-docs` | Báo giá/hợp đồng vendor (PDF → text), field `semantic_text` với **Jina embeddings** qua inference endpoint | Planner: "Which homestay offers free cancellation and fits 12 people?" (hybrid search: BM25 + semantic) |
| `kitty-audit` | Audit events + intents | "Security view": tìm "all denied attempts to new payees", phát hiện bất thường (payee mới, tần suất) bằng ES|QL |

- Trial: https://ela.st/elastic-paypal-hackathon (Serverless, project type Search/Vector). Hết 14 ngày → form gia hạn 30 ngày. Fallback: chạy Elasticsearch local trong dev.
- Inference endpoint id của Jina phải kiểm khi setup (tên endpoint có thể khác theo version).

---

## 7. APIMatic (Tier 3 — dev tooling, vẫn xét giải)

- Cài **APIMatic Context Plugin for PayPal** vào Claude Code khi code `packages/paypal` và gateway executors.
- Ghi trong submission: "We built the PayPal integration with Claude Code + APIMatic Context Plugin" + ví dụ cụ thể (vd: plugin cung cấp schema Payouts/Invoicing).
- Điền form free subscription: https://docs.google.com/forms/d/e/1FAIpQLScc2oCgAFACm7d6H3R4mgzv-O34DdyVnLIBNiwmUNggr_-hhA/viewform

## 8. Postman (Tier 3)

- Fork **PayPal collection** (https://www.postman.com/paypal) để thử sandbox nhanh.
- Xuất **Kitty Gateway collection** (`postman/kitty-gateway.postman_collection.json`): Admin API + một request MCP mẫu (ký bằng pre-request script) — giúp judges test Gateway độc lập.

## 9. KERNEL (Tier 3 — Could)

- Shopper/Planner đặt chỗ trên **demo vendor site** (`apps/demo-sites/booking`) — form không có API — bằng KERNEL browser + Playwright.
- Live view nhúng vào chat card ("Watching Shopper book a table…").
- Hành động `browser_booking` vẫn đi qua leash (amount 0, rate limit, action allowlist).
- Cũng dùng KERNEL để Shopper "duyệt" trang Hoodie Deals có injection → cảnh demo thực tế hơn.
- Credits: https://dashboard.onkernel.com/hackathon?code=KERNELDEVPOST2026

## 10. Astropods (Tier 3 — Could)

- Nếu dư thời gian: đóng gói Collector agent theo spec Astropods và deploy, để có observability riêng. Không nằm trên critical path.

---

## 11. Bảng "Built With" cho submission

`PayPal Invoicing API · PayPal Payouts API · PayPal Orders API v2 · PayPal Payments (Refunds) · PayPal Webhooks · PayPal JS SDK v6 · PayPal Agent Toolkit · Anthropic Claude (BYOK, any model via Vercel AI SDK) · Model Context Protocol · AG Studio · Bryntum Gantt/Scheduler · Channel3 · Elastic (Jina embeddings) · Zapier MCP · Render (Workflows, Postgres) · KERNEL · APIMatic Context Plugin · Postman · Next.js · TypeScript · PostgreSQL · Drizzle`
