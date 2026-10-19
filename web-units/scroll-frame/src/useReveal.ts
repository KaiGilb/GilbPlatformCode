/**
 * Fade-up on enter for the elements marked `data-reveal` inside a container, driven by an IntersectionObserver.
 * As the Gilb Websites landing page's `useReveal` (see README "Source"), with its class and variable names
 * prefixed `sf-`.
 *
 * Safe for a prerendered page: the server's HTML shows every element. Only after mount, only when motion is
 * allowed, and only for elements below the fold are elements armed (`sf-hidden`: transparent, 24 px down) and
 * observed; entering the viewport swaps them to `sf-shown`, staggered 100 ms per element of the batch, at most 5
 * steps. No script, reduced motion and an element already on screen all show the full page.
 *
 * @param rootRef the container whose `[data-reveal]` descendants take part
 */
import { onBeforeUnmount, onMounted, type Ref } from "vue";

export function useReveal(rootRef: Ref<HTMLElement | null>) {
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    const root = rootRef.value;
    if (!root || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    // The reveal CSS is gated behind this class on <html> and behind the reduced-motion query.
    document.documentElement.classList.add("sf-motion");

    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const armed: HTMLElement[] = [];
    const viewportBottom = window.innerHeight * 0.92;
    for (const el of els) {
      // Anything already on screen (or above) stays visible: hiding it after paint would flash it out.
      if (el.getBoundingClientRect().top < viewportBottom) continue;
      el.classList.add("sf-hidden");
      armed.push(el);
    }
    if (armed.length === 0) return;

    observer = new IntersectionObserver(
      (entries) => {
        let batchIndex = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.style.setProperty("--sf-delay", `${Math.min(batchIndex, 5) * 100}ms`);
          el.classList.add("sf-shown");
          batchIndex += 1;
          observer?.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    for (const el of armed) observer.observe(el);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });
}
