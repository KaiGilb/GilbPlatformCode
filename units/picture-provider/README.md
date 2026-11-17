# picture-provider

One picture from a picture-making service (WaveSpeed), recorded before and after the call. No host, no key and no price is built in.

## What this is

One picture from a picture-making service, recorded before and after the call. The parts:

- `makePicture(deps, ask)`: the one flow. Config and price check, the host's gate, the attempt written BEFORE the call, one call, the host keeps the bytes, ONE finishing write. Never throws.
- `makeWaveSpeedPicture(deps, req)`: one submit, polls, and the fetch of the bytes. The submit POST is sent once and never repeated.
- `pictureEgress(apiBase, outputHosts, fetch, { extraGuard })`: two guarded fetches. `api` reaches only the configured base; `output` reaches only the listed output hosts. https only, no IP address, no machine name, no port but 443.
- `pictureConfig(env, modelId)`: on or off, with one sentence why. No price for the model means no call.
- `redactSecrets(text, secrets)`: removes keys and Bearer values from any text that leaves the unit.
- `pngSize`, `imageBytesMatch`: checks the bytes by their magic numbers.

Runs in Node 22 and in a Cloudflare Worker: `fetch`, `AbortSignal.timeout` and `URL` only.

## What this is not

- Not a store. The host keeps the bytes (`PictureHost.store`) and writes the records (`writeAttempt`, `finish`).
- Not a counter. The host's `reserve` is the cap, the ceiling, or both.
- Not a prompt builder. The host writes the prompt.
- Not a background remover or a picture checker. A host that must refuse bytes does it in `store` and answers `{ notStored }`.

## How to take it

Package: `@kaigilb/gilbplatformcode-picture-provider`. Pack it from a clone at a commit (`npm pack` in this folder runs the build) and keep the packed file in your repository, for example `vendor/gilbplatformcode-picture-provider/kaigilb-gilbplatformcode-picture-provider-0.1.0.tgz`, then depend on it with `file:`.

```ts
import { makePicture } from "@kaigilb/gilbplatformcode-picture-provider";

const r = await makePicture(
  { host, env: { WAVESPEED_API_BASE, WAVESPEED_API_KEY, PICTURE_OUTPUT_HOSTS, PICTURE_PRICES }, fetch },
  { modelId: "wavespeed-ai/flux-schnell", prompt, size: "320*320", outputFormat: "png" },
);
```

## What the host must supply

- `host.reserve({ modelId, price })`: `{ ok: true }`, or `{ ok: false, failure: "CapReached" | "CountUnavailable", reason }`.
- `host.writeAttempt({ modelId, prompt, price })`: writes the attempt record; returns its address.
- `host.store({ attempt, bytes, contentType })`: `{ file }`, or `{ notStored: reason }`.
- `host.finish({ attempt, outcome, file?, notBilled, price })`: the one finishing write.
- `env`: `WAVESPEED_API_BASE` (https), `WAVESPEED_API_KEY` (from the host's secret store), `PICTURE_OUTPUT_HOSTS` (comma list), `PICTURE_PRICES` (JSON `{"<model>": {"amount": "0.003", "currency": "USD"}}`).
- Optional `extraGuard(url, method)`: the host's own egress rule; throw to refuse.

## Do not

- Do not call the service with your own fetch. The two guarded fetches keep the key away from the output hosts.
- Do not retry a submit. An answer you did not get may be a billed picture.
- Do not log a reason without the redactor; every reason this unit returns is already redacted with the key.

## Where it came from

Lifted from Social at commit 309ffea0e63aeae6f43ef05472599658c4efcaf9 (`shared/imageProvider.ts`, `workers/social-worker/src/pictures/{wavespeed,makePicture,config}.ts`, and the picture part of `workers/social-worker/src/egress.ts`) so Social and GilbPlatform use one way. Social's own copies are removed.
