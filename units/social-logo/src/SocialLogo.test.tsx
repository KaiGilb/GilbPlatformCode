// The logo component and its table. The first five cases are the source's own (the "platform logos" block of its
// card-look test), with the platform names written out here instead of read from the online-account reader, which is
// another unit; the last case of that block is `socialPlatformName`'s. The rest are new.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { cleanup, render } from "@testing-library/react";
import { SocialLogo } from "./SocialLogo";
import { SOCIAL_LOGOS, socialPlatformName } from "./socialLogos";

afterEach(() => cleanup());

// Every name `platformOf` of `contact-rows` can return (35, measured equal to the table's keys when this unit was built).
const PLATFORM_NAMES = [
  "Behance", "Dribbble", "Facebook", "Flickr", "GitHub", "GitLab", "Google Scholar", "Instagram", "LinkedIn", "Medium",
  "Pinterest", "Quora", "Reddit", "Snapchat", "SoundCloud", "Spotify", "Stack Overflow", "Telegram", "Tumblr", "Twitch",
  "VK", "Vimeo", "Weibo", "WhatsApp", "XING", "YouTube", "X", "TikTok", "Threads", "Bluesky", "Discord", "Substack",
  "ResearchGate", "ORCID", "Mastodon",
];
const MONOGRAMS: Record<string, string> = { TikTok: "Tk", Threads: "@", Bluesky: "Bs", Discord: "Dc", Substack: "Ss", ResearchGate: "Rg", ORCID: "iD", Mastodon: "Ma" };

describe("platform logos (the source's cases)", () => {
  it("the table holds the 35 platform names, and only those (add a platform without a logo and this fails)", () => {
    expect(PLATFORM_NAMES).toHaveLength(35);
    for (const label of PLATFORM_NAMES) expect(SOCIAL_LOGOS[label], label).toBeTruthy();
    expect(Object.keys(SOCIAL_LOGOS).sort()).toEqual([...PLATFORM_NAMES].sort());
  });
  it("each logo draws as a named image of the same 18 px size, with no network or external reference", () => {
    for (const label of PLATFORM_NAMES) {
      const { container, unmount } = render(<SocialLogo platform={label} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("role")).toBe("img");
      expect(svg.getAttribute("aria-label")).toBe(`${label} logo`);
      expect(svg.getAttribute("class")).toContain("size-[18px]");
      expect(container.innerHTML).not.toMatch(/https?:|href=|<image|<use|url\(/);
      unmount();
    }
  });
  it("an unknown platform and no platform both draw the plain globe", () => {
    for (const p of [null, "NotAPlatform"]) {
      const { container, unmount } = render(<SocialLogo platform={p} />);
      expect(container.querySelector("svg")!.getAttribute("aria-label")).toBe("Web address logo");
      expect(container.querySelector("circle")).not.toBeNull();
      unmount();
    }
  });
  it("the logo's platform: the address's own, else the stored label when it names a platform, else none", () => {
    expect(socialPlatformName("X", "")).toBe("X");
    expect(socialPlatformName(null, "LinkedIn")).toBe("LinkedIn");
    expect(socialPlatformName(null, "Work")).toBeNull();
    expect(socialPlatformName(null, "")).toBeNull();
  });
});

describe("what each kind of logo draws", () => {
  it("a glyph is drawn flipped (its path keeps the icon font's y-up coordinates) in its own viewBox, in the text colour", () => {
    const { container } = render(<SocialLogo platform="GitHub" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("-61 -1488 1659 1659");
    expect(svg.getAttribute("fill")).toBe("currentColor");
    const path = svg.querySelector("path")!;
    expect(path.getAttribute("transform")).toBe("scale(1 -1)");
    expect(path.getAttribute("d")).toBe((SOCIAL_LOGOS.GitHub as { d: string }).d);
    expect(svg.getAttribute("data-social-logo")).toBe("GitHub");
  });
  it("the X mark is on the 24-unit grid and is not flipped", () => {
    const { container } = render(<SocialLogo platform="X" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("fill")).toBe("currentColor");
    expect(svg.querySelector("path")!.getAttribute("transform")).toBeNull();
    expect(svg.querySelector("path")!.getAttribute("d")).toBe((SOCIAL_LOGOS.X as { d: string }).d);
  });
  it.each(Object.entries(MONOGRAMS))("%s has no vector: an outlined badge with the initials %s", (name, initials) => {
    const { container } = render(<SocialLogo platform={name} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.querySelector("text")!.textContent).toBe(initials);
    const rect = svg.querySelector("rect")!;
    expect(rect.getAttribute("fill")).toBe("none");
    expect(rect.getAttribute("stroke")).toBe("currentColor");
    expect(svg.querySelector("path")).toBeNull();
    expect(svg.getAttribute("aria-label")).toBe(`${name} logo`);
  });
  it("the table has 26 glyphs, one mark and 8 monograms", () => {
    const kinds = Object.values(SOCIAL_LOGOS).map((s) => s.kind);
    expect(kinds.filter((k) => k === "glyph")).toHaveLength(26);
    expect(kinds.filter((k) => k === "mark")).toHaveLength(1);
    expect(kinds.filter((k) => k === "monogram")).toHaveLength(8);
  });
  it("the plain globe is a stroked circle, an ellipse and a line, in the text colour", () => {
    const { container } = render(<SocialLogo platform={null} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-social-logo")).toBe("web");
    expect(svg.getAttribute("fill")).toBe("none");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.querySelector("circle")).not.toBeNull();
    expect(svg.querySelector("ellipse")).not.toBeNull();
    expect(svg.querySelector("path")!.getAttribute("d")).toBe("M3 12h18");
    expect(svg.querySelector("text")).toBeNull();
  });
  it("an unknown platform name is marked as the plain web logo, not as the name it was given", () => {
    const { container } = render(<SocialLogo platform="NotAPlatform" />);
    expect(container.querySelector("svg")!.getAttribute("data-social-logo")).toBe("web");
  });
});

describe("the class and the network", () => {
  it("the call site's class is added after the fixed ones; none given adds nothing", () => {
    const a = render(<SocialLogo platform="GitHub" className="text-[var(--ink-faint)]" />);
    expect(a.container.querySelector("svg")!.getAttribute("class")).toBe("inline-block size-[18px] shrink-0 text-[var(--ink-faint)]");
    cleanup();
    const b = render(<SocialLogo platform="GitHub" />);
    expect(b.container.querySelector("svg")!.getAttribute("class")).toBe("inline-block size-[18px] shrink-0");
  });
  it("drawing every logo makes no request", () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    try {
      for (const name of [...PLATFORM_NAMES, null]) {
        render(<SocialLogo platform={name} />);
        cleanup();
      }
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("socialPlatformName", () => {
  it("the address's platform wins over the stored label, even when the label names another platform", () => {
    expect(socialPlatformName("GitHub", "LinkedIn")).toBe("GitHub");
  });
  it("a stored label is trimmed before it is looked up", () => {
    expect(socialPlatformName(null, "  LinkedIn  ")).toBe("LinkedIn");
  });
  it("a label is matched exactly: the case matters", () => {
    expect(socialPlatformName(null, "linkedin")).toBeNull();
  });
  it("a blank label is none", () => {
    expect(socialPlatformName(null, "   ")).toBeNull();
  });
  it("an address platform that is not in the table is still returned as given (the logo then draws the globe)", () => {
    expect(socialPlatformName("Somewhere", "")).toBe("Somewhere");
    const { container } = render(<SocialLogo platform="Somewhere" />);
    expect(container.querySelector("svg")!.getAttribute("data-social-logo")).toBe("web");
  });
});

describe("the drawing's geometry and the table's data", () => {
  it("the badge is a 20 px rounded square outline with the initials centred under it", () => {
    const { container } = render(<SocialLogo platform="Mastodon" />);
    const rect = container.querySelector("rect")!;
    expect(["x", "y", "width", "height", "rx", "fill", "stroke", "stroke-width"].map((a) => rect.getAttribute(a))).toEqual(["2", "2", "20", "20", "5", "none", "currentColor", "1.6"]);
    const text = container.querySelector("text")!;
    expect(["x", "y", "text-anchor", "font-size", "font-weight", "fill"].map((a) => text.getAttribute(a))).toEqual(["12", "15.4", "middle", "9.5", "700", "currentColor"]);
  });
  it("the globe is a circle of radius 9, an ellipse of 4 by 9 and the line across, 1.6 wide with round caps", () => {
    const { container } = render(<SocialLogo platform={null} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke-width")).toBe("1.6");
    expect(svg.getAttribute("stroke-linecap")).toBe("round");
    const c = svg.querySelector("circle")!;
    expect([c.getAttribute("cx"), c.getAttribute("cy"), c.getAttribute("r")]).toEqual(["12", "12", "9"]);
    const e = svg.querySelector("ellipse")!;
    expect([e.getAttribute("cx"), e.getAttribute("cy"), e.getAttribute("rx"), e.getAttribute("ry")]).toEqual(["12", "12", "4", "9"]);
  });
  it("the X mark is the one path of the simple-icons style", () => {
    expect((SOCIAL_LOGOS.X as { d: string }).d).toBe(
      "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
    );
  });
  it("the whole table is the source's, byte for byte (a digest of its JSON, taken from the source when this unit was cut)", () => {
    expect(createHash("sha256").update(JSON.stringify(SOCIAL_LOGOS)).digest("hex")).toBe("ce0856ede46582df865b4027f8535ced7096baee6a8ce98f997e1c80fb9971ab");
  });
});
