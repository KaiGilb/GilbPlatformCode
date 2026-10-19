// Lets TypeScript read `.vue` imports in this unit's own typecheck (a host's Vue tooling does the same).
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
