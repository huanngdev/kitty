# 03 — Từ Sui Agent Pass sang PayPal: concept "Leash"

## 1. Sui Agent Pass là gì (đã xác minh)

| Điểm | Chi tiết | Nguồn |
|---|---|---|
| Công bố | Evan Cheng (CEO Mysten Labs) tại **Sui Basecamp 2026, Singapore, 7–8/10/2026** — keynote "What's Next?" (https://www.youtube.com/watch?v=rCWnarkgKkI) | KuCoin, Coinfomania, CoinOtag |
| Bản chất | Framework **cấp protocol** cho phép user cấp cho AI agent **quyền chi tiêu có giới hạn** thay vì toàn quyền ví | Altcoin Buzz, KuCoin |
| Giới hạn | Theo **số tiền, người nhận, loại tài sản, hành động được phép** | KuCoin |
| Bounded loss | Giới hạn **vẫn được thực thi kể cả khi agent hoặc key của agent bị lộ** → thiệt hại tối đa xác định trước bằng protocol rules | KuCoin, CoinOtag |
| Phạm vi | Vượt khỏi coin allowance: cả **non-coin assets** và **hành động on-chain phức tạp**; Mysten dự định mở rộng sang **workflow off-chain của doanh nghiệp** | KuCoin |
| Thực thi | Hợp đồng **Move on-chain** | Tóm tắt của team |
| Chưa rõ | Spec kỹ thuật chưa công bố đầy đủ; quan hệ với tính năng "Allowances" của Sui chưa xác nhận | Altcoin Buzz, TokenPost |

Nguồn:
- https://www.altcoinbuzz.io/sui-agent-pass-ai-agent-spending-limits
- https://www.kucoin.com/news/flash/sui-launches-sui-agent-pass-to-limit-losses-from-key-leaks
- https://coinfomania.com/sui-agent-pass-launches-to-limit-user-risk-in-transactions/
- https://en.coinotag.com/sui-agent-pass-caps-losses-leaked-ai-agent-keys
- https://www.tokenpost.kr/news/blockchain/422677

> ⚠️ Kitty **lấy cảm hứng** từ concept, không sao chép code hay thương hiệu. Không dùng tên "Agent Pass" hay "Sui" trong tên sản phẩm. Trong pitch nói: *"inspired by the agent-pass concept Sui introduced at Basecamp 2026"*.

## 2. Ánh xạ khái niệm Sui → PayPal

| Khái niệm Sui | Ý nghĩa | Tương đương trong Kitty/Leash |
|---|---|---|
| Ví người dùng + private key | Tài sản và quyền gốc | Tài khoản PayPal của người dùng + **Kitty pool** (tiền nhóm đã góp, nằm trong tài khoản platform) |
| Agent Pass (object on-chain) | Quyền giới hạn cấp cho agent | **Leash** (record trong Gateway + public key của agent) |
| Key riêng của agent | Agent ký giao dịch | **Ed25519 keypair của agent**; agent ký mọi request tới Gateway |
| Move smart contract | Bên thực thi chính sách, không ai vượt qua được | **Leash Gateway** (service duy nhất giữ PayPal credentials) + **policy engine** thuần, test kỹ |
| Coin allowance | Giới hạn số coin | `per_tx_max`, `daily_max`, `allocation` |
| Allowed recipients | Địa chỉ được nhận | `allowed_payees` (email PayPal / merchant id) |
| Allowed actions | Hàm contract được gọi | `allowed_actions` (`payout`, `create_invoice`, `create_order`, `refund`, `delegate`) |
| Non-coin assets | NFT, object khác | **Non-money actions có rủi ro**: gửi invoice, gửi nhắc nợ, tạo order, đặt chỗ qua browser (ngoài scope hackathon) — cũng bị leash giới hạn |
| Bounded loss bằng protocol | Contract không cho vượt | **Prefunded envelope**: tiền agent tiêu được đã được *tách riêng* khỏi Kitty; vượt là không có tiền để tiêu |
| Thu hồi pass | Hủy object | `revoke` → status `revoked`, tiền chưa dùng trở về Kitty, cascade sub-leash |
| (không công bố) | | **Sub-leash: delegation chỉ thu hẹp** — điểm mở rộng của Kitty |

## 3. Vấn đề cốt lõi khi chuyển sang PayPal

**Q: Trên Sui, blockchain thực thi giới hạn. Trên PayPal, ai thực thi?**
A: PayPal REST API **không có khái niệm "credential có hạn mức cho agent"**. Ai cầm `client_id` + `client_secret` của app là gọi được mọi API: payout bất kỳ số tiền, tới bất kỳ ai (trong giới hạn tài khoản). Nếu ta đưa credentials (hay PayPal MCP server cấu hình bằng credentials) cho agent → **không có bounded loss nào**.

**Q: Vậy giải thế nào?**
A: Hai lớp:

1. **Leash Gateway** — trust boundary. Là service **duy nhất** có PayPal credentials. Agent chỉ nói chuyện với Gateway (qua MCP), mỗi request ký bằng key của agent, Gateway chạy policy rồi mới gọi PayPal.
2. **Prefunded envelope** — để bounded loss không chỉ dựa vào "Gateway không có bug". Tiền một leash được tiêu đã được **cấp (allocate) trước** từ Kitty pool vào leash trong ledger. Gateway chỉ cho tiêu tối đa số dư leash. Tổng tất cả leash ≤ số tiền thật đã thu.

**Q: Nếu agent runtime bị chiếm hoàn toàn (kẻ tấn công có key của agent)?**
A: Kẻ tấn công chỉ làm được đúng những gì leash cho phép: tiêu tối đa số dư leash, chỉ tới payee đã allowlist, chỉ các hành động đã cho phép, trong thời hạn. Vì payee bị allowlist (vendor đã KYC trên PayPal), tiền **không thể chảy về ví kẻ tấn công**. Thiệt hại thực tế thường = 0; thiệt hại lý thuyết tối đa = số dư leash trả nhầm cho vendor hợp lệ (vẫn có thể đòi lại/refund).

**Q: Nếu Gateway bị chiếm?**
A: Đây là giới hạn trung thực của mô hình: Gateway là một bên phải tin. Giảm thiểu: Gateway tối giản, tách service, tách DB role, không có LLM bên trong, audit log append-only, PayPal app riêng với quyền tối thiểu. Ghi rõ trong [14-security-threat-model.md](14-security-threat-model.md). Đây là chỗ khác biệt với Sui — và ta **nói thẳng** trong pitch.

## 4. So sánh trung thực

| | Sui Agent Pass | Kitty / Leash trên PayPal |
|---|---|---|
| Bên thực thi | Smart contract on-chain | Gateway server + prefunded envelope |
| Mô hình tin cậy | Trustless | Trust-minimized (tin Gateway; loss bị chặn bởi prefunding) |
| Khi chi sai | Không đảo ngược | **Refund, cancel unclaimed payout, dispute, buyer protection** |
| Người nhận | Địa chỉ ẩn danh | **Tài khoản PayPal đã KYC** — khó rút tiền về kẻ gian |
| Người dùng cần | Ví crypto, gas, seed phrase | Tài khoản PayPal |
| Tiền | Token/stablecoin | Fiat (USD trong demo) |
| Độ phủ | Hệ sinh thái Sui | PayPal: 400M+ tài khoản, hàng chục triệu merchant |
| Delegation | Chưa công bố | **Sub-leash thu hẹp** |

**Pitch line:** *"Sui-style bounded loss, PayPal-grade reversibility."*

## 5. Định nghĩa Leash (bản tóm tắt — spec đầy đủ ở [05-leash-spec.md](05-leash-spec.md))

```jsonc
{
  "id": "lsh_01JB…",
  "kitty_id": "kty_01JB…",          // quỹ nguồn
  "parent_id": null,                // sub-leash thì trỏ về leash cha
  "agent": { "id": "agt_shopper", "public_key": "ed25519:…" },
  "allocation": "500.00",           // số tiền được cấp (bounded loss)
  "currency": "USD",
  "limits": { "per_tx_max": "120.00", "daily_max": "300.00", "max_tx_per_hour": 5 },
  "allowed_actions": ["payout"],
  "allowed_payees": ["gear-rental@vendor.example"],
  "allowed_categories": ["gear", "merch"],
  "step_up_above": "80.00",         // trên ngưỡng này → người duyệt
  "expires_at": "2026-12-22T00:00:00Z",
  "status": "active"
}
```

## 6. Bốn "aha moment" muốn judges thấy

1. **Prompt injection bị chặn trực tiếp trên màn hình:** agent bị lừa gọi payout cho `refund-desk@scam.example` → Gateway trả `DENY: PAYEE_NOT_ALLOWED, AMOUNT_EXCEEDS_PER_TX` → banner đỏ trên dashboard → organizer bấm Revoke. *"Max possible loss: $500. Actual loss: $0."*
2. **Delegation chỉ thu hẹp:** Planner (leash $3.000) cấp cho Shopper sub-leash $500 chỉ cho "merch" 48h; Shopper thử xin rộng hơn → bị từ chối `DELEGATION_EXCEEDS_PARENT`.
3. **Tiền thật di chuyển và kế hoạch phản ứng:** thành viên trả invoice sandbox → webhook → Kitty tăng → task "Đặt cọc homestay" trên timeline mở khoá → Treasurer payout vendor → task ✅.
4. **Agent bất kỳ cũng bị leash:** `bunx leash-mcp init` → Claude Desktop nối vào một leash → bị lừa trả cho payee lạ → cùng một DENY ([ADR-027](20-risks-and-decisions.md)).
