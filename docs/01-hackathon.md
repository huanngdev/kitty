# 01 — Thông tin Hackathon

> Nguồn: crawl https://paypalaihackathon.devpost.com/ (trang chính, `/rules`, `/resources`, `/details/dates`, `/updates`, `/details/faqs`, và 10 trang sponsor) ngày **2026-10-16**; kiểm lại ngày **2026-10-17** (rules, giải, judging, deadline không đổi; Updates mới có 3 bài, không đổi luật).
> Nếu có mâu thuẫn giữa tài liệu này và Official Rules → **Official Rules thắng**. Kiểm tra lại trang Updates mỗi tuần.

## 1. Tổng quan

| Mục             | Giá trị                                                        |
| --------------- | -------------------------------------------------------------- |
| Tên             | **PayPal AI Hackathon — Build what's next with PayPal and AI** |
| Sponsor         | PayPal Inc. (2211 North First Street, San Jose, CA 95131)      |
| Administrator   | Devpost, Inc.                                                  |
| Hình thức       | Online, public, toàn cầu                                       |
| Participants    | ~15.972 (tại 17/10/2026)                                       |
| Tổng giải       | **$67.500 tiền mặt** + $2.250 Render credits = **$69.750**     |
| Tracks          | **Không có track, không có đề bài cố định**                    |
| Yêu cầu cốt lõi | Project phải **dùng thực chất cả PayPal và AI**. **Không bắt buộc** dùng PayPal Agent Toolkit hay PayPal MCP server; sponsor tools là tuỳ chọn "miễn PayPal là trung tâm" |
| Tags            | Low/No Code · Machine Learning/AI · Web                        |
| Liên hệ         | PayPal Discord: https://discord.gg/sJ2G6DyvSK                  |

## 2. Mốc thời gian (Pacific Time)

| Giai đoạn         | Bắt đầu                                                        | Kết thúc                       | Giờ Việt Nam (ICT, UTC+7)                |
| ----------------- | -------------------------------------------------------------- | ------------------------------ | ---------------------------------------- |
| **Submission**    | Thu 01/10/2026 9:15am PDT                                      | **Thu 12/11/2026 12:00pm PST** | Hạn chót ≈ **03:00 sáng Fri 13/11/2026** |
| Judging           | Tue 01/12/2026 2:00pm PST                                      | Tue 15/12/2026 8:00am PST      |                                          |
| Winners announced | ~Mon 21/12/2026 (Rules: 2:00pm PT; trang Schedule: 9:00am PST) |                                |                                          |

**Hạn nội bộ của Kitty: nộp bài trước 23:59 ICT Wed 11/11/2026** (sớm hơn ~27 giờ). Xem [16-roadmap.md](16-roadmap.md).

Sau khi hết Submission Period **không được sửa submission** (chỉ được sửa portfolio Devpost). Trước đó có thể lưu draft.

## 3. Điều kiện tham gia (Rules §3)

**Được tham gia:**
- Cá nhân đã đủ tuổi trưởng thành nơi cư trú.
- Team (không giới hạn số người — FAQ xác nhận), phải cử 1 **Representative** nộp bài.
- Tổ chức (công ty, nonprofit…) đã thành lập.
- Một người có thể ở nhiều team và vẫn nộp cá nhân.

**Không được tham gia:**
- Cư dân Brazil, Quebec, Nga, Crimea, Cuba, Iran, Triều Tiên, các nước bị OFAC cấm vận toàn diện.
- Nhân viên/agent/người nhà của PayPal, Devpost, các đơn vị liên quan; Judges và công ty thuê Judge.
- **Việt Nam KHÔNG nằm trong danh sách loại trừ.**

Ghi chú FAQ: nếu không tạo được PayPal account ở nước mình → hỏi Discord. Mở được account PayPal ≠ điều kiện tham gia.

## 4. Yêu cầu Project (Rules §4)

- Build **mới** hoặc **update đáng kể** một app tích hợp **PayPal developer platform (free sandbox)** + **một AI tool/model/platform bất kỳ**.
  - "PayPal" bao gồm: Venmo, Braintree, Xoom, Honey, Zettle, Paidy, Hyperwallet, Simility, Swift Financial…
- Project phải:
  1. Tích hợp thực chất ≥1 công nghệ PayPal (API, SDK, product, capability).
  2. Đưa AI vào trải nghiệm/chức năng một cách thực chất.
  3. Có prototype/PoC **chạy được**.
  4. Đủ tài liệu để judges hiểu và đánh giá.
- **Functionality:** cài được và chạy ổn định trên platform dự định; hoạt động như video/mô tả.
- **Project cũ:** phải được update đáng kể sau 01/10/2026, và phải giải thích đã update gì. (Kitty là project mới → không vướng.)
- **Third-party:** phải được phép dùng SDK/API/data theo license của bên đó.
- **Nhiều submission:** được, nhưng mỗi cái phải khác biệt đáng kể.
- **Financial/preferential support:** project không được phát triển với tiền/hợp đồng/license từ PayPal hoặc Devpost.

## 5. Yêu cầu Submission

| # | Yêu cầu | Kitty đáp ứng bằng |
|---|---|---|
| 1 | Project dùng đúng dev tools | Leash Gateway + PayPal sandbox + Claude |
| 2 | **Text description** về features & functionality | Viết sẵn trong [19-demo-and-submission.md](19-demo-and-submission.md) |
| 3 | **Functional demo**: hướng dẫn setup/run đầy đủ trong repo **hoặc** URL demo hosted. Mockup/static/non-functional **không hợp lệ** | Cả hai: Render URL + `README.md` + `render.yaml` |
| 4 | **Tools**: liệt kê model/AI service đã dùng và cách dùng | Mục "Built With" + "How we used each tool" |
| 5 | **Public repo** GitHub/GitLab/Bitbucket, đủ source/assets/instructions, **open source license hiển thị ở About** | GitHub public, `LICENSE` MIT |
| 6 | **Demo video < 3 phút**, quay project chạy thật, upload **YouTube public**, không dùng nhạc/tài liệu có bản quyền | Kịch bản trong [19-demo-and-submission.md](19-demo-and-submission.md) |
| 7 | **Testing access**: nếu cần login → cung cấp credentials; miễn phí, không giới hạn cho judges đến hết Judging Period | Tài khoản demo + sandbox buyer accounts trong README |
| 8 | **Tiếng Anh** (hoặc kèm bản dịch) | Toàn bộ README, video, mô tả bằng tiếng Anh |

Judges **không bắt buộc** test project — có thể chấm chỉ dựa trên text, ảnh, video. ⇒ **Video và mô tả phải tự đứng được.**

## 6. Giải thưởng (Rules §8)

### Grand Prizes
| Giải | Tiền |
|---|---|
| 1st Place | $12.000 |
| 2nd Place | $8.000 |
| 3rd Place | $5.000 |

### Honorable Mentions ($5.000 mỗi giải, 1 winner)
- Most Creative
- Most Impactful
- Best Demo Delivery
- Best Use of PayPal + AI
- **Best Use of Agentic Commerce** ← khớp nhất với Kitty

### Sponsor Prizes
| Giải | Phần thưởng | Số winner | Điều kiện |
|---|---|---|---|
| Best Use of AG Grid — 1st | $5.000 | 1 | Dùng bất kỳ tool AG Grid; trang giải nhấn **polish** + **Studio Agent Framework** (https://paypalaihackathon.devpost.com/details/aggrid) |
| Best Use of AG Grid — 2nd | $2.000 | 1 | |
| Best Use of AG Grid — 3rd | $1.000 | 3 | |
| Best Use of APIMatic | $1.000 + 6 tháng APIMatic Business | 3 | Dùng tool APIMatic |
| Best Use of Bryntum | $1.000 | 3 | Dùng tool Bryntum; gợi ý "an agent that drives the schedule itself" (https://paypalaihackathon.devpost.com/details/bryntum) |
| Best Use of Channel3 | $1.500 | 1 | Gọi Channel3 API/MCP thực chất — chỉ nhắc tên mà không gọi thì **không đủ điều kiện** (https://paypalaihackathon.devpost.com/details/channel3) |
| Best Use of Render — 1st/2nd/3rd | $1.000 / $750 / $500 Render credits | 1 mỗi hạng | Dùng tool Render |

**Không có giải sponsor** cho Zapier, Postman, Elastic, KERNEL, Astropods (kiểm 17/10) — họ chỉ cung cấp tool/credits. Không sponsor nào có yêu cầu riêng về MCP. Chiến lược sponsor của Kitty: [13-sponsor-integrations.md](13-sponsor-integrations.md), [ADR-026](20-risks-and-decisions.md).

### ⚠️ Luật cộng dồn giải
> Một project chỉ thắng tối đa **1 Grand Prize + 1 Sponsor Prize** HOẶC **1 Honorable Mention + 1 Sponsor Prize**.

Hệ quả cho chiến lược: tích hợp nhiều sponsor chỉ **tăng số giải được xét**, không tăng tổng tiền tối đa. Xem [17-goals-and-success-metrics.md](17-goals-and-success-metrics.md).

### Nhận giải
- Phải hoàn tất affidavit/forms trong **10 ngày làm việc** (người ngoài Mỹ: **W-8BEN**).
- Tiền gửi cho Representative; team tự chia.
- Winner tự chịu thuế, phí chuyển tiền, phí đổi ngoại tệ. Giao giải trong 60 ngày sau khi nhận forms.

## 7. Judging (Rules §6)

- **Stage 1 — Pass/Fail:** project có hợp chủ đề và có áp dụng hợp lý PayPal API/SDK không.
- **Stage 2 — 5 tiêu chí trọng số bằng nhau:**

| Tiêu chí | Câu hỏi của judges |
|---|---|
| **Technological Implementation** | Dùng PayPal Developer Platform + AI có kỹ lưỡng, khéo léo không? Có nỗ lực thật, implement chạy được, không tầm thường? |
| **Design** | Có trải nghiệm sản phẩm hoàn chỉnh, mạch lạc — không chỉ là PoC kỹ thuật? |
| **Potential Impact** | Có lập luận cụ thể, đáng tin về việc giải quyết vấn đề thật cho đối tượng thật? Giải pháp demo có thật sự giải quyết vấn đề đó? |
| **Innovation/Idea** | Concept sáng tạo, mới, khác biệt với cái đã có? |
| **Presentation** | Video có demo end-to-end? Pitch nói rõ vấn đề, cho ai, vì sao quan trọng? Dễ theo dõi? |

- **Tie-break:** so lần lượt theo thứ tự tiêu chí trên (Tech → Design → Impact → Innovation → Presentation), cuối cùng judges vote.
- Rules cho phép dùng **expert panels, peer review, automated AI-driven analysis** → README và description phải rõ ràng, có cấu trúc, dễ cho cả người lẫn máy đọc.

### Judges (công bố trên trang)
| Tên | Vai trò |
|---|---|
| Jo Franchetti | Developer Advocate — PayPal |
| Eddie Jaoude | Developer Advocate — PayPal |
| Marco Podien | Developer Advocate — PayPal |
| Karthik Ravi | Software Engineer — PayPal |
| Himraj Singh | Engineering Manager — PayPal |
| Nathaniel Olson | Senior Product Manager — PayPal |
| Sylwia Vargas | Sr. Technical Community Manager — AG Grid |
| Ameer Hassan | Co-Founder — APIMatic |
| Mats Bryntse | CEO — Bryntum |
| Ignacio Valdez Bicard | Founding Engineer — Channel3 |
| Carly Richmond | Sr. Manager, Developer Advocacy — Elastic |
| Pooja Mistry | Sr. Developer Advocate — Postman |
| Shifra Williams | Founding DevRel Engineer — Render |

## 8. Sponsor tools (tóm tắt — chi tiết tích hợp ở [13-sponsor-integrations.md](13-sponsor-integrations.md))

| Sponsor | Là gì | Free access | Có giải? | Kitty dùng? (ADR-026) |
|---|---|---|---|---|
| AG Grid (AG Studio) | Embedded analytics: dashboards + charts + grids, Studio Agent Framework | Trial 45 ngày; boilerplate PayPal: https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate | ✅ | **Tier 1 — nhắm giải** |
| APIMatic | Context Plugins cho AI coding agents (PayPal đã bật sẵn) | 1 tháng Basic (form), winners 6 tháng Business | ✅ | Dev tooling |
| Astropods | Agent OS: deploy/monitor agents | Free tier | ❌ | Bỏ |
| Bryntum | Gantt, Scheduler, Calendar components | Trial 45 ngày (`@bryntum/scheduler@npm:@bryntum/scheduler-trial`) | ✅ | Could |
| Channel3 | API sản phẩm 100M+ items / 25k+ retailers, có MCP | 20.000 credits, promo `PAYPAL-HACKATHON-2026` | ✅ | Should (Shopper) |
| Elastic | Elasticsearch, vector/hybrid search, Agent Builder, Jina embeddings | Trial 14 ngày (+30 ngày tự gia hạn) tại https://ela.st/elastic-paypal-hackathon | ❌ | Bỏ |
| KERNEL | Cloud browsers cho AI agents | $50 credits | ❌ | Bỏ |
| Postman | API platform; PayPal collection | Free | ❌ | Bỏ |
| Render | Cloud hosting + Render Workflows | $50 credits | ✅ (credits) | Hosting |
| Zapier | Zapier MCP: 9.000+ apps | 14 ngày Professional trial | ❌ | Bỏ |

## 9. Tài nguyên PayPal chính thức

- Developer docs: https://developer.paypal.com
- REST API: https://developer.paypal.com/api/rest/
- JS SDK v6: https://developer.paypal.com/sdk/js/
- Dashboard: https://developer.paypal.com/dashboard/
- Sandbox starter: https://github.com/paypaldev/getting-started-with-paypal-sandbox
- Payouts: https://developer.paypal.com/docs/payouts/
- Invoicing: https://developer.paypal.com/invoicing/about
- Webhooks: https://developer.paypal.com/api/webhooks/overview
- Pay Later: https://developer.paypal.com/pay-later/overview
- Postman: https://www.postman.com/paypal

### 9.1 Công cụ AI của PayPal (kiểm 17/10)

> ⚠️ Link `docs.paypal.ai/...` trên trang Resources của Devpost **đã redirect sang 404**. Dùng link `developer.paypal.com/ai-tools/...` bên dưới.

| Công cụ | Là gì | Link |
|---|---|---|
| **PayPal AI-Toolkit** | Plugin cho **coding assistant** (Claude Code, Codex, Cursor), nối vào PayPal MCP sandbox qua SSE. Dùng lúc **build**, không phải runtime | https://github.com/paypal/AI-Toolkit |
| **`@paypal/agent-toolkit`** | Thư viện **runtime** cho agent (v1.11, 09/2026). Tools: Invoices, Orders/Refunds, Disputes, Shipment, Catalog, Subscriptions, Reporting — **không có Payouts** | https://github.com/paypal/agent-toolkit · https://developer.paypal.com/ai-tools/agent-tools/ |
| **PayPal MCP server** | Remote: `mcp.sandbox.paypal.com` (`/sse` hoặc `/http`), auth bằng bearer từ client credentials hoặc đăng nhập PayPal. Local: `@paypal/mcp`. Remote có thêm `search_product`, `create_cart`, `checkout_cart` (header `x-feature-flags: commerce:true`, hiện chỉ gift card) | https://developer.paypal.com/ai-tools/mcp-server |
| Agent Ready / Agentic Commerce Services | ACP (ChatGPT, qua Braintree delegated tokens), UCP (Google AI Mode/Gemini); Store Sync. Cần onboarding merchant qua form — **chưa thấy quyền truy cập sandbox** | https://developer.paypal.com/agent-ready/overview |

Kitty dùng các công cụ này thế nào (và vì sao agent **không bao giờ** cầm chúng): [11-paypal-integration.md](11-paypal-integration.md) §7, [ADR-007](20-risks-and-decisions.md).

### Webinars
| Ngày | Chủ đề | Link |
|---|---|---|
| 6/10 | Start building with PayPal | https://www.youtube.com/watch?v=FFJfCW9z3Do |
| 7/10 | APIMatic Context Plugins | https://youtu.be/zRWixN68tDg |
| 12/10 | Build a payments dashboard without building a dashboard (AG Grid) | Teams event (đã qua) |
| 13/10 | Start building with PayPal (APAC) | Teams event (đã qua) |

## 10. Inspiration chính thức (khớp với Kitty)

Trang Resources gợi ý 5 nhóm. Kitty chạm vào 4:
- **AI Agents or Automation:** "agents that use PayPal to take action — not just recommend, but actually transact… two agents negotiating and settling a payment (agent-to-agent commerce)". → Leash + Treasurer/Shopper agents.
- **Money Movement Experiences:** "splitting a group dinner bill automatically", "payout tool… pays out the moment a task is approved". → Kitty pool + payment-gated tasks.
- **Consumer Experiences:** "a 'request money' experience embedded in a chat app". → Collector agent (PayPal invoice + reminder).
- **Social Impact:** "neighbors pool money for a shared community… project". → Kitty là đúng quỹ chung của một nhóm.

## 11. Những điều KHÔNG được làm (dễ bị loại)

- ❌ Nộp mockup/video giả lập không chạy thật.
- ❌ Repo private, thiếu LICENSE, hoặc LICENSE không hiện ở About.
- ❌ Video > 3 phút (judges ngừng xem), video unlisted/private, nhạc có bản quyền.
- ❌ Dùng logo/brand bên thứ ba trong video mà không được phép (dùng logo sponsor hợp lệ ở mức "built with"; tránh lạm dụng).
- ❌ Gửi project mà judges không chạy được và không có credentials.
- ❌ Đặt tên sản phẩm chứa "PayPal" như thể sản phẩm chính thức của PayPal.
