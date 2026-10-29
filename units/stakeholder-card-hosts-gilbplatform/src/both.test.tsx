// An app that mounts both ready-made providers with the same props: the two set the same singletons to the same values, each draws its own
// cards, and neither one undoes the other. The Plan-card provider is the unit `plan-card-hosts-gilbplatform`, which is not changed.
import { useContext } from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { baseOrigin, systemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { systemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { dpopReadAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { typeKey } from "@kaigilb/gilbplatformcode-type-key";
import { PlanCardsGilbPlatformProvider } from "@kaigilb/gilbplatformcode-plan-card-hosts-gilbplatform";
import { PlanSourceHostContext } from "@kaigilb/gilbplatformcode-plan-source";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { OnlineStakeholderCard, OnlineStakeholderCardHostContext } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { StakeholderCardGilbPlatformProvider } from "./index";
import { BEN, HOST, createWorld } from "../test/world";
import { providerProps } from "../test/harness";

function sameProps(world: Awaited<ReturnType<typeof createWorld>>, client: QueryClient) {
  const { geoOrigin: _geo, ...shared } = providerProps(world);
  return { shared, geoOrigin: _geo, client };
}

describe("both providers with the same props", () => {
  test("each fills its contexts, the settings are the same whichever one sets them last, and the stakeholder card draws", async () => {
    const world = await createWorld();
    vi.stubGlobal("fetch", world.fetch);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { shared, geoOrigin } = sameProps(world, qc);
    const seen: Record<string, unknown>[] = [];
    function Probe() {
      seen.push({
        plan: useContext(PlanSourceHostContext),
        refLabel: useContext(RefLabelContext),
        card: useContext(OnlineStakeholderCardHostContext),
        origin: baseOrigin(),
        ontology: termOrigin(),
        hosts: [...systemVaultHosts()],
        labels: [...systemHostLabels()],
        key: typeKey("t:FunctionConstraint"),
      });
      return null;
    }
    render(
      <PlanCardsGilbPlatformProvider {...shared} canEdit queryClient={qc}>
        <StakeholderCardGilbPlatformProvider {...shared} geoOrigin={geoOrigin} queryClient={qc}>
          <Probe />
          <OnlineStakeholderCard principal={BEN} placementMode="content" />
        </StakeholderCardGilbPlatformProvider>
      </PlanCardsGilbPlatformProvider>,
    );
    const at = seen[0]!;
    expect(at.plan).toBeTruthy();
    expect(at.refLabel).toBeTruthy();
    expect(at.card).toBeTruthy();
    expect([at.origin, at.ontology, at.hosts, at.labels, at.key]).toEqual(["https://example.test", "https://ontology.platform.example.test", ["ontology.platform.example.test"], ["id", "ontology"], "functionConstraint"]);
    await waitFor(() => expect(screen.getAllByTestId("one-card-row-value").length).toBe(3));
    // The session was set by both, and signs the same way.
    expect(await dpopReadAuth("GET", `${HOST}/lws/r/x`)).toEqual({ authorization: "DPoP fake-access-token", dpop: `proof(GET ${HOST}/lws/r/x)` });
  });

  test("the order of mounting does not matter", async () => {
    const world = await createWorld();
    vi.stubGlobal("fetch", world.fetch);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { shared, geoOrigin } = sameProps(world, qc);
    render(
      <StakeholderCardGilbPlatformProvider {...shared} geoOrigin={geoOrigin} queryClient={qc}>
        <PlanCardsGilbPlatformProvider {...shared} canEdit queryClient={qc}>
          <OnlineStakeholderCard principal={BEN} placementMode="content" />
        </PlanCardsGilbPlatformProvider>
      </StakeholderCardGilbPlatformProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("one-card-row-value").length).toBe(3));
  });
});
