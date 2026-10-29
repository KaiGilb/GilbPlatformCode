import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CardModeActions } from "@kaigilb/gilbplatformcode-card-mode";
import { PlanCardsGilbPlatformProvider } from "@kaigilb/gilbplatformcode-plan-card-hosts-gilbplatform";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { planRecordKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { uriTail } from "@kaigilb/gilbplatformcode-id-tail";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { parseAddress } from "./address";
import { cardFor } from "./cardFor";
import { providerSettings, type AppSettings } from "./settings";

/** Reads the record through `lws-records` (into the cache key the cards write their saved row to) and draws the card its type names. */
function RecordView({ id, at, canEdit }: { id: string; at: string | null; canEdit: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  const q = useQuery({ queryKey: planRecordKey(id, at), queryFn: () => readRecord(id, at) });
  if (q.isPending) return <p>Reading the record.</p>;
  if (q.isError) return <p role="alert">The record could not be read: {q.error instanceof Error ? q.error.message : "unknown error"}</p>;
  const record = q.data;
  if (!record) return <p>No record answers at that address.</p>;
  const Card = cardFor(record);
  if (!Card) return <p>This app draws Value, Function, Solution and Development Resource cards; a record of type {record.typeSubstituted ? "(none named)" : uriTail(record.typeUri)} is not drawn.</p>;
  const entity = record.entityUri ?? "";
  const cut = entity.lastIndexOf("/e/");
  if (cut < 0) return <p>The vault did not name this record's own address, so its card cannot be drawn.</p>;
  return (
    <>
      {notice && <p role="status">{notice}</p>}
      {/* The cards draw no Edit control of their own: the page draws the card mode's (nothing when the person may not write). */}
      <CardModeActions />
      <Card key={`${record.id}:${canEdit}`} record={record} vaultId={entity.slice(0, cut)} canEdit={canEdit} onOpen={(other) => setNotice(`This app draws one record at a time. To open ${other}, type its address.`)} onNotice={setNotice} />
    </>
  );
}

export function CardScreen({ settings, session }: { settings: AppSettings; session: SessionCredential }) {
  const [text, setText] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [shown, setShown] = useState<ReturnType<typeof parseAddress> | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setShown(parseAddress(text));
  };
  return (
    <section aria-label="Card">
      <form onSubmit={submit}>
        <label>
          Record address or id <input value={text} onChange={(e) => setText(e.target.value)} size={64} />
        </label>{" "}
        <label>
          <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} /> Can edit
        </label>{" "}
        <button type="submit">Show card</button>
      </form>
      {shown && !shown.ok && <p role="alert">{shown.problem}</p>}
      {shown?.ok && (
        <PlanCardsGilbPlatformProvider {...providerSettings(settings)} session={session} canEdit={canEdit}>
          <RecordView key={`${shown.at ?? ""}|${shown.id}`} id={shown.id} at={shown.at} canEdit={canEdit} />
        </PlanCardsGilbPlatformProvider>
      )}
    </section>
  );
}
