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
