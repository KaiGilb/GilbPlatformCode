// Known answers for the prose level (1.1.0). Every secret is a made-up shape; the ones a push scanner would flag are split.
// Spec: Sec.SecretInResume (every kind refused); Resume.Current (ordinary hand-off text is not refused); VKT Handoff.SecretScanLevel (b) ProseLevel.
import { describe, expect, test } from "vitest";
import { secretKindOfProse, textHasSecret, textHasSecretProse } from "./index";

/** kind of secret → [text, the kind the prose level names]. 18 shapes. */
const KINDS: Record<string, [string, string]> = {
  "sk- key": ["use sk-proj-abc123DEF456ghi789JKL012mno345 for the call", "key-prefix"],
  "sk-ant key": ["key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", "key-prefix"],
  "AKIA key": ["the id is AKIAIOSFODNN7EXAMPLE and it works", "key-prefix"],
  "ghp_ token": ["ghp_1234567890abcdefghijklmnopqrstuvwxyz12", "key-prefix"],
  "github_pat_ token": ["github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV", "key-prefix"],
  "xoxb token": ["xox" + "b-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx", "key-prefix"],
  "PEM block": ["-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xfn\n-----END RSA PRIVATE KEY-----", "private-key-block"],
  "PEM block, no end": ["-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC", "private-key-block"],
  JWT: ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c", "jwt"],
  "bearer token": ["Authorization: Bearer 8f3a9c1d2b7e4f60a5d9c3b1e7f20486", "bearer-token"],
  "password=": ["password=hunter2", "assignment"],
  "password: ": ["password: Tr0ub4dor&3", "assignment"],
  "DPoP header": ["DPoP: eyJ0eXAiOiJkcG9wK2p3dCIsImFsZyI6IkVTMjU2In0.eyJodG0iOiJQT1NUIiwiaHR1IjoiaHR0cHM6Ly9leGFtcGxlLmNvbSJ9.MEUCIQDabc", "jwt"],
  "one-time code": ["the sign-in code is 8Q4K-7MZ2-XP9D", "one-time-code"],
  "database URL with a password": ["postgres://app:p4ssw0rd@db/x", "url-credentials"],
  "https URL with user:pass@": ["clone https://deploy:s3cretPass@git.example.test/repo.git now", "url-credentials"],
  "http URL with user:pass@": ["http://admin:hunter2@example.test", "url-credentials"],
  "token in a URL query": ["open https://example.test/cb?access_token=8f3a9c1d2b7e4f60a5d9c3b1e7f20486 first", "url-query-secret"],
};

/** Five places a secret sits in a hand-off: bare, after words, before words, in a list line, in a long line. */
const PLACES: ((t: string) => string)[] = [
  (t) => t,
  (t) => `Next step is to rotate this: ${t}`,
  (t) => `${t} was pasted by mistake in the last session.`,
  (t) => `- see the note\n- ${t}\n- and then ship`,
  (t) => `The tester found the following while reading the old notes and the plan for the second batch of the work, ${t}, and wrote it down.`,
];

const ORDINARY: string[] = [
  "Open the pull request and ask Kai for the go.",
  "The tester's report is saved; the coder's fixes are next.",
  "The project's first resume point is written.",
  "Kai couldn't sign in on the second computer; shouldn't block the ship.",
  "Merged pull request #811 at 9984835f; ship on Kai's go.",
  "Fix the test at commit 82e7177d first.",
  "Check t:ProjectResumePoint and a:handoffNext on veda.example.test.",
  "Mail kai@example.test when the build is green.",
  "Run npm run typecheck, then the four resume-point test files.",
  "Read record 06gf80hsdxwmb8hjcqj901790m before you start.",
  "The door is POST /lws/vault/:vaultId/resume-point.",
  "Server answered on localhost:8787 at 2026-11-24T11:12:44Z.",
  "Budget is $1,200.50; spent 40% so far.",
  "Gjennomføre testen og spørsmålene til Kai i morgen.",
  "Die Übersetzung und die Besprechung sind für Freitag geplant.",
  "Réunion générale: vérifier l'enregistrement du projet.",
  "Waiting on Jean-Luc for the sign-off on Friday.",
  "Use read_project_resume_point first, then write_project_resume_point with the version.",
  "See src/lws/resume-point.ts and test/resume-point-http.test.ts.",
  "Agent.Tester found 3 defects (2 High, 1 Low); Agent.Coder fixes them.",
  "Meeting 12:30-13:00 on 2026-11-25.",
  "Branch kaizen/resume-point, worktree GilbPlatform-wt-resume-point.",
  "The token budget is 4,000 characters and the password reset mail is sent by the identity node.",
  "Full commit 9984835f030cba114bf63716d1d0b7a3a1846cac is on the branch.",
  "Record https://example.test/base/e/06gf80hsdxwmb8hjcqj901790m is linked.",
  "Secret handling: see the scanner's header, the author's note and the tester's secret cases.",
  "Authorization is checked by the door; the author reads the code.",
  "Bearer of the news is Agent.Tester.",
  "The comments in mint-quota.ts and open-mint-life-quota.test.ts say the limit is 10; the code uses 20.",
  "Read Handoff-2026-11-18-SessionClose-GilbAppBuild and Release-2026-11-15-fad49303-c89b7d4b-Hel1-GilbAppBuild first.",
  "SHA=c08aafb43e117a711e4850be2e7025402dda00d1 is the head.",
  "The code is 12 lines long; code review is Friday.",
];

describe("the prose level refuses every secret shape, in every place, and names the kind", () => {
  test.each(Object.entries(KINDS))("%s", (_name, [text, kind]) => {
    for (const place of PLACES) {
      const t = place(text);
      expect(secretKindOfProse(t), t.slice(0, 40)).toBe(kind);
    }
  });
  test("90 cases: 18 kinds in 5 places, all refused", () => {
    let refused = 0;
    let n = 0;
    for (const [text] of Object.values(KINDS)) for (const place of PLACES) { n += 1; if (textHasSecretProse(place(text))) refused += 1; }
    expect([n, refused]).toEqual([90, 90]);
  });
  test("a long mixed-class random run is refused as a random run; a 32-character name is not", () => {
    expect(secretKindOfProse("value Zx9kQ2mP7vL4nB8cR5tY1wE3uI6oA0sD here")).toBe("random-run");
    expect(secretKindOfProse("the function readProjectResumePointFromTheStoreNow is gone")).toBeNull();
    expect(secretKindOfProse("sha 9984835f030cba114bf63716d1d0b7a3a1846cac and 123e4567-e89b-12d3-a456-426614174000")).toBeNull();
  });
});

describe("the prose level lets ordinary text through", () => {
  test.each(ORDINARY)("%s", (line) => {
    expect(secretKindOfProse(line)).toBeNull();
  });
  test("the strict level is unchanged: it still refuses what it refused, and still lets the old gap stand where it did", () => {
    expect(textHasSecret("password=hunter2")).toBe(true);
    expect(textHasSecret("https://admin:hunter2@example.test/")).toBe(true);
    expect(textHasSecret(ORDINARY[1]!)).toBe(true); // possessives of 8+ letters: the reason the prose level exists
  });
  test("a user name only, or an empty password, in a URL is not a secret", () => {
    expect(secretKindOfProse("https://user@example.test/")).toBeNull();
    expect(secretKindOfProse("https://user:@example.test/")).toBeNull();
  });
});
