export async function workerAuthRequest(path, { method = "GET", body, identity } = {}) {
  const workerBase = process.env.WORKER_API_URL;
  const workerToken = process.env.WORKER_API_TOKEN;
  if (!workerBase || !workerToken) {
    throw Object.assign(
      new Error("O serviço de autenticação ainda não está configurado no servidor."),
      { statusCode: 503 },
    );
  }

  let target;
  try {
    const base = new URL(workerBase);
    if (!["https:", "http:"].includes(base.protocol)) throw new Error("Invalid protocol");
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:") throw new Error("HTTPS required");
    target = new URL(path, base.origin);
  } catch {
    throw Object.assign(new Error("WORKER_API_URL inválida. Configure a URL HTTPS do worker."), { statusCode: 500 });
  }

  try {
    const response = await fetch(target, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + workerToken,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(identity ? {
          "X-IPTVFlow-User": identity.username,
          "X-IPTVFlow-Role": identity.role,
        } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  } catch {
    throw Object.assign(
      new Error("Não foi possível alcançar o serviço de autenticação. Verifique se o worker está online."),
      { statusCode: 502 },
    );
  }
}
