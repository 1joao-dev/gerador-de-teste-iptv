import { isSameOriginRequest, verifyUserSession } from "../../lib/admin-auth.js";
import { workerAuthRequest } from "../../lib/worker-auth-client.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const session = verifyUserSession(req);
  if (!session || !["owner", "admin"].includes(session.role)) {
    return res.status(403).json({ message: "Somente proprietários e administradores podem acessar as chaves." });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Método não permitido." });
  }
  if (req.method === "POST" && !isSameOriginRequest(req)) {
    return res.status(403).json({ message: "Origem da requisição não autorizada." });
  }

  try {
    const result = await workerAuthRequest("/api/auth/keys", {
      method: req.method,
      body: req.method === "POST" ? {
        label: req.body?.label,
        expiresInDays: req.body?.expiresInDays === null ? null : Number(req.body?.expiresInDays ?? 30),
      } : undefined,
      identity: session,
    });
    return res.status(result.status).json(result.data);
  } catch (error) {
    return res.status(error?.statusCode || 502).json({ message: error?.message || "Não foi possível acessar as chaves." });
  }
}
