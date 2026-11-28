import crypto from "node:crypto";

const COOKIE_NAME = "__Host-iptvflow_admin";
const SESSION_TTL_SECONDS = 4 * 60 * 60;
const REMEMBERED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET || "";
  if (Buffer.byteLength(secret, "utf8") < 64) {
    throw new Error("APP_SESSION_SECRET precisa ter pelo menos 64 bytes aleatórios.");
  }
  return secret;
}

function safeEqual(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  const leftDigest = crypto.createHash("sha256").update(leftText).digest();
  const rightDigest = crypto.createHash("sha256").update(rightText).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest) && leftText.length === rightText.length;
}

export function getAdminUsername() {
  return (process.env.ADMIN_USERNAME || "1joaodev").trim().toLowerCase();
}

export function isAdminUsername(username) {
  return String(username || "").trim().toLowerCase() === getAdminUsername();
}

export function isAuthConfigured() {
  return (process.env.APP_ACCESS_CODE || "").length >= 32
    && Buffer.byteLength(process.env.APP_SESSION_SECRET || "", "utf8") >= 64;
}

export function verifyAdminCredentials(username, password) {
  const expectedUsername = getAdminUsername();
  const expectedPassword = process.env.APP_ACCESS_CODE || "";
  if (!isAuthConfigured() || expectedPassword.length < 32) return false;
  return safeEqual(String(username || "").trim().toLowerCase(), expectedUsername)
    && safeEqual(String(password || ""), expectedPassword);
}

function parseCookies(header = "") {
  const result = {};
  for (const part of String(header).split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) result[name] = value;
  }
  return result;
}

function sign(value) {
  return crypto.createHmac("sha256", getSessionSecret()).update(process.env.APP_ACCESS_CODE || "").update("\\0").update(value).digest("base64url");
}

export function createUserSession(username, role = "user", remember = false) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (!normalizedUsername || normalizedUsername.length > 64) throw new Error("Usuário inválido para iniciar sessão.");
  if (!["owner", "admin", "user"].includes(role)) throw new Error("Nível de acesso inválido.");
  if (role === "owner" && normalizedUsername !== getAdminUsername()) {
    throw new Error("Somente a conta proprietária pode receber o nível de proprietário.");
  }
  if (role !== "owner" && normalizedUsername === getAdminUsername()) {
    throw new Error("A conta proprietária não pode receber outro nível de acesso.");
  }
  const now = Math.floor(Date.now() / 1000);
  const sessionTtl = remember === true ? REMEMBERED_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
  const payload = {
    v: 3,
    sub: normalizedUsername,
    role,
    remember: remember === true,
    iat: now,
    exp: now + sessionTtl,
    nonce: crypto.randomBytes(18).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + sign(encoded);
}

export function createAdminSession() {
  return createUserSession(getAdminUsername(), "owner");
}

export function verifyUserSession(req) {
  try {
    if (!isAuthConfigured()) return null;
    const token = parseCookies(req.headers?.cookie || "")[COOKIE_NAME];
    if (!token || token.length > 2048) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const expectedSignature = Buffer.from(sign(parts[0]));
    const providedSignature = Buffer.from(parts[1]);
    if (expectedSignature.length !== providedSignature.length
      || !crypto.timingSafeEqual(expectedSignature, providedSignature)) return null;

    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    const normalizedUsername = typeof payload?.sub === "string" ? payload.sub.trim().toLowerCase() : "";
    const legacyOwnerSession = [1, 2].includes(payload?.v)
      && payload?.role === "admin"
      && normalizedUsername === getAdminUsername();
    const supportedVersion = payload?.v === 3 || legacyOwnerSession;
    if (!supportedVersion || !normalizedUsername
      || (payload?.remember !== undefined && typeof payload.remember !== "boolean")
      || !Number.isInteger(payload?.iat) || !Number.isInteger(payload?.exp)
      || payload.iat > now + 60 || payload.exp <= now
      || payload.exp - payload.iat > (payload.remember === true ? REMEMBERED_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS)
      || typeof payload.nonce !== "string") return null;

    const role = legacyOwnerSession ? "owner" : payload.role;
    if (!["owner", "admin", "user"].includes(role)) return null;
    if (role === "owner" && normalizedUsername !== getAdminUsername()) return null;
    if (role !== "owner" && normalizedUsername === getAdminUsername()) return null;
    return { username: normalizedUsername, role, expiresAt: payload.exp, remember: payload.remember === true };
  } catch {
    return null;
  }
}

export function verifyAdminSession(req) {
  const session = verifyUserSession(req);
  return session && ["owner", "admin"].includes(session.role) ? session : null;
}

export function setAdminSessionCookie(res, token, remember = false) {
  const maxAge = remember === true ? REMEMBERED_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Priority=High`);
}

export function clearAdminSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Priority=High`);
}

export function isSameOriginRequest(req) {
  try {
    const origin = req.headers?.origin;
    const forwardedHost = req.headers?.["x-forwarded-host"];
    const requestHost = String(Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers?.host || "")
      .split(",")[0].trim().toLowerCase();
    if (!origin || !requestHost || origin === "null") return false;
    const parsed = new URL(String(origin));
    if (parsed.host.toLowerCase() !== requestHost) return false;
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") return false;
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function clientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.headers?.["x-real-ip"] || "unknown";
  return String(value).split(",")[0].trim().slice(0, 80) || "unknown";
}

export function loginRateLimit(req) {
  const key = clientIp(req);
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= LOGIN_MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfter: 0 };
}

export function recordLoginFailure(req) {
  const key = clientIp(req);
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    current.count += 1;
  }
  if (loginAttempts.size > 5000) {
    for (const [entryKey, entry] of loginAttempts) {
      if (entry.resetAt <= now) loginAttempts.delete(entryKey);
    }
  }
}

export function clearLoginFailures(req) {
  loginAttempts.delete(clientIp(req));
}

export const ADMIN_SESSION_TTL_SECONDS = SESSION_TTL_SECONDS;
export const REMEMBERED_SESSION_TTL_SECONDS = REMEMBERED_SESSION_TTL_SECONDS;
