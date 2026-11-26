import { chromium } from "playwright";
import { extractAccessDetails, extractRecommendedApp, extractResult } from "./futex-parser.js";

const FUTEX_URL = process.env.FUTEX_URL || "https://futex.com.br/teste/";
const HEADLESS = process.env.FUTEX_HEADLESS !== "false";
const CHAT_INPUT = [
  'input[placeholder*="mensagem" i]',
  'textarea[placeholder*="mensagem" i]',
  'input[placeholder*="digite" i]',
  'textarea[placeholder*="digite" i]',
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
  const button = scope.getByRole("button", { name: matcher }).last();
  if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
    await button.click({ timeout: 5_000 });
    return;
  }

  const exactText = scope.getByText(matcher, { exact: true }).last();
  if (await exactText.isVisible().catch(() => false)) {
    await exactText.click({ timeout: 5_000 });
    return;
  }

  throw new Error("A opção \"" + label + "\" não apareceu no atendimento da FUTEX.");
}

async function clickChoiceAny(scope, labels) {
  let lastError;
  for (const label of labels) {
    try {
      await clickChoice(scope, label);
      return label;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Nenhuma das opções esperadas apareceu na FUTEX.");
}

async function clickChoiceAnyFrame(page, labels) {
  let lastError;
  for (const frame of page.frames()) {
    try {
      return await clickChoiceAny(frame, labels);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Nenhuma opção inicial apareceu na página FUTEX.");
}

function deviceChoiceLabels(device) {
  const aliases = {
    "Smart TV": ["Smart TV", "TV Smart", "Televisão Smart"],
    "Android TV": ["Android TV", "TV Android"],
    "Roku TV": ["Roku TV", "Roku"],
    "TV Box": ["TV Box", "TVBox", "Box TV"],
    "Celular Android": ["Celular Android", "Android", "Smartphone Android"],
    "iPhone / iPad": ["iPhone / iPad", "iPhone/iPad", "iPhone", "iPad"],
    "Computador": ["Computador", "PC", "Notebook"],
    "Fire Stick": ["Fire Stick", "Fire TV Stick", "Amazon Fire TV"],
    "Xbox": ["Xbox"],
    "XCIPTV": ["XCIPTV"],
    "IPTV Smarters": ["IPTV Smarters", "Smarters"],
    "Lista M3U": ["Lista M3U", "M3U"],
    "SS IPTV": ["SS IPTV"],
    "Duplecast": ["Duplecast"],
  };
  return aliases[device] || [device];
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


function extractGuideUrl(scope) {
  return scope.locator("a[href]").evaluateAll((anchors) => {
    const item = anchors.find((anchor) => {
      const text = (anchor.innerText || anchor.getAttribute("aria-label") || "").toLowerCase();
      return /tutorial|instalar|vídeo|video/.test(text);
    });
    return item?.href;
  }).catch(() => undefined);
}

async function waitForAppStep(scope, previousText) {
  if (previousText) {
    await scope.waitForFunction(
      (previous) => (document.body?.innerText || "") !== previous,
      previousText,
      { timeout: 20_000 },
    );
  }
  const currentText = await visibleText(scope);
  const result = extractResult(currentText);
  if (result) return { ...result, session: undefined };

  try {
    const text = await waitForText(scope, /conseguiu instalar/i, 45_000);
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

export async function inspectFutexPage() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale: "pt-BR",
    viewport: { width: 1365, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(FUTEX_URL, { waitUntil: "domcontentloaded", timeout: 35_000 });
    await page.waitForTimeout(3_000);
    const frames = await Promise.all(page.frames().slice(0, 8).map(async (frame) => {
      const [text, controls] = await Promise.all([
        visibleText(frame),
        frame.locator("input, textarea, select, button, [role='button'], [contenteditable='true']")
          .evaluateAll((nodes) => nodes.filter((node) => {
            const rect = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
          }).slice(0, 40).map((node) => ({
            tag: node.tagName.toLowerCase(),
            type: node.getAttribute("type"),
            role: node.getAttribute("role"),
            placeholder: node.getAttribute("placeholder"),
            ariaLabel: node.getAttribute("aria-label"),
            text: (node.innerText || node.textContent || "").trim().slice(0, 100),
          }))),
      ]);
      return {
        name: frame.name(),
        url: frame.url(),
        visibleText: text.slice(0, 2_000),
        controls,
      };
    }));

    return {
      url: page.url(),
      title: await page.title(),
      checkedAt: new Date().toISOString(),
      frames,
    };
  } finally {
    await context.close().catch(() => undefined);
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
          await clickChoiceAnyFrame(page, [option]);
          break;
        } catch {
          // Tenta a próxima opção visível; não contorna desafios ou bloqueios do site.
        }
      }
    }

    scope = await findChatScope(page);
    await waitForText(scope, /como posso te chamar|qual é o seu nome/i, 30_000);
    await sendChatMessage(scope, payload.customerName);

    await waitForText(scope, /whatsapp|celular|telefone|número.*ddd/i, 25_000);
    await sendChatMessage(scope, payload.contact.replace(/\D/g, ""));

    await waitForText(scope, /onde.*assistir|qual.*dispositivo|em qual.*assistir|selecione.*dispositivo/i, 25_000);
    await clickChoiceAny(scope, deviceChoiceLabels(payload.device));

    await waitForText(scope, /marca|qual.*aparelho/i, 25_000);
    const knownBrands = ["Samsung", "LG", "TCL", "Sony", "Philips", "Panasonic", "Philco", "AOC", "Roku"];
    if (!knownBrands.includes(payload.brand)) {
      await clickChoiceAny(scope, ["Outra (digitar)", "Outra", "Outros"]);
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
    await clickChoiceAny(scope, ["Sim, consegui", "Sim, consegui instalar", "Sim"]);
    try {
      const text = await waitForText(scope, /seus dados de acesso|dados do teste|acesso liberado|seu teste.*ativo|teste gerado/i, 45_000);
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

  const previousText = await visibleText(scope);
  await clickChoiceAny(scope, ["Não consegui", "Não consegui instalar", "Não"]);
  const result = await waitForAppStep(scope, previousText);
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
