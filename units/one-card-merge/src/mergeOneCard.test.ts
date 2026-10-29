// The merge of a linked person's online card (theirs, the master) and the holder's own record and held claims (yours) into ONE
// card's groups of rows. Pure: no fetch, no write, no React.
import { describe, expect, it } from "vitest";
import {
  compareRuleOf,
  mergeOneCard,
  normalizeForCompare,
  slotLabel,
  type OneCardField,
} from "./index";
import { parseOnlineCard, rungChipWords, type OnlineCard } from "@kaigilb/gilbplatformcode-online-card";

// --- Fixture: a person kind's field set as the master serves it (shape of `StakeholderField`), in a display order ---
const field = (slug: string, label: string | null, many: boolean, extra: string[] = []): OneCardField => ({
  term: `https://master.example/base/t/${slug}`,
  label,
  readKeys: [`a:${slug}`, slug, ...extra.flatMap((x) => [`a:${x}`, x])],
  writeKey: `a:${slug}`,
  many,
});
const GIVEN = field("givenName", "Given name", false);
const FAMILY = field("familyName", "Family name", false);
const EMAIL = field("email", "Email", true);
// One field, two spellings: the current one and a retired one (`a:deprecatedNotation`), as the master can serve.
const PHONE = field("phone", "Phone", false, ["fixtureTelephone"]);
const BIRTHDAY = field("birthDate", "Birthday", false);
const SKILL = field("skill", "Skill", true);
const ORDER = [GIVEN, FAMILY, EMAIL, PHONE, BIRTHDAY, SKILL];

const P = "https://ann.example.test/";
/** An online card as `parseOnlineCard` makes it from a card-route body. */
const card = (fields: { field: string; value: string; rung: string; slot?: string; kind?: string }[], extra: Record<string, unknown> = {}): OnlineCard =>
  parseOnlineCard(P, { fields: fields.map((f) => ({ principal: P, ...f })), ...extra });

const ANN = card(
  [
    { field: "a:givenName", value: "Ann", rung: "public" },
    { field: "a:familyName", value: "Lund", rung: "public" },
    { field: "a:email", value: "ann@example.test", rung: "t:EitherContextFirstDegreeGrantee" },
    { field: "a:phone", value: "+47 900 12 345", rung: "t:EitherContextCloseCircleGrantee" },
  ],
  { photoUrl: "/base/connect/photo?principal=ann", skills: [{ skillUri: "https://master.example/base/e/planguage", rung: "t:ProfessionalFirstDegreeGrantee", note: "deep" }] },
);

const groupOf = (out: ReturnType<typeof mergeOneCard>, f: OneCardField) => out.groups.find((g) => g.term === f.term);

describe("mergeOneCard", () => {
  describe("only on their card", () => {
    // Only on their card: one row, mark Theirs, shown with the rung's chip words, read-only.
    it("is one row, theirs, with the rung and its chip words, not editable", () => {
      const out = mergeOneCard({ online: ANN, own: {}, fieldOrder: ORDER });
      const email = groupOf(out, EMAIL)!;
      expect(email.rows).toEqual([
        {
          field: "a:email",
          value: "ann@example.test",
          source: "theirs",
          rung: "t:EitherContextFirstDegreeGrantee",
          rungWords: rungChipWords("t:EitherContextFirstDegreeGrantee"),
          editable: false,
        },
      ]);
      expect(email.bothKept).toBe(false);
    });

    it("uses the rung words the caller passes, and rungChipWords when none is passed", () => {
      const out = mergeOneCard({ online: ANN, own: {}, fieldOrder: ORDER, rungWords: (r) => `<${r}>` });
      expect(groupOf(out, GIVEN)!.rows[0].rungWords).toBe("<public>");
      expect(groupOf(mergeOneCard({ online: ANN, own: {}, fieldOrder: ORDER }), GIVEN)!.rows[0].rungWords).toBe("Public");
    });
  });

  describe("only on yours", () => {
    // Only on yours: one row, mark Yours, editable.
    it("is one row, yours, editable, with no rung", () => {
      const out = mergeOneCard({ online: ANN, own: { facts: { birthDate: "14 March" } }, fieldOrder: ORDER });
      expect(groupOf(out, BIRTHDAY)!.rows).toEqual([{ field: "a:birthDate", value: "14 March", source: "yours", editable: true }]);
    });

    it("reads a held claim (t:HeldPartyFieldClaim) as yours, with its note and its entity", () => {
      const out = mergeOneCard({
        online: null,
        own: { heldClaims: [{ predicate: "a:skill", value: "https://master.example/base/e/rust", note: "learning", entity: "https://v.example/base/e/c1" }] },
        fieldOrder: ORDER,
      });
      expect(groupOf(out, SKILL)!.rows).toEqual([
        { field: "a:skill", value: "https://master.example/base/e/rust", source: "yours", editable: true, notes: ["learning"], claims: ["https://v.example/base/e/c1"] },
      ]);
    });
  });

  describe("both, different values", () => {
    // Both, different values: both rows in the same group, theirs first, plus a note that both are kept.
    it("keeps both rows, theirs first, and says both are kept on a one-value field", () => {
      const out = mergeOneCard({ online: ANN, own: { facts: { phone: "+47 913 55 210" } }, fieldOrder: ORDER });
      const phone = groupOf(out, PHONE)!;
      expect(phone.rows.map((r) => [r.source, r.value])).toEqual([
        ["theirs", "+47 900 12 345"],
        ["yours", "+47 913 55 210"],
      ]);
      expect(phone.rows[0].sameAsTheirs).toBeUndefined();
      expect(phone.bothKept).toBe(true);
    });

    it("does not say both are kept on a field that holds several values: there two values are simply two values", () => {
      const out = mergeOneCard({ online: ANN, own: { facts: { email: "jg@private.example" } }, fieldOrder: ORDER });
      const email = groupOf(out, EMAIL)!;
      expect(email.rows.map((r) => r.source)).toEqual(["theirs", "yours"]);
      expect(email.bothKept).toBe(false);
    });
  });

  describe("both, equal values", () => {
    // Both, equal values (normalised): one row, theirs, "You have the same on your card".
    it("is one theirs row marked sameAsTheirs; the holder's equal value is not a second row", () => {
      const out = mergeOneCard({ online: ANN, own: { facts: { email: "  Ann@EXAMPLE.test " } }, fieldOrder: ORDER });
      const email = groupOf(out, EMAIL)!;
      expect(email.rows).toHaveLength(1);
      expect(email.rows[0]).toMatchObject({ source: "theirs", value: "ann@example.test", sameAsTheirs: true, editable: false });
      expect(email.bothKept).toBe(false);
    });

    it("matches a phone by its digits", () => {
      const out = mergeOneCard({ online: ANN, own: { facts: { phone: "+47-90012345" } }, fieldOrder: ORDER });
      expect(groupOf(out, PHONE)!.rows).toEqual([expect.objectContaining({ source: "theirs", sameAsTheirs: true })]);
    });

    it("matches any other field exactly after trim (case counts)", () => {
      const equal = mergeOneCard({ online: ANN, own: { facts: { givenName: " Ann " } }, fieldOrder: ORDER });
      expect(groupOf(equal, GIVEN)!.rows).toEqual([expect.objectContaining({ source: "theirs", sameAsTheirs: true })]);
      const differ = mergeOneCard({ online: ANN, own: { facts: { givenName: "ann" } }, fieldOrder: ORDER });
      expect(groupOf(differ, GIVEN)!.rows.map((r) => r.source)).toEqual(["theirs", "yours"]);
    });

    it("matches a held skill claim to their skill by the skill's IRI, with the caller's skill predicate", () => {
      const out = mergeOneCard({
        online: ANN,
        own: { heldClaims: [{ predicate: "a:skill", value: "https://master.example/base/e/planguage" }] },
        fieldOrder: ORDER,
        skillPredicate: "a:skill",
      });
      const skill = groupOf(out, SKILL)!;
      expect(skill.rows).toEqual([
        expect.objectContaining({ field: "a:skill", source: "theirs", value: "https://master.example/base/e/planguage", sameAsTheirs: true, notes: ["deep"] }),
      ]);
    });
  });

  describe("repeating fields", () => {
    // Repeating fields: matched value by value, never by position.
    it("matches value by value whatever the order, keeps each unmatched value, and never makes one value two rows", () => {
      const online = card([
        { field: "a:email", value: "a@x.example", rung: "public" },
        { field: "a:email", value: "b@x.example", rung: "t:SignedInGrantee" },
      ]);
      const out = mergeOneCard({ online, own: { facts: { email: ["c@x.example", "B@x.example", "b@x.example "] } }, fieldOrder: ORDER });
      expect(groupOf(out, EMAIL)!.rows.map((r) => [r.source, r.value, r.sameAsTheirs ?? false])).toEqual([
        ["theirs", "a@x.example", false],
        ["theirs", "b@x.example", true],
        ["yours", "c@x.example", false],
      ]);
    });

    it("reads every spelling of the field (a retired one included) as one field, and one value under two spellings is one row", () => {
      const out = mergeOneCard({ online: null, own: { facts: { "a:phone": "+47 1", fixtureTelephone: ["+47 1", "+47 2"] } }, fieldOrder: ORDER });
      expect(groupOf(out, PHONE)!.rows.map((r) => r.value)).toEqual(["+47 1", "+47 2"]);
    });

    it("keeps their same value served at two rungs as two rows, and the holder's equal value marks the first", () => {
      const online = card([
        { field: "a:email", value: "a@x.example", rung: "public" },
        { field: "a:email", value: "a@x.example", rung: "t:SignedInGrantee" },
      ]);
      const out = mergeOneCard({ online, own: { facts: { email: "a@x.example" } }, fieldOrder: ORDER });
      expect(groupOf(out, EMAIL)!.rows.map((r) => [r.rung, r.sameAsTheirs ?? false])).toEqual([
        ["public", true],
        ["t:SignedInGrantee", false],
      ]);
    });
  });

  describe("hidden or empty on their card", () => {
    // Empty or hidden online field: not drawn, never hinted, never compared.
    it("draws a field hidden from the holder only from his own value: no theirs row, no mark of sameness, no hint", () => {
      const online = card([{ field: "a:givenName", value: "Ann", rung: "public" }]);
      const out = mergeOneCard({ online, own: { facts: { phone: "+47 900 12 345" } }, fieldOrder: ORDER });
      const phone = groupOf(out, PHONE)!;
      expect(phone.rows).toEqual([{ field: "a:phone", value: "+47 900 12 345", source: "yours", editable: true }]);
      expect(phone.bothKept).toBe(false);
      expect(JSON.stringify(phone)).not.toMatch(/theirs|rung|same/i);
    });

    it("never draws or compares an empty or blank value on either side", () => {
      const online: OnlineCard = {
        principal: P,
        fields: [
          { predicate: "a:email", value: "   ", rung: "public", sourceEntity: null },
          { predicate: "a:phone", value: "", rung: "public", sourceEntity: null },
        ],
        skills: [{ skillUri: " ", rung: "public" }],
        photoUrl: "",
      };
      const out = mergeOneCard({
        online,
        own: { facts: { email: "", phone: ["  ", null], birthDate: [] }, heldClaims: [{ predicate: "a:skill", value: "  " }] },
        fieldOrder: ORDER,
        skillPredicate: "a:skill",
      });
      expect(out.groups).toEqual([]);
    });

    it("does not compare a blank own value with a blank theirs value", () => {
      const online: OnlineCard = { principal: P, fields: [{ predicate: "a:phone", value: " ", rung: "public", sourceEntity: null }], skills: [], photoUrl: null };
      const out = mergeOneCard({ online, own: { facts: { phone: "+47 5" } }, fieldOrder: ORDER });
      expect(groupOf(out, PHONE)!.rows).toEqual([{ field: "a:phone", value: "+47 5", source: "yours", editable: true }]);
    });
  });

  describe("groups", () => {
    it("orders groups by the field set the caller passes, and leaves out fields with no value on either side", () => {
      const out = mergeOneCard({ online: ANN, own: { facts: { birthDate: "14 March" } }, fieldOrder: ORDER, skillPredicate: "a:skill" });
      expect(out.groups.map((g) => g.label)).toEqual(["Given name", "Family name", "Email", "Phone", "Birthday", "Skill"]);
      const reversed = mergeOneCard({ online: ANN, own: {}, fieldOrder: [...ORDER].reverse() });
      // No skill predicate named: their skills come last, under the card route's key, unlabelled.
      expect(reversed.groups.map((g) => g.label)).toEqual(["Phone", "Email", "Family name", "Given name", null]);
    });

    it("identifies a field by its predicate, never by its label", () => {
      const sameLabel = { ...EMAIL, label: "Phone" };
      const out = mergeOneCard({ online: ANN, own: {}, fieldOrder: [sameLabel, PHONE] });
      expect(out.groups[0]).toMatchObject({ term: EMAIL.term, label: "Phone" });
      expect(out.groups[0].rows[0].value).toBe("ann@example.test");
      expect(out.groups[1].rows[0].value).toBe("+47 900 12 345");
    });
  });

  describe("unknown predicate", () => {
    // The field set decides what a card OFFERS, never what exists (fieldSets.ts): a value the read returned is never hidden.
    it("shows their field with a predicate the field set does not know, after the known groups, labelled null, unmerged with others", () => {
      const online = card([
        { field: "a:fooBar", value: "x", rung: "public" },
        { field: "a:givenName", value: "Ann", rung: "public" },
      ]);
      const out = mergeOneCard({ online, own: { heldClaims: [{ predicate: "a:fooBar", value: "y" }] }, fieldOrder: ORDER });
      expect(out.groups.map((g) => g.field)).toEqual(["a:givenName", "a:fooBar"]);
      const foo = out.groups[1];
      expect(foo).toMatchObject({ term: null, label: null, known: false, bothKept: false });
      expect(foo.rows.map((r) => [r.source, r.value])).toEqual([
        ["theirs", "x"],
        ["yours", "y"],
      ]);
    });

    it("shows their skills under the card route's own key when the caller names no skill predicate", () => {
      const out = mergeOneCard({ online: ANN, own: {}, fieldOrder: ORDER });
      const skills = out.groups.find((g) => g.field === "skills")!;
      expect(skills).toMatchObject({ term: null, known: false });
      expect(skills.rows).toEqual([
        expect.objectContaining({ field: "skills", source: "theirs", value: "https://master.example/base/e/planguage", notes: ["deep"] }),
      ]);
    });

    it("ignores an own fact that is not a field of the set: the record's other facts are not card rows", () => {
      const out = mergeOneCard({ online: null, own: { facts: { sameAs: "https://ann.example.test/", type: "t:Person" } }, fieldOrder: ORDER });
      expect(out.groups).toEqual([]);
    });
  });

  describe("header identity", () => {
    // Name, photo (header): theirs if shared with the reader, else the record's; the badge only when linked.
    it("takes the name and photo from their card when they share them", () => {
      const out = mergeOneCard({ online: ANN, own: { name: "Ben", photo: "/mine.jpg" }, fieldOrder: ORDER });
      expect(out.header).toEqual({ name: "Ann Lund", nameSource: "theirs", photo: "/base/connect/photo?principal=ann", photoSource: "theirs", linked: true });
    });

    it("takes the record's name and photo when their card shares neither", () => {
      const online = card([{ field: "a:email", value: "j@x.example", rung: "public" }]);
      const out = mergeOneCard({ online, own: { name: " Ben ", photo: "/mine.jpg" }, fieldOrder: ORDER });
      expect(out.header).toEqual({ name: "Ben", nameSource: "yours", photo: "/mine.jpg", photoSource: "yours", linked: true });
    });

    it("says none when neither side has a name or a photo (the app draws initials)", () => {
      const out = mergeOneCard({ online: card([]), own: { name: "  " }, fieldOrder: ORDER });
      expect(out.header).toEqual({ name: null, nameSource: "none", photo: null, photoSource: "none", linked: true });
    });
  });

  // The purpose the server recovered for a value (its slot) travels to the row as its label ("Work", "Mobile", "Home").
  describe("the label of their value", () => {
    const slotted = (fields: { field: string; value: string; rung: string; slot?: string; kind?: string }[]) => card(fields);
    it("carries a slot <kind>-<purpose> as the row's label", () => {
      const online = slotted([
        { field: "a:email", value: "w@x.no", rung: "public", slot: "email-work", kind: "email" },
        { field: "a:phone", value: "+47 900", rung: "public", slot: "phone-mobile", kind: "phone" },
      ]);
      const out = mergeOneCard({ online, own: {}, fieldOrder: ORDER });
      expect(groupOf(out, EMAIL)!.rows[0]!.label).toBe("Work");
      expect(groupOf(out, PHONE)!.rows[0]!.label).toBe("Mobile");
    });
    it("reads one app's own slots as that app does (email: Work, emailPrivate: Private)", () => {
      const online = slotted([
        { field: "a:email", value: "w@x.no", rung: "public", slot: "email", kind: "email" },
        { field: "a:email", value: "h@x.no", rung: "public", slot: "emailPrivate", kind: "email" },
      ]);
      const out = mergeOneCard({ online, own: {}, fieldOrder: ORDER });
      expect(groupOf(out, EMAIL)!.rows.map((r) => r.label)).toEqual(["Work", "Private"]);
      expect(slotLabel("email")).toBe("Work");
      expect(slotLabel("emailPrivate")).toBe("Private");
    });
    it("gives no label for no slot, the default slot, or a slot that names no purpose; a row of yours has none", () => {
      const online = slotted([
        { field: "a:givenName", value: "Ann", rung: "public", slot: "default" },
        { field: "a:email", value: "a@x.no", rung: "public" },
        { field: "a:phone", value: "+47 1", rung: "public", slot: "x9" },
      ]);
      // a slot that is the kind itself states no purpose (rig: job title served with slot "job-title" drew "Title")
      expect(slotLabel("job-title", "job-title")).toBeNull();
      expect(slotLabel("email-work", "phone")).toBeNull();
      expect(slotLabel("email-work", undefined)).toBeNull();
      expect(slotLabel("email-work", "email")).toBe("Work");
      const out = mergeOneCard({ online, own: { facts: { phone: "+47 2" } }, fieldOrder: ORDER });
      expect(groupOf(out, GIVEN)!.rows[0]!.label).toBeUndefined();
      expect(groupOf(out, EMAIL)!.rows[0]!.label).toBeUndefined();
      expect(groupOf(out, PHONE)!.rows.map((r) => r.label)).toEqual([undefined, undefined]);
      expect(slotLabel(undefined)).toBeNull();
      expect(slotLabel("default")).toBeNull();
    });
  });

  describe("no online card", () => {
    // No live-link badge, no marks in the card; every row is the holder's own.
    it("gives every row as yours, no marks, no badge, the record's name", () => {
      const out = mergeOneCard({
        online: null,
        own: { name: "Ada Berg", facts: { givenName: "Ada", email: "ada.berg@example.no", phone: "+34 611 22 33 44" } },
        fieldOrder: ORDER,
      });
      expect(out.marks).toBe(false);
      expect(out.header).toEqual({ name: "Ada Berg", nameSource: "yours", photo: null, photoSource: "none", linked: false });
      const rows = out.groups.flatMap((g) => g.rows);
      expect(rows).toHaveLength(3);
      for (const r of rows) {
        expect(r.source).toBe("yours");
        expect(r.editable).toBe(true);
        expect(r.sameAsTheirs).toBeUndefined();
        expect(r.rung).toBeUndefined();
      }
      expect(out.groups.every((g) => !g.bothKept)).toBe(true);
    });

    it("marks rows when an online card is linked, even when it shares nothing (two sources)", () => {
      expect(mergeOneCard({ online: card([]), own: { facts: { email: "a@x.example" } }, fieldOrder: ORDER }).marks).toBe(true);
    });
  });

  describe("one value is one row, and nothing of the holder's is lost", () => {
    it("gives a fact key read by two fields to the first of them only", () => {
      const CONTACT = { ...field("contactEmail", "Contact email", true), readKeys: ["a:contactEmail", "contactEmail", "email"] };
      const online = card([{ field: "a:email", value: "x@y.no", rung: "public" }]);
      const out = mergeOneCard({ online, own: { facts: { email: "x@y.no" } }, fieldOrder: [EMAIL, CONTACT] });
      expect(out.groups.flatMap((g) => g.rows).map((r) => [r.field, r.source, r.sameAsTheirs ?? false])).toEqual([["a:email", "theirs", true]]);
    });

    it("folds a held claim into an equal fact or claim of yours and keeps its note and every claim entity", () => {
      const out = mergeOneCard({
        online: null,
        own: {
          facts: { skill: "s/1" },
          heldClaims: [
            { predicate: "a:skill", value: "s/1", note: "n", entity: "c1" },
            { predicate: "a:skill", value: " s/1 ", entity: "c2" },
          ],
        },
        fieldOrder: ORDER,
      });
      expect(groupOf(out, SKILL)!.rows).toEqual([{ field: "a:skill", value: "s/1", source: "yours", editable: true, notes: ["n"], claims: ["c1", "c2"] }]);
    });

    it("keeps the holder's note and claim on the theirs row his equal value folds into", () => {
      const out = mergeOneCard({
        online: ANN,
        own: { heldClaims: [{ predicate: "a:skill", value: "https://master.example/base/e/planguage", note: "mine", entity: "c1" }] },
        fieldOrder: ORDER,
        skillPredicate: "a:skill",
      });
      expect(groupOf(out, SKILL)!.rows).toEqual([
        expect.objectContaining({ source: "theirs", sameAsTheirs: true, notes: ["deep"], ownNotes: ["mine"], claims: ["c1"] }),
      ]);
    });

    it("reads a wrapped boolean and drops a number that is no value", () => {
      const B = field("flag", "Flag", true);
      const out = mergeOneCard({ online: null, own: { facts: { flag: [true, { "@value": false }, Number.NaN, { "@value": Infinity }] } }, fieldOrder: [B] });
      expect(out.groups[0].rows.map((r) => r.value)).toEqual(["true", "false"]);
    });

    it("finds the field of a bare served key when the field lists only the prefixed spelling", () => {
      const PREFIXED = { ...EMAIL, readKeys: ["a:email"] };
      const online = card([{ field: "email", value: "x@y.no", rung: "public" }]);
      const out = mergeOneCard({ online, own: { facts: { "a:email": "X@y.no" } }, fieldOrder: [PREFIXED] });
      expect(out.groups).toHaveLength(1);
      expect(out.groups[0]).toMatchObject({ term: EMAIL.term, known: true });
      expect(out.groups[0].rows).toEqual([expect.objectContaining({ source: "theirs", sameAsTheirs: true })]);
    });

    it("draws their same skill at the same rung once", () => {
      const online = parseOnlineCard(P, { fields: [], skills: [{ skillUri: "s/1", rung: "public" }, { skillUri: "s/1", rung: "public" }, { skillUri: "s/1", rung: "t:SignedInGrantee" }] });
      const out = mergeOneCard({ online, own: {}, fieldOrder: ORDER, skillPredicate: "a:skill" });
      expect(groupOf(out, SKILL)!.rows.map((r) => r.rung)).toEqual(["public", "t:SignedInGrantee"]);
    });

    it("compares the same letters in two Unicode forms as one value", () => {
      const online = card([{ field: "a:givenName", value: "Ren\u00e9", rung: "public" }]);
      const out = mergeOneCard({ online, own: { facts: { givenName: "Rene\u0301" } }, fieldOrder: ORDER });
      expect(groupOf(out, GIVEN)!.rows).toEqual([expect.objectContaining({ source: "theirs", sameAsTheirs: true })]);
    });
  });

  describe("one value is one row, every note kept, one equivalence of spellings", () => {
    it("shows their one value served under two spellings of one field (current and retired) once", () => {
      const online = card([
        { field: "a:phone", value: "+47 1", rung: "public" },
        { field: "a:fixtureTelephone", value: "+47 1", rung: "public" },
      ]);
      const out = mergeOneCard({ online, own: {}, fieldOrder: ORDER });
      expect(groupOf(out, PHONE)!.rows.map((r) => [r.source, r.value])).toEqual([["theirs", "+47 1"]]);
    });

    it("keeps every note when equal claims fold together, and when their repeated skill folds", () => {
      const own = { heldClaims: [{ predicate: "a:skill", value: "s/1", note: "first", entity: "c1" }, { predicate: "a:skill", value: "s/1", note: "second", entity: "c2" }] };
      expect(groupOf(mergeOneCard({ online: null, own, fieldOrder: ORDER }), SKILL)!.rows).toEqual([
        { field: "a:skill", value: "s/1", source: "yours", editable: true, notes: ["first", "second"], claims: ["c1", "c2"] },
      ]);
      const online = parseOnlineCard(P, { fields: [], skills: [{ skillUri: "s/1", rung: "public", note: "a" }, { skillUri: "s/1", rung: "public", note: "b" }] });
      const out = mergeOneCard({ online, own, fieldOrder: ORDER, skillPredicate: "a:skill" });
      expect(groupOf(out, SKILL)!.rows).toEqual([
        expect.objectContaining({ source: "theirs", notes: ["a", "b"], sameAsTheirs: true, ownNotes: ["first", "second"], claims: ["c1", "c2"] }),
      ]);
    });

    it("puts a:email and email in the one group and compares them, whichever spelling each field lists", () => {
      const A = { ...EMAIL, readKeys: ["a:email"] };
      const B = { ...field("contact", "Contact", true), readKeys: ["email"] };
      const online = card([{ field: "email", value: "x@y.no", rung: "public" }]);
      const out = mergeOneCard({ online, own: { facts: { email: "X@y.no" } }, fieldOrder: [A, B] });
      expect(out.groups).toHaveLength(1);
      expect(out.groups[0].term).toBe(EMAIL.term);
      expect(out.groups[0].rows).toEqual([expect.objectContaining({ source: "theirs", sameAsTheirs: true })]);
    });

    it("gives two fields that write one predicate two different group ids", () => {
      const TWIN = { ...field("emailTwin", "Twin", true), writeKey: "a:email" };
      const out = mergeOneCard({ online: null, own: { facts: { email: "a@x.no", emailTwin: "b@x.no" } }, fieldOrder: [EMAIL, TWIN] });
      expect(out.groups.map((g) => g.field)).toEqual(["a:email", TWIN.term]);
      expect(out.groups[1].rows[0].field).toBe(TWIN.term);
    });
  });

  describe("header name", () => {
    it("uses their name field as a complete name", () => {
      const online = card([{ field: "a:name", value: "Ann Lund", rung: "public" }]);
      expect(mergeOneCard({ online, own: { name: "Ben" }, fieldOrder: ORDER }).header).toMatchObject({ name: "Ann Lund", nameSource: "theirs" });
    });

    it("uses the record's name when their card shares only one name part", () => {
      const online = card([{ field: "a:familyName", value: "Lund", rung: "public" }]);
      expect(mergeOneCard({ online, own: { name: "Ben Lund" }, fieldOrder: ORDER }).header).toMatchObject({ name: "Ben Lund", nameSource: "yours" });
    });

    it("uses the parts they share when the record has no name", () => {
      const online = card([{ field: "a:familyName", value: "Lund", rung: "public" }]);
      expect(mergeOneCard({ online, own: {}, fieldOrder: ORDER }).header).toMatchObject({ name: "Lund", nameSource: "theirs" });
    });
  });

  describe("phone forms and twins", () => {
    it("a phone with a leading international 00 equals the same number with +", () => {
      const online = card([{ field: "a:phone", value: "0047 900 12 345", rung: "t:SignedInGrantee" }]);
      const out = mergeOneCard({ online, own: { facts: { phone: "+47 900 12 345" } }, fieldOrder: ORDER });
      const phone = groupOf(out, PHONE)!;
      expect(phone.rows).toEqual([expect.objectContaining({ source: "theirs", sameAsTheirs: true })]);
      expect(phone.bothKept).toBe(false);
    });

    it("a national number with one leading 0 is kept as it is: its country cannot be guessed", () => {
      expect(normalizeForCompare("phone", "0900 12 345")).toBe("national:090012345");
      const online = card([{ field: "a:phone", value: "0900 12 345", rung: "public" }]);
      const out = mergeOneCard({ online, own: { facts: { phone: "+47 900 12 345" } }, fieldOrder: ORDER });
      expect(groupOf(out, PHONE)!.rows.map((r) => r.source)).toEqual(["theirs", "yours"]);
    });

    it("their twins that are equal under the field's compare rule show once (NFC, email case, phone form)", () => {
      const NOTE = field("title", "Title", true);
      const online = card([
        { field: "a:title", value: "Caf\u00e9", rung: "public" },
        { field: "a:title", value: "Cafe\u0301", rung: "public" },
        { field: "a:email", value: "A@x.example", rung: "public" },
        { field: "a:email", value: "a@x.example", rung: "public" },
        { field: "a:phone", value: "+47 900 12 345", rung: "public" },
        { field: "a:phone", value: "0047 90012345", rung: "public" },
      ]);
      const out = mergeOneCard({ online, own: {}, fieldOrder: [...ORDER, NOTE] });
      expect(groupOf(out, NOTE)!.rows).toHaveLength(1);
      expect(groupOf(out, EMAIL)!.rows.map((r) => r.value)).toEqual(["A@x.example"]);
      expect(groupOf(out, PHONE)!.rows.map((r) => r.value)).toEqual(["+47 900 12 345"]);
    });

    // About linear: 4,000 values under 200 ms.
    it("merges 4,000 values in one field, half of them equal across the sides, in under 200 ms", () => {
      const online = card(Array.from({ length: 4000 }, (_, i) => ({ field: "a:email", value: `p${i}@x.example`, rung: "public" })));
      const facts = { email: Array.from({ length: 4000 }, (_, i) => `P${i + 2000}@x.example`) };
      const t0 = performance.now();
      const out = mergeOneCard({ online, own: { facts }, fieldOrder: ORDER });
      const ms = performance.now() - t0;
      const rows = groupOf(out, EMAIL)!.rows;
      expect(rows).toHaveLength(6000);
      expect(rows.filter((r) => r.sameAsTheirs)).toHaveLength(2000);
      expect(ms).toBeLessThan(200);
    });

    it("merges 4,000 fields with a value on each side in under 200 ms", () => {
      const many = Array.from({ length: 4000 }, (_, i) => field(`f${i}`, `F${i}`, false));
      const online = card(many.map((_, i) => ({ field: `a:f${i}`, value: `v${i}`, rung: "public" })));
      const facts = Object.fromEntries(many.map((_, i) => [`f${i}`, i % 2 ? `v${i}` : `w${i}`]));
      const t0 = performance.now();
      const out = mergeOneCard({ online, own: { facts }, fieldOrder: many });
      const ms = performance.now() - t0;
      expect(out.groups).toHaveLength(4000);
      expect(out.groups.filter((g) => g.bothKept)).toHaveLength(2000);
      expect(ms).toBeLessThan(200);
    });
  });

  describe("purity", () => {
    it("does not change its inputs", () => {
      const own = { facts: { email: ["Ann@example.test"] }, heldClaims: [{ predicate: "a:skill", value: "s" }] };
      const before = JSON.stringify({ ANN, own, ORDER });
      mergeOneCard({ online: ANN, own, fieldOrder: ORDER, skillPredicate: "a:skill" });
      expect(JSON.stringify({ ANN, own, ORDER })).toBe(before);
    });
  });
});

describe("compareRuleOf and normalizeForCompare", () => {
  it("compares an email trimmed and case-insensitive", () => {
    expect(compareRuleOf(["a:email", "email"])).toBe("email");
    expect(normalizeForCompare("email", "  Ann@EXAMPLE.test ")).toBe("ann@example.test");
  });

  it("compares a phone by its key; a phone with no digit has no key (it is empty)", () => {
    expect(compareRuleOf(["a:phone"])).toBe("phone");
    expect(compareRuleOf(["phone"])).toBe("phone");
    expect(normalizeForCompare("phone", "+47 (900) 12-345")).toBe("+4790012345");
    expect(normalizeForCompare("phone", " n/a ")).toBe("");
  });

  // An international key ("+" or "00" then digits) never equals a national key.
  describe("phone compare key", () => {
    const same = (a: string, b: string) => normalizeForCompare("phone", a) === normalizeForCompare("phone", b);

    it("keeps 0012345 and 12345 apart (international against national)", () => {
      expect(same("0012345", "12345")).toBe(false);
    });

    it("keeps 90012345 apart from +90012345, and folds +90012345 with 0090012345", () => {
      expect(same("90012345", "+90012345")).toBe(false);
      expect(same("90012345", "0090012345")).toBe(false);
      expect(same("+90012345", "0090012345")).toBe(true);
    });

    it("compares 000 and a lone 00 by their literal digits, as national, never as international", () => {
      expect(same("000", "0")).toBe(false);
      expect(normalizeForCompare("phone", "000")).toBe("national:000");
      expect(normalizeForCompare("phone", "00")).toBe("national:00");
      expect(same("00", "+")).toBe(false);
    });

    it("strips a tel: prefix in any case, so tel:0047... folds with tel:+47...", () => {
      expect(same("tel:0047 900 12 345", "tel:+47 900 12 345")).toBe(true);
      expect(same("TEL:+47 900 12 345", "+47 900 12 345")).toBe(true);
    });

    it("folds +47 900 with 0047900", () => {
      expect(same("+47 900", "0047900")).toBe(true);
    });

    // Punctuation before the prefix does not make a number national.
    it("folds (+47) 900 12 345 and (0047) 900 12 345 with +47 900 12 345", () => {
      expect(same("(+47) 900 12 345", "+47 900 12 345")).toBe(true);
      expect(same("(0047) 900 12 345", "+47 900 12 345")).toBe(true);
      expect(normalizeForCompare("phone", "(+47) 900")).toBe("+47900");
    });

    it("reads full-width digits and plus as ASCII", () => {
      expect(normalizeForCompare("phone", "\uff0b\uff14\uff17 \uff19\uff10\uff10")).toBe("+47900");
      expect(same("\uff10\uff10\uff14\uff17\uff19\uff10\uff10", "+47 900")).toBe(true);
    });

    it("draws no row for a phone with no digit left, such as tel: alone, on either side", () => {
      expect(normalizeForCompare("phone", "tel:")).toBe("");
      const online = card([{ field: "a:phone", value: "tel:", rung: "public" }]);
      const out = mergeOneCard({ online, own: { facts: { phone: ["TEL: ", "n/a"] } }, fieldOrder: ORDER });
      expect(groupOf(out, PHONE)).toBeUndefined();
    });

    // Any Unicode decimal digit, a trunk marker and 00+.
    it("reads every Unicode decimal digit as its ASCII digit", () => {
      expect(same("\u0660\u0660\u0664\u0667 \u0669\u0660\u0660 \u0661\u0662 \u0663\u0664\u0665", "+47 900 12 345")).toBe(true);
      expect(normalizeForCompare("phone", "\u06f9\u06f0\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5")).toBe("national:90012345");
      expect(normalizeForCompare("phone", "+\u{1D7D2}\u{1D7D5}")).toBe("+47");
    });

    // Myanmar Eastern Pwo Karen digits (U+116DA..U+116E3) sit right after Myanmar Pa-O (U+116D0..U+116D9); a walk
    // capped at 9 code points read each of them as 9, so two different numbers folded into one row.
    it("reads a digit of a run that follows another digit run by its own run", () => {
      const karen = (digits: string) => [...digits].map((d) => String.fromCodePoint(0x116da + Number(d))).join("");
      expect(normalizeForCompare("phone", karen("0123"))).toBe("national:0123");
      expect(normalizeForCompare("phone", karen("4567"))).toBe("national:4567");
      expect(normalizeForCompare("phone", `+${karen("47")}`)).toBe("+47");
      // The run before it (Pa-O) still reads 0..9.
      expect(normalizeForCompare("phone", String.fromCodePoint(0x116d0, 0x116d9))).toBe("national:09");
      const online = card([{ field: "a:phone", value: karen("0123"), rung: "public" }]);
      const out = mergeOneCard({ online, own: { facts: { phone: karen("4567") } }, fieldOrder: ORDER });
      expect(groupOf(out, PHONE)!.rows.map((r) => r.source)).toEqual(["theirs", "yours"]);
    });

    it("keeps the row of a phone written in Arabic-Indic digits", () => {
      const out = mergeOneCard({ online: null, own: { facts: { phone: "\u0669\u0660\u0660 \u0661\u0662" } }, fieldOrder: ORDER });
      expect(groupOf(out, PHONE)!.rows.map((r) => r.value)).toEqual(["\u0669\u0660\u0660 \u0661\u0662"]);
    });

    it("drops a bracketed (0) trunk marker right after the country code, and no other 0", () => {
      expect(same("+47(0)900 12 345", "+47 900 12 345")).toBe(true);
      expect(same("+47 (0) 900 12 345", "+47 900 12 345")).toBe(true);
      expect(same("0047(0)900 12 345", "+47 900 12 345")).toBe(true);
      expect(same("+47 0900 12 345", "+47 900 12 345")).toBe(false);
      expect(same("+47 900 (0) 12", "+47 900 12")).toBe(false);
      expect(normalizeForCompare("phone", "0900(0)1")).toBe("national:090001");
    });

    it("reads a leading 00+ as +", () => {
      expect(same("00+47 900 12 345", "+47 900 12 345")).toBe(true);
      expect(normalizeForCompare("phone", "00+47 900")).toBe("+47900");
    });

    it("merges a national and an international number as two rows on the card", () => {
      const online = card([{ field: "a:phone", value: "+90012345", rung: "public" }]);
      const out = mergeOneCard({ online, own: { facts: { phone: "90012345" } }, fieldOrder: ORDER });
      expect(groupOf(out, PHONE)!.rows.map((r) => r.source)).toEqual(["theirs", "yours"]);
    });
  });

  it("compares any other field exactly after trim", () => {
    expect(compareRuleOf(["a:givenName"])).toBe("text");
    expect(compareRuleOf(["a:emailNote"])).toBe("text");
    expect(normalizeForCompare("text", "  Ann  ")).toBe("Ann");
  });
});
