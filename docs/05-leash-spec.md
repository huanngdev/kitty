# 05 — Leash Spec (lõi kỹ thuật)

> Đây là tài liệu **quan trọng nhất** của dự án. Mọi code trong `packages/leash` và `apps/gateway` phải khớp spec này. Đổi spec → cập nhật file này trước, rồi mới đổi code.

## 1. Mục tiêu thiết kế

| # | Mục tiêu | Đo bằng |
|---|---|---|
| G1 | **Bounded loss**: tổng tiền agent có thể làm mất ≤ tổng `allocation` của các leash đang active | Invariant test + property-based test |
| G2 | **Credential isolation**: chỉ Gateway có PayPal secret | Env audit test, kiến trúc tách service |
| G3 | **Deterministic policy**: cùng input → cùng Decision; không có LLM trong đường quyết định | Policy engine là hàm thuần, 100% branch coverage |
| G4 | **No double spend**: retry, webhook trùng, agent lặp không làm trả tiền 2 lần | Idempotency key + reservation + unique constraints |
| G5 | **Least privilege by default**: leash mới hẹp nhất có thể | Default values + validation |
| G6 | **Monotonic delegation**: sub-leash không bao giờ rộng hơn cha | Validation + test |
| G7 | **Explainable**: mọi DENY có reason codes đọc được cho người và agent | Reason code enum |

## 2. Data model của Leash

```ts
type Money = string; // decimal string, 2 chữ số thập phân, vd "120.00". KHÔNG dùng float.

interface Leash {
  id: string;                 // "lsh_" + ULID
  kittyId: string;            // quỹ nguồn
  parentId: string | null;    // sub-leash → leash cha
  agentId: string;            // agent được cấp
  agentPublicKey: string;     // ed25519, base64url
  currency: "USD";            // MVP chỉ USD
  allocation: Money;          // tổng tiền được cấp (bounded loss)
  limits: {
    perTxMax: Money;          // tối đa mỗi intent
    dailyMax: Money;          // tối đa trong cửa sổ trượt 24h
    maxTxPerHour: number;     // rate limit số intent ALLOW/giờ
  };
  allowedActions: Action[];   // xem §3
  allowedPayees: string[];    // email PayPal (lowercase) hoặc "member:*" cho Collector
  allowedCategories: Category[] | ["*"];
  stepUpAbove: Money | null;  // > ngưỡng → STEP_UP; null = không bao giờ step-up
  notBefore: string;          // ISO
  expiresAt: string;          // ISO, bắt buộc, tối đa 30 ngày
  status: "active" | "paused" | "revoked" | "expired" | "exhausted";
  createdBy: string;          // organizer user id
  createdAt: string;
}
```

**Số dư leash** (không lưu cứng, tính từ ledger):
```
available = allocation − settled_spend − reserved
```

## 3. Actions

| Action | Hướng tiền | PayPal API | Ai thường có |
|---|---|---|---|
| `payout` | OUT Kitty → payee | Payouts `POST /v1/payments/payouts` | Treasurer, Shopper |
| `create_invoice` | IN member → Kitty | Invoicing `POST /v2/invoicing/invoices` + `/send` | Collector |
| `send_reminder` | — | Invoicing `/remind` hoặc Zapier | Collector |
| `create_order` | IN organizer → Kitty (nạp quỹ) | Orders v2 | (chỉ organizer UI, không cấp cho agent trong MVP) |
| `refund` | OUT Kitty → member | `POST /v2/payments/captures/{id}/refund` | Treasurer (settlement) |
| `delegate` | — (cắt allocation sang sub-leash) | — | Planner |
| `browser_booking` | — (hành động web qua KERNEL, có giá trị cam kết) | — | Shopper (COULD) |

`amount` của `send_reminder`, `browser_booking` = 0 nhưng vẫn qua policy (action allowlist + rate limit).

## 4. Spend Intent

```ts
interface SpendIntentRequest {
  intentId: string;           // do agent sinh (ULID). Idempotency key end-to-end.
  action: Action;
  amount: Money;              // "0.00" cho non-money actions
  currency: "USD";
  payee?: string;             // email PayPal / member id
  category?: Category;
  memo: string;               // ≤ 165 ký tự (giới hạn note của Payouts)
  taskId?: string;            // liên kết task trên Gantt
  justification: string;      // agent giải thích ngắn — chỉ để hiển thị/audit, KHÔNG ảnh hưởng quyết định
}
```

Trạng thái:
```
           ┌──────────► denied (terminal)
received ──┼──────────► awaiting_approval ──► (approve) ──► reserved ...
           │                    └──► (reject | 15' timeout) ──► cancelled (release)
           └──────────► reserved ──► submitted ──► settled (terminal)
                                         └──────► failed ──► released (terminal)
```
- `reserved`: tiền đã giữ chỗ trong ledger (hold), chưa gọi PayPal.
- `submitted`: đã gọi PayPal thành công (có `payout_batch_id`/`invoice_id`…), chờ webhook.
- `settled`: webhook xác nhận thành công → hold chuyển thành spend.
- `failed`/`released`: PayPal báo lỗi/denied/returned/unclaimed → hold được trả lại leash.

## 5. Xác thực agent (request signing)

**Q: Tại sao không dùng bearer token đơn giản?**
A: Bearer token bị lộ (log, prompt injection đọc env, trace) là dùng được ngay. Ký từng request bằng private key của agent + nonce + timestamp → token lộ vẫn vô dụng; replay bị chặn.

Header mỗi request tới Gateway (MCP over Streamable HTTP, mỗi JSON-RPC POST):
```
Leash-Agent: agt_01JB…
Leash-Timestamp: 2026-11-02T08:15:30Z     // lệch tối đa ±60s
Leash-Nonce: 3f9c…                         // 16 byte random, base64url, không trùng trong 10 phút
Leash-Signature: ed25519=<base64url(sig)>
```
Chuỗi được ký:
```
"leash-v1\n" + METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + NONCE + "\n" + sha256_hex(BODY)
```
Gateway: tra `agentPublicKey` → verify → kiểm timestamp skew → `INSERT nonce` (unique, TTL 10') → tiếp tục.

**Chốt quy ước chuỗi canonical** (implement: `packages/signing`, hàm `canonicalRequest`):

- `METHOD` viết hoa (`toUpperCase()`).
- `PATH` = pathname + query **đúng như gửi đi**, không có host (ví dụ `/mcp?kitty=kty_01J…`).
- `BODY` = **byte thô** của request; body dạng string được encode UTF-8; body rỗng ⇒ `sha256_hex("")` = `e3b0c442…b855`.
- `TIMESTAMP` = RFC 3339 UTC, chính xác tới **giây**: `YYYY-MM-DDTHH:MM:SSZ` (không có phần milli giây).
- `NONCE` = 16 byte random, base64url **không padding**.
- `Leash-Signature: ed25519=<base64url(sig)>`; chữ ký là Ed25519 trên chuỗi canonical (RFC 8032 ⇒ deterministic với cùng key + message).
- Bốn thành phần được ghép trực tiếp bằng `\n`, nên `METHOD` / `PATH` / `TIMESTAMP` / `NONCE` **không được chứa CR/LF** (HTTP request line và header cũng không thể chứa), nếu không chuỗi canonical sẽ mơ hồ.

**Verify ở Gateway — thứ tự kiểm và mã lỗi** (`verifyRequest` trả `{ ok: false, code }`):

1. parse header → `MALFORMED_HEADERS`: thiếu/rỗng header, timestamp sai format, nonce không phải base64url, signature sai prefix `ed25519=` hoặc base64url hỏng.
2. lệch timestamp > 60s (đúng 60s vẫn hợp lệ) → `STALE_TIMESTAMP`.
3. không tra được `agentPublicKey` → `UNKNOWN_AGENT`.
4. chữ ký sai, **hoặc** public key lưu trong DB không import được → `BAD_SIGNATURE`.
5. `claim(agentId, nonce, now + 10')` — gọi **cuối cùng**, để chỉ request có chữ ký hợp lệ mới được "đốt" nonce (kẻ tấn công không thể replay-burn nonce của agent) → `NONCE_REPLAY`.

`resolvePublicKey(agentId)` và `NonceStore.claim(agentId, nonce, expiresAt)` do Gateway inject (DB impl ở `apps/gateway` dùng bảng `leash.nonces`); `packages/signing` thuần, không I/O. Test/dev dùng `createMemoryNonceStore()` (purge TTL theo clock inject được).

Private key agent nằm ở **agent runtime** (env/secret của service `agents`), **không** nằm trong context của LLM (LLM không có tool đọc env/file).

## 6. Policy engine — thuật toán

Hàm thuần trong `packages/leash`:
```ts
evaluate(input: {
  leash: Leash;
  ancestors: Leash[];           // chuỗi cha → gốc
  intent: SpendIntentRequest;
  usage: { available: Money; spent24h: Money; allowCountLastHour: number;
           recentIntents: { payee: string; amount: Money; at: string }[] };
  now: string;
}): Decision
```

Thứ tự kiểm (gom **tất cả** lỗi, không dừng ở lỗi đầu — để agent và UI thấy đủ lý do):

| # | Kiểm | Reason code nếu fail |
|---|---|---|
| 1 | `leash.status == active` | `LEASH_NOT_ACTIVE` (kèm status: `LEASH_REVOKED`, `LEASH_PAUSED`, `LEASH_EXHAUSTED`) |
| 2 | `notBefore ≤ now < expiresAt` | `LEASH_EXPIRED` / `LEASH_NOT_YET_VALID` |
| 3 | mọi ancestor active & chưa hết hạn | `PARENT_LEASH_INACTIVE` |
| 4 | `intent.currency == leash.currency` | `CURRENCY_MISMATCH` |
| 5 | `action ∈ allowedActions` | `ACTION_NOT_ALLOWED` |
| 6 | `payee ∈ allowedPayees` (nếu action cần payee) | `PAYEE_NOT_ALLOWED` |
| 7 | `category ∈ allowedCategories` (nếu có) | `CATEGORY_NOT_ALLOWED` |
| 8 | `amount > 0` với money actions; format hợp lệ | `INVALID_AMOUNT` |
| 9 | `amount ≤ perTxMax` | `AMOUNT_EXCEEDS_PER_TX` |
| 10 | `spent24h + amount ≤ dailyMax` | `DAILY_LIMIT_EXCEEDED` |
| 11 | `amount ≤ available` | `INSUFFICIENT_LEASH_BALANCE` |
| 12 | `allowCountLastHour < maxTxPerHour` | `RATE_LIMITED` |
| 13 | không có intent cùng `payee` + `amount` trong 10 phút (khác `intentId`) | `POSSIBLE_DUPLICATE` → **STEP_UP** thay vì DENY |
| 14 | với mỗi ancestor: kiểm lại 5–11 theo limits của ancestor | `PARENT_LIMIT_EXCEEDED` |

Kết quả:
- Có bất kỳ lỗi nào (trừ #13) → `DENY(reasons)`.
- Không lỗi, và (`stepUpAbove != null && amount > stepUpAbove`) hoặc #13 → `STEP_UP(reasons)`.
- Còn lại → `ALLOW`.

**Không có LLM, không có heuristic mờ** trong hàm này. `justification` của agent không bao giờ được đọc.

## 7. Reservation (chống race & double spend)

Trong **một transaction Postgres**:
```sql
BEGIN;
SELECT … FROM leash.leashes WHERE id = ANY($chain) FOR UPDATE;   -- khoá leash + ancestors
-- tính usage từ ledger (available, spent24h, count)
-- evaluate(...)  (gọi hàm thuần từ app code)
INSERT INTO leash.spend_intents (id, …) VALUES ($intentId, …)
  ON CONFLICT (id) DO NOTHING;            -- idempotent: intent trùng → trả kết quả cũ
-- nếu ALLOW/STEP_UP: INSERT ledger reserve (leash:available → leash:held) cho đúng leash này.
-- Ancestors không cần hold: tiền của sub-leash đã được cắt khỏi cha lúc delegate;
-- ancestors chỉ bị khoá để kiểm limits theo usage của cả cây con (bước #14).
COMMIT;
```
Sau commit:
- `ALLOW` → enqueue `execute_intent(intentId)`.
- `STEP_UP` → tạo `approval`, phát notification.

`execute_intent` gọi PayPal với header **`PayPal-Request-Id: <intentId>`** (PayPal tự idempotent), và `sender_batch_id = intentId` cho Payouts. Retry an toàn.

## 8. Ledger (double-entry, nguồn sự thật)

**Mô hình "bucket":** mỗi bút toán chuyển tiền **từ** một account (dòng âm) **đến** một account (dòng dương); Σ dòng của một bút toán = 0. Số dư một account = SUM các dòng của nó. Các bucket nội bộ (`kitty:*`, `leash:*`) cộng lại **chính là** tiền của Kitty đang nằm trong tài khoản PayPal platform — không có account `platform:paypal` riêng (tránh đếm trùng).

Accounts:
| Account | Loại | Ý nghĩa |
|---|---|---|
| `kitty:available` | nội bộ | Tiền Kitty chưa cấp cho leash |
| `leash:{id}:available` | nội bộ | Tiền leash chưa dùng |
| `leash:{id}:held` | nội bộ | Đang giữ chỗ cho intent `awaiting_approval`/`reserved`/`submitted` |
| `external:member:{id}` | ngoài | Nguồn đóng góp / nơi nhận refund (số dư âm = đã góp ròng) |
| `external:payee:{email}` | ngoài | Đã trả ra ngoài |

Bút toán:
| Sự kiện | Từ (−) | Đến (+) |
|---|---|---|
| Member trả invoice / organizer nạp | `external:member:{id}` | `kitty:available` |
| Allocate leash gốc / top-up | `kitty:available` | `leash:{id}:available` |
| Delegate sub-leash | `leash:{parent}:available` | `leash:{child}:available` |
| Reserve intent | `leash:{id}:available` | `leash:{id}:held` |
| Settled payout | `leash:{id}:held` | `external:payee:{email}` |
| Failed / released / rejected | `leash:{id}:held` | `leash:{id}:available` |
| Revoke/expire leash | `leash:{id}:available` | nguồn (`leash:{parent}:available` hoặc `kitty:available`); phần `held` chảy về nguồn khi intent kết thúc |
| Refund member | `kitty:available` (hoặc held của leash Treasurer) | `external:member:{id}` |

> Bảng `ledger_entries(txn_id, account, amount_cents BIGINT)` — tiền lưu **cents (integer)**. Xem [09-data-model.md](09-data-model.md).

**Invariants (test bắt buộc):**
- I1: Với mỗi kitty: `Σ số dư các bucket nội bộ == Σ contributions − Σ settled payouts − Σ refunds` (tương đương: Σ mọi account = 0).
- I2: Không bucket nội bộ nào < 0.
- I3: Sub-leash được cắt từ `parent.available` ⇒ tổng tiền trong một cây leash không bao giờ vượt allocation của gốc + top-ups.
- I4: Một `intentId` → tối đa 1 PayPal money movement.

## 9. Delegation (sub-leash)

Agent có action `delegate` gọi `leash.delegate(childAgentId, spec)`. Validation (gom lỗi, code `DELEGATION_EXCEEDS_PARENT` + chi tiết):
- `child.allocation ≤ parent.available` (allocation bị **cắt ra** khỏi parent: ledger `leash:parent:available → leash:child:available`).
- `child.limits.* ≤ parent.limits.*`
- `child.allowedActions ⊆ parent.allowedActions` và **không chứa `delegate`** trong MVP (độ sâu tối đa 2 cấp: gốc → con).
- `child.allowedPayees ⊆ parent.allowedPayees`; `child.allowedCategories ⊆ parent.allowedCategories`.
- `child.expiresAt ≤ parent.expiresAt`.
- `child.stepUpAbove ≤ parent.stepUpAbove` (nếu parent có).
- Organizer được thông báo mỗi lần delegate; có thể revoke.

Revoke cha → cascade revoke con (trong cùng transaction); tiền con về cha rồi về Kitty.

## 10. Step-up approval

- Tạo `approval {id, intentId, expiresAt = now+15m, status: pending}`.
- Tiền đã **reserved** khi tạo approval (để không bị leash khác tiêu mất trong lúc chờ).
- Thông báo: in-app (SSE) + Zapier MCP (Slack/email) với deep link `/events/:id/approvals/:approvalId`.
- Approve chỉ được bởi organizer của kitty (session web), **không bao giờ bởi agent** (agent không có endpoint approve).
- Approve → `execute_intent`. Reject/timeout → `cancelled` + release hold.
- Approval hiển thị: số tiền, payee, leash, reason step-up, `justification` của agent (đánh dấu "agent's claim — unverified").

## 11. Lifecycle của Leash

| Chuyển | Ai | Hiệu ứng |
|---|---|---|
| create → `active` | Organizer (hoặc agent `delegate`) | Ledger allocate |
| `active` → `paused` | Organizer | Mọi intent DENY `LEASH_PAUSED`; tiền giữ nguyên |
| `paused` → `active` | Organizer | |
| → `revoked` | Organizer / tự động (alert nghiêm trọng, tuỳ chọn) | Cascade; available về nguồn; intents `awaiting_approval` bị cancel |
| → `expired` | Cron `leash_expiry_sweep` mỗi phút | Như revoke |
| → `exhausted` | Khi `available == 0` và không còn held | Thông tin; organizer có thể top-up (allocate thêm) |
| top-up | Organizer | Ledger allocate thêm; `exhausted` → `active` |

## 12. Presets (UI)

| Preset | Agent | allocation | per_tx | daily | step_up_above | actions | payees | expires |
|---|---|---|---|---|---|---|---|---|
| Vendor payments | Treasurer | 60% Kitty | 1.200 | 2.000 | 500 | payout, refund | vendors đã thêm | event end + 3d |
| Merch run | Shopper | 500 | 400 | 500 | 400 | payout | merch vendor | 48h |
| Collections | Collector | 0 | = góp/người | — | — | create_invoice, send_reminder | `member:*` | event end |
| Planning | Planner | 1.000 | 0 (không tự tiêu) | — | — | delegate | vendors | event end |

## 13. Gateway tool surface cho agent (MCP)

| Tool | Mô tả | Trả về |
|---|---|---|
| `leash_status` | Leash của chính agent: limits, available, expiry, status | object |
| `leash_check` | Dry-run: intent này có được không (không reserve) | Decision |
| `leash_request_payout` | Tạo intent `payout` | `{intentId, decision, status, approvalId?}` |
| `leash_create_invoice` | Tạo + gửi invoice cho member | idem |
| `leash_send_reminder` | Nhắc invoice | idem |
| `leash_request_refund` | Refund member (settlement) | idem |
| `leash_delegate` | Tạo sub-leash | `{leashId}` hoặc DENY |
| `leash_intent_status` | Trạng thái một intent | object |
| `leash_activity` | 20 intent gần nhất của leash | list |

Mô tả tool cho LLM phải nói rõ: *"Denials are final for this request. Do not retry with modified payees or amounts to work around a denial; report the denial to the organizer."* — và Gateway cũng tự phát hiện "probing": ≥3 DENY liên tiếp trong 5 phút → tự `pause` leash + alert (tuỳ chọn cấu hình, bật trong demo).

## 14. Ví dụ Decision

```json
{
  "intentId": "int_01JC2…",
  "decision": "DENY",
  "reasons": [
    { "code": "PAYEE_NOT_ALLOWED", "detail": "refund-desk@scam.example is not in allowedPayees" },
    { "code": "AMOUNT_EXCEEDS_PER_TX", "detail": "2000.00 > perTxMax 400.00" },
    { "code": "INSUFFICIENT_LEASH_BALANCE", "detail": "2000.00 > available 164.00" }
  ],
  "maxPossibleLoss": "164.00",
  "leash": { "id": "lsh_01JB…", "status": "active" }
}
```
