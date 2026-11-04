// A stand-in for the installed computer credential, for hermetic tests.
// Profile "missing" is a computer that was never added. Anything else signs the next request
// with obvious stand-in headers (not a real proof). The transport is accepted and not used:
// this double does not renew a token.
export async function openComputerCredential(opts) {
  if (!opts || typeof opts.transport !== "function" || typeof opts.origin !== "string") {
    throw new Error("openComputerCredential: origin and transport are required");
  }
  if (opts.profile === "missing") {
    const err = new Error("not found");
    err.name = "ComputerKeyError";
    err.code = "not_found";
    throw err;
  }
  return {
    async authHeaders(method, url) {
      if (typeof method !== "string" || typeof url !== "string") throw new Error("authHeaders needs a method and a url");
      return { authorization: "Bearer computer-test", dpop: "dpop-test" };
    },
  };
}
