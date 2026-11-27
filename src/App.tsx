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
  Copy,
  FileClock,
  Gauge,
  History,
  LayoutDashboard,
  Smartphone,
  Tablet,
  Laptop,
  Gamepad2,
  Box,
  LifeBuoy,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Monitor,
  MoreHorizontal,
  Plus,
  RadioTower,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
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

const DEVICE_OPTIONS = [
  { value: "Smart TV", detail: "Samsung, LG e outras", icon: Tv },
  { value: "Android TV", detail: "TV com Android", icon: Monitor },
  { value: "Roku TV", detail: "Sistema Roku", icon: Tv },
  { value: "TV Box", detail: "Box Android", icon: Box },
  { value: "Celular Android", detail: "Smartphone Android", icon: Smartphone },
  { value: "iPhone / iPad", detail: "Apple iOS / iPadOS", icon: Tablet },
  { value: "Computador", detail: "PC ou notebook", icon: Laptop },
  { value: "Fire Stick", detail: "Amazon Fire TV", icon: RadioTower },
  { value: "Xbox", detail: "Console Xbox", icon: Gamepad2 },
  { value: "XCIPTV", detail: "Aplicativo XCIPTV", icon: Monitor },
  { value: "IPTV Smarters", detail: "Smarters Player", icon: Monitor },
  { value: "Lista M3U", detail: "Player compatível", icon: FileClock },
  { value: "SS IPTV", detail: "Aplicativo SS IPTV", icon: Monitor },
  { value: "Duplecast", detail: "Aplicativo Duplecast", icon: Monitor },
] as const;

const BRAND_OPTIONS = ["Samsung", "LG", "TCL", "Sony", "Philips", "Panasonic", "Philco", "AOC", "Roku", "Outra"];

function FlowMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="flow-mark-gradient" x1="7" y1="7" x2="42" y2="41" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C04DFF" />
          <stop offset=".52" stopColor="#853BFF" />
          <stop offset="1" stopColor="#00B9F2" />
        </linearGradient>
      </defs>
      <path d="M15.1 5.9 38.2 19.2c4.2 2.4 4.2 7.2 0 9.6L15.1 42.1C10.8 44.6 6 42.1 6 37.2V10.8c0-4.9 4.8-7.4 9.1-4.9Z" fill="url(#flow-mark-gradient)" />
      <path d="m19 16.2 12.4 7.1c.7.4.7 1.1 0 1.5L19 31.9c-.8.5-1.7 0-1.7-.9V17.1c0-.9.9-1.4 1.7-.9Z" fill="#120D20" />
      <path d="M12 7.4c-2.5 1.2-3.7 3.2-3.7 6v21.2c0 3.1 1.6 5.2 4.1 6" stroke="#E8D9FF" strokeOpacity=".35" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? "(" + digits : "";
  if (digits.length <= 7) return "(" + digits.slice(0, 2) + ") " + digits.slice(2);
  return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 7) + "-" + digits.slice(7);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [adminUsername, setAdminUsername] = useState("admin");
  const [loginUsername, setLoginUsername] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TestRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingApp, setConfirmingApp] = useState(false);
  const [refreshingFlow, setRefreshingFlow] = useState(false);
  const [workerHealth, setWorkerHealth] = useState<"checking" | "online" | "offline">("checking");
  const [workerAutomationEnabled, setWorkerAutomationEnabled] = useState(false);
  const [diagnosingFutex, setDiagnosingFutex] = useState(false);
  const [futexDiagnostic, setFutexDiagnostic] = useState("");
  const [flowRequest, setFlowRequest] = useState<TestRequest | null>(null);
  const [flowStage, setFlowStage] = useState<"form" | "install" | "waiting" | "result">("form");
  const [form, setForm] = useState({ customerName: "", contact: "", device: "", brand: "", brandOther: "" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sessão ausente.");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setAdminUsername(data.user?.username || "admin");
        setAuthState("authenticated");
      })
      .catch(() => {
        if (!cancelled) setAuthState("unauthenticated");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (authState !== "authenticated") return;
    void checkWorkerHealth(true);
    void refreshHistory(true);
    const interval = window.setInterval(() => { void checkWorkerHealth(true); }, 30_000);
    return () => window.clearInterval(interval);
  }, [authState]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const stats = useMemo(() => ({
    total: requests.length,
    queued: requests.filter((item) => item.status === "queued" || item.status === "running" || item.status === "draft" || item.status === "awaiting_app").length,
    completed: requests.filter((item) => item.status === "completed").length,
    failed: requests.filter((item) => item.status === "failed").length,
  }), [requests]);

  const automationReady = workerHealth === "online" && workerAutomationEnabled;

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
    if (nextPage === "new") { setFlowStage("form"); setFlowRequest(null); }
    setPage(nextPage);
    setMobileMenuOpen(false);
    setSelectedRequest(null);
  }

  function apiRequest(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const requestUrl = new URL(API_BASE_URL, window.location.origin);
    requestUrl.searchParams.set("path", path);
    return fetch(requestUrl.toString(), {
      ...options,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    }).then((response) => {
      if (response.status === 401) {
        setAuthState("unauthenticated");
        setLoginPassword("");
      }
      return response;
    });
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginSubmitting) return;
    setLoginSubmitting(true);
    setLoginError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Não foi possível autenticar.");
      setAdminUsername(result.user?.username || loginUsername.trim() || "admin");
      setLoginPassword("");
      setAuthState("authenticated");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Falha ao entrar. Tente novamente.");
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
    } finally {
      setRequests([]);
      setSelectedRequest(null);
      setFlowRequest(null);
      setLoginPassword("");
      setLoginError("");
      setAuthState("unauthenticated");
    }
  }

  async function checkWorkerHealth(silent = false) {
    try {
      const response = await apiRequest("/api/health");
      const health = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(health.message || "Worker indisponível.");
      setWorkerHealth("online");
      setWorkerAutomationEnabled(health.automationEnabled === true);
      if (!silent) setToast("Conexão com o worker verificada.");
    } catch (error) {
      setWorkerHealth("offline");
      setWorkerAutomationEnabled(false);
      if (!silent) setToast(error instanceof Error ? error.message : "Não foi possível conectar ao worker.");
    }
  }

  async function runFutexDiagnostic() {
    setDiagnosingFutex(true);
    setFutexDiagnostic("");
    try {
      const response = await apiRequest("/api/diagnostics/futex");
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Não foi possível diagnosticar a FUTEX.");
      setFutexDiagnostic(JSON.stringify(result, null, 2));
      setToast("Diagnóstico da FUTEX concluído.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha no diagnóstico da FUTEX.");
    } finally {
      setDiagnosingFutex(false);
    }
  }


  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => {
      if (field === "device") {
        const isAppleDevice = value === "iPhone / iPad";
        return {
          ...current,
          device: value,
          brand: isAppleDevice ? "Apple" : current.brand === "Apple" ? "" : current.brand,
          brandOther: isAppleDevice ? "" : current.brandOther,
        };
      }

      return {
        ...current,
        [field]: field === "contact" ? formatPhone(value) : value,
      };
    });
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const customerName = form.customerName.trim();
    const contact = form.contact.trim();
    const phoneDigits = contact.replace(/\D/g, "");
    const device = form.device;
    const isAppleDevice = device === "iPhone / iPad";
    const brand = isAppleDevice ? "Apple" : form.brand === "Outra" ? form.brandOther.trim() : form.brand;

    if (customerName.length < 2) { setToast("Informe seu nome para continuar."); return; }
    if (phoneDigits.length < 10 || phoneDigits.length > 11) { setToast("Informe um WhatsApp válido com DDD."); return; }
    if (!device) { setToast("Selecione onde você vai assistir."); return; }
    if (!isAppleDevice && !brand) { setToast("Selecione a marca do aparelho."); return; }
    if (!automationReady) {
      setToast(workerHealth === "offline" ? "Worker offline. Verifique o servidor de automação." : "A automação ainda não está ativa no servidor.");
      return;
    }
    if (!API_BASE_URL) { setToast("Configure a conexão com o worker para gerar o teste."); return; }

    setSubmitting(true);
    try {
      const response = await apiRequest("/api/test-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, contact, device, brand }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Não foi possível iniciar a geração do teste.");
      const request: TestRequest = {
        id: result.id ?? makeId(),
        customerName, contact, device, brand,
        status: result.status || "queued",
        createdAt: result.createdAt || new Date().toISOString(),
        message: result.message || "Solicitação recebida. Conectando ao sistema FUTEX.",
      };
      setRequests((current) => [request, ...current]);
      setFlowRequest(request);
      setFlowStage("waiting");
      setToast("Solicitação enviada. O IPTV Flow está processando seu teste.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao iniciar a solicitação.");
    } finally {
      setSubmitting(false);
    }
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
      } else if (updated.status === "awaiting_app") {
        setFlowStage("install");
        setToast(updated.message || "Confira a orientação atualizada da FUTEX.");
      } else {
        setFlowStage("waiting");
        setToast(installed ? "Confirmação enviada. Aguardando a geração do teste." : "A FUTEX está atualizando as orientações. Aguarde.");
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao confirmar a instalação.");
    } finally {
      setConfirmingApp(false);
    }
  }

  async function refreshFlowRequest(silent = false) {
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
      else if (updated.status === "awaiting_app" && updated.recommendedApp && updated.appInstalled !== true) setFlowStage("install");
      else setFlowStage("waiting");
      if (!silent) setToast("Status atualizado.");
    } catch (error) {
      if (!silent) setToast(error instanceof Error ? error.message : "Falha ao consultar o andamento.");
    } finally {
      setRefreshingFlow(false);
    }
  }

  useEffect(() => {
    if (!API_BASE_URL || !flowRequest || !["waiting", "install"].includes(flowStage) || !["queued", "running", "awaiting_app"].includes(flowRequest.status)) return;
    const interval = window.setInterval(() => { void refreshFlowRequest(true); }, 5_000);
    return () => window.clearInterval(interval);
  }, [flowRequest?.id, flowRequest?.status, flowStage]);

  async function copyValue(label: string, value?: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setToast(label + " copiado.");
    } catch {
      setToast("Não foi possível copiar neste dispositivo.");
    }
  }

  async function refreshHistory(silent = false) {
    try {
      const response = await apiRequest("/api/test-requests");
      if (!response.ok) throw new Error("Não foi possível atualizar o histórico.");
      const data = await response.json();
      const items = Array.isArray(data) ? data : data.items;
      if (Array.isArray(items)) {
        setRequests((current) => {
          const serverItems = items as TestRequest[];
          const serverIds = new Set(serverItems.map((item) => item.id));
          const localDrafts = current.filter((item) => item.status === "draft" && !serverIds.has(item.id));
          return [...serverItems, ...localDrafts];
        });
      }
      if (!silent) setToast("Histórico atualizado.");
    } catch (error) {
      if (!silent) setToast(error instanceof Error ? error.message : "Erro ao atualizar histórico.");
    }
  }

  function resumeRequest(request: TestRequest) {
    setFlowRequest(request);
    setFlowStage(hasTestResult(request) ? "result" : request.status === "awaiting_app" ? "install" : "waiting");
    setSelectedRequest(null);
    setPage("new");
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

  if (authState === "checking") {
    return (
      <div className="auth-screen auth-loading-screen">
        <div className="auth-loading-card">
          <div className="auth-logo"><FlowMark size={35} /></div>
          <LoaderCircle className="spin" size={20} />
          <span>Verificando sessão segura...</span>
        </div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <div className="auth-screen">
        <div className="auth-grid" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
        <div className="auth-layout">
          <section className="auth-intro">
            <div className="auth-brand">
              <div className="auth-logo"><FlowMark size={35} /></div>
              <div><strong>IPTV<span>Flow</span></strong><small>SMART TEST EXPERIENCE</small></div>
              <span className="auth-brand-status"><i /> SISTEMA ONLINE</span>
            </div>
            <div className="auth-intro-copy">
              <div className="auth-eyebrow"><ShieldCheck size={14} /> CENTRAL ADMINISTRATIVA</div>
              <h1>Seu controle.<br /><em>Seu acesso.</em></h1>
              <p>Um ambiente reservado para administrar a operação do IPTV Flow com autenticação protegida e acesso controlado.</p>
            </div>
            <div className="auth-feature-list">
              <div><span><LockKeyhole size={16} /></span><div><strong>Acesso restrito</strong><small>Somente credenciais administrativas autorizadas.</small></div></div>
              <div><span><ShieldCheck size={16} /></span><div><strong>Sessão protegida</strong><small>Cookie seguro, sem senha salva no dispositivo.</small></div></div>
              <div><span><Activity size={16} /></span><div><strong>Operação isolada</strong><small>As chaves internas permanecem no servidor.</small></div></div>
            </div>
            <div className="auth-footer-note"><span /> IPTV FLOW <i /> ADMIN CONTROL CENTER</div>
          </section>

          <section className="auth-card-wrap">
            <form className="auth-card" onSubmit={handleLogin}>
              <div className="auth-card-heading">
                <div className="auth-card-icon"><LockKeyhole size={20} /></div>
                <span className="auth-card-label">LOGIN SEGURO</span>
              </div>
              <h2>Acesso administrativo</h2>
              <p className="auth-card-description">Entre com suas credenciais para continuar.</p>

              <label className="auth-field">
                <span>Usuário</span>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(event) => setLoginUsername(event.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={64}
                  required
                />
              </label>
              <label className="auth-field">
                <span>Senha de acesso</span>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="Digite sua senha administrativa"
                  autoComplete="current-password"
                  maxLength={256}
                  required
                />
              </label>

              {loginError && <div className="auth-error" role="alert"><X size={15} /> {loginError}</div>}

              <button className="auth-submit" type="submit" disabled={loginSubmitting || !loginUsername.trim() || !loginPassword}>
                {loginSubmitting ? <LoaderCircle className="spin" size={17} /> : <span>Entrar no painel <ArrowRight size={16} /></span>}
              </button>

              <div className="auth-security-note"><ShieldCheck size={15} /><span>Conexão protegida. A sessão expira automaticamente.</span></div>
            </form>
            <div className="auth-card-bottom"><LockKeyhole size={12} /> ÁREA EXCLUSIVA PARA ADMINISTRADORES</div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell cyber-shell" data-page={page} data-worker-state={workerHealth}>
      <aside className={"sidebar " + (mobileMenuOpen ? "sidebar-open" : "")}>
        <div className="brand-lockup">
          <div className="brand-mark"><FlowMark size={31} /></div>
          <div>
            <strong>IPTV<span>Flow</span></strong>
            <small>SMART TEST EXPERIENCE</small>
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
            <div className="profile-copy"><strong>{adminUsername}</strong><small>Administrador autenticado</small></div>
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
            <div className={"connection-indicator " + (automationReady ? "connected" : "disconnected")} role="status" aria-live="polite">
              <i />{workerHealth === "checking" ? "Verificando worker" : workerHealth === "offline" ? "Worker offline" : automationReady ? "Automação ativa" : "Automação pausada"}
            </div>
            <button className="icon-button notification-button" onClick={() => setToast("Você está em dia. Nenhuma notificação nova.")} aria-label="Notificações">
              <Bell size={18} /><i />
            </button>
            <button className="icon-button auth-logout-button" onClick={() => void handleLogout()} aria-label="Sair da conta" title="Sair">
              <LogOut size={17} />
            </button>
            <div className="topbar-avatar">AD</div>
          </div>
        </header>

        <div className="page-content">
          {page === "overview" && (
            <section className="page-section">
              <div className="page-heading">
                <div><div className="eyebrow"><Sparkles size={13} /> CENTRAL DE OPERAÇÕES</div><h1>Visão geral</h1><p>Gere, acompanhe e organize seus testes em uma experiência simples.</p></div>
                <button className="primary-button" onClick={() => navigate("new")}><Plus size={17} /> Novo teste</button>
              </div>

              <div className="hero-panel">
                <div className="hero-copy">
                  <div className="hero-tag"><span /> PAINEL DE CONTROLE</div>
                  <h2>Seu teste IPTV,<br /><em>sem complicação.</em></h2>
                  <p>Informe os dados uma única vez. O IPTV Flow utiliza o sistema FUTEX em segundo plano e organiza o resultado para você.</p>
                  <button className="hero-button" onClick={() => navigate("new")}>Gerar meu teste <ArrowRight size={16} /></button>
                </div>
                <div className="hero-visual" aria-hidden="true">
                  <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
                  <div className="hero-core"><FlowMark size={54} /></div>
                  <div className="floating-chip chip-top"><Activity size={14} /> FUTEX em segundo plano</div>
                  <div className="floating-chip chip-bottom"><ShieldCheck size={14} /> Dados prontos para copiar</div>
                  <div className="hero-glow" />
                </div>
              </div>

              <div className="section-title-row"><div><h3>Indicadores</h3><p>Resumo dos testes realizados pelo IPTV Flow</p></div><span className="period-label"><Clock3 size={13} /> Desde o início</span></div>
              <div className="stats-grid">
                <article className="stat-card"><div className="stat-top"><span className="stat-icon violet"><FileClock size={18} /></span><span className="stat-trend neutral">Total</span></div><strong>{stats.total}</strong><p>Solicitações registradas</p><div className="stat-foot"><span className="stat-line violet-line" /><small>Todos os registros locais</small></div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon amber"><Clock3 size={18} /></span><span className="stat-trend neutral">Fila</span></div><strong>{stats.queued}</strong><p>Aguardando processamento</p><div className="stat-foot"><span className="stat-line amber-line" /><small>Inclui rascunhos locais</small></div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon green"><CheckCircle2 size={18} /></span><span className="stat-trend positive">Real</span></div><strong>{stats.completed}</strong><p>Testes concluídos</p><div className="stat-foot"><span className="stat-line green-line" /><small>Confirmados pelo backend</small></div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon red"><Activity size={18} /></span><span className="stat-trend neutral">Atenção</span></div><strong>{stats.failed}</strong><p>Solicitações com falha</p><div className="stat-foot"><span className="stat-line red-line" /><small>Requerem análise</small></div></article>
              </div>

              <div className="dashboard-grid">
                <section className="panel recent-panel">
                  <div className="panel-heading"><div><h3>Atividade recente</h3><p>Seus testes mais recentes</p></div><button className="text-button" onClick={() => navigate("history")}>Ver histórico <ArrowRight size={14} /></button></div>
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
                    <div className={"service-pulse " + (workerHealth === "online" ? "is-on" : "")}><RadioTower size={21} /></div>
                    <div><strong>{workerHealth === "checking" ? "Verificando conexão" : workerHealth === "offline" ? "Worker indisponível" : automationReady ? "Automação ativa" : "Worker conectado, automação pausada"}</strong><small>{workerHealth === "online" ? "Servidor de automação respondeu ao health check" : "Verifique a URL do worker e as variáveis do servidor"}</small></div>
                  </div>
                  <div className="service-divider" />
                  <div className="service-detail"><span><i className="detail-dot green-dot" /> Interface web</span><strong>Operacional</strong></div>
                  <div className="service-detail"><span><i className={"detail-dot " + (workerHealth === "online" ? "green-dot" : "amber-dot")} /> API de solicitações</span><strong>{workerHealth === "online" ? "Online" : "Offline"}</strong></div>
                  <div className="service-detail"><span><i className={"detail-dot " + (automationReady ? "green-dot" : "amber-dot")} /> Worker FUTEX</span><strong>{automationReady ? "Ativo" : workerHealth === "online" ? "Pausado" : "Indisponível"}</strong></div>
                  <div className="service-note"><LockKeyhole size={14} /><span>Credenciais e dados sensíveis devem ficar somente no servidor.</span></div>
                </section>
              </div>
              <div className="footer-note"><ShieldCheck size={14} /> {automationReady ? "Worker conectado. Solicitações serão processadas pelo atendimento FUTEX." : "A automação só aceitará solicitações quando o worker estiver online e habilitado."}</div>
            </section>
          )}

          {page === "new" && (
            <section className="page-section">
              <div className="page-heading">
                <div><div className="eyebrow"><Zap size={13} /> NOVO TESTE</div><h1>Gerar teste</h1><p>Preencha os dados abaixo e receba o resultado aqui mesmo.</p></div>
                <button className="back-button" onClick={() => navigate("overview")}>Voltar ao painel</button>
              </div>
              <div className="new-test-layout">
                {flowStage === "form" ? (
                  <section className="panel request-form flow-form-panel">
                    <form onSubmit={submitRequest}>
                      <div className="form-section-heading"><span className="step-number">01</span><div><h3>Seus dados</h3><p>Precisamos dessas informações para solicitar seu teste.</p></div></div>
                      <div className="form-grid two-columns">
                        <label className="field"><span>Nome completo</span><input value={form.customerName} onChange={(event) => updateForm("customerName", event.target.value)} placeholder="Como podemos te chamar?" autoComplete="name" maxLength={100} required /></label>
                        <label className="field"><span>WhatsApp com DDD</span><input type="tel" inputMode="tel" value={form.contact} onChange={(event) => updateForm("contact", event.target.value)} placeholder="(11) 99999-9999" autoComplete="tel" maxLength={16} required /></label>
                      </div>
                      <div className="form-separator" />
                      <div className="form-section-heading"><span className="step-number">02</span><div><h3>Onde você vai assistir?</h3><p>Escolha o aparelho ou aplicativo que pretende utilizar.</p></div></div>
                      <div className="device-grid flow-device-grid">
                        {DEVICE_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          return <button type="button" key={option.value} className={"device-option " + (form.device === option.value ? "selected" : "")} onClick={() => updateForm("device", option.value)} aria-pressed={form.device === option.value}>
                            <span className="device-icon"><Icon size={18} /></span>
                            <strong>{option.value}</strong>
                            <small>{option.detail}</small>
                            {form.device === option.value && <span className="selected-check"><Check size={11} /></span>}
                          </button>;
                        })}
                      </div>
                      {form.device !== "iPhone / iPad" && <>
                        <div className="form-separator" />
                        <div className="form-section-heading"><span className="step-number">03</span><div><h3>Marca do aparelho</h3><p>Selecione a marca para receber a indicação correta.</p></div></div>
                        <div className="brand-grid">
                          {BRAND_OPTIONS.map((brand) => <button type="button" key={brand} className={"brand-option " + (form.brand === brand ? "selected" : "")} onClick={() => { updateForm("brand", brand); if (brand !== "Outra") updateForm("brandOther", ""); }} aria-pressed={form.brand === brand}>
                            {brand === "Outra" ? <Plus size={14} /> : <span className="brand-option-dot" />}
                            {brand}
                            {form.brand === brand && <Check size={13} />}
                          </button>)}
                        </div>
                        {form.brand === "Outra" && <label className="field other-brand-field"><span>Digite a marca</span><input value={form.brandOther} onChange={(event) => updateForm("brandOther", event.target.value)} placeholder="Ex.: Hisense, Toshiba..." maxLength={60} required /></label>}
                      </>}
                      <div className="form-submit-footer">
                        <div className="form-trust-note"><ShieldCheck size={16} /><span><strong>Seus dados protegidos</strong><small>O teste é solicitado diretamente ao sistema FUTEX.</small></span></div>
                        <button className="primary-button generate-button" type="submit" disabled={submitting || !automationReady}>
                          {submitting ? <LoaderCircle className="spin" size={17} /> : <Zap size={17} />}
                          {submitting ? "Enviando solicitação..." : "Gerar teste grátis"}
                          {!submitting && <ArrowRight size={16} />}
                        </button>
                      </div>
                      {!automationReady && <p className="form-availability-note">{workerHealth === "checking" ? "Verificando conexão com o serviço..." : workerHealth === "offline" ? "Serviço temporariamente indisponível. Tente novamente mais tarde." : "A geração será liberada quando a integração estiver ativa."}</p>}
                    </form>
                  </section>
                ) : (
                  <section className="panel flow-state-panel">
                    {flowStage === "install" && flowRequest && (
                      <>
                        <div className="flow-state-heading"><span className="step-number">04</span><div><h3>Aplicativo recomendado</h3><p>Esta é a etapa de instalação mostrada pela FUTEX.</p></div><StatusPill status="awaiting_app" /></div>
                        <div className="app-recommendation-card"><span className="app-recommendation-icon"><Monitor size={24} /></span><div><small>APLICATIVO INDICADO</small><strong>{flowRequest.recommendedApp}</strong><p>Para {flowRequest.device}{flowRequest.device === "iPhone / iPad" ? "" : " " + flowRequest.brand}.</p></div></div>
                        <p className="detail-message">Instale o aplicativo recomendado no aparelho. Você não precisa abrir o site FUTEX: continue o atendimento por aqui.</p>
                        {flowRequest.message && <p className="detail-message">{flowRequest.message}</p>}
                        <div className="flow-question"><strong>Conseguiu instalar o {flowRequest.recommendedApp}?</strong><p>Responda aqui no IPTV Flow. A automação continuará no servidor, sem abrir o site FUTEX no seu celular.</p></div>
                        <div className="flow-action-row"><button className="secondary-button" type="button" onClick={() => void confirmAppInstalled(false)} disabled={confirmingApp}>{confirmingApp ? <LoaderCircle className="spin" size={15} /> : <X size={15} />} Não consegui</button><button className="primary-button" type="button" onClick={() => void confirmAppInstalled(true)} disabled={confirmingApp}>{confirmingApp ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Sim, consegui</button></div>
                      </>
                    )}
                    {flowStage === "waiting" && flowRequest && (
                      <>
                        <div className="flow-state-heading"><span className="step-number">04</span><div><h3>Solicitação em andamento</h3><p>Os dados foram enviados ao serviço de automação.</p></div><StatusPill status={flowRequest.status} /></div>
                        <div className="waiting-state"><span className="waiting-state-icon"><LoaderCircle size={25} className="spin" /></span><strong>{flowRequest.status === "needs_human" ? "Ação manual necessária" : flowRequest.status === "failed" ? "Não foi possível concluir" : "Aguardando resposta da FUTEX"}</strong><p>{flowRequest.message || "Quando a FUTEX indicar o aplicativo ou retornar os dados do teste, eles aparecerão aqui."}</p></div>
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
                        <div className="result-note"><Clock3 size={16} /><p>Seu teste foi gerado pelo sistema FUTEX. Copie as credenciais e informe no aplicativo indicado. Tudo fica organizado no histórico do IPTV Flow.</p></div>
                        <button className="back-button" type="button" onClick={() => { setFlowStage("form"); setFlowRequest(null); setPage("history"); }}>Concluir e abrir histórico</button>
                      </>
                    )}
                  </section>
                )}

                <aside className="new-test-aside">
                  <div className="panel summary-card"><div className="summary-top"><span className="summary-icon"><Sparkles size={17} /></span><span>RESUMO</span></div><h3>Teste grátis de 6 horas</h3><p>Uma experiência simples, com a tecnologia original da FUTEX trabalhando em segundo plano.</p><div className="summary-items"><div><span>Etapa 01</span><strong>Seus dados</strong></div><div><span>Etapa 02</span><strong>Processamento FUTEX</strong></div><div><span>Etapa 03</span><strong>Credenciais na tela</strong></div></div><div className="summary-foot"><ShieldCheck size={15} /><span>Você não precisa abrir o site da FUTEX. O resultado aparece aqui no IPTV Flow.</span></div></div>
                  <div className="info-card"><div className="info-card-icon"><CircleHelp size={18} /></div><div><strong>Como funciona</strong><p>Você preenche o formulário do IPTV Flow. Nosso serviço envia os dados ao atendimento original da FUTEX, acompanha a geração e traz as credenciais para esta tela.</p></div></div>
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
                <div className="history-toolbar"><div className="search-box"><Search size={17} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar por cliente, aparelho ou marca..." /></div><button className="filter-button" onClick={() => void refreshHistory()}><RefreshCw size={15} /> Atualizar</button></div>
                {filteredRequests.length === 0 ? <div className="empty-state history-empty"><div className="empty-icon"><Search size={22} /></div><strong>{requests.length ? "Nenhum resultado encontrado" : "Seu histórico está vazio"}</strong><p>{requests.length ? "Tente buscar por outro termo." : "As solicitações criadas aparecerão aqui."}</p>{!requests.length && <button className="secondary-button" onClick={() => navigate("new")}><Plus size={15} /> Criar solicitação</button>}</div> : (
                  <div className="table-wrap"><table><thead><tr><th>CLIENTE / ID</th><th>DISPOSITIVO</th><th>CELULAR</th><th>DATA</th><th>STATUS</th><th /></tr></thead><tbody>
                    {filteredRequests.map((request) => <tr key={request.id} onClick={() => setSelectedRequest(request)} className="clickable-row"><td><strong>{request.customerName || "Sem identificação"}</strong><small>{request.id.slice(0, 13)}</small></td><td>{request.brand} · {request.device}</td><td>{request.contact}</td><td>{formatDate(request.createdAt)}</td><td><StatusPill status={request.status} /></td><td><button className="row-more" aria-label="Ver detalhes"><ChevronRight size={16} /></button></td></tr>)}
                  </tbody></table></div>
                )}
              </section>
              {selectedRequest && <section className="panel detail-panel"><div className="panel-heading"><div><h3>Detalhes da solicitação</h3><p>{selectedRequest.id}</p></div><button className="icon-button" onClick={() => setSelectedRequest(null)} aria-label="Fechar detalhes"><X size={17} /></button></div><div className="detail-grid"><div><span>Cliente</span><strong>{selectedRequest.customerName || "Não informado"}</strong></div><div><span>Contato</span><strong>{selectedRequest.contact || "Não informado"}</strong></div><div><span>Dispositivo</span><strong>{selectedRequest.device}</strong></div><div><span>Marca</span><strong>{selectedRequest.brand}</strong></div><div><span>Status</span><StatusPill status={selectedRequest.status} /></div></div>{selectedRequest.message && <p className="detail-message">{selectedRequest.message}</p>}{(hasTestResult(selectedRequest) || selectedRequest.recommendedApp) && <div className="result-box"><div><strong>{selectedRequest.resultTitle || "Dados retornados pelo serviço"}</strong><button className="text-button" onClick={() => void copyResult(selectedRequest)}><Copy size={14} /> Copiar</button></div>{selectedRequest.recommendedApp && <p>Aplicativo: <b>{selectedRequest.recommendedApp}</b></p>}{getAccessDetails(selectedRequest).map((detail, index) => <p key={detail.label + "-" + index}>{detail.label}: <b>{detail.value}</b></p>)}{selectedRequest.duration && <p>Duração: <b>{selectedRequest.duration}</b></p>}</div>}{["queued", "running", "awaiting_app"].includes(selectedRequest.status) && <button className="secondary-button" type="button" onClick={() => resumeRequest(selectedRequest)}><Activity size={14} /> {selectedRequest.status === "awaiting_app" ? "Continuar atendimento" : "Acompanhar solicitação"}</button>}</section>}
            </section>
          )}

          {page === "settings" && (
            <section className="page-section">
              <div className="page-heading"><div><div className="eyebrow"><Settings2 size={13} /> PREFERÊNCIAS</div><h1>Configurações</h1><p>Gerencie as conexões e os parâmetros do aplicativo.</p></div></div>
              <div className="settings-layout">
                <section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><RadioTower size={19} /></span><div><h3>Integração de automação</h3><p>Conexão entre o aplicativo e o serviço que processa as solicitações.</p></div><span className={"config-value " + (automationReady ? "configured" : "pending")}>{workerHealth === "checking" ? "Verificando" : automationReady ? "Ativo" : workerHealth === "online" ? "Pausado" : "Offline"}</span></div><div className="settings-row"><div><strong>Proxy seguro da aplicação</strong><small>A chave do worker permanece no servidor Vercel.</small></div><span className="config-value configured">Configurado</span></div><div className="settings-row"><div><strong>Autenticação administrativa</strong><small>Acesso por sessão segura, sem armazenar senha no navegador.</small></div><span className="config-value configured">Protegida</span></div><div className="settings-row"><div><strong>Worker de automação</strong><small>Processador Playwright executado em servidor persistente.</small></div><span className={"config-value " + (workerHealth === "online" ? "configured" : "pending")}>{workerHealth === "checking" ? "Verificando" : workerHealth === "online" ? "Online" : "Offline"}</span></div><div className="settings-row"><div><strong>Conexão FUTEX</strong><small>O worker usa o atendimento original da FUTEX e devolve os dados ao IPTV Flow.</small></div><span className={"config-value " + (automationReady ? "configured" : "pending")}>{workerAutomationEnabled ? "Ativa" : "Desativada"}</span></div><div className="settings-row"><div><strong>Formulário próprio + FUTEX</strong><small>O usuário preenche o formulário próprio; a FUTEX processa o teste em segundo plano.</small></div><span className="config-value configured">Integração</span></div>
<div className="settings-callout"><LockKeyhole size={16} /><p>A sessão administrativa usa cookie HttpOnly, Secure e SameSite=Strict. A senha é validada exclusivamente no servidor; o token interno do worker nunca é enviado ao navegador.</p></div><button className="secondary-button" type="button" onClick={() => void checkWorkerHealth()}><RefreshCw size={14} /> Verificar conexão</button><button className="secondary-button" type="button" onClick={() => void runFutexDiagnostic()} disabled={diagnosingFutex || workerHealth !== "online"}>{diagnosingFutex ? <LoaderCircle className="spin" size={14} /> : <Activity size={14} />} {diagnosingFutex ? "Analisando site..." : "Diagnosticar FUTEX"}</button>{futexDiagnostic && <><pre className="diagnostic-output">{futexDiagnostic}</pre><button className="text-button" type="button" onClick={() => void copyValue("Diagnóstico", futexDiagnostic)}><Copy size={14} /> Copiar diagnóstico</button></>}</section>
                <section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><Gauge size={19} /></span><div><h3>Ambiente do aplicativo</h3><p>Informações de execução desta versão.</p></div></div><div className="settings-row"><div><strong>Interface web</strong><small>Aplicação React responsiva.</small></div><span className="config-value configured">Operacional</span></div><div className="settings-row"><div><strong>Armazenamento local</strong><small>Rascunhos salvos neste navegador.</small></div><span className="config-value configured">Ativo</span></div><div className="settings-row"><div><strong>Sincronização entre dispositivos</strong><small>Histórico persistido no volume do servidor worker.</small></div><span className="config-value configured">Preparada</span></div></section>
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
