# 21 — Design Questions: tự hỏi & tự trả lời

> Mục đích: ép mọi quyết định phải trả lời được câu *"vấn đề là gì, giải quyết thế nào, vì sao cách này chứ không phải cách khác"*. Khi gặp một câu hỏi mới trong lúc build → thêm vào đây (hoặc ADR ở [20](20-risks-and-decisions.md)).

## A. Vấn đề & giá trị

**A1. Vấn đề gốc thật sự là gì — tiền nhóm hay an toàn agent?**
Cả hai, nhưng theo thứ bậc: *an toàn khi giao tiền cho agent* là vấn đề **mới và lớn** (Innovation, Tech); *tiền nhóm* là **bối cảnh cụ thể, dễ hiểu** để chứng minh nó (Design, Impact, Presentation). Một sản phẩm chỉ có hạ tầng sẽ khó demo; một app nhóm không có Leash thì chỉ là Splitwise + AI.

**A2. Tại sao người dùng không chỉ cần "AI gợi ý, tôi tự trả"?**
Vì phần tốn công nhất là *thực thi*: gửi 12 invoice, nhắc 30 lần, trả 5 vendor đúng hạn, refund lẻ. Gợi ý không giảm việc đó. Nhưng thực thi cần quyền tiêu tiền → cần Leash.

**A3. Tại sao không chỉ bắt người duyệt mọi giao dịch?**
Approval fatigue: duyệt 40 lần thì người ta bấm mù. Leash chuyển từ "duyệt từng việc" sang "duyệt **chính sách** một lần" + chỉ step-up ở ngoại lệ (số lớn, nghi trùng).

**A4. Nếu agent tốt thì có cần Leash không?**
Có. Agent tốt vẫn đọc nội dung độc (web, PDF), vẫn có bug retry, key vẫn có thể lộ. An toàn không được dựa vào việc model "ngoan". Thiết kế giả định *model sẽ bị lừa*.

**A5. Ai trả tiền cho Kitty (business model) — có cần nói không?**
Ngắn gọn trong "What's next": phí nhỏ trên kitty / gói cho công ty tổ chức offsite / Leash Gateway như API cho dev agent / **gói trả phí Kitty tự cấp model** (hiện tại BYOK). Không phải trọng tâm chấm.

**A6. Vì sao người dùng phải tự mang API key (BYOK)?**
Vì app không cung cấp model trong giai đoạn này: không phải gánh chi phí và billing, người dùng tự chọn model và nhà cung cấp mình tin. Quan trọng hơn, BYOK chứng minh luận điểm chính: **an toàn của tiền nằm ở Leash, không nằm ở model**. Đổi sang model yếu hơn thì agent có thể dễ bị lừa hơn, nhưng thiệt hại tối đa vẫn y nguyên. Xem [24](24-byok-ai-models.md).

**A7. Người không có API key thì sao?**
Vẫn dùng được toàn bộ phần tiền ở **manual mode**: organizer tự gửi invoice, tự bấm trả vendor, vẫn cấp và thu hồi leash. Agents chỉ bật khi có key. Judges và video dùng demo key có hạn mức.

**A8. Giữ API key của người dùng có biến Kitty thành mục tiêu tấn công không?**
Có, nên key được mã hoá kiểu envelope, chỉ service agents giải mã được, không bao giờ log, không bao giờ trả về trình duyệt, không bao giờ vào context của model. PayPal secret (ở gateway) và LLM keys (ở agents) nằm ở hai service khác nhau, nên lộ một bên không kéo theo bên kia.

## B. Concept Leash vs Sui Agent Pass

**B1. Vì sao lấy cảm hứng từ Sui Agent Pass thay vì tự nghĩ từ đầu?**
Vì nó đã đóng khung đúng vấn đề ("cho agent tự hành động mà không mất an toàn") bằng một mô hình dễ hiểu: *pass có giới hạn + bounded loss + thu hồi được*. Nhưng nó gắn với ví crypto và blockchain. Cơ hội của Kitty là mang mô hình đó tới nơi đa số người dùng và merchant đang ở — PayPal — và thêm thứ blockchain không có: đảo ngược được (refund, dispute) và người nhận đã KYC.

**B2. Không có blockchain, "bounded loss" có phải nói quá không?**
Nếu chỉ có Gateway kiểm limit thì đúng là "bounded *nếu Gateway đúng*". Ta thêm **prefunding**: agent chỉ tiêu được tiền đã được tách vào leash; Gateway có bug cũng không tạo ra tiền mà ledger không cấp. Và payee allowlist khiến tiền không chảy về kẻ gian. Ta nói thẳng giới hạn còn lại (Gateway bị chiếm) — trung thực ghi điểm hơn là phóng đại.

**B3. Sao không dùng luôn ví crypto/stablecoin của PayPal (PYUSD) để có on-chain enforcement?**
Mất lợi thế "người dùng phổ thông không cần ví", tăng độ phức tạp, và sandbox/hackathon tập trung vào PayPal developer platform truyền thống. Có thể nêu như hướng mở rộng.

**B4. "Non-coin assets" của Sui tương đương gì ở đây?**
Những hành động có hậu quả nhưng không phải chuyển tiền trực tiếp: gửi invoice (có thể dùng để phishing), gửi reminder (spam/uy tín), đặt chỗ qua browser (cam kết với vendor), tạo sub-leash. Tất cả đi qua cùng policy engine với `amount=0`.

**B5. Tại sao cần delegation?**
Thực tế agent chia việc: Planner giao Shopper mua đồ. Nếu Shopper dùng chung leash của Planner thì bị injection là mất cả leash lớn. Sub-leash hẹp = blast radius nhỏ. "Chỉ thu hẹp" đảm bảo delegation không bao giờ là đường leo thang quyền.

## C. Kỹ thuật PayPal

**C1. Tiền thật nằm ở đâu?**
Trong tài khoản PayPal Business của platform (sandbox). Ledger chia nó thành các bucket (kitty, leash available/held). Đây là mô hình "collect → payout" phổ biến cho nền tảng nhỏ — production cần cấu trúc pháp lý phù hợp (ghi chú R10).

**C2. Tại sao không để mỗi member trả thẳng cho vendor?**
Mất quỹ chung (không có leash để cắt), vendor phải nhận 12 khoản lẻ, organizer không kiểm soát được, và không có refund pro-rata. Kitty pool là thứ làm Leash có ý nghĩa.

**C3. Làm sao chắc không trả 2 lần?**
Ba lớp idempotency: `intentId` (agent → gateway), `PayPal-Request-Id`/`sender_batch_id` (gateway → PayPal), `webhook_events.id` (PayPal → gateway). Cộng reservation trong transaction có row lock.

**C4. Nếu webhook không bao giờ đến?**
Reconcile sweep poll PayPal cho intents `submitted` quá 5 phút; nút "Sync now" trong UI.

**C5. Payout bị UNCLAIMED (vendor chưa có tài khoản PayPal)?**
Intent giữ `submitted`, UI cảnh báo; organizer có thể cancel unclaimed item → release về leash. Trong demo mọi vendor là sandbox account đã tồn tại.

**C6. Vì sao vendor phải được "verify" trước khi vào allowlist?**
Để agent (có thể bị lừa) không thể tự thêm người nhận. Chỉ organizer xác nhận vendor (UI) — đây là điểm "người giữ quyền cuối".

## D. Agents

**D1. Có nên cho agent đọc web tuỳ ý không?**
Có, vì đó là thực tế của agentic commerce — và là cách tốt nhất để *chứng minh* Leash. Nội dung web được bọc `<untrusted_content>`, nhưng ta **không dựa** vào điều đó.

**D2. Tại sao không dùng framework multi-agent?**
27 ngày, cần debug nhanh, cần giải thích được. Một tool-use loop + vai là đủ; mỗi vai một leash là "multi-agent" đúng nghĩa về quyền hạn.

**D3. Agent biết số dư bằng cách nào?**
Gọi `leash_status`. Không bao giờ tự tính, không tin số trong lịch sử chat.

**D4. LLM có thấy email members không?**
Không cần. Agent làm việc với `memberId`; Gateway tra email khi tạo invoice. Giảm PII gửi tới LLM và chặn việc agent bị lừa gửi invoice tới email lạ.

**D5. Làm sao demo ổn định khi LLM không deterministic?**
Prompt cố định trong video, temperature thấp, seed dữ liệu, cache plan, và các bước tiền tệ do code quyết. Quay nhiều take.

## E. Sản phẩm & UX

**E1. Member có cần tài khoản Kitty không?**
Không. Link `/pay/:requestId` và portal `/m/:token`. Giảm ma sát = tỉ lệ góp cao hơn.

**E2. "Max possible loss" có làm người dùng sợ không?**
Ngược lại: biến rủi ro mơ hồ thành con số nhỏ, cụ thể, kiểm soát được. Đây là tính năng "an tâm".

**E3. Organizer không hiểu policy JSON thì sao?**
Presets + câu "Explain this leash" bằng ngôn ngữ thường; JSON chỉ hiện ở chế độ nâng cao.

**E4. Vì sao Gantt chứ không phải checklist?**
Tiền có *thời điểm* (cọc trước X ngày) và *phụ thuộc* (chưa đủ tiền thì chưa đặt xe). Timeline với payment gate thể hiện điều đó trực quan. Bản hackathon vẽ bằng component shadcn của mình; Bryntum Gantt chỉ là nâng cấp nếu dư thời gian ([ADR-026](20-risks-and-decisions.md)).

## F. Hackathon & chiến lược

**F1. Nhắm giải nào và vì sao?**
Grand Prize / Agentic Commerce + AG Grid. Xem [17](17-goals-and-success-metrics.md). Mọi tính năng phải phục vụ ít nhất một tiêu chí chấm; nếu không → cut list.

**F2. Judges có thể không chạy app — vậy cái gì phải tự đứng được?**
Video + text description + screenshots. Ba "aha" phải thấy được trong video mà không cần đọc code.

**F3. Rules nói có thể chấm bằng AI — ảnh hưởng gì?**
README có cấu trúc rõ (headings chuẩn: What / Why / How / Architecture / PayPal APIs used / Tools / Setup / Security / Limits), câu ngắn, bảng — dễ cho cả người lẫn máy.

**F4. Nếu chỉ còn 1 tuần và mọi thứ trễ thì sao?**
Có M2 (28/10): money loop + leash + step-up + revoke là đủ một bài nộp mạnh về Tech/Innovation. Thêm injection demo (1 ngày) là đủ "aha". Sponsors là phần thưởng thêm.

**F5. Có đang "khai khống" sponsor không?**
Quy tắc: chỉ liệt kê tool thực sự được gọi trong code chạy trên demo. Tool dùng lúc dev (APIMatic Context Plugin, PayPal AI-Toolkit plugin) ghi rõ là dev tooling. "PayPal Agent Toolkit" chỉ ghi khi gateway thật sự gọi nó (ADR-007).

**F6. Vì sao cắt Zapier, Elastic, KERNEL, Astropods, Postman?**
Không cái nào có giải sponsor, và luật chỉ cho thắng 1 giải sponsor. Mỗi tích hợp phụ là ngày công lấy từ đường găng (tiền vào, agents, web) — trong khi Design chấm *sự mạch lạc*, không chấm số logo. Chi tiết [ADR-026](20-risks-and-decisions.md).

**F7. Vì sao làm `leash-mcp` thay vì OAuth cho remote MCP?**
Luận điểm Impact "bất kỳ agent nào cũng dùng được Leash" cần bằng chứng chạy được, và rẻ nhất là một bridge stdio dùng lại `createSignedFetch` có sẵn. OAuth cho remote MCP đẹp hơn (consent screen = form tạo leash) nhưng bearer token đi ngược ADR-004 và tốn thời gian → để sau hackathon. Chi tiết [ADR-027](20-risks-and-decisions.md).

## G. Bảo mật nâng cao

**G1. Nếu kẻ tấn công điều khiển agent và cố "probe" policy bằng leash_check?**
`leash_check` có rate limit và ghi audit; probing detector đếm DENY liên tiếp; policy không bí mật (organizer đặt) nên lộ policy không tạo lỗ hổng — chặn bằng logic, không bằng che giấu.

**G2. Agent có thể dùng sai `taskId`/`memo` để đánh lừa organizer khi step-up?**
Approval UI hiển thị dữ liệu **từ hệ thống** (payee verified, amount, leash) nổi bật; `justification`/`memo` của agent hiển thị nhỏ và gắn nhãn "agent's claim — unverified".

**G3. Organizer bị chiếm session?**
Ngoài phạm vi Leash (đó là bảo mật tài khoản người dùng). Giảm thiểu: session ngắn, re-auth khi tạo leash lớn (Could).

**G4. Agent bên ngoài (Claude Desktop qua `leash-mcp`) có nguy hiểm hơn agent của Kitty không?**
Không hơn: cùng bộ `leash_*` tools, cùng leash, cùng policy thuần ở Gateway; private key nằm ở máy người dùng và Kitty không bao giờ thấy. Khác biệt duy nhất là Kitty không kiểm soát prompt/model của client — đúng giả định thiết kế "LLM sẽ bị lừa", nên bounded loss vẫn giữ nguyên (T25, T26 ở [14](14-security-threat-model.md)).
