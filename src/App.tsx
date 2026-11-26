import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bot,
  Check,
  CheckCheck,
  CircleHelp,
  Copy,
  Paperclip,
  Play,
  Send,
  ShieldCheck,
  Wifi,
  X,
} from "lucide-react";
import { TEST_API_URL } from "./config";

type Step =
  | "device"
  | "brand"
  | "customBrand"
  | "app"
  | "install"
  | "retry"
  | "generating"
  | "error"
  | "done";

type Credentials = {
  code?: string;
  username: string;
  password: string;
  duration?: string;
};

type ChatMessage = {
  id: number;
  sender: "bot" | "user";
  text?: string;
  time: string;
  kind?: "video" | "credentials";
  credentials?: Credentials;
};

const deviceOptions = ["Smart TV", "TV Box", "Fire TV Stick", "Celular", "Computador"];
const brandOptions = [
  "Samsung",
  "LG",
  "TCL",
  "Sony",
  "Philips",
  "Panasonic",
  "Philco",
  "AOC",
  "Roku",
  "Outra (digitar)",
  "⬅️ Voltar",
];
const appOptions = [
  "IPTV Smarters Pro",
  "XCIPTV",
  "TiviMate",
  "Zuxo Player",
  "Outro / Não sei",
  "⬅️ Voltar",
];


function getTime() {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function createMessage(
  sender: ChatMessage["sender"],
  text: string,
  kind?: ChatMessage["kind"],
): ChatMessage {
  return {
    id: Date.now() + Math.random(),
    sender,
    text,
    time: getTime(),
    kind,
  };
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage("bot", "Olá! 👋 Seja bem-vindo ao atendimento."),
    createMessage("bot", "Vou te ajudar a configurar e gerar seu teste. Primeiro, em qual aparelho você deseja assistir?"),
  ]);
  const [step, setStep] = useState<Step>("device");
  const [device, setDevice] = useState("");
  const [brand, setBrand] = useState("");
  const [app, setApp] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, step]);

  function addBot(text: string, kind?: ChatMessage["kind"]) {
    setMessages((current) => [...current, createMessage("bot", text, kind)]);
  }

  function addUser(text: string) {
    setMessages((current) => [...current, createMessage("user", text)]);
  }

  function askBrand() {
    addBot("Qual é a marca da sua TV? 👇");
    setStep("brand");
  }

  function continueAfterBrand(selectedBrand: string) {
    setBrand(selectedBrand);

    if (selectedBrand.toLowerCase() === "lg") {
      setApp("Zuxo Player");
      addBot("Confira este passo a passo para instalar o aplicativo na sua TV.", "video");
      addBot("Na sua TV LG, o aplicativo indicado é o Zuxo Player. Baixe na loja de aplicativos da TV 📺");
      addBot("Conseguiu instalar o Zuxo Player? 👇");
      setStep("install");
      return;
    }

    addBot("Qual aplicativo você já instalou na sua TV " + selectedBrand + "?");
    setStep("app");
  }

  async function generateTest() {
    setBusy(true);
    setStep("generating");
    addBot("Perfeito! Já vou gerar o seu teste. Um instante... ⏳");

    if (!TEST_API_URL) {
      setBusy(false);
      setStep("error");
      addBot("O atendimento está pronto, mas a geração ainda precisa ser conectada ao serviço que fornece os testes. Assim que a integração oficial estiver configurada, seus dados de acesso aparecerão aqui automaticamente.");
      return;
    }

    try {
      const response = await fetch(TEST_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device,
          brand: brand || null,
          app: app || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Não foi possível gerar o teste.");
      }

      const result = (await response.json()) as Credentials;

      if (!result.username || !result.password) {
        throw new Error("A resposta do gerador não contém os dados de acesso.");
      }

      const credentialMessage = createMessage("bot", "🔑 Seus dados de acesso:", "credentials");
      credentialMessage.credentials = result;
      setMessages((current) => [...current, credentialMessage]);
      addBot("✅ Pronto! Seu teste já está ativo" + (result.duration ? " e tem duração de " + result.duration + "." : "."));
      setStep("done");
    } catch {
      setStep("error");
      addBot("Não consegui gerar seu teste neste momento. Tente novamente em instantes ou volte para conferir os dados.");
    } finally {
      setBusy(false);
    }
  }

  async function handleChoice(choice: string) {
    if (busy) return;
    addUser(choice);

    if (step === "device") {
      if (choice === "Smart TV") {
        setDevice(choice);
        askBrand();
      } else {
        setDevice(choice);
        addBot("Qual aplicativo você utiliza ou deseja instalar no seu aparelho?");
        setStep("app");
      }
      return;
    }

    if (step === "brand") {
      if (choice === "⬅️ Voltar") {
        addBot("Sem problema. Em qual aparelho você deseja assistir?");
        setStep("device");
        return;
      }
      if (choice === "Outra (digitar)") {
        addBot("Digite a marca da sua TV para continuar.");
        setStep("customBrand");
        inputRef.current?.focus();
        return;
      }
      continueAfterBrand(choice);
      return;
    }

    if (step === "app") {
      if (choice === "⬅️ Voltar") {
        if (device === "Smart TV") {
          askBrand();
        } else {
          addBot("Em qual aparelho você deseja assistir?");
          setStep("device");
        }
        return;
      }
      setApp(choice);
      addBot("Você já conseguiu instalar o " + choice + "? 👇");
      setStep("install");
      return;
    }

    if (step === "install") {
      if (choice === "Sim, consegui ✅") {
        await generateTest();
      } else if (choice === "Não consegui ❌") {
        addBot("Sem problemas! 😊 Você pode tentar novamente ou voltar para escolher outro aplicativo.");
        setStep("retry");
      } else if (choice === "⬅️ Voltar") {
        if (brand) {
          askBrand();
        } else {
          addBot("Qual aplicativo você utiliza ou deseja instalar?");
          setStep("app");
        }
      }
      return;
    }

    if (step === "retry") {
      if (choice === "Tentar novamente") {
        addBot("Conseguiu instalar o " + (app || "aplicativo") + "? 👇");
        setStep("install");
      } else if (choice === "Trocar aplicativo") {
        addBot("Escolha outro aplicativo da lista.");
        setStep("app");
      } else {
        addBot("Vamos voltar ao início. Em qual aparelho você deseja assistir?");
        setStep("device");
      }
      return;
    }

    if (step === "error") {
      if (choice === "Tentar novamente") {
        await generateTest();
      } else {
        addBot("Vamos conferir as opções novamente. Em qual aparelho você deseja assistir?");
        setStep("device");
      }
      return;
    }

    if (step === "done" && choice === "Gerar outro teste") {
      resetConversation();
    }
  }

  function resetConversation() {
    setMessages([
      createMessage("bot", "Olá! 👋 Seja bem-vindo ao atendimento."),
      createMessage("bot", "Vou te ajudar a configurar e gerar seu teste. Primeiro, em qual aparelho você deseja assistir?"),
    ]);
    setStep("device");
    setDevice("");
    setBrand("");
    setApp("");
    setDraft("");
    setCopied(false);
  }

  async function copyCredentials(credentials?: Credentials) {
    if (!credentials) return;
    const lines = [
      credentials.code ? "Código Uniplay: " + credentials.code : "",
      "Usuário: " + credentials.username,
      "Senha: " + credentials.password,
      credentials.duration ? "Duração: " + credentials.duration : "",
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!value || busy) return;

    setDraft("");
    addUser(value);

    if (step === "customBrand") {
      continueAfterBrand(value);
      return;
    }

    if (step === "install" && /^(não|nao)/i.test(value)) {
      addBot("Sem problemas! Escolha uma opção para continuar.");
      setStep("retry");
      return;
    }

    if (step === "install" && /^(sim|consegui|instalei)/i.test(value)) {
      void generateTest();
      return;
    }

    addBot("Recebi sua mensagem! Selecione uma das opções acima para continuar. 😊");
  }

  const quickReplies =
    step === "device" ? deviceOptions :
    step === "brand" ? brandOptions :
    step === "app" ? appOptions :
    step === "install" ? ["Sim, consegui ✅", "Não consegui ❌", "⬅️ Voltar"] :
    step === "retry" ? ["Tentar novamente", "Trocar aplicativo", "⬅️ Voltar"] :
    step === "error" ? ["Tentar novamente", "Voltar ao início"] :
    step === "done" ? ["Gerar outro teste"] :
    [];

  return (
    <main className="chat-page">
      <section className="chat-window" aria-label="Atendimento automatizado">
        <header className="chat-header">
          <div className="chat-avatar"><Bot size={23} /></div>
          <div className="chat-heading">
            <strong>Atendimento</strong>
            <span><i /> online agora</span>
          </div>
          <div className="header-actions">
            <button className="header-icon" type="button" aria-label="Ajuda" title="Ajuda">
              <CircleHelp size={18} />
            </button>
            <button className="header-icon close-button" type="button" aria-label="Reiniciar conversa" onClick={resetConversation}>
              <X size={21} strokeWidth={3} />
            </button>
          </div>
        </header>

        <div className="chat-body">
          <div className="chat-date"><span>HOJE</span></div>
          <div className="messages">
            {messages.map((message) => (
              <div className={"message-row " + (message.sender === "user" ? "message-out" : "message-in")} key={message.id}>
                {message.kind === "video" ? (
                  <div className="video-message">
                    <div className="video-preview">
                      <div className="video-orb" />
                      <div className="video-grid" />
                      <button type="button" className="video-play" aria-label="Reproduzir demonstração">
                        <Play size={22} fill="currentColor" />
                      </button>
                      <span className="video-controls"><Play size={13} fill="currentColor" /><span /><Wifi size={15} /></span>
                    </div>
                    <span className="message-time">{message.time}</span>
                  </div>
                ) : (
                  <div className={"bubble " + (message.sender === "user" ? "bubble-out" : "bubble-in")}>
                    {message.text && <p>{message.text}</p>}
                    {message.kind === "credentials" && message.credentials && (
                      <div className="credentials">
                        {message.credentials.code && <div><span>Código Uniplay:</span><strong>{message.credentials.code}</strong></div>}
                        <div><span>Usuário:</span><strong>{message.credentials.username}</strong></div>
                        <div><span>Senha:</span><strong>{message.credentials.password}</strong></div>
                        {message.credentials.duration && <div><span>Duração:</span><strong>{message.credentials.duration}</strong></div>}
                        <button type="button" className="copy-credentials" onClick={() => void copyCredentials(message.credentials)}>
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                          {copied ? "Copiado" : "Copiar dados"}
                        </button>
                      </div>
                    )}
                    <span className="message-meta">
                      {message.time}
                      {message.sender === "user" && <CheckCheck size={14} />}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="message-row message-in">
                <div className="bubble bubble-in typing-bubble"><span /><span /><span /></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {quickReplies.length > 0 && (
            <div className="quick-replies" aria-label="Respostas rápidas">
              {quickReplies.map((choice) => (
                <button
                  type="button"
                  className={"quick-reply " + (choice.includes("Voltar") ? "quick-back" : "")}
                  key={choice}
                  onClick={() => void handleChoice(choice)}
                  disabled={busy}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
        </div>

        <form className="chat-composer" onSubmit={handleSend}>
          <button type="button" className="composer-attach" aria-label="Anexar arquivo">
            <Paperclip size={22} />
          </button>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={step === "customBrand" ? "Digite a marca da sua TV..." : "Digite sua mensagem..."}
            aria-label="Digite sua mensagem"
            disabled={busy}
          />
          <button type="submit" className="send-button" aria-label="Enviar mensagem" disabled={!draft.trim() || busy}>
            <Send size={21} fill="currentColor" />
          </button>
        </form>
        <div className="chat-version">v1.0.0</div>
      </section>
      <div className="page-caption"><ShieldCheck size={13} /> Atendimento automatizado · Seus dados de acesso aparecem nesta conversa</div>
    </main>
  );
}

export default App;
