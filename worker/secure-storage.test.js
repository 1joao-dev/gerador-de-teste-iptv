import test from "node:test";
import assert from "node:assert/strict";
import {
  createDataEncryptionKey,
  protectJobForStorage,
  restoreJobFromStorage,
} from "./secure-storage.js";

const key = createDataEncryptionKey("0123456789abcdef".repeat(4), true);

test("exige chave forte de criptografia em produção", () => {
  assert.throws(() => createDataEncryptionKey("", true), /DATA_ENCRYPTION_KEY/);
  assert.throws(() => createDataEncryptionKey("curta", true), /64 caracteres/);
  assert.equal(createDataEncryptionKey("", false), null);
});

test("criptografa nome, telefone e credenciais no histórico persistido", () => {
  const job = {
    id: "request-1",
    customerName: "Cliente Exemplo",
    contact: "62999999999",
    device: "Smart TV",
    brand: "Samsung",
    accessDetails: [{ label: "Usuário", value: "cliente01" }, { label: "Senha", value: "segredo" }],
    status: "completed",
  };

  const stored = protectJobForStorage(job, key);
  const serialized = JSON.stringify(stored);

  assert.equal(stored.customerName, undefined);
  assert.equal(stored.contact, undefined);
  assert.equal(stored.accessDetails, undefined);
  assert.ok(stored.privateDataEncrypted);
  assert.equal(serialized.includes("Cliente Exemplo"), false);
  assert.equal(serialized.includes("62999999999"), false);
  assert.equal(serialized.includes("cliente01"), false);
  assert.equal(serialized.includes("segredo"), false);

  const restored = restoreJobFromStorage(stored, key);
  assert.equal(restored.customerName, job.customerName);
  assert.equal(restored.contact, job.contact);
  assert.deepEqual(restored.accessDetails, job.accessDetails);
  assert.equal(restored.status, job.status);
});

test("detecta chave incorreta sem revelar os dados", () => {
  const stored = protectJobForStorage({
    id: "request-2",
    customerName: "Pessoa Privada",
    contact: "11999999999",
  }, key);

  const wrongKey = createDataEncryptionKey("fedcba9876543210".repeat(4), true);
  assert.throws(() => restoreJobFromStorage(stored, wrongKey));
});

test("mantém compatibilidade com registros antigos sem criptografia", () => {
  const legacy = { id: "request-3", customerName: "Registro antigo", contact: "11988887777" };
  assert.deepEqual(restoreJobFromStorage(legacy, key), legacy);
});
