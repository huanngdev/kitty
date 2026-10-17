# 18 — Testing Strategy

> Ưu tiên test theo **mức độ tiền bị ảnh hưởng**. Policy engine và ledger là nơi test kỹ nhất; UI test vừa đủ cho luồng demo.

## 1. Kim tự tháp

| Lớp | Công cụ | Phạm vi | Chạy khi |
|---|---|---|---|
| Unit | `bun test` | `packages/leash`, `ledger`, `signing`, `paypal` (MSW), helpers | Mỗi commit (CI) |
| Property | fast-check | Policy engine + ledger invariants | CI |
| Integration | `bun test` + Postgres thật (Docker compose service) | Gateway: reservation transaction, webhook handlers, outbox | CI |
| Concurrency | `bun test` + Postgres | 50 intents song song | CI |
| Contract | `bun test` + MSW fixtures từ PayPal docs | Shape request/response PayPal | CI |
| Sandbox smoke | Script thật với PayPal sandbox | invoice → pay (manual) → payout → refund | Hằng ngày trên demo, trước quay video |
| E2E | Playwright (`bunx playwright test`) | Luồng M2 + injection | Trước mỗi milestone |
| Agent evals | Script `bun run eval` | Xem [12-agents.md](12-agents.md) §7 | Trước M3, M4, quay video |

## 2. Policy engine — test matrix bắt buộc

| Nhóm | Case |
|---|---|
| Status | active / paused / revoked / expired / exhausted / not-yet-valid |
| Ancestors | cha revoked; cha expired; cha limit nhỏ hơn con (không thể tạo — nhưng test evaluate vẫn chặn) |
| Action | được phép / không được phép / non-money action |
| Payee | trong allowlist / ngoài / khác hoa-thường (normalize lowercase) / có khoảng trắng / `member:*` |
| Category | `*` / trong / ngoài / thiếu category |
| Amount | 0, âm, `"1e3"`, `"12.345"`, `"12.3"`, = per_tx, per_tx + 0.01, = available, > available |
| Daily | sát ngưỡng, cửa sổ trượt qua 24h |
| Rate | đúng ngưỡng, vượt |
| Duplicate | cùng payee+amount trong 10' (khác intentId) → STEP_UP; > 10' → ALLOW |
| Step-up | = ngưỡng (ALLOW), ngưỡng + 0.01 (STEP_UP), null |
| Multi-reason | Gom đủ mọi reason |
| Currency | khác USD |

## 3. Property-based invariants

```ts
// Sinh ngẫu nhiên chuỗi thao tác: contribute, allocate, delegate, reserve, settle, fail,
// revoke, refund, topup — với số tiền ngẫu nhiên và thứ tự ngẫu nhiên.
fc.assert(fc.property(opsArb, (ops) => {
  const l = runOps(ops);                         // dùng hàm thuần của packages/ledger + leash
  expect(sumAll(l)).toBe(0n);                    // I1
  expect(internalBuckets(l).every(b => b >= 0n)).toBe(true); // I2
  expect(treeTotalWithinRoot(l)).toBe(true);     // I3
  expect(maxMovementsPerIntent(l)).toBeLessThanOrEqual(1);   // I4
}), { numRuns: 10_000 });
```

## 4. Gateway integration tests

- Reserve → execute (MSW Payouts 201) → webhook SUCCEEDED → settled; ledger đúng.
- Webhook FAILED → released; available trở lại.
- Webhook trùng → xử lý 1 lần.
- Webhook signature sai → 400, không ghi gì.
- Intent trùng id + cùng body → kết quả cũ; khác body → `INTENT_ID_REUSED`.
- Approval timeout → cancelled + release.
- Revoke giữa lúc `awaiting_approval` → cancelled.
- Revoke cascade sub-leash.
- Signing: sai chữ ký, timestamp lệch 61s, nonce lặp → 401.

## 5. E2E (Playwright) — kịch bản demo

1. Login demo organizer → Overview hiển thị số liệu seed.
2. Tạo leash Treasurer → thấy "Max possible loss" cập nhật.
3. Member trả qua trang `/pay` (MSW hoặc sandbox thật ở smoke) → Kitty tăng, gate mở trên timeline.
4. Treasurer payout step-up → approve → settled → task done.
5. Injection: trigger Shopper với trang Hoodie Deals → banner DENY → Revoke.

## 6. CI (GitHub Actions)

```
jobs: install → typecheck → lint → test:unit → test:integration (postgres service) →
      check:env-isolation → audit
```
Badge coverage + CI trong README.

## 7. Dữ liệu test & fixtures

- `packages/paypal/test/fixtures/*.json`: response mẫu (orders, invoices, payouts, webhooks) — lấy từ docs/sandbox thật, đã ẩn PII.
- Factory `makeLeash()`, `makeIntent()` trong `packages/leash/test/factories.ts`.
