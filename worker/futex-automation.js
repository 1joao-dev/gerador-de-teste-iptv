import { chromium } from "playwright";

const FUTEX_URL = process.env.FUTEX_URL || "https://futex.com.br/teste/";
const HEADLESS = process.env.FUTEX_HEADLESS !== "false";
const CHAT_INPUT = [
  'input[placeholder*="mensagem" i]',
  'textarea[placeholder*="mensagem" i]',
  '[contenteditable="true"][data-placeholder*="mensagem" i]',
  '[contenteditable="true"]',
].join(", ");

let browserPromise;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: HEADLESS });
  }
  try {
    return await browserPromise;
  } catch (error) {
    browserPromise = undefined;
    throw error;
  }
}

async function visibleText(scope) {
  return scope.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
}

async function findChatScope(page) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    for (const frame of page.frames()) {
      const input = frame.locator(CHAT_INPUT).last();
      if (await input.isVisible().catch(() => false)) return frame;
    }
    await page.waitForTimeout(1_000);
  }
  return page;
}

async function waitForText(scope, expression, timeout = 25_000) {
  await scope.waitForFunction(
    (source) => {
      const text = document.body?.innerText || "";
      return new RegExp(source, "i").test(text);
    },
    expression.source,
    { timeout },
  );
  return visibleText(scope);
}

async function clickChoice(scope, label) {
  const matcher = new RegExp(escapeRegExp(label), "i");
  const candidates = [
    scope.getByRole("button", { name: matcher }),
    scope.getByText(matcher),
  ];

  for (const candidate of candidates) {
    const count = await candidate.count().catch(() => 0);
    for (let index = count - 1; index >= 0; index -= 1) {
      const item = candidate.nth(index);
      if (await item.isVisible().catch(() => false)) {
        await item.click({ timeout: 5_000 });
        return;
      }
    }
  }
  throw new Error("A opção \"" + label + "\" não apareceu no atendimento da FUTEX.");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function sendChatMessage(scope, message) {
  const input = scope.locator(CHAT_INPUT).filter({ visible: true }).last();
  await input.waitFor({ state: "visible", timeout: 15_000 });
  await input.fill(message);
  await input.press("Enter");
}

function extractRecommendedApp(text) {
  const patterns = [
    /aplicativo indicado é o?\s*([^.!\n]+)/i,
    /aplicativo recomendado é o?\s*([^.!\n]+)/i,
    /instale o\s+([^.!\n]+?)\s+na sua tv/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[🎬📺📲]+$/u, "").trim();
  }
  return undefined;
}

function extractDuration(text) {
  const match = text.match(/duração de\s+([\w., ]+?)(?:[.!\n]|$)/i);
  return match?.[1]?.trim() || undefined;
}

function extractAccessDetails(text) {
  const lower = text.toLowerCase();
  const markers = ["seus dados de acesso", "dados de acesso", "acesso liberado", "dados do teste"];
  const marker = markers.reduce((latest, item) => Math.max(latest, lower.lastIndexOf(item)), -1);
  if (marker < 0) return [];

  const tail = text.slice(marker).split(/pronto!|seu teste já está ativo/i)[0];
  const lines = tail.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const details = [];

  for (const line of lines) {
    const clean = line.replace(/^[🔑✅☑️📌\s]+/u, "");
    const match = clean.match(/^([^:=]{2,64})[:=]\s*(.+)$/);
    if (!match) continue;

    const label = match[1].trim();
    const value = match[2].trim();
    if (!value || /dados de acesso/i.test(label)) continue;
    details.push({ label, value });
  }
  return details;
}

function extractResult(text) {
  const accessDetails = extractAccessDetails(text);
  if (accessDetails.length === 0) return undefined;

  const activeMatch = text.match(/pronto!\s*seu teste já está ativo[^\n]*/i);
  const message = activeMatch?.[0]?.trim();
  return {
    status: "completed",
    resultTitle: "Teste gerado com sucesso",
    accessDetails,
    duration: extractDuration(message || text) || "6 horas",
    message,
  };
}

function extractGuideUrl(scope) {
  return scope.locator("a[href]").evaluateAll((anchors) => {
    const item = anchors.find((anchor) => {
      const text = (anchor.innerText || anchor.getAttribute("aria-label") || "").toLowerCase();
      return /tutorial|instalar|vídeo|video/.test(text);
    });
    return item?.href;
  }).catch(() => undefined);
}

async function waitForAppStep(scope) {
  const currentText = await visibleText(scope);
  const result = extractResult(currentText);
  if (result) return { ...result, session: undefined };

  try {
    const text = await waitForText(scope, /conseguiu instalar|aplicativo indicado|aplicativo recomendado/i, 45_000);
    const app = extractRecommendedApp(text);
    if (!/conseguiu instalar/i.test(text)) {
      throw new Error("A FUTEX não apresentou a confirmação de instalação esperada.");
    }
    return {
      status: "awaiting_app",
      recommendedApp: app || "Aplicativo indicado pela FUTEX",
      appGuideUrl: await extractGuideUrl(scope),
      message: app
        ? "Instale o aplicativo indicado e confirme para continuar o atendimento."
        : "A FUTEX solicitou a confirmação de instalação. Confira a orientação exibida no site.",
    };
  } catch (error) {
    const latestText = await visibleText(scope);
    const lateResult = extractResult(latestText);
    if (lateResult) return lateResult;
    throw error;
  }
}

export async function startFutexSession(payload) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale: "pt-BR",
    viewport: { width: 1365, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);

  const session = { context, page, closed: false };

  try {
    await page.goto(FUTEX_URL, { waitUntil: "domcontentloaded", timeout: 35_000 });
    await page.waitForTimeout(2_000);

    // O site pode abrir o atendimento automaticamente ou exigir o botão de teste.
    let scope = await findChatScope(page);
    let text = await visibleText(scope);
    if (!/como posso te chamar/i.test(text)) {
      const startOptions = ["Fazer teste grátis", "Teste grátis", "Iniciar atendimento", "Atendimento"];
      for (const option of startOptions) {
        try {
          await clickChoice(page, option);
          break;
        } catch {
          // Tenta a próxima opção visível; não contorna desafios ou bloqueios do site.
        }
      }
    }

    scope = await findChatScope(page);
    await waitForText(scope, /como posso te chamar|qual é o seu nome/i, 30_000);
    await sendChatMessage(scope, payload.customerName);

    await waitForText(scope, /whatsapp com ddd|número.*whatsapp|seu whatsapp/i, 25_000);
    await sendChatMessage(scope, payload.contact.replace(/\D/g, ""));

    await waitForText(scope, /onde você vai assistir|onde vai assistir/i, 25_000);
    await clickChoice(scope, payload.device);

    await waitForText(scope, /qual é a marca|marca da sua tv|marca do aparelho/i, 25_000);
    const knownBrands = ["Samsung", "LG", "TCL", "Sony", "Philips", "Panasonic", "Philco", "AOC", "Roku"];
    if (!knownBrands.includes(payload.brand)) {
      await clickChoice(scope, "Outra (digitar)");
      await sendChatMessage(scope, payload.brand);
    } else {
      await clickChoice(scope, payload.brand);
    }

    session.scope = scope;
    const result = await waitForAppStep(scope);
    if (result.status === "completed") {
      await closeFutexSession(session);
      return { result };
    }
    return { session, result };
  } catch (error) {
    await closeFutexSession(session);
    throw error;
  }
}

export async function continueFutexSession(session, installed) {
  if (!session || session.closed) throw new Error("A sessão da FUTEX não está mais ativa.");
  const scope = session.scope || session.page;

  if (installed) {
    await clickChoice(scope, "Sim, consegui");
    try {
      const text = await waitForText(scope, /seus dados de acesso|seu teste já está ativo/i, 45_000);
      const result = extractResult(text) || extractResult(await visibleText(scope));
      if (result) {
        await closeFutexSession(session);
        return result;
      }
      return {
        status: "needs_human",
        message: "A FUTEX respondeu, mas o formato dos dados não foi reconhecido. Confira o atendimento diretamente no site.",
      };
    } catch {
      return {
        status: "needs_human",
        message: "A FUTEX não retornou os dados no tempo esperado. Confira o atendimento diretamente no site.",
      };
    }
  }

  await clickChoice(scope, "Não consegui");
  const result = await waitForAppStep(scope);
  if (result.status === "completed") {
    await closeFutexSession(session);
    return result;
  }
  return result;
}

export async function closeFutexSession(session) {
  if (!session || session.closed) return;
  session.closed = true;
  await session.context.close().catch(() => undefined);
}

export async function closeFutexBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => undefined);
  browserPromise = undefined;
  await browser?.close().catch(() => undefined);
}
