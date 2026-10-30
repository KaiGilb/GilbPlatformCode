// Ported from the source's headerLayout test (all 6 cases), then new cases for the exact numbers and the tier edges.
// The header line's arithmetic, as a pure function (jsdom has no layout): the name keeps a readable width at every header width down to the
// 275 px drawer of a 320 px phone, and nothing runs past the header.
import { describe, expect, it } from "vitest";
import { AVATAR_MENU, headerLayout, nameBudget } from "./headerLayout";

/** The widths the HEADER really has (measured in a browser): inside the detail drawer on a 320 / 360 / 390 / 430 px phone the header is the drawer
 *  (86% of the screen, at most 380 px) less its 32 px padded column; also a right pane (376), a card view on a phone, and wide. */
const DRAWER = { 320: 243, 360: 278, 390: 303, 430: 338 } as const;

describe("the header line at every width (ported)", () => {
  it("the name keeps at least 90 px from the 390 px phone's drawer up, at least 80 px in the 360 px phone's, at least 60 px in the 320 px phone's", () => {
    for (const w of [DRAWER[390], DRAWER[430], 376, 390, 440, 700, 1000]) expect(nameBudget(w, true, "full"), `width ${w}`).toBeGreaterThanOrEqual(90);
    expect(nameBudget(DRAWER[360], true, "full")).toBeGreaterThanOrEqual(80);
    expect(nameBudget(DRAWER[320], true, "full")).toBeGreaterThanOrEqual(60);
  });

  it("at 390 px the drawer's name column is at least 100 px (it was 0 px), and the right pane's at least 150 px (it was about 60)", () => {
    expect(nameBudget(DRAWER[390], true, "full")).toBeGreaterThanOrEqual(100);
    expect(nameBudget(376, true, "full")).toBeGreaterThanOrEqual(150);
  });

  it("the picture and the buttons are never so wide that the buttons pass the header's right edge", () => {
    for (const w of [243, 269, 270, 278, 303, 338, 376, 439, 440, 600, 1000]) {
      for (const writable of [true, false]) {
        const l = headerLayout(w, "full");
        const used = l.padX + l.avatar + (writable ? 32 : 0) + l.gap + l.actionsWidth + 0; /* the name block takes the rest */
        expect(used + l.gap, `width ${w}`).toBeLessThanOrEqual(w);
      }
    }
  });

  it("narrow widths get the small picture and the compact (icon) buttons; the wide card keeps the large picture and the words", () => {
    expect(headerLayout(243, "full")).toMatchObject({ tier: "s", compact: true, avatar: 40 });
    expect(headerLayout(303, "full")).toMatchObject({ tier: "m", compact: true, avatar: 48 });
    expect(headerLayout(376, "full")).toMatchObject({ tier: "m", compact: true });
    expect(headerLayout(900, "content")).toMatchObject({ tier: "l", compact: false, avatar: 96 });
    expect(headerLayout(900, "full")).toMatchObject({ tier: "l", compact: false, avatar: 128 });
  });

  it("an unknown width (not measured yet, or no layout) keeps the regular header", () => {
    expect(headerLayout(null, "full")).toMatchObject({ tier: "l", compact: false });
    expect(headerLayout(0, "full")).toMatchObject({ tier: "l", compact: false });
  });

  it("the tier steps only upward with the width (a wider header never gets a smaller picture)", () => {
    let last = 0;
    for (let w = 250; w <= 1200; w += 5) {
      const a = headerLayout(w, "full").avatar;
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
  });
});

describe("headerLayout, the exact layouts", () => {
  it("the three tiers, number for number", () => {
    expect(headerLayout(200, "full")).toEqual({ tier: "s", avatar: 40, compact: true, gap: 6, actionsWidth: 80, padX: 16 });
    expect(headerLayout(300, "full")).toEqual({ tier: "m", avatar: 48, compact: true, gap: 8, actionsWidth: 84, padX: 16 });
    expect(headerLayout(500, "full")).toEqual({ tier: "l", avatar: 128, compact: false, gap: 12, actionsWidth: 98, padX: 32 });
  });
  it("the tier edges: under 270 is s, 270 up to under 440 is m, 440 and over is l", () => {
    expect(headerLayout(269.9, "full").tier).toBe("s");
    expect(headerLayout(270, "full").tier).toBe("m");
    expect(headerLayout(439.9, "full").tier).toBe("m");
    expect(headerLayout(440, "full").tier).toBe("l");
  });
  it("an unknown, zero or negative width is the regular header, in every placement", () => {
    for (const w of [null, 0, -1, -300]) {
      expect(headerLayout(w, "full")).toEqual({ tier: "l", avatar: 128, compact: false, gap: 12, actionsWidth: 98, padX: 32 });
      expect(headerLayout(w, "actions").avatar).toBe(128);
      expect(headerLayout(w, "content").avatar).toBe(96);
    }
  });
  it("the placement changes the picture only in the regular tier: content has 96 px, full and actions 128 px", () => {
    expect(headerLayout(900, "content").avatar).toBe(96);
    expect(headerLayout(900, "full").avatar).toBe(128);
    expect(headerLayout(900, "actions").avatar).toBe(128);
    for (const w of [200, 300]) for (const p of ["full", "content", "actions"] as const) expect(headerLayout(w, p)).toEqual(headerLayout(w, "full"));
  });
  it("every call returns a new object (a caller may keep or change it)", () => {
    expect(headerLayout(900, "full")).not.toBe(headerLayout(900, "full"));
  });
});

describe("nameBudget", () => {
  it("is the width less the padding, the picture, the two gaps and the buttons, number for number", () => {
    expect(AVATAR_MENU).toBe(32);
    expect(nameBudget(243, false, "full")).toBe(243 - 16 - 40 - 2 * 6 - 80); // 95
    expect(nameBudget(300, false, "full")).toBe(300 - 16 - 48 - 2 * 8 - 84); // 136
    expect(nameBudget(600, false, "full")).toBe(600 - 32 - 128 - 2 * 12 - 98); // 318
    expect(nameBudget(600, false, "content")).toBe(600 - 32 - 96 - 2 * 12 - 98); // 350
  });
  it("a picture menu takes 32 px more from the name in every tier", () => {
    for (const w of [243, 300, 600]) expect(nameBudget(w, false, "full") - nameBudget(w, true, "full")).toBe(AVATAR_MENU);
  });
  it("a narrower header never gives the name more room", () => {
    let last = -Infinity;
    for (let w = 270; w <= 439; w += 1) {
      const b = nameBudget(w, true, "full");
      expect(b).toBeGreaterThanOrEqual(last);
      last = b;
    }
  });
});
