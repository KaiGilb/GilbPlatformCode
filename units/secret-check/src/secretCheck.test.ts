// Known answers. Each secret below is a made-up shape, not a live credential.
// Spec: Sec.SecretInResume (every kind refused, ordinary text allowed). RuleGpcunitSameBehaviour: these pin what the source does at its commit.
import { describe, expect, test } from "vitest";
import { maskSecrets, textHasSecret } from "./index";

const REFUSED: Record<string, string> = {
  "sk- key": "use sk-proj-abc123DEF456ghi789JKL012mno345 for the call",
  "sk-ant key": "key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
  "AKIA key": "the id is AKIAIOSFODNN7EXAMPLE and it works",
  "ghp_ token": "ghp_1234567890abcdefghijklmnopqrstuvwxyz12",
  "github_pat_ token": "github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV",
  // Split so a push scanner does not mistake the fixture for a live Slack token.
  "xoxb token": "xox" + "b-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx",
  "PEM block": "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xfn\n-----END RSA PRIVATE KEY-----",
  "PEM block, no end": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC",
  JWT: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  "bearer token": "Authorization: Bearer 8f3a9c1d2b7e4f60a5d9c3b1e7f20486",
  "password=": "password=hunter2",
  "password: ": "password: Tr0ub4dor&3",
  "DPoP header": "DPoP: eyJ0eXAiOiJkcG9wK2p3dCIsImFsZyI6IkVTMjU2In0.eyJodG0iOiJQT1NUIiwiaHR1IjoiaHR0cHM6Ly9leGFtcGxlLmNvbSJ9.MEUCIQDabc",
  "one-time code": "the sign-in code is 8Q4K-7MZ2-XP9D",
  "database URL with a password": "postgres://app:p4ssw0rd@db/x",
};

const ALLOWED: Record<string, string> = {
  sentence: "Next: ship the resume point door and ask for review of the pull request.",
  names: "Waiting on Jean-Luc for the sign-off on Friday.",
  "plain number": "4",
  "plain numbers": "We have 12 open lines and 3 owners.",
  "URL with a query": "https://example.test/a?b=1",
};

describe("textHasSecret", () => {
  test.each(Object.entries(REFUSED))("refuses %s", (_name, text) => {
    expect(textHasSecret(text)).toBe(true);
  });
  test.each(Object.entries(ALLOWED))("allows %s", (_name, text) => {
    expect(textHasSecret(text)).toBe(false);
  });
  // Pins today's behaviour, odd case included (RuleGpcunitSameBehaviour). A fix is its own change.
  test("TODAY'S GAP: an http(s) URL with user:pass@ is not refused", () => {
    expect(textHasSecret("https://admin:hunter2@example.test/")).toBe(false);
  });
});

describe("maskSecrets", () => {
  test("replaces a secret with [masked] and leaves ordinary words", () => {
    const masked = maskSecrets("the key is sk-proj-abc123DEF456ghi789JKL012mno345 ok");
    expect(masked).toContain("[masked]");
    expect(masked).not.toContain("abc123DEF456");
    expect(masked.startsWith("the key is")).toBe(true);
  });
  test("leaves an ordinary sentence as it is", () => {
    expect(maskSecrets(ALLOWED.sentence!)).toBe(ALLOWED.sentence);
  });
});
