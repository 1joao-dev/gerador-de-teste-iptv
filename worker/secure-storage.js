import crypto from "node:crypto";

const PRIVATE_FIELDS = ["customerName", "contact", "accessDetails", "username", "password", "code"];

export function createDataEncryptionKey(rawKey, production = false) {
  const value = String(rawKey || "").trim();
  if (!value) {
    if (production) {
      throw new Error("Defina DATA_ENCRYPTION_KEY com 64 caracteres hexadecimais antes de iniciar o worker em produção.");
    }
    return null;
  }
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("DATA_ENCRYPTION_KEY deve conter exatamente 64 caracteres hexadecimais.");
  }
  return Buffer.from(value, "hex");
}

export function protectJobForStorage(job, key) {
  const hasPrivateFields = PRIVATE_FIELDS.some((field) => Object.hasOwn(job, field));
  if (job.privateDataEncrypted && !hasPrivateFields) return job;

  const publicFields = { ...job };
  delete publicFields.privateDataEncrypted;

  const privateData = {};
  for (const field of PRIVATE_FIELDS) {
    if (Object.hasOwn(publicFields, field)) {
      privateData[field] = publicFields[field];
      delete publicFields[field];
    }
  }

  if (!key || Object.keys(privateData).length === 0) {
    return { ...publicFields, ...privateData };
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(privateData), "utf8"),
    cipher.final(),
  ]);

  return {
    ...publicFields,
    privateDataEncrypted: {
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: encrypted.toString("base64"),
    },
  };
}

export function restoreJobFromStorage(job, key) {
  if (!job.privateDataEncrypted) return job;
  if (!key) {
    throw new Error("DATA_ENCRYPTION_KEY não está disponível para descriptografar os dados privados.");
  }

  const payload = job.privateDataEncrypted;
  if (payload.version !== 1 || !payload.iv || !payload.tag || !payload.data) {
    throw new Error("Formato de dados privados criptografados não reconhecido.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]);
  const privateData = JSON.parse(decrypted.toString("utf8"));
  const { privateDataEncrypted, ...publicFields } = job;

  return {
    ...publicFields,
    ...privateData,
  };
}
