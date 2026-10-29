// Test fixture (not shipped API): a host's wiring, with the wording of the app the code came from, so the ported tests keep their expectations word for word.
import { createBackgroundJobs, type BackgroundJobsOptions, type JobKind } from "./backgroundJobs";

export const STORAGE_KEY = "test.jobIntents";
const stripDot = (t: string) => t.replace(/\.+\s*$/, "");
export const failText = (kind: JobKind, message: string): string => {
  const m = message.trim();
  if (/^(Approved|Checked)/i.test(m)) return /[.!?]$/.test(m) ? m : `${m}.`;
  if (kind === "picture") return `No new picture: ${stripDot(m)}.`;
  if (kind === "pick") return `Not requested: ${stripDot(m)}. Open Topics.`;
  return kind === "queue" || kind === "queueWhenChecked" ? `Not added: ${stripDot(m)}. Open the draft.` : `Not posted: ${stripDot(m)}. Open the draft.`;
};
export const unfinishedText = (label: string, kind?: JobKind) => (kind === "pick" ? `This action did not finish: ${label}. Open Topics to check.` : `This action did not finish: ${label}. Open the draft to check.`);
export const hostOptions = (): BackgroundJobsOptions => ({
  storageKey: STORAGE_KEY,
  kinds: ["queue", "postNow", "queueWhenChecked", "postWhenChecked", "picture", "pick"],
  failText,
  unfinishedText,
  cancelledText: "Cancelled: the draft was edited again.",
  crashText: "Something went wrong, so nothing more was recorded. Open the draft and look before you try again.",
  quietSuccessKinds: ["pick"],
});
export const WHEN_CHECKED = ["queueWhenChecked", "postWhenChecked"] as const;
export const makeJobs = (o: Partial<BackgroundJobsOptions> = {}) => createBackgroundJobs({ ...hostOptions(), ...o });
