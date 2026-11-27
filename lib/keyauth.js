const KEYAUTH_ENDPOINT = "https://keyauth.win/api/1.3/";
let sessionPromise;

function getConfig() {
  const name = (process.env.KEYAUTH_APP_NAME || "").trim();
  const ownerid = (process.env.KEYAUTH_OWNER_ID || "").trim();
  const ver = (process.env.KEYAUTH_VERSION || "1.0").trim();
  if (!name || !ownerid) throw new Error("KeyAuth ainda não foi configurado no servidor.");
  return { name, ownerid, ver, hash: (process.env.KEYAUTH_APP_HASH || "").trim() };
}

export function isKeyAuthConfigured() {
  return Boolean((process.env.KEYAUTH_APP_NAME || "").trim() && (process.env.KEYAUTH_OWNER_ID || "").trim());
}

async function requestKeyAuth(parameters) {
  const url = new URL(KEYAUTH_ENDPOINT);
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("Não foi possível conectar ao KeyAuth. Tente novamente.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result.success !== "boolean") {
    throw new Error("O KeyAuth retornou uma resposta inválida.");
  }
  return result;
}

async function initialize() {
  const config = getConfig();
  const result = await requestKeyAuth({
    type: "init",
    ver: config.ver,
    name: config.name,
    ownerid: config.ownerid,
    hash: config.hash || undefined,
  });
  if (!result.success || typeof result.sessionid !== "string" || !result.sessionid) {
    throw new Error("Não foi possível iniciar a sessão do KeyAuth.");
  }
  return { sessionid: result.sessionid, config };
}

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = initialize().catch((error) => {
      sessionPromise = undefined;
      throw error;
    });
  }
  return sessionPromise;
}

async function perform(type, parameters) {
  let current = await getSession();
  const send = () => requestKeyAuth({
    type,
    ...parameters,
    sessionid: current.sessionid,
    name: current.config.name,
    ownerid: current.config.ownerid,
  });
  let result = await send();
  if (!result.success && /session|initialize|initializ|expired/i.test(String(result.message || ""))) {
    sessionPromise = undefined;
    current = await getSession();
    result = await send();
  }
  return result;
}

export async function registerKeyAuthAccount({ username, password, licenseKey }) {
  return perform("register", { username, pass: password, key: licenseKey });
}

export async function loginKeyAuthAccount({ username, password }) {
  return perform("login", { username, pass: password });
}

export function getKeyAuthRegistrationMessage(message) {
  const value = String(message || "").toLowerCase();
  if (/already|used|redeemed|registered/.test(value)) return "Esta licença KeyAuth já foi utilizada.";
  if (/expired|expire/.test(value)) return "Esta licença KeyAuth expirou.";
  if (/invalid.*(key|license)|(key|license).*invalid|not found/.test(value)) return "A chave KeyAuth é inválida.";
  if (/banned|blacklist|paused/.test(value)) return "Esta licença ou conta está bloqueada no KeyAuth.";
  return "O KeyAuth não autorizou o cadastro. Confira a licença e tente novamente.";
}
