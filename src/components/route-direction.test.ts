import { describe, expect, it } from "vitest";
import { routeDirection, TAB_ORDER } from "./route-direction";

describe("routeDirection", () => {
  it("is rightward when moving to a later tab", () => {
    expect(routeDirection("/", "/entries")).toBe("right");
    expect(routeDirection("/", "/settings")).toBe("right");
    expect(routeDirection("/entries", "/clients")).toBe("right");
    expect(routeDirection("/reports", "/settings")).toBe("right");
  });

  it("is leftward when moving to an earlier tab", () => {
    expect(routeDirection("/settings", "/reports")).toBe("left");
    expect(routeDirection("/settings", "/")).toBe("left");
    expect(routeDirection("/clients", "/entries")).toBe("left");
    expect(routeDirection("/entries", "/")).toBe("left");
  });

  it("is neutral when the origin is unknown", () => {
    expect(routeDirection(null, "/")).toBe("neutral");
    expect(routeDirection(undefined, "/entries")).toBe("neutral");
  });

  it("is neutral when the destination is unknown", () => {
    expect(routeDirection("/", null)).toBe("neutral");
  });

  it("is neutral when both are unknown", () => {
    expect(routeDirection(null, null)).toBe("neutral");
  });

  it("is neutral when from and to are the same", () => {
    expect(routeDirection("/", "/")).toBe("neutral");
    expect(routeDirection("/clients", "/clients")).toBe("neutral");
  });

  it("covers the full fixed order", () => {
    expect(TAB_ORDER).toEqual([
      "/",
      "/entries",
      "/clients",
      "/reports",
      "/settings",
    ]);
  });
});
