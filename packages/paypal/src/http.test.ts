import { describe, expect, test } from "bun:test";
import { findLink, readHeader } from "./http";

describe("readHeader", () => {
  test("returns undefined for non-object headers", () => {
    expect(readHeader(null, "x")).toBeUndefined();
    expect(readHeader("nope", "x")).toBeUndefined();
  });

  test("reads headers case-insensitively", () => {
    expect(readHeader({ Authorization: "Bearer x" }, "authorization")).toBe("Bearer x");
    expect(readHeader({ authorization: "Bearer y" }, "Authorization")).toBe("Bearer y");
  });

  test("returns undefined when the header is absent", () => {
    expect(readHeader({}, "retry-after")).toBeUndefined();
  });

  test("ignores a matching header whose value is not a string", () => {
    expect(readHeader({ "x-bad": 5 }, "X-Bad")).toBeUndefined();
  });
});

describe("findLink", () => {
  test("returns undefined without links", () => {
    expect(findLink(undefined, ["approve"])).toBeUndefined();
  });

  test("returns undefined when no rel matches", () => {
    expect(findLink([{ rel: "self", href: "s" }], ["approve", "payer-action"])).toBeUndefined();
  });

  test("returns the first matching href in preference order", () => {
    const links = [
      { rel: "payer-action", href: "p" },
      { rel: "approve", href: "a" },
    ];

    expect(findLink(links, ["approve", "payer-action"])).toBe("a");
  });
});
