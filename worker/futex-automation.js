import { chromium } from "playwright";
import { extractRecommendedApp, extractResult } from "./futex-parser.js";

const FUTEX_URL = process.env.FUTEX_URL || "https://futex.com.br/teste/";
const HEADLESS = process.env.FUTEX_HEADLESS !== "false";
const CHAT_INPUT = [
  'input[aria-label="Mensagem"]',
  'textarea[aria-label="Mensagem"]',
  'input[placeholder*="mensagem" i]',
  'textarea[placeholder*="mensagem" i]',
  'input[placeholder*="digite" i]',
  'textarea[placeholder*="digite" i]',
  'textarea',
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
  return scope.evaluate(() => {
    const parts = [document.body?.innerText || ""];
    const visit = (root) => {
      for (const host of Array.from(root.querySelectorAll("*"))) {
        if (!host.shadowRoot) continue;
        const messages = host.shadowRoot.querySelectorAll(
          ".messages .msg, .messages .system, .messages .options .chip, .messages .cta",
        );
        for (const message of messages) {
          const text = (message.innerText || message.textContent || "").trim();
          if (text) parts.push(text);
        }
        const controls = host.shadowRoot.querySelectorAll("input, textarea, [contenteditable='true']");
        for (const control of controls) {
          const placeholder = control.getAttribute("placeholder")
            || control.getAttribute("data-placeholder")
            || control.getAttribute("aria-label")
            || "";
          if (placeholder.trim()) parts.push(placeholder.trim());
        }
        visit(host.shadowRoot);
      }
    };
    visit(document);
    return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join("\n");
  }).catch(() => scope.locator("body").innerText({ timeout: 5_000 }).catch(() => ""));
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
      const parts = [document.body?.innerText || ""];
      const visit = (root) => {
        for (const host of Array.from(root.querySelectorAll("*"))) {
          if (!host.shadowRoot) continue;
          const messages = host.shadowRoot.querySelectorAll(
            ".messages .msg, .messages .system, .messages .options .chip, .messages .cta",
          );
          for (const message of messages) {
            const text = (message.innerText || message.textContent || "").trim();
            if (text) parts.push(text);
          }
          const controls = host.shadowRoot.querySelectorAll("input, textarea, [contenteditable='true']");
          for (const control of controls) {
            const placeholder = control.getAttribute("placeholder")
              || control.getAttribute("data-placeholder")
              || control.getAttribute("aria-label")
              || "";
            if (placeholder.trim()) parts.push(placeholder.trim());
          }
          visit(host.shadowRoot);
        }
      };
      visit(document);
      return new RegExp(source, "i").test(parts.join("\n"));
    },
    expression.source,
    { timeout },
  );
  return visibleText(scope);
}

async function waitForInitialChat(session, timeout = 20_000) {
  const startedAt = Date.now();
  let latest = {
    chatMessages: [],
    chatOptions: [],
    chatInputPlaceholder: "",
    chatCanSend: false,
    chatBotCount: 0,
  };

  while (Date.now() - startedAt < timeout) {
    latest = await readFutexConversation(session).catch(() => latest);
    const transcript = latest.chatMessages.map((item) => item.text).join("\n");
    const hasWelcomeMessage = /como posso te chamar|teste gr[aá]tis|boa (?:tarde|noite|dia)/i.test(transcript);
    const hasNamePrompt = /digite\s+(?:seu\s+)?nome/i.test(latest.chatInputPlaceholder || "");
    const hasOptions = Array.isArray(latest.chatOptions) && latest.chatOptions.length > 0;

    if (hasWelcomeMessage || hasNamePrompt || hasOptions) return latest;
    await session.page.waitForTimeout(500).catch(() => undefined);
  }

  return latest;
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
    "iPhone / iPad": ["iPhone / iPad", "iPhone/iPad", "iPhone", "iPad", "iOS", "Apple", "Apple iOS", "iPhone e iPad", "iPhone / iPad (iOS)"],
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
    const text = await waitForText(scope, /conseguiu.{0,30}instalar|já instalou|instalou o (?:app|aplicativo)/i, 45_000);
    const conversation = session
      ? await readFutexConversation(session).catch(() => undefined)
      : undefined;
    const assistantTranscript = conversation?.chatMessages
      .filter((item) => item.role === "assistant")
      .map((item) => item.text)
      .join("\\n") || "";
    const app = extractRecommendedApp(assistantTranscript) || extractRecommendedApp(text);
    if (!/conseguiu.{0,30}instalar|já instalou|instalou o (?:app|aplicativo)/i.test(text)) {
      throw new Error("A FUTEX não apresentou a confirmação de instalação esperada.");
    }
    return {
      status: "awaiting_app",
      recommendedApp: app || "Aplicativo indicado pela FUTEX",
      appGuideUrl: await extractGuideUrl(scope),
      message: app
        ? "Instale o aplicativo indicado e confirme aqui no IPTV Flow para continuar."
        : "A FUTEX solicitou a confirmação de instalação. Responda aqui no IPTV Flow para continuar.",
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
    const diagnosticSession = { page, scope: page, closed: false };
    await waitForInitialChat(diagnosticSession, 20_000);
    await page.waitForTimeout(1_000);

    const initialText = await visibleText(page);
    const diagnosticChat = await readFutexConversation(diagnosticSession);
    if (!/como posso.{0,30}chamar|qual(?: é)? o? seu nome|digite\s+(?:seu\s+)?nome/i.test(initialText)) {
      const startOptions = ["Fazer teste grátis", "Iniciar teste grátis", "Teste grátis", "Gerar teste", "Iniciar atendimento", "Atendimento"];
      for (const option of startOptions) {
        try {
          await clickChoiceAnyFrame(page, [option]);
          await page.waitForTimeout(1_500);
          break;
        } catch {
          // O diagnóstico não preenche campos nem confirma a geração do teste.
        }
      }
    }

    const frames = await Promise.all(page.frames().slice(0, 8).map(async (frame) => {
      const [text, controls, dom] = await Promise.all([
        visibleText(frame),
        frame.locator("input, textarea, select, button, [role='button'], [contenteditable='true']")
          .evaluateAll((nodes) => nodes.filter((node) => {
            const rect = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
          }).slice(0, 40).map((node) => {
            const root = node.getRootNode();
            const isShadowRoot = typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot;
            return {
              tag: node.tagName.toLowerCase(),
              type: node.getAttribute("type"),
              role: node.getAttribute("role"),
              placeholder: node.getAttribute("placeholder"),
              ariaLabel: node.getAttribute("aria-label"),
              text: (node.innerText || node.textContent || "").trim().slice(0, 100),
              rootType: isShadowRoot ? "shadow" : "document",
              rootHost: isShadowRoot ? {
                tag: root.host.tagName.toLowerCase(),
                className: root.host.getAttribute("class"),
                id: root.host.id || undefined,
              } : undefined,
              chatMessages: node.tagName === "TEXTAREA" && isShadowRoot
                ? Array.from(root.querySelectorAll(".messages .msg, .messages .system, .messages .options .chip, .messages .cta"))
                    .map((message) => (message.innerText || message.textContent || "").trim())
                    .filter(Boolean)
                    .slice(0, 40)
                : undefined,
              messageContainerText: node.tagName === "TEXTAREA" && isShadowRoot
                ? (root.querySelector(".messages")?.innerText || "").trim().slice(0, 8_000)
                : undefined,
              chatStructure: node.tagName === "TEXTAREA" && isShadowRoot
                ? {
                    messages: Array.from(root.querySelectorAll(".messages .msg, .messages .system, .messages .options .chip, .messages .cta"))
                      .slice(0, 40)
                      .map((message) => ({
                        tag: message.tagName.toLowerCase(),
                        className: message.getAttribute("class"),
                        role: message.getAttribute("role"),
                        text: (message.innerText || message.textContent || "").trim().slice(0, 500),
                        buttons: Array.from(message.querySelectorAll("button, [role='button']"))
                          .map((button) => ({
                            text: (button.innerText || button.textContent || "").trim(),
                            ariaLabel: button.getAttribute("aria-label"),
                            className: button.getAttribute("class"),
                          })).slice(0, 10),
                      })),
                    sendButton: Array.from(root.querySelectorAll("button"))
                      .filter((button) => /enviar mensagem/i.test(button.getAttribute("aria-label") || ""))
                      .map((button) => ({
                        ariaLabel: button.getAttribute("aria-label"),
                        className: button.getAttribute("class"),
                        disabled: button.disabled,
                      })),
                  }
                : undefined,
            };
          })),
        frame.locator("body").evaluate((body) => {
          const candidates = [];
          const visit = (root, depth = 0) => {
            if (depth > 3) return;
            for (const node of Array.from(root.querySelectorAll("*"))) {
              const rect = node.getBoundingClientRect();
              const style = window.getComputedStyle(node);
              const visible = rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
              const text = (node.innerText || node.textContent || "").trim();
              const before = window.getComputedStyle(node, "::before").content;
              const after = window.getComputedStyle(node, "::after").content;
              if (visible && (text || (before && before !== "none" && before !== "normal") || (after && after !== "none" && after !== "normal"))) {
                candidates.push({
                  tag: node.tagName.toLowerCase(),
                  className: node.getAttribute("class"),
                  role: node.getAttribute("role"),
                  ariaLabel: node.getAttribute("aria-label"),
                  text: text.slice(0, 350),
                  before: before && before !== "none" ? before.slice(0, 120) : undefined,
                  after: after && after !== "none" ? after.slice(0, 120) : undefined,
                });
              }
              if (node.shadowRoot) visit(node.shadowRoot, depth + 1);
              if (candidates.length >= 80) return;
            }
          };
          visit(body);
          return {
            bodyTextContent: (body.textContent || "").trim().slice(0, 8_000),
            candidates: candidates.slice(0, 80),
          };
        }).catch(() => ({ bodyTextContent: "", candidates: [] })),
      ]);
      return {
        name: frame.name(),
        url: frame.url(),
        visibleText: text.slice(0, 2_000),
        controls,
        dom,
      };
    }));

    return {
      url: page.url(),
      title: await page.title(),
      checkedAt: new Date().toISOString(),
      chat: diagnosticChat,
      frames,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function startFutexManualSession() {
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
    const scope = await findChatScope(page);
    const input = scope.locator('textarea[aria-label="Mensagem"], textarea').last();
    await input.waitFor({ state: "visible", timeout: 30_000 });
    session.scope = scope;
    await waitForInitialChat(session, 20_000);
    await page.waitForTimeout(500);
    const chat = await readFutexConversation(session);
    const { result: parsedResult, ...conversation } = chat;
    return {
      session,
      result: parsedResult
        ? { ...parsedResult, manualChat: true, ...conversation }
        : {
            status: "running",
            manualChat: true,
            message: "Atendimento aberto. Digite suas respostas abaixo para conversar com a FUTEX.",
            ...conversation,
          },
    };
  } catch (error) {
    await closeFutexSession(session);
    throw error;
  }
}

export async function readFutexConversation(session) {
  if (!session || session.closed) throw new Error("A sessão da FUTEX não está mais ativa.");
  const scope = session.scope || session.page;
  return scope.locator("body").evaluate(() => {
    const findChatRoot = (root) => {
      if (root.querySelector?.(".messages")) return root;
      for (const host of Array.from(root.querySelectorAll("*"))) {
        if (!host.shadowRoot) continue;
        const found = findChatRoot(host.shadowRoot);
        if (found) return found;
      }
      return undefined;
    };
    const root = findChatRoot(document) || document;
    const input = root.querySelector('textarea[aria-label="Mensagem"], textarea');
    const messageNodes = Array.from(root.querySelectorAll(".messages .msg, .messages .system"));
    const messages = messageNodes.map((item, index) => {
      const className = String(item.getAttribute("class") || "");
      const rawText = (item.innerText || item.textContent || "").trim();
      const text = rawText.replace(/\n\d{1,2}:\d{2}\s*$/, "").trim();
      return {
        id: "futex-" + index + "-" + text.slice(0, 24),
        role: /\buser\b/i.test(className) ? "user" : "assistant",
        text,
      };
    }).filter((item) => item.text && !/^\d{1,2}:\d{2}\s*1×?$/i.test(item.text)).slice(-80);

    const options = Array.from(root.querySelectorAll(".messages .options .chip, .messages .cta"))
      .map((item) => (item.innerText || item.textContent || "").trim())
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(-8);
    const sendButton = root.querySelector('button[aria-label="Enviar mensagem"]');
    const transcript = messages.map((item) => item.text).join("\n");
    return {
      chatMessages: messages,
      chatOptions: options,
      chatInputPlaceholder: input?.getAttribute("placeholder") || "Digite sua resposta...",
      chatCanSend: Boolean(input && sendButton && !sendButton.disabled),
      chatBotCount: root.querySelectorAll(".messages .msg.bot").length,
    };
  }).then((chat) => {
    const transcript = chat.chatMessages.map((item) => item.text).join("\n");
    const result = extractResult(transcript);
    const { result: _ignored, ...conversation } = chat;
    return result ? { ...conversation, result } : conversation;
  });
}

async function waitForFutexBotReply(session, previousBotCount, timeout = 45_000) {
  const scope = session.scope || session.page;
  await scope.locator("body").evaluate((body, options) => new Promise((resolve, reject) => {
    const { previousBotCount, timeoutMs } = options;
    const findChatRoot = (root) => {
      if (root.querySelector?.(".messages")) return root;
      for (const host of Array.from(root.querySelectorAll("*"))) {
        if (!host.shadowRoot) continue;
        const found = findChatRoot(host.shadowRoot);
        if (found) return found;
      }
      return undefined;
    };
    const root = findChatRoot(document);
    const container = root?.querySelector(".messages");
    if (!root || !container) {
      reject(new Error("A conversa da FUTEX não está disponível."));
      return;
    }
    const countBotMessages = () => root.querySelectorAll(".messages .msg.bot").length;
    if (countBotMessages() > previousBotCount) {
      resolve(true);
      return;
    }

    let timer;
    const observer = new MutationObserver(() => {
      if (countBotMessages() > previousBotCount) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(true);
      }
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error("A FUTEX ainda não respondeu. Aguarde e atualize a conversa."));
    }, timeoutMs);
  }), { previousBotCount, timeoutMs: timeout }, { timeout: timeout + 5_000 });
  await session.page.waitForTimeout(350);
}

async function finishManualChatAction(session, beforeBotCount) {
  await waitForFutexBotReply(session, beforeBotCount);
  const chat = await readFutexConversation(session);
  const { result, ...conversation } = chat;
  return result
    ? { ...result, manualChat: true, ...conversation }
    : {
        status: "running",
        manualChat: true,
        message: "Resposta recebida. Continue a conversa com a FUTEX aqui no IPTV Flow.",
        ...conversation,
      };
}

export async function sendFutexChatMessage(session, message) {
  if (!session || session.closed) throw new Error("A sessão da FUTEX não está mais ativa.");
  const text = String(message || "").trim();
  if (!text || text.length > 1_000) throw new Error("Digite uma mensagem de até 1.000 caracteres.");
  const scope = session.scope || session.page;
  const input = scope.locator('textarea[aria-label="Mensagem"], textarea').last();
  const before = await readFutexConversation(session);
  const previousBotCount = before.chatBotCount;
  await input.fill(text);
  const sendButton = scope.locator('button[aria-label="Enviar mensagem"]').last();
  if (await sendButton.isVisible().catch(() => false) && await sendButton.isEnabled().catch(() => false)) {
    await sendButton.click();
  } else {
    await input.press("Enter");
  }
  return finishManualChatAction(session, previousBotCount);
}

export async function clickFutexChatOption(session, option) {
  if (!session || session.closed) throw new Error("A sessão da FUTEX não está mais ativa.");
  const label = String(option || "").trim();
  if (!label || label.length > 200) throw new Error("Selecione uma opção válida.");
  const scope = session.scope || session.page;
  const before = await readFutexConversation(session);
  const previousBotCount = before.chatBotCount;
  const choices = scope.locator(".messages .options .chip, .messages .cta");
  let matched;
  for (let index = await choices.count() - 1; index >= 0; index -= 1) {
    const choice = choices.nth(index);
    const text = (await choice.innerText().catch(() => "")).trim();
    if (text === label && await choice.isVisible().catch(() => false)) {
      matched = choice;
      break;
    }
  }
  if (!matched) throw new Error("Essa opção não está mais disponível na FUTEX. Atualize a conversa.");
  await matched.click();
  return finishManualChatAction(session, previousBotCount);
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
    await waitForInitialChat({ page, scope, closed: false }, 20_000);
    let text = await visibleText(scope);
    if (!/como posso te chamar|digite\s+(?:seu\s+)?nome/i.test(text)) {
      const startOptions = ["Fazer teste grátis", "Iniciar teste grátis", "Teste grátis", "Gerar teste", "Iniciar atendimento", "Atendimento"];
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
    await waitForText(scope, /como posso.{0,30}chamar|qual(?: é)? o? seu nome|qual é o seu nome|digite\s+(?:seu\s+)?nome/i, 30_000);
    await sendChatMessage(scope, payload.customerName);

    await waitForText(scope, /qual.{0,50}(?:whatsapp|celular|telefone)|(?:whatsapp|celular|telefone).{0,50}(?:ddd|n[uú]mero)/i, 25_000);
    await sendChatMessage(scope, payload.contact.replace(/\D/g, ""));

    await waitForText(scope, /onde.{0,60}assistir|qual.{0,40}dispositivo|em qual.{0,40}assistir|selecione.{0,40}dispositivo/i, 25_000);

    // O fluxo de iPhone/iPad pode pular a pergunta de marca: o próprio dispositivo
    // já identifica Apple. Aguarda a próxima resposta e só envia a marca se a FUTEX
    // realmente solicitar essa informação.
    session.scope = scope;
    const isAppleDevice = /iphone|ipad/i.test(payload.device) || /apple/i.test(payload.brand);

    if (isAppleDevice) {
      const beforeDeviceChoice = await readFutexConversation(session);
      await clickChoiceAny(scope, deviceChoiceLabels(payload.device));
      await waitForFutexBotReply(session, beforeDeviceChoice.chatBotCount, 25_000);

      const afterDeviceChoice = await readFutexConversation(session);
      const latestBotMessage = [...afterDeviceChoice.chatMessages]
        .reverse()
        .find((item) => item.role === "assistant")?.text || "";
      const asksForBrand = /qual.{0,50}(?:marca|fabricante)|(?:marca|fabricante).{0,50}(?:aparelho|dispositivo|celular)/i
        .test(latestBotMessage);

      if (asksForBrand) {
        const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
        const brandOption = afterDeviceChoice.chatOptions.find(
          (option) => normalize(option) === normalize(payload.brand),
        );

        if (brandOption) {
          const beforeBrandChoice = afterDeviceChoice.chatBotCount;
          await clickChoice(scope, brandOption);
          await waitForFutexBotReply(session, beforeBrandChoice, 25_000);
        } else {
          const otherOption = afterDeviceChoice.chatOptions.find((option) => /^outra(?:\s*\(.*\))?$/i.test(option));
          if (otherOption) {
            const beforeOtherChoice = afterDeviceChoice.chatBotCount;
            await clickChoice(scope, otherOption);
            await waitForFutexBotReply(session, beforeOtherChoice, 25_000);
          }
          await sendChatMessage(scope, payload.brand);
        }
      }
    } else {
      await clickChoiceAny(scope, deviceChoiceLabels(payload.device));
      await waitForText(scope, /qual.{0,40}marca|marca.{0,40}(?:tv|aparelho|dispositivo)/i, 25_000);

      const knownBrands = ["Samsung", "LG", "TCL", "Sony", "Philips", "Panasonic", "Philco", "AOC", "Roku", "Apple"];
      if (!knownBrands.includes(payload.brand)) {
        await clickChoiceAny(scope, ["Outra (digitar)", "Outra", "Outros"]);
        await sendChatMessage(scope, payload.brand);
      } else {
        await clickChoice(scope, payload.brand);
      }
    }
    let result = await waitForAppStep(scope);

    // Modo automático: avança no chatbot sem abrir a FUTEX no aparelho do usuário.
    // Só responde "Sim" quando o usuário habilitou essa opção no próprio IPTV Flow.
    if (result.status === "awaiting_app" && payload.autoConfirmInstall === true) {
      result = await continueFutexSession(session, true);
    }

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
    await clickChoiceAny(scope, ["Sim, consegui", "Sim, consegui instalar", "Já instalei", "Sim"]);
    try {
      const text = await waitForText(scope, /seus dados de acesso|dados do teste|acesso liberado|seu teste.*ativo|teste gerado/i, 45_000);
      const result = extractResult(text) || extractResult(await visibleText(scope));
      if (result) {
        await closeFutexSession(session);
        return result;
      }
      return {
        status: "needs_human",
        message: "A FUTEX respondeu, mas o formato dos dados não foi reconhecido. O atendimento foi interrompido com segurança; consulte o diagnóstico no IPTV Flow.",
      };
    } catch {
      return {
        status: "needs_human",
        message: "A FUTEX não retornou os dados no tempo esperado. O atendimento foi interrompido com segurança; tente novamente mais tarde.",
      };
    }
  }

  const previousText = await visibleText(scope);
  await clickChoiceAny(scope, ["Não consegui", "Não consegui instalar", "Ainda não", "Não"]);
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
