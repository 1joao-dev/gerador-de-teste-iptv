import {
  ADMIN_SESSION_TTL_SECONDS,
  clearLoginFailures,
  createAdminSession,
  isAuthConfigured,
  isSameOriginRequest,
  loginRateLimit,
  recordLoginFailure,
  setAdminSessionCookie,
  verifyAdminCredentials,
  getAdminUsername,
} from "../../lib/admin-auth.js";

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
    return res.status(503).json({ message: "A autenticação ainda não foi configurada no servidor." });
  }

  const limit = loginRateLimit(req);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const username = typeof body.username === "string" ? body.username.slice(0, 64) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || password.length > 256) {
    recordLoginFailure(req);
    return res.status(401).json({ message: "Usuário ou senha inválidos." });
  }

  if (!verifyAdminCredentials(username, password)) {
    recordLoginFailure(req);
    return res.status(401).json({ message: "Usuário ou senha inválidos." });
  }

  clearLoginFailures(req);
  try {
    const token = createAdminSession();
    setAdminSessionCookie(res, token);
    return res.status(200).json({
      authenticated: true,
      user: { username: getAdminUsername(), role: "admin" },
      expiresIn: ADMIN_SESSION_TTL_SECONDS,
    });
  } catch {
    return res.status(503).json({ message: "Não foi possível iniciar a sessão segura. Verifique a configuração do servidor." });
  }
}
