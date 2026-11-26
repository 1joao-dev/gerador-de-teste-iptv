import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Headphones,
  MonitorPlay,
  MessageCircle,
  Monitor,
  Play,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  Wifi,
  Zap,
} from "lucide-react";
import { WHATSAPP_NUMBER } from "./config";

type RequestForm = {
  name: string;
  whatsapp: string;
  device: string;
  app: string;
  notes: string;
  accepted: boolean;
};

const deviceOptions = [
  "Smart TV Samsung",
  "Smart TV LG",
  "Android TV / Google TV",
  "TV Box Android",
  "Fire TV Stick",
  "Celular Android",
  "iPhone / iPad",
  "Computador Windows / Mac",
];

const appOptions = [
  "Ainda não tenho aplicativo",
  "IPTV Smarters Pro",
  "XCIPTV",
  "TiviMate",
  "IBO Player",
  "SS IPTV",
  "VLC",
  "Outro / Não sei",
];

const initialForm: RequestForm = {
  name: "",
  whatsapp: "",
  device: "",
  app: "Ainda não tenho aplicativo",
  notes: "",
  accepted: false,
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function App() {
  const [form, setForm] = useState<RequestForm>(initialForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preparedMessage, setPreparedMessage] = useState("");
  const [copied, setCopied] = useState(false);

  function updateField<K extends keyof RequestForm>(key: K, value: RequestForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setCopied(false);

    if (form.name.trim().length < 2) {
      setError("Informe seu nome para continuar.");
      return;
    }

    const phone = onlyDigits(form.whatsapp);
    if (phone.length < 10 || phone.length > 13) {
      setError("Confira o WhatsApp. Inclua o DDD.");
      return;
    }

    if (!form.device) {
      setError("Selecione o aparelho em que deseja assistir.");
      return;
    }

    if (!form.accepted) {
      setError("Confirme o uso dos dados para que o atendimento possa entrar em contato.");
      return;
    }

    const message = [
      "Olá! Gostaria de solicitar um teste IPTV.",
      "",
      "Nome: " + form.name.trim(),
      "WhatsApp: " + form.whatsapp.trim(),
      "Aparelho: " + form.device,
      "Aplicativo: " + form.app,
      "Observações: " + (form.notes.trim() || "Não informado"),
    ].join("\n");

    setPreparedMessage(message);

    if (!WHATSAPP_NUMBER) {
      setNotice("Sua solicitação está pronta. Falta configurar o número do WhatsApp de atendimento para abrir a conversa automaticamente.");
      return;
    }

    const url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(message);
    window.open(url, "_blank", "noopener,noreferrer");
    setNotice("Tudo certo! O WhatsApp foi aberto com sua solicitação. Toque em enviar para concluir.");
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(preparedMessage);
      setCopied(true);
      setError("");
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione e copie a mensagem manualmente.");
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Teste IPTV — início">
          <span className="brand-mark"><MonitorPlay size={22} strokeWidth={2.2} /></span>
          <span className="brand-name">teste<span>iptv</span></span>
        </a>
        <a className="header-help" href="#como-funciona">
          Como funciona <ArrowRight size={15} />
        </a>
      </header>

      <main>
        <section className="hero content-width" id="inicio">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> TESTE GRATUITO · SEM COMPROMISSO</div>
            <h1>Experimente antes.<br /><span>Escolha com confiança.</span></h1>
            <p className="hero-description">
              Solicite seu teste IPTV em poucos passos. Informe onde deseja assistir e continue o atendimento pelo WhatsApp.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#solicitar">
                Solicitar meu teste <ArrowRight size={18} />
              </a>
              <span className="secure-note"><ShieldCheck size={16} /> Sem cartão de crédito</span>
            </div>
            <div className="hero-proof">
              <div className="proof-item"><span className="proof-icon"><Clock3 size={17} /></span><span><strong>Rápido</strong><small>Solicitação simples</small></span></div>
              <div className="proof-divider" />
              <div className="proof-item"><span className="proof-icon"><Smartphone size={17} /></span><span><strong>Seu aparelho</strong><small>TV, celular e mais</small></span></div>
              <div className="proof-divider" />
              <div className="proof-item"><span className="proof-icon"><MessageCircle size={17} /></span><span><strong>Atendimento</strong><small>Direto no WhatsApp</small></span></div>
            </div>
          </div>

          <div className="hero-visual" aria-label="Ilustração de uma tela de entretenimento">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="visual-card">
              <div className="visual-topline">
                <span className="live-indicator"><span /> SOLICITAÇÃO ONLINE</span>
                <span className="visual-sparkle"><Sparkles size={16} /></span>
              </div>
              <div className="screen-frame">
                <div className="screen-glow" />
                <div className="screen-content">
                  <div className="screen-logo"><Play size={20} fill="currentColor" /></div>
                  <span className="screen-kicker">SUA EXPERIÊNCIA</span>
                  <strong>Começa<br />agora.</strong>
                  <div className="screen-progress"><span /></div>
                </div>
                <div className="screen-base" />
              </div>
              <div className="device-row">
                <span><Tv size={14} /> Smart TV</span>
                <span><Smartphone size={14} /> Mobile</span>
                <span><Monitor size={14} /> Desktop</span>
              </div>
            </div>
            <div className="floating-tag tag-top"><span className="tag-check"><Check size={13} /></span> Pedido em poucos passos</div>
            <div className="floating-tag tag-bottom"><Wifi size={16} /> Feito para sua tela</div>
          </div>
        </section>

        <section className="benefits content-width" aria-label="Vantagens do teste">
          <div className="benefit-card">
            <span className="benefit-icon violet"><Clock3 size={19} /></span>
            <div><strong>Teste por tempo limitado</strong><small>Confira as condições com o atendimento</small></div>
          </div>
          <div className="benefit-card">
            <span className="benefit-icon mint"><ShieldCheck size={19} /></span>
            <div><strong>Sem compromisso</strong><small>Solicitar não obriga a contratar</small></div>
          </div>
          <div className="benefit-card">
            <span className="benefit-icon blue"><Headphones size={19} /></span>
            <div><strong>Ajuda na configuração</strong><small>Orientação para seu aparelho</small></div>
          </div>
        </section>

        <section className="request-section content-width" id="solicitar">
          <div className="section-heading">
            <div>
              <span className="section-kicker">VAMOS COMEÇAR</span>
              <h2>Solicite seu teste</h2>
              <p>Preencha os campos abaixo. Leva menos de um minuto.</p>
            </div>
            <div className="time-pill"><Zap size={15} /> Rápido e gratuito</div>
          </div>

          <div className="request-layout">
            <aside className="steps-panel" id="como-funciona">
              <div className="steps-heading">
                <span className="steps-icon"><Sparkles size={18} /></span>
                <div><strong>Simples assim</strong><small>Veja o que acontece depois</small></div>
              </div>
              <div className="steps-list">
                <div className="step-item">
                  <span className="step-number">01</span>
                  <div><strong>Informe seus dados</strong><p>Conte como prefere assistir e em qual aparelho.</p></div>
                </div>
                <div className="step-item">
                  <span className="step-number">02</span>
                  <div><strong>Abra o WhatsApp</strong><p>Sua mensagem será montada automaticamente para o atendimento.</p></div>
                </div>
                <div className="step-item">
                  <span className="step-number">03</span>
                  <div><strong>Receba as orientações</strong><p>A equipe confirma a disponibilidade e orienta a liberação do teste.</p></div>
                </div>
              </div>
              <div className="support-note">
                <div className="support-icon"><MessageCircle size={18} /></div>
                <div><strong>Precisa de ajuda?</strong><p>O atendimento pode orientar você sobre o aplicativo ideal para seu dispositivo.</p></div>
              </div>
            </aside>

            <form className="request-card" onSubmit={handleSubmit} noValidate>
              <div className="form-heading">
                <div>
                  <span className="form-step">FORMULÁRIO DE SOLICITAÇÃO</span>
                  <h3>Seus dados</h3>
                </div>
                <span className="free-badge"><span /> GRÁTIS</span>
              </div>

              <div className="field-grid">
                <label className="field full-field">
                  <span>Nome completo</span>
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    placeholder="Como podemos chamar você?"
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                  />
                </label>

                <label className="field full-field">
                  <span>WhatsApp com DDD</span>
                  <div className="input-with-icon">
                    <MessageCircle size={17} />
                    <input
                      type="tel"
                      name="whatsapp"
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="(00) 00000-0000"
                      value={form.whatsapp}
                      onChange={(event) => updateField("whatsapp", event.target.value)}
                    />
                  </div>
                </label>

                <label className="field full-field">
                  <span>Em qual aparelho deseja assistir?</span>
                  <select value={form.device} onChange={(event) => updateField("device", event.target.value)}>
                    <option value="">Selecione seu aparelho</option>
                    {deviceOptions.map((device) => <option key={device} value={device}>{device}</option>)}
                  </select>
                </label>

                <label className="field full-field">
                  <span>Qual aplicativo você utiliza?</span>
                  <select value={form.app} onChange={(event) => updateField("app", event.target.value)}>
                    {appOptions.map((app) => <option key={app} value={app}>{app}</option>)}
                  </select>
                </label>

                <label className="field full-field">
                  <span>Observações <em>opcional</em></span>
                  <textarea
                    rows={3}
                    placeholder="Se quiser, conte mais sobre seu aparelho ou sua dúvida."
                    value={form.notes}
                    onChange={(event) => updateField("notes", event.target.value)}
                  />
                </label>
              </div>

              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={form.accepted}
                  onChange={(event) => updateField("accepted", event.target.checked)}
                />
                <span className="custom-check"><Check size={12} /></span>
                <span>Autorizo o uso desses dados para receber contato sobre minha solicitação.</span>
              </label>

              {error && <div className="form-message error-message" role="alert">{error}</div>}
              {notice && <div className="form-message success-message" role="status"><CheckCircle2 size={17} /> {notice}</div>}

              {preparedMessage && !WHATSAPP_NUMBER && (
                <div className="message-preview">
                  <div><strong>Mensagem preparada</strong><small>Configure o WhatsApp do atendimento para ativar o envio automático.</small></div>
                  <button type="button" className="copy-button" onClick={copyMessage}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              )}

              <button className="button button-submit" type="submit">
                <MessageCircle size={18} /> Solicitar teste pelo WhatsApp <ArrowRight size={17} />
              </button>
              <p className="form-footnote"><ShieldCheck size={14} /> Seus dados são usados somente para atender esta solicitação.</p>
            </form>
          </div>
        </section>

        <section className="bottom-cta content-width">
          <div className="bottom-cta-icon"><MonitorPlay size={22} /></div>
          <div><strong>Não sabe qual aplicativo usar?</strong><p>Selecione “Ainda não tenho aplicativo” e peça uma orientação ao atendimento.</p></div>
          <a href="#solicitar" aria-label="Voltar ao formulário"><ArrowRight size={20} /></a>
        </section>
      </main>

      <footer className="site-footer content-width">
        <a className="brand footer-brand" href="#inicio">
          <span className="brand-mark"><MonitorPlay size={19} /></span>
          <span className="brand-name">teste<span>iptv</span></span>
        </a>
        <p>© {new Date().getFullYear()} · Solicitação de teste IPTV</p>
        <span className="footer-status"><span /> Atendimento online</span>
      </footer>
    </div>
  );
}

export default App;
