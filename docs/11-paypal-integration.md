# 11 — PayPal Integration

> Mục tiêu chấm điểm "Technological Implementation": dùng PayPal **sâu, đúng, an toàn** — không chỉ một nút checkout. Kitty dùng **5 nhóm API + webhooks + JS SDK v6**, tất cả trong sandbox.
> Trước khi code mỗi API: đọc lại reference chính thức (https://developer.paypal.com/api/rest/) và dùng APIMatic Context Plugin trong Claude Code để lấy schema chính xác.

## 1. Bản đồ API

| Chức năng Kitty | PayPal API | Endpoint (sandbox base `https://api-m.sandbox.paypal.com`) | Ai gọi |
|---|---|---|---|
| OAuth | Client credentials | `POST /v1/oauth2/token` | gateway (cache token đến hạn − 60s) |
| Member góp quỹ | **Invoicing v2** | `POST /v2/invoicing/invoices` → `POST /v2/invoicing/invoices/{id}/send` | gateway (intent `create_invoice` của Collector) |
| Nhắc nợ | Invoicing v2 | `POST /v2/invoicing/invoices/{id}/remind` | gateway (intent `send_reminder`) |
| Huỷ invoice | Invoicing v2 | `POST /v2/invoicing/invoices/{id}/cancel` | gateway (organizer) |
| Organizer nạp quỹ / trang `/pay` fallback | **Orders v2** | `POST /v2/checkout/orders` → (buyer approve qua JS SDK v6) → `POST /v2/checkout/orders/{id}/capture` | gateway (admin API) + web (JS SDK) |
| Trả vendor / Shopper mua | **Payouts v1** | `POST /v1/payments/payouts` · `GET /v1/payments/payouts/{batch_id}` · `GET /v1/payments/payouts-item/{item_id}` · `POST /v1/payments/payouts-item/{item_id}/cancel` (unclaimed) | gateway (intent `payout`) |
| Refund dư cho member | **Payments v2** | `POST /v2/payments/captures/{capture_id}/refund` | gateway (intent `refund`) |
| Đối soát | **Transaction Search** (tuỳ chọn) | `GET /v1/reporting/transactions` | worker reconcile (COULD) |
| Webhook verify | **Notifications** | `POST /v1/notifications/verify-webhook-signature` | gateway |
| Pay Later messaging | JS SDK v6 messages | client | web (COULD) |

> **Client (`packages/paypal` / `@kitty/paypal`):** toàn bộ bảng trên chạy qua một client REST tự viết trên **axios** (`createPayPalClient`), **chỉ `apps/gateway` được import** (AGENTS.md #1, ép bằng ESLint `no-restricted-imports` + `scripts/check-env-isolation.ts`). Client: cache OAuth2 token đến `expires_in − 60s`, single-flight (nhiều caller chia sẻ một request token), tự refresh token **một lần** khi 401; mọi POST gửi `PayPal-Request-Id` bắt buộc (Payouts thêm `sender_batch_id`); retry tối đa 3 lần cho network/5xx/429 (tôn trọng `Retry-After`), **không** retry 4xx; response validate bằng Zod; tiền vào/ra là **bigint cents** (`@kitty/ledger` `formatMoney`/`parseMoney`). Mọi lỗi gom vào một `PayPalApiError` (`status`, `name`, `message`, `debugId`, `details[]`, issue codes) và **không** chứa secret/access token/Authorization. `verifyCredentials()` chỉ chứng minh OAuth chạy, không trả token.

## 2. Chi tiết từng luồng

### 2.1 Invoice cho member
Request (rút gọn):
```json
{
  "detail": {
    "currency_code": "USD",
    "invoice_number": "KTY-DL-0007",
    "reference": "int_01JC…",
    "note": "Your share for Da Lat Team Offsite 🐱",
    "payment_term": { "due_date": "2026-11-20" }
  },
  "invoicer": { "email_address": "<PLATFORM_PAYPAL_EMAIL>", "business_name": "Kitty — Da Lat Team Offsite" },
  "primary_recipients": [{ "billing_info": { "email_address": "tuan.member@…", "name": { "given_name": "Tuan" } } }],
  "items": [{ "name": "Offsite share", "quantity": "1", "unit_amount": { "currency_code": "USD", "value": "334.00" } }],
  "configuration": { "allow_tip": false, "partial_payment": { "allow_partial_payment": false } }
}
```
- Header `PayPal-Request-Id: <intentId>`.
- `reference` = intentId để map webhook về intent.
- Webhook `INVOICING.INVOICE.PAID` → lấy `payments.transactions[].payment_id` (capture id) → lưu `contributions.paypal_capture_id` để refund sau.
- ⚠️ Kiểm tra trong sandbox: invoice có thực sự gửi email/hiển thị link thanh toán; lấy `href` của link "payer-view" để hiện nút "Open invoice" trong UI demo (không phụ thuộc email).

### 2.2 Orders (nạp quỹ / trang `/pay`)
- `intent: "CAPTURE"`, `purchase_units[0].custom_id = kittyId`, `invoice_id` = mã duy nhất.
- Client: JS SDK v6 → buyer approve → web gọi BFF → gateway capture.
- Webhook `PAYMENT.CAPTURE.COMPLETED` là nguồn chân lý (capture response chỉ để UX nhanh); dedupe theo capture id.

### 2.3 Payouts (vendor / Shopper)
```json
{
  "sender_batch_header": {
    "sender_batch_id": "int_01JC…",
    "email_subject": "Payment from Kitty — Da Lat Team Offsite",
    "email_message": "Deposit for Pine Hill Homestay"
  },
  "items": [{
    "recipient_type": "EMAIL",
    "amount": { "value": "1200.00", "currency": "USD" },
    "receiver": "homestay@…",
    "note": "Deposit 30% — Da Lat Offsite",
    "sender_item_id": "int_01JC…"
  }]
}
```
- **1 intent = 1 batch = 1 item** (đơn giản hoá mapping, idempotency nhờ `sender_batch_id` — PayPal từ chối batch id trùng).
- Trạng thái item: `PENDING` → `SUCCESS` | `FAILED` | `UNCLAIMED` | `RETURNED` | `BLOCKED` | `DENIED` | `ONHOLD` | `REFUNDED`.
- Map: `SUCCESS` → settled; `FAILED|RETURNED|BLOCKED|DENIED|REFUNDED` → failed + release; `UNCLAIMED` → giữ `submitted`, hiển thị cảnh báo, organizer có thể **cancel unclaimed** → release; `ONHOLD` → chờ.
- ⚠️ **Rủi ro #1 của dự án:** Payouts có thể cần được bật cho app/account. Kiểm tra **ngày 17/10** bằng `scripts/sandbox-check.ts`. Fallback: xem §6.

### 2.4 Refund (settlement)
- Treasurer tính pro-rata: `refund_i = surplus × share_i / Σshare`, làm tròn cents, phần dư cents dồn cho người đầu tiên.
- Mỗi member: intent `refund` → `POST /v2/payments/captures/{capture_id}/refund` với `amount`, `note_to_payer`, header `PayPal-Request-Id`.
- Webhook `PAYMENT.CAPTURE.REFUNDED` → ledger refund, `contributions.refunded_cents`.

## 3. Bảng xử lý Webhook

| event_type | Tìm intent/object bằng | Hành động |
|---|---|---|
| `INVOICING.INVOICE.PAID` | `resource.invoice.detail.reference` / invoice id | Tạo `contribution`, ledger `contribution`, outbox `kitty.funds_received` |
| `INVOICING.INVOICE.CANCELLED` | invoice id | intent → cancelled |
| `CHECKOUT.ORDER.APPROVED` | order id | (không ghi tiền) cập nhật trạng thái |
| `PAYMENT.CAPTURE.COMPLETED` | `custom_id`/order id | Contribution (topup) nếu chưa có |
| `PAYMENT.CAPTURE.REFUNDED` | capture id | Ledger refund, outbox `kitty.refunded` |
| `PAYMENT.PAYOUTSBATCH.SUCCESS/DENIED` | `batch_header.sender_batch_header.sender_batch_id` | Cập nhật batch; DENIED → mọi item failed |
| `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` | `sender_item_id` | intent settled; ledger held → payee; outbox `leash.intent_settled` |
| `PAYMENT.PAYOUTS-ITEM.FAILED/RETURNED/BLOCKED/DENIED` | `sender_item_id` | intent failed; release hold; outbox `leash.intent_failed` |
| `PAYMENT.PAYOUTS-ITEM.UNCLAIMED` | `sender_item_id` | cảnh báo (audit), giữ `submitted` |
| `PAYMENT.PAYOUTS-ITEM.ONHOLD` / `PENDING` | `sender_item_id` | chờ, không đổi trạng thái |

Thứ tự đến không đảm bảo → mọi handler **idempotent** và **state-machine guarded** (không chuyển ngược từ `settled`).

### 3.1 Thực thi trong KIT-7 (`apps/gateway`)

- Endpoint `POST /webhooks/paypal`; thứ tự verify → dedupe → settle và map sang trạng thái chi tiết: [10-api-spec.md](10-api-spec.md) §5.
- **Khoá tra item là `sender_item_id = intentId`** (và `sender_batch_id = intentId`): `payouts.createSingle` set cả hai (default `senderItemId = senderBatchId`), và `GET /v1/payments/payouts/{id}` trả `sender_item_id` trong object `payout_item` lồng nhau — parser đọc cả hai vị trí (đã kiểm chứng với sandbox thật, xem `packages/paypal/src/payouts.ts`).
- `PAYMENT.PAYOUTS-ITEM.FAILED/RETURNED/BLOCKED/DENIED` → `submitted` → (`failed`) → **`released`** + release txn; badge trạng thái cuối là `released`, `failed` chỉ là bước trung gian trong sơ đồ docs/05 §4, lý do PayPal ghi vào `spend_intents.error` và audit.
- `RETURNED`/`REFUNDED` đến **sau khi** intent đã `settled`: tiền đã rời ledger sang account ngoài (`external:payee`), không thể hoàn tác bằng bút toán nội bộ → chỉ ghi `paypal_objects` + audit alert `intent.returned_after_settled`/`intent.refunded_after_settled` và **không** đụng ledger. Xử lý tiền thật cho case này là open question **Q12** ở [20-risks-and-decisions.md](20-risks-and-decisions.md).
- `UNCLAIMED`: chỉ audit `intent.unclaimed` + cập nhật `paypal_objects`, giữ hold; organizer **cancel unclaimed** → release (KIT-30).
- Event không match/ thiếu khoá/ resource sai shape → `webhook_events.status = 'failed'` + log, vẫn `200`.
- Event ngoài scope (invoice/order/capture/refund, và `PAYMENT.PAYOUTS-ITEM.REFUNDED` khi chưa settled là trong scope) → lưu + `ignored`, chờ KIT-22 (invoice/topup), KIT-27 (orders/capture), KIT-42 (refund).

### 3.2 Event list để đăng ký webhook

Đăng ký trên PayPal app (sandbox + live) với URL `https://<gateway-host>/webhooks/paypal`, cần URL HTTPS public (**KIT-8**, Render). Subscribe đúng danh sách này:

```text
PAYMENT.PAYOUTS-ITEM.SUCCEEDED
PAYMENT.PAYOUTS-ITEM.FAILED
PAYMENT.PAYOUTS-ITEM.RETURNED
PAYMENT.PAYOUTS-ITEM.BLOCKED
PAYMENT.PAYOUTS-ITEM.DENIED
PAYMENT.PAYOUTS-ITEM.UNCLAIMED
PAYMENT.PAYOUTS-ITEM.ONHOLD
PAYMENT.PAYOUTS-ITEM.REFUNDED
PAYMENT.PAYOUTSBATCH.SUCCESS
PAYMENT.PAYOUTSBATCH.DENIED
```

Sau đó lưu `id` webhook PayPal trả về vào `PAYPAL_WEBHOOK_ID` (gateway env) và chạy `bun run sandbox:check` để xác nhận. Các event invoicing/order/capture/refund sẽ được thêm vào cùng webhook khi KIT-22/KIT-27/KIT-42 lên (thêm event type cho một webhook đã đăng ký qua `PATCH /v1/notifications/webhooks/{id}`).

## 4. Idempotency & retry

| Lớp | Cơ chế |
|---|---|
| Agent → Gateway | `intentId` là PK; trùng body → trả kết quả cũ |
| Gateway → PayPal | `PayPal-Request-Id = intentId` (Orders/Invoicing/Refunds), `sender_batch_id = intentId` (Payouts) |
| PayPal → Gateway | `webhook_events.id` PK |
| Retry | Exponential backoff 3 lần cho 5xx/429/network; **không** retry 4xx (trừ 401 → refresh token 1 lần) |
| Fallback webhook | Reconcile sweep: intent `submitted` > 5' → GET trạng thái từ PayPal |

## 5. Sandbox accounts & dữ liệu test

Xem [08-infrastructure.md](08-infrastructure.md) §4. Ghi vào README (tiếng Anh) danh sách **sandbox buyer logins** để judges tự trả invoice — chỉ là tài khoản sandbox, không phải dữ liệu thật.

## 6. Fallbacks (nếu một API không dùng được trong sandbox)

| API gặp vấn đề | Fallback | Ảnh hưởng pitch |
|---|---|---|
| Payouts không bật được | (a) Hỏi Discord PayPal ngay; (b) Vendor gửi **Invoice** cho platform và Gateway "trả invoice" — không khả thi tự động; (c) **Orders do platform tạo, vendor là payee** (`purchase_units.payee.email_address`) và buyer là platform sandbox personal account được approve thủ công — chỉ dùng cho demo | Giảm tính tự động; nói rõ trong README |
| Invoice email không đến | Dùng link payer-view trong UI; hoặc chuyển sang Orders trên trang `/pay` | Không ảnh hưởng |
| Webhook chậm | Reconcile sweep + nút "Sync now" | Không ảnh hưởng |
| Refund lỗi với invoice payment | Refund bằng Payout ngược về member (allowlist = member) | Nhỏ |

## 7. PayPal Agent Toolkit / MCP — dùng ở đâu

- **Phân biệt (kiểm 17/10, [01](01-hackathon.md) §9.1):** **AI-Toolkit** = plugin cho coding assistant (dev tooling); **`@paypal/agent-toolkit`** = thư viện runtime cho agent; **PayPal MCP server** = remote/local MCP với cùng bộ tool. **Không cái nào có Payouts.**
- **Không** cấu hình PayPal MCP server hay Agent Toolkit cho agents (bất biến #3): chúng xác thực bằng client credentials của app → ai cầm là gọi được mọi thứ → mất bounded loss ([03](03-sui-agent-pass-to-paypal.md) §3).
- Gateway có thể dùng `@paypal/agent-toolkit` như executor cho invoices/orders/refunds **sau khi** policy ALLOW, nếu truyền được `PayPal-Request-Id` (bất biến #6). Payouts và verify webhook luôn qua `packages/paypal` REST client.
- Trong submission (chỉ khi thật sự dùng): *"Kitty puts PayPal's agent tools behind a leash: agents never hold PayPal credentials; every tool call passes a deterministic policy engine first — and Kitty adds leashed Payouts, which PayPal's agent tools don't offer."*
- Agent bên ngoài (Claude Desktop, Claude Code, Cursor…) nối vào **Leash Gateway MCP** qua `leash-mcp` ([ADR-025](20-risks-and-decisions.md)), không bao giờ nối thẳng PayPal MCP.
- Quyết định cuối sau spike ngày 18/10 — ADR-007 trong [20-risks-and-decisions.md](20-risks-and-decisions.md).
