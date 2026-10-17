# PROGRESS — Nhật ký đã làm

> Mới nhất trước. Việc theo mốc: [MILESTONES.md](MILESTONES.md). Kế hoạch: [docs/16-roadmap.md](docs/16-roadmap.md). Quyết định: [docs/20-risks-and-decisions.md](docs/20-risks-and-decisions.md).
> Cách ghi: mỗi mục là một việc/PR đã merge, kèm **bằng chứng** ngắn (số migration, kết quả chạy thật, test).

## Hiện trạng (cập nhật 17/10/2026)

### Chạy được hôm nay

- **Gateway — vòng tiền ra thật trên PayPal sandbox:** Admin API `/v1` (kitties, agents, leashes, payees, audit) → reserve → execute Payout (idempotent theo `intentId`) → webhook payout verify + dedupe + reconcile. `reconcile` đã settle **một payout sandbox thật** (PR #17).
- **MCP server 5 tool** (ký Ed25519, agent không thấy credential PayPal): `leash_status`, `leash_check`, `leash_request_payout`, `leash_intent_status`, `leash_activity` (PR #16) — payout MCP ký live OK.
- **Web — auth + shell:** `/sign-in`, `/sign-up`, tài khoản demo, `(app)` layout + sidebar, theme light/dark (PR #14, đã qua UI reset PR #19 và UI-QA PR #22).
- **API:** Better Auth (bảng `app.user`/`session`/`account`/`verification` + `is_demo`), demo login, modules events/members/vendors/budget lines + tạo kitty (PR #15).
- **Nền tảng lõi:** `packages/leash` (policy thuần, 100% branch coverage), `packages/ledger` (cents/bigint), `packages/signing`, `packages/paypal`, `packages/db` (schema `leash` + `app`); CI + 647 test pass.

### Đang chặn

- **Chưa có đường tiền vào (R16):** không có `leash_create_invoice` + webhook `INVOICING.INVOICE.PAID` → ledger, nên Kitty không tăng được. Đây là việc ưu tiên số 1 (KIT-58).
- **Chưa deploy:** chưa có `render.yaml`/Dockerfiles, web/api/gateway chưa chạy trên Render + Neon, webhook PayPal chưa trỏ về gateway đã deploy (KIT-8).
- **Chưa có approvals** (approve/reject + hết hạn hold) và 4 tool MCP còn thiếu — KIT-57, KIT-59, KIT-60.

### 3 việc kế tiếp

1. **KIT-8** — Render Blueprint + deploy web/api/gateway + `sandbox:check` trên URL đã deploy (mở khoá M0).
2. **KIT-58** — Tiền vào: `leash_create_invoice` + webhook `INVOICING.INVOICE.PAID` → ledger `member_contribution` (R16, ưu tiên số 1).
3. **KIT-57** — Approvals: approve/reject + hết hạn 15' → release hold.

### Open questions (chủ: owner — Huấn)

| # | Câu hỏi | Chủ/Hạn |
|---|---|---|
| Q12 | Payout `RETURNED`/`REFUNDED` đến **sau khi** intent đã `settled`: xử lý bằng bút toán bù hay chỉnh tay ở trang settling? | owner + ADR · 01/11 |
| Q13 | Kitty mồ côi khi `apps/api` ghi `kitty_id` lỗi: thêm `DELETE /v1/kitties/:id` hay reconcile sweep? | owner · 25/10 |
| Q14 | `leash-mcp` phát hành thế nào: publish npm hay chạy từ repo (`bunx github:…`)? | owner · 30/10 |
| Q15 | Remote PayPal MCP có tool commerce chạy được trong sandbox không (Shopper dùng qua leash)? | owner · 25/10 |

## 18/10/2026

- **KIT-64 — Auth end-to-end (PR đang mở, chờ owner review):** email/password (min 8, max 128, auto sign-in, reset 1 h revoke session khác, verify 24 h), **"Continue with GitHub"** và **"Continue with PayPal"** qua `socialProviders` có sẵn của Better Auth 1.7 — provider chỉ đăng ký khi đủ env, UI render theo `GET /api/auth-config`. Thêm trang `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/error`, banner verify email, và **Settings → Account** (profile, email + badge, đổi mật khẩu, link/unlink provider — chặn unlink method cuối, sessions + revoke, delete account type-to-confirm).
- **Bảo mật/bất biến:** ADR-028 tách **REST app "Log in with PayPal"** khỏi app tiền — `PAYPAL_LOGIN_*` chỉ ở `apps/api`, `PAYPAL_CLIENT_SECRET` vẫn chỉ ở `apps/gateway`; `check:env-isolation` thêm luật + self-test hai chiều sai. ADR-029 chốt verification theo môi trường, implicit link **chỉ khi provider email verified** (`validateUserInfo`), middleware `requireSession` → `requireVerifiedEmail` → `requireEventOrganizer` (404 cho cả event của người khác), rate limit `storage: "database"` 5/phút cho sign-in/sign-up/forgot, cookie prefix `kitty` + `freshAge` 1 ngày, demo read-only.
- **Migration:** `0009_previous_nightshade.sql` — bảng `app.rate_limit` (đã apply lên Neon dev).
- **QC sau review (18/10):** demo account chặn thêm `link-social`, `revoke-session(s)`, `revoke-other-sessions`, `set-password` (judge dùng chung tài khoản nên không ai gắn provider của mình hay đá judge khác ra); reset cho email demo trả generic success mà không gửi mail; production không có mailer → `passwordReset: false`, endpoint reset im lặng, UI ẩn "Forgot password?" và `/forgot-password` báo "not available"; `ConsoleMailer` chỉ in link khi dev, còn lại log `to` đã mask + subject. Test: guard matrix unit 3 file mới/ mở rộng (49 shared, 119 api), integration demo guard 13/13.
- **Test:** `bun run ci` xanh; `apps/api` integration trên Neon dev (sign-up → link verify từ ConsoleMailer → verify → sign-in → đổi mật khẩu (session cũ chết) → reset → lượt sign-in thứ 6 bị 429); OAuth integration chạy callback Better Auth qua `oauth2-mock-server` (new user / auto-link khi verified / **không** link khi provider chưa verify / error redirect); Playwright `apps/web/test/e2e/auth.e2e.ts` chạy full journey trên port phụ (3100/8887) — 0 console error, open-redirect `?next=//evil.example` phải về `/events`.

## 17/10/2026

- **PR #25** — Logo owner thật (branch `feat/brand-logo`): hai SVG `apps/web/public/brand/kitty-logo-light.svg` (thân đen/chi tiết trắng) + `kitty-logo-dark.svg` (thân trắng/chi tiết đen), crop **zero padding** bằng viewBox đúng hộp bao hình học `300 17.536248 300 282.463752` (getBBox khớp < 0.0001, 4 cạnh 600px/32px đều có pixel mực); `<Logo />` giữ API cũ thêm `theme: "auto"|"light"|"dark"` + `priority` (auto render cả hai ảnh, CSS `dark:hidden`/`hidden dark:block` — không lệch hydration), size theo chiều cao; favicon `apps/web/src/app/icon.svg` theo `prefers-color-scheme` (bỏ `favicon.ico`); e2e UI-QA assert đúng 1 mark hiển thị và đúng file theo theme trên `/`, `/sign-in`, `/events`.
- **PR #21 re-plan (Le Quoc Uy, @UyLeQuoc) — landed on main qua PR này:** thu hẹp sponsor theo luật cộng dồn giải (ADR-026: chỉ AG Grid nhắm giải; bỏ Zapier/Elastic/KERNEL/Astropods/Postman; Bryntum → Could), thêm `packages/leash-mcp` bridge stdio (ADR-027), và re-plan roadmap 17/10→12/11 (tiền vào + approvals lên trước, agents + MCP sau). Landed **với nguyên commit của Uy**; ADR-024/025 của Uy đổi thành **ADR-026/027** vì main đã dùng hai số đó cho việc UI reset và session validation.
- **Bỏ Linear khỏi repo:** xoá block Linear trong [AGENTS.md](AGENTS.md) §6; tiến độ giờ theo [MILESTONES.md](MILESTONES.md) + [PROGRESS.md](PROGRESS.md).
- **PR #1** — turborepo workspace (web + api) + shared configs + CI.
- **PR #2** — `CODE_RULES.md`, lint Tailwind/shadcn, agent skills official, Neon.
- **PR #3** — foundation: env, gateway skeleton, `@kitty/shared`/`db`/`ui`, data layer (axios + TanStack Query + proxy `/api`), auth.
- **PR #4** — fix test hermetic, env optional rỗng, parse invoice id.
- **PR #5** — Linear conventions trong AGENTS.md + cap turbo cache (nay đã bỏ Linear).
- **PR #6** — đóng M0: runtime spike (Neon pooler `SELECT … FOR UPDATE`, Ed25519 WebCrypto trên Bun) + turbo cache; KIT-18 sandbox `sandbox:check` PASS.
- **PR #7** — `@kitty/signing` Ed25519 signing/verify cho agent → Gateway (KIT-19).
- **PR #8** — `packages/leash` policy engine thuần, 100% branch coverage + property test (KIT-17).
- **PR #9** — `@kitty/ledger` cents money + bucket ledger (KIT-11).
- **PR #10** — schema `leash`, view + append-only trigger (KIT-13).
- **PR #11** — `@kitty/paypal` typed REST client cho gateway (KIT-15).
- **PR #12** — Gateway Admin API `/v1` (kitties, agents, leashes) (KIT-6); migration 0004 trên Neon dev.
- **PR #13** — reserve + execute spend intents (Payouts) idempotent (KIT-16); migration 0005; **payout sandbox thật OK**.
- **PR #14** — web shell: sign in/up, tài khoản demo, app layout, theme (KIT-24).
- **PR #15** — schema `app` + api modules events/members/vendors/budget lines + tạo kitty qua gateway (KIT-30); migration 0008, smoke:events OK.
- **PR #16** — Gateway MCP server 5 tool ký Ed25519 (KIT-5); **payout MCP ký live OK**.
- **PR #17** — webhook PayPal verify + dedupe + state machine + settle (KIT-7); **reconcile settle một payout sandbox thật**; đăng ký webhook chờ KIT-8.
- **PR #18** — chuyển mọi test ra thư mục `test/` theo package (KIT-56).
- **PR #19** — UI reset: shadcn cài trực tiếp trong `apps/web` bằng preset `b4VmS9QxUG`, xoá `packages/ui`, brand qua `<Logo />` (KIT-55) — ADR-024.
- **PR #20** — `LinkButton` dùng chung cho nút điều hướng.
- **PR #22** — UI-QA: `proxy.ts` xác thực session thật thay vì chỉ tin cookie, nhãn nút demo rõ ("Try the demo (for judges)"), shell mobile gọn — ADR-025.

## 16/10/2026

- Bộ docs 01–25 hoàn chỉnh: hackathon, problem/vision, ánh xạ Sui Agent Pass → PayPal, product spec, leash spec, architecture, tech stack, infrastructure, data model, API spec, PayPal integration, agents, sponsor integrations, threat model, UI/UX, roadmap, goals/metrics, testing strategy, demo/submission, risks + ADRs, design Q&A, glossary, screen flow, BYOK, code architecture.
- Hạn: nội bộ **Wed 11/11/2026 23:59 ICT**; Devpost **Thu 12/11 12:00pm PST**.
