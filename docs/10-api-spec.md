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

`POST /webhooks/paypal`
1. Đọc raw body + headers `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-TIME`, `PAYPAL-CERT-URL`, `PAYPAL-AUTH-ALGO`, `PAYPAL-TRANSMISSION-SIG`.
2. Gọi `POST /v1/notifications/verify-webhook-signature` với `webhook_id = PAYPAL_WEBHOOK_ID` → phải `SUCCESS`.
3. `INSERT INTO leash.webhook_events … ON CONFLICT (id) DO NOTHING` → nếu đã có → 200 ngay.
4. Xử lý theo `event_type` (bảng ở [11-paypal-integration.md](11-paypal-integration.md)) trong transaction; ghi outbox.
5. Trả 200 nhanh (< 2s); việc nặng đẩy sang worker.

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
