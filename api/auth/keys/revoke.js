import { isSameOriginRequest, verifyUserSession } from "../../../lib/admin-auth.js";
import { workerAuthRequest } from "../../../lib/worker-auth-client.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Método não permitido." });
  }
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: "Origem da requisição não autorizada." });

  const session = verifyUserSession(req);
  if (!session || !["owner", "admin"].includes(session.role)) {
    return res.status(403).json({ message: "Somente proprietários e administradores podem revogar chaves." });
  }
  const id = typeof req.body?.id === "string" ? req.body.id : "";
  if (!id) return res.status(400).json({ message: "Identificador da chave inválido." });

  try {
    const result = await workerAuthRequest("/api/auth/keys/" + encodeURIComponent(id) + "/revoke", {
      method: "POST",
      identity: session,
    });
    return res.status(result.status).json(result.data);
  } catch (error) {
    return res.status(error?.statusCode || 502).json({ message: error?.message || "Não foi possível revogar a chave." });
  }
}
