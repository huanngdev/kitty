# 22 — Glossary

| Thuật ngữ | Nghĩa trong Kitty |
|---|---|
| **Kitty** | (1) Tên app. (2) Quỹ chung của một Event, theo dõi bằng ledger, tiền nằm trong tài khoản PayPal platform. |
| **Leash** | Quyền chi tiêu có giới hạn cấp cho một agent; cắt từ Kitty hoặc từ leash cha. Tương đương "Agent Pass". |
| **Sub-leash** | Leash con do agent có quyền `delegate` tạo; luôn hẹp hơn hoặc bằng cha. |
| **Leash Gateway** | Service duy nhất giữ PayPal credentials; xác thực agent, chạy policy, reserve tiền, gọi PayPal, xử lý webhook. |
| **Policy engine** | Hàm thuần `evaluate()` trong `packages/leash` trả về Decision. |
| **Decision** | `ALLOW` · `DENY(reasons)` · `STEP_UP(reasons)`. |
| **Reason code** | Mã lý do chuẩn hoá (vd `PAYEE_NOT_ALLOWED`). |
| **Spend Intent** | Yêu cầu hành động có rủi ro do agent gửi; có `intentId` idempotent. |
| **Reservation / Hold** | Tiền được giữ chỗ trong `leash:{id}:held` khi intent được ALLOW/STEP_UP, trước khi PayPal xác nhận. |
| **Settled** | PayPal xác nhận thành công (qua webhook/reconcile). |
| **Step-up** | Intent cần organizer duyệt (vượt ngưỡng hoặc nghi trùng). |
| **Allocation** | Số tiền cấp cho một leash — chính là bounded loss của leash đó. |
| **Bounded loss** | Thiệt hại tối đa xác định trước: ≤ số dư leash, chỉ tới payee đã duyệt. |
| **Max possible loss** | Con số hiển thị trên UI = Σ available của leash (và sub-leash) đang active. |
| **Prefunded envelope** | Mô hình tiền được cấp trước vào leash; hết là dừng. |
| **Payment gate** | Điều kiện tiền để mở khoá task trên Gantt. |
| **Allowlist** | Danh sách được phép (payees, actions, categories). |
| **Probing detector** | Cơ chế tự pause leash khi có nhiều DENY liên tiếp. |
| **Outbox** | Bảng `leash.outbox` lưu domain events trong cùng transaction để phát tin cậy. |
| **Domain event** | Sự kiện nghiệp vụ Gateway phát ra (vd `kitty.funds_received`). |
| **Organizer / Member / Vendor (Payee)** | Người tạo event / người góp tiền / bên nhận tiền. |
| **Planner / Shopper / Collector / Treasurer** | Bốn vai agent. |
| **Agent key** | Cặp khoá Ed25519 của một agent; private key ở service `agents`, public key ở Gateway. |
| **Sandbox** | Môi trường test của PayPal — toàn bộ Kitty chạy ở đây. |
| **Agent Pass (Sui)** | Concept gốc từ Sui Basecamp 2026 mà Kitty lấy cảm hứng. |
| **MCP** | Model Context Protocol — giao thức agents dùng để gọi tools (Gateway, Channel3, Zapier). |
| **BYOK** | Bring Your Own Key — người dùng tự nhập API key của nhà cung cấp LLM và tự chọn model; Kitty không cung cấp model. |
| **AI credential** | Một API key LLM đã mã hoá của người dùng (`app.ai_credentials`), chỉ hiển thị `last4`. |
| **Model settings** | Model default và model theo từng vai agent mà người dùng chọn. |
| **Manual mode** | Trạng thái khi chưa có AI key: mọi tính năng tiền vẫn chạy, agents tắt. |
| **Demo key** | Key của team, có hạn mức, chỉ dùng cho tài khoản demo/judge (`is_demo`). |
