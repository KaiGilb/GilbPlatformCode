/**
 * The generic predicate offered last, for "these two are related and I am not saying how".
 *
 * ── 🔴 IT IS `t:ConnectedTo`, NOT `t:Relation` (defect, 2026-08-02) ──────────────────
 * Owner: *"the predicates are missing from the new nodes and links I mint"*. Measured on the rig
 * (`base_c057restore_test`): his two newest relations carry `entity_state.type_uri =
 * 't:Relation'`, while the older labelled ones carry `t:Authorship` / `t:Reference`. Nothing
 * was lost in transit — the write path provably preserves the CURIE, and `t:Relation` is
 * exactly what the UI offered him under the label "related (generic)".
 *
 * The blank edge was CORRECT behaviour over a WRONG WRITE. `t:Relation` is not a predicate at
 * all: its own `a:does` in `base_veda` reads *"The canonical category of a predicate that links
 * things … its members are the six irreducible base relations"*, and it carries **no**
 * `a:isRelationPredicate` (every real predicate term does). It is the CATEGORY, so writing it
 * as an edge's `@type` is a plane confusion — the same class of defect as the `t:DependsOn`
 * FAIL above, where a Planguage *parameter* was written as a predicate.
 *
 * `t:ConnectedTo` is the adjudicated generic and was already in the store, Approved:
 * `a:label` "connected-to", `a:isRelationPredicate` true, `a:nodeKind` "relation",
 * `a:subTypeOf` → `t/Relation`. It is one of the six irreducible base relations `t:Relation`
 * names as its own members — i.e. the thing the picker meant all along.
 *
 * ── 🔴 CORRECTION, 2026-08-02 — "this MINTS NOTHING" was FALSE AS SHIPPED ────────────────
 * This paragraph read: "⛔ BVGATE_01/03: this MINTS NOTHING. It swaps a written CURIE from a
 * category term to an already-Approved predicate term that was authored before this dispatch.
 * Nothing needed authoring, so no waiver arises." The store says otherwise. When the typing gate ran
 * the gate against this branch (2026-08-02) they measured `t/ConnectedTo` in `base_veda` and
 * found it Approved but carrying **no `a:typeAttribute`** — so under RuleBpontCodeBinding the
 * byte string `t:ConnectedTo` that commit `06cf73d` started writing was bound to NOTHING — and
 * **no type on its chain** (`t:ConnectedTo → t:Relation → The Unchanging → Thing`) carried
 * `a:providesFunction`, a RuleBpontTypeFv FAIL.
 *
 * AUTHORING WAS THEREFORE REQUIRED, and it was performed by the gate, not by this branch. Two
 * additive writes discharged it: `a:typeAttribute = "t:ConnectedTo"` on `t/ConnectedTo`, and
 * `a:providesFunction → t/Connect` on `t/Relation` (attached at the category per
 * RuleBpontAttachHigh, so the whole relation plane inherits one Function rather than nine
 * copies).
 *
 * What remains TRUE, and is the reason the swap stands: `t:ConnectedTo` is the adjudicated
 * generic, the UI mints no term (the picker is a closed `<select>` over this array), and no
 * waiver was taken anywhere — the FAIL was discharged by AUTHORING, which is what BVGATE_02 /
 * BVGATE_04 require. The claim that had to go is only "nothing needed authoring".
 *
 * ⚠ Still open and owned by the typing gate, recorded so it is not mistaken for settled: the relation
 * plane's VALUE fit. `t/Connect`'s two Values (`Connection Strength`, `Link Resolution Rate`)
 * are now inherited by nine relation types and both mis-fit a structural, cross-vault edge on
 * that store's own prior rulings. Not this file's to fix.
 */
export const GENERIC_PREDICATE_CURIE = "t:ConnectedTo";

/**
 * The category term that must never be WRITTEN as an edge predicate. Kept as a named constant
 * because the app still READS it: relations minted before this fix carry it, and
 * `predicateLabel` deliberately returns null for it so those edges stay honestly unlabelled
 * rather than being retro-labelled with a verb nobody chose.
 */
export const RELATION_CATEGORY_CURIE = "t:Relation";
