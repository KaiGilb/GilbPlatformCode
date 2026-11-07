// One entry; the vite mode picks the app: `vite --mode fake` (no network) or `vite --mode live`.
if (import.meta.env.MODE === "live") {
  void import("./main.live");
} else {
  void import("./main.fake");
}
