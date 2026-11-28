import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const ALLOWED_EXPIRY_DAYS = new Set([1, 7, 30, 90, 365]);
const CLIENT_PLAN_DURATIONS = Object.freeze({
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
  lifetime: null,
});
const ALLOWED_PLAN_CODES = new Set(Object.keys(CLIENT_PLAN_DURATIONS));

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function validatePassword(password) {
  return typeof password === "string"
    && password.length >= PASSWORD_MIN_LENGTH
    && password.length <= PASSWORD_MAX_LENGTH
    && Array.from(password).length >= PASSWORD_MIN_LENGTH
    && /\p{Lu}/u.test(password)
    && /\p{N}/u.test(password)
    && /[^\p{L}\p{N}\s]/u.test(password);
}

function passwordStrength(password) {
  const valid = validatePassword(password);
  if (!password) return "empty";
  if (!valid) return "weak";
  return Array.from(password).length >= 12 && /\p{Ll}/u.test(password) ? "strong" : "medium";
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return {
    passwordSalt: salt.toString("base64url"),
    passwordHash: Buffer.from(derived).toString("base64url"),
  };
}

async function verifyPassword(password, user) {
  if (typeof password !== "string" || !user?.passwordSalt || !user?.passwordHash) return false;
  const salt = Buffer.from(user.passwordSalt, "base64url");
  const expected = Buffer.from(user.passwordHash, "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const derived = Buffer.from(await scryptAsync(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }));
  return crypto.timingSafeEqual(derived, expected);
}

function safeEqualText(left, right) {
  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  const leftDigest = crypto.createHash("sha256").update(leftText).digest();
  const rightDigest = crypto.createHash("sha256").update(rightText).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest) && leftText.length === rightText.length;
}

function isPlanExpired(user, now = Date.now()) {
  return Boolean(user?.planExpiresAt && Date.parse(user.planExpiresAt) <= now);
}

function getPlanExpiresAt(planCode, startAt = new Date()) {
  const days = CLIENT_PLAN_DURATIONS[planCode];
  return days === null ? null : new Date(startAt.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function publicUser(user, now = Date.now()) {
  if (!user) return null;
  const planCode = user.planCode || "lifetime";
  return {
    username: user.username,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
    planCode,
    planExpiresAt: user.planExpiresAt || null,
    planStatus: user.role === "user" && isPlanExpired(user, now) ? "expired" : "active",
  };
}

function keyStatus(key, now = Date.now()) {
  if (key.revokedAt) return "revoked";
  if (key.redeemedAt) return "used";
  if (key.expiresAt && Date.parse(key.expiresAt) <= now) return "expired";
  return "active";
}

function publicKey(key, now = Date.now()) {
  return {
    id: key.id,
    prefix: key.prefix,
    label: key.label,
    createdBy: key.createdBy,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt || null,
    redeemedAt: key.redeemedAt || null,
    redeemedBy: key.redeemedBy || null,
    revokedAt: key.revokedAt || null,
    revokedBy: key.revokedBy || null,
    status: keyStatus(key, now),
    planCode: key.planCode || "lifetime",
  };
}

export class AuthStore {
  constructor({ filePath, pepper, ownerUsername = "1joaodev" }) {
    if (!filePath) throw new Error("O caminho do armazenamento de autenticação não foi definido.");
    if (typeof pepper !== "string" || pepper.length < 32) {
      throw new Error("O segredo de autenticação precisa ter pelo menos 32 caracteres.");
    }
    this.filePath = path.resolve(filePath);
    this.pepper = pepper;
    this.ownerUsername = normalizeUsername(ownerUsername);
    this.state = { version: 1, users: [], keys: [], ownerCredentials: null };
    this.loaded = false;
    this.queue = Promise.resolve();
  }

  async init() {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !Array.isArray(parsed.users) || !Array.isArray(parsed.keys)) {
        throw new Error("Formato do armazenamento de autenticação inválido.");
      }
      this.state = { ...parsed, ownerCredentials: parsed.ownerCredentials || null };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await this.persist();
    }
    const ownerPasswordReset = process.env.OWNER_PASSWORD_RESET_ONCE;
    if (ownerPasswordReset && this.state.ownerPasswordResetApplied !== true) {
      if (!validatePassword(ownerPasswordReset)) {
        throw new Error("A senha temporária de redefinição do proprietário não atende à política de segurança.");
      }
      this.state.ownerCredentials = {
        username: this.ownerUsername,
        ...(await hashPassword(ownerPasswordReset)),
        updatedAt: new Date().toISOString(),
      };
      this.state.ownerPasswordResetApplied = true;
      await this.persist();
    }
    delete process.env.OWNER_PASSWORD_RESET_ONCE;
    this.loaded = true;
  }

  async persist() {
    const temporaryFile = this.filePath + ".tmp";
    await fs.writeFile(temporaryFile, JSON.stringify(this.state, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporaryFile, this.filePath);
  }

  async exclusive(operation) {
    const result = this.queue.then(operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  keyDigest(rawKey) {
    return crypto.createHmac("sha256", this.pepper)
      .update(String(rawKey || "").trim().toUpperCase())
      .digest("hex");
  }

  async createAccessKey({ actor, label = "", expiresInDays = 30, planCode = "30d" }) {
    await this.init();
    if (!actor || !["owner", "admin"].includes(actor.role)) {
      throw httpError(403, "Somente proprietários e administradores podem gerar chaves.");
    }
    if (expiresInDays !== null && !ALLOWED_EXPIRY_DAYS.has(Number(expiresInDays))) {
      throw httpError(400, "Escolha uma validade permitida para a chave.");
    }
    if (!ALLOWED_PLAN_CODES.has(String(planCode))) {
      throw httpError(400, "Escolha um plano válido para o cliente.");
    }
    const cleanLabel = String(label || "").trim().slice(0, 60);
    return this.exclusive(async () => {
      const rawKey = "IPF-" + crypto.randomBytes(24).toString("hex").toUpperCase();
      const now = new Date();
      const expiresAt = expiresInDays === null
        ? null
        : new Date(now.getTime() + Number(expiresInDays) * 24 * 60 * 60 * 1000).toISOString();
      const record = {
        id: crypto.randomUUID(),
        hash: this.keyDigest(rawKey),
        prefix: rawKey.slice(0, 12),
        label: cleanLabel,
        createdBy: actor.username,
        createdAt: now.toISOString(),
        expiresAt,
        planCode,
        redeemedAt: null,
        redeemedBy: null,
        revokedAt: null,
        revokedBy: null,
      };
      this.state.keys.push(record);
      await this.persist();
      return { key: rawKey, accessKey: publicKey(record) };
    });
  }

  async register({ username, password, accessKey }) {
    await this.init();
    const normalizedUsername = normalizeUsername(username);
    if (!/^[a-z0-9_.-]{3,32}$/.test(normalizedUsername)) {
      throw httpError(400, "O usuário deve ter de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.");
    }
    if (normalizedUsername === this.ownerUsername) {
      throw httpError(409, "Esse nome de usuário é reservado para o proprietário.");
    }
    if (!validatePassword(password)) {
      throw httpError(400, "A senha precisa ter no mínimo 8 caracteres, uma letra maiúscula, um número e um símbolo.");
    }
    const normalizedKey = String(accessKey || "").trim().toUpperCase();
    if (!/^IPF-[A-F0-9]{48}$/.test(normalizedKey)) {
      throw httpError(400, "A chave de acesso é inválida.");
    }

    return this.exclusive(async () => {
      if (this.state.users.some((user) => user.username === normalizedUsername)) {
        throw httpError(409, "Esse nome de usuário já está em uso.");
      }
      const digest = this.keyDigest(normalizedKey);
      const key = this.state.keys.find((item) => item.hash === digest);
      if (!key) throw httpError(400, "A chave de acesso é inválida.");
      const status = keyStatus(key);
      if (status === "used") throw httpError(409, "Essa chave já foi utilizada.");
      if (status === "revoked") throw httpError(410, "Essa chave foi revogada.");
      if (status === "expired") throw httpError(410, "Essa chave expirou.");

      const credentials = await hashPassword(password);
      const now = new Date().toISOString();
      const user = {
        id: crypto.randomUUID(),
        username: normalizedUsername,
        ...credentials,
        role: "user",
        status: "active",
        createdAt: now,
        lastLoginAt: now,
        planCode: key.planCode || "lifetime",
        planStartedAt: now,
        planExpiresAt: key.planCode ? getPlanExpiresAt(key.planCode, new Date(now)) : null,
      };
      key.redeemedAt = now;
      key.redeemedBy = normalizedUsername;
      this.state.users.push(user);
      await this.persist();
      return publicUser(user);
    });
  }

  async authenticate({ username, password }) {
    await this.init();
    const normalizedUsername = normalizeUsername(username);
    return this.exclusive(async () => {
      const user = this.state.users.find((item) => item.username === normalizedUsername);
      if (!user || user.status !== "active" || (user.role === "user" && isPlanExpired(user))) return null;
      const valid = await verifyPassword(password, user);
      if (!valid) return null;
      user.lastLoginAt = new Date().toISOString();
      await this.persist();
      return publicUser(user);
    });
  }

  async authenticateOwner({ password }) {
    await this.init();
    return this.exclusive(async () => {
      if (!this.state.ownerCredentials) {
        return { configured: false, authenticated: false };
      }
      const authenticated = await verifyPassword(password, this.state.ownerCredentials);
      return { configured: true, authenticated };
    });
  }

  async changePassword({ username, role, currentPassword, newPassword, initialOwnerPassword }) {
    await this.init();
    const normalizedUsername = normalizeUsername(username);
    if (!validatePassword(newPassword)) {
      throw httpError(400, "A nova senha precisa ter no mínimo 8 caracteres, uma letra maiúscula, um número e um símbolo.");
    }
    if (safeEqualText(currentPassword, newPassword)) {
      throw httpError(400, "A nova senha precisa ser diferente da senha atual.");
    }

    return this.exclusive(async () => {
      if (role === "owner") {
        if (normalizedUsername !== this.ownerUsername) {
          throw httpError(403, "Somente o proprietário pode alterar esta senha.");
        }
        const valid = this.state.ownerCredentials
          ? await verifyPassword(currentPassword, this.state.ownerCredentials)
          : safeEqualText(currentPassword, initialOwnerPassword);
        if (!valid) throw httpError(401, "A senha atual está incorreta.");

        this.state.ownerCredentials = {
          username: this.ownerUsername,
          ...(await hashPassword(newPassword)),
          updatedAt: new Date().toISOString(),
        };
      } else {
        if (!["admin", "user"].includes(role)) {
          throw httpError(403, "Sessão inválida para alterar a senha.");
        }
        const user = this.state.users.find((item) => item.username === normalizedUsername);
        if (!user || user.status !== "active") {
          throw httpError(401, "Conta inativa ou sessão expirada. Entre novamente.");
        }
        if (!await verifyPassword(currentPassword, user)) {
          throw httpError(401, "A senha atual está incorreta.");
        }
        Object.assign(user, await hashPassword(newPassword), {
          passwordChangedAt: new Date().toISOString(),
        });
      }

      await this.persist();
      return { changed: true };
    });
  }

  async validateSession(username) {
    await this.init();
    const normalizedUsername = normalizeUsername(username);
    if (normalizedUsername === this.ownerUsername) {
      return { username: normalizedUsername, role: "owner", status: "active" };
    }
    const user = this.state.users.find((item) => item.username === normalizedUsername);
    if (!user || user.status !== "active" || (user.role === "user" && isPlanExpired(user))) return null;
    return publicUser(user);
  }

  async getUser(username) {
    await this.init();
    const normalizedUsername = normalizeUsername(username);
    const user = this.state.users.find((item) => item.username === normalizedUsername);
    return publicUser(user);
  }

  async listAccessKeys() {
    await this.init();
    const now = Date.now();
    return [...this.state.keys]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => publicKey(item, now));
  }

  async revokeAccessKey({ id, actor }) {
    await this.init();
    if (!actor || !["owner", "admin"].includes(actor.role)) {
      throw httpError(403, "Somente proprietários e administradores podem revogar chaves.");
    }
    return this.exclusive(async () => {
      const key = this.state.keys.find((item) => item.id === id);
      if (!key) throw httpError(404, "Chave não encontrada.");
      if (keyStatus(key) !== "active") throw httpError(409, "Somente chaves ativas podem ser revogadas.");
      key.revokedAt = new Date().toISOString();
      key.revokedBy = actor.username;
      await this.persist();
      return publicKey(key);
    });
  }

  async listUsers() {
    await this.init();
    return [...this.state.users]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicUser);
  }

  async listClients() {
    await this.init();
    return [...this.state.users]
      .filter((user) => user.role === "user")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicUser);
  }

  async setClientPlan({ username, planCode, actor }) {
    await this.init();
    if (!actor || !["owner", "admin"].includes(actor.role)) {
      throw httpError(403, "Somente proprietários e administradores podem gerenciar clientes.");
    }
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername || !ALLOWED_PLAN_CODES.has(String(planCode))) {
      throw httpError(400, "Cliente ou plano inválido.");
    }
    return this.exclusive(async () => {
      const user = this.state.users.find((item) => item.username === normalizedUsername);
      if (!user || user.role !== "user") {
        throw httpError(404, "Cliente não encontrado.");
      }
      const now = new Date();
      user.planCode = String(planCode);
      user.planStartedAt = now.toISOString();
      user.planExpiresAt = getPlanExpiresAt(user.planCode, now);
      await this.persist();
      return publicUser(user);
    });
  }

  async setUserRole({ username, role, actor }) {
    await this.init();
    if (!actor || actor.role !== "owner") {
      throw httpError(403, "Somente o proprietário pode alterar permissões administrativas.");
    }
    const normalizedUsername = normalizeUsername(username);
    if (!["admin", "user"].includes(role)) throw httpError(400, "Nível de acesso inválido.");
    if (!normalizedUsername || normalizedUsername === this.ownerUsername) {
      throw httpError(400, "A conta do proprietário não pode ser alterada.");
    }
    return this.exclusive(async () => {
      const user = this.state.users.find((item) => item.username === normalizedUsername);
      if (!user) throw httpError(404, "Usuário não encontrado.");
      if (user.status !== "active") throw httpError(409, "Este usuário está desativado.");
      user.role = role;
      await this.persist();
      return publicUser(user);
    });
  }
}
