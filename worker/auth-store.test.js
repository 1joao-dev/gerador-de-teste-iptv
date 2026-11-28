import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuthStore } from "./auth-store.js";

async function createStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "iptv-flow-auth-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new AuthStore({
    filePath: path.join(directory, "auth.json"),
    pepper: "test-pepper-that-is-long-enough-for-unit-tests",
    ownerUsername: "1joaodev",
  });
  await store.init();
  return store;
}

test("access keys are one-time and passwords are stored as scrypt hashes", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({
    actor: { username: "1joaodev", role: "owner" },
    label: "Cliente teste",
    expiresInDays: 30,
  });
  assert.match(generated.key, /^IPF-[A-F0-9]{48}$/);
  assert.equal((await store.listAccessKeys())[0].status, "active");

  const user = await store.register({
    username: "cliente01",
    password: "SenhaForte123!",
    accessKey: generated.key,
  });
  assert.equal(user.role, "user");
  assert.equal((await store.listAccessKeys())[0].status, "used");

  const stored = JSON.parse(await fs.readFile(store.filePath, "utf8"));
  assert.equal(stored.users[0].passwordHash.includes("SenhaForte123!"), false);
  assert.equal(stored.keys[0].hash.includes(generated.key), false);
  await assert.rejects(
    store.register({ username: "cliente02", password: "SenhaForte123!", accessKey: generated.key }),
    /já foi utilizada/,
  );
});

test("simultaneous registration cannot redeem a key twice", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({ actor: { username: "1joaodev", role: "owner" }, expiresInDays: null });
  const results = await Promise.allSettled([
    store.register({ username: "cliente01", password: "SenhaForte123!", accessKey: generated.key }),
    store.register({ username: "cliente02", password: "SenhaForte123!", accessKey: generated.key }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
});

test("keys can be revoked and expiry choices are validated", async (t) => {
  const store = await createStore(t);
  const actor = { username: "admin01", role: "admin" };
  const generated = await store.createAccessKey({ actor, expiresInDays: 7 });
  assert.equal((await store.revokeAccessKey({ id: generated.accessKey.id, actor })).status, "revoked");
  await assert.rejects(
    store.createAccessKey({ actor, expiresInDays: 2 }),
    /validade permitida/,
  );
});

test("only the owner can promote users to administrators", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({ actor: { username: "1joaodev", role: "owner" }, expiresInDays: null });
  await store.register({ username: "cliente01", password: "SenhaForte123!", accessKey: generated.key });
  await assert.rejects(
    store.setUserRole({ username: "cliente01", role: "admin", actor: { username: "admin01", role: "admin" } }),
    /Somente o proprietário/,
  );
  const promoted = await store.setUserRole({ username: "cliente01", role: "admin", actor: { username: "1joaodev", role: "owner" } });
  assert.equal(promoted.role, "admin");
  assert.equal((await store.validateSession("cliente01")).role, "admin");
});

test("registration enforces the agreed password policy", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({ actor: { username: "1joaodev", role: "owner" }, expiresInDays: null });
  await assert.rejects(
    store.register({ username: "cliente01", password: "senha123!", accessKey: generated.key }),
    /letra maiúscula/,
  );
});


test("users can change their password only after proving the current password", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({
    actor: { username: "1joaodev", role: "owner" },
    expiresInDays: null,
  });
  await store.register({
    username: "cliente01",
    password: "SenhaAntiga123!",
    accessKey: generated.key,
  });

  await assert.rejects(
    store.changePassword({
      username: "cliente01",
      role: "user",
      currentPassword: "SenhaErrada123!",
      newPassword: "SenhaNova456!",
    }),
    /senha atual está incorreta/,
  );

  await store.changePassword({
    username: "cliente01",
    role: "user",
    currentPassword: "SenhaAntiga123!",
    newPassword: "SenhaNova456!",
  });

  assert.equal(await store.authenticate({ username: "cliente01", password: "SenhaAntiga123!" }), null);
  assert.equal((await store.authenticate({ username: "cliente01", password: "SenhaNova456!" })).username, "cliente01");
});

test("owner can replace the initial server password and authenticate with the new stored password", async (t) => {
  const store = await createStore(t);
  assert.deepEqual(
    await store.authenticateOwner({ password: "SenhaInicial123!" }),
    { configured: false, authenticated: false },
  );

  await assert.rejects(
    store.changePassword({
      username: "1joaodev",
      role: "owner",
      currentPassword: "SenhaErrada123!",
      newPassword: "SenhaNova456!",
      initialOwnerPassword: "SenhaInicial123!",
    }),
    /senha atual está incorreta/,
  );

  await store.changePassword({
    username: "1joaodev",
    role: "owner",
    currentPassword: "SenhaInicial123!",
    newPassword: "SenhaNova456!",
    initialOwnerPassword: "SenhaInicial123!",
  });

  assert.deepEqual(
    await store.authenticateOwner({ password: "SenhaNova456!" }),
    { configured: true, authenticated: true },
  );
  assert.deepEqual(
    await store.authenticateOwner({ password: "SenhaInicial123!" }),
    { configured: true, authenticated: false },
  );

  const persisted = JSON.parse(await fs.readFile(store.filePath, "utf8"));
  assert.equal(persisted.ownerCredentials.passwordHash.includes("SenhaNova456!"), false);
  assert.equal(persisted.ownerCredentials.passwordHash.includes("SenhaInicial123!"), false);
});


test("new access keys assign the selected subscription plan when the client activates", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({
    actor: { username: "1joaodev", role: "owner" },
    expiresInDays: 30,
    planCode: "7d",
  });

  assert.equal((await store.listAccessKeys())[0].planCode, "7d");
  const client = await store.register({
    username: "clienteplano",
    password: "SenhaForte123!",
    accessKey: generated.key,
  });

  assert.equal(client.planCode, "7d");
  assert.ok(Date.parse(client.planExpiresAt) > Date.now());
  assert.equal(client.planStatus, "active");
  assert.equal((await store.listClients())[0].username, "clienteplano");
});

test("staff can change a client plan and expired plans cannot log in or keep a session", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({
    actor: { username: "1joaodev", role: "owner" },
    expiresInDays: null,
    planCode: "30d",
  });
  await store.register({
    username: "clienteplano",
    password: "SenhaForte123!",
    accessKey: generated.key,
  });

  const updated = await store.setClientPlan({
    username: "clienteplano",
    planCode: "90d",
    actor: { username: "admin01", role: "admin" },
  });
  assert.equal(updated.planCode, "90d");
  assert.ok(Date.parse(updated.planExpiresAt) > Date.now());

  await assert.rejects(
    store.setClientPlan({
      username: "clienteplano",
      planCode: "7d",
      actor: { username: "clienteplano", role: "user" },
    }),
    /Somente proprietários e administradores/,
  );

  const clientRecord = store.state.users.find((item) => item.username === "clienteplano");
  clientRecord.planExpiresAt = new Date(Date.now() - 60_000).toISOString();
  await store.persist();

  const publicClient = await store.getUser("clienteplano");
  assert.equal(publicClient.planStatus, "expired");
  assert.equal(await store.authenticate({ username: "clienteplano", password: "SenhaForte123!" }), null);
  assert.equal(await store.validateSession("clienteplano"), null);
});

test("lifetime subscription never receives an expiration date", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({
    actor: { username: "1joaodev", role: "owner" },
    expiresInDays: null,
    planCode: "lifetime",
  });
  const client = await store.register({
    username: "clientelife",
    password: "SenhaForte123!",
    accessKey: generated.key,
  });
  assert.equal(client.planCode, "lifetime");
  assert.equal(client.planExpiresAt, null);
  assert.equal(client.planStatus, "active");
});
