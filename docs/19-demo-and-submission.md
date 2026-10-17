# 19 — Demo Video & Submission

## 1. Kịch bản video (mục tiêu 2:50, tiếng Anh)

| Thời gian | Hình | Lời (VO) |
|---|---|---|
| 0:00–0:10 | Nhóm chat đầy "who still owes?", Venmo/PayPal screenshots giả lập | "Every group trip has one person who fronts the money and chases everyone for weeks." |
| 0:10–0:20 | Logo Kitty, tagline | "AI agents could do all of that — but would you hand an AI your PayPal? Kitty lets your agents spend. On a leash." |
| 0:20–0:40 | Mai gõ prompt → Planner trả plan → timeline hiện ra với 🔒 payment gates | "Mai describes the trip. The Planner builds a budget and a timeline where money is a dependency." |
| 0:40–1:00 | Collector gửi 12 invoices; chuyển tab member trả bằng PayPal sandbox; Kitty gauge tăng; gate 🔓 | "Members chip in through PayPal invoices. Webhooks land, the kitty fills, and the next task unlocks." |
| 1:00–1:22 | Leashes page: Treasurer leash ($2,500, 3 payees, step-up $500). Payout $1,200 → Approval Inbox (badge) → Approve → settled ✅ | "Each agent gets a leash — a spending pass with limits, approved payees and an expiry. Big payments step up to Mai." |
| 1:22–1:52 | Planner delegates $500 sub-leash to Shopper; Shopper finds hoodies (Channel3 hoặc catalog demo), buys for $336 (ALLOW). Rồi mở "Hoodie Deals" → injection → payout $2,000 → **DENY** đỏ → banner đỏ → Revoke | "Now the scary part: a product page hides an instruction. The model falls for it — the leash doesn't. Max possible loss: $164. Actual loss: zero." |
| 1:52–2:10 | Terminal: `bunx leash-mcp init` → dán public key vào "Connect an external agent" → Claude Desktop list `leash_*` tools → "pay refund-desk $500" → **DENY** | "And it's not just our agents. Any MCP client — here, Claude Desktop — gets a leash in one command. Same limits. Same denial." |
| 2:10–2:25 | AG Studio: "Which leash was blocked this week?" → widget; Who-still-owes scoreboard | "Every cent is in a real ledger, and you can ask the dashboard anything." |
| 2:25–2:40 | Kiến trúc 1 slide: Agents (của Kitty + MCP client bên ngoài) → Leash Gateway (only PayPal credentials) → PayPal | "Agents never hold PayPal credentials. A deterministic gateway signs off on every action — Sui-style bounded loss, PayPal-grade reversibility." |
| 2:40–2:52 | Settlement: refund $15 each; mèo ngủ | "When the trip ends, Kitty refunds what's left. No one fronts. No one chases." |

Quy tắc quay:
- Quay trên **demo URL thật**, sandbox thật; các bước chờ webhook có thể cắt ghép nhưng không giả lập UI.
- Không nhạc có bản quyền (dùng YouTube Audio Library / không nhạc).
- Phụ đề EN burn-in hoặc CC.
- Upload **Public**, tiêu đề: "Kitty — Let your AI agents spend. On a leash. (PayPal AI Hackathon)".

## 2. Submission text (draft, tiếng Anh)

### Tagline
Let your AI agents spend — on a leash. A group kitty where every agent holds a bounded, revocable PayPal spending pass.

### Inspiration
At Sui Basecamp 2026, Sui introduced the idea of an agent pass: give AI agents limited, revocable spending authority with bounded loss, enforced by the protocol. We loved it, but most people don't live in crypto wallets. They live in PayPal. And group money — trips, offsites, weddings — is exactly where people want agents to help and are most afraid to let them.

### What it does
- **Kitty** — a group fund for an event. Members chip in with PayPal invoices; vendors are paid from the kitty, never from the organizer's pocket.
- **Agents** — Planner (plan + payment-gated timeline), Collector (invoices + friendly reminders), Shopper (Channel3 product search, purchases), Treasurer (vendor payouts, settlement refunds).
- **Leash** — every agent holds a leash: a prefunded spending pass with per-payment/daily/total limits, approved payees, allowed actions, categories, an expiry, step-up approval and an instant kill switch. Sub-leashes can only be narrower than their parent.
- **Bounded loss** — even a fully hijacked agent can move at most its leash balance, only to approved payees.

### How we built it
(Điền từ [06](06-architecture.md), [11](11-paypal-integration.md), [13](13-sponsor-integrations.md): Leash Gateway as MCP server, `leash-mcp` stdio bridge for any MCP client, Ed25519-signed requests, deterministic policy engine, double-entry ledger, PayPal Invoicing/Payouts/Orders/Refunds/Webhooks (+ PayPal Agent Toolkit nếu gateway dùng — ADR-007), Render, AG Studio, Channel3 (nếu dùng), Vercel AI SDK (BYOK).)

### How we used each tool
| Tool | How |
|---|---|
| PayPal Invoicing | … |
| PayPal Payouts | … |
| … | … |
(Hoàn thiện ngày 08/11.)

### Challenges
- PayPal has no native scoped credential for agents → we built the trust boundary ourselves and made loss bounded by prefunding, not by trust.
- Idempotency across agent retries, PayPal and webhooks.
- …

### Accomplishments
- 0% of injected payouts got through across N attack variants, even when the model was fooled.
- …

### What we learned / What's next
- Remote Leash MCP with an OAuth-style consent screen where the consent *is* the leash (today: the `leash-mcp` bridge); open spec for agent spending passes on fiat rails; PayPal Vault for user-funded leashes; production compliance.
- Today Kitty is **bring-your-own-model**: users plug in their own API key (Anthropic, OpenAI, Google, OpenRouter or any OpenAI-compatible endpoint). Next: optional paid plans where Kitty provides the model, billed with PayPal Subscriptions.

## 3. Checklist nộp bài

- [ ] Devpost project: title "Kitty", tagline, thumbnail (mèo + leash), gallery 5–8 screenshots
- [ ] Text description (trên)
- [ ] Demo URL (Render) + **"Try it" credentials**: demo organizer login, 3 sandbox buyer accounts
- [ ] Ghi rõ: tài khoản demo/judge dùng **demo key có hạn mức**; tài khoản thật tự mang key (BYOK); judges có thể thử nhập key riêng ở Settings · AI
- [ ] Repo GitHub public, LICENSE MIT ở About, README EN
- [ ] Video YouTube Public < 3'
- [ ] Built With tags (xem [13](13-sponsor-integrations.md) §11)
- [ ] Mục "Tools used" chi tiết từng tool
- [ ] Ghi chú sponsor prizes muốn được xét: AG Grid (chính); Channel3, APIMatic, Render chỉ khi dùng thật; Bryntum chỉ khi Gantt có trong bản nộp ([ADR-024](20-risks-and-decisions.md))
- [ ] README có MCP quickstart (`leash-mcp` + snippet Claude Desktop / Claude Code / MCP Inspector), đã thử trên máy sạch
- [ ] Team members đều đã join hackathon và được add vào project
- [ ] Nộp trước **11/11 23:59 ICT**; chụp màn hình xác nhận
- [ ] Kiểm lại demo URL mỗi tuần đến 15/12; trả lời câu hỏi judges (nếu có) trên Devpost

## 4. Dữ liệu demo cho judges

- Event "Da Lat Team Offsite" (dùng trong video) — **không cho judges sửa** (read-only demo).
- 3 event "sandbox playground" (`Judge Playground 1–3`), mỗi event có seed riêng; judges login bằng `judge1@kitty.demo` … mật khẩu trong README.
- Nút "Reset this playground" trong UI cho judges.
