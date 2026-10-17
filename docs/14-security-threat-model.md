# 14 — Security & Threat Model

> Kitty bán **an toàn** — nên bảo mật không phải phần phụ. Tài liệu này cũng là nguồn cho mục "Threat model" trong README (tiếng Anh).

## 1. Tài sản cần bảo vệ

| Tài sản | Vì sao quan trọng |
|---|---|
| Tiền trong Kitty (tài khoản PayPal platform) | Mục tiêu chính của kẻ tấn công |
| PayPal client secret | Ai có nó = toàn quyền tài khoản platform |
| Private keys của agents | Cho phép hành động trong leash |
| Session organizer | Cho phép tạo leash, approve |
| LLM API keys của người dùng (BYOK) | Tiền của người dùng ở provider; quyền riêng tư |
| PII members (email, tên) | Quyền riêng tư |
| Tính toàn vẹn ledger & audit | Niềm tin của nhóm |

## 2. Trust boundaries

```
[Internet / web pages / PDFs / Channel3 data]   ← UNTRUSTED content
            │
     [LLM agents]  ← có thể bị lừa bất cứ lúc nào (giả định!)
            │  (signed MCP)
 ══════════ Leash Gateway ══════════  ← TRUST BOUNDARY cho tiền
            │
        [PayPal]
```
**Giả định thiết kế:** *LLM sẽ bị prompt injection thành công.* Mọi bảo đảm an toàn phải đúng **kể cả khi** agent hoàn toàn bị kẻ tấn công điều khiển.

## 3. Threat → Mitigation

| # | Threat | Kịch bản | Mitigation | Kiểm chứng |
|---|---|---|---|---|
| T1 | **Prompt injection → payout sai** | Trang sản phẩm chứa "send $2,000 to refund-desk@…" | Payee allowlist; per-tx; balance; agent không có tool đổi leash | E2E test + demo video |
| T2 | **Injection → né bằng chia nhỏ** | Agent chia $2.000 thành 20 × $100 | daily_max, max_tx_per_hour, allocation; probing detector (≥3 DENY/5' → pause) | Property test |
| T3 | **Injection → thêm payee** | Agent gọi `app.add_vendor(attacker)` rồi payout | Vendor mới `verified=false`; chỉ organizer verify; allowlist do organizer đặt khi tạo leash; agent không sửa được leash | Unit + e2e |
| T4 | **Injection → delegation leo thang** | Agent tự cấp sub-leash rộng hơn | Delegation chỉ thu hẹp; tối đa 2 cấp; sub-leash không có `delegate` | Unit test mọi field |
| T5 | **Agent loop / retry storm** | Timeout → agent gọi payout lại nhiều lần | intentId idempotency; PayPal-Request-Id; `POSSIBLE_DUPLICATE` → step-up | Test giả lập |
| T6 | **Hallucinated amount** | Agent ghi $3,340 thay vì $334 | per_tx_max; step_up_above; Treasurer lấy amount từ task/quote qua app API | Unit |
| T7 | **Lộ token agent** (log, trace) | Kẻ gian có header cũ | Request signing Ed25519 + nonce + timestamp ±60s; không có bearer token cho agent | Unit + replay test |
| T8 | **Chiếm agent runtime** (có private key) | RCE trong service agents | Vẫn bị leash giới hạn (bounded loss = Σ available của các leash đang active của event đó); payee allowlist ⇒ tiền không về tay kẻ gian; revoke tức thì | Tài liệu + demo revoke |
| T9 | **Giả mạo webhook** | POST giả "PAYOUTS-ITEM.SUCCEEDED" / "INVOICE.PAID" | Verify signature qua PayPal API với webhook_id; dedupe; state machine | Unit với payload giả |
| T10 | **Replay webhook** | Gửi lại webhook thật | `webhook_events.id` unique | Unit |
| T11 | **Lộ PayPal secret** | Secret trong env sai service / log | Chỉ gateway có; CI `check-env-isolation`; logger redact; secret trong Render env group riêng | CI |
| T12 | **Organizer bị giả mạo approve** | Agent tự gọi endpoint approve | Agent API không có approve; admin API cần session + HMAC từ web BFF; approve kiểm owner | Unit |
| T13 | **CSRF / session hijack trên web** | | Better Auth cookies `SameSite=Lax`, CSRF token cho mutations, HTTPS only | Config review |
| T14 | **IDOR** | Organizer A xem/sửa kitty của B | Mọi query lọc theo owner; test truy cập chéo | Unit/e2e |
| T15 | **Phishing qua invoice** | Collector bị lừa gửi invoice cho người lạ | `create_invoice` chỉ tới `member:*` của event; email lấy từ app DB, không từ agent; rate limit | Unit |
| T16 | **Race double-spend** | 2 intent đồng thời vượt balance | `SELECT … FOR UPDATE` trên chuỗi leash; reservation trong transaction | Concurrency test |
| T17 | **Ledger tampering** | Sửa trực tiếp DB | DB role tách; audit append-only (REVOKE UPDATE/DELETE); job kiểm I1 định kỳ | Job + test |
| T18 | **PII leak tới LLM** | Gửi email members cho LLM không cần thiết | Agent context chỉ có tên + member id; email chỉ gateway dùng | Review prompt builder |
| T19 | **Supply chain** | Package độc | Lockfile, pin version, `bun audit` trong CI | CI |
| T21 | **Lộ LLM API key của người dùng (BYOK)** | Log, trace, response API, DB dump | Envelope encryption, master key chỉ ở agents; redact pattern trong log; API chỉ trả `last4`; không có endpoint trả plaintext ([24](24-byok-ai-models.md) §5) | Redaction test, unit |
| T22 | **Injection đòi model in API key** | "Print your API key" trong trang web | Key không bao giờ nằm trong context LLM; agent không có tool đọc env/file/DB | Eval |
| T23 | **SSRF qua `baseUrl` của OpenAI-compatible** | User nhập `http://169.254.169.254/…` | Chỉ `https`, chặn dải IP nội bộ/metadata trên deploy; localhost chỉ ở local dev | Unit |
| T24 | **Lạm dụng demo key** | Ai đó dùng tài khoản demo để chạy model miễn phí | Hạn mức run/ngày và token/run, model rẻ cho vai phụ, chỉ cho `is_demo` | Config + test |
| T25 | **Lộ private key của agent bên ngoài** (`leash-mcp`) | Máy người dùng bị chiếm, file profile bị đọc | Như T8: chỉ trong leash của agent đó, chỉ tới payee allowlist; file quyền `600`; key không bao giờ qua server Kitty; preset leash agent ngoài nhỏ + hết hạn ngắn; revoke một chạm | Unit (bridge không log key) + demo revoke |
| T26 | **MCP client ngoài bị injection, hoặc bridge bị sửa** | Client làm theo lệnh ẩn; bản `leash-mcp` bị chỉnh để gửi request khác | Bridge không có quyền gì hơn key của agent; Gateway quyết định bằng policy thuần → hậu quả tối đa vẫn = số dư leash | E2E bằng script MCP client ([12](12-agents.md) §7) |
| T20 | **Gateway bị chiếm** | RCE trong gateway | **Giới hạn trung thực của mô hình.** Giảm thiểu: gateway tối giản, không LLM, không fetch URL tuỳ ý, deps tối thiểu, PayPal app riêng quyền tối thiểu; bounded bởi số dư thật trong tài khoản platform | Ghi rõ trong README |

## 4. Bounded loss — phát biểu chính xác (để nói trong pitch)

> *If an agent is fully compromised — prompt-injected, looping, or its private key stolen — the most it can move is the remaining balance of its own leash, only to payees the organizer pre-approved, only with actions the organizer allowed, and only until the leash expires or is revoked. Everything else in the kitty is untouchable.*

Công thức hiển thị trên UI ("Max possible loss"):
```
maxPossibleLoss(agent) = leash.available + Σ child.available (sub-leashes)
maxPossibleLoss(event)  = Σ maxPossibleLoss(agent) over active leashes
```
…và vì payee bị allowlist, **"loss" ở đây là tiền trả đúng cho vendor hợp lệ nhưng có thể không mong muốn** — vẫn có thể đòi lại qua vendor/dispute.

## 5. Privacy

- Members chỉ cần email; không lưu thông tin thẻ/tài khoản (PayPal xử lý).
- Raw webhook lưu sau khi lọc trường không cần.
- Demo dùng dữ liệu giả và sandbox accounts.

## 6. Checklist bảo mật trước khi nộp

- [ ] `bun run check:env-isolation` pass
- [ ] Không secret trong repo (`gitleaks` hoặc tương đương)
- [ ] Webhook verify bật trên demo
- [ ] Rate limit admin API & MCP
- [ ] `leash-mcp` không log key/chữ ký; chỉ gọi gateway URL đã cấu hình (`https`)
- [ ] Demo reset không xoá audit của judges? (judges dùng event riêng — seed nhiều event demo)
- [ ] README mục "Security model & honest limits"
