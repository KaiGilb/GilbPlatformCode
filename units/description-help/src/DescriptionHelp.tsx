import { ASSUMPTION_WARNING } from "@kaigilb/gilbplatformcode-description-parts-model";
import { HelpExample, HelpKeys, HelpLayout, HelpLink, HelpList, HelpNote, HelpSection, HelpSteps } from "@kaigilb/gilbplatformcode-help-doc";

type DescriptionKind = "Solution" | "Function";

const SECTION_DEFS: { id: string; title: (kind: DescriptionKind) => string }[] = [
  { id: "desc-overview", title: (kind) => `The Description of a ${kind}` },
  { id: "desc-part", title: () => "+ Part: add one part" },
  { id: "desc-subpart", title: () => "Sub-parts: a part under a part" },
  { id: "desc-move", title: () => "Moving parts (in Edit)" },
  { id: "desc-assumption", title: (kind) => `+ Assumption: what this ${kind} takes as true` },
  { id: "desc-paste", title: () => "Paste parts: add many at once" },
  { id: "desc-source", title: () => "Sources: who said it" },
];

function sectionsFor(kind: DescriptionKind) {
  return SECTION_DEFS.map((section) => ({ id: section.id, title: section.title(kind) }));
}

export const DESCRIPTION_HELP_SECTIONS = sectionsFor("Solution");

const EN = "\u2013";
const gap = (n: number) => " ".repeat(n);

type KindExamples = {
  fallback: string;
  overview: string;
  part: { keyword: string; text: string; shows: string; tag: string };
  subLabel: string;
  sub: (T: string) => string;
  assumptionForExample: string;
  assumption: (T: string) => string;
  paste: string;
  pasted: string;
};

const EXAMPLES: Record<DescriptionKind, KindExamples> = {
  Solution: {
    fallback: "MySolution",
    overview: "Bones: The leg has 26 bones.",
    part: { keyword: "Bones", text: "The leg has 26 bones.", shows: "Bones: The leg has 26 bones.", tag: "Bones" },
    subLabel: "Example: Bones with two sub-parts",
    sub: (T) =>
      `Bones: The leg has 26 bones.             ${T}.Bones\n${EN} Hip: The hip joint carries the weight. ${T}.Bones.Hip\n${EN} Knee: The knee bends one way.          ${T}.Bones.Knee`,
    assumptionForExample: "for example how heavy the walker is",
    assumption: (T) =>
      `Keyword:  Weight\nText:     The walker weighs under 120 kg.\n\nShows:    Assumption:\n          ${EN} Weight: The walker weighs under 120 kg.\nTag:      ${T}.Assumption.Weight`,
    paste: `Bones: The leg has 26 bones. <- Dr Ames
- Hip: The hip joint carries the weight.
- - Socket: A ball in a socket.
Feet: The feet touch the ground.
Assumption:
- Weight: The walker weighs under 120 kg.`,
    pasted: `Bones: The leg has 26 bones.                 Source: Dr Ames
${EN} Hip: The hip joint carries the weight.
  ${EN} Socket: A ball in a socket.
Feet: The feet touch the ground.
Assumption:
${EN} Weight: The walker weighs under 120 kg.`,
  },
  Function: {
    fallback: "MyFunction",
    overview: "Step: The walker puts one foot in front of the other.",
    part: {
      keyword: "Step",
      text: "The walker puts one foot in front of the other.",
      shows: "Step: The walker puts one foot in front of the other.",
      tag: "Step",
    },
    subLabel: "Example: Step with two sub-parts",
    sub: (T) =>
      `Step: The walker puts one foot in front of the other.${gap(2)}${T}.Step\n${EN} Lift: The foot leaves the ground.${gap(20)}${T}.Step.Lift\n${EN} Land: The foot touches the ground again.${gap(13)}${T}.Step.Land`,
    assumptionForExample: "for example that the floor is flat",
    assumption: (T) =>
      `Keyword:  Floor\nText:     The floor is flat and dry.\n\nShows:    Assumption:\n          ${EN} Floor: The floor is flat and dry.\nTag:      ${T}.Assumption.Floor`,
    paste: `Step: The walker puts one foot in front of the other. <- Dr Ames
- Lift: The foot leaves the ground.
- - Swing: The leg swings forward.
Land: The foot touches the ground again.
Assumption:
- Floor: The floor is flat and dry.`,
    pasted: `Step: The walker puts one foot in front of the other.   Source: Dr Ames
${EN} Lift: The foot leaves the ground.
  ${EN} Swing: The leg swings forward.
Land: The foot touches the ground again.
Assumption:
${EN} Floor: The floor is flat and dry.`,
  },
};

export const PASTE_HELP_EXAMPLE = EXAMPLES.Solution.paste;
export const PASTE_HELP_EXAMPLE_FUNCTION = EXAMPLES.Function.paste;

function typedExample(keyword: string, text: string, shows: string, tag: string): string {
  return `Keyword:  ${keyword}
Text:     ${text}

Shows:    ${shows}
Tag:      ${tag}`;
}

export function DescriptionHelp({ tag, kind = "Solution" }: { tag: string; kind?: DescriptionKind }) {
  const ex = EXAMPLES[kind];
  const T = tag === "" ? ex.fallback : tag;
  const sections = sectionsFor(kind);
  const title = (id: string) => sections.find((section) => section.id === id)!.title;
  return (
    <HelpLayout contents={sections}>
      <HelpSection id="desc-overview" title={title("desc-overview")}>
        <p>
          The Description says what this {kind} is, one part at a time. Each part is a Keyword and a sentence, like{" "}
          <strong>{ex.overview}</strong> Parts can have sub-parts, as deep as you need. Every part is its own
          record with its own tag, so other plans can point at exactly that part.
        </p>
        <p>The card shows the Description in three ways:</p>
        <HelpList>
          <li>
            <strong>Reading.</strong> Just the parts and who said each one. Click a part's text to change it.
          </li>
          <li>
            <strong>One part open.</strong> You clicked a part. You can change its text, pick its source, and add a sub-part under
            it. Press <HelpKeys>Esc</HelpKeys> or click outside to close it.
          </li>
          <li>
            <strong>Edit.</strong> You pressed Edit on the card. Each part is one short row so you can see many at once and arrange
            them: move them up, down, in and out, drag them, remove them, and add new ones. See{" "}
            <HelpLink to="desc-move">Moving parts (in Edit)</HelpLink>.
          </li>
        </HelpList>
      </HelpSection>

      <HelpSection id="desc-part" title={title("desc-part")}>
        <HelpSteps>
          <li>Press Edit on the card.</li>
          <li>
            Press <strong>+ Part</strong>.
          </li>
          <li>Type a Keyword and the text.</li>
          <li>
            Press Add (or <HelpKeys>Enter</HelpKeys>).
          </li>
        </HelpSteps>
        <p>
          The Keyword is one word: letters only, starting with a capital, e.g. Sync. It names the part and builds its tag: the {kind}'s tag, a dot, the Keyword.
        </p>
        <p>The Keyword Assumption is kept for the assumptions: use + Assumption.</p>
        <HelpExample
          label="Example: you type / You get"
          text={typedExample(ex.part.keyword, ex.part.text, ex.part.shows, `${T}.${ex.part.tag}`)}
        />
        <HelpNote>A tag is used once in the whole vault. If it is taken, you are told, and nothing is written. Pick another Keyword.</HelpNote>
      </HelpSection>

      <HelpSection id="desc-subpart" title={title("desc-subpart")}>
        <p>Two ways to put a part under another:</p>
        <HelpList>
          <li>
            <strong>Add it there.</strong> Click the part's text to open it, then press <strong>+ Sub-part</strong>.
          </li>
          <li>
            <strong>Move it there.</strong> In Edit, press <strong>→</strong> on a part to move it in under the part above it. See{" "}
            <HelpLink to="desc-move">Moving parts (in Edit)</HelpLink>.
          </li>
        </HelpList>
        <p>A sub-part you add gets its parent's tag, a dot, and its Keyword. A part you move keeps its tag.</p>
        <HelpExample label={ex.subLabel} text={ex.sub(T)} />
      </HelpSection>

      <HelpSection id="desc-move" title={title("desc-move")}>
        <p>In Edit, every part has a row of buttons:</p>
        <HelpList>
          <li>
            <strong>↑ ↓</strong> one place up or down, among the parts at the same level. On a level where some parts are not shown, the card reads the whole level before it moves a part. ↑ ↓ can be refused when a part on that level could not be read. The card then says so; press Try again.
          </li>
          <li>
            <strong>→</strong> in: under the part just above it, as its last sub-part.
          </li>
          <li>
            <strong>←</strong> out: up one level, just after its parent.
          </li>
          <li>
            <strong>×</strong> remove. You are asked to confirm. <strong>Its sub-parts are removed with it.</strong> A record that is not a part (for example a System) is never removed by ×; the card names it if it still points at the removed part. × refuses when a sub-part cannot be read, when more than 300 parts would go, or when a record in another vault names the part. × refuses a part with more than 12 levels or 300 parts under it. Remove the lower parts first.
          </li>
          <li>
            <strong>⠿</strong> the grip: drag the part anywhere in the tree.
          </li>
        </HelpList>
        <HelpNote>A moved part keeps its tag. Assumptions stay under the Assumption part, and other parts cannot go under it.</HelpNote>
      </HelpSection>

      <HelpSection id="desc-assumption" title={title("desc-assumption")}>
        <p>
          An assumption is something the {kind} counts on but does not prove, {ex.assumptionForExample}. All assumptions
          sit together under one part called <strong>Assumption</strong>. The first <strong>+ Assumption</strong> makes that part for
          you.
        </p>
        <p>{ASSUMPTION_WARNING}</p>
        <p>If you write one of those words, you get a reminder. The assumption is still saved.</p>
        <HelpExample label="Example: you type / You get" text={ex.assumption(T)} />
      </HelpSection>

      <HelpSection id="desc-paste" title={title("desc-paste")}>
        <p>Have the Description in a document, an e-mail, or a chat? Paste it, and every line becomes a part. You see what will be made before anything is saved.</p>
        <HelpSteps>
          <li>
            Press Edit on the card, then <strong>Paste parts</strong>.
          </li>
          <li>Paste your text, one part per line.</li>
          <li>Check the list below the box: each line shows what it will be.</li>
          <li>
            Press <strong>Create N parts</strong>. Or <strong>Discard</strong>.
          </li>
        </HelpSteps>
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr>
              <th className="border-b border-[var(--line)] py-2 pr-4 align-top font-mono">Write this</th>
              <th className="border-b border-[var(--line)] py-2 pr-4 align-top">You get</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top font-mono">Keyword: text</td>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top">A part.</td>
            </tr>
            <tr>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top font-mono">- Keyword: text</td>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top">A sub-part of the line above it.</td>
            </tr>
            <tr>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top font-mono">- - Keyword: text</td>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top">One level deeper.</td>
            </tr>
            <tr>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top font-mono">{"… <- Name"}</td>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top">
                At the end of a line: who said it (the source). See <HelpLink to="desc-source">Sources: who said it</HelpLink>.
              </td>
            </tr>
            <tr>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top font-mono">Assumption:</td>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top">
                On its own line. The - Keyword: text lines under it are assumptions.
              </td>
            </tr>
            <tr>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top font-mono">Assumption: Keyword: text</td>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top">One assumption on one line.</td>
            </tr>
            <tr>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top font-mono">an empty line</td>
              <td className="border-b border-[var(--line)] py-2 pr-4 align-top">Skipped.</td>
            </tr>
          </tbody>
        </table>
        <HelpNote>
          Only a {"- "}in front makes a sub-part. Spaces alone do not: an indented line without {"- "}becomes a part at the top.
        </HelpNote>
        <HelpExample label="Example: paste this" text={ex.paste} />
        <HelpExample label="You get" text={ex.pasted} />
        <p>
          A line that is not a part is marked <strong>not a part</strong> and is not written. A Keyword is letters only, starting with a capital: Feet, not Feet2. A part whose tag is already used in the vault is skipped, never written over, and so are the lines under it, unless it is a part of this Description already: then they go under that part. If a pasted line's level cannot be read, the whole paste is refused and nothing is written.
        </p>
      </HelpSection>

      <HelpSection id="desc-source" title={title("desc-source")}>
        <p>
          Each part can name where it came from: a person (a stakeholder) or a document. If you pick none, the source is you, when
          the card knows who you are; otherwise it is left empty.
        </p>
        <HelpSteps>
          <li>Click the part's text to open it.</li>
          <li>
            In <strong>Source</strong>, start typing a name and pick it. Or press <strong>+ New stakeholder</strong> to add a person
            who is not there yet.
          </li>
        </HelpSteps>
        <HelpNote>In Edit, sources are hidden so you can see more parts at once. Open a part to set its source.</HelpNote>
      </HelpSection>
    </HelpLayout>
  );
}
