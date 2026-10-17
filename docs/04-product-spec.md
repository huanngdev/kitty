# 04 — Product Spec

## 1. Khái niệm chính (dùng thống nhất trong code, UI, docs)

| Thuật ngữ | Định nghĩa |
|---|---|
| **Event** | Một hoạt động nhóm (offsite, trip, wedding…). Đơn vị tổ chức chính trong app. |
| **Kitty** | Quỹ chung của một Event. Tiền thật đã thu từ members (nằm trong tài khoản PayPal platform, theo dõi bằng ledger). 1 Event ↔ 1 Kitty. |
| **Organizer** | Người tạo Event, chủ Kitty, người duy nhất cấp/thu hồi Leash và duyệt step-up. |
| **Member** | Người tham gia, góp tiền vào Kitty. |
| **Vendor / Payee** | Bên nhận tiền (homestay, catering, cho thuê đồ). Định danh bằng email PayPal. |
| **Agent** | Một vai AI (Planner, Shopper, Collector, Treasurer) làm việc trong một Event. Mỗi agent có keypair riêng. |
| **Leash** | Quyền chi tiêu có giới hạn cấp cho một Agent, cắt ra từ Kitty (hoặc từ leash cha). |
| **Spend Intent** | Một yêu cầu hành động có rủi ro (payout, invoice, order, refund…) do agent gửi tới Gateway. |
| **Decision** | Kết quả policy engine: `ALLOW`, `DENY(reasons[])`, `STEP_UP`. |
| **Step-up** | Yêu cầu người (organizer) duyệt một intent vượt ngưỡng. |
| **Task** | Một việc trên timeline (Gantt). Có thể có **Payment Gate**. |
| **Payment Gate** | Điều kiện tiền để task được mở khoá (vd: Kitty ≥ $1.200; payout X đã settled). |
| **Budget Line** | Hạn mức ngân sách theo danh mục (lodging, food, transport, gear, merch, other). |

## 2. Personas

### Mai — Organizer (persona chính)
- 29 tuổi, HR lead ở startup 40 người, tổ chức offsite 2 lần/năm, ngân sách $3.000–6.000.
- **Đau:** ứng tiền cọc $1.000+ bằng thẻ cá nhân; đuổi theo 12 người để thu tiền; kế toán hỏi "tiền đi đâu"; mất 15+ giờ cho việc lặt vặt.
- **Muốn:** giao bớt việc cho AI nhưng **không dám đưa thẻ/tài khoản cho AI**.
- **Thành công khi:** không ứng đồng nào, biết chính xác tiền đi đâu, nhóm vẫn vui.

### Tuấn — Member
- 25 tuổi, kỹ sư. Ghét nhóm chat đòi tiền. Hay quên.
- **Muốn:** một link, trả xong, xong. Biết mình góp bao nhiêu và tiền dư được trả lại.

### Homestay Đà Lạt — Vendor
- Có tài khoản PayPal Business. Muốn tiền cọc đến đúng hạn, không phải nhắc.

### Dev — Builder (persona phụ, cho tầm nhìn platform)
- Đang build agent tự động mua hàng; cần "giao tiền cho agent mà không mất ngủ".
- **Muốn:** một MCP server với API rõ ràng, policy JSON, audit log.

## 3. User stories (MoSCoW)

### MUST (MVP — không cắt)
| ID | Story | Acceptance criteria |
|---|---|---|
| M1 | Là organizer, tôi tạo Event bằng một câu tự nhiên | Planner sinh: tên, ngày, số người, budget lines, ≥6 tasks có dependency, đề xuất mức góp/người. Organizer chỉnh được trước khi lưu. |
| M2 | Là organizer, tôi mời members và thu tiền vào Kitty | Mỗi member nhận 1 PayPal Invoice (sandbox). Trạng thái từng người hiển thị: draft/sent/paid/overdue. |
| M3 | Là member, tôi trả tiền 1 chạm | Trang `/pay/:requestId` có nút PayPal; sau khi trả, ledger cập nhật trong ≤10s (webhook) hoặc ≤60s (reconcile fallback). |
| M4 | Là organizer, tôi cấp Leash cho từng agent | Form + preset ("Shopper — $500, merch, 48h"). Không cấp quá số dư Kitty khả dụng. |
| M5 | Là agent, tôi chỉ hành động qua Gateway | Agent runtime không có PayPal secret (kiểm bằng test + env audit). Mọi intent có Decision + reason codes. |
| M6 | Là organizer, tôi duyệt step-up | Intent > `step_up_above` hiện ở Approval Inbox; Approve/Reject; hết hạn sau 15 phút. |
| M7 | Là organizer, tôi trả vendor từ Kitty | Treasurer tạo payout intent → (step-up nếu cần) → PayPal Payout → webhook → settled; task liên quan ✅. |
| M8 | Là organizer, tôi xem timeline có payment gate | Timeline (shadcn): task có gate hiển thị 🔒/🔓; gate tự mở khi điều kiện tiền đạt. Bryntum Gantt là nâng cấp Could ([ADR-024](20-risks-and-decisions.md)). |
| M9 | Là organizer, tôi xem dashboard ngân sách | AG Studio: thu/chi/còn lại, theo danh mục, theo member, theo leash; cập nhật realtime. |
| M10 | Là organizer, tôi thu hồi leash tức thì | Revoke → mọi intent sau đó DENY `LEASH_REVOKED`; số dư leash về Kitty; sub-leash bị revoke cascade. |
| M11 | Là bất kỳ ai, tôi xem audit timeline | Mỗi intent/decision/PayPal call/webhook hiển thị theo thời gian, có lý do. |
| M12 | Prompt injection demo | Trang sản phẩm độc hại trong demo; Shopper bị lừa; Gateway DENY; UI cảnh báo (banner đỏ) + nút Revoke. |
| M13 | Là organizer, tôi dùng **API key và model của riêng tôi** (BYOK) | Màn hình AI settings (S21): thêm key Anthropic hoặc một OpenAI-compatible endpoint; Test connection; chọn model default + theo vai; key chỉ hiện `last4`. App không cung cấp model. Chi tiết [24](24-byok-ai-models.md) |
| M14 | Là organizer chưa có key, tôi vẫn quản lý được tiền (**manual mode**) | Tạo event bằng form, gửi invoice, trả vendor, cấp/thu hồi leash đều chạy được; agents hiện trạng thái "off" + CTA thêm key |
| M15 | Là organizer/developer, tôi cho **một MCP client có sẵn** (Claude Desktop, Claude Code, Cursor) tiêu tiền trong một leash | `bunx leash-mcp init` sinh keypair trên máy; dán public key ở "Connect an external agent" → cấp leash; client list được `leash_*` tools; payout hợp lệ ALLOW, payee lạ DENY; private key không rời máy ([ADR-025](20-risks-and-decisions.md)) |

### SHOULD
| ID | Story |
|---|---|
| S1 | Shopper tìm sản phẩm qua **Channel3** và đề xuất giỏ hàng trong budget line |
| S2 | Collector nhắc nợ qua **PayPal Invoicing reminder** (`leash_send_reminder`, PayPal gửi email), giọng thân thiện, leo thang theo hạn |
| S3 | Hỏi dashboard bằng ngôn ngữ tự nhiên → **AG Studio Agent Framework** tạo widget |
| S4 | **Sub-leash** (delegation chỉ thu hẹp) giữa Planner → Shopper |
| S5 | **Settlement**: kết thúc Event → Treasurer tính dư → refund pro-rata cho members |
| S6 | ~~Upload báo giá vendor (PDF) → Elastic semantic search~~ — bỏ ([ADR-024](20-risks-and-decisions.md)) |
| S7 | Organizer tự nạp thêm vào Kitty qua **PayPal Checkout (Orders)** |
| S8 | BYOK thêm provider **OpenAI, Google, OpenRouter** (MVP bắt buộc có Anthropic + OpenAI-compatible) và biểu đồ usage |

### COULD
| ID | Story |
|---|---|
| C1 | ~~KERNEL browser agent đặt chỗ trên trang vendor demo~~ — bỏ ([ADR-024](20-risks-and-decisions.md)) |
| C2 | ~~Bryntum Scheduler "Leash timeline"~~ — bỏ khỏi hackathon |
| C3 | ~~Bryntum Calendar cho member~~ — bỏ khỏi hackathon |
| C4 | Pay Later messaging trên trang thanh toán member |
| C5 | ~~Astropods host Collector agent~~ — bỏ ([ADR-024](20-risks-and-decisions.md)) |
| C6 | Anomaly alert: phát hiện payee mới / tần suất bất thường từ `leash.audit_events` |
| C7 | **Bryntum Gantt** thay timeline payment gate (chỉ khi M4 xong sớm) |
| C8 | Remote Leash MCP với màn hình consent kiểu OAuth, nơi consent chính là form tạo leash (sau hackathon nếu không kịp — [ADR-025](20-risks-and-decisions.md)) |

### WON'T (hackathon)
- Production money transmission, KYC riêng, ví riêng.
- **Kitty cung cấp model AI** (gói trả phí tự cấp model là roadmap sau hackathon — [24](24-byok-ai-models.md) §9).
- PayPal multiparty / partner onboarding.
- Mobile native app, đa ngôn ngữ UI (UI tiếng Anh duy nhất).
- Thanh toán trực tiếp tại retailer thật qua Channel3 (Channel3 chỉ dùng cho discovery; mua tại vendor demo — xem §6).
- Thông báo Slack/Gmail qua Zapier, Elastic, KERNEL, Astropods, Postman collection ([ADR-024](20-risks-and-decisions.md)).

## 4. Luồng chính

### Flow 1 — Tạo Event (M1)
1. Organizer gõ: *"Team offsite in Da Lat, Dec 20–22, 12 people, budget $4,000, need homestay, a bus, BBQ dinner and matching hoodies."*
2. Planner trả về draft plan (structured output): budget lines, tasks + dependencies + gates, đề xuất góp **$334/người**.
3. Organizer chỉnh → **Create Event**. Hệ thống tạo Event, Kitty (balance 0), tasks, budget lines, 4 agents với keypair (chưa có leash).

### Flow 2 — Thu tiền (M2, M3)
1. Organizer bấm **Collect** (hoặc Collector đề xuất).
2. Collector agent dùng Gateway action `create_invoice` (inbound, vẫn qua leash của Collector: allowed_actions = `create_invoice`, `send_reminder`).
3. Gateway tạo + gửi 12 PayPal Invoices (sandbox).
4. Member mở link → trả bằng sandbox personal account.
5. Webhook `INVOICING.INVOICE.PAID` → ledger `member_contribution` → Kitty +$334 → event `kitty.funds_received` → SSE → dashboard + gate check.

### Flow 3 — Cấp Leash (M4)
1. Organizer mở **Leashes** → chọn agent Treasurer → preset "Vendor payments": allocation $2.500, payees = [homestay, bus, catering], per_tx_max $1.200, step_up_above $500, expires event end + 3 ngày.
2. Gateway kiểm `allocation ≤ kitty.available` → ledger `allocate` (kitty → leash) → leash `active`.

### Flow 4 — Trả vendor (M6, M7, M8)
1. Kitty đạt $1.200 → gate của task "Pay homestay deposit" mở.
2. Treasurer nhận event, gọi `leash.request_payout(homestay, 1200, memo, intent_id, task_id)`.
3. Gateway: verify chữ ký → policy → `STEP_UP` (vì > $500) → reserve $1.200 → approval tạo → badge + toast trong app cho Mai.
4. Mai Approve → Gateway gọi PayPal Payouts (idempotent) → `submitted`.
5. Webhook `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` → `settled` → task ✅ → timeline cập nhật các task phụ thuộc.

### Flow 5 — Shopper + injection (M12, S1, S4)
1. Planner tạo sub-leash cho Shopper: $500, category `merch`, payees = [`merch-shop@vendor.example`], 48h.
2. Shopper tìm "custom hoodie under $30" qua Channel3 → đề xuất 12 cái → tạo payout intent $336 cho merch-shop (demo vendor) → **ALLOW** thẳng (preset "Merch run": per_tx_max $400, step_up_above $400, nên $336 không cần duyệt).
3. Shopper mở trang sản phẩm "Hoodie Deals" (trang demo có prompt injection ẩn) → bị lừa → gọi payout $2.000 cho `refund-desk@scam.example`.
4. Gateway → `DENY [PAYEE_NOT_ALLOWED, AMOUNT_EXCEEDS_PER_TX, INSUFFICIENT_LEASH_BALANCE]`.
5. Gateway phát `leash.intent_denied` (severity high) → UI banner đỏ → Mai bấm **Revoke** → số dư leash về Kitty.

### Flow 6 — Settlement (S5)
1. Event kết thúc → Treasurer đề xuất settlement: tổng chi, dư $180, refund $15/người.
2. Step-up → Mai Approve → Gateway refund các capture/invoice payment tương ứng (pro-rata) → ledger `refund` → Event `settled`.

### Flow 7 — Agent bên ngoài qua MCP (M15)
1. Organizer mở **Leashes** → **Connect an external agent** → làm theo hướng dẫn: `bunx leash-mcp init` trên máy mình → dán public key.
2. Hệ thống đăng ký agent (public key) ở Gateway → organizer cấp leash (preset hoặc tuỳ chỉnh), ví dụ $100, payee = [`merch-shop@vendor.example`], 24h.
3. Organizer thêm snippet cấu hình vào Claude Desktop/Claude Code → client thấy `leash_status`, `leash_check`, `leash_request_payout`…
4. "Pay merch-shop $40 for stickers" → ALLOW → payout. "Pay refund-desk@scam.example $500" → **DENY** `PAYEE_NOT_ALLOWED` → Activity hiện agent "External: Claude Desktop" như mọi agent khác; Revoke dùng được ngay.

## 5. Màn hình (chi tiết UI ở [15-ui-ux.md](15-ui-ux.md); danh mục đầy đủ S01–S20 và luồng đi giữa các màn hình ở [23-user-screen-flow.md](23-user-screen-flow.md))

| Route | Màn hình | Ai dùng |
|---|---|---|
| `/` | Landing + "Sign in as demo organizer" | Tất cả |
| `/events` | Danh sách events | Organizer |
| `/events/new` | Chat tạo event với Planner | Organizer |
| `/events/:id` | **Overview**: Kitty balance, members, alerts, agents | Organizer |
| `/events/:id/plan` | **Timeline + payment gates** (shadcn; Bryntum Gantt nếu dư thời gian) | Organizer |
| `/events/:id/money` | **AG Studio dashboard** | Organizer |
| `/events/:id/leashes` | Danh sách leash, tạo/sub-leash/revoke, **Connect an external agent** (`leash-mcp`) | Organizer |
| `/events/:id/approvals` | Approval Inbox | Organizer |
| `/events/:id/activity` | Audit timeline | Organizer |
| `/events/:id/chat` | Chat với agents | Organizer |
| `/events/:id/people` | Members, vendors, verify vendor | Organizer |
| `/events/:id/settle` | Quyết toán & refund | Organizer |
| `/pay/:requestId` | Trang thanh toán member (public, không cần login) | Member |
| `/m/:memberToken` | Member portal: mình đã góp gì, lịch trình | Member |

## 6. Quyết định phạm vi quan trọng

**Q: Shopper "mua" ở đâu khi Channel3 trả về sản phẩm của retailer thật?**
A: Hackathon chạy sandbox, không thể checkout thật tại retailer. Channel3 dùng cho **discovery + giá thật + ảnh thật**. Việc "mua" thực hiện bằng payout tới **demo vendor** (sandbox Business account đóng vai cửa hàng merch). UI ghi rõ "Fulfilled by demo vendor (sandbox)". Trung thực, vẫn thể hiện agentic commerce.

**Q: Tại sao thu tiền bằng Invoicing thay vì Orders?**
A: Invoice gửi email từ PayPal, member trả không cần vào app, có due date + reminder sẵn, đúng mental model "góp quỹ". Orders (Checkout) dùng cho organizer nạp nhanh và cho trang `/pay` (fallback nếu invoice email sandbox không tiện khi demo).

**Q: Tại sao vendor được trả bằng Payouts?**
A: Mô hình "collect → payout" không cần partner onboarding; payee định danh bằng email PayPal (dễ allowlist); có webhook trạng thái; unclaimed payouts có thể hoàn lại (đường lui).

**Q: Có cần Collector có leash không, khi nó chỉ thu tiền vào?**
A: Có. "Non-coin actions" theo tinh thần Agent Pass: gửi invoice cho người lạ, spam reminder, hay gửi invoice số tiền sai cũng là hành vi có hại (phishing, uy tín). Leash của Collector: `allowed_actions=[create_invoice, send_reminder]`, `allowed_payers = members`, `per_tx_max` = mức góp, `max_tx_per_hour`.
