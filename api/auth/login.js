import {
  ADMIN_SESSION_TTL_SECONDS,
  clearLoginFailures,
  createUserSession,
  getAdminUsername,
  isAuthConfigured,
  isSameOriginRequest,
  loginRateLimit,
  recordLoginFailure,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from "../../lib/admin-auth.js";
import { workerAuthRequest } from "../../lib/worker-auth-client.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Origin");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Método não permitido." });
  }
  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ message: "Origem da requisição não autorizada." });
  }
  if (!isAuthConfigured()) {
    return res.status(503).json({ message: "A autenticação do proprietário ainda não foi configurada no servidor." });
  }

  const limit = loginRateLimit(req);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase().slice(0, 64) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || password.length > 128) {
    recordLoginFailure(req);
    return res.status(401).json({ message: "Usuário ou senha inválidos." });
  }

  let role = "user";
  if (username === getAdminUsername()) {
    if (!verifyAdminCredentials(username, password)) {
      recordLoginFailure(req);
      return res.status(401).json({ message: "Usuário ou senha inválidos." });
    }
    role = "owner";
  } else {
    try {
      const result = await workerAuthRequest("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      if (result.status !== 200 || result.data?.authenticated !== true || !result.data?.user) {
        recordLoginFailure(req);
        return res.status(result.status >= 400 ? result.status : 401).json({
          message: result.data?.message || "Usuário ou senha inválidos.",
        });
      }
      role = result.data.user.role === "admin" ? "admin" : "user";
    } catch (error) {
      return res.status(error?.statusCode || 502).json({ message: error?.message || "Não foi possível validar sua conta." });
    }
  }

  clearLoginFailures(req);
  try {
    const token = createUserSession(username, role);
    setAdminSessionCookie(res, token);
    return res.status(200).json({
      authenticated: true,
      user: { username, role },
      expiresIn: ADMIN_SESSION_TTL_SECONDS,
    });
  } catch {
    return res.status(503).json({ message: "Não foi possível iniciar a sessão segura. Verifique a configuração do servidor." });
  }
}
