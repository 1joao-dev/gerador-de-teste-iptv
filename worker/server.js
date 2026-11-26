import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import {
  closeFutexBrowser,
  closeFutexSession,
  continueFutexSession,
  startFutexSession,
} from "./futex-automation.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const jobs = new Map();
const sessions = new Map();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const apiToken = process.env.API_TOKEN || "";
const automationEnabled = process.env.FUTEX_AUTOMATION_ENABLED === "true";
const minIntervalMs = Math.max(0, Number(process.env.MIN_SECONDS_BETWEEN_REQUESTS || 30)) * 1000;
const maxActiveSessions = Math.max(1, Number(process.env.MAX_ACTIVE_SESSIONS || 1));
let lastRequestAt = 0;

if (process.env.NODE_ENV === "production" && !apiToken) {
  throw new Error("Defina API_TOKEN antes de iniciar o worker em produção.");
}

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origem não autorizada pelo CORS."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "12kb" }));
app.use(rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
}));

function safeJob(job) {
  const { internalError, ...publicJob } = job;
  return publicJob;
}

function updateJob(id, patch) {
  const current = jobs.get(id);
  if (!current) return undefined;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  jobs.set(id, next);
  return next;
}

function requireApiToken(req, res, next) {
  if (!apiToken) {
    if (process.env.NODE_ENV === "production") return res.status(503).json({ message: "API_TOKEN não configurado." });
    return next();
  }
  const provided = (req.get("authorization") || "").replace(/^Bearer\\s+/i, "");
  const expectedBuffer = Buffer.from(apiToken);
  const providedBuffer = Buffer.from(provided);
  const valid = expectedBuffer.length === providedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  if (!valid) return res.status(401).json({ message: "Chave de acesso inválida." });
  return next();
}

function activeCount() {
  return [...jobs.values()].filter((job) =>
    ["queued", "running", "awaiting_app"].includes(job.status),
  ).length;
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "iptv-flow-worker",
    automationEnabled,
    activeSessions: activeCount(),
  });
});

app.use("/api", requireApiToken);

app.get("/api/test-requests", (_req, res) => {
  const items = [...jobs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(safeJob);
  res.json({ items });
});

app.post("/api/test-requests", async (req, res) => {
  if (!automationEnabled) {
    return res.status(503).json({
      message: "Automação desativada. Ative FUTEX_AUTOMATION_ENABLED somente após validar o fluxo e as regras do site.",
    });
  }

  const { customerName, contact, device, brand } = req.body || {};
  const phoneDigits = String(contact || "").replace(/\\D/g, "");
  if (
    typeof customerName !== "string" || customerName.trim().length < 2 ||
    phoneDigits.length < 10 || phoneDigits.length > 13 ||
    typeof device !== "string" || device.trim().length < 2 ||
    typeof brand !== "string" || brand.trim().length < 1
  ) {
    return res.status(400).json({ message: "Informe nome, WhatsApp, dispositivo e marca válidos." });
  }

  if (activeCount() >= maxActiveSessions) {
    return res.status(429).json({ message: "Já existe um atendimento em andamento. Aguarde a conclusão antes de iniciar outro." });
  }

  const now = Date.now();
  if (now - lastRequestAt < minIntervalMs) {
    const seconds = Math.ceil((minIntervalMs - (now - lastRequestAt)) / 1000);
    return res.status(429).json({ message: "Aguarde " + seconds + " segundos antes de iniciar outro atendimento." });
  }
  lastRequestAt = now;

  const id = crypto.randomUUID();
  const job = {
    id,
    customerName: customerName.trim().slice(0, 100),
    contact: String(contact).trim().slice(0, 30),
    device: device.trim().slice(0, 60),
    brand: brand.trim().slice(0, 60),
    status: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    message: "Solicitação recebida. Abrindo o atendimento FUTEX.",
  };
  jobs.set(id, job);
  res.status(202).json(safeJob(job));

  void (async () => {
    updateJob(id, { status: "running", message: "Navegando até o atendimento FUTEX." });
    try {
      const { session, result } = await startFutexSession(job);
      if (session) sessions.set(id, session);
      updateJob(id, result);
      if (result.status === "completed" || result.status === "needs_human") {
        if (session) await closeFutexSession(session);
        sessions.delete(id);
      }
    } catch (error) {
      updateJob(id, {
        status: "failed",
        message: error instanceof Error ? error.message : "Não foi possível concluir o atendimento.",
        internalError: String(error),
      });
    }
  })();
});

app.get("/api/test-requests/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ message: "Solicitação não encontrada." });
  return res.json(safeJob(job));
});

app.post("/api/test-requests/:id/app-confirmation", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ message: "Solicitação não encontrada." });
  const session = sessions.get(req.params.id);
  if (!session) return res.status(409).json({ message: "A sessão de atendimento não está mais ativa. Inicie uma nova solicitação." });
  if (typeof req.body?.installed !== "boolean") {
    return res.status(400).json({ message: "Informe se o aplicativo foi instalado." });
  }

  updateJob(req.params.id, { status: "running", message: "Enviando confirmação ao atendimento FUTEX." });
  try {
    const result = await continueFutexSession(session, req.body.installed);
    const updated = updateJob(req.params.id, {
      ...result,
      appInstalled: req.body.installed,
    });
    if (result.status === "completed" || result.status === "needs_human") {
      await closeFutexSession(session);
      sessions.delete(req.params.id);
    }
    return res.json(safeJob(updated));
  } catch (error) {
    const updated = updateJob(req.params.id, {
      status: "failed",
      message: error instanceof Error ? error.message : "Não foi possível continuar o atendimento.",
      internalError: String(error),
    });
    await closeFutexSession(session);
    sessions.delete(req.params.id);
    return res.status(502).json(safeJob(updated));
  }
});

app.use((error, _req, res, _next) => {
  const status = error?.message?.includes("CORS") ? 403 : 500;
  res.status(status).json({ message: status === 403 ? "Origem não autorizada." : "Erro interno do worker." });
});

const server = app.listen(port, () => {
  console.log("IPTV Flow Worker listening on port " + port);
});

async function shutdown() {
  server.close();
  for (const session of sessions.values()) await closeFutexSession(session);
  sessions.clear();
  await closeFutexBrowser();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
