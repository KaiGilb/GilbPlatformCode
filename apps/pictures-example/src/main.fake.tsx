import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { App, forgetEverything } from "./App";
import { PictureEngine } from "./engine";
import { FakeVault, installFakeAuth } from "./fakeVault";
import { configureApp, deviceCacheName } from "./setup";
import { enablePictureDeviceCache } from "@kaigilb/gilbplatformcode-signed-picture";

// dev:fake: the vault and the signed-in person are both fake and live in this page. Nothing leaves it.
const origin = window.location.origin;
const root = `${origin}/vault`;
const params = new URLSearchParams(window.location.search);
const principal = "https://fake.example/i/ann";

configureApp(origin, [window.location.hostname]);
installFakeAuth(principal, root);
const vault = new FakeVault({ origin, root });
window.fetch = vault.fetch as typeof fetch; // every request in this page goes to the fake vault
if (params.get("refuse")) vault.refuseList = "vault target denied: no read reach";
(window as unknown as { __fakeVault: FakeVault }).__fakeVault = vault;

async function seedPictures(n: number): Promise<void> {
  const colours = ["#d1495b", "#edae49", "#00798c", "#30638e", "#66a182"];
  for (let i = 0; i < n; i++) {
    const make = async (w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      g.fillStyle = colours[i % colours.length]!;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff";
      g.font = `${Math.round(h / 3)}px sans-serif`;
      g.fillText(String(i + 1), w / 3, h / 1.6);
      const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.8));
      return new Uint8Array(await blob.arrayBuffer());
    };
    vault.seed(`seed-${i + 1}`, await make(1200, 900), await make(320, 240));
  }
}

function Root() {
  const [signedIn, setSignedIn] = useState(true);
  const engine = useMemo(() => new PictureEngine(vault.session(principal)), [signedIn]);
  useEffect(() => {
    if (!signedIn) return;
    enablePictureDeviceCache({ name: deviceCacheName(principal) });
    let alive = true;
    (async () => {
      await seedOnce();
      if (!alive) return;
      await engine.start();
      // proof helper: open the viewer on the second picture
      if (params.get("view")) {
        await new Promise((r) => setTimeout(r, 300));
        const tiles = document.querySelectorAll<HTMLButtonElement>("[data-tile]");
        tiles[Number(params.get("view")) - 1]?.click();
      }
    })();
    return () => {
      alive = false;
      engine.dispose();
    };
  }, [engine, signedIn]);
  if (!signedIn) {
    return (
      <p style={{ padding: 16 }}>
        Signed out. <button onClick={() => setSignedIn(true)}>Sign in again (fake)</button>
      </p>
    );
  }
  return (
    <App
      engine={engine}
      onSignOut={() => {
        engine.release();
        void forgetEverything();
        setSignedIn(false);
      }}
    />
  );
}

let seeded: Promise<void> | null = null;
function seedOnce(): Promise<void> {
  seeded ??= seedPictures(Number(params.get("seed") ?? 0));
  return seeded;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
