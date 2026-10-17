import { Hono } from "hono";

export const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/health", (c) => {
  return c.json({ ok: true });
});

export type App = typeof app;
