// Test support, not shipped: a fake with three people, and a caller that signs every request with a real ES256 key through the signin unit.
import { dpopHeaders, generateDpopKeyPair, type DpopKey } from "@kaigilb/gilbplatformcode-signin";
import { createFakePlatform, type FakePlatform, type FakePlatformOptions, type Person, type Vault } from "../src";

export interface Who {
  person: Person;
  token: string;
  key: DpopKey;
  headers(method: string, url: string): Promise<Record<string, string>>;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** picture-set's `Send`: (method, url, init). */
  send(method: string, url: string, init?: RequestInit): Promise<Response>;
}

export interface World {
  fake: FakePlatform;
  ann: Person;
  ben: Person;
  cat: Person;
  annV: Vault;
  as(p: Person): Promise<Who>;
  clock: { ms: number };
}

export async function world(opts: FakePlatformOptions = {}): Promise<World> {
  const clock = { ms: Date.now() };
  const fake = createFakePlatform({ now: () => clock.ms, ...opts });
  const ann = fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
  const ben = fake.seedPerson({ email: "ben@example.test", vaultName: "ben" });
  const cat = fake.seedPerson({ email: "cat@example.test" });
  const annV = fake.state.vaults.get(ann.landingVaultId!)!;
  const as = async (p: Person): Promise<Who> => {
    const key = await generateDpopKeyPair();
    const { token } = fake.signInAs(p, { jwk: key.publicJwk });
    const headers = async (method: string, url: string) => ({ ...(await dpopHeaders(key, token, method, url)) });
    const doFetch = async (url: string, init: RequestInit = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      return fake.fetch(url, { ...init, method, headers: { ...(init.headers as Record<string, string> | undefined), ...(await headers(method, url)) } });
    };
    return {
      person: p,
      token,
      key,
      headers,
      fetch: doFetch,
      send: (method, url, init = {}) => doFetch(url, { ...init, method }),
    };
  };
  return { fake, ann, ben, cat, annV, as, clock };
}

export const vaultUrl = (v: Vault, tail: string): string => `https://${v.host}/lws/vault/${encodeURIComponent(v.id)}${tail}`;
export const recUrl = (v: Vault, id: string): string => `https://${v.host}/lws/r/${id}`;
export const json = (body: unknown): RequestInit => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const body = async (res: Response): Promise<any> => res.json();
export const idOf = (location: string): string => location.slice(location.lastIndexOf("/") + 1);
