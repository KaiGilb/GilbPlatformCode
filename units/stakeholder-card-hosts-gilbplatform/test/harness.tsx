// The page around the card in these tests: the provider alone, with a fake session, over the world's fake `fetch`.
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { StakeholderCardGilbPlatformProvider, type StakeholderCardGilbPlatformProviderProps } from "../src";
import { __resetPhotoTermResolvers } from "../src/photoTerm";
import { BASE, GEO, ONTOLOGY, SYSTEM_HOSTS, type World } from "./world";

export type ProviderOverrides = Partial<Omit<StakeholderCardGilbPlatformProviderProps, "children">>;

export function providerProps(world: World, over: ProviderOverrides = {}): Omit<StakeholderCardGilbPlatformProviderProps, "children"> {
  return {
    origin: BASE,
    ontologyOrigin: ONTOLOGY,
    systemVaultHosts: SYSTEM_HOSTS,
    systemHostLabels: ["id", "ontology"],
    session: world.session,
    geoOrigin: GEO,
    ...over,
  };
}

export function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Mount `children` inside the provider alone. */
export function mountInProvider(world: World, children: ReactNode, over: ProviderOverrides = {}) {
  const props = providerProps(world, over);
  const ui = (kids: ReactNode, next: ProviderOverrides = {}) => <StakeholderCardGilbPlatformProvider {...props} {...next}>{kids}</StakeholderCardGilbPlatformProvider>;
  const view = render(ui(children));
  return { ...view, rerenderWith: (kids: ReactNode, next: ProviderOverrides = {}) => view.rerender(ui(kids, next)) };
}

export { __resetPhotoTermResolvers };
