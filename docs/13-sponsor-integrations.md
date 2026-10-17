# 13 — Sponsor Integrations

> Cập nhật 17/10 theo [ADR-024](20-risks-and-decisions.md): thu hẹp sponsor theo luật cộng dồn giải. Tiêu chí từng giải sponsor kiểm trên Devpost ngày 17/10 ([01-hackathon.md](01-hackathon.md) §6).

## 0. Chiến lược

**Q: Nên tích hợp bao nhiêu sponsor?**
A: Luật thưởng: tối đa **1 giải chính/Honorable Mention + 1 giải sponsor**. Tích hợp nhiều sponsor chỉ tăng *số giải được xét*, không tăng tổng tiền tối đa — và tích hợp gượng ép làm giảm điểm **Design** (mạch lạc), kéo trễ critical path. ⇒ Chỉ giữ sponsor **có giải** hoặc **giải một việc thật** trong flow:

| Bậc | Sponsor | Mức độ | Lý do |
|---|---|---|---|
| **Tier 1 — nhắm giải** | **AG Grid (AG Studio)** | Sâu: custom widgets, theme, Studio Agent Framework | Pool lớn nhất (1st $5k, 2nd $2k, 3rd $1k ×3 = 5 suất), có judge AG Grid, hợp tự nhiên (dashboard tiền) |
| **Tier 2 — tính năng thật** | **Render**, **Channel3** | Render: toàn bộ hosting. Channel3: Shopper discovery (Should) | Render dùng thật; Channel3 có giải nhưng chỉ khi gọi API thực chất |
| **Tier 3 — dev tooling** | **APIMatic** | Dùng lúc build `packages/paypal` | Có giải; chỉ ghi khi dùng thật |
| **Could** | **Bryntum** | Gantt thay timeline shadcn nếu dư thời gian sau M4 | Có giải nhưng luật chỉ cho 1 giải sponsor; payment gate vẫn có mà không cần Bryntum |
| **Bỏ (ADR-024)** | Zapier, Elastic, KERNEL, Astropods, Postman | — | Không có giải sponsor; mỗi cái là một tích hợp phụ trên đường găng |

**Giải sponsor ưu tiên:** AG Grid 1st ($5k) > AG Grid 2nd/3rd > Channel3 > APIMatic > Render credits.

---

## 1. AG Grid — AG Studio (Tier 1)

**Tiêu chí AG Grid nêu:** *"covers both what your dashboard looks like and how you build it… custom widgets, theming, layout tools… Studio Agent Framework: a custom agent talking to Studio's built-in agents, or a swapped-in harness."* Trang giải (17/10) nhấn mạnh **độ hoàn thiện (polish)** và **Studio Agent Framework**.

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
- Trial 45 ngày: kích hoạt **01/11** → hết ~16/12, phủ judging 1–15/12 ([08](08-infrastructure.md) §5).

### "Definition of done" để cạnh tranh giải
- [ ] ≥2 custom widgets (Kitty Gauge, Who still owes)
- [ ] Theme riêng + layout preset
- [ ] Studio Agent Framework: custom agent tạo widget từ câu hỏi, quay được trong video (≤15s)
- [ ] Realtime: widget cập nhật khi webhook về

---

## 2. Render (Tier 2 — hạ tầng)

- Toàn bộ deploy bằng **Blueprint** `render.yaml` (web, api, gateway, private service agents, worker/cron, static demo sites). Postgres ở **Neon**, không ở Render ([ADR-018](20-risks-and-decisions.md)).
- **Render Workflows** (nếu có cho account) cho durable tasks: `execute_intent`, `process_outbox`, `reminder_sweep`, `leash_expiry_sweep`, `reconcile_payouts`, `settle_event`. Fallback: worker + Render Cron.
- Credits $50: https://credits-portal-mmdm.onrender.com/claim/paypal-ai-hackathon.
- README có nút **"Deploy to Render"**.

---

## 3. Channel3 (Tier 2 — Should)

**Yêu cầu của họ:** gọi API/MCP **thực chất** (search, enrichment, recommendations). Trang giải ghi rõ: project chỉ nhắc tên mà không gọi API thì không đủ điều kiện.

- Shopper dùng Channel3 search: `"custom embroidered hoodie"` + filter giá → 3 product cards (ảnh, giá, retailer, variants).
- Enrichment: lấy chi tiết sản phẩm để Shopper so sánh và viết lý do chọn.
- Fulfilment trong demo: payout tới **demo vendor** (merch-shop sandbox) — UI ghi rõ (xem [04-product-spec.md](04-product-spec.md) §6).
- Key: https://trychannel3.com/developers + promo `PAYPAL-HACKATHON-2026` (20.000 credits). MCP: https://trychannel3.com/mcp. Docs: https://docs.trychannel3.com.
- Cache kết quả search 24h (tiết kiệm credits, demo ổn định).
- Không kịp (cut list #2) → Shopper dùng catalog tĩnh trong `apps/demo-sites`; khi đó **không** ghi Channel3 trong Built With.

---

## 4. APIMatic (Tier 3 — dev tooling, vẫn xét giải)

- Cài **APIMatic Context Plugin for PayPal** vào Claude Code khi code `packages/paypal` và gateway executors (cùng với PayPal AI-Toolkit plugin — [ADR-007](20-risks-and-decisions.md)).
- Ghi trong submission: "We built the PayPal integration with Claude Code + APIMatic Context Plugin" + ví dụ cụ thể (vd: plugin cung cấp schema Payouts/Invoicing).
- Điền form free subscription: https://docs.google.com/forms/d/e/1FAIpQLScc2oCgAFACm7d6H3R4mgzv-O34DdyVnLIBNiwmUNggr_-hhA/viewform

---

## 5. Bryntum (Could)

**Tiêu chí Bryntum nêu:** *"the cleanest timeline, the smartest resource booking, or an agent that drives the schedule itself."* Ý tưởng gợi ý của họ trùng Kitty: *"payment tranches marked as dependencies, so a late PayPal payment visibly blocks the next phase"*.

- **Bản chính của payment gate là timeline shadcn của mình** (M2). Bryntum chỉ thay vào nếu M4 xong sớm.
- Nếu làm: Gantt ở `/events/:id/plan` (package trial `@bryntum/gantt@npm:@bryntum/gantt-trial` + wrapper React, bọc trong component của mình theo [CODE_RULES.md](../CODE_RULES.md) §C); payment gate = milestone "💰 Kitty ≥ $X"; Treasurer dời task khi payout fail (`app.update_task`).
- Scheduler "Leash timeline" và Calendar cho member: bỏ khỏi hackathon.

---

## 6. Đã bỏ khỏi scope hackathon (ADR-024)

| Sponsor | Kế hoạch cũ | Thay bằng |
|---|---|---|
| Zapier MCP | Slack/Gmail nhắc nợ; Slack báo step-up và DENY | Nhắc nợ = PayPal Invoicing `/remind` qua `leash_send_reminder` (PayPal gửi email). Step-up/DENY = thông báo in-app (badge, toast, banner đỏ) |
| Elastic | RAG báo giá vendor; index audit cho "Security view" | Planner làm việc với dữ liệu event + vendor đã nhập; "Security view" lọc `leash.audit_events` trực tiếp |
| KERNEL | Browser agent đặt chỗ trên trang vendor demo | Shopper fetch trang demo bằng HTTP thường (đủ cho injection demo); action `browser_booking` giữ trong spec, không build |
| Astropods | Host Collector agent | Collector chạy trong `apps/agents` |
| Postman | Kitty Gateway collection có pre-request script ký Ed25519 | Judges test Gateway bằng **MCP Inspector + `leash-mcp`** ([ADR-025](20-risks-and-decisions.md)) — hướng dẫn trong README |

---

## 7. Bảng "Built With" cho submission

**Quy tắc ([21](21-design-questions.md) F5):** chỉ liệt kê thứ mà code chạy trên demo thật sự gọi; dev tooling ghi rõ là dev tooling. Mục có điều kiện chỉ thêm khi điều kiện đúng lúc nộp.

**Chắc chắn:** `PayPal Payouts API · PayPal Invoicing API · PayPal Orders API v2 · PayPal Payments (Refunds) · PayPal Webhooks · PayPal JS SDK v6 · Model Context Protocol (Leash Gateway MCP server + leash-mcp bridge) · Vercel AI SDK (BYOK: Anthropic Claude + any OpenAI-compatible model) · AG Studio · Render · Next.js · Hono · Bun · TypeScript · PostgreSQL (Neon) · Drizzle`

**Có điều kiện:** `PayPal Agent Toolkit` (chỉ khi gateway gọi nó — ADR-007) · `Channel3` (chỉ khi Shopper gọi API thật) · `Bryntum Gantt` (chỉ khi thay timeline) · `APIMatic Context Plugin` + `PayPal AI-Toolkit` (ghi là dev tooling)
