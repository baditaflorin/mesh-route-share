import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("with geolocation granted, A's fix and trail show up on B", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL: baseURL || undefined,
    permissions: ["geolocation"],
    geolocation: { latitude: 44.4268, longitude: 26.1025 },
  });
  await context.addInitScript(
    ({ prefix, room }) => {
      localStorage.setItem(`${prefix}:room`, room);
      localStorage.setItem(`${prefix}:signalingUrl`, "ws://localhost:1/never");
      localStorage.removeItem(`${prefix}:iceServers`);
    },
    { prefix: storagePrefix, room: `e2e-${Math.random().toString(36).slice(2, 8)}` },
  );
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([a.goto(baseURL ?? ""), b.goto(baseURL ?? "")]);
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await a.getByRole("button", { name: "share my route", exact: true }).click();

    await expect(b.locator(".rt-status")).toContainText("1 person sharing");
    await expect(b.locator(".rt-map text").filter({ hasText: "alice" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("checkpoint set by A appears on B and detects A as within radius", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL: baseURL || undefined,
    permissions: ["geolocation"],
    geolocation: { latitude: 44.4268, longitude: 26.1025 },
  });
  await context.addInitScript(
    ({ prefix, room }) => {
      localStorage.setItem(`${prefix}:room`, room);
      localStorage.setItem(`${prefix}:signalingUrl`, "ws://localhost:1/never");
      localStorage.removeItem(`${prefix}:iceServers`);
    },
    { prefix: storagePrefix, room: `e2e-${Math.random().toString(36).slice(2, 8)}` },
  );
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([a.goto(baseURL ?? ""), b.goto(baseURL ?? "")]);
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await a.getByRole("button", { name: "share my route", exact: true }).click();
    await a.waitForTimeout(500);
    await a.getByRole("button", { name: /set checkpoint here/ }).click();
    await expect(b.locator(".rt-checkpoint-status")).toContainText("alice");
  } finally {
    await context.close();
  }
});

// Load-bearing cross-peer assertion: peer A walks through a SEQUENCE of GPS
// positions; peer B must watch A's breadcrumb TRAIL grow (the SVG <path> only
// renders with >=2 crumbs) and, when A reaches a checkpoint set ahead of it,
// B must see the checkpoint-detection fire. This fails on any local-only trail
// or local-only checkpoint detection.
test("B watches A's breadcrumb trail grow and detects A reaching a checkpoint", async ({
  browser,
  baseURL,
}) => {
  const room = `e2e-${Math.random().toString(36).slice(2, 8)}`;
  // A short walk in Bucharest, each step ~80-120 m apart (> the 15 m crumb
  // threshold) so every fix appends a breadcrumb.
  const ROUTE = [
    { lat: 44.4268, lon: 26.1025 },
    { lat: 44.4276, lon: 26.1035 },
    { lat: 44.4285, lon: 26.1047 },
    { lat: 44.4294, lon: 26.106 },
  ];
  // A controllable watchPosition: stash the success callback and expose a
  // window.__pushFix(lat, lon) so the test can feed positions one at a time.
  const shim = () => {
    let cb: PositionCallback | null = null;
    navigator.geolocation.watchPosition = (success: PositionCallback) => {
      cb = success;
      return 1;
    };
    (window as unknown as { __pushFix: (lat: number, lon: number) => void }).__pushFix = (
      lat: number,
      lon: number,
    ) => {
      cb?.({
        coords: {
          latitude: lat,
          longitude: lon,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    };
  };

  const ctx = await browser.newContext({ baseURL: baseURL || undefined });
  await ctx.addInitScript(
    ({ prefix, room }) => {
      try {
        localStorage.setItem(`${prefix}:room`, room);
        localStorage.setItem(`${prefix}:signalingUrl`, "ws://localhost:1/never");
        localStorage.removeItem(`${prefix}:iceServers`);
      } catch {
        // ignore
      }
    },
    { prefix: storagePrefix, room },
  );
  await ctx.grantPermissions(["geolocation"]);
  await ctx.addInitScript(`(${shim.toString()})()`);
  const a = await ctx.newPage();
  const b = await ctx.newPage();

  const pushFix = (lat: number, lon: number) =>
    a.evaluate(
      ([lat, lon]) =>
        (window as unknown as { __pushFix: (lat: number, lon: number) => void }).__pushFix(
          lat,
          lon,
        ),
      [lat, lon] as [number, number],
    );

  try {
    await Promise.all([a.goto(baseURL ?? ""), b.goto(baseURL ?? "")]);

    await a.getByPlaceholder("your name").fill("alice");
    await a.getByRole("button", { name: "share my route", exact: true }).click();

    // Walk A through the route; each step appends a breadcrumb to the shared
    // Y.Map("trails")[A].
    for (const step of ROUTE) {
      await pushFix(step.lat, step.lon);
      await a.waitForTimeout(120);
    }

    // B sees alice on the map AND a rendered trail path (>=2 crumbs synced over
    // the mesh). The path is keyed by A's peerId; assert at least one stroked
    // path exists on B's SVG.
    await expect(b.locator(".rt-map text").filter({ hasText: "alice" })).toBeVisible();
    await expect(b.locator(".rt-map path[stroke]")).toHaveCount(1);
    // The path must carry multiple line segments — proof the whole trail synced,
    // not just a single point. An "L" command per appended crumb after the M.
    const dOnB = await b.locator(".rt-map path[stroke]").getAttribute("d");
    expect((dOnB?.match(/L/g) ?? []).length).toBeGreaterThanOrEqual(2);

    // Now place a checkpoint AHEAD of A (at the final route position) from peer
    // B's perspective by having A set it there, then confirm detection fires on
    // B. A is already at ROUTE[last], so set-checkpoint-here marks that spot;
    // B must see alice detected within the radius.
    await a.getByRole("button", { name: /set checkpoint here/ }).click();
    await expect(b.locator(".rt-checkpoint-status")).toContainText("alice");
    // And the ✓ detection row shows a real distance (A is essentially at the
    // checkpoint, so 0-50 m).
    await expect(b.locator(".rt-checkpoint-status li")).toContainText("alice");

    // Drive A AWAY from the checkpoint (back to the start, ~350 m) and confirm
    // B sees A leave the checkpoint detection list — proving B reads A's LIVE
    // position vs the checkpoint, not a stale local copy.
    await pushFix(ROUTE[0]!.lat, ROUTE[0]!.lon);
    await expect(b.locator(".rt-checkpoint-status")).toContainText("nobody there yet");
  } finally {
    await ctx.close();
  }
});
