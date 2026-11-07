import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { RecordConflictError } from "@kaigilb/gilbplatformcode-lws-records";
import { NoAccessError, VaultBusyError, refusalLine } from "@kaigilb/gilbplatformcode-refusal-detail";
import { PictureUnreadableError } from "@kaigilb/gilbplatformcode-picture-shrink";
import { PictureUploadError } from "@kaigilb/gilbplatformcode-picture-upload";

export type PictureFailureKind =
  | "no-access"
  | "not-signed-in"
  | "vault-busy"
  | "wrong-vault-root"
  | "wrong-sign-in-host"
  | "too-big"
  | "storage-full"
  | "unreadable"
  | "changed-elsewhere"
  | "offline"
  | "unknown";

/** The person's words for one kind: what went wrong, and what to do next. */
export type PictureFailureWords = Record<PictureFailureKind, { sentence: string; next: string }>;

export type PictureFailure = { kind: PictureFailureKind; sentence: string; next: string; detail: string | null };

/** English words. For `unreadable` the sentence is the error's own message unless the app overrides it. */
export const DEFAULT_PICTURE_FAILURE_WORDS: PictureFailureWords = {
  "no-access": { sentence: "You can not add pictures here.", next: "Ask the owner for write access." },
  "not-signed-in": { sentence: "You are signed out.", next: "Sign in again; your picture waits on this device." },
  "vault-busy": { sentence: "The vault is busy.", next: "Your picture waits on this device and is sent again soon." },
  "wrong-vault-root": { sentence: "This app is pointed at the wrong vault address.", next: "Tell the app's maker: the vault root must come from the vault list." },
  "wrong-sign-in-host": { sentence: "This app signs in at the wrong place.", next: "Tell the app's maker: the sign-in host is wrong." },
  "too-big": { sentence: "The picture is too big for the vault.", next: "Pick a smaller picture." },
  "storage-full": { sentence: "The vault is full.", next: "Ask the owner to make room." },
  unreadable: { sentence: "This picture format can not be read here.", next: "Pick a JPEG or PNG." },
  "changed-elsewhere": { sentence: "Someone else changed this just now.", next: "Reload and try again." },
  offline: { sentence: "You are offline.", next: "Your picture waits on this device and is sent when you are back online." },
  unknown: { sentence: "The picture could not be saved.", next: "Try again; if it keeps failing, tell the app's maker." },
};

const OFFLINE_MESSAGE = /failed to fetch|fetch failed|network|offline|load failed/i;

/** The `message` of a JSON body, else the body itself (null for an empty body). */
function bodyMessage(body: string): string | null {
  try {
    const j: unknown = JSON.parse(body);
    if (j && typeof j === "object" && typeof (j as { message?: unknown }).message === "string") return (j as { message: string }).message;
  } catch {
    // not JSON: the body is the message
  }
  return body === "" ? null : body;
}

/**
 * Turns any failure of adding, storing or showing a picture into one sentence, what to do next, and (when there is one) the detail
 * to keep for a report. The first kind that fits wins, in the order of `PictureFailureKind`'s checks (a `NoAccessError` while
 * offline is still `no-access`). `words` replaces the sentences and nexts, per kind, field by field.
 */
export function pictureFailure(e: unknown, words?: Partial<{ [K in keyof PictureFailureWords]: Partial<PictureFailureWords[K]> }>): PictureFailure {
  const say = (kind: PictureFailureKind, detail: string | null = null): PictureFailure => ({
    kind,
    sentence: words?.[kind]?.sentence ?? DEFAULT_PICTURE_FAILURE_WORDS[kind].sentence,
    next: words?.[kind]?.next ?? DEFAULT_PICTURE_FAILURE_WORDS[kind].next,
    detail,
  });
  if (e instanceof NoAccessError) return say("no-access", e.detail ? refusalLine(e.detail) : e.serverSentence);
  if (e instanceof NotSignedInError) return say("not-signed-in");
  if (e instanceof VaultBusyError) return say("vault-busy");
  if (e instanceof PictureUploadError) {
    if (e.status === 400 && e.body.includes("WrongVaultRoot")) return say("wrong-vault-root", bodyMessage(e.body));
    if (e.status === 400 && e.body.includes("WrongSignInHost")) return say("wrong-sign-in-host", bodyMessage(e.body));
    if (e.status === 413) return say("too-big");
    if (e.status === 507) return say("storage-full");
  }
  if (e instanceof PictureUnreadableError) return { ...say("unreadable"), sentence: words?.unreadable?.sentence ?? e.message };
  if (e instanceof RecordConflictError) return say("changed-elsewhere");
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false) || OFFLINE_MESSAGE.test(message)) return say("offline");
  return say("unknown", message);
}
