// The language catalogue and the geo catalogue's flag files, in front of a world's `fetch`. A language entry is read at its own address and a
// country's flag at `<host>/files/flag-<id>` and `<host>/base/e/flag-<id>`; everything else goes on to the world. A country entity answers an
// error that fails the test: the card must never ask for one.
export const LANGUAGE_NO = "https://catalogue.example.test/base/e/lang-norwegian";
export const LANGUAGE_EN = "https://catalogue.example.test/base/e/lang-english";
export const COUNTRY_NO = "https://geo.example.test/base/e/osm-r-2978650";
export const COUNTRY_UK = "https://geo.example.test/base/e/osm-r-62149";
export const COUNTRY_US = "https://geo.example.test/base/e/osm-r-148838";

const FLAG_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#ed2939" d="M0 0h640v480H0z"/></svg>';
const ENTRIES: Record<string, { label: string; iso6393Code: string; countries: string[] }> = {
  [LANGUAGE_NO]: { label: "Norwegian", iso6393Code: "nor", countries: [COUNTRY_NO] },
  [LANGUAGE_EN]: { label: "English", iso6393Code: "eng", countries: [COUNTRY_UK, COUNTRY_US] },
};
const FLAGS: Record<string, string> = { "flag-osm-r-2978650": "no" };

export interface LanguageWorld {
  fetch: typeof fetch;
  /** Every URL the language and flag answers were asked for. */
  asked: { method: string; url: string }[];
}

export function languageWorld(next: typeof fetch): LanguageWorld {
  const asked: LanguageWorld["asked"] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const entry = ENTRIES[url];
    if (entry) {
      asked.push({ method, url });
      return json(200, { "@id": url, label: entry.label, iso6393Code: entry.iso6393Code, languageCountry: entry.countries.map((c) => ({ "@id": c })) });
    }
    if (url.startsWith("https://geo.example.test/")) {
      asked.push({ method, url });
      const flag = /^https:\/\/geo\.example\.test\/(files|base\/e)\/(flag-[a-z0-9-]+)$/.exec(url);
      const code = flag ? FLAGS[flag[2]!] : undefined;
      if (!flag || code === undefined) return json(404, { error: "NotFound" });
      return flag[1] === "files" ? new Response(FLAG_SVG, { status: 200, headers: { "content-type": "image/svg+xml" } }) : json(200, { fileTag: ["flag", code] });
    }
    return next(input, init);
  };
  return { fetch: f as typeof fetch, asked };
}
