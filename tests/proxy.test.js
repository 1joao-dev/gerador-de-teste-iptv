import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/worker/[...path].js";

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
  };
}

test("proxy exige código privado do painel antes de encaminhar chamadas", async () => {
  const original = {
    APP_ACCESS_CODE: process.env.APP_ACCESS_CODE,
    WORKER_API_URL: process.env.WORKER_API_URL,
    WORKER_API_TOKEN: process.env.WORKER_API_TOKEN,
    fetch: globalThis.fetch,
  };

  try {
    delete process.env.APP_ACCESS_CODE;
    delete process.env.WORKER_API_URL;
    delete process.env.WORKER_API_TOKEN;

    const missing = mockResponse();
    await handler({ method: "GET", query: { path: ["api", "health"] }, headers: {} }, missing);
    assert.equal(missing.statusCode, 503);

    process.env.APP_ACCESS_CODE = "painel-secreto-de-teste-com-mais-de-32-caracteres";
    const denied = mockResponse();
    await handler({ method: "GET", query: { path: ["api", "health"] }, headers: { "x-app-access-code": "errado" } }, denied);
    assert.equal(denied.statusCode, 401);
  } finally {
    if (original.APP_ACCESS_CODE === undefined) delete process.env.APP_ACCESS_CODE;
    else process.env.APP_ACCESS_CODE = original.APP_ACCESS_CODE;
    if (original.WORKER_API_URL === undefined) delete process.env.WORKER_API_URL;
    else process.env.WORKER_API_URL = original.WORKER_API_URL;
    if (original.WORKER_API_TOKEN === undefined) delete process.env.WORKER_API_TOKEN;
    else process.env.WORKER_API_TOKEN = original.WORKER_API_TOKEN;
    globalThis.fetch = original.fetch;
  }
});

test("proxy encaminha apenas rotas permitidas e mantém token do worker no servidor", async () => {
  const original = {
    APP_ACCESS_CODE: process.env.APP_ACCESS_CODE,
    WORKER_API_URL: process.env.WORKER_API_URL,
    WORKER_API_TOKEN: process.env.WORKER_API_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    fetch: globalThis.fetch,
  };
  let forwarded;

  try {
    process.env.APP_ACCESS_CODE = "painel-secreto-de-teste-com-mais-de-32-caracteres";
    process.env.WORKER_API_URL = "https://worker.example";
    process.env.WORKER_API_TOKEN = "token-interno-do-worker";
    process.env.NODE_ENV = "production";
    globalThis.fetch = async (url, options) => {
      forwarded = { url: String(url), options };
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const response = mockResponse();
    await handler({
      method: "GET",
      query: { path: ["api", "health"] },
      headers: { "x-app-access-code": "painel-secreto-de-teste-com-mais-de-32-caracteres" },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(forwarded.url, "https://worker.example/api/health");
    assert.equal(forwarded.options.headers.Authorization, "Bearer token-interno-do-worker");

    const chatResponse = mockResponse();
    await handler({
      method: "POST",
      query: { path: ["api", "test-requests", "123e4567-e89b-12d3-a456-426614174000", "chat"] },
      headers: { "x-app-access-code": "painel-secreto-de-teste-com-mais-de-32-caracteres" },
      body: { message: "João" },
    }, chatResponse);
    assert.equal(chatResponse.statusCode, 200);
    assert.equal(forwarded.url, "https://worker.example/api/test-requests/123e4567-e89b-12d3-a456-426614174000/chat");
    assert.equal(forwarded.options.method, "POST");
    assert.deepEqual(JSON.parse(forwarded.options.body), { message: "João" });

    const blocked = mockResponse();
    await handler({
      method: "GET",
      query: { path: ["admin", "secrets"] },
      headers: { "x-app-access-code": "painel-secreto-de-teste-com-mais-de-32-caracteres" },
    }, blocked);
    assert.equal(blocked.statusCode, 404);
  } finally {
    for (const key of ["APP_ACCESS_CODE", "WORKER_API_URL", "WORKER_API_TOKEN", "NODE_ENV"]) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    globalThis.fetch = original.fetch;
  }
});
