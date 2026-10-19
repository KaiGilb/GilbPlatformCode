<script setup lang="ts">
/**
 * A newsletter signup band: one labelled email field and a button. On submit it sends
 * `{ email }` to the site's subscribe address and answers in place: a thanks line when the address
 * answers with a 2xx, an error line otherwise. It needs the page's script to send; hydrate it lazily.
 *
 * Props: `heading?`, `subtitle?`, `actionUrl?` (default `/api/newsletter`), `buttonLabel?` (default
 * "Subscribe"), `labels?` (the other words it draws), `send?` (replaces the default sender, for a site
 * whose subscribe address is not a JSON POST; it resolves on success and throws on failure).
 */
import { ref, useId } from "vue";
import { DEFAULT_NEWSLETTER_LABELS, type NewsletterLabels } from "./labels";
import { postJson } from "./send";

const props = withDefaults(
  defineProps<{
    heading?: string;
    subtitle?: string;
    actionUrl?: string;
    buttonLabel?: string;
    labels?: Partial<NewsletterLabels>;
    send?: (body: { email: string }) => Promise<unknown>;
  }>(),
  { actionUrl: "/api/newsletter", buttonLabel: "Subscribe", labels: () => ({}) },
);

const words = () => ({ ...DEFAULT_NEWSLETTER_LABELS, ...props.labels });
// useId gives the same id on the server and in the browser, and a different one for each signup on a page.
const fieldId = `nl-email-${useId()}`;
const email = ref("");
const status = ref<"idle" | "sending" | "ok" | "error">("idle");

async function submit() {
  status.value = "sending";
  try {
    await (props.send ?? ((body) => postJson(props.actionUrl, body)))({ email: email.value });
    status.value = "ok";
    email.value = "";
  } catch {
    status.value = "error";
  }
}
</script>

<template>
  <section class="nl">
    <div class="nl-inner">
      <h2 v-if="heading" class="nl-heading">{{ heading }}</h2>
      <p v-if="subtitle" class="nl-subtitle">{{ subtitle }}</p>
      <form class="nl-form" @submit.prevent="submit">
        <label class="nl-sr-only" :for="fieldId">{{ words().email }}</label>
        <input
          :id="fieldId" v-model="email" class="nl-input" type="email" required autocomplete="email"
          :placeholder="words().placeholder"
        />
        <button class="nl-button" type="submit" :disabled="status === 'sending'">{{ buttonLabel }}</button>
      </form>
      <!-- The live region is always in the page, so a screen reader hears the answer when it appears.
           Empty, it takes no space. -->
      <div role="status" aria-live="polite">
        <p v-if="status === 'ok'" class="nl-note nl-ok">{{ words().subscribed }}</p>
        <p v-if="status === 'error'" class="nl-note nl-error">{{ words().failed }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. Sizes are the website starter's former Tailwind classes written out. The field and the
   button set their own font, colour, margins and box sizing instead of relying on a CSS reset. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.nl, .nl * { box-sizing: border-box; }
.nl { background: color-mix(in srgb, var(--site-block-accent, #2563eb) 5%, transparent); }
.nl-inner { margin: 0 auto; max-width: 42rem; padding: 4rem 1rem; text-align: center; }
.nl-heading {
  margin: 0; font-size: 1.5rem; line-height: 2rem; font-weight: 600;
  color: var(--site-block-fg, #1a1a1a);
}
.nl-subtitle { margin: 0.75rem 0 0; color: var(--site-block-muted, #4b5563); }
.nl-form { margin: 1.5rem auto 0; display: flex; gap: 0.5rem; max-width: 28rem; }
.nl-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
}
.nl-input {
  flex: 1 1 0%; margin: 0; font: inherit; color: inherit; line-height: inherit;
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 30%, transparent);
  border-radius: var(--site-block-radius, 0.375rem); padding: 0.5rem 0.75rem;
  background: var(--site-block-bg, #ffffff);
}
.nl-input::placeholder { opacity: 1; color: var(--site-block-placeholder, #9ca3af); }
.nl-button {
  margin: 0; font: inherit; line-height: inherit; cursor: pointer; border: 0;
  border-radius: var(--site-block-radius, 0.375rem); padding: 0.5rem 1.25rem; font-weight: 500;
  background: var(--site-block-accent, #2563eb); color: var(--site-block-on-accent, #ffffff);
}
.nl-button:hover { opacity: 0.9; }
.nl-button:disabled { opacity: 0.5; cursor: default; }
.nl-note { margin: 0.75rem 0 0; font-size: 0.875rem; line-height: 1.25rem; }
.nl-ok { color: var(--site-block-success, #15803d); }
.nl-error { color: var(--site-block-danger, #b91c1c); }
</style>
