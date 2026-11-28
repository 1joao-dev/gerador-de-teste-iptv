import { isSameOriginRequest, verifyUserSession } from "../../lib/admin-auth.js";
import { workerAuthRequest } from "../../lib/worker-auth-client.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Método não permitido." });
  }
  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ message: "Origem da requisição não autorizada." });
  }

  const session = verifyUserSession(req);
  if (!session) {
    return res.status(401).json({ message: "Sessão expirada. Entre novamente." });
  }

  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!currentPassword || !newPassword || currentPassword.length > 128 || newPassword.length > 128) {
    return res.status(400).json({ message: "Informe a senha atual e uma nova senha válida." });
  }

  try {
    const result = await workerAuthRequest("/api/auth/password", {
      method: "POST",
      body: {
        currentPassword,
        newPassword,
        ...(session.role === "owner"
          ? { initialOwnerPassword: process.env.APP_ACCESS_CODE || "" }
          : {}),
      },
      identity: session,
    });
    return res.status(result.status).json(result.data);
  } catch (error) {
    return res.status(error?.statusCode || 502).json({
      message: error?.message || "Não foi possível alterar a senha.",
    });
  }
}
