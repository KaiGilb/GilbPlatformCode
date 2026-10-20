// The page the browser check drives. Scenes: ?scene=single (one ImageLightbox) | scope (an article in a LightboxScope).
import { createApp, h } from "vue";
import { ImageLightbox, LightboxScope } from "../../src/index";

/** A picture as an SVG data address: a colour, a label and a size, so a test can tell pictures apart. */
const pic = (n: number, w = 1200, hgt = 800) =>
  "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><rect width="100%" height="100%" fill="hsl(${n * 67} 55% 38%)"/><text x="50%" y="50%" font-size="160" fill="#fff" text-anchor="middle" font-family="sans-serif">${n}</text></svg>`,
  );
const scene = new URLSearchParams(location.search).get("scene") ?? "scope";

const article = () =>
  h("main", [
    h("h1", "A news post"),
    h("p", "Some text before the pictures."),
    h("img", { id: "p1", src: pic(1), alt: "Picture one", width: 1200, height: 800 }),
    h("p", "More text."),
    h("figure", { style: "margin:0" }, [
      h("img", { id: "p2", src: pic(2), "data-full": pic(2, 2400, 1600), alt: "Picture two", width: 1200, height: 800 }),
      h("figcaption", "Picture two, described in a caption"),
    ]),
    h("img", { id: "skip-opt", src: pic(3), alt: "Decorative by choice", "data-no-lightbox": "true", width: 1200, height: 800 }),
    h("a", { href: "#linked", id: "link" }, [h("img", { id: "skip-link", src: pic(4), alt: "A linked picture", width: 1200, height: 800 })]),
    h("img", { id: "skip-alt", src: pic(5), alt: "", width: 1200, height: 800 }),
    h("img", { id: "p3", src: pic(6, 800, 1200), alt: "Picture three, a tall one", width: 800, height: 1200 }),
    h("div", { class: "spacer" }),
    h("p", { id: "end" }, "The end of the page."),
  ]);

const single = () =>
  h("main", [
    h("h1", "One picture"),
    h(ImageLightbox, { id: "only", src: pic(1), alt: "The only picture", width: 1200, height: 800, fullSrc: pic(1, 2400, 1600), loading: "eager" }),
    h("div", { class: "spacer" }),
    h("p", { id: "end" }, "The end of the page."),
  ]);

// Scene "fix": the cases of the tester's R1 defects D1 to D3 (a tiny picture, attributes changed later, a slow and a missing original).
const fix = () =>
  h("main", [
    h("h1", "Fixes"),
    h("img", { id: "tiny", src: pic(1, 16, 16), alt: "A tiny picture", width: 16, height: 16 }),
    h("img", { id: "ok", src: pic(2), alt: "A normal picture", width: 600, height: 400 }),
    h("img", { id: "slow", src: pic(3), "data-full": "/__full/slow.svg", alt: "Slow original", width: 600, height: 400 }),
    h("img", { id: "gone", src: pic(4), "data-full": "/__full/missing.svg", alt: "Missing original", width: 600, height: 400 }),
    h("img", { id: "dead", src: "/__full/missing.svg", alt: "Broken everywhere", width: 600, height: 400 }),
  ]);
createApp({ render: () => (scene === "fix" ? h(LightboxScope, null, { default: fix }) : scene === "single" ? single() : h(LightboxScope, null, { default: article })) }).mount("#app");
