import { CoachError } from "./gemma.js";

// CORS is open so the future Chrome extension can call the same API.
export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  let data = "";
  for await (const chunk of req) data += chunk;
  try { return JSON.parse(data || "{}"); } catch { return {}; }
}

export function makeHandler(work) {
  return async function handler(req, res) {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Use POST." }));
    }
    try {
      const body = await readBody(req);
      const result = await work(body);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(result));
    } catch (err) {
      const known = err instanceof CoachError;
      if (!known) console.error(err);
      res.statusCode = known ? err.status : 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          error: known ? err.message : "Something went wrong on the server. Try again.",
          code: known ? err.code : "internal",
        })
      );
    }
  };
}
