import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createDataEncryptionKey, protectJobForStorage, restoreJobFromStorage } from "./secure-storage.js";
import {
  closeFutexBrowser,
  closeFutexSession,
  continueFutexSession,
  startFutexSession,
  startFutexManualSession,
  readFutexConversation,
  sendFutexChatMessage,
  clickFutexChatOption,
  inspectFutexPage,
} from "./futex-automation.js";
import { extractRecommendedApp } from "./futex-parser.js";

const app = express();
const dataEncryptionKey = createDataEncryptionKey(process.env.DATA_ENCRYPTION_KEY, process.env.NODE_ENV === "production");
const port = Number(process.env.PORT || 8787);
const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "data"));
const jobsFile = path.join(dataDirectory, "jobs.json");
const jobs = new Map();
const sessions = new Map();
const busySessions = new Set();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const apiToken = process.env.API_TOKEN || "";
const automationEnabled = process.env.FUTEX_AUTOMATION_ENABLED === "true";
const minIntervalMs = Math.max(0, Number(process.env.MIN_SECONDS_BETWEEN_REQUESTS || 30)) * 1000;
const maxActiveSessions = Math.max(1, Number(process.env.MAX_ACTIVE_SESSIONS || 1));
const maxSessionAgeMs = Math.max(5, Number(process.env.MAX_SESSION_MINUTES || 30)) * 60_000;
let lastRequestAt = 0;
let persistenceQueue = Promise.resolve();

if (process.env.NODE_ENV === "production" && apiToken.length < 32) {
  throw new Error("Defina API_TOKEN com pelo menos 32 caracteres aleatórios antes de iniciar o worker em produção.");
}

function requestIdentity(req) {
  return {
    username: String(req.get("x-iptvflow-user") || "").trim().toLowerCase(),
    role: req.get("x-iptvflow-role") === "admin" ? "admin" : "user",
  };
}

function canAccessJob(req, job) {
  const identity = requestIdentity(req);
  return identity.role === "admin" || Boolean(identity.username && job?.ownerUsername === identity.username);
}

function safeJob(job) {
  if (!job) return job;
  const { internalError, privateDataEncrypted, ownerUsername, ...publicJob } = job;
  return publicJob;
}

function persistJobs() {
  const snapshot = JSON.stringify(
    [...jobs.values()].map((job) => {
      const { internalError, ...publicFields } = job;
      return protectJobForStorage(publicFields, dataEncryptionKey);
    }),
    null,
    2,
  );
  persistenceQueue = persistenceQueue
    .then(async () => {
      await fs.mkdir(dataDirectory, { recursive: true, mode: 0o700 });
      const temporaryFile = jobsFile + ".tmp";
      await fs.writeFile(temporaryFile, snapshot, { encoding: "utf8", mode: 0o600 });
      await fs.rename(temporaryFile, jobsFile);
    })
    .catch((error) => {
      console.error("Não foi possível persistir o histórico do worker:", error?.message || "erro desconhecido");
    });
  return persistenceQueue;
}

async function loadJobs() {
  await fs.mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  try {
    const raw = await fs.readFile(jobsFile, "utf8");
    const stored = JSON.parse(raw);
    if (!Array.isArray(stored)) throw new Error("Formato inválido no arquivo de histórico.");

    for (const item of stored) {
      if (!item || typeof item.id !== "string") continue;

      let restored;
      try {
        restored = restoreJobFromStorage(item, dataEncryptionKey);
      } catch {
        restored = {
          ...item,
          status: "needs_human",
          message: "Os dados privados deste registro não puderam ser descriptografados. Confira se DATA_ENCRYPTION_KEY é a chave original.",
          updatedAt: new Date().toISOString(),
        };
      }

      const interrupted = ["queued", "running", "awaiting_app"].includes(restored.status);
      jobs.set(item.id, interrupted
        ? {
            ...restored,
            status: "needs_human",
            message: "O worker foi reiniciado e a sessão do navegador não pode ser retomada. Inicie uma nova solicitação.",
            updatedAt: new Date().toISOString(),
          }
        : restored);
    }
    if (jobs.size) await persistJobs();
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Não foi possível carregar o histórico persistido:", error?.message || "erro desconhecido");
    }
  }
}

function updateJob(id, patch) {
  const current = jobs.get(id);
  if (!current) return undefined;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  jobs.set(id, next);
  void persistJobs();
  return next;
}

function requireApiToken(req, res, next) {
  if (!apiToken) {
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({ message: "API_TOKEN não configurado." });
    }
    return next();
  }

  const provided = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
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

function closeSessionForJob(id, session) {
  if (session) void closeFutexSession(session);
  sessions.delete(id);
  busySessions.delete(id);
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
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "iptv-flow-worker" });
});

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  return requireApiToken(req, res, next);
});

app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: "ok",
    service: "iptv-flow-worker",
    automationEnabled,
    activeSessions: activeCount(),
    storedRequests: jobs.size,
  });
});

app.get("/api/diagnostics/futex", async (req, res) => {
  if (requestIdentity(req).role !== "admin") return res.status(403).json({ message: "Apenas administradores podem executar diagnósticos." });
  try {
    const diagnostic = await inspectFutexPage();
    res.setHeader("Cache-Control", "no-store");
    return res.json(diagnostic);
  } catch (error) {
    return res.status(502).json({
      message: error instanceof Error ? error.message : "Não foi possível iniciar o atendimento em segundo plano.",
    });
  }
});

app.get("/api/test-requests", (req, res) => {
  const identity = requestIdentity(req);
  if (!identity.username) return res.status(401).json({ message: "Sessão inválida." });
  const items = [...jobs.values()]
    .filter((job) => identity.role === "admin" || job.ownerUsername === identity.username)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(safeJob);
  res.setHeader("Cache-Control", "no-store");
  res.json({ items });
});

app.post("/api/test-requests", async (req, res) => {
  if (!automationEnabled) {
    return res.status(503).json({
      message: "Automação desativada. Valide o fluxo e as regras do site antes de ativar FUTEX_AUTOMATION_ENABLED.",
    });
  }

  const identity = requestIdentity(req);
  if (!identity.username) return res.status(401).json({ message: "Sessão inválida." });
  const manualChat = req.body?.manualChat === true;
  const { customerName, contact, device, brand } = req.body || {};
  const phoneDigits = String(contact || "").replace(/\D/g, "");
  if (!manualChat && (
    typeof customerName !== "string" || customerName.trim().length < 2 ||
    phoneDigits.length < 10 || phoneDigits.length > 13 ||
    typeof device !== "string" || device.trim().length < 2 ||
    typeof brand !== "string" || brand.trim().length < 1
  )) {
    return res.status(400).json({ message: "Informe nome, WhatsApp, dispositivo e marca válidos." });
  }

  if (!manualChat && req.body?.autoConfirmInstall !== undefined && typeof req.body.autoConfirmInstall !== "boolean") {
    return res.status(400).json({ message: "A opção de confirmação automática é inválida." });
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
    ownerUsername: identity.username,
    customerName: manualChat ? "Atendimento FUTEX" : customerName.trim().slice(0, 100),
    contact: manualChat ? "" : String(contact).trim().slice(0, 30),
    device: manualChat ? "A definir no atendimento" : device.trim().slice(0, 60),
    brand: manualChat ? "A definir no atendimento" : brand.trim().slice(0, 60),
    manualChat,
    autoConfirmInstall: !manualChat && req.body?.autoConfirmInstall === true,
    status: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    message: "Solicitação recebida. Preparando a geração do teste.",
  };
  jobs.set(id, job);
  await persistJobs();
  res.status(202).json(safeJob(job));

  void (async () => {
    updateJob(id, { status: "running", message: "Iniciando o atendimento automaticamente." });
    try {
      const { session, result } = manualChat
        ? await startFutexManualSession()
        : await startFutexSession(job);
      if (session) {
        session.startedAt = Date.now();
        sessions.set(id, session);
      }
      updateJob(id, result);
      if (result.status === "completed" || result.status === "needs_human") {
        closeSessionForJob(id, session);
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

app.get("/api/test-requests/:id", async (req, res) => {
  let job = jobs.get(req.params.id);
  if (!job || !canAccessJob(req, job)) return res.status(404).json({ message: "Solicitação não encontrada." });

  const session = sessions.get(req.params.id);
  if (session && job.manualChat && !busySessions.has(req.params.id) && job.status !== "completed") {
    try {
      const chat = await readFutexConversation(session);
      const { result: parsedResult, ...conversation } = chat;
      job = updateJob(req.params.id, parsedResult
        ? { ...parsedResult, manualChat: true, ...conversation }
        : { ...conversation, manualChat: true }) || job;
      if (parsedResult?.status === "completed") closeSessionForJob(req.params.id, session);
    } catch {
      // Mantém a última conversa conhecida se o widget estiver atualizando.
    }
  }

  // Reprocessa a indicação do aplicativo nas sessões automáticas já abertas.
  // Assim, solicitações antigas que receberam o texto genérico podem ser corrigidas
  // sem exigir que o usuário gere outro teste.
  if (
    session &&
    !job.manualChat &&
    job.status === "awaiting_app" &&
    (!job.recommendedApp || job.recommendedApp === "Aplicativo indicado pela FUTEX") &&
    !busySessions.has(req.params.id)
  ) {
    try {
      const chat = await readFutexConversation(session);
      const assistantTranscript = chat.chatMessages
        .filter((item) => item.role === "assistant")
        .map((item) => item.text)
        .join("\n");
      const recommendedApp = extractRecommendedApp(assistantTranscript);
      if (recommendedApp) {
        job = updateJob(req.params.id, { recommendedApp }) || job;
      }
    } catch {
      // Mantém a indicação atual se a conversa estiver atualizando.
    }
  }

  res.setHeader("Cache-Control", "no-store");
  return res.json(safeJob(jobs.get(req.params.id) || job));
});

app.post("/api/test-requests/:id/chat", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !canAccessJob(req, job)) return res.status(404).json({ message: "Solicitação não encontrada." });
  if (!job.manualChat) return res.status(409).json({ message: "Esta solicitação não usa o atendimento manual." });
  const session = sessions.get(req.params.id);
  if (!session) return res.status(409).json({ message: "A sessão da FUTEX não está mais ativa. Inicie um novo atendimento." });
  if (busySessions.has(req.params.id)) {
    return res.status(409).json({ message: "A resposta anterior ainda está sendo processada." });
  }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const option = typeof req.body?.option === "string" ? req.body.option.trim() : "";
  if (Boolean(message) === Boolean(option)) {
    return res.status(400).json({ message: "Digite uma resposta ou selecione uma opção da FUTEX." });
  }
  if (message.length > 1_000 || option.length > 200) {
    return res.status(400).json({ message: "A resposta excede o limite permitido." });
  }

  busySessions.add(req.params.id);
  session.startedAt = Date.now();
  const accepted = updateJob(req.params.id, {
    status: "running",
    message: "Enviando sua resposta para o atendimento FUTEX.",
  });
  res.status(202).json(safeJob(accepted));

  void (async () => {
    try {
      const result = message
        ? await sendFutexChatMessage(session, message)
        : await clickFutexChatOption(session, option);
      updateJob(req.params.id, { ...result, manualChat: true });
      if (result.status === "completed" || result.status === "needs_human") {
        closeSessionForJob(req.params.id, session);
      }
    } catch (error) {
      updateJob(req.params.id, {
        status: "running",
        manualChat: true,
        message: error instanceof Error ? error.message : "Não foi possível enviar a resposta à FUTEX.",
      });
    } finally {
      busySessions.delete(req.params.id);
    }
  })();
});

app.post("/api/test-requests/:id/app-confirmation", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !canAccessJob(req, job)) return res.status(404).json({ message: "Solicitação não encontrada." });
  const session = sessions.get(req.params.id);
  if (!session) return res.status(409).json({ message: "A sessão de atendimento não está mais ativa. Inicie uma nova solicitação." });
  if (busySessions.has(req.params.id)) {
    return res.status(409).json({ message: "A confirmação anterior ainda está sendo processada." });
  }
  if (typeof req.body?.installed !== "boolean") {
    return res.status(400).json({ message: "Informe se o aplicativo foi instalado." });
  }

  busySessions.add(req.params.id);
  session.startedAt = Date.now();
  const accepted = updateJob(req.params.id, {
    status: "running",
    message: req.body.installed
      ? "Confirmação recebida. Aguardando a FUTEX gerar os dados do teste."
      : "Solicitando a próxima orientação à FUTEX.",
    appInstalled: req.body.installed,
  });
  res.status(202).json(safeJob(accepted));

  void (async () => {
    try {
      const result = await continueFutexSession(session, req.body.installed);
      updateJob(req.params.id, {
        ...result,
        appInstalled: req.body.installed,
      });
      if (result.status === "completed" || result.status === "needs_human") {
        closeSessionForJob(req.params.id, session);
      }
    } catch (error) {
      updateJob(req.params.id, {
        status: "failed",
        message: error instanceof Error ? error.message : "Não foi possível continuar o atendimento.",
        internalError: String(error),
      });
      closeSessionForJob(req.params.id, session);
    } finally {
      busySessions.delete(req.params.id);
    }
  })();
});

await loadJobs();

const server = app.listen(port, () => {
  console.log("IPTV Flow Worker listening on port " + port);
});

const expiryTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.startedAt && now - session.startedAt > maxSessionAgeMs) {
      closeSessionForJob(id, session);
      updateJob(id, {
        status: "needs_human",
        message: "O atendimento expirou por tempo de inatividade. Inicie uma nova solicitação.",
      });
    }
  }
}, 60_000);
expiryTimer.unref();

async function shutdown() {
  clearInterval(expiryTimer);
  server.close();
  for (const [id, session] of sessions.entries()) {
    await closeFutexSession(session);
    sessions.delete(id);
  }
  await persistJobs();
  await closeFutexBrowser();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
