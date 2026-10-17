# CODE_RULES.md — Kitty

> **Bắt buộc đọc toàn bộ file này trước khi viết hoặc sửa code. Vi phạm một rule MUST = PR không được merge.**

File này chốt **tech stack chuẩn** và **quy ước code** cho toàn monorepo. Kiến trúc chi tiết ở [docs/25-code-architecture.md](docs/25-code-architecture.md); bất biến bảo mật/tiền ở [AGENTS.md](AGENTS.md) §3.

**Mức độ rule:**

- **MUST** — bắt buộc. Vi phạm = chặn merge (review/CI).
- **SHOULD** — nên làm; bỏ thì phải nói lý do trong PR.

**Ngôn ngữ:** code, comment, commit message, README, UI → tiếng Anh. `docs/` nội bộ → tiếng Việt.

**Ưu tiên khi mâu thuẫn:** các bất biến trong [AGENTS.md](AGENTS.md) §3 (Leash, PayPal secret chỉ ở `apps/gateway`, BYOK keys) **thắng** mọi rule ở file này. Nếu một rule dưới đây xung đột với bất biến tiền/bảo mật → theo AGENTS.md và ghi lại.

---

## A. Tech stack chuẩn

Chỉ dùng những thứ dưới đây. **Thêm một thư viện khác làm cùng một việc = MUST có ADR mới ở [docs/20-risks-and-decisions.md](docs/20-risks-and-decisions.md)** trước khi merge.

| Layer                                | Library / chuẩn                                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime · package manager · monorepo | **Bun 1.3** · **Turborepo 2**. MUST NOT dùng `npm`/`pnpm`/`yarn` (chỉ `bun`/`bunx`)                                                                                                |
| Language                             | **TypeScript strict** qua `@kitty/typescript-config`                                                                                                                               |
| Frontend framework                   | **Next.js 16 App Router** · **React 19**                                                                                                                                           |
| UI components                        | **shadcn/ui** (thêm bằng shadcn CLI). Component sống ở `apps/web/src/components/ui`, generate bằng CLI preset `b4VmS9QxUG`; **theme mặc định, không chỉnh**; **MUST NOT sửa tay file CLI generate**. Mọi component UI đến từ shadcn/ui hoặc compose từ shadcn/ui primitives. MUST NOT thêm component library khác (MUI, Chakra, Ant…) |
| Icons                                | **lucide-react**                                                                                                                                                                   |
| Styling                              | **Tailwind CSS 4** + helper `cn()` (`clsx` + `tailwind-merge`)                                                                                                                     |
| HTTP client                          | **axios** — một instance đã cấu hình cho mỗi app                                                                                                                                   |
| Server state                         | **TanStack Query v5**                                                                                                                                                              |
| Forms                                | **react-hook-form** + **@hookform/resolvers/zod**                                                                                                                                  |
| Validation                           | **Zod v4** — schema nằm ở `@kitty/shared`                                                                                                                                          |
| Client-only UI state                 | React state trước; **Zustand** chỉ cho cross-component client state                                                                                                                |
| Backend framework                    | **Hono** chạy trên Bun + `@hono/zod-validator`                                                                                                                                     |
| Auth                                 | **Better Auth** (server ở `apps/api`, client `better-auth/react`)                                                                                                                  |
| Database                             | **Neon** (serverless PostgreSQL) + **Drizzle ORM** + **drizzle-kit**, driver `postgres.js` (pooled URL, `prepare: false`); migrations dùng unpooled URL                            |
| Object storage                       | **Cloudflare R2** qua S3 API (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)                                                                                              |
| Testing                              | **`bun test`** (unit/integration) · **fast-check** (property) · **Playwright** (e2e)                                                                                               |
| Lint · format                        | **ESLint 10** flat config (`@kitty/eslint-config`) + **better-tailwindcss** (class order) + **@shadcn/lint**; **Prettier 3** (`@kitty/prettier-config`, không còn Tailwind plugin) |
| Env                                  | Mỗi app validate env bằng Zod schema lúc startup                                                                                                                                   |
| Dates · Money                        | ISO string qua wire, `Date` chỉ bên trong function; **money = integer cents** (xem AGENTS.md §3)                                                                                   |

Quy tắc bắt buộc kèm theo stack:

- **MUST** — UI: chỉ shadcn/ui + lucide-react. Ngoại lệ duy nhất là component sponsor đã chốt trong [docs/13](docs/13-sponsor-integrations.md) (AG Studio, Bryntum) — và phải được **bọc trong component của mình** (xem §C).
- **MUST** — HTTP: mọi HTTP client do ta tự viết (`apps/web`, `apps/api`, gateway và các package như `packages/paypal`) dùng **axios**. SDK bên thứ ba tự mang transport (Better Auth client, AI SDK/provider SDKs, AWS S3 SDK, Drizzle/postgres.js, MCP SDK) được miễn — không bọc lại chúng bằng axios. Ngoại lệ: (a) code server-only của Next cần fetch caching, (b) Hono `app.request` trong test.
- **MUST** — Server state: mọi read là `useQuery`/`useSuspenseQuery`, mọi write là `useMutation` với invalidation tường minh. MUST NOT fetch data trong `useEffect`.
- **MUST** — Contract: schema Zod sống ở `@kitty/shared`; type là `z.infer` của schema đó. MUST NOT khai báo lại DTO/interface ở app.
- **MUST** — Auth: dùng Better Auth. MUST NOT tự viết session, JWT hay password hashing.
- **MUST** — DB: chỉ Drizzle. Raw SQL chỉ qua template tag `sql` của drizzle.
- **MUST** — DB connection: app dùng `DATABASE_URL` (**Neon pooled**, driver `postgres` với `prepare: false`); migrations (`drizzle-kit`) dùng `DATABASE_URL_UNPOOLED` (direct). Chi tiết [ADR-018](docs/20-risks-and-decisions.md).
- **MUST** — Tailwind/design system: mọi class phải qua `better-tailwindcss` + `@shadcn/lint` — **không raw color** (dùng theme token trong `globals.css`), **không arbitrary value** (`p-[13px]`, `bg-[#ff0000]`), **không inline style**. Chạy `bun run lint:fix` hoặc bật fix-on-save trước khi commit (§C, [ADR-019](docs/20-risks-and-decisions.md)).
- **MUST** — Mọi bất biến trong AGENTS.md §3 vẫn áp dụng và **đứng trên** file này.

---

## B. Type safety (MUST)

- **MUST** — Không `any`. Dùng `unknown` rồi narrow.
- **MUST** — Không `@ts-ignore`. `@ts-expect-error` chỉ khi có comment lý do ngay trên dòng đó.
- **MUST** — Không non-null assertion `!`. Không `as` cast, trừ: (a) ngay sau khi đã validate runtime, (b) `as const`. Ưu tiên `satisfies`.
- **MUST** — Mọi function/hook/service được export có type tham số và kiểu trả về tường minh.
- **MUST** — Mọi biên ngoài được parse bằng Zod: HTTP request (`zValidator`), HTTP response ở tầng axios, env, webhook, `localStorage`, query params trên URL.
- **MUST** — Trạng thái/kết quả dùng discriminated union; `switch` phải exhaustive với check `never`.
- **MUST** — Type/DTO dùng chung import từ `@kitty/shared`; MUST NOT redeclare ở app.
- **MUST** — `noUncheckedIndexedAccess` bật; xử lý `undefined` khi truy cập theo index/key.

```ts
// ❌ any + implicit cast
export function total(items: any): any {
  return items.reduce((sum: any, item: any) => sum + item.amount, 0);
}
```

```ts
// ✅ validate ở biên, type suy ra từ schema, không any
import { z } from "zod";

const itemSchema = z.object({ amount: z.number().int() });
type Item = z.infer<typeof itemSchema>;

export function total(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}
```

```ts
// ✅ discriminated union + switch exhaustive
type Result =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: string };

function label(result: Result): string {
  switch (result.status) {
    case "idle":
      return "—";
    case "loading":
      return "Loading…";
    case "error":
      return result.error;
    case "success":
      return result.data;
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}
```

---

## C. Frontend rules (MUST)

**Component chỉ để hiển thị: JSX + props + gọi hooks. Mọi logic nằm trong hooks.**

- **MUST** — Logic (event handler, data fetching, mutation, derived value, effect, form setup, navigation) sống trong hook, không nằm trong component.
- **MUST** — File component MUST NOT chứa: gọi axios/query, `useEffect` có logic, `async function`, business rule, hay inline handler làm gì hơn việc gọi một hàm của hook.
- **MUST** — Mỗi mối quan tâm một hook trong `use-<name>.ts`. Feature component thường có hook khớp tên (`event-form.tsx` + `use-event-form.ts`), hook trả về một object có type tường minh gồm mọi thứ component cần.
- **MUST** — Gọi API chỉ trong `features/<feature>/api/*.ts` (axios function + query key + `queryOptions`); hook bọc chúng bằng TanStack Query; component chỉ gọi hook.
- **MUST** — Server Components được dùng cho layout/dữ liệu tĩnh và prefetch (`prefetchQuery` + `HydrationBoundary`); phần interactive là Client Component dùng hook.
- **MUST** — Component sponsor (AG Studio, Bryntum) phải được bọc trong một component của mình để phần còn lại của app không import trực tiếp thư viện sponsor.
- **MUST** — shadcn/ui component nằm ở `apps/web/src/components/ui` (định nghĩa ở [docs/25](docs/25-code-architecture.md)); **MUST NOT sửa tay file CLI generate** — muốn đổi thì chỉnh variant/rule trong `apps/web/eslint.config.js` hoặc hỏi owner, không patch file vendor.
- **MUST** — Brand (mascot/wordmark "Kitty") chỉ render qua component `<Logo />` ở `apps/web/src/components/brand/logo.tsx`; MUST NOT dựng lại markup logo/text brand rải rác trong page/feature.
- **MUST** — Naming: file `kebab-case`, component `PascalCase`, hook `useX`, một component một file, **named export** (ngoại lệ: file `page.tsx`/`layout.tsx`/`route.ts` của Next buộc default export).

```tsx
// ❌ component tự fetch, tự mutate, tự tính logic
"use client";
import { useEffect, useState } from "react";
import axios from "axios";

export function EventList() {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    axios.get("/api/events").then((r) => setEvents(r.data));
  }, []);
  const handleSelect = async (id: string) => {
    await axios.post(`/api/events/${id}/select`);
    setEvents((prev) => prev.map((e) => ({ ...e, selected: e.id === id })));
  };
  return events.map((e) => (
    <button key={e.id} onClick={() => handleSelect(e.id)}>
      {e.title}
    </button>
  ));
}
```

```ts
// ✅ features/events/api/events.api.ts — axios + key + queryOptions
import { queryOptions } from "@tanstack/react-query";
import { apiPaths } from "@kitty/shared";
import { type Event, eventListSchema } from "@kitty/shared/events";
import { http } from "@/lib/http";

export const eventsKeys = {
  all: ["events"] as const,
  list: () => [...eventsKeys.all, "list"] as const,
};

export async function listEvents(): Promise<Event[]> {
  const { data } = await http.get<unknown>(apiPaths.events.list);
  return eventListSchema.parse(data);
}

export async function selectEvent(id: string): Promise<void> {
  await http.post(apiPaths.events.select(id));
}

export const eventsQueries = {
  list: () =>
    queryOptions({
      queryKey: eventsKeys.list(),
      queryFn: listEvents,
    }),
};
```

```ts
// ✅ features/events/hooks/use-events.ts — mọi logic ở đây
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event } from "@kitty/shared/events";
import { eventsKeys, eventsQueries, selectEvent } from "../api/events.api";

export interface UseEventsResult {
  events: Event[];
  isLoading: boolean;
  selectEvent: (id: string) => void;
  isSelecting: boolean;
}

export function useEvents(): UseEventsResult {
  const queryClient = useQueryClient();
  const query = useQuery(eventsQueries.list());
  const select = useMutation({
    mutationFn: selectEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventsKeys.all }),
  });
  return {
    events: query.data ?? [],
    isLoading: query.isPending,
    selectEvent: (id: string) => select.mutate(id),
    isSelecting: select.isPending,
  };
}
```

```tsx
// ✅ features/events/components/event-list.tsx — chỉ hiển thị
"use client";
import type { JSX } from "react";
import { useEvents } from "../hooks/use-events";

export function EventList(): JSX.Element[] {
  const { events, selectEvent } = useEvents();
  return events.map((event) => (
    <button key={event.id} onClick={() => selectEvent(event.id)}>
      {event.title}
    </button>
  ));
}
```

---

## D. Backend rules (MUST)

Phân tầng bắt buộc: `routes` → `services` → `repositories`.

- **MUST** — `routes` (Hono router + `zValidator` + gọi service) MUST NOT chạm DB trực tiếp.
- **MUST** — `services` chứa business logic, type tường minh, **không dùng type của Hono**.
- **MUST** — `repositories` chỉ chứa truy vấn Drizzle, MUST NOT chứa business rule.
- **MUST** — Mọi route validate input bằng schema từ `@kitty/shared` và trả response khớp schema response dùng chung.
- **MUST** — Lỗi: throw `AppError(code, httpStatus, details)`; một `onError` duy nhất của Hono map thành shape `{ error: { code, message, details } }` định nghĩa ở `@kitty/shared`. MUST NOT rò stack trace ra ngoài.
- **MUST** — Middleware auth gán `c.var.user`/`c.var.session` có type; middleware authorization kiểm role/permission theo từng route.
- **MUST** — Dùng transaction cho ghi nhiều dòng; các rule tiền ở AGENTS.md (cents, idempotency, ledger) vẫn áp dụng.
- **MUST** — Log bằng `pino`, structured, có redact secret/PII.

```ts
// ✅ modules/events/events.routes.ts — validate rồi gọi service, không chạm DB
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createEventSchema } from "@kitty/shared/events";
import * as eventsService from "./events.service";

export const eventsRoutes = new Hono().post("/", zValidator("json", createEventSchema), async (c) =>
  c.json(await eventsService.create(c.req.valid("json")), 201),
);
```

```ts
// ✅ modules/events/events.service.ts — business logic, không dùng type của Hono
import type { CreateEventInput } from "@kitty/shared/events";
import * as eventsRepository from "./events.repository";
import type { EventRow } from "./events.repository";

export async function create(input: CreateEventInput): Promise<EventRow> {
  return eventsRepository.insert({
    title: input.title,
    budgetCents: input.budgetCents,
  });
}
```

```ts
// ✅ modules/events/events.repository.ts — chỉ Drizzle
import { events } from "@kitty/db/schema";
import { AppError } from "@/lib/errors";
import { db } from "@/lib/db";

export type EventRow = typeof events.$inferSelect;

export async function insert(input: { title: string; budgetCents: number }): Promise<EventRow> {
  const [row] = await db.insert(events).values(input).returning();
  if (!row) {
    throw new AppError("EVENT_INSERT_FAILED", 500, { title: input.title });
  }
  return row;
}
```

```ts
// ✅ lib/errors.ts — AppError với HTTP status type-safe
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: ContentfulStatusCode,
    readonly details?: unknown,
  ) {
    super(code);
  }
}
```

```ts
// ✅ src/app.ts — onError tập trung
import { Hono } from "hono";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const app = new Hono();

app.onError((error, c) => {
  if (error instanceof AppError) {
    return c.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      error.httpStatus,
    );
  }
  logger.error({ err: error }, "unhandled error");
  return c.json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500);
});
```

---

## E. Shared package rules (MUST)

`@kitty/shared` là **nguồn sự thật của contract**.

- **MUST** — Chỉ chứa: Zod schema, type/interface suy ra, enum/const, error code, hằng số path API, và pure isomorphic util.
- **MUST NOT** — Không React, không Hono, không Drizzle, không API chỉ có ở Node/Bun/browser, không secret.
- **MUST** — Export qua `src/index.ts` + subpath export theo domain (ví dụ `@kitty/shared/events`).
- **MUST** — Cả hai app import contract từ đây; đổi contract = đổi ở đây trước.

```ts
// ✅ packages/shared/src/events/events.schema.ts
import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(1).max(120),
  budgetCents: z.number().int().nonnegative(),
});

export const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export const eventListSchema = z.array(eventSchema);
```

```ts
// ✅ packages/shared/src/events/events.types.ts
import type { z } from "zod";
import type { createEventSchema, eventSchema } from "./events.schema";

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type Event = z.infer<typeof eventSchema>;
```

```ts
// ✅ packages/shared/src/common/api-paths.ts — hằng số path API dùng chung
export const apiPaths = {
  events: {
    list: "/api/events",
    select: (id: string) => `/api/events/${id}/select`,
  },
} as const;
```

---

## F. Workflow (MUST)

- **MUST** — Trước khi code: đọc [AGENTS.md](AGENTS.md), file này, và docs liên quan tới task.
- **MUST** — Trước khi commit: **`bun run ci` phải pass** (`format:check`, `lint`, `check-types`, `build`). Không warning từ ESLint.
- **MUST** — **Conventional Commits**; commit nhỏ, PR nhỏ.
- **MUST** — Không commit `.env`, secret, `node_modules`, `.next`, `.turbo`.
- **MUST** — Vào `main` chỉ qua PR.
- **MUST** — **Test tách khỏi code**: mọi file test nằm trong `<pkg>/test/`, **KHÔNG** nằm cạnh code trong `src/`. `test/` mirror `src/` và giữ nguyên tên file, chỉ đổi vị trí (`src/common/money.schema.ts` → `test/common/money.schema.test.ts`). Integration test (`*.int.test.ts`) nằm dưới `test/integration/` (mirror sub-path bên trong `integration/`). Fixture/helper dùng chung (trước đây là `test-support/`) đặt ở `test/support/`. **Không** file nào dưới `src/` được import từ `test/`; test import code qua đường dẫn tương đối `../src/...` (không thêm path alias mới). Property test nằm cạnh unit test của nó trong `test/`.

  ```
  packages/ledger
  ├── src/
  │   ├── money.ts
  │   └── entries.ts
  └── test/
      ├── money.test.ts          # tests src/money.ts
      ├── entries.test.ts        # tests src/entries.ts
      ├── properties.test.ts     # property test cạnh unit test
      └── support/               # fixture/helper dùng chung (không phải *.test.ts)

  apps/gateway
  ├── src/modules/intents/intents.service.ts
  └── test/
      ├── modules/intents/intents.service.test.ts          # unit
      ├── integration/modules/intents/intents.int.test.ts  # integration
      └── support/                                         # fixture/helper dùng chung
  ```

**Checklist**

```md
- [ ] `bun run ci` pass (format:check · lint · check-types · build), 0 warning ESLint
- [ ] Không `any`, không `!`, không `as` (trừ `as const` hoặc ngay sau khi đã validate runtime), không `@ts-ignore` không lý do
- [ ] Mọi biên ngoài parse bằng Zod; type lấy từ `z.infer` / `@kitty/shared`
- [ ] Mọi logic ở hooks; component chỉ JSX + props + gọi hook
- [ ] UI chỉ dùng shadcn/ui + lucide-react (hoặc bọc sponsor component)
- [ ] Gọi API qua axios instance; read/write qua TanStack Query, có invalidation
- [ ] API: route → service → repository; input `zValidator`; lỗi qua `AppError` + `onError`
- [ ] Contract thay đổi thì sửa ở `@kitty/shared` trước
- [ ] Tailwind/shadcn lint pass (không raw color, không arbitrary value, không inline style; dùng theme token) — `bun run lint:fix`
- [ ] UI text là **tiếng Anh** (không tiếng Việt trong UI) — §G
- [ ] Chỉ dùng agent skill khớp công nghệ đang đụng (§H)
- [ ] Không vi phạm bất biến AGENTS.md §3; không log secret/PII
- [ ] Docs cập nhật nếu thay đổi hành vi/thiết kế; ADR nếu thêm thư viện/quyết định mới
- [ ] Test nằm trong `test/`, không nằm cạnh code trong `src/`
- [ ] Conventional Commits; không commit secret hay build artifact
```

---

## G. Ngôn ngữ (MUST)

- **MUST** — Tài liệu và rules trong `docs/`, `CODE_RULES.md`, `AGENTS.md` viết **tiếng Việt** (giữ thuật ngữ kỹ thuật tiếng Anh).
- **MUST** — **Code** (tên biến/hàm/file/type), **comment**, **commit message**, **PR title/body**, **log**, **error message**, và **toàn bộ UI text của app** viết **tiếng Anh**.
- **MUST NOT** — UI copy có tiếng Việt. Ví dụ: ✅ `"Pay your share"`, ❌ `"Trả phần của bạn"`.

---

## H. Agent skills (MUST)

Chỉ dùng **skill chính thức** của nhà cung cấp công nghệ. Skill là tài liệu tham khảo — file này và [AGENTS.md](AGENTS.md) **thắng** khi mâu thuẫn.

| Công nghệ                                 | Skill (official)                                                    | Khi nào load                                                           |
| ----------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Neon / Postgres / migrations / connection | `neon`, `neon-postgres`                                             | Chỉ khi task đụng DB, Neon, migrations, connection string, SQL, schema |
| shadcn/ui                                 | `shadcn`                                                            | Chỉ khi thêm/sửa UI component hoặc dùng shadcn CLI                     |
| Turborepo                                 | `turborepo`                                                         | Chỉ khi sửa `turbo.json`, task graph, cấu trúc workspace, CI cache     |
| Better Auth                               | `better-auth-best-practices`, `better-auth-security-best-practices` | Chỉ khi làm auth, session, role/permission                             |
| React / Next.js                           | `vercel-react-best-practices`                                       | Chỉ khi viết/sửa React/Next component hoặc hook                        |

- **MUST** — Chỉ load skill khớp với công nghệ task đang đụng; MUST NOT load skill không liên quan.
- **MUST** — Skill **không** override rules: ví dụ skill Neon gợi ý **Neon Auth** → bỏ qua, ta dùng **Better Auth** ([ADR-018](docs/20-risks-and-decisions.md)).
- **MUST** — Chỉ cài skill **official**; thêm skill mới cần ADR ở [docs/20](docs/20-risks-and-decisions.md).
- **MUST** — Cập nhật skill bằng CLI (`bunx skills update`, `bunx neon@latest skills update`), MUST NOT sửa tay file vendor trong `.agents/skills` / `.claude/skills`.
- **MUST** — shadcn CLI chạy trong `apps/web` (`bunx --bun shadcn@latest …`), generate component vào `apps/web/src/components/ui` với preset `b4VmS9QxUG`; file CLI sinh ra là vendor — không sửa tay (§A, §C).
