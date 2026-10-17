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

> **Ghi chú triển khai `packages/leash` (KIT-17).** Trong package, tiền là **integer cents `bigint`**, các field đặt tên `…Cents` (`allocationCents`, `limits.perTxMaxCents`, `limits.dailyMaxCents`, `stepUpAboveCents`); `Money` dạng chuỗi ở trên chỉ là định dạng wire. `Category` lấy từ `app.budget_lines` (docs/09): `lodging | food | transport | gear | merch | activities | other`; `allowedCategories` là danh sách category **hoặc** wildcard `["*"]`. `SpendIntent.amountCents` là `bigint`; `justification` vẫn tồn tại nhưng engine không bao giờ đọc (bất biến #2).

## 3. Actions

| Action | Hướng tiền | PayPal API | Ai thường có |
|---|---|---|---|
| `payout` | OUT Kitty → payee | Payouts `POST /v1/payments/payouts` | Treasurer, Shopper |
| `create_invoice` | IN member → Kitty | Invoicing `POST /v2/invoicing/invoices` + `/send` | Collector |
| `send_reminder` | — | Invoicing `/remind` (PayPal gửi email) | Collector |
| `create_order` | IN organizer → Kitty (nạp quỹ) | Orders v2 | (chỉ organizer UI, không cấp cho agent trong MVP) |
| `refund` | OUT Kitty → member | `POST /v2/payments/captures/{id}/refund` | Treasurer (settlement) |
| `delegate` | — (cắt allocation sang sub-leash) | — | Planner |
| `browser_booking` | — (hành động web có giá trị cam kết; giữ trong spec, **không build** trong hackathon — ADR-026) | — | — |

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

**Quy tắc biên đã chốt trong `packages/leash` (KIT-17).**
- Chữ ký hàm thuần: `evaluate({ leash, ancestors, intent, usage, ancestorUsage, now })`. `usage` gồm `availableCents`, `spent24hCents`, `allowCountLastHour`, `recentIntents` (`{ intentId, payee, amountCents, at }`). `ancestorUsage: Record<leashId, Usage>` là **bắt buộc** để chạy check #14; thiếu entry → `DENY` với `PARENT_LIMIT_EXCEEDED` (details `usage for ancestor <id> missing`), **không** fallback về usage rỗng.
- `member:*`: payee là chuỗi `member:<id>`; entry allowlist `member:*` khớp mọi payee bắt đầu bằng `member:`. Mọi so sánh payee (allowlist lẫn trùng lặp) **không phân biệt hoa thường** (trim + lowercase).
- Category: chỉ kiểm khi intent có `category`; wildcard `["*"]` cho phép mọi category.
- Số tiền: money actions (§3) yêu cầu `amountCents > 0`; zero-amount actions (`send_reminder`, `browser_booking`) yêu cầu `amountCents = 0`. Vi phạm → `INVALID_AMOUNT`.
- Cửa sổ hiệu lực: `notBefore` **inclusive**, `expiresAt` **exclusive**. Cửa sổ trùng lặp: intent cũ cùng payee + cùng `amountCents` với `0 ≤ now − at ≤ 10 phút` (biên 10 phút **inclusive**; timestamp ở tương lai bị bỏ qua) → `POSSIBLE_DUPLICATE`.
- **Ngày hỏng — fail closed.** `now` không parse được là lỗi lập trình → ném `RangeError`. `notBefore`/`expiresAt` của leash không parse được → `LEASH_NOT_YET_VALID` / `LEASH_EXPIRED` với details `invalid date` (không được coi là hợp lệ vì mọi so sánh `NaN` đều false). Ngày của ancestor hỏng → `PARENT_LEASH_INACTIVE`. Recent intent có `at` hỏng → tính là **trong** cửa sổ trùng lặp (an toàn hơn → `STEP_UP`).
- `POSSIBLE_DUPLICATE` một mình → `STEP_UP`; kèm bất kỳ lỗi cứng nào khác → `DENY` (vẫn liệt kê nó). Vượt `stepUpAbove` → `STEP_UP` với code bổ sung `STEP_UP_REQUIRED` (chưa có trong bảng gốc, thêm để UI/agent có mã ổn định cho ngưỡng step-up). Check #1 phát mã theo status: `LEASH_REVOKED` / `LEASH_PAUSED` / `LEASH_EXHAUSTED` / `LEASH_EXPIRED`.
- Check #14 lặp lại theo từng ancestor **chỉ các chiều 5, 6, 7, 9, 10**: action/payee/category allowlist + `perTxMaxCents` + `dailyMaxCents` (mỗi vi phạm một reason `PARENT_LIMIT_EXCEEDED`). **Không** so `intent.amountCents` với `availableCents` của ancestor: tiền đã bị cắt khỏi cha lúc delegate (§7), ancestor chỉ bị khoá để kiểm limits; `ancestorUsage[id].spent24hCents` là chi 24h của **cả cây con** đó, `availableCents` của entry ancestor bị bỏ qua. Kiểm well-formedness của amount (#8) là thuộc tính của action nên chỉ chạy một lần, không lặp theo ancestor.
- Engine thuần: `now` là input, không gọi `Date.now()`; không I/O. Helper `maxPossibleLoss(leashes, balances)` = Σ (`availableCents` + `heldCents`) của các leash `status = "active"` (sub-leash đã cắt khỏi `available` của cha nên không đếm trùng).

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

### 7.1 Usage: ledger + intents (KIT-16)

`Usage` (và `ancestorUsage`) được tính **trong cùng transaction, sau khi đã khoá leash + ancestors**, từ hai nguồn:

- **`availableCents` / `heldCents`** đọc từ view `leash.leash_balances` (suy ra từ `ledger_entries`; invariant #5 — số dư luôn từ ledger). `availableCents` của entry ancestor là thông tin, engine **bỏ qua** (tiền đã bị cắt khỏi cha lúc delegate); entry ancestor vẫn cần có để check #14 chạy.
- **Counters** đọc từ `leash.spend_intents` (chỉ các row `created_at ≥ now − 24h` của kitty):
  - `spent24hCents` của một leash = Σ `amount_cents` của các intent của leash đó **thuộc trạng thái tiền đang bị giữ/đã đi**: `reserved`, `awaiting_approval`, `submitted`, `settled` — với `created_at` trong 24h. `denied`, `received`, `cancelled`, `failed`, `released` **không** tính (không cam kết đồng nào). Với một ancestor, giá trị này là 24h spend của **toàn bộ cây con** của ancestor đó (dùng `parent_id` của mọi leash trong kitty để suy cây).
  - `allowCountLastHour` = số intent có `decision ∈ {ALLOW, STEP_UP}` với `created_at ≥ now − 1h`. Với ancestor là số của **toàn cây con**.
  - `recentIntents` (check #13) = các intent của **đúng leash này** có `payee` và `created_at ≥ now − 10'`, kể cả intent bị DENY (thà step-up thừa còn hơn bỏ sót double-submit). Ancestor `recentIntents = []` (engine không dùng).

**Idempotency & hash.** Mỗi row `spend_intents` lưu `payload_hash` = sha256 của **canonical JSON** `{action, amountCents, currency, payee, category, memo, taskId}` — **không** gồm `justification` (chỉ hiển thị/audit, không ảnh hưởng quyết định). Gửi lại cùng `intentId`: nếu row đã tồn tại → trả nguyên quyết định đã lưu (kể cả khi `status` đã `submitted`/`settled`), miễn là **cùng leash** và **cùng `payload_hash`**; ngược lại → `INTENT_ID_CONFLICT` (409). Ghi row bằng `ON CONFLICT (id) DO NOTHING` rồi đọc lại nên hai request đua nhau vẫn chỉ tạo một row và **một** bút toán reserve.

**Execute (KIT-16, hành động `payout`).** Sau commit, `ALLOW` được `execute_intent` chạy tiếp. Claim nguyên tử bằng `SELECT … FOR UPDATE SKIP LOCKED` trên intent `reserved` (transaction ngắn, tăng `execute_attempts`); gọi PayPal **ngoài** transaction giữ lock. Thành công → `submitted` + row `paypal_objects(kind='payout_batch')` + `paypal_ref`. PayPal từ chối dứt khoát (4xx không retry: trừ 401/408/429) → `released` + bút toán release (`held → available`). Kết quả không xác định (network/5xx/429) → giữ `reserved`, ghi `last_execute_error`; gọi lại an toàn vì `sender_batch_id = intentId`. Lỗi execute **không** ném về agent.

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

### 8.1 Thực thi trong `packages/ledger`

`@kitty/ledger` là package **thuần**: không I/O, không network, không DB, không runtime dependency. Trong toàn package tiền là `bigint` cents (bất biến #4 AGENTS.md); decimal string chỉ tồn tại ở biên.

**Accounts (`accounts.ts`)** — key canonical, `AccountRef` là discriminated union:

| Account | Ghi chú |
|---|---|
| `kitty:{kittyId}:available` | per-kitty, thay cho `kitty:available` trần ở bảng trên |
| `leash:{leashId}:available`, `leash:{leashId}:held` | |
| `external:member:{memberId}` | |
| `external:payee:{email}` | email được `trim` + lowercase ⇒ 1 vendor = 1 account |

`accountKey(ref)`, `parseAccountKey(key)` (throw `AccountKeyError` khi sai namespace/bucket/shape), `isInternal(ref)`, `isKnownAccountKey(key)`.

**Money (`money.ts`)** — biên giới duy nhất được phép dùng decimal string:

- `parseMoney(value): bigint` chỉ nhận wire format `^\d+\.\d{2}$` (không dấu, không exponent, không whitespace, đúng 2 chữ số thập phân); sai → `MoneyFormatError`.
- `formatMoney(cents): string` ⇒ `1234n → "12.34"`, `-5n → "-0.05"`; luôn in canonical (không leading zero).
- `assertNonNegative(cents, context)` → `NegativeMoneyError` nếu < 0.

Round-trip: `parseMoney(formatMoney(c)) === c` với mọi `bigint`; `formatMoney(parseMoney(s)) === s` với mọi wire string canonical. Pattern cho phép leading zero (`"0012.34" → 1234n`) nhưng `formatMoney` luôn canonical hoá.

**Entries (`entries.ts`)** — `LedgerTxn = { txnId, kind, lines: { account, amountCents }[], intentId? }` với `Σ lines = 0`; `intentId` có mặt ở các bút toán gắn với một spend intent để I4 kiểm được. Một builder cho mỗi dòng của bảng "Bút toán": `contribution`, `allocateLeash` (allocate/top-up), `delegate`, `reserve`, `settlePayout`, `release` (failed/released/rejected), `revokeLeash`, `refundMember`. Mỗi builder trả **đúng 2 dòng** cân bằng và từ chối `amountCents ≤ 0` (`TxnArgError`).

`validateTxn(txn)` kiểm tra cấu trúc và trả discriminated union `{ ok: true }` hoặc `{ ok: false, code }` với `code ∈ { EMPTY, TOO_FEW_LINES, UNKNOWN_ACCOUNT, ZERO_LINE, DUPLICATE_ACCOUNT, UNBALANCED }`.

**Balances (`balances.ts`)** — `balanceOf(lines, accountKey)`, `balances(lines): Map<key, bigint>`, `leashBalance(lines, leashId): { availableCents, heldCents }` (view §2).

**Invariants (`invariants.ts`)**:

```ts
checkInvariants(
  txns: LedgerTxn[],                                  // theo thứ tự posting
  options?: {
    leashParentOf?: ReadonlyMap<string, string>;      // childLeashId → parentLeashId (I3)
    kittyOfLeash?: ReadonlyMap<string, string>;       // leash đã biết trước khi có allocate
  },
): InvariantViolation[]
```

- Trả về **tất cả** vi phạm: `I1_UNBALANCED_LEDGER`, `I1_KITTY_MISMATCH`, `I2_NEGATIVE_BUCKET`, `I3_TREE_OVER_ALLOCATION`, `I4_MULTIPLE_MONEY_MOVEMENTS`, cộng `UNKNOWN_ACCOUNT` / `UNATTRIBUTED_KITTY` khi ledger không đọc được.
- I2 chỉ báo bút toán **đầu tiên** làm âm bucket (kèm mọi bucket bị âm ở bút toán đó).
- I3 tính `Σ (available + held + spent) ≤ Σ allocated` cho từng cây leash; `spent` = settled payout đã rời cây; `allocated` = Σ `allocateLeash` (gốc + top-up) đổ vào cây; lease không có parent là gốc cây.
- `assertSingleMoneyMovement(intentId, txns)` là bản "throw" của I4 cho đường tiền (nhiều hơn 1 money movement → `MultipleMoneyMovementsError`).

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

**Chi tiết code của `DELEGATION_EXCEEDS_PARENT` (KIT-17).** `validateDelegation(parent, child, parentUsage)` gom **tất cả** vi phạm (không dừng ở lỗi đầu); mỗi vi phạm một entry `{ code, detail, details }` với `detail` ∈ `ALLOCATION` (child allocation > parent available), `PER_TX`, `DAILY`, `RATE`, `ACTIONS`, `DELEGATE_NOT_ALLOWED` (sub-leash chứa `delegate`), `PAYEES`, `CATEGORIES`, `EXPIRY`, `STEP_UP` (parent có ngưỡng thì con phải có và ≤), `DEPTH` (parent phải là leash gốc — tối đa 2 cấp). `child.allowedPayees`/`allowedCategories` phải là **tập con** của cha (wildcard `member:*` và `["*"]` xử lý theo ngữ nghĩa tập con). `expiresAt` của child hoặc parent không parse được → vi phạm `EXPIRY` (fail closed).

## 10. Step-up approval

- Tạo `approval {id, intentId, expiresAt = now+15m, status: pending}`.
- Tiền đã **reserved** khi tạo approval (để không bị leash khác tiêu mất trong lúc chờ).
- Thông báo: in-app (SSE → badge Approvals + toast) với deep link `/events/:id/approvals/:approvalId`. Không có Slack/Zapier ([ADR-026](20-risks-and-decisions.md)).
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

| Tool | Mô tả | Trả về | Trạng thái (17/10) |
|---|---|---|---|
| `leash_status` | Leash của chính agent: limits, available, expiry, status | object | ✅ KIT-5 |
| `leash_check` | Dry-run: intent này có được không (không reserve) | Decision | ✅ KIT-5 |
| `leash_request_payout` | Tạo intent `payout` | `{intentId, decision, status, approvalId?}` | ✅ KIT-5 |
| `leash_create_invoice` | Tạo + gửi invoice cho member | idem | ⏳ 19/10 |
| `leash_send_reminder` | Nhắc invoice | idem | ⏳ 20/10 |
| `leash_request_refund` | Refund member (settlement) | idem | ⏳ 20/10 |
| `leash_delegate` | Tạo sub-leash | `{leashId}` hoặc DENY | ⏳ 20/10 |
| `leash_intent_status` | Trạng thái một intent | object | ✅ KIT-5 |
| `leash_activity` | 20 intent gần nhất của leash | list | ✅ KIT-5 |

**Client:** agents của Kitty (`apps/agents`) và mọi MCP client bên ngoài nối qua `leash-mcp` ([ADR-027](20-risks-and-decisions.md)) thấy **cùng** bộ tool này — không có tool riêng hay quyền riêng cho agent ngoài.

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
