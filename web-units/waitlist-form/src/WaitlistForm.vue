<script setup lang="ts">
/**
 * A waiting-list form. Only a field marked required (email, in the default list) is required;
 * every other label ends with the muted optional word. Choice questions are radio groups.
 * A collection notice, when passed, sits above the button and is not a checkbox: its words go
 * in the body as `notice`, so what is stored is what was shown.
 *
 * On submit it validates, then posts JSON to `actionUrl`. While it sends, the button is disabled
 * and reads `sending`. A truthy answer replaces the form with the thank-you block and moves focus
 * to its heading. A throw, or a falsy answer, shows the error line and keeps every answer.
 *
 * With `turnstileSiteKey` the Turnstile script loads late (near the viewport, or on the first focus)
 * and a send waits up to `tokenWaitMs` for the token. The form is a real `method="post"` form, so
 * without script the named fields post (form-encoded) to the current page, or to `noScriptAction`
 * when that is set. With a Turnstile key such a post carries no token.
 *
 * Props: `fields?`, `actionUrl?`, `noScriptAction?`, `turnstileSiteKey?`, `turnstileScriptUrl?`, `page?`, `labels?`,
 * `notice?`, `send?`, `tokenWaitMs?`.
 * Slot: `sent` replaces the thank-you block. Events: `sent(body)`, `failed(error)`.
 */
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from "vue";
import { buildBody, validate, type FieldError } from "./fields";
import { postJson } from "./send";
import { createTurnstile, DEFAULT_TURNSTILE_SCRIPT_URL, type TurnstileController } from "./turnstile";
import {
  defaultWaitlistFields,
  DEFAULT_WAITLIST_LABELS,
  type WaitlistField,
  type WaitlistLabels,
  type WaitlistNotice,
} from "./types";

const props = withDefaults(
  defineProps<{
    fields?: WaitlistField[];
    /** Where the script sends the JSON. */
    actionUrl?: string;
    /** The form's own `action`, used only with no script. Empty: no `action` attribute, so the browser posts to the current page. */
    noScriptAction?: string;
    turnstileSiteKey?: string;
    turnstileScriptUrl?: string;
    page?: string;
    labels?: Partial<WaitlistLabels>;
    notice?: WaitlistNotice | null;
    send?: (body: Record<string, string>) => Promise<unknown>;
    tokenWaitMs?: number;
  }>(),
  {
    fields: () => defaultWaitlistFields,
    actionUrl: "/api/waitlist",
    noScriptAction: "",
    turnstileSiteKey: "",
    turnstileScriptUrl: DEFAULT_TURNSTILE_SCRIPT_URL,
    page: "",
    labels: () => ({}),
    notice: null,
    tokenWaitMs: 8000,
  },
);

const emit = defineEmits<{
  sent: [body: Record<string, string>];
  failed: [error: unknown];
}>();

const words = () => ({ ...DEFAULT_WAITLIST_LABELS, ...props.labels });
// useId is the same on the server and in the browser, and different for each form on a page.
const uid = useId();
const status = ref<"idle" | "sending" | "sent" | "failed">("idle");
const fieldErrors = ref<FieldError[]>([]);
const lastBody = ref<Record<string, string>>({});
const formEl = ref<HTMLFormElement | null>(null);
const turnstileBox = ref<HTMLElement | null>(null);
const sentRoot = ref<HTMLElement | null>(null);
const sentHeading = ref<HTMLElement | null>(null);
let controller: TurnstileController | null = null;
let alive = true;

/**
 * A name or value as an id part. Every character but a letter or digit becomes `_<hex>_`, so
 * the `-` the ids use between parts never appears inside a part, and two different names
 * never give the same part.
 */
function idPart(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, (c) => `_${(c.codePointAt(0) ?? 0).toString(16)}_`);
}
// The kind word (`field`, `help`, `error`, `option`) sits before the name, so a field called
// `email-help` can never take the id of the help text of a field called `email`.
function fieldId(name: string): string {
  return `${uid}-field-${idPart(name)}`;
}
function helpId(name: string): string {
  return `${uid}-help-${idPart(name)}`;
}
function errorId(name: string): string {
  return `${uid}-error-${idPart(name)}`;
}
function optionId(name: string, value: string): string {
  return `${uid}-option-${idPart(name)}-${idPart(value)}`;
}

function initialValue(field: WaitlistField): string {
  if (field.kind !== "choice" || field.defaultValue === undefined) return "";
  return field.options.some((option) => option.value === field.defaultValue) ? field.defaultValue : "";
}

const values = reactive<Record<string, string>>({});
for (const field of props.fields) values[field.name] = initialValue(field);

// A field added after mount starts with its own default, a choice's `defaultValue` included.
watch(
  () => props.fields,
  (fields) => {
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(values, field.name)) values[field.name] = initialValue(field);
    }
  },
);

function read(name: string): string {
  return values[name] ?? "";
}
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of props.fields) out[field.name] = read(field.name);
  return out;
}
function onFieldInput(name: string, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  values[name] = target.value;
  // Fixed: the message goes as soon as this answer passes. A new message is never added while typing.
  const field = props.fields.find((item) => item.name === name);
  if (field && errorFor(name) && validate([field], { [name]: target.value }).length === 0) {
    fieldErrors.value = fieldErrors.value.filter((error) => error.name !== name);
  }
}

function errorFor(name: string): FieldError | undefined {
  return fieldErrors.value.find((error) => error.name === name);
}
function errorText(name: string): string {
  const error = errorFor(name);
  if (!error) return "";
  if (error.code === "invalidEmail") return words().invalidEmail;
  if (error.code === "tooLong") return words().tooLong.replaceAll("{max}", String(error.max ?? ""));
  return words().required;
}
function helpOf(field: WaitlistField): string | undefined {
  return field.kind === "choice" ? undefined : field.help;
}
function describedBy(field: WaitlistField): string | undefined {
  const ids: string[] = [];
  if (helpOf(field)) ids.push(helpId(field.name));
  if (errorFor(field.name)) ids.push(errorId(field.name));
  return ids.length ? ids.join(" ") : undefined;
}
function autoOf(field: WaitlistField): string | undefined {
  return field.kind === "text" || field.kind === "email" || field.kind === "tel" ? field.autocomplete : undefined;
}
function maxOf(field: WaitlistField): number | undefined {
  return field.kind === "choice" ? undefined : field.maxLength;
}
function rowsOf(field: WaitlistField): number {
  return field.kind === "textarea" && field.rows ? field.rows : 4;
}
function inputType(field: WaitlistField): "text" | "email" | "tel" {
  if (field.kind === "email" || field.kind === "tel") return field.kind;
  return "text";
}

/** The notice's words as drawn: the sentence, then the link's words when the link is shown. */
function shownNotice(notice: WaitlistNotice): string {
  if (notice.linkHref && notice.linkLabel) return `${notice.text} ${notice.linkLabel}`;
  return notice.text;
}

function focusField(name: string): void {
  const form = formEl.value;
  if (!form) return;
  const field = props.fields.find((item) => item.name === name);
  if (!field) return;
  if (field.kind === "choice") {
    const radio = [...form.querySelectorAll<HTMLInputElement>("input[type='radio']")].find((el) => el.name === name);
    radio?.focus();
    return;
  }
  const id = fieldId(name);
  const input = [...form.querySelectorAll<HTMLElement>("input, textarea")].find((el) => el.id === id);
  input?.focus();
}

onMounted(() => {
  if (!props.turnstileSiteKey || !formEl.value || !turnstileBox.value) return;
  controller = createTurnstile({
    siteKey: props.turnstileSiteKey,
    scriptUrl: props.turnstileScriptUrl,
    form: formEl.value,
    box: turnstileBox.value,
    tokenWaitMs: props.tokenWaitMs,
  });
  controller.watch();
});

onBeforeUnmount(() => {
  alive = false;
  controller?.dispose();
  controller = null;
});

function onFocusIn(): void {
  controller?.notifyFocus();
}

async function onSubmit(): Promise<void> {
  if (status.value === "sending") return;
  const found = validate(props.fields, snapshot());
  fieldErrors.value = found;
  if (found.length) {
    status.value = "idle";
    await nextTick();
    const first = found[0];
    if (first) focusField(first.name);
    return;
  }
  status.value = "sending";
  let token = "";
  try {
    if (props.turnstileSiteKey) {
      if (!controller) throw new Error("no Turnstile token in time");
      token = await controller.waitForToken();
    }
    const body = buildBody(props.fields, snapshot(), {
      page: props.page,
      ...(props.notice ? { notice: shownNotice(props.notice) } : {}),
      ...(token ? { turnstileToken: token } : {}),
    });
    const answer = await (props.send ?? ((payload) => postJson(props.actionUrl, payload)))(body);
    if (!alive) return;
    if (!answer) {
      status.value = "failed";
      emit("failed", new Error("not sent"));
      if (token) controller?.reset();
      return;
    }
    lastBody.value = body;
    status.value = "sent";
    controller?.dispose();
    controller = null;
    emit("sent", body);
    await nextTick();
    const target =
      sentHeading.value ?? sentRoot.value?.querySelector<HTMLElement>("h1, h2, h3, [tabindex='-1']") ?? sentRoot.value;
    target?.focus();
  } catch (error) {
    if (!alive) return;
    status.value = "failed";
    emit("failed", error);
    if (token) controller?.reset();
  }
}
</script>

<template>
  <div class="wl">
    <form
      v-if="status !== 'sent'"
      ref="formEl"
      class="wl-form"
      method="post"
      :action="noScriptAction || undefined"
      novalidate
      @submit.prevent="onSubmit"
      @focusin="onFocusIn"
    >
      <div v-for="field in fields" :key="field.name" class="wl-row">
        <fieldset
          v-if="field.kind === 'choice'"
          class="wl-choice-group"
          :aria-invalid="errorFor(field.name) ? 'true' : undefined"
          :aria-describedby="describedBy(field) || undefined"
        >
          <legend class="wl-legend">
            {{ field.label }}<span v-if="!field.required" class="wl-opt">{{ " " + words().optional }}</span>
          </legend>
          <div class="wl-options" :class="field.look === 'pills' ? 'wl-options--pills' : field.columns === 2 ? 'wl-options--tiles wl-options--two' : 'wl-options--tiles'">
            <label v-for="option in field.options" :key="option.value" class="wl-option">
              <input
                :id="optionId(field.name, option.value)"
                type="radio"
                :name="field.name"
                :value="option.value"
                :checked="read(field.name) === option.value"
                :required="field.required === true"
                :aria-invalid="errorFor(field.name) ? 'true' : undefined"
                :aria-describedby="describedBy(field) || undefined"
                class="wl-choice"
                @change="onFieldInput(field.name, $event)"
              />
              <span v-if="field.look === 'pills'" class="wl-pill">{{ option.label }}</span>
              <span v-else class="wl-tile">
                <span class="wl-dot" aria-hidden="true" />
                <span class="wl-option-text">
                  <span class="wl-option-label">{{ option.label }}</span>
                  <span v-if="option.help" class="wl-option-help">{{ option.help }}</span>
                </span>
              </span>
            </label>
          </div>
          <p v-if="errorFor(field.name)" :id="errorId(field.name)" class="wl-field-error">{{ errorText(field.name) }}</p>
        </fieldset>

        <template v-else>
          <label class="wl-label" :for="fieldId(field.name)">
            {{ field.label }}<span v-if="!field.required" class="wl-opt">{{ " " + words().optional }}</span>
          </label>
          <p v-if="helpOf(field)" :id="helpId(field.name)" class="wl-help">{{ helpOf(field) }}</p>
          <textarea
            v-if="field.kind === 'textarea'"
            :id="fieldId(field.name)"
            class="wl-field wl-area"
            :name="field.name"
            :value="read(field.name)"
            :rows="rowsOf(field)"
            :placeholder="field.placeholder || undefined"
            :required="field.required === true"
            :maxlength="maxOf(field)"
            :aria-invalid="errorFor(field.name) ? 'true' : undefined"
            :aria-describedby="describedBy(field) || undefined"
            @input="onFieldInput(field.name, $event)"
          />
          <input
            v-else
            :id="fieldId(field.name)"
            class="wl-field"
            :type="inputType(field)"
            :name="field.name"
            :value="read(field.name)"
            :placeholder="field.placeholder || undefined"
            :required="field.required === true"
            :maxlength="maxOf(field)"
            :autocomplete="autoOf(field)"
            :autocapitalize="field.kind === 'email' ? 'none' : undefined"
            :spellcheck="field.kind === 'email' ? false : undefined"
            :aria-invalid="errorFor(field.name) ? 'true' : undefined"
            :aria-describedby="describedBy(field) || undefined"
            @input="onFieldInput(field.name, $event)"
          />
          <p v-if="errorFor(field.name)" :id="errorId(field.name)" class="wl-field-error">{{ errorText(field.name) }}</p>
        </template>
      </div>

      <!-- Turnstile draws its widget here after the script loads. No key: no box and no script. -->
      <div v-if="turnstileSiteKey" ref="turnstileBox" class="wl-turnstile" />

      <div class="wl-actions">
        <p v-if="notice" class="wl-notice">{{ notice.text }}<template v-if="notice.linkHref && notice.linkLabel">{{ " " }}<a :href="notice.linkHref">{{ notice.linkLabel }}</a></template></p>

        <!-- Always in the form, so a screen reader hears the error when it appears. Empty, it takes no height; the gaps around it stay. -->
        <div class="wl-live" role="status" aria-live="polite">
          <p v-if="status === 'failed'" class="wl-fail">{{ words().failed }}</p>
          <span v-else-if="status === 'sending'" class="wl-sr">{{ words().sending }}</span>
        </div>

        <button class="wl-button" type="submit" :disabled="status === 'sending'">
          {{ status === "sending" ? words().sending : words().submit }}
        </button>
      </div>
    </form>

    <div v-else ref="sentRoot" class="wl-sent" tabindex="-1">
      <slot name="sent" :body="lastBody">
        <h2 ref="sentHeading" tabindex="-1" class="wl-sent-heading">{{ words().sentHeading }}</h2>
        <p class="wl-sent-body">{{ words().sentBody }}</p>
      </slot>
    </div>
  </div>
</template>

<style scoped>
/* Theme: the --site-block-* variables (one set for every website block in this library); neutral
   fallbacks. The fields and the button set their own font, colour, margins and box sizing
   instead of relying on a CSS reset. Text inherits the page's font. */
.wl, .wl * { box-sizing: border-box; }
.wl {
  max-width: 40rem;
  color: var(--site-block-fg, #1a1a1a);
  font-size: 1rem;
  line-height: 1.5;
}
/* The source's layout: 36px between the form's parts (gap-9), 16px between the notice, the
   live region and the button (gap-4). A gap stays beside an empty region, so nothing moves
   when a send starts. */
.wl-form { display: flex; flex-direction: column; gap: 2.25rem; }
.wl-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 1rem; }
.wl-row { display: flex; flex-direction: column; gap: 0.5rem; }
.wl-label, .wl-legend {
  display: block;
  margin: 0;
  padding: 0;
  font-size: 1.125rem;
  line-height: 1.375;
  font-weight: 500;
}
.wl-legend { margin-bottom: 0.75rem; }
.wl-opt { font-weight: 400; color: var(--site-block-muted, #4b5563); }
.wl-help, .wl-notice { margin: 0; font-size: 1rem; line-height: 1.5; color: var(--site-block-muted, #4b5563); }
.wl-option-help { margin: 0; font-size: 1rem; line-height: 1.375; color: var(--site-block-muted, #4b5563); }
.wl-notice a {
  font-weight: 600;
  color: var(--site-block-accent, #2563eb);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--site-block-accent, #2563eb) 45%, transparent);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
.wl-notice a:hover, .wl-notice a:focus-visible {
  text-decoration-color: var(--site-block-accent, #2563eb);
  text-decoration-thickness: 2px;
}
.wl-field {
  display: block;
  width: 100%;
  min-height: 48px;
  margin: 0;
  padding: 0.75rem 1rem;
  font: inherit;
  color: inherit;
  line-height: inherit;
  background: var(--site-block-field-bg, rgb(255 255 255 / 0.7));
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 65%, transparent);
  border-radius: var(--site-block-radius, 0.375rem);
}
.wl-field:hover, .wl-field:focus { border-color: var(--site-block-fg, #1a1a1a); }
.wl-field[aria-invalid="true"] { border-color: var(--site-block-danger, #b91c1c); }
.wl-choice-group[aria-invalid="true"] .wl-tile, .wl-choice-group[aria-invalid="true"] .wl-pill { border-color: var(--site-block-danger, #b91c1c); }
@media (prefers-reduced-motion: no-preference) {
  .wl-field { transition: border-color var(--site-block-motion, 180ms) cubic-bezier(0.32, 0.72, 0, 1); }
  .wl-button { transition: background-color var(--site-block-motion, 180ms) cubic-bezier(0.32, 0.72, 0, 1), transform var(--site-block-motion, 180ms) cubic-bezier(0.32, 0.72, 0, 1); }
  .wl-button:active:not(:disabled) { transform: scale(0.98); }
}
.wl-area { resize: vertical; }
.wl-field::placeholder { color: color-mix(in srgb, var(--site-block-muted, #4b5563) 80%, transparent); opacity: 1; }
.wl-choice-group {
  margin: 0;
  padding: 0;
  border: 0;
  min-inline-size: 0;
}
/* The answers, as the source draws them: tiles in a grid (one column, or two from 640px), or pills in
   a wrapping row, 0.75rem apart. */
.wl-options { gap: 0.75rem; }
.wl-options--tiles { display: grid; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 640px) { .wl-options--two { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.wl-options--pills { display: flex; flex-wrap: wrap; }
.wl-option { position: relative; display: block; margin: 0; cursor: pointer; }
/* The radio is visually hidden, still focusable and still the control; the tile or pill draws its state. */
.wl-choice {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.wl-tile, .wl-pill {
  border: 1px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 65%, transparent);
  background: var(--site-block-field-bg, rgb(255 255 255 / 0.7));
  color: var(--site-block-fg, #1a1a1a);
  transition-property: border-color, background-color, color, box-shadow;
}
.wl-tile {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  height: 100%;
  min-height: 48px;
  padding: 1rem;
  border-radius: var(--site-block-radius, 0.375rem);
}
.wl-pill {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  padding: 0 1.25rem;
  border-radius: 999px;
  font-weight: 500;
}
/* The radio mark in a tile: an empty ring, filled when chosen. It is real state, not decoration. */
.wl-dot {
  position: relative;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 3px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--site-block-muted, #4b5563) 65%, transparent);
}
.wl-dot::after {
  content: "";
  position: absolute;
  inset: 3px;
  border-radius: 999px;
  background-color: var(--site-block-fg, #1a1a1a);
  transform: scale(0);
}
.wl-tile:hover, .wl-pill:hover { border-color: var(--site-block-fg, #1a1a1a); }
/* Chosen tile: ink border, doubled inward so it reads without colour, and a filled mark. */
.wl-choice:checked + .wl-tile {
  border-color: var(--site-block-fg, #1a1a1a);
  box-shadow: inset 0 0 0 1px var(--site-block-fg, #1a1a1a);
}
.wl-choice:checked + .wl-tile .wl-dot { border-color: var(--site-block-fg, #1a1a1a); }
.wl-choice:checked + .wl-tile .wl-dot::after { transform: scale(1); }
/* Chosen pill: ink with the page colour as its label. */
.wl-choice:checked + .wl-pill {
  border-color: var(--site-block-fg, #1a1a1a);
  background-color: var(--site-block-fg, #1a1a1a);
  color: var(--site-block-bg, #ffffff);
}
/* The radio is hidden, so its keyboard focus is drawn on the tile or pill. */
.wl-choice:focus-visible + .wl-tile,
.wl-choice:focus-visible + .wl-pill {
  outline: 2px solid var(--site-block-accent, #2563eb);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: no-preference) {
  .wl-tile, .wl-pill {
    transition-duration: var(--site-block-motion, 180ms);
    transition-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
  }
  .wl-dot::after { transition: transform var(--site-block-motion, 180ms) cubic-bezier(0.32, 0.72, 0, 1); }
}
.wl-option-text { display: flex; flex-direction: column; gap: 0.25rem; }
.wl-option-label { font-weight: 600; }
.wl-field-error, .wl-fail {
  margin: 0;
  font-size: 1rem;
  line-height: 1.5;
  font-weight: 500;
  color: var(--site-block-danger, #b91c1c);
}
.wl-choice-group .wl-field-error { margin-top: 0.5rem; }
.wl-live { position: relative; }
/* Read by a screen reader, not drawn. */
.wl-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
/* The widget's box is reserved at the source's 65px, so it does not push the button when it draws. */
.wl-turnstile { min-height: 65px; }
.wl-button {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  margin: 0;
  padding: 0.75rem 1.75rem;
  font: inherit;
  font-weight: 500;
  line-height: inherit;
  cursor: pointer;
  border: 0;
  border-radius: 999px;
  background: var(--site-block-cta, var(--site-block-accent, #2563eb));
  color: var(--site-block-on-cta, var(--site-block-on-accent, #ffffff));
}
.wl-button:hover { background: var(--site-block-cta-hover, color-mix(in srgb, var(--site-block-cta, var(--site-block-accent, #2563eb)) 88%, black)); }
.wl-button:disabled { opacity: 0.7; cursor: progress; }
.wl :focus-visible,
.wl-sent-heading:focus {
  outline: 2px solid var(--site-block-accent, #2563eb);
  outline-offset: 3px;
}
.wl-sent-heading {
  margin: 0;
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 600;
  color: var(--site-block-success, #15803d);
}
.wl-sent-body { margin: 0.75rem 0 0; }
</style>
