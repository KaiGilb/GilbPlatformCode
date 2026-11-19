// @vitest-environment node
// SU-1: the pure manifest and signature verifier. Keys are made in the test; nothing is read from disk.
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { compareBuilds, fileMatchesManifest, updateSignedText, verifyUpdateManifest } from "../bridge/bridge.mjs";

const newKeys = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  return { privateKey, b64: raw.toString("base64") };
};
const bu1 = newKeys();
const bu2 = newKeys();
const other = newKeys();
const NOW = new Date("2026-11-19T12:00:00Z");
const RUNNING = "0.3.15";
const ORIGIN = "https://host.example.test";
const KEYS = [{ id: "bu1", key: bu1.b64 }];
const BASE = { version: "0.3.16", sha256: "a".repeat(64), size: 1000, signedAt: "2026-11-19T11:00:00Z", minBridge: "0.3.10" };

function sign(fields, priv = bu1.privateKey, label) {
  let text = updateSignedText({ origin: ORIGIN, ...fields });
  if (label) text = text.replace(/^[^\n]*/, label);
  return crypto.sign(null, Buffer.from(text, "utf8"), priv).toString("base64");
}
function manifest(over = {}, signWith = bu1.privateKey, keyId = "bu1") {
  const f = { ...BASE, ...over };
  return { format: 1, ...f, keyId, signature: sign(f, signWith) };
}
const verify = (raw, over = {}) => verifyUpdateManifest(raw, { running: RUNNING, keys: KEYS, now: NOW, origin: ORIGIN, ...over });
const code = (r) => (r.ok ? "ok" : r.code);

describe("verifyUpdateManifest", () => {
  it("V1 a valid manifest above the running version is ok", () => {
    const r = verify(manifest());
    expect(r.ok).toBe(true);
    expect(r.manifest).toMatchObject({ version: "0.3.16", keyId: "bu1", size: 1000 });
  });

  it("V1b a manifest without minBridge is ok (signed with an empty minBridge line)", () => {
    const { minBridge, ...f } = BASE;
    expect(updateSignedText({ origin: ORIGIN, ...f }).endsWith("\nminBridge=")).toBe(true);
    expect(code(verify({ format: 1, ...f, keyId: "bu1", signature: sign(f) }))).toBe("ok");
  });

  for (const [field, value] of [["version", "0.3.17"], ["sha256", "b".repeat(64)], ["size", 1001], ["signedAt", "2026-11-19T11:00:01Z"], ["minBridge", "0.3.11"]]) {
    it(`V2 ${field} changed after signing is UpdateSignature`, () => {
      expect(code(verify({ ...manifest(), [field]: value }))).toBe("UpdateSignature");
    });
  }

  it("V3 a signature made with another key under the same keyId is UpdateSignature", () => {
    expect(code(verify(manifest({}, other.privateKey)))).toBe("UpdateSignature");
  });

  it("V4 an unknown keyId is UpdateSignature", () => {
    expect(code(verify(manifest({}, bu1.privateKey, "zz9")))).toBe("UpdateSignature");
  });

  it("V5 a valid signature with an equal or lower version is UpdateCurrent", () => {
    expect(code(verify(manifest({ version: "0.3.15" })))).toBe("UpdateCurrent");
    expect(code(verify(manifest({ version: "0.3.14" })))).toBe("UpdateCurrent");
  });

  it("V5b an UNSIGNED manifest with a LOWER version is UpdateSignature, not UpdateCurrent (signature first)", () => {
    const m = { ...manifest({ version: "0.3.1" }), signature: crypto.randomBytes(64).toString("base64") };
    expect(code(verify(m))).toBe("UpdateSignature");
  });

  it("V6 minBridge above running is UpdateTooOld; equal is ok", () => {
    expect(code(verify(manifest({ minBridge: "0.3.16" })))).toBe("UpdateTooOld");
    expect(code(verify(manifest({ minBridge: "0.3.15" })))).toBe("ok");
  });

  const good = manifest();
  for (const [name, patch] of [
    ["format 2", { format: 2 }],
    ["63-char sha", { sha256: "a".repeat(63) }],
    ["size 0", { size: 0 }],
    ["size 6 MB", { size: 6 * 1024 * 1024 }],
    ["size 1.5", { size: 1.5 }],
    ["bad date", { signedAt: "yesterday" }],
    ["minBridge not a string", { minBridge: 3 }],
    ["empty signature", { signature: "" }],
  ]) {
    it(`V7 bad shape (${name}) is UpdateBad`, () => {
      expect(code(verify({ ...good, ...patch }))).toBe("UpdateBad");
    });
  }
  it("V7b non-objects are UpdateBad", () => {
    for (const raw of [null, undefined, "x", 5, [], [good]]) expect(code(verify(raw))).toBe("UpdateBad");
  });
  it("V7 bad shape (version 0.3.x, signed) is UpdateBad", () => {
    expect(code(verify(manifest({ version: "0.3.x" })))).toBe("UpdateBad");
  });

  it("V8 no keys is UpdateOff; a 31-byte pinned key is UpdateOff", () => {
    expect(code(verify(manifest(), { keys: [] }))).toBe("UpdateOff");
    expect(code(verify(manifest(), { keys: [{ id: "bu1", key: crypto.randomBytes(31).toString("base64") }] }))).toBe("UpdateOff");
  });

  it("V9 signedAt 2 days ahead is UpdateBad; 1 hour ahead is ok", () => {
    expect(code(verify(manifest({ signedAt: "2026-11-21T12:00:00Z" })))).toBe("UpdateBad");
    expect(code(verify(manifest({ signedAt: "2026-11-19T13:00:00Z" })))).toBe("ok");
  });

  it("V10 the same key over a different label is UpdateSignature", () => {
    const f = { ...BASE };
    const m = { format: 1, ...f, keyId: "bu1", signature: sign(f, bu1.privateKey, "gilb-ontology-snapshot-v1") };
    expect(code(verify(m))).toBe("UpdateSignature");
  });

  it("V11 key rotation: the id must name the key that signed", () => {
    const keys = [{ id: "bu1", key: bu1.b64 }, { id: "bu2", key: bu2.b64 }];
    expect(code(verify(manifest({}, bu2.privateKey, "bu2"), { keys }))).toBe("ok");
    expect(code(verify(manifest({}, bu2.privateKey, "bu1"), { keys }))).toBe("UpdateSignature");
  });
});

describe("updateSignedText", () => {
  it("is the label then six fields, LF, no trailing newline", () => {
    expect(updateSignedText({ origin: ORIGIN, ...BASE })).toBe("gilb-claude-code-bridge-update-v1\norigin=https://host.example.test\nversion=0.3.16\nsha256=" + "a".repeat(64) + "\nsize=1000\nsignedAt=2026-11-19T11:00:00Z\nminBridge=0.3.10");
  });
});

describe("fileMatchesManifest", () => {
  const text = 'export const BRIDGE_BUILD = "0.3.16";\n// body\n';
  const bytes = new TextEncoder().encode(text);
  const m = { version: "0.3.16", sha256: crypto.createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
  it("F1 correct bytes are ok", () => expect(fileMatchesManifest(bytes, m)).toEqual({ ok: true }));
  it("F1 one byte changed is a mismatch", () => {
    const b = bytes.slice();
    b[b.length - 3] ^= 1;
    expect(fileMatchesManifest(b, m)).toMatchObject({ ok: false, code: "UpdateMismatch" });
  });
  it("F1 size off by one is a mismatch", () => expect(fileMatchesManifest(bytes, { ...m, size: m.size + 1 })).toMatchObject({ ok: false, code: "UpdateMismatch" }));
  it("F1 another version's BRIDGE_BUILD text is a mismatch", () => {
    const other = new TextEncoder().encode(text.replace("0.3.16", "0.3.15"));
    const mm = { ...m, sha256: crypto.createHash("sha256").update(other).digest("hex"), size: other.length };
    expect(fileMatchesManifest(other, mm)).toMatchObject({ ok: false, code: "UpdateMismatch" });
  });
});

describe("compareBuilds", () => {
  it("C1 table", () => {
    expect(compareBuilds("0.3.16", "0.3.15")).toBe(1);
    expect(compareBuilds("0.3.15", "0.3.16")).toBe(-1);
    expect(compareBuilds("0.3", "0.3.0")).toBe(0);
    expect(compareBuilds("0.10.0", "0.9.9")).toBe(1);
    expect(compareBuilds("0.3.x", "0.3.0")).toBeNull();
    expect(compareBuilds("0.3.0", "")).toBeNull();
  });
});

describe("hardening", () => {
  it("V7 a signed version carrying a newline and a field is UpdateBad", () => {
    expect(code(verify(manifest({ version: "0.3.16\nsha256=x" })))).toBe("UpdateBad");
  });
  it("V7 a signed minBridge that is not dotted digits is UpdateBad", () => {
    expect(code(verify(manifest({ minBridge: "0.3.1\n" })))).toBe("UpdateBad");
  });
});

describe("SU-5a signature rules", () => {
  it("L5 a manifest signed for another origin is UpdateSignature", () => {
    expect(code(verify(manifest(), { origin: "https://other.example.test" }))).toBe("UpdateSignature");
    expect(code(verify(manifest()))).toBe("ok");
  });
  it("L5 a bridge with no origin cannot verify (UpdateOff)", () => {
    expect(code(verify(manifest(), { origin: "" }))).toBe("UpdateOff");
  });
  it("L5 signedAt 401 days old is UpdateBad (too old to trust); 399 days is ok", () => {
    const at = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().replace(/\.\d+Z$/, "Z");
    const old = verify(manifest({ signedAt: at(401) }));
    expect(code(old)).toBe("UpdateBad");
    expect(old.message).toContain("too old to trust");
    expect(code(verify(manifest({ signedAt: at(399) })))).toBe("ok");
  });
  it("L6 a signature spelled any other way is UpdateSignature (unpadded, newline, trailing junk, wrong length)", () => {
    const m = manifest();
    const sig = m.signature;
    expect(sig).toMatch(/^[A-Za-z0-9+/]{86}==$/);
    for (const bad of [sig.replace(/=+$/, ""), sig.slice(0, 20) + "\n" + sig.slice(20), sig + "!!", sig + "\n", sig.replace(/\+/g, "-").replace(/\//g, "_").replace(/==$/, ""), sig.slice(0, 40) + "==", Buffer.alloc(63, 1).toString("base64")]) {
      expect(code(verify({ ...m, signature: bad }))).toBe("UpdateSignature");
    }
  });
});
