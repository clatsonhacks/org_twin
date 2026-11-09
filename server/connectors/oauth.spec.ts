import { describe, expect, it } from "vitest";

import { manualKeys, popupPage, readState, redirectUriFor, sheetIdFrom, signState } from "./oauth.js";

describe("signed OAuth state", () => {
  const redirectUri = "http://localhost:8080/api/oauth/google/callback";

  it("round-trips for the same provider and person", () => {
    const st = signState({ p: "google", email: "a@example.com", redirectUri });
    expect(readState(st, "google", "a@example.com").redirectUri).toBe(redirectUri);
  });

  it("rejects another person, another provider, or a tampered state", () => {
    const st = signState({ p: "google", email: "a@example.com", redirectUri });
    expect(() => readState(st, "google", "b@example.com")).toThrow(/someone else/);
    expect(() => readState(st, "slack", "a@example.com")).toThrow(/someone else/);
    const [body, mac] = st.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), redirectUri: "https://evil.example/cb" }),
    ).toString("base64url");
    expect(() => readState(`${forged}.${mac}`, "google", "a@example.com")).toThrow(/not valid/);
    expect(() => readState("garbage", "google", "a@example.com")).toThrow(/not valid/);
  });
});

describe("helpers", () => {
  it("builds the callback address from the request origin", () => {
    expect(redirectUriFor("slack", "https://twin.example.com/")).toBe("https://twin.example.com/api/oauth/slack/callback");
  });

  it("takes a sheet id or a full Google Sheets link", () => {
    expect(sheetIdFrom("https://docs.google.com/spreadsheets/d/1AbC_d-9/edit#gid=0")).toBe("1AbC_d-9");
    expect(sheetIdFrom(" 1AbC_d-9 ")).toBe("1AbC_d-9");
  });

  it("only lets a connector save its own keys", () => {
    expect(manualKeys("slack")).toEqual(["SLACK_WEBHOOK_URL"]);
    expect(manualKeys("nope")).toEqual([]);
  });

  it("escapes provider messages on the popup page", () => {
    const html = popupPage("slack", false, `<img src=x onerror=alert(1)>`);
    expect(html).not.toContain("<img");
    expect(html).toContain("&#60;img");
  });
});
