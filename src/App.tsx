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
type RequestStatus = "draft" | "queued" | "running" | "awaiting_app" | "needs_human" | "completed" | "failed";

type AccessDetail = { label: string; value: string };

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
  resultTitle?: string;
  accessDetails?: AccessDetail[];
  recommendedApp?: string;
  appGuideUrl?: string;
  appInstalled?: boolean;
  message?: string;
};

const STORAGE_KEY = "iptv-automator-requests-v1";
const API_TOKEN_STORAGE_KEY = "iptv-flow-worker-token-v1";

const devices = [
  { label: "Smart TV", detail: "Televisores inteligentes", icon: Tv },
  { label: "Android TV", detail: "Sistema Android para TV", icon: Monitor },
  { label: "Roku TV", detail: "Televisores com Roku", icon: Tv },
  { label: "TV Box", detail: "Box e aparelhos Android", icon: Monitor },
  { label: "Celular Android", detail: "Smartphones Android", icon: Smartphone },
  { label: "iPhone / iPad", detail: "Dispositivos Apple", icon: Smartphone },
  { label: "Computador", detail: "Windows ou macOS", icon: Command },
  { label: "Fire Stick", detail: "Amazon Fire TV Stick", icon: RadioTower },
  { label: "Xbox", detail: "Console Xbox", icon: Monitor },
  { label: "XCIPTV", detail: "Aplicativo XCIPTV", icon: Smartphone },
  { label: "IPTV Smarters", detail: "Aplicativo IPTV Smarters", icon: Smartphone },
  { label: "Lista M3U", detail: "Reprodutor compatível com M3U", icon: Monitor },
  { label: "SS IPTV", detail: "Aplicativo SS IPTV", icon: Tv },
  { label: "Duplecast", detail: "Aplicativo Duplecast", icon: Smartphone },
];

const brands = ["Samsung", "LG", "TCL", "Sony", "Philips", "Panasonic", "Philco", "AOC", "Roku", "Outra (digitar)"];


function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
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
    awaiting_app: "Instalar aplicativo",
    needs_human: "Ação manual necessária",
    completed: "Concluído",
    failed: "Falhou",
  };
  return labels[status];
}

function getAccessDetails(request: TestRequest): AccessDetail[] {
  if (Array.isArray(request.accessDetails) && request.accessDetails.length > 0) {
    return request.accessDetails.filter((item) => item && typeof item.label === "string" && typeof item.value === "string" && item.value.trim());
  }

  return [
    request.code ? { label: "Código Uniplay", value: request.code } : null,
    request.username ? { label: "Usuário", value: request.username } : null,
    request.password ? { label: "Senha", value: request.password } : null,
  ].filter((item): item is AccessDetail => item !== null);
}

function hasTestResult(request: TestRequest): boolean {
  return getAccessDetails(request).length > 0 || request.status === "completed";
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
  const [confirmingApp, setConfirmingApp] = useState(false);
  const [refreshingFlow, setRefreshingFlow] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [apiTokenDraft, setApiTokenDraft] = useState("");
  const [flowRequest, setFlowRequest] = useState<TestRequest | null>(null);
  const [flowStage, setFlowStage] = useState<"form" | "install" | "waiting" | "result">("form");
  const [brandOther, setBrandOther] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    contact: "",
    device: "",
    brand: "",
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setRequests(JSON.parse(saved) as TestRequest[]);
      const savedToken = localStorage.getItem(API_TOKEN_STORAGE_KEY) ?? "";
      setApiToken(savedToken);
      setApiTokenDraft(savedToken);
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
    queued: requests.filter((item) => item.status === "queued" || item.status === "draft" || item.status === "awaiting_app" || item.status === "needs_human").length,
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

  function apiRequest(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers || {});
    if (apiToken) headers.set("Authorization", "Bearer " + apiToken);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(API_BASE_URL.replace(/\/$/, "") + path, { ...options, headers });
  }

  function saveApiToken() {
    const nextToken = apiTokenDraft.trim();
    if (nextToken) localStorage.setItem(API_TOKEN_STORAGE_KEY, nextToken);
    else localStorage.removeItem(API_TOKEN_STORAGE_KEY);
    setApiToken(nextToken);
    setToast(nextToken ? "Chave de acesso salva neste navegador." : "Chave de acesso removida.");
  }

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phoneDigits = form.contact.replace(/\D/g, "");
    const selectedBrand = form.brand === "Outra (digitar)" ? brandOther.trim() : form.brand;
    if (!form.customerName.trim() || phoneDigits.length < 10 || !form.device || !selectedBrand) {
      setToast("Preencha nome, celular, onde vai assistir e marca.");
      return;
    }

    setSubmitting(true);
    const payload = {
      customerName: form.customerName.trim(),
      contact: form.contact.trim(),
      device: form.device,
      brand: selectedBrand,
    };

    if (API_BASE_URL) {
      try {
        const response = await apiRequest("/api/test-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.message || "O servidor não conseguiu iniciar o atendimento.");
        }
        const request: TestRequest = {
          id: result.id ?? makeId(),
          ...payload,
          status: result.status ?? (Array.isArray(result.accessDetails) && result.accessDetails.length > 0 || result.username || result.password || result.code ? "completed" : result.recommendedApp ? "awaiting_app" : "queued"),
          createdAt: result.createdAt ?? new Date().toISOString(),
          username: result.username,
          password: result.password,
          code: result.code,
          duration: result.duration,
          resultTitle: result.resultTitle,
          accessDetails: result.accessDetails,
          recommendedApp: result.recommendedApp,
          appGuideUrl: result.appGuideUrl,
          appInstalled: result.appInstalled,
          message: result.message,
        };
        setRequests((current) => [request, ...current]);
        setFlowRequest(request);
        setFlowStage(hasTestResult(request) ? "result" : request.recommendedApp ? "install" : "waiting");
        setToast(request.recommendedApp ? "Aplicativo recomendado recebido." : "Solicitação enviada para a automação.");
        setForm({ customerName: "", contact: "", device: "", brand: "" });
        setBrandOther("");
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Falha ao iniciar a solicitação.");
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
      message: "Rascunho local. Nenhum teste foi solicitado ou gerado porque o backend ainda não está conectado.",
    };
    setRequests((current) => [draft, ...current]);
    setSubmitting(false);
    setToast("Rascunho salvo neste navegador. Nenhum teste foi gerado.");
    setForm({ customerName: "", contact: "", device: "", brand: "" });
    setBrandOther("");
    setPage("history");
  }

  async function confirmAppInstalled(installed: boolean) {
    if (!API_BASE_URL || !flowRequest) {
      setToast("A confirmação será habilitada quando a automação estiver conectada.");
      return;
    }
    setConfirmingApp(true);
    try {
      const response = await apiRequest("/api/test-requests/" + encodeURIComponent(flowRequest.id) + "/app-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installed }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Não foi possível enviar a confirmação.");
      const updated: TestRequest = {
        ...flowRequest,
        ...result,
        appInstalled: installed,
        status: result.status ?? (Array.isArray(result.accessDetails) && result.accessDetails.length > 0 || result.username || result.password || result.code ? "completed" : installed ? "running" : "awaiting_app"),
      };
      setFlowRequest(updated);
      setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (hasTestResult(updated)) {
        setFlowStage("result");
        setToast("Teste recebido. Confira os dados de acesso.");
      } else if (installed) {
        setFlowStage("waiting");
        setToast("Confirmação enviada. Aguardando a geração do teste.");
      } else {
        setFlowStage("install");
        setToast(updated.message || "Instale o aplicativo recomendado e tente novamente.");
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao confirmar a instalação.");
    } finally {
      setConfirmingApp(false);
    }
  }

  async function refreshFlowRequest() {
    if (!API_BASE_URL || !flowRequest) {
      setToast("A atualização ficará disponível quando a automação estiver conectada.");
      return;
    }
    setRefreshingFlow(true);
    try {
      const response = await apiRequest("/api/test-requests/" + encodeURIComponent(flowRequest.id));
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Não foi possível consultar o andamento.");
      const updated: TestRequest = { ...flowRequest, ...result };
      setFlowRequest(updated);
      setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (hasTestResult(updated)) setFlowStage("result");
      else if (updated.recommendedApp && updated.appInstalled !== true) setFlowStage("install");
      else setFlowStage("waiting");
      setToast("Status atualizado.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao consultar o andamento.");
    } finally {
      setRefreshingFlow(false);
    }
  }

  async function copyValue(label: string, value?: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setToast(label + " copiado.");
    } catch {
      setToast("Não foi possível copiar neste dispositivo.");
    }
  }

  async function refreshHistory() {
    if (!API_BASE_URL) {
      setToast("Configure a API do backend para sincronizar o histórico.");
      return;
    }
    try {
      const response = await apiRequest("/api/test-requests");
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
      request.recommendedApp ? "Aplicativo: " + request.recommendedApp : "",
      ...getAccessDetails(request).map((detail) => detail.label + ": " + detail.value),
      request.duration ? "Duração: " + request.duration : "",
      request.message ? "Observação: " + request.message : "",
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
                {flowStage === "form" ? (
                  <form className="panel request-form" onSubmit={submitRequest}>
                    <div className="form-section-heading"><span className="step-number">01</span><div><h3>Dados do cliente</h3><p>Primeiro, informe quem receberá o teste.</p></div></div>
                    <div className="form-grid two-columns">
                      <label className="field"><span>Nome completo <small>OBRIGATÓRIO</small></span><input value={form.customerName} onChange={(event) => updateForm("customerName", event.target.value)} placeholder="Digite o nome do cliente" autoComplete="name" required /></label>
                      <label className="field"><span>WhatsApp com DDD <small>OBRIGATÓRIO</small></span><input type="tel" inputMode="tel" value={form.contact} onChange={(event) => updateForm("contact", formatPhone(event.target.value))} placeholder="(00) 00000-0000" autoComplete="tel" required /></label>
                    </div>
                    <div className="form-separator" />
                    <div className="form-section-heading"><span className="step-number">02</span><div><h3>Onde vai assistir?</h3><p>Escolha uma das opções apresentadas no atendimento FUTEX.</p></div></div>
                    <div className="device-grid">
                      {devices.map((device) => {
                        const Icon = device.icon;
                        return <button type="button" key={device.label} className={"device-option " + (form.device === device.label ? "selected" : "")} onClick={() => updateForm("device", device.label)}>
                          <span className="device-icon"><Icon size={20} /></span><strong>{device.label}</strong><small>{device.detail}</small>{form.device === device.label && <span className="selected-check"><Check size={12} /></span>}
                        </button>;
                      })}
                    </div>
                    <div className="form-separator" />
                    <div className="form-section-heading"><span className="step-number">03</span><div><h3>Qual é a marca?</h3><p>Selecione a marca do aparelho, como no bot da FUTEX.</p></div></div>
                    <div className="choice-chips">
                      {brands.map((brand) => <button type="button" key={brand} className={"choice-chip " + (form.brand === brand ? "selected" : "")} onClick={() => updateForm("brand", brand)}>{brand}{form.brand === brand && <Check size={13} />}</button>)}
                    </div>
                    {form.brand === "Outra (digitar)" && <label className="field brand-other-field"><span>Digite a marca <small>OBRIGATÓRIO</small></span><input value={brandOther} onChange={(event) => setBrandOther(event.target.value)} placeholder="Informe a marca do aparelho" /></label>}
                    <div className="form-actions"><span><LockKeyhole size={13} /> O teste só será solicitado após conectar o backend.</span><button className="primary-button" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={16} /> : <Zap size={16} />}{submitting ? "Enviando..." : API_BASE_URL ? "Iniciar atendimento" : "Salvar rascunho"}<ArrowRight size={15} /></button></div>
                  </form>
                ) : (
                  <section className="panel flow-state-panel">
                    {flowStage === "install" && flowRequest && (
                      <>
                        <div className="flow-state-heading"><span className="step-number">04</span><div><h3>Aplicativo recomendado</h3><p>Esta é a etapa de instalação mostrada pela FUTEX.</p></div><StatusPill status="awaiting_app" /></div>
                        <div className="app-recommendation-card"><span className="app-recommendation-icon"><Monitor size={24} /></span><div><small>APLICATIVO INDICADO</small><strong>{flowRequest.recommendedApp}</strong><p>Para {flowRequest.device} {flowRequest.brand}.</p></div></div>
                        {flowRequest.appGuideUrl && <a className="external-link guide-link" href={flowRequest.appGuideUrl} target="_blank" rel="noreferrer">Assistir ao tutorial de instalação <ArrowUpRight size={14} /></a>}
                        {flowRequest.message && <p className="detail-message">{flowRequest.message}</p>}
                        <div className="flow-question"><strong>Conseguiu instalar o {flowRequest.recommendedApp}?</strong><p>Confirme para que a automação continue o atendimento.</p></div>
                        <div className="flow-action-row"><button className="secondary-button" type="button" onClick={() => void confirmAppInstalled(false)} disabled={confirmingApp}>{confirmingApp ? <LoaderCircle className="spin" size={15} /> : <X size={15} />} Não consegui</button><button className="primary-button" type="button" onClick={() => void confirmAppInstalled(true)} disabled={confirmingApp}>{confirmingApp ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Sim, consegui</button></div>
                      </>
                    )}
                    {flowStage === "waiting" && flowRequest && (
                      <>
                        <div className="flow-state-heading"><span className="step-number">04</span><div><h3>Solicitação em andamento</h3><p>Os dados foram enviados ao serviço de automação.</p></div><StatusPill status={flowRequest.status} /></div>
                        <div className="waiting-state"><span className="waiting-state-icon"><LoaderCircle size={25} className="spin" /></span><strong>{flowRequest.status === "needs_human" ? "Ação manual necessária" : "Aguardando resposta da FUTEX"}</strong><p>{flowRequest.message || "Quando a FUTEX indicar o aplicativo ou retornar os dados do teste, eles aparecerão aqui."}</p></div>
                        <div className="flow-wait-actions"><button className="secondary-button" type="button" onClick={() => void refreshFlowRequest()} disabled={refreshingFlow}>{refreshingFlow ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Atualizar status</button><button className="back-button" type="button" onClick={() => { setFlowStage("form"); setFlowRequest(null); }}>Voltar ao formulário</button></div>
                      </>
                    )}
                    {flowStage === "result" && flowRequest && (
                      <>
                        <div className="flow-state-heading"><span className="step-number">05</span><div><h3>{flowRequest.resultTitle || "Teste gerado com sucesso"}</h3><p>Confira os dados retornados pela FUTEX para este dispositivo.</p></div><StatusPill status="completed" /></div>
                        <div className="success-duration"><CheckCircle2 size={19} /><div><strong>Teste ativo</strong><span>{flowRequest.duration || "6 horas"} de duração</span></div></div>
                        {flowRequest.recommendedApp && <div className="result-app-label">Aplicativo: <strong>{flowRequest.recommendedApp}</strong></div>}
                        <div className="credential-grid">
                          {getAccessDetails(flowRequest).map((detail, index) => <div className="credential-card" key={detail.label + "-" + index}><span>{detail.label}</span><strong>{detail.value}</strong><button type="button" onClick={() => void copyValue(detail.label, detail.value)}><Copy size={13} /> Copiar</button></div>)}
                        </div>
                        {getAccessDetails(flowRequest).length > 0 && <button className="primary-button copy-all-button" type="button" onClick={() => void copyResult(flowRequest)}><Copy size={15} /> Copiar todos os dados</button>}
                        <div className="result-note"><Clock3 size={16} /><p>Para efetuar o pagamento, aguarde pelo menos <strong>2 horas</strong> após o início do teste. Se precisar assinar depois do teste, volte ao site onde iniciou o atendimento.</p></div>
                        <button className="back-button" type="button" onClick={() => { setFlowStage("form"); setFlowRequest(null); setPage("history"); }}>Concluir e abrir histórico</button>
                      </>
                    )}
                  </section>
                )}

                <aside className="new-test-aside">
                  <div className="panel summary-card"><div className="summary-top"><span className="summary-icon"><Sparkles size={17} /></span><span>RESUMO</span></div><h3>Dados do atendimento</h3><p>Informações que serão enviadas ao fluxo automatizado.</p><div className="summary-items"><div><span>Cliente</span><strong>{form.customerName || flowRequest?.customerName || "Não informado"}</strong></div><div><span>WhatsApp</span><strong>{form.contact || flowRequest?.contact || "Não informado"}</strong></div><div><span>Onde vai assistir</span><strong>{form.device || flowRequest?.device || "Não selecionado"}</strong></div><div><span>Marca</span><strong>{(form.brand === "Outra (digitar)" ? brandOther : form.brand) || flowRequest?.brand || "Não selecionada"}</strong></div></div><div className="summary-foot"><ShieldCheck size={15} /><span>Credenciais só serão mostradas quando forem retornadas pelo serviço real.</span></div></div>
                  <div className="info-card"><div className="info-card-icon"><CircleHelp size={18} /></div><div><strong>Fluxo confirmado</strong><p>Nome, WhatsApp, dispositivo, marca, recomendação do aplicativo e confirmação de instalação antes da geração do teste.</p></div></div>
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
              {selectedRequest && <section className="panel detail-panel"><div className="panel-heading"><div><h3>Detalhes da solicitação</h3><p>{selectedRequest.id}</p></div><button className="icon-button" onClick={() => setSelectedRequest(null)} aria-label="Fechar detalhes"><X size={17} /></button></div><div className="detail-grid"><div><span>Cliente</span><strong>{selectedRequest.customerName || "Não informado"}</strong></div><div><span>Contato</span><strong>{selectedRequest.contact || "Não informado"}</strong></div><div><span>Dispositivo</span><strong>{selectedRequest.device}</strong></div><div><span>Marca</span><strong>{selectedRequest.brand}</strong></div><div><span>Status</span><StatusPill status={selectedRequest.status} /></div></div>{selectedRequest.message && <p className="detail-message">{selectedRequest.message}</p>}{(hasTestResult(selectedRequest) || selectedRequest.recommendedApp) && <div className="result-box"><div><strong>{selectedRequest.resultTitle || "Dados retornados pelo serviço"}</strong><button className="text-button" onClick={() => void copyResult(selectedRequest)}><Copy size={14} /> Copiar</button></div>{selectedRequest.recommendedApp && <p>Aplicativo: <b>{selectedRequest.recommendedApp}</b></p>}{getAccessDetails(selectedRequest).map((detail, index) => <p key={detail.label + "-" + index}>{detail.label}: <b>{detail.value}</b></p>)}{selectedRequest.duration && <p>Duração: <b>{selectedRequest.duration}</b></p>}{selectedRequest.status === "completed" && <p>Orientação: aguarde pelo menos <b>2 horas</b> após o início do teste antes de efetuar pagamento.</p>}</div>}</section>}
            </section>
          )}

          {page === "settings" && (
            <section className="page-section">
              <div className="page-heading"><div><div className="eyebrow"><Settings2 size={13} /> PREFERÊNCIAS</div><h1>Configurações</h1><p>Gerencie as conexões e os parâmetros do aplicativo.</p></div></div>
              <div className="settings-layout">
                <section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><RadioTower size={19} /></span><div><h3>Integração de automação</h3><p>Conexão entre o aplicativo e o serviço que processa as solicitações.</p></div><span className={"config-value " + (API_BASE_URL ? "configured" : "pending")}>{API_BASE_URL ? "Conectado" : "Pendente"}</span></div><div className="settings-row"><div><strong>API do backend</strong><small>Endereço público do serviço de solicitações.</small></div><span className={"config-value " + (API_BASE_URL ? "configured" : "")}>{API_BASE_URL ? "Configurada" : "Não configurada"}</span></div><div className="api-token-config"><label className="field"><span>Chave de acesso do worker <small>API_TOKEN</small></span><input type="password" value={apiTokenDraft} onChange={(event) => setApiTokenDraft(event.target.value)} placeholder="Cole aqui a chave configurada no servidor" autoComplete="off" /></label><button className="secondary-button" type="button" onClick={saveApiToken}><Check size={14} /> Salvar chave</button><p>A chave fica salva apenas neste navegador. Use esta configuração somente em um painel privado de administrador.</p></div><div className="settings-row"><div><strong>Worker de automação</strong><small>Processador Playwright executado no servidor.</small></div><span className="config-value pending">Pendente</span></div><div className="settings-row"><div><strong>Site de referência</strong><small>Portal utilizado pelo fluxo de testes.</small></div><a className="external-link" href="https://futex.com.br/teste/" target="_blank" rel="noreferrer">Abrir FUTEX <ArrowUpRight size={13} /></a></div><div className="settings-callout"><LockKeyhole size={16} /><p>Tokens, senhas de acesso e cookies de sessão devem ser configurados no ambiente seguro do worker. Nunca os coloque no código do navegador.</p></div></section>
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
