import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Copy,
  FileClock,
  Gauge,
  History,
  LayoutDashboard,
  LifeBuoy,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Monitor,
  MoreHorizontal,
  Plus,
  RadioTower,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  X,
  Zap,
} from "lucide-react";
import { API_BASE_URL } from "./config";

type Page = "overview" | "new" | "history" | "settings";
type RequestStatus = "draft" | "queued" | "running" | "completed" | "failed";

type TestRequest = {
  id: string;
  customerName: string;
  contact: string;
  device: string;
  brand: string;
  status: RequestStatus;
  createdAt: string;
  username?: string;
  password?: string;
  code?: string;
  duration?: string;
  message?: string;
};

const STORAGE_KEY = "iptv-automator-requests-v1";

const devices = [
  { label: "Smart TV", detail: "Samsung, LG, TCL e outras", icon: Tv },
  { label: "TV Box", detail: "Android TV e TV Box", icon: Monitor },
  { label: "Fire TV Stick", detail: "Amazon Fire TV", icon: RadioTower },
  { label: "Celular", detail: "Android ou iPhone", icon: Smartphone },
  { label: "Computador", detail: "Windows, macOS ou Linux", icon: Command },
];


function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPhone(value: string) {
  const digits = value.replace(/\\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? "(" + digits : "";
  if (digits.length <= 6) return "(" + digits.slice(0, 2) + ") " + digits.slice(2);
  if (digits.length <= 10) return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 6) + "-" + digits.slice(6);
  return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 7) + "-" + digits.slice(7);
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? ("req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
}

function statusLabel(status: RequestStatus) {
  const labels: Record<RequestStatus, string> = {
    draft: "Rascunho",
    queued: "Na fila",
    running: "Em execução",
    completed: "Concluído",
    failed: "Falhou",
  };
  return labels[status];
}

function StatusPill({ status }: { status: RequestStatus }) {
  return (
    <span className={"status-pill status-" + status}>
      <i />
      {statusLabel(status)}
    </span>
  );
}

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [requests, setRequests] = useState<TestRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TestRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    contact: "",
    device: "Smart TV",
    brand: "Samsung",
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setRequests(JSON.parse(saved) as TestRequest[]);
    } catch {
      setRequests([]);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  }, [requests, loaded]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const stats = useMemo(() => ({
    total: requests.length,
    queued: requests.filter((item) => item.status === "queued" || item.status === "draft").length,
    completed: requests.filter((item) => item.status === "completed").length,
    failed: requests.filter((item) => item.status === "failed").length,
  }), [requests]);

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return requests;
    return requests.filter((item) =>
      [item.customerName, item.contact, item.device, item.brand, item.id]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [requests, searchTerm]);

  function navigate(nextPage: Page) {
    setPage(nextPage);
    setMobileMenuOpen(false);
    setSelectedRequest(null);
  }

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phoneDigits = form.contact.replace(/\\D/g, "");
    if (!form.customerName.trim() || phoneDigits.length < 10 || !form.device || !form.brand.trim()) {
      setToast("Preencha nome, celular, tipo de dispositivo e marca.");
      return;
    }

    setSubmitting(true);
    const payload = {
      customerName: form.customerName.trim(),
      contact: form.contact.trim(),
      device: form.device,
      brand: form.brand,
    };

    if (API_BASE_URL) {
      try {
        const response = await fetch(API_BASE_URL.replace(/\/$/, "") + "/api/test-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.message || "O servidor não conseguiu receber a solicitação.");
        }
        const request: TestRequest = {
          id: result.id ?? makeId(),
          ...payload,
          status: result.status ?? "queued",
          createdAt: result.createdAt ?? new Date().toISOString(),
          username: result.username,
          password: result.password,
          code: result.code,
          duration: result.duration,
          message: result.message,
        };
        setRequests((current) => [request, ...current]);
        setToast("Solicitação enviada para a automação.");
        setForm({ customerName: "", contact: "", device: "Smart TV", brand: "" });
        setPage("history");
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Falha ao enviar a solicitação.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const draft: TestRequest = {
      id: makeId(),
      ...payload,
      status: "draft",
      createdAt: new Date().toISOString(),
      message: "Rascunho local. Integração com o serviço de automação ainda não configurada.",
    };
    setRequests((current) => [draft, ...current]);
    setSubmitting(false);
    setToast("Rascunho salvo neste navegador. Nenhum teste foi gerado.");
    setForm({ customerName: "", contact: "", device: "Smart TV", brand: "" });
    setPage("history");
  }

  async function refreshHistory() {
    if (!API_BASE_URL) {
      setToast("Configure a API do backend para sincronizar o histórico.");
      return;
    }
    try {
      const response = await fetch(API_BASE_URL.replace(/\/$/, "") + "/api/test-requests");
      if (!response.ok) throw new Error("Não foi possível atualizar o histórico.");
      const data = await response.json();
      const items = Array.isArray(data) ? data : data.items;
      if (Array.isArray(items)) setRequests(items as TestRequest[]);
      setToast("Histórico atualizado.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Erro ao atualizar histórico.");
    }
  }

  async function copyResult(request: TestRequest) {
    const text = [
      request.code ? "Código: " + request.code : "",
      request.username ? "Usuário: " + request.username : "",
      request.password ? "Senha: " + request.password : "",
      request.duration ? "Duração: " + request.duration : "",
    ].filter(Boolean).join("\n");
    if (!text) {
      setToast("Esta solicitação ainda não possui credenciais.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setToast("Dados copiados.");
    } catch {
      setToast("Não foi possível copiar neste dispositivo.");
    }
  }

  const navigation = [
    { id: "overview" as const, label: "Visão geral", icon: LayoutDashboard },
    { id: "new" as const, label: "Novo teste", icon: Plus },
    { id: "history" as const, label: "Histórico", icon: History },
    { id: "settings" as const, label: "Configurações", icon: Settings2 },
  ];

  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobileMenuOpen ? "sidebar-open" : "")}>
        <div className="brand-lockup">
          <div className="brand-mark"><Zap size={21} fill="currentColor" /></div>
          <div>
            <strong>IPTV<span>FLOW</span></strong>
            <small>CONTROL CENTER</small>
          </div>
          <button className="mobile-close icon-button" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu"><X size={19} /></button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">IF</div>
          <div className="workspace-copy"><strong>Meu workspace</strong><small>Plano local</small></div>
          <ChevronDown size={15} />
        </div>

        <div className="nav-caption">MENU PRINCIPAL</div>
        <nav className="side-nav">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={"nav-item " + (page === item.id ? "active" : "")} onClick={() => navigate(item.id)}>
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
                {item.id === "new" && <span className="nav-plus"><Plus size={13} /></span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><LifeBuoy size={17} /></div>
            <strong>Precisa de ajuda?</strong>
            <p>Consulte o guia de configuração da automação.</p>
            <button onClick={() => setToast("O guia será disponibilizado quando a integração estiver configurada.")}>Acessar guia <ArrowUpRight size={13} /></button>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">AD</div>
            <div className="profile-copy"><strong>Administrador</strong><small>Conta local</small></div>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>

      {mobileMenuOpen && <button className="mobile-backdrop" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu-trigger" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
            <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{navigation.find((item) => item.id === page)?.label}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className={"connection-indicator " + (API_BASE_URL ? "connected" : "disconnected")}>
              <i />{API_BASE_URL ? "Backend configurado" : "Integração pendente"}
            </div>
            <button className="icon-button notification-button" onClick={() => setToast("Você está em dia. Nenhuma notificação nova.")} aria-label="Notificações">
              <Bell size={18} /><i />
            </button>
            <div className="topbar-avatar">AD</div>
          </div>
        </header>

        <div className="page-content">
          {page === "overview" && (
            <section className="page-section">
              <div className="page-heading">
                <div><div className="eyebrow"><Sparkles size={13} /> CENTRAL DE OPERAÇÕES</div><h1>Visão geral</h1><p>Acompanhe suas solicitações e o status da automação em um só lugar.</p></div>
                <button className="primary-button" onClick={() => navigate("new")}><Plus size={17} /> Novo teste</button>
              </div>

              <div className="hero-panel">
                <div className="hero-copy">
                  <div className="hero-tag"><span /> PAINEL DE CONTROLE</div>
                  <h2>Sua operação,<br /><em>em outro nível.</em></h2>
                  <p>Organize solicitações, acompanhe processos e centralize seus testes em uma experiência simples.</p>
                  <button className="hero-button" onClick={() => navigate("new")}>Começar agora <ArrowRight size={16} /></button>
                </div>
                <div className="hero-visual" aria-hidden="true">
                  <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
                  <div className="hero-core"><Zap size={36} fill="currentColor" /></div>
                  <div className="floating-chip chip-top"><Activity size={14} /> Automação</div>
                  <div className="floating-chip chip-bottom"><ShieldCheck size={14} /> Controle centralizado</div>
                  <div className="hero-glow" />
                </div>
              </div>

              <div className="section-title-row"><div><h3>Indicadores</h3><p>Resumo das solicitações registradas neste dispositivo</p></div><span className="period-label"><Clock3 size={13} /> Desde o início</span></div>
              <div className="stats-grid">
                <article className="stat-card"><div className="stat-top"><span className="stat-icon violet"><FileClock size={18} /></span><span className="stat-trend neutral">Total</span></div><strong>{stats.total}</strong><p>Solicitações registradas</p><div className="stat-foot"><span className="stat-line violet-line" /><small>Todos os registros locais</small></div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon amber"><Clock3 size={18} /></span><span className="stat-trend neutral">Fila</span></div><strong>{stats.queued}</strong><p>Aguardando processamento</p><div className="stat-foot"><span className="stat-line amber-line" /><small>Inclui rascunhos locais</small></div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon green"><CheckCircle2 size={18} /></span><span className="stat-trend positive">Real</span></div><strong>{stats.completed}</strong><p>Testes concluídos</p><div className="stat-foot"><span className="stat-line green-line" /><small>Confirmados pelo backend</small></div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon red"><Activity size={18} /></span><span className="stat-trend neutral">Atenção</span></div><strong>{stats.failed}</strong><p>Solicitações com falha</p><div className="stat-foot"><span className="stat-line red-line" /><small>Requerem análise</small></div></article>
              </div>

              <div className="dashboard-grid">
                <section className="panel recent-panel">
                  <div className="panel-heading"><div><h3>Atividade recente</h3><p>Últimas solicitações registradas</p></div><button className="text-button" onClick={() => navigate("history")}>Ver histórico <ArrowRight size={14} /></button></div>
                  {requests.length === 0 ? (
                    <div className="empty-state"><div className="empty-icon"><FileClock size={22} /></div><strong>Nenhuma atividade por aqui</strong><p>Quando você criar uma solicitação, ela aparecerá nesta lista.</p><button className="secondary-button" onClick={() => navigate("new")}><Plus size={15} /> Criar primeira solicitação</button></div>
                  ) : (
                    <div className="recent-list">
                      {requests.slice(0, 5).map((request) => <button className="recent-row" key={request.id} onClick={() => { setSelectedRequest(request); setPage("history"); }}>
                        <span className="recent-device">{request.device === "Smart TV" ? <Tv size={17} /> : <Monitor size={17} />}</span>
                        <span className="recent-main"><strong>{request.customerName || request.device}</strong><small>{request.device} · {request.brand}</small></span>
                        <span className="recent-date">{formatDate(request.createdAt)}</span>
                        <StatusPill status={request.status} />
                        <ChevronRight className="recent-chevron" size={15} />
                      </button>)}
                    </div>
                  )}
                </section>

                <section className="panel automation-panel">
                  <div className="panel-heading"><div><h3>Serviço de automação</h3><p>Estado da conexão com o processador</p></div><span className="panel-menu"><MoreHorizontal size={18} /></span></div>
                  <div className="service-status">
                    <div className={"service-pulse " + (API_BASE_URL ? "is-on" : "")}><RadioTower size={21} /></div>
                    <div><strong>{API_BASE_URL ? "Backend configurado" : "Aguardando configuração"}</strong><small>{API_BASE_URL ? "Endpoint informado no ambiente" : "Nenhum worker conectado"}</small></div>
                  </div>
                  <div className="service-divider" />
                  <div className="service-detail"><span><i className="detail-dot green-dot" /> Interface web</span><strong>Operacional</strong></div>
                  <div className="service-detail"><span><i className={"detail-dot " + (API_BASE_URL ? "green-dot" : "amber-dot")} /> API de solicitações</span><strong>{API_BASE_URL ? "Configurada" : "Pendente"}</strong></div>
                  <div className="service-detail"><span><i className="detail-dot amber-dot" /> Worker FUTEX</span><strong>Aguardando integração</strong></div>
                  <div className="service-note"><LockKeyhole size={14} /><span>Credenciais e dados sensíveis devem ficar somente no servidor.</span></div>
                </section>
              </div>
              <div className="footer-note"><ShieldCheck size={14} /> Ambiente preparado para integração. Nenhum teste é gerado enquanto o serviço real não estiver conectado.</div>
            </section>
          )}

          {page === "new" && (
            <section className="page-section">
              <div className="page-heading">
                <div><div className="eyebrow"><Zap size={13} /> NOVA SOLICITAÇÃO</div><h1>Novo teste</h1><p>Informe os quatro dados solicitados para gerar o teste.</p></div>
                <button className="back-button" onClick={() => navigate("overview")}>Voltar ao painel</button>
              </div>
              <div className="new-test-layout">
                <form className="panel request-form" onSubmit={submitRequest}>
                  <div className="form-section-heading"><span className="step-number">01</span><div><h3>Dados do cliente</h3><p>Identificação para organizar a solicitação.</p></div></div>
                  <div className="form-grid two-columns">
                    <label className="field"><span>Nome completo <small>OBRIGATÓRIO</small></span><input value={form.customerName} onChange={(event) => updateForm("customerName", event.target.value)} placeholder="Digite o nome do cliente" autoComplete="name" required /></label>
                    <label className="field"><span>Celular com DDD <small>OBRIGATÓRIO</small></span><input type="tel" inputMode="tel" value={form.contact} onChange={(event) => updateForm("contact", formatPhone(event.target.value))} placeholder="(00) 00000-0000" autoComplete="tel" required /></label>
                  </div>
                  <div className="form-separator" />
                  <div className="form-section-heading"><span className="step-number">02</span><div><h3>Tipo de dispositivo</h3><p>Selecione o aparelho utilizado pelo cliente.</p></div></div>
                  <div className="device-grid">
                    {devices.map((device) => {
                      const Icon = device.icon;
                      return <button type="button" key={device.label} className={"device-option " + (form.device === device.label ? "selected" : "")} onClick={() => updateForm("device", device.label)}>
                        <span className="device-icon"><Icon size={20} /></span><strong>{device.label}</strong><small>{device.detail}</small>{form.device === device.label && <span className="selected-check"><Check size={12} /></span>}
                      </button>;
                    })}
                  </div>
                  <div className="form-separator" />
                  <div className="form-section-heading"><span className="step-number">03</span><div><h3>Marca do dispositivo</h3><p>Informe o fabricante ou a marca do aparelho.</p></div></div>
                  <label className="field"><span>Marca <small>OBRIGATÓRIO</small></span><input value={form.brand} onChange={(event) => updateForm("brand", event.target.value)} placeholder="Ex.: Samsung, LG, Amazon..." required /></label>
                  <div className="form-actions"><span><LockKeyhole size={13} /> Seus dados são enviados somente ao backend configurado.</span><button className="primary-button" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={16} /> : <Zap size={16} />}{submitting ? "Enviando..." : API_BASE_URL ? "Enviar solicitação" : "Salvar rascunho"}<ArrowRight size={15} /></button></div>
                </form>

                <aside className="new-test-aside">
                  <div className="panel summary-card"><div className="summary-top"><span className="summary-icon"><Sparkles size={17} /></span><span>RESUMO</span></div><h3>Revise os dados</h3><p>Confira os dados antes de enviar a solicitação.</p><div className="summary-items"><div><span>Dispositivo</span><strong>{form.device || "Não selecionado"}</strong></div><div><span>Marca</span><strong>{form.brand || "Não selecionada"}</strong></div></div><div className="summary-foot"><ShieldCheck size={15} /><span>O resultado só será exibido após confirmação do serviço de automação.</span></div></div>
                  <div className="info-card"><div className="info-card-icon"><CircleHelp size={18} /></div><div><strong>Como funciona?</strong><p>Após conectar o worker autorizado, esta solicitação será enviada ao servidor, processada e acompanhada pelo histórico.</p></div></div>
                </aside>
              </div>
            </section>
          )}

          {page === "history" && (
            <section className="page-section">
              <div className="page-heading">
                <div><div className="eyebrow"><History size={13} /> REGISTROS</div><h1>Histórico</h1><p>Consulte e acompanhe as solicitações registradas.</p></div>
                <button className="primary-button" onClick={() => navigate("new")}><Plus size={17} /> Novo teste</button>
              </div>
              <section className="panel history-panel">
                <div className="history-toolbar"><div className="search-box"><Search size={17} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar por cliente, aparelho ou marca..." /></div><button className="filter-button" onClick={refreshHistory}><RefreshCw size={15} /> Atualizar</button></div>
                {filteredRequests.length === 0 ? <div className="empty-state history-empty"><div className="empty-icon"><Search size={22} /></div><strong>{requests.length ? "Nenhum resultado encontrado" : "Seu histórico está vazio"}</strong><p>{requests.length ? "Tente buscar por outro termo." : "As solicitações criadas aparecerão aqui."}</p>{!requests.length && <button className="secondary-button" onClick={() => navigate("new")}><Plus size={15} /> Criar solicitação</button>}</div> : (
                  <div className="table-wrap"><table><thead><tr><th>CLIENTE / ID</th><th>DISPOSITIVO</th><th>CELULAR</th><th>DATA</th><th>STATUS</th><th /></tr></thead><tbody>
                    {filteredRequests.map((request) => <tr key={request.id} onClick={() => setSelectedRequest(request)} className="clickable-row"><td><strong>{request.customerName || "Sem identificação"}</strong><small>{request.id.slice(0, 13)}</small></td><td>{request.brand} · {request.device}</td><td>{request.contact}</td><td>{formatDate(request.createdAt)}</td><td><StatusPill status={request.status} /></td><td><button className="row-more" aria-label="Ver detalhes"><ChevronRight size={16} /></button></td></tr>)}
                  </tbody></table></div>
                )}
              </section>
              {selectedRequest && <section className="panel detail-panel"><div className="panel-heading"><div><h3>Detalhes da solicitação</h3><p>{selectedRequest.id}</p></div><button className="icon-button" onClick={() => setSelectedRequest(null)} aria-label="Fechar detalhes"><X size={17} /></button></div><div className="detail-grid"><div><span>Cliente</span><strong>{selectedRequest.customerName || "Não informado"}</strong></div><div><span>Contato</span><strong>{selectedRequest.contact || "Não informado"}</strong></div><div><span>Dispositivo</span><strong>{selectedRequest.device}</strong></div><div><span>Marca</span><strong>{selectedRequest.brand}</strong></div><div><span>Status</span><StatusPill status={selectedRequest.status} /></div></div>{selectedRequest.message && <p className="detail-message">{selectedRequest.message}</p>}{(selectedRequest.username || selectedRequest.password || selectedRequest.code) && <div className="result-box"><div><strong>Dados retornados pelo serviço</strong><button className="text-button" onClick={() => void copyResult(selectedRequest)}><Copy size={14} /> Copiar</button></div>{selectedRequest.code && <p>Código: <b>{selectedRequest.code}</b></p>}{selectedRequest.username && <p>Usuário: <b>{selectedRequest.username}</b></p>}{selectedRequest.password && <p>Senha: <b>{selectedRequest.password}</b></p>}{selectedRequest.duration && <p>Duração: <b>{selectedRequest.duration}</b></p>}</div>}</section>}
            </section>
          )}

          {page === "settings" && (
            <section className="page-section">
              <div className="page-heading"><div><div className="eyebrow"><Settings2 size={13} /> PREFERÊNCIAS</div><h1>Configurações</h1><p>Gerencie as conexões e os parâmetros do aplicativo.</p></div></div>
              <div className="settings-layout">
                <section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><RadioTower size={19} /></span><div><h3>Integração de automação</h3><p>Conexão entre o aplicativo e o serviço que processa as solicitações.</p></div><span className={"config-value " + (API_BASE_URL ? "configured" : "pending")}>{API_BASE_URL ? "Conectado" : "Pendente"}</span></div><div className="settings-row"><div><strong>API do backend</strong><small>Endereço público do serviço de solicitações.</small></div><span className={"config-value " + (API_BASE_URL ? "configured" : "")}>{API_BASE_URL ? "Configurada" : "Não configurada"}</span></div><div className="settings-row"><div><strong>Worker de automação</strong><small>Processador Playwright executado no servidor.</small></div><span className="config-value pending">Pendente</span></div><div className="settings-row"><div><strong>Site de referência</strong><small>Portal utilizado pelo fluxo de testes.</small></div><a className="external-link" href="https://futex.com.br/teste/" target="_blank" rel="noreferrer">Abrir FUTEX <ArrowUpRight size={13} /></a></div><div className="settings-callout"><LockKeyhole size={16} /><p>Tokens, senhas de acesso e cookies de sessão devem ser configurados no ambiente seguro do worker. Nunca os coloque no código do navegador.</p></div></section>
                <section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><Gauge size={19} /></span><div><h3>Ambiente do aplicativo</h3><p>Informações de execução desta versão.</p></div></div><div className="settings-row"><div><strong>Interface web</strong><small>Aplicação React responsiva.</small></div><span className="config-value configured">Operacional</span></div><div className="settings-row"><div><strong>Armazenamento local</strong><small>Rascunhos salvos neste navegador.</small></div><span className="config-value configured">Ativo</span></div><div className="settings-row"><div><strong>Sincronização entre dispositivos</strong><small>Depende da API e do banco de dados.</small></div><span className="config-value pending">Pendente</span></div></section>
              </div>
            </section>
          )}
        </div>
      </main>

      <nav className="mobile-bottom-nav">
        {navigation.map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={19} /><span>{item.id === "overview" ? "Início" : item.id === "new" ? "Novo" : item.id === "history" ? "Histórico" : "Ajustes"}</span></button>; })}
      </nav>

      {toast && <div className="toast-message"><span><Check size={15} /></span>{toast}<button onClick={() => setToast("")} aria-label="Fechar"><X size={15} /></button></div>}
    </div>
  );
}

export default App;
