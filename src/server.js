import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSolverService } from "./solver/service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveWebDir() {
  const candidates = [
    path.resolve(__dirname, "..", "dist-web"),
    path.resolve(__dirname, "..", "web"),
    path.resolve(process.cwd(), "dist-web"),
    path.resolve(process.cwd(), "web")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }

  throw new Error("Could not find web assets (index.html).");
}

export async function createHttpServer({
  port = Number(process.env.PORT) || 4173,
  host = "127.0.0.1",
  ...solverOptions
} = {}) {
  const service = await createSolverService(solverOptions);
  const app = express();
  const webDir = resolveWebDir();

  app.use(express.json({ limit: "25mb" }));
  app.use(express.static(webDir));

  app.get("/api/health", (_req, res) => {
    res.json(service.getStatus());
  });

  app.post("/api/solve", (req, res) => {
    try {
      const payload = req.body ?? {};
      const result = service.solve({
        board: payload.board,
        rack: payload.rack,
        sweepBonus: payload.sweepBonus,
        limit: payload.limit,
        dictionaryId: payload.dictionaryId
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to solve." });
    }
  });

  app.post("/api/dictionaries/custom", (req, res) => {
    try {
      const payload = req.body ?? {};
      const result = service.addCustomDictionary({
        name: payload.name,
        text: payload.text
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to load dictionary." });
    }
  });

  app.use((_req, res) => {
    res.sendFile(path.join(webDir, "index.html"));
  });

  const server = app.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`Crossplay solver web app running on http://${host}:${actualPort}`);
  });

  return { app, server };
}

if (import.meta.url === `file://${__filename}`) {
  createHttpServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
