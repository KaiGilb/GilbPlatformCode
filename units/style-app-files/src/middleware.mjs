// A Connect-style request handler (what Vite's server.middlewares.use takes) for the Studio's dev save.
import { writeStyleFiles } from "./files.mjs";

const DEFAULT_MAX = 8 * 1024 * 1024;

/**
 * `(req, res)` that accepts POST of `{ sheet, logoPng? }` and answers JSON `{ message, fontsWarning? }`.
 * 405 with `Allow: POST` for any other method; 413 when the body is bigger than `maxBytes` (reading stops); 400 for JSON that does not parse.
 */
export function createStudioSaveMiddleware(o) {
  const maxBytes = o.maxBytes ?? DEFAULT_MAX;
  return (req, res) => {
    let replied = false;
    const reply = (status, payload, headers = {}) => {
      if (replied || res.headersSent) return;
      replied = true;
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      res.end(JSON.stringify(payload));
    };
    if (req.method !== "POST") {
      reply(405, { message: "Use POST." }, { Allow: "POST" });
      return;
    }
    const tooBig = () => {
      reply(413, { message: "The body is too large." }, { Connection: "close" });
      res.once("finish", () => req.destroy());
    };
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      tooBig();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      if (replied) return; // stopped: drop what still arrives
      size += chunk.length;
      if (size > maxBytes) {
        chunks.length = 0;
        tooBig();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => reply(400, { message: "The body could not be read." }));
    req.on("end", () => {
      if (replied) return;
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        reply(400, { message: "The body is not valid JSON." });
        return;
      }
      writeStyleFiles(body, { appRoot: o.appRoot }).then(
        ({ status, ...payload }) => reply(status, payload),
        () => reply(500, { message: "The style files could not be written." }),
      );
    });
  };
}
