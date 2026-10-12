// The two-pictures contract, tested where every app will meet it.
//
// These assertions are the reason two apps cannot drift apart on what a marked area means or on
// what the server's answer is. Each one is written so the WRONG behaviour fails it: a test that
// only restated the implementation would be no guard at all.

import { describe, it, expect } from "vitest";
import {
  FACE_WHOLE,
  clampFaceRect,
  faceQueryValue,
  rectFromDisplayedBox,
  initialSquare,
} from "./faceRect";
import {
  CROPPED_FROM_ATTR,
  appendFaceQuery,
  faceEntityFor,
  leanFaceNotice,
  masterBehindFace,
  fileIdFromEntityUri,
  canRecut,
  faceLocationFor,
  type UploadAck,
  type MasterLookup,
} from "./leanFace";

const ackBase = { entity: "https://vault-a.example.test/base/e/master1", contentHash: "a".repeat(64), byteSize: 8_500_027, created: true };

describe("skipping the crop asks for a face, it does not decline one", () => {
  it("sends face=whole when nothing was marked", () => {
    // 🔴 The trap this guards: treating "no rectangle" as "no ?face=" at all. Omitting the
    // parameter is how a DOCUMENT upload says "do not make a face", so an app that did that
    // would silently leave every non-cropping person on an 8 MB original.
    expect(faceQueryValue(null)).toBe(FACE_WHOLE);
    const params = new URLSearchParams();
    appendFaceQuery(params, null);
    expect(params.get("face")).toBe("whole");
    expect(params.toString()).toContain("face=whole");
  });

  it("sends the four fractions when something was marked", () => {
    const params = new URLSearchParams();
    appendFaceQuery(params, { x: 0.25, y: 0.1, width: 0.5, height: 0.5 });
    expect(params.get("face")).toBe("0.25,0.1,0.5,0.5");
  });

  it("rounds to six decimals so a drag cannot make an unbounded URL", () => {
    expect(faceQueryValue({ x: 1 / 3, y: 1 / 7, width: 0.5, height: 0.5 })).toBe("0.333333,0.142857,0.5,0.5");
  });
});

describe("a box on screen becomes the right fractions", () => {
  it("does NOT copy width into height on a non-square picture", () => {
    // The specific bug this exists to catch: a 200 px square box on a 400x200 preview is
    // 0.5 of the width but 1.0 of the height. Faking "a square rect" by setting height = width
    // would crop a half-height band and cut the person's chin off.
    const rect = rectFromDisplayedBox({ left: 100, top: 0, size: 200 }, { width: 400, height: 200 });
    expect(rect.x).toBeCloseTo(0.25, 10);
    expect(rect.y).toBeCloseTo(0, 10);
    expect(rect.width).toBeCloseTo(0.5, 10);
    expect(rect.height).toBeCloseTo(1, 10);
    expect(rect.width).not.toBeCloseTo(rect.height, 3);
  });

  it("is square in fractions exactly when the picture is square", () => {
    const rect = rectFromDisplayedBox({ left: 50, top: 50, size: 100 }, { width: 200, height: 200 });
    expect(rect.width).toBeCloseTo(rect.height, 10);
  });

  it("survives a zero-sized preview instead of emitting NaN", () => {
    // A preview measured before layout reports 0. NaN fractions would reach the server as
    // "NaN,NaN,NaN,NaN" and 400 the upload, losing the person's picture choice for a race.
    const rect = rectFromDisplayedBox({ left: 10, top: 10, size: 10 }, { width: 0, height: 0 });
    expect(rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("opens centred and inside the picture", () => {
    const sq = initialSquare({ width: 400, height: 200 });
    expect(sq.size).toBeCloseTo(160, 10);
    expect(sq.left).toBeCloseTo(120, 10);
    expect(sq.top).toBeCloseTo(20, 10);
  });
});

describe("clamping keeps a dragged box legal", () => {
  it("pulls an out-of-bounds box back inside", () => {
    expect(clampFaceRect({ x: -1, y: -1, width: 5, height: 5 })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("falls back to the whole picture rather than emitting a zero-area rectangle", () => {
    expect(clampFaceRect({ x: 1, y: 1, width: 0.5, height: 0.5 })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe("which picture the profile photo points at", () => {
  it("points at the LEAN face when one was made", () => {
    const ack: UploadAck = {
      ...ackBase,
      leanFace: { kind: "stored", entity: "https://vault-a.example.test/base/e/lean1", id: "lean1", byteSize: 12_800, contentHash: "b".repeat(64), width: 256, height: 256, cropped: true, linkedToMaster: true },
    };
    expect(faceEntityFor(ack)).toBe("https://vault-a.example.test/base/e/lean1");
    // ⛔ NOT the ack's Location header, which names the master.
    expect(faceLocationFor(ack)).toBe("/files/lean1");
    expect(leanFaceNotice(ack)).toBeNull();
  });

  it("falls back to the master when the server could not make one — never to nothing", () => {
    // A person whose HEIC the server cannot decode still gets a working face. Returning null
    // here, or throwing, would leave them with no picture at all over a format question.
    const ack: UploadAck = { ...ackBase, leanFace: { kind: "skipped", reason: "not-an-image", detail: "x" } };
    expect(faceEntityFor(ack)).toBe(ackBase.entity);
    expect(faceLocationFor(ack)).toBe("/files/master1");
    expect(leanFaceNotice(ack)).toMatch(/slowly/);
  });

  it("says so out loud when the derivation FAILED", () => {
    // "Your photo is set and fast" while serving the original is the defect this notice refuses
    // to repeat. A side effect that did not happen is reported.
    const ack: UploadAck = { ...ackBase, leanFace: { kind: "failed", detail: "boom" } };
    expect(faceEntityFor(ack)).toBe(ackBase.entity);
    expect(leanFaceNotice(ack)).not.toBeNull();
  });

  it("stays quiet when the picture was already small enough", () => {
    // Nothing went wrong and nothing is slow — there is nothing to tell the person.
    const ack: UploadAck = { ...ackBase, leanFace: { kind: "skipped", reason: "already-lean", detail: "x" } };
    expect(leanFaceNotice(ack)).toBeNull();
  });

  it("is quiet on an upload that never asked for a face", () => {
    expect(leanFaceNotice(ackBase)).toBeNull();
    expect(faceEntityFor(ackBase)).toBe(ackBase.entity);
  });
});

describe("the link back to the master", () => {
  const master = "https://vault-a.example.test/base/e/master1";

  it("reads the {@id} reference-node shape", () => {
    expect(masterBehindFace({ [CROPPED_FROM_ATTR]: { "@id": master } })).toBe(master);
  });

  it("reads the flattened bare-string VALUE shape", () => {
    // The flat-record plane collapses an edge's value to a string. Both value shapes are live.
    expect(masterBehindFace({ [CROPPED_FROM_ATTR]: master })).toBe(master);
  });

  it("returns null for a face that is not a crop — absence is NOT an error", () => {
    // Every face uploaded before lean faces existed is in exactly this state. An app that treated a
    // missing edge as a fault would break every existing profile photo in both apps.
    expect(masterBehindFace({ "a:fileName": "portrait.jpg" })).toBeNull();
  });

  it("does NOT treat a failed read as 'there is no bigger picture'", () => {
    // 🔴 The defect this locks out: collapsing "measured: no crop edge" and "could not ask"
    // into one value. A 401, a 500 or being offline would then present as the settled fact
    // that no master exists, and the UI would hide the whole-picture view and "Cut again…"
    // as though it had checked. A failed read is not an absence.
    expect(canRecut({ kind: "master", ref: master })).toBe(true);
    expect(canRecut({ kind: "none" })).toBe(false);
    // ⚠ `unknown` is not `none`. It must not offer a re-cut (it cannot know one works) and it
    // must not be reported to anyone as an absence of one.
    expect(canRecut({ kind: "unknown", reason: "401" })).toBe(false);
    const unknown: MasterLookup = { kind: "unknown", reason: "offline" };
    expect(unknown.kind).not.toBe("none");
  });

  it("reads only the ADJUDICATED spelling, not a hand-kept list", () => {
    // The term is minted `a:predicateAttribute: "a:croppedFrom"` and the server writes exactly
    // that. A speculative bare spelling with no measured producer is a list this package's own
    // doctrine forbids. Both VALUE SHAPES are still read — shapes are not spellings.
    expect(masterBehindFace({ croppedFrom: master })).toBeNull();
    expect(masterBehindFace({ [CROPPED_FROM_ATTR]: master })).toBe(master);
    expect(masterBehindFace({ [CROPPED_FROM_ATTR]: { "@id": master } })).toBe(master);
  });

  it("ignores an empty or blank edge rather than offering a broken re-cut", () => {
    expect(masterBehindFace({ [CROPPED_FROM_ATTR]: "   " })).toBeNull();
    expect(masterBehindFace({ [CROPPED_FROM_ATTR]: { "@id": "" } })).toBeNull();
    expect(masterBehindFace({ [CROPPED_FROM_ATTR]: null })).toBeNull();
  });

  it("takes the file id off an entity URI", () => {
    expect(fileIdFromEntityUri(master)).toBe("master1");
    expect(fileIdFromEntityUri("https://vault-a.example.test/vault/e/abc123/")).toBe("abc123");
    expect(fileIdFromEntityUri("https://vault-a.example.test/base/e/abc123?at=2026-01-01")).toBe("abc123");
  });
});
