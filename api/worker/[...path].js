const allowedRoutes = [
  { method: "GET", pattern: /^\/health$/ },
  { method: "GET", pattern: /^\/api\/diagnostics\/futex$/ },
  { method: "GET", pattern: /^\/api\/test-requests$/ },
  { method: "POST", pattern: /^\/api\/test-requests$/ },
  { method: "GET", pattern: /^\/api\/test-requests\/[0-9a-f-]{36}$/i },
  { method: "POST", pattern: /^\/api\/test-requests\/[0-9a-f-]{36}\/app-confirmation$/i },
];

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Método não permitido." });
  }

  const workerBase = process.env.WORKER_API_URL;
  const workerToken = process.env.WORKER_API_TOKEN;
  if (!workerBase || !workerToken) {
    return res.status(503).json({
      message: "O worker ainda não está configurado no servidor. Defina WORKER_API_URL e WORKER_API_TOKEN na Vercel.",
    });
  }

  const segments = Array.isArray(req.query?.path)
    ? req.query.path
    : [req.query?.path].filter(Boolean);
  const route = "/" + segments.map((segment) => String(segment)).join("/");
  const allowed = allowedRoutes.some((item) => item.method === req.method && item.pattern.test(route));
  if (!allowed) return res.status(404).json({ message: "Rota não encontrada." });

  let target;
  try {
    const base = new URL(workerBase);
    if (!["https:", "http:"].includes(base.protocol)) throw new Error("Protocolo inválido");
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
      throw new Error("O worker deve usar HTTPS em produção.");
    }
    target = new URL(route, base.origin);
  } catch {
    return res.status(500).json({ message: "WORKER_API_URL inválida. Informe a URL pública HTTPS do worker." });
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + workerToken,
        ...(req.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: req.method === "POST" ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(20_000),
    });

    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(body);
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return res.status(timeout ? 504 : 502).json({
      message: timeout
        ? "O worker demorou para responder. Atualize o status em alguns instantes."
        : "Não foi possível alcançar o worker. Verifique se o serviço está ativo.",
    });
  }
}
