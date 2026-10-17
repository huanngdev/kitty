# 15 — UI/UX & Brand

## 1. Brand

| Thứ | Quyết định |
|---|---|
| Tên | **Kitty** (app) · **Leash** (lớp phân quyền) |
| Tagline | *"Let your agents spend. On a leash."* |
| Câu giới thiệu | *"Kitty is the group kitty your AI agents can spend — safely."* |
| Mascot | Con mèo tròn tối giản; trạng thái: đói (quỹ thấp) → no (đủ quỹ) → ngủ (event xong) |
| Giọng văn | Thân thiện, ngắn, có emoji tiết chế 🐱; **không bao giờ** đổ lỗi/đòi nợ gay gắt |
| Màu | Primary: cam ấm (`#F97316`-ish) · Safe/ALLOW: xanh lá · STEP_UP: vàng hổ phách · DENY: đỏ hồng (không đỏ chói) · Nền: kem nhạt / dark: than chì |
| Font | Inter (UI), JetBrains Mono (số tiền, ID) |
| Icon | lucide-react; biểu tượng leash = dây xích nhỏ 🔗 |

Tokens định nghĩa một lần (Tailwind v4 `@theme`) và map sang theme AG Studio + Bryntum để ba hệ trông như một.

> **Cập nhật (ADR-024):** token brand riêng đã bỏ. Theme giờ là **mặc định của preset shadcn `b4VmS9QxUG`** trong `apps/web/src/app/globals.css` (CLI generate, không sửa tay). Bảng màu phía trên là **định hướng**, không còn biến `--kitty-*`/`--success`/`--warning` riêng.

## 2. Nguyên tắc UX

1. **Tiền luôn hiển thị kèm nguồn gốc.** Mọi con số click được → ledger entries/PayPal ref.
2. **Mọi hành động agent đều thấy được** — chat card + activity timeline.
3. **Quyết định của Leash có màu và lý do** (ALLOW xanh, STEP_UP vàng, DENY đỏ + reason codes dịch sang câu người đọc).
4. **"Max possible loss"** luôn hiển thị trên trang Leashes — biến khái niệm trừu tượng thành con số.
5. **Một chạm cho member.** Trang `/pay` không cần đăng nhập.
6. **Không dark pattern** khi nhắc nợ.

## 3. Màn hình chính

> Thứ tự đi qua các màn hình, trạng thái và deep link: xem [23-user-screen-flow.md](23-user-screen-flow.md).

### 3.1 Event Overview `/events/:id`
```
┌──────────────────────────────────────────────────────────────────┐
│ 🐱 Da Lat Team Offsite · Dec 20–22 · 12 people        [Settle ▾] │
├───────────────┬───────────────┬───────────────┬──────────────────┤
│ Kitty         │ Collected     │ Spent         │ Max possible loss│
│ $2,338.00     │ 9/12 · $3,006 │ $668.00       │ $1,664.00 🔗     │
├───────────────┴───────────────┴───────────────┴──────────────────┤
│ ⚠ 1 approval waiting: Treasurer → Pine Hill Homestay $1,200 [Review]│
│ 🚨 Shopper was blocked paying refund-desk@scam.example  [Details] │
├──────────────────────────────┬───────────────────────────────────┤
│ Agents                       │ Next up (from plan)               │
│ 🧭 Planner   idle   $1,000🔗 │ 🔓 Pay homestay deposit  Nov 20   │
│ 🛍 Shopper   working $164🔗  │ 🔒 Book bus (needs $2,500 in kitty)│
│ 📨 Collector 3 reminders     │ ✅ Hoodies ordered                 │
│ 💼 Treasurer waiting approval│                                   │
└──────────────────────────────┴───────────────────────────────────┘
```

### 3.2 Leashes `/events/:id/leashes`
- Danh sách card mỗi leash: agent, allocation thanh tiến độ (available/held/spent), limits, payees chips, expiry countdown, nút **Pause / Revoke / Top-up**.
- Cây delegation (Planner → Shopper) hiển thị lồng.
- **Create leash** sheet với presets + "Explain this leash" (render câu tiếng Anh từ policy: *"Shopper can pay up to $400 at a time, $500 in total, only to Hoodie Lab, only for merch, until Nov 4 08:00."*).
- (Could) Bryntum Scheduler "Leash timeline".

### 3.3 Approval Inbox `/events/:id/approvals`
Card: số tiền lớn, payee (verified ✓), leash + lý do step-up, task liên quan, *agent's justification (unverified)*, countdown 15', **Approve / Reject**.

### 3.4 Plan `/events/:id/plan` — Bryntum Gantt
- Cột: task, owner (avatar agent/organizer), budget line, gate.
- Gate milestones "💰 Kitty ≥ $1,200" — 🔒 xám khi đóng, 🔓 cam khi mở (animation nhẹ khi mở do webhook).

### 3.5 Money `/events/:id/money` — AG Studio
Xem widgets ở [13-sponsor-integrations.md](13-sponsor-integrations.md) §1. Ô "Ask Kitty Analyst…" ở trên cùng.

### 3.6 Activity `/events/:id/activity`
Timeline hợp nhất: chat agent, intents + decisions, PayPal calls, webhooks, leash changes. Filter theo agent/decision. Mỗi dòng mở được JSON chi tiết (cho judges kỹ thuật).

### 3.7 Chat `/events/:id/chat`
- @planner, @shopper, @collector, @treasurer.
- Cards: plan diff (accept/edit), product cards (Channel3), decision card (ALLOW/STEP_UP/DENY), KERNEL live view.

### 3.8 Member pay `/pay/:requestId` (public)
```
🐱 Kitty · Da Lat Team Offsite
Your share: $334.00   due Nov 20
[ PayPal button ]   (Pay Later message nếu có)
What's this for? homestay · bus · BBQ · hoodie  (from the plan)
Any surplus is refunded automatically after the trip.
```

## 4. Copy cho reason codes (UI)

| Code | Câu hiển thị |
|---|---|
| `PAYEE_NOT_ALLOWED` | "{payee} isn't on this leash's approved payees." |
| `AMOUNT_EXCEEDS_PER_TX` | "{amount} is more than this leash allows per payment ({perTxMax})." |
| `DAILY_LIMIT_EXCEEDED` | "This would go over today's limit ({dailyMax})." |
| `INSUFFICIENT_LEASH_BALANCE` | "Only {available} left on this leash." |
| `ACTION_NOT_ALLOWED` | "This leash can't {action}." |
| `CATEGORY_NOT_ALLOWED` | "This leash is only for {categories}." |
| `LEASH_REVOKED` / `LEASH_EXPIRED` / `LEASH_PAUSED` | "This leash was revoked / has expired / is paused." |
| `RATE_LIMITED` | "Too many payments in the last hour." |
| `POSSIBLE_DUPLICATE` | "Looks like a repeat of a payment made {minutes} min ago — needs your OK." |
| `DELEGATION_EXCEEDS_PARENT` | "A sub-leash can't be wider than its parent ({field})." |

## 5. Accessibility & responsive
- Contrast AA, focus ring rõ, aria-live cho thông báo realtime.
- Trang `/pay` và Overview chạy tốt trên mobile (member mở từ điện thoại); Gantt/AG Studio desktop-first.
- Màu trạng thái luôn kèm icon/chữ (không chỉ màu).
