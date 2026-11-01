/**
 * The addresses of theirs on the online card, with the names of the places they bind, and an honest count when a place
 * was not read or is gone. No drawing: the card's body is unchanged.
 *
 * ⛔ Off (no request) unless the read is enabled, the fields are in hand, and the host has both `addressSpellings` and
 * `readPlaceNames`. Absent either member, the card stays as before.
 * ⛔ A rejected spelling read is `failed`, never an empty address list: "no address" must not come from a failed read.
 * ⛔ Names are not handed back until every asked id has an answer. An empty answer is "not read", not "no place".
 * Beyond the source (Kai, 2026-11-01).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { OnlineCardField } from "@kaigilb/gilbplatformcode-online-card";
import { theirAddressesOf, type AddressSpellings, type TheirAddress } from "@kaigilb/gilbplatformcode-one-card-merge";
import { useOneCardHost, type GeoPlace, type TheirPlaceRead } from "./oneCardHost";
import { orderPlaces } from "./placeOrder";

export interface TheirAddressView extends TheirAddress {
  city: string | null; // name
  region: string | null; // names joined ", "
  country: string | null; // name
  countryId: string | null; // the country place's id (for the flag)
  unread: number; // places of THIS address that failed to read
  gone: number; // places of THIS address the catalogue no longer has (404)
}

export type TheirAddressesState =
  | { state: "off" } // host has no addressSpellings/readPlaceNames, or not enabled, or fields null
  | { state: "reading" } // spellings or names not answered yet
  | { state: "failed" } // spellings rejected: we cannot tell which fields are address parts
  | { state: "ready"; addresses: TheirAddressView[]; loose: OnlineCardField[] };

type SpellingsState = { state: "ready"; value: AddressSpellings } | { state: "failed" };
type SpellingsCache =
  | { status: "empty" }
  | { status: "pending"; done: Promise<void> }
  | { status: "ready"; value: AddressSpellings }
  | { status: "failed" };

function viewOf(address: TheirAddress, asked: readonly string[], rows: readonly TheirPlaceRead[]): TheirAddressView {
  const named: GeoPlace[] = [];
  let unread = 0;
  let gone = 0;
  for (const id of address.placeIds) {
    const at = asked.indexOf(id);
    const read = at < 0 ? undefined : rows[at];
    if (!read || read.state === "failed") {
      unread += 1;
      continue;
    }
    if (read.state === "missing") {
      gone += 1;
      continue;
    }
    if (read.place.label.trim() === "") {
      unread += 1;
      continue;
    }
    named.push(read.place);
  }
  const ordered = orderPlaces(named);
  return {
    ...address,
    city: ordered.city?.label ?? null,
    region: ordered.regions.map((p) => p.label).join(", ") || null,
    country: ordered.country?.label ?? null,
    countryId: ordered.country?.id ?? null,
    unread,
    gone,
  };
}

/**
 * The addresses of theirs, for a caller that will draw them. `reading` until the spellings and, when an address binds
 * places, the names have answered. `failed` only when the spellings reject.
 *
 * @param enabled read only when their address is wanted (the feature is on)
 * @param fields the online card's fields, or null while the card itself has not been read
 */
export function useTheirAddresses(enabled: boolean, fields: readonly OnlineCardField[] | null): TheirAddressesState {
  const host = useOneCardHost();
  const hasMembers = typeof host.addressSpellings === "function" && typeof host.readPlaceNames === "function";
  const on = enabled && fields !== null && hasMembers;

  const cache = useRef<SpellingsCache>({ status: "empty" });
  const [spellings, setSpellings] = useState<SpellingsState | null>(null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const publish = () => {
      if (!alive) return;
      const now = cache.current;
      if (now.status === "ready") setSpellings({ state: "ready", value: now.value });
      else if (now.status === "failed") setSpellings({ state: "failed" });
    };
    if (cache.current.status === "empty") {
      let pending: Promise<AddressSpellings>;
      try {
        pending = Promise.resolve(host.addressSpellings!());
      } catch (e) {
        pending = Promise.reject(e);
      }
      const done = pending.then(
        (value) => {
          cache.current = { status: "ready", value };
        },
        () => {
          cache.current = { status: "failed" };
        },
      );
      cache.current = { status: "pending", done };
    }
    const snap = cache.current;
    if (snap.status === "pending") void snap.done.then(publish);
    else publish();
    return () => {
      alive = false;
    };
    // The spellings are asked once per mount; `on` is the gate, not a new question.
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    if (!on || !spellings || spellings.state !== "ready" || fields === null) return null;
    return theirAddressesOf(fields, spellings.value);
  }, [on, spellings, fields]);
  const asked = useMemo(() => {
    if (!grouped) return [] as string[];
    return [...new Set(grouped.addresses.flatMap((a) => a.placeIds))].sort();
  }, [grouped]);
  const key = asked.join("\n");

  const [reads, setReads] = useState<{ key: string; rows: TheirPlaceRead[] } | null>(null);
  useEffect(() => {
    let alive = true;
    if (!on || !spellings || spellings.state !== "ready" || asked.length === 0) return;
    const ids = asked;
    let pending: Promise<TheirPlaceRead[]>;
    try {
      pending = Promise.resolve(host.readPlaceNames!(ids));
    } catch (e) {
      pending = Promise.reject(e);
    }
    void pending.then(
      (rows) => {
        if (alive) setReads({ key, rows: Array.isArray(rows) ? rows : [] });
      },
      () => {
        if (alive) setReads({ key, rows: ids.map(() => ({ state: "failed" as const })) });
      },
    );
    return () => {
      alive = false;
    };
    // `key` is the sorted id set; one request per distinct set.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (!on) return { state: "off" };
    if (!spellings) return { state: "reading" };
    if (spellings.state === "failed") return { state: "failed" };
    if (!grouped) return { state: "reading" };
    if (asked.length > 0 && !(reads && reads.key === key)) return { state: "reading" };
    const rows = asked.length > 0 ? reads!.rows : [];
    return { state: "ready", addresses: grouped.addresses.map((a) => viewOf(a, asked, rows)), loose: grouped.loose };
  }, [on, spellings, grouped, asked, reads, key]);
}
