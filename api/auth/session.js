import {
  ADMIN_SESSION_TTL_SECONDS,
  REMEMBERED_SESSION_TTL_SECONDS,
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
    if (result.status !== 200) {
      if (result.status === 401) {
        clearAdminSessionCookie(res);
        return res.status(401).json({ authenticated: false });
      }
      return res.status(result.status).json({ message: result.data?.message || "Não foi possível validar a sessão." });
    }
    if (result.data?.authenticated !== true || !result.data?.user) {
      clearAdminSessionCookie(res);
      return res.status(401).json({ authenticated: false });
    }

    const role = result.data.user.role === "admin" ? "admin" : "user";
    let expiresAt = session.expiresAt;
    if (role !== session.role) {
      const token = createUserSession(session.username, role, session.remember);
      setAdminSessionCookie(res, token, session.remember);
      const ttl = session.remember ? REMEMBERED_SESSION_TTL_SECONDS : ADMIN_SESSION_TTL_SECONDS;
      expiresAt = Math.floor(Date.now() / 1000) + ttl;
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
