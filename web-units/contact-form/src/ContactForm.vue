<script setup lang="ts">
/**
 * A contact form: labelled Name, Email and Message fields and a send button. On submit it sends
 * `{ name, email, message, turnstileToken }` to the site's message address and answers in place: a sent
 * line when the address answers with a 2xx whose body is not empty and is not a falsy JSON value (`false`,
 * `0`, `null`, `""`), an error line otherwise. It needs the page's script to send; hydrate it lazily.
 *
 * Props: `actionUrl?` (default `/api/contact`), `turnstileSiteKey?` (when given, it draws the Cloudflare
 * Turnstile widget's placeholder and sends the widget's token; the page loads Turnstile's script and the
 * site's server checks the token), `labels?` (every word it draws), `send?` (replaces the default sender;
 * it resolves with the answer and throws on failure).
 * Added in 0.2.0, all off by default: `showCompany?` (a Company field), `requireName?` and `requireMessage?`
 * (set false to make that field optional; the Email stays required), `compact?` (Name and Email only, a
 * full-width button and a compact Turnstile widget). After every send the form's own Turnstile widget is
 * asked for a fresh token, because a token works once.
 */
import { reactive, ref, useId } from "vue";
import { DEFAULT_CONTACT_LABELS, type ContactLabels, type ContactMessage } from "./labels";
import { postJson } from "./send";

const props = withDefaults(
  defineProps<{
    actionUrl?: string;
    turnstileSiteKey?: string;
    labels?: Partial<ContactLabels>;
    send?: (body: ContactMessage) => Promise<unknown>;
    showCompany?: boolean;
    requireName?: boolean;
    requireMessage?: boolean;
    compact?: boolean;
  }>(),
  { actionUrl: "/api/contact", labels: () => ({}), showCompany: false, requireName: true, requireMessage: true, compact: false },
);

const words = () => ({ ...DEFAULT_CONTACT_LABELS, ...props.labels });
// useId gives the same ids on the server and in the browser, and different ones for each form on a page.
const id = useId();
const ids = { name: `cf-name-${id}`, email: `cf-email-${id}`, message: `cf-message-${id}`, company: `cf-company-${id}` };
const state = reactive({ name: "", company: "", email: "", message: "" });
const status = ref<"idle" | "sending" | "ok" | "error">("idle");
const form = ref<HTMLFormElement | null>(null);

// A Turnstile token works once. Whatever the answer, the server may have seen it, so every finished send asks
// THIS form's widget for a new one (two forms on a page: reset by element, never globally).
type TurnstileApi = { reset: (widget?: string | HTMLElement) => void };
function resetTurnstile() {
  const widget = form.value?.querySelector<HTMLElement>(".cf-turnstile");
  const turnstile = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
  if (!widget || !turnstile) return;
  try { turnstile.reset(widget); } catch { /* the widget is not drawn yet: nothing to refresh */ }
}

async function submit() {
  status.value = "sending";
  try {
    // Turnstile writes its token into a hidden input inside its widget, which sits inside this form.
    const token = form.value?.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value;
    const { company, ...rest } = state;
    const body = { ...rest, ...(props.showCompany && !props.compact ? { company } : {}), turnstileToken: token };
    const res = await (props.send ?? ((b) => postJson(props.actionUrl, b)))(body);
    // As the starter's form did: an empty or falsy answer ("", false, 0, null) is not a confirmation.
    status.value = res ? "ok" : "error";
  } catch {
    status.value = "error";
  } finally {
    resetTurnstile();
  }
}
</script>

<template>
  <form ref="form" class="cf" :class="{ 'cf-compact': compact }" @submit.prevent="submit">
    <div>
      <label class="cf-label" :for="ids.name">{{ words().name }}{{ !requireName ? " " : "" }}<span v-if="!requireName" class="cf-opt">{{ words().optional }}</span></label>
      <input :id="ids.name" v-model="state.name" class="cf-field" :required="requireName" autocomplete="name" />
    </div>
    <div v-if="showCompany && !compact">
      <label class="cf-label" :for="ids.company">{{ words().company }}{{ " " }}<span class="cf-opt">{{ words().optional }}</span></label>
      <input :id="ids.company" v-model="state.company" class="cf-field" autocomplete="organization" />
    </div>
    <div>
      <label class="cf-label" :for="ids.email">{{ words().email }}</label>
      <input :id="ids.email" v-model="state.email" class="cf-field" type="email" required autocomplete="email" />
    </div>
    <div v-if="!compact">
      <label class="cf-label" :for="ids.message">{{ words().message }}{{ !requireMessage ? " " : "" }}<span v-if="!requireMessage" class="cf-opt">{{ words().optional }}</span></label>
      <textarea :id="ids.message" v-model="state.message" class="cf-field cf-message" rows="5" :required="requireMessage" />
    </div>

    <!-- The Cloudflare Turnstile widget's placeholder. Turnstile's script draws it; the server verifies. -->
    <div v-if="turnstileSiteKey" class="cf-turnstile" :data-sitekey="turnstileSiteKey" :data-size="compact ? 'compact' : undefined" />

    <button class="cf-button" type="submit" :disabled="status === 'sending'">
      {{ status === "sending" ? words().sending : words().send }}
    </button>

    <!-- The live region is always in the form, so a screen reader hears the answer when it appears.
         Empty, it takes no space; the answer inside it is spaced as one of the form's own lines. -->
    <div class="cf-status" role="status" aria-live="polite">
      <p v-if="status === 'ok'" class="cf-note cf-ok">{{ words().sent }}</p>
      <p v-if="status === 'error'" class="cf-note cf-error">{{ words().failed }}</p>
    </div>
  </form>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. Sizes are the website starter's former Tailwind classes written out. The fields and the
   button set their own font, colour, margins and box sizing instead of relying on a CSS reset. */
/* Box sizes include padding and border whatever the page's own reset, as under Tailwind's preflight. */
.cf, .cf * { box-sizing: border-box; }
.cf { max-width: 32rem; }
.cf > * + *:not(.cf-status), .cf-status > * { margin-top: 1rem; }
.cf-label { display: block; margin-bottom: 0.25rem; font-size: 0.875rem; line-height: 1.25rem; font-weight: 500; }
.cf-field {
  box-sizing: border-box; width: 100%; margin: 0; font: inherit; color: inherit; line-height: inherit;
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 30%, transparent);
  border-radius: var(--site-block-radius, 0.375rem); padding: 0.5rem 0.75rem;
  background: var(--site-block-bg, #ffffff);
}
.cf-opt { font-weight: 400; color: var(--site-block-muted, #4b5563); }
.cf-compact .cf-button { width: 100%; }
.cf-message { resize: vertical; }
.cf-button {
  margin: 0; font: inherit; line-height: inherit; cursor: pointer; border: 0;
  border-radius: var(--site-block-radius, 0.375rem); padding: 0.75rem 1.25rem; font-weight: 500;
  background: var(--site-block-accent, #2563eb); color: var(--site-block-on-accent, #ffffff);
}
.cf-button:hover { opacity: 0.9; }
.cf-button:disabled { opacity: 0.5; cursor: default; }
.cf-note { margin-bottom: 0; font-size: 0.875rem; line-height: 1.25rem; }
.cf-ok { color: var(--site-block-success, #15803d); }
.cf-error { color: var(--site-block-danger, #b91c1c); }
</style>
