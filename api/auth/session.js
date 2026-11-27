import {
  createUserSession,
  getAdminUsername,
  setAdminSessionCookie,
  verifyUserSession,
  clearAdminSessionCookie,
} from "../../lib/admin-auth.js";
import { workerAuthRequest } from "../../lib/worker-auth-client.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Método não permitido." });
  }

  const session = verifyUserSession(req);
  if (!session) return res.status(401).json({ authenticated: false });

  if (session.username === getAdminUsername() && session.role === "owner") {
    return res.status(200).json({
      authenticated: true,
      user: { username: session.username, role: "owner" },
      expiresAt: session.expiresAt,
    });
  }

  try {
    const result = await workerAuthRequest("/api/auth/validate", {
      method: "POST",
      body: { username: session.username },
    });
    if (result.status === 401 || result.data?.authenticated !== true || !result.data?.user) {
      clearAdminSessionCookie(res);
      return res.status(401).json({ authenticated: false });
    }
    if (result.status !== 200) {
      return res.status(result.status).json({ message: result.data?.message || "Não foi possível validar a sessão." });
    }

    const role = result.data.user.role === "admin" ? "admin" : "user";
    let expiresAt = session.expiresAt;
    if (role !== session.role) {
      const token = createUserSession(session.username, role);
      setAdminSessionCookie(res, token);
      expiresAt = Math.floor(Date.now() / 1000) + 4 * 60 * 60;
    }
    return res.status(200).json({
      authenticated: true,
      user: { username: session.username, role },
      expiresAt,
    });
  } catch (error) {
    return res.status(error?.statusCode || 502).json({ message: error?.message || "Não foi possível validar a sessão." });
  }
}
