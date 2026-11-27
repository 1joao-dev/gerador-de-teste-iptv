import { isSameOriginRequest, verifyUserSession } from "../../lib/admin-auth.js";
import { workerAuthRequest } from "../../lib/worker-auth-client.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const session = verifyUserSession(req);
  if (!session || session.role !== "owner") {
    return res.status(403).json({ message: "Somente o proprietário pode gerenciar administradores." });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Método não permitido." });
  }
  if (req.method === "POST" && !isSameOriginRequest(req)) {
    return res.status(403).json({ message: "Origem da requisição não autorizada." });
  }

  try {
    const result = await workerAuthRequest("/api/auth/users" + (req.method === "POST" ? "/role" : ""), {
      method: req.method,
      body: req.method === "POST" ? {
        username: req.body?.username,
        role: req.body?.role,
      } : undefined,
      identity: session,
    });
    return res.status(result.status).json(result.data);
  } catch (error) {
    return res.status(error?.statusCode || 502).json({ message: error?.message || "Não foi possível acessar os usuários." });
  }
}
