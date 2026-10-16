# 17 — Mục tiêu & Chỉ số thành công

## 1. Mục tiêu giải thưởng

| Ưu tiên | Giải | Lý do tin là khả thi |
|---|---|---|
| 🎯 **Primary** | **Grand Prize (1st–3rd)** | Concept mới (agent pass → PayPal), demo mạnh, dùng PayPal sâu |
| 🎯 **Fallback Primary** | **Best Use of Agentic Commerce** ($5k) — hoặc Best Use of PayPal + AI / Most Creative | Leash là đúng trọng tâm "agents that actually transact — safely" |
| 🎯 **Sponsor** | **Best Use of AG Grid** (1st $5k; 2nd $2k; 3rd $1k ×3) | Custom widgets + theme + Studio Agent Framework + realtime tiền |
| Sponsor dự phòng | Best Use of Bryntum ($1k ×3) | Payment-gated Gantt + agent rescheduler đúng ý tưởng họ gợi ý |
| Sponsor dự phòng | Channel3 ($1.5k), APIMatic ($1k ×3 + 6 tháng), Render credits | Tích hợp thật, ghi rõ |

Kịch bản tốt nhất: **Grand Prize + AG Grid 1st = $17.000** (1st) — tuân luật "1 chính + 1 sponsor".

## 2. Mục tiêu theo tiêu chí chấm

| Tiêu chí | Mục tiêu cụ thể | Bằng chứng trong submission |
|---|---|---|
| **Technological Implementation** | 5 nhóm PayPal API + webhooks verified + JS SDK v6; policy engine deterministic có test; Ed25519 signing; transactional outbox; idempotency đầu-cuối | Kiến trúc diagram, test coverage badge, link code `packages/leash` |
| **Design** | Một sản phẩm liền mạch: tạo event → góp tiền → agents làm việc → dashboard → settle. UI nhất quán giữa Next.js/AG/Bryntum | Screenshots, video |
| **Potential Impact** | Hai tầng: (1) người tổ chức nhóm không ứng/đòi tiền; (2) **bất kỳ agent nào** có thể tiêu tiền PayPal an toàn qua Leash (MCP) | Câu chuyện Mai + phát biểu bounded loss + tầm nhìn platform |
| **Innovation** | Đem concept agent-pass (Sui, 10/2026) sang fiat/PayPal; prefunded envelope = bounded loss; delegation chỉ thu hẹp; payment-gated timeline | Bảng so sánh Sui vs Kitty |
| **Presentation** | Video < 3' với 3 "aha": tiền thật di chuyển, injection bị chặn, delegation | Kịch bản [19](19-demo-and-submission.md) |

## 3. Chỉ số kỹ thuật (Definition of Success)

| # | Chỉ số | Ngưỡng |
|---|---|---|
| K1 | Branch coverage `packages/leash` | **100%** |
| K2 | Coverage `packages/ledger`, `packages/signing` | ≥ 95% |
| K3 | Property tests invariants I1–I4 | 10.000 runs pass |
| K4 | Injection eval: tỉ lệ payout sai **lọt qua Gateway** | **0%** (trên mọi biến thể) |
| K5 | Concurrency test 50 intent song song trên 1 leash | Không vượt allocation, không âm |
| K6 | Webhook → UI cập nhật | p95 < 10s trên demo |
| K7 | Agent runtime không có PayPal secret | CI check pass |
| K8 | Judges chạy local từ README | ≤ 15 phút (đo bằng người ngoài) |
| K9 | Demo URL uptime trong judging (1–15/12) | Không downtime > 1h; health check mỗi ngày |
| K10 | Video | 2:45–2:55, phụ đề EN |

## 4. Chỉ số sản phẩm (kể trong pitch, dựa trên demo)

| Chỉ số | Trước Kitty | Với Kitty (demo) |
|---|---|---|
| Tiền organizer phải ứng | ~$1.200 cọc | **$0** |
| Tin nhắn đòi tiền thủ công | ~20–30 | **0** (Collector gửi) |
| Thời gian lập kế hoạch | nhiều giờ | **1 prompt + chỉnh** |
| Thiệt hại tối đa nếu agent bị hack | toàn bộ tài khoản | **= số dư leash (vd $164)** |

(Không bịa số liệu nghiên cứu. Nếu dùng số liệu ngoài, phải có nguồn trong README.)

## 5. Definition of Done — toàn dự án

- [ ] Mọi MUST (M1–M12) trong [04-product-spec.md](04-product-spec.md) chạy trên demo URL
- [ ] K1, K4, K5, K7 đạt
- [ ] README tiếng Anh: what/why/how, architecture, setup local, deploy, sandbox credentials, tools used, security model & honest limits, license
- [ ] Repo public + LICENSE MIT hiện ở About
- [ ] Video YouTube public < 3'
- [ ] Submission Devpost đầy đủ (text, links, built-with, tools explanation)
- [ ] Demo seed có thể reset; nhiều event demo cho judges
