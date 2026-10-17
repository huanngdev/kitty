# 10 — API Spec

Ba bề mặt API:
1. **Gateway Admin API** (REST) — web BFF gọi thay mặt organizer.
2. **Gateway Agent API** (MCP over Streamable HTTP) — agents gọi, ký Ed25519.
3. **Web App API** (REST) — agents gọi để đọc/ghi dữ liệu không phải tiền (tasks, budget, vendors).

Cùng với: **Gateway Webhook** (PayPal → Gateway) và **Gateway Internal API** (worker → Gateway).

Định dạng chung: JSON, tiền là string `"123.45"` ở biên API (cents bên trong), lỗi:
```json
{ "error": { "code": "LEASH_NOT_FOUND", "message": "…", "details": {} } }
```

---

## 1. Gateway Admin API (`/v1`)

Auth: `Authorization: Bearer <GATEWAY_ADMIN_TOKEN>` + `X-Kitty-User: <userId>` + `X-Kitty-Signature: HMAC-SHA256(token, userId + timestamp + body)` + `X-Kitty-Timestamp`. Gateway kiểm user là owner của kitty liên quan.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/v1/kitties` | Tạo kitty cho event `{eventId, currency}` |
| GET | `/v1/kitties/:id` | Số dư: `available`, `allocated`, `held`, `spent`, `contributed`, `refunded` |
| GET | `/v1/kitties/:id/ledger?cursor=` | Ledger entries (phân trang) |
| GET | `/v1/kitties/:id/contributions` | Danh sách đóng góp |
| POST | `/v1/kitties/:id/payees` | Organizer xác nhận vendor `{email}` → `verified_payees` |
| GET | `/v1/kitties/:id/payees` | Danh sách vendor đã xác nhận |
| DELETE | `/v1/kitties/:id/payees/:email` | Bỏ xác nhận vendor |
| POST | `/v1/kitties/:id/topup-orders` | Organizer nạp quỹ: tạo PayPal Order → `{orderId}` cho JS SDK |
| POST | `/v1/kitties/:id/topup-orders/:orderId/capture` | Capture sau khi approve |
| POST | `/v1/agents` | Đăng ký agent `{agentId, kittyId, role, publicKey}` |
| POST | `/v1/leashes` | Tạo leash (organizer) — body theo §Leash create |
| GET | `/v1/kitties/:id/leashes` | Danh sách + usage |
| GET | `/v1/leashes/:id` | Chi tiết + `available`, `held`, `spent24h`, children |
| POST | `/v1/leashes/:id/topup` | `{amount}` allocate thêm |
| POST | `/v1/leashes/:id/pause` · `/resume` · `/revoke` | `{reason}` |
| GET | `/v1/kitties/:id/intents?status=&leashId=` | Intents |
| GET | `/v1/kitties/:id/approvals?status=pending` | Approval inbox |
| POST | `/v1/approvals/:id/approve` · `/reject` | Duyệt step-up |
| GET | `/v1/kitties/:id/audit?cursor=` | Audit events |
| POST | `/v1/kitties/:id/settlement/preview` | Tính refund pro-rata (không thực thi) |

**Leash create body:**
```json
{
  "kittyId": "kty_…",
  "agentId": "agt_…",
  "allocation": "2500.00",
  "limits": { "perTxMax": "1200.00", "dailyMax": "2000.00", "maxTxPerHour": 6 },
  "allowedActions": ["payout", "refund"],
  "allowedPayees": ["homestay@vendor.example", "bus@vendor.example"],
  "allowedCategories": ["lodging", "transport", "food"],
  "stepUpAbove": "500.00",
  "expiresAt": "2026-12-25T00:00:00Z"
}
```
Lỗi: `ALLOCATION_EXCEEDS_KITTY_AVAILABLE`, `EXPIRY_TOO_LONG`, `PAYEE_NOT_VERIFIED` (vendor chưa được organizer xác nhận), `AGENT_ALREADY_LEASHED` (MVP: 1 leash active/agent).

### 1.1 Auth (đã triển khai — KIT-6)

Mọi request `/v1` phải có 4 header:

| Header | Giá trị |
|---|---|
| `Authorization` | `Bearer <GATEWAY_ADMIN_TOKEN>` (so sánh constant-time) |
| `X-Kitty-User` | `userId` organizer mà web BFF gọi thay |
| `X-Kitty-Timestamp` | Unix **giây**; lệch quá ±60 s so với đồng hồ gateway → 401 |
| `X-Kitty-Signature` | hex `HMAC-SHA256(key = GATEWAY_ADMIN_TOKEN, message = userId + "\n" + timestamp + "\n" + rawBody)`, so sánh constant-time |

Middleware chỉ xác thực và gán `c.var.userId`; **ownership kiểm trong service**: user phải là `kitties.owner_user_id` của kitty liên quan → nếu không `403 FORBIDDEN`; id không tồn tại → `404 KITTY_NOT_FOUND` / `LEASH_NOT_FOUND` / `AGENT_NOT_FOUND`. Helper client `signAdminRequest()` sống ở `apps/gateway/src/admin/auth.ts` (web BFF tự cài lại, secret không rời service — bất biến #1).

### 1.2 Số dư kitty (tính từ ledger, không lưu — bất biến #5)

`GET /v1/kitties/:id` trả `balances`:

| Field | Nguồn |
|---|---|
| `available` | `SUM(amount_cents)` của account `kitty:{id}:available` |
| `allocated` | tổng tiền đang nằm trong mọi bucket `leash:*` của kitty |
| `held` | phần `allocated` đang giữ chỗ cho intent (`leash:*:held`) |
| `spent` | các dòng `settle` dương (payout đã trả ra) |
| `contributed` | các dòng `contribution` dương (invoice member / organizer nạp) |
| `refunded` | các dòng `refund` dương (hoàn tiền member) |

### 1.3 Validation khi tạo leash (trong gateway service)

Thứ tự kiểm (fail sớm, mã lỗi ở cột phải):

1. Kitty thuộc user + agent tồn tại và thuộc đúng kitty — `FORBIDDEN` / `KITTY_NOT_FOUND` / `AGENT_NOT_FOUND`.
2. Agent chưa có leash `active` — `AGENT_ALREADY_LEASHED` (MVP: 1 leash active/agent).
3. `allocation ≤ kitty available` — `ALLOCATION_EXCEEDS_KITTY_AVAILABLE` (409).
4. Nếu `allocation > 0`: `perTxMax ≤ allocation` và `dailyMax ≤ allocation`; `stepUpAbove ≤ perTxMax` — `INVALID_LEASH_LIMITS`. (Leash `allocation = 0` kiểu Collector bỏ qua ràng buộc limits ≤ allocation.)
5. `notBefore (now) < expiresAt` — `INVALID_EXPIRY`.
6. `expiresAt − notBefore ≤ 30 ngày` — `EXPIRY_TOO_LONG`.
7. Payee: `member:*` chỉ hợp lệ khi mọi action ⊆ `{create_invoice, refund, send_reminder}`; mọi email khác phải có trong `verified_payees` của kitty (lowercase) — `PAYEE_NOT_VERIFIED`. `member:*` không cần verify.

Top-up kiểm lại bước 1, 2 (status ∈ `active|paused|exhausted` → ngược lại `INVALID_STATE_TRANSITION`), payee đã verify (bất biến #12) và `amount ≤ kitty available`, `amount > 0`. Pause chỉ từ `active`, resume chỉ từ `paused`, revoke từ `active|paused|exhausted` (`INVALID_STATE_TRANSITION` nếu sai).

### 1.4 Tiền vào/ra một transaction (bất biến #5/#6/#12)

Create/top-up/khoá leash chạy trong **một transaction**: `SELECT … FOR UPDATE` kitty (và agent khi create) → đọc số dư khả dụng từ ledger → ghi leash + bút toán `@kitty/ledger` (`allocateLeash` allocate/top-up, `revokeLeash` revoke trả tiền về nguồn, cascade con trước) + một dòng `audit_events`. Revoke cha trả tiền con về cha rồi trả phần còn lại của cha về `kitty:available` (docs/05 §9); tiền `held` chảy về khi intent kết thúc.

> **Trong scope KIT-6:** kitties, agents, leashes (create/get/list/topup/pause/resume/revoke), intents (read), audit (read), payees. **Ngoài scope (issue sau):** `topup-orders` (KIT-27), `approvals` (KIT-25), `settlement/preview` (KIT-42), MCP (KIT-5), reserve/execute (KIT-16).

> **Chọn lọc cleanup test:** suite integration `apps/gateway/src/**/*.int.test.ts` dùng một kitty id dùng-một-lần, xoá các dòng **mutable** (leashes, agent_keys, verified_payees, kitties) ở `afterAll`; `ledger_entries` và `audit_events` append-only nên để lại, đã scoped theo kitty id tạm. Suite này **không** nằm trong `bun run ci` (không có DB trong CI); chạy tay `bun run test:integration`.

---

## 2. Gateway Agent API — MCP (`POST /mcp`)

- Transport: MCP Streamable HTTP, stateless mode.
- Mỗi HTTP request mang header ký (xem [05-leash-spec.md](05-leash-spec.md) §5). Gateway resolve agent → leash active của agent. **Agent không truyền leashId**; Gateway tự tìm theo agent (agent không thể "chọn" leash của người khác).

### Tools

#### `leash_status`
Input: `{}`
Output:
```json
{ "leashId": "lsh_…", "status": "active", "currency": "USD",
  "allocation": "500.00", "available": "164.00", "held": "0.00", "spent24h": "336.00",
  "limits": { "perTxMax": "400.00", "dailyMax": "500.00", "maxTxPerHour": 5 },
  "allowedActions": ["payout"], "allowedPayees": ["merch-shop@vendor.example"],
  "allowedCategories": ["merch"], "stepUpAbove": "400.00",
  "expiresAt": "2026-11-04T08:00:00Z" }
```

#### `leash_check`
Input: SpendIntentRequest (không cần `intentId`). Output: `{decision, reasons}`. Không reserve, không ghi intent (có ghi audit `check`).

#### `leash_request_payout`
Input:
```json
{ "intentId": "int_01JC…", "amount": "336.00", "payee": "merch-shop@vendor.example",
  "category": "merch", "memo": "12 hoodies for Da Lat offsite", "taskId": "tsk_…",
  "justification": "Channel3 product ch3_abc at $28 each" }
```
Output:
```json
{ "intentId": "int_01JC…", "decision": "ALLOW", "status": "reserved", "reasons": [],
  "approvalId": null, "available": "164.00" }
```
- Gọi lại với cùng `intentId` + cùng body → trả về kết quả cũ (idempotent).
- Cùng `intentId` + body khác → lỗi `INTENT_ID_REUSED`.

#### `leash_create_invoice`
Input: `{ intentId, memberId, amount, dueDate, memo }` — Gateway tra email member qua web App API (không tin email do agent đưa). Payee check: `member:*` hoặc `member:<id>`.

#### `leash_send_reminder`
Input: `{ intentId, invoiceIntentId, note }` — gọi PayPal `/remind`.

#### `leash_request_refund`
Input: `{ intentId, contributionId, amount, memo }` — chỉ refund về đúng member đã góp; `amount ≤ contribution.amount − refunded`.

#### `leash_delegate`
Input:
```json
{ "intentId": "int_…", "childAgentId": "agt_shopper", "allocation": "500.00",
  "limits": { "perTxMax": "400.00", "dailyMax": "500.00", "maxTxPerHour": 5 },
  "allowedActions": ["payout"], "allowedPayees": ["merch-shop@vendor.example"],
  "allowedCategories": ["merch"], "stepUpAbove": "400.00", "expiresInHours": 48 }
```
Output: `{ leashId }` hoặc DENY `DELEGATION_EXCEEDS_PARENT` + chi tiết từng field.

#### `leash_intent_status`
Input: `{ intentId }` → intent + paypal status.

#### `leash_activity`
Input: `{ limit?: number }` → 20 intent gần nhất của leash của agent.

> Không có tool nào cho agent để: approve, tạo leash gốc, sửa leash của mình, đọc leash agent khác, đọc ledger toàn kitty, gọi PayPal tuỳ ý.

### 2.1 Đã triển khai (KIT-5)

- **Transport:** `POST /mcp` trên `apps/gateway` bằng MCP TypeScript SDK (`@modelcontextprotocol/sdk`), Streamable HTTP **stateless** (`WebStandardStreamableHTTPServerTransport` + `sessionIdGenerator: undefined`, server/transport mới mỗi request), trả JSON (`enableJsonResponse`).
- **Auth trước tầng MCP:** mọi request verify bằng `@kitty/signing` `verifyRequest` trên **đúng byte thân request** (đọc một lần, truyền lại cho transport); `resolvePublicKey` = `leash.agent_keys` (key `active`), `nonceStore` = `leash.nonces` (`INSERT … ON CONFLICT DO UPDATE … WHERE expires_at <= now() RETURNING` — không cần migration mới). Lỗi → `401` shape chung với `code` là mã verify (`MALFORMED_HEADERS`, `STALE_TIMESTAMP`, `UNKNOWN_AGENT`, `BAD_SIGNATURE`, `NONCE_REPLAY`). `agentId` truyền vào tool handler qua closure — tool **không** nhận `leashId`/`agentId` từ input.
- **Tool trong scope:** `leash_status`, `leash_check`, `leash_request_payout`, `leash_intent_status`, `leash_activity`. Kết quả là structured content + text summary. `leash_check` chỉ evaluate + ghi audit `intent.check` (không tạo intent, không reserve). `leash_request_payout` gọi `reserveIntent` (KIT-16) và trả `available` sau khi giữ chỗ. Tool ngoài scope (invoice, reminder, refund, delegate) chưa được đăng ký.
- **Idempotency:** cùng `intentId` + body khác → `INTENT_ID_REUSED` (một tên duy nhất, ở `@kitty/shared` `errorCodes`).
- **Client helper:** `createSignedFetch({ agentId, privateKey })` export từ `@kitty/signing` để `apps/agents` (và `leash-mcp`, §2.3) ký mọi request MCP.

### 2.2 Việc còn lại (lịch ở [16](16-roadmap.md))

- **4 tool chưa đăng ký:** `leash_create_invoice` (19/10), `leash_send_reminder`, `leash_request_refund`, `leash_delegate` (20/10).
- **Theo spec MCP hiện hành (2026-07-28):** `GET` / `DELETE /mcp` đang trả `404` → phải trả **`405 Method Not Allowed`** (server stateless, không có SSE stream hay session). Thêm **tool annotations**: `readOnlyHint` cho `leash_status`, `leash_check`, `leash_intent_status`, `leash_activity`; `destructiveHint` + `idempotentHint` (theo `intentId`) cho các tool tạo intent. Thêm resource `leash://status` (cùng dữ liệu `leash_status`) để client đọc ngữ cảnh mà không cần gọi tool.
- **Auth:** giữ Ed25519 per-request (ADR-004). Trong hackathon không quảng bá OAuth metadata (`/.well-known/oauth-protected-resource`); MCP client có sẵn nối qua `leash-mcp`.

### 2.3 `leash-mcp` — bridge cho MCP client bên ngoài ([ADR-025](20-risks-and-decisions.md), lịch 31/10)

| Lệnh | Việc |
|---|---|
| `bunx leash-mcp init [--profile <name>]` | Sinh keypair Ed25519 tại máy; lưu private key vào file profile (`~/.config/leash-mcp/<profile>.json`, quyền `600`); in **public key** để dán vào "Connect an external agent" |
| `bunx leash-mcp --gateway <url> --agent <agentId> [--profile <name>]` | Chạy MCP server **stdio**; mỗi JSON-RPC từ client → `POST {gateway}/mcp` qua `createSignedFetch`; trả nguyên kết quả cho client |

Luồng đăng ký: organizer dán public key + tên ("Claude Desktop") ở trang Leashes → web `POST /api/events/:id/external-agents` → `apps/api` gọi Gateway `POST /v1/agents` → trả `agentId` + snippet cấu hình (không chứa secret) → organizer cấp leash như mọi agent.

Snippet cho Claude Desktop (`claude_desktop_config.json`):
```json
{ "mcpServers": { "kitty-leash": {
    "command": "bunx",
    "args": ["leash-mcp", "--gateway", "https://<gateway-host>", "--agent", "agt_01J…"] } } }
```

Yêu cầu:
- Không log private key, chữ ký hay header ký (bất biến #11).
- Chỉ gửi tới đúng gateway URL đã cấu hình; bắt buộc `https` (trừ `localhost` khi dev).
- Không thêm/bớt/sửa tool, không cache kết quả, không tự tính số dư (bất biến #5).
- Gateway trả `401` (`UNKNOWN_AGENT`, `BAD_SIGNATURE`…) → bridge trả MCP error dễ hiểu: *"leash-mcp: this agent key is not registered or was revoked."*
- Contract với Gateway **không đổi** — cùng header và chuỗi ký ở [05](05-leash-spec.md) §5.

---

## 3. Web App API (`/api/agent/*`)

Auth: `Authorization: Bearer <WEB_APP_API_TOKEN>` + `X-Agent-Id`. Token chỉ cho phép thao tác trên event của agent. Không có endpoint tiền.

| Method | Path | Dùng bởi |
|---|---|---|
| GET | `/api/agent/events/:id` | Tất cả — chi tiết event, members, budget lines |
| POST | `/api/agent/events/:id/plan` | Planner — ghi plan (tasks, deps, budget lines) dạng diff; organizer chấp nhận ở UI |
| PATCH | `/api/agent/tasks/:id` | Planner/Treasurer — cập nhật trạng thái/thời gian |
| GET | `/api/agent/events/:id/vendors` | Tất cả |
| POST | `/api/agent/events/:id/vendors` | Planner/Shopper — đề xuất vendor (verified=false) |
| POST | `/api/agent/events/:id/messages` | Tất cả — gửi tin vào chat (text + cards) |
| GET | `/api/agent/members/:id` | Gateway (để tra email khi tạo invoice) |

---

## 4. Web BFF (browser → web, session auth)

Các route `app/api/*` của Next.js, gọi Gateway Admin API phía server:
`/api/events`, `/api/events/:id/leashes`, `/api/approvals/:id/approve`, `/api/events/:id/stream` (SSE), `/api/chat` (forward tới agents, stream token), `/api/pay/:requestId` (public), `/api/health`.

---

### 4.1 Product routes trong `apps/api` (KIT-30 — session auth)

`apps/api` phục vụ dữ liệu không phải tiền với Better Auth session; web BFF proxy tới đây. Mọi route dưới đây `401 UNAUTHORIZED` khi chưa đăng nhập, và chỉ organizer của event được thao tác (`403 FORBIDDEN`), id không tồn tại `404 *_NOT_FOUND`. Tiền là decimal string ở biên.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/events` | Tạo event; đồng thời tạo kitty bên gateway và lưu `kitty_id` |
| GET | `/api/events` | Event của session user ("mine") |
| GET | `/api/events/:id` | Chi tiết event |
| PATCH | `/api/events/:id` | Cập nhật event (kể cả `status`) |
| POST · GET | `/api/events/:id/members` | Thêm (unique email/event, sinh `member_token`) · liệt kê |
| DELETE | `/api/events/:id/members/:memberId` | Xoá member |
| POST · GET | `/api/events/:id/vendors` | Đề xuất (luôn `verified=false`) · liệt kê |
| PATCH | `/api/events/:id/vendors/:vendorId` | Sửa vendor; đổi `paypalEmail` → `verified=false` lại |
| POST | `/api/events/:id/vendors/:vendorId/verify` | **Chỉ organizer**: `verified=true` + `POST /v1/kitties/:kittyId/payees {email}` |
| GET · PUT | `/api/events/:id/budget-lines` | Đọc · thay cả set (`{lines:[{category, planned}]}`) |

**Tạo event + kitty (compensating flow).** Hai ghi không cùng transaction (gateway là service riêng). `POST /api/events`: (1) insert `app.events`; (2) gọi `POST /v1/kitties` qua admin client; (3) ghi `kitty_id`. Nếu (2) hoặc (3) lỗi → xoá lại event vừa tạo rồi ném lỗi, để không bao giờ tồn tại event không có kitty. Không có leak ngược đáng kể: bước xoá chỉ chạy khi kitty chưa/không tạo được, và gateway không có endpoint xoá kitty (nếu tạo kitty xong mà ghi `kitty_id` lỗi, kitty mồ côi — ghi lại khi retry dùng eventId khác; chấp nhận cho MVP, xem Open questions).

**Seller `apps/api` → Gateway Admin API** (`apps/api/src/lib/gateway-client.ts`): axios tới `GATEWAY_URL`, mỗi request ký Bearer `GATEWAY_ADMIN_TOKEN` + `X-Kitty-User/Timestamp/Signature` (HMAC-SHA256 hex trên `userId\n timestamp\n rawBody`, khớp `apps/gateway/src/admin/auth.ts`; vector chung khoá ở test hai phía). Lỗi gateway map sang `AppError` giữ nguyên `code`. `GATEWAY_URL`/`GATEWAY_ADMIN_TOKEN` bắt buộc khi dùng (lazy, như `getDb`). Không có PayPal ở đây (AGENTS.md #1).

---

### BYOK settings (session auth; web chỉ chuyển tiếp lên agents, không lưu/log key)
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/settings/ai` | Danh sách credentials (chỉ `provider`, `label`, `last4`, `status`) + model settings |
| POST | `/api/settings/ai/credentials` | `{provider, apiKey, baseUrl?, label?}` → test + lưu → `{credentialId, last4, status, models[]}` |
| POST | `/api/settings/ai/credentials/:id/test` | Test lại (list models + 1 tool call nhỏ) |
| DELETE | `/api/settings/ai/credentials/:id` | Xoá ngay (run đang chạy dùng key đó bị dừng) |
| GET | `/api/settings/ai/credentials/:id/models` | Danh sách model từ provider (nếu có endpoint) |
| PUT | `/api/settings/ai/models` | `{default:{credentialId, modelId}, planner?, shopper?, collector?, treasurer?}` |
| GET | `/api/settings/ai/usage?from=&to=` | Tokens và ước tính chi phí theo ngày/vai |

Agents internal (chỉ web gọi, `AGENTS_INTERNAL_TOKEN`): `POST /internal/ai/credentials`, `POST /internal/ai/credentials/:id/test`, `DELETE /internal/ai/credentials/:id`, `GET /internal/ai/credentials/:id/models`. Response **không bao giờ** chứa API key.

---

## 5. Gateway Webhook

`POST /webhooks/paypal` — verify → dedupe → settle (KIT-7). Không có auth token: danh tính đến từ chữ ký PayPal.

Headers PayPal gửi: `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-TIME`, `PAYPAL-CERT-URL`, `PAYPAL-AUTH-ALGO`, `PAYPAL-TRANSMISSION-SIG`.

Thứ tự xử lý (không được đảo):

1. `PAYPAL_WEBHOOK_ID` chưa cấu hình → `503 WEBHOOK_NOT_CONFIGURED` (fail closed, không đọc body).
2. Đọc **raw body đúng một lần** — PayPal ký chính các bytes đó, không ký bản đã encode lại — rồi `JSON.parse`; body không phải JSON → `400 WEBHOOK_PAYLOAD_INVALID`.
3. `POST /v1/notifications/verify-webhook-signature` với `webhook_id = PAYPAL_WEBHOOK_ID` → phải `SUCCESS`. Sai chữ ký → `400 WEBHOOK_SIGNATURE_INVALID`; chỉ log `eventId`, payload vẫn là untrusted (AGENTS.md #10).
4. Parse payload **sau khi** đã verify thành event chuẩn hoá (`@kitty/paypal` `parsePaypalWebhookEvent`): `payout_item` | `payout_batch` | `other` | `malformed`. Envelope thiếu `id`/`event_type` → `400 WEBHOOK_PAYLOAD_INVALID`.
5. Trong **một transaction**: `INSERT INTO leash.webhook_events … ON CONFLICT (id) DO NOTHING`. Trùng `id` → `200` ngay, không xử lý lại (docs/11 §4). Nếu mới: khoá intent `FOR UPDATE`, dispatch theo `event_type`, rồi ghi verdict (`processed` | `ignored` | `failed`) + `processed_at`.
6. Trả `200 { ok: true, duplicate: boolean, status }` nhanh (< 2s); việc nặng (email, index, thông báo) đi qua outbox → worker.

Handler (chi tiết bảng ở [11-paypal-integration.md](11-paypal-integration.md) §3):

| `event_type` | Tìm bằng | Hành động |
|---|---|---|
| `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` | `sender_item_id` | `submitted` → `settled`; `settlePayout` (held → `external:payee`); `paypal_objects` (item); audit; outbox `leash.intent_settled` |
| `PAYMENT.PAYOUTS-ITEM.FAILED/BLOCKED/DENIED` | `sender_item_id` | `submitted` → `released`; `release` (held → available); audit; outbox `leash.intent_failed` |
| `PAYMENT.PAYOUTS-ITEM.RETURNED` (chưa settled) | `sender_item_id` | như FAILED |
| `PAYMENT.PAYOUTS-ITEM.RETURNED/REFUNDED` **sau khi** đã `settled` | `sender_item_id` | chỉ ghi `paypal_objects` + audit alert, **không** đụng ledger (open question Q12 ở [20](20-risks-and-decisions.md)) |
| `PAYMENT.PAYOUTS-ITEM.UNCLAIMED` | `sender_item_id` | chỉ audit cảnh báo; giữ `submitted` (organizer có thể cancel unclaimed) |
| `PAYMENT.PAYOUTS-ITEM.ONHOLD`/`PENDING` | `sender_item_id` | không đổi gì, ghi `ignored` |
| `PAYMENT.PAYOUTSBATCH.SUCCESS` | `sender_batch_header.sender_batch_id` | chỉ cập nhật `paypal_objects` (batch) |
| `PAYMENT.PAYOUTSBATCH.DENIED` | `sender_batch_id` | mọi item `submitted` của batch → `released` + release txn + outbox `leash.intent_failed`; cập nhật `paypal_objects` |
| mọi event khác | — | lưu + `ignored` (invoice/order/refund ở KIT-22/KIT-27/KIT-42) |

Đảm bảo:

- **Idempotent** và **state-machine guarded**: `settled`/`released` là terminal, không handler nào đi ngược lại; retry của một event đã áp dụng (hoặc event đến sai thứ tự) là no-op, không bao giờ thành bút toán tiền thứ hai (I4).
- Handler lỗi → rollback cả transaction → PayPal retry lại đúng event đó.
- Intent không match (`sender_item_id` lạ, thiếu khoá, resource sai shape) → lưu event với `status = 'failed'` + log; vẫn trả `200` để PayPal không retry vô ích.
- `leash.webhook_events.status` ∈ `received | processed | ignored | failed` (docs/09 §3.3). Trigger append-only chỉ áp cho `audit_events`/`ledger_entries`; `webhook_events` update được.
- Đăng ký webhook cần URL HTTPS public (KIT-8); event list phải subscribe ở [11-paypal-integration.md](11-paypal-integration.md) §3.

---

## 6. Gateway Internal API (`/internal`)

Auth: `GATEWAY_INTERNAL_TOKEN`. Dùng bởi worker:
| Path | Mô tả |
|---|---|
| POST `/internal/sweeps/expiry` | Expire leashes & approvals quá hạn |
| POST `/internal/sweeps/reconcile` | Poll PayPal cho intents `submitted` > 5 phút (fallback webhook) |
| POST `/internal/sweeps/nonces` | Dọn nonce cũ |
| GET `/internal/outbox?after=` · POST `/internal/outbox/ack` | Đọc/ack domain events |
| POST `/internal/intents/:id/execute` | Thực thi intent đã ALLOW/approved |
| GET `/internal/intents/:id` | Đọc trạng thái một intent (worker/reconcile) |

**KIT-16** implement `POST /internal/intents/:id/execute` và `GET /internal/intents/:id`:

- Auth: `Authorization: Bearer <GATEWAY_INTERNAL_TOKEN>`, so sánh **constant-time** (So sánh sha256 digest qua `crypto.timingSafeEqual`); thiếu token cấu hình → 503 `INTERNAL_TOKEN_NOT_CONFIGURED`, sai token → 401 `UNAUTHORIZED`.
- `GET` trả `{ intent }`; `POST` trả `{ intent, outcome }` với `outcome ∈ { submitted, failed_released, unknown, not_implemented, noop }`. Schema ở `@kitty/shared/internal` (`intentViewSchema`, `executeIntentResponseSchema`). `intent` gồm `intentId`, `leashId`, `kittyId`, `agentId`, `action`, `amount` (string thập phân), `currency`, `payee`, `category`, `memo`, `taskId`, `decision`, `reasons[]`, `status`, `paypalRef`, `executeAttempts`, `error`, `createdAt`, `updatedAt`.
- Intent không tồn tại → 404 `INTENT_NOT_FOUND`. `POST` chỉ thực thi hành động `payout` trong task này; hành động khác giữ `reserved` và ghi `last_execute_error = { code: "NOT_IMPLEMENTED" }`.
- Route handler **không** chạm DB: `routes → service → repository` (CODE_RULES §D).

**KIT-7** implement `POST /internal/sweeps/reconcile` (webhook fallback, docs/11 §4):

- Auth: cùng middleware `Bearer <GATEWAY_INTERNAL_TOKEN>` như trên (constant-time).
- Body (`reconcileSweepRequestSchema` ở `@kitty/shared/internal`): `{ olderThanMinutes?: number (0..1440, default 5), limit?: number (1..100, default 25) }`. `olderThanMinutes: 0` cho test/demo → reconcile ngay.
- Chọn intent `status = 'submitted'` và `updated_at <= now - olderThanMinutes`, cũ nhất trước, tối đa `limit`. Mỗi intent: `GET /v1/payments/payouts/{payout_batch_id}` (item tra bằng `sender_item_id = intentId`) — **không mở transaction khi gọi PayPal**.
- Sau đó mở transaction, khoá lại intent `FOR UPDATE`, re-check vẫn `submitted` rồi mới áp **đúng** hai hàm `settleIntent`/`failIntent` mà webhook dùng (docs/05 §8) và cập nhật `paypal_objects`. Webhook đến trước → sweep thành no-op.
- Response `{ scanned, settled, failed, unchanged, errored }` (`reconcileSweepResponseSchema`). `errored` đếm intent không đọc được từ PayPal (network/auth) hoặc thiếu `payout_batch_id`; chúng giữ nguyên `submitted` để lần sweep sau thử lại.

