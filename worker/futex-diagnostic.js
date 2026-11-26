import fs from "node:fs/promises";
import { closeFutexBrowser, closeFutexSession, inspectFutexPage, readFutexConversation, startFutexManualSession } from "./futex-automation.js";

const outputPath = new URL("./futex-diagnostic-report.json", import.meta.url);
let report;
let manualSession;

try {
  report = await inspectFutexPage();
  const opened = await startFutexManualSession();
  manualSession = opened.session;
  const liveChat = await readFutexConversation(manualSession);
  const { result: parsedResult, ...conversation } = liveChat;
  const summary = {
    manualChat: {
      status: opened.result.status,
      messageCount: conversation.chatMessages.length,
      firstMessage: conversation.chatMessages[0]?.text || "",
      inputPlaceholder: conversation.chatInputPlaceholder,
      options: conversation.chatOptions,
      resultDetected: Boolean(parsedResult),
    },
    status: "completed",
    url: report.url,
    title: report.title,
    checkedAt: report.checkedAt,
    frameCount: report.frames.length,
    frames: report.frames.map((frame) => ({
      name: frame.name,
      url: frame.url,
      visibleText: frame.visibleText,
      controls: frame.controls,
      dom: frame.dom,
    })),
  };
  await closeFutexSession(manualSession);
  manualSession = undefined;
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2), "utf8");
  console.log("FUTEX_DIAGNOSTIC_RESULT=" + JSON.stringify({
    status: summary.status,
    url: summary.url,
    title: summary.title,
    checkedAt: summary.checkedAt,
    frameCount: summary.frameCount,
    frames: summary.frames.map((frame) => ({
      name: frame.name,
      url: frame.url,
      visibleText: frame.visibleText.slice(0, 1800),
      controls: frame.controls,
      dom: frame.dom,
    })),
  }));
} catch (error) {
  const failure = {
    status: "failed",
    checkedAt: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
  };
  await fs.writeFile(outputPath, JSON.stringify(failure, null, 2), "utf8");
  console.error("FUTEX_DIAGNOSTIC_RESULT=" + JSON.stringify(failure));
  process.exitCode = 1;
} finally {
  if (manualSession) await closeFutexSession(manualSession);
  await closeFutexBrowser();
}
