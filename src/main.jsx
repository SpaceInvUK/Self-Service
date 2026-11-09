import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  MessageCircle,
  BookOpen,
  FileText,
  Smartphone,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Bell,
  LogOut,
  Check,
  CheckCheck,
  Upload,
  Download,
  X,
  Send,
  FlaskConical,
  Leaf,
  Building2,
  Users,
  Activity,
  Clock,
  ShieldCheck,
  AlertCircle,
  Copy,
  Trash2,
  RefreshCw,
  Menu,
  Sparkles,
  Headphones,
  FileSpreadsheet,
  CheckCircle2,
  WifiOff,
  MoreHorizontal,
  Play,
  History,
} from "lucide-react";
import "./styles.css";
const BRL = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    (v || 0) / 100,
  );
const count = (v) => new Intl.NumberFormat("pt-BR").format(v || 0);
const date = (v) =>
  new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const time = (v) =>
  new Date(v).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
let alertAudio;
function chime() {
  try {
    if (!alertAudio) return;
    const oscillator = alertAudio.createOscillator(),
      gain = alertAudio.createGain();
    oscillator.connect(gain);
    gain.connect(alertAudio.destination);
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.07, alertAudio.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      alertAudio.currentTime + 0.35,
    );
    oscillator.start();
    oscillator.stop(alertAudio.currentTime + 0.35);
  } catch {
    /* visual alert stays available */
  }
}
const statusNames = {
  BOT_ATIVO: "Com o assistente",
  AGUARDANDO_ATENDENTE: "Aguardando atendente",
  EM_ATENDIMENTO_HUMANO: "Atendimento humano",
  ENCERRADA: "Encerrada",
  ENVIADO: "Enviado",
  ACEITO: "Aceito",
  VENDA_CONFIRMADA: "Venda confirmada",
  PERDIDO: "Perdido",
  CANCELADO: "Cancelado",
};
async function api(path, options = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  });
  const data = await r.json();
  if (!r.ok) {
    const e = Error(data.error || "Ocorreu um erro.");
    e.details = data.errors;
    throw e;
  }
  return data;
}
function Brand({ large = false }) {
  return (
    <div className={"brand " + (large ? "large" : "")}>
      <img src="/cassis.png" alt="Três frutas de cassis com folha verde" />
      <span>
        cAssist<span className="brand-ai">AI</span>
      </span>
    </div>
  );
}
function Button({ children, icon: Icon, variant = "", ...props }) {
  return (
    <button className={"button " + variant} {...props}>
      {Icon && <Icon size={17} />}
      <span>{children}</span>
    </button>
  );
}
function Badge({ children, tone = "" }) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Empty({ icon: Icon = MessageCircle, title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Modal({ title, subtitle, children, onClose }) {
  const box = useRef();
  useEffect(() => {
    const before = document.activeElement;
    box.current?.querySelector("input,button")?.focus();
    const listener = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = [
          ...box.current.querySelectorAll(
            "button,input,select,textarea,a[href]",
          ),
        ].filter((el) => !el.disabled);
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={box}
      >
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </section>
    </div>
  );
}
function Auth({ session, onDone }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(session.needsSetup ? "/setup" : "/login", {
        method: "POST",
        body: Object.fromEntries(new FormData(e.target)),
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand large />
        <div>
          <span className="eyebrow">MENOS REPETIÇÃO. MAIS CONVERSA.</span>
          <h1>
            Seu atendimento,
            <br />
            pronto para
            <br />
            <em>florescer.</em>
          </h1>
          <p>
            Conhecimento da sua empresa. Respostas com cuidado.
            <br />
            Tudo no mesmo lugar.
          </p>
          <div className="auth-pills">
            <span>
              <FileSpreadsheet size={16} /> Alimente com Excel
            </span>
            <span>
              <MessageCircle size={16} /> Atenda com clareza
            </span>
          </div>
        </div>
        <small>cAssistAI · Feito para aproximar pessoas.</small>
      </section>
      <section className="auth-form">
        <div className="auth-form-inner">
          <div className="leaf-box">
            <Leaf size={25} />
          </div>
          <h2>
            {session.needsSetup ? "Vamos começar?" : "Bom ter você de volta."}
          </h2>
          <p className="muted">
            {session.needsSetup
              ? "Crie a conta administradora da sua central cAssistAI."
              : "Entre para cuidar das suas conversas."}
          </p>
          <form onSubmit={submit}>
            {session.needsSetup && (
              <label>
                Seu nome
                <input
                  name="name"
                  placeholder="Como podemos chamar você?"
                  required
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              E-mail
              <input
                name="email"
                type="email"
                placeholder="voce@empresa.com.br"
                required
                autoComplete="username"
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                minLength={session.needsSetup ? 10 : undefined}
                placeholder={
                  session.needsSetup ? "Pelo menos 10 caracteres" : "Sua senha"
                }
                required
                autoComplete={
                  session.needsSetup ? "new-password" : "current-password"
                }
              />
            </label>
            {session.needsSetup && session.setupTokenRequired && (
              <label>
                Token de instalação
                <input name="setupToken" type="password" required />
              </label>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" disabled={busy} icon={ArrowRight}>
              {busy
                ? "Um instante…"
                : session.needsSetup
                  ? "Criar minha central"
                  : "Entrar na central"}
            </Button>
          </form>
          <p className="auth-note">
            <ShieldCheck size={16} />
            {session.needsSetup
              ? "A demonstração Formato será criada para você testar."
              : "Seus dados permanecem separados por empresa."}
          </p>
        </div>
      </section>
    </div>
  );
}
const pages = [
  ["overview", "Visão geral", LayoutDashboard],
  ["inbox", "Atendimentos", MessageCircle],
  ["knowledge", "Conhecimento", BookOpen],
  ["quotes", "Orçamentos", FileText],
  ["numbers", "WhatsApps", Smartphone],
  ["usage", "Consumo", Activity],
  ["settings", "Configurações", Settings],
];
// Storage can be blocked (private windows, strict settings); the app must still open.
const remembered = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* remembering the company is only a convenience */
    }
  },
};
function App() {
  const [session, setSession] = useState(null),
    [companies, setCompanies] = useState([]),
    [cid, setCid] = useState(remembered.get("company") || ""),
    [data, setData] = useState(null),
    [page, setPage] = useState("overview"),
    [toast, setToast] = useState(null),
    [modal, setModal] = useState(null),
    [mobile, setMobile] = useState(false),
    [selected, setSelected] = useState(null),
    [globalSearch, setGlobalSearch] = useState(""),
    [notifications, setNotifications] = useState(false);
  const knownWaiting = useRef(new Set());
  const notify = (message, error = false) => {
    setToast({ message, error });
  };
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  async function loadSession() {
    try {
      setSession(await api("/session"));
    } catch (e) {
      notify(e.message, true);
    }
  }
  useEffect(() => {
    loadSession();
  }, []);
  async function loadCompanies() {
    const list = await api("/companies");
    setCompanies(list);
    if (!list.some((c) => c.id === cid)) setCid(list[0]?.id || "");
  }
  useEffect(() => {
    if (session?.user) loadCompanies().catch((e) => notify(e.message, true));
  }, [session?.user?.id]);
  async function refresh() {
    if (!cid) return;
    const next = await api(`/companies/${cid}/state`);
    setData(next);
    return next;
  }
  useEffect(() => {
    setData(null);
    setSelected(null);
    if (!cid || !session?.user) return;
    remembered.set("company", cid);
    let active = true;
    const update = () =>
      api(`/companies/${cid}/state`)
        .then((d) => {
          if (!active) return;
          setData(d);
          const waiting = d.conversations.filter(
            (c) => c.status === "AGUARDANDO_ATENDENTE",
          );
          if (notifications) {
            for (const c of waiting)
              if (!knownWaiting.current.has(c.id)) {
                notify(`${c.contact} está aguardando atendimento.`);
                chime();
                if (
                  "Notification" in window &&
                  Notification.permission === "granted"
                )
                  new Notification("cAssistAI · Atendimento", {
                    body: `${c.contact} precisa de um atendente.`,
                  });
              }
          }
          knownWaiting.current = new Set(waiting.map((c) => c.id));
        })
        .catch((e) => {
          if (active) notify(e.message, true);
        });
    update();
    const timer = setInterval(update, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [cid, session?.user?.id, notifications]);
  const act = async (fn, message) => {
    try {
      const r = await fn();
      await refresh();
      if (message) notify(message);
      return r;
    } catch (e) {
      notify(e.message, true);
      return null;
    }
  };
  function navigate(p) {
    setPage(p);
    setMobile(false);
  }
  async function startSimulation() {
    const r = await act(() =>
      api(`/companies/${cid}/conversations`, {
        method: "POST",
        body: { contact: "Visitante de teste" },
      }),
    );
    if (r) {
      setSelected(r.id);
      navigate("inbox");
    }
  }
  async function enableNotifications() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        alertAudio ||= new Audio();
        await alertAudio.resume();
        chime();
      }
      if ("Notification" in window && Notification.permission === "default")
        await Notification.requestPermission();
    } catch {
      /* permission can be declined */
    }
    setNotifications(true);
    notify("Alertas da fila ativados enquanto este painel estiver aberto.");
  }
  if (!session)
    return (
      <div className="loading">
        <Brand />
        <p>Preparando sua central…</p>
      </div>
    );
  if (!session.user) return <Auth session={session} onDone={loadSession} />;
  const waiting =
      data?.conversations.filter((c) => c.status === "AGUARDANDO_ATENDENTE")
        .length || 0,
    company = data?.company,
    isAdmin = session.user.role === "admin";
  const shared = {
    data,
    cid,
    act,
    notify,
    setModal,
    isAdmin,
    refresh,
    startSimulation,
  };
  return (
    <div className="app">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <Brand />
        <div className="workspace-select">
          <span className="workspace-avatar">{(company?.name || "E")[0]}</span>
          <div>
            <small>ESPAÇO DE TRABALHO</small>
            <select
              aria-label="Empresa ativa"
              value={cid}
              onChange={(e) => setCid(e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="nav-label">SUA CENTRAL</div>
        <nav>
          {pages.map(([id, label, Icon]) => (
            <button
              key={id}
              className={"nav-item " + (page === id ? "active" : "")}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "inbox" && waiting > 0 && <b>{waiting}</b>}
              {page === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-card">
            <div>
              <Leaf size={19} />
              <span>Seu bot começa aqui</span>
            </div>
            <p>Uma planilha. O conhecimento da sua empresa.</p>
            <button onClick={() => navigate("knowledge")}>
              Preparar minha base <ArrowUpRight size={16} />
            </button>
          </div>
          <button className="profile" onClick={() => setModal("profile")}>
            <span className="avatar">{session.user.name[0].toUpperCase()}</span>
            <span>
              <strong>{session.user.name}</strong>
              <small>{isAdmin ? "Administrador" : "Atendente"}</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-overlay" onClick={() => setMobile(false)} />
      )}
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Abrir menu"
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{pages.find((p) => p[0] === page)?.[1]}</strong>
          </div>
          <div className="top-actions">
            <div className="top-search">
              <Search size={16} />
              <input
                aria-label="Buscar no catálogo"
                placeholder="Buscar no catálogo…"
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  navigate("knowledge");
                }}
              />
              <kbd>⌕</kbd>
            </div>
            <button
              className={
                "icon-button notification-button " +
                (waiting ? "has-notification" : "")
              }
              onClick={() => {
                enableNotifications();
                navigate("inbox");
              }}
              aria-label="Ativar notificações e abrir fila"
            >
              <Bell size={20} />
            </button>
            <span className="top-avatar">{session.user.name[0]}</span>
          </div>
        </header>
        <main
          className={"content " + (page === "inbox" ? "inbox-content" : "")}
        >
          {!data ? (
            <div className="loading-panel">
              Carregando sua empresa…
              {!cid && isAdmin && (
                <Button onClick={() => setModal("company")}>
                  Adicionar empresa
                </Button>
              )}
            </div>
          ) : (
            <>
              {page === "overview" && (
                <Overview {...shared} user={session.user} navigate={navigate} />
              )}
              {page === "knowledge" && (
                <Knowledge
                  {...shared}
                  search={globalSearch}
                  setSearch={setGlobalSearch}
                />
              )}
              {page === "inbox" && (
                <Inbox
                  {...shared}
                  selected={selected}
                  setSelected={setSelected}
                  enableNotifications={enableNotifications}
                />
              )}
              {page === "quotes" && <Quotes {...shared} />}
              {page === "numbers" && <Numbers {...shared} />}
              {page === "usage" && <Usage {...shared} />}
              {page === "settings" && (
                <SettingsPage {...shared} onCompanies={loadCompanies} />
              )}
            </>
          )}
          <footer className="footer">
            <span>
              <img src="/cassis.png" alt="" />
              cAssistAI · Atendimento que floresce.
            </span>
            <span>
              v0.1 ·{" "}
              {data?.company.demo
                ? "Base demonstrativa"
                : "Sua central de atendimento"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className={"toast " + (toast.error ? "toast-error" : "")}
          role="status"
        >
          {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "profile" && (
        <Modal title="Sua conta" onClose={() => setModal(null)}>
          <p>
            {session.user.name}
            <br />
            <span className="muted">{session.user.email}</span>
          </p>
          <Button
            variant="secondary"
            icon={LogOut}
            onClick={async () => {
              await api("/logout", { method: "POST" });
              setModal(null);
              setData(null);
              await loadSession();
            }}
          >
            Sair da central
          </Button>
        </Modal>
      )}
      {modal === "company" && (
        <Modal
          title="Uma nova empresa"
          subtitle="Cada empresa tem sua própria base, conversas e números."
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await act(
                () =>
                  api("/companies", {
                    method: "POST",
                    body: Object.fromEntries(new FormData(e.target)),
                  }),
                "Empresa criada.",
              );
              if (r) {
                await loadCompanies();
                setCid(r.id);
                setModal(null);
              }
            }}
          >
            <label>
              Nome da empresa
              <input name="name" required placeholder="Ex.: Studio Flora" />
            </label>
            <label>
              Segmento
              <input name="segment" placeholder="Ex.: Comunicação visual" />
            </label>
            <Button type="submit" icon={Plus}>
              Criar empresa
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function PageTitle({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function Overview({ data, user, navigate, startSimulation }) {
  const actual = data.conversations.filter((c) => c.mode === "whatsapp"),
    sim = data.conversations.filter((c) => c.mode === "simulation"),
    sent = data.usage
      .filter((x) => x.kind === "bot" && x.state === "confirmed")
      .reduce((a, b) => a + b.count, 0),
    sales = data.quotes.filter((q) => q.status === "VENDA_CONFIRMADA"),
    waiting = data.conversations.filter(
      (c) => c.status === "AGUARDANDO_ATENDENTE",
    ),
    online = data.numbers.filter((n) => n.status === "online").length;
  return (
    <>
      <PageTitle
        eyebrow="SEU DIA, MAIS LEVE"
        title={`Olá, ${user.name.split(" ")[0]}.`}
        description="Um olhar para suas conversas. Mais espaço para o seu negócio."
      >
        <Badge tone="outline">
          <span className="green-dot" />
          Central disponível
        </Badge>
      </PageTitle>
      <div className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <Sparkles size={15} /> INTELIGÊNCIA COM O SEU JEITO
          </span>
          <h2>
            Boas conversas.
            <br />
            Novas possibilidades.
          </h2>
          <p>
            Transforme o que sua empresa sabe em um atendimento
            <br className="desktop-break" /> que acolhe, responde e ajuda a
            vender.
          </p>
          <Button onClick={startSimulation} icon={Play}>
            Experimentar meu assistente <ArrowRight size={16} />
          </Button>
          <span className="hero-footnote">
            Ambiente de teste · Nenhuma mensagem é enviada ao WhatsApp
          </span>
        </div>
        <div className="hero-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="art-leaf leaf-one" />
          <span className="art-leaf leaf-two" />
          <div className="hero-chat">
            <div className="hero-chat-head">
              <span className="bot-avatar">
                <img src="/cassis.png" alt="" />
              </span>
              <div>
                <strong>Seu assistente</strong>
                <small>Conhecimento que vira conversa</small>
              </div>
              <span className="green-dot" />
            </div>
            <div className="sample-user">
              Olá! Pode me ajudar com um orçamento?
            </div>
            <div className="sample-bot">
              Claro! Vamos encontrar a melhor opção para você. <span>✦</span>
            </div>
            <div className="hero-chat-foot">
              <FileSpreadsheet size={15} /> Respostas a partir da sua base{" "}
              <CheckCheck size={15} />
            </div>
          </div>
          <div className="floating-tag">
            <span>
              <Check size={14} />
            </span>{" "}
            Menos tarefas repetidas
          </div>
        </div>
      </div>
      <div className="stats-grid">
        {[
          [
            MessageCircle,
            "Respostas do bot",
            count(sent),
            "Enviadas neste mês",
            "purple",
          ],
          [
            Headphones,
            "Aguardando atendimento",
            count(waiting.length),
            "Pessoas que precisam de você",
            "orange",
          ],
          [
            FileText,
            "Orçamentos criados",
            count(data.quotes.length),
            `${sim.length} conversa(s) de simulação`,
            "green",
          ],
          [
            Smartphone,
            "WhatsApps conectados",
            `${online} / ${data.company.number_limit}`,
            "Números online / limite da conta",
            "blue",
          ],
        ].map(([Icon, label, value, note, color]) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <div className={"stat-icon " + color}>
                <Icon size={18} />
              </div>
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel journey">
          <div className="panel-heading">
            <div>
              <h2>Seu assistente, passo a passo</h2>
              <p>Pequenos passos. Um atendimento mais completo.</p>
            </div>
            <Badge>
              {
                [
                  !!data.knowledge,
                  data.numbers.length > 0,
                  sim.length > 0,
                ].filter(Boolean).length
              }{" "}
              de 3
            </Badge>
          </div>
          {[
            [
              BookOpen,
              "Adicione o conhecimento",
              "Importe produtos, preços e respostas em uma planilha.",
              !!data.knowledge,
              "knowledge",
            ],
            [
              FlaskConical,
              "Faça a primeira conversa",
              "Teste seu catálogo e veja como o assistente responde.",
              sim.length > 0,
              "test",
            ],
            [
              Smartphone,
              "Conecte um WhatsApp",
              "Instale o conector no computador ou servidor do cliente.",
              online > 0,
              "numbers",
            ],
          ].map(([Icon, title, desc, done, target], i) => (
            <button
              key={title}
              className="journey-step"
              onClick={() =>
                target === "test" ? startSimulation() : navigate(target)
              }
            >
              <div className={"step-icon " + (done ? "done" : "")}>
                {done ? <Check size={18} /> : <Icon size={18} />}
              </div>
              <span>
                <strong>{title}</strong>
                <small>{desc}</small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        </section>
        <section className="panel knowledge-card">
          <div className="panel-heading">
            <h2>Raízes do seu atendimento</h2>
            <Leaf size={20} />
          </div>
          <div className="knowledge-illustration">
            <FileSpreadsheet size={35} />
            <span className="mini-spark">✦</span>
          </div>
          <h3>
            {data.knowledge
              ? "Sua base está pronta para testar."
              : "Tudo começa com uma planilha."}
          </h3>
          <p>
            {data.knowledge
              ? `${data.knowledge.products.length} produtos e ${data.knowledge.faqs.length} respostas para ajudar seu assistente.`
              : "Reúna produtos, preços e informações úteis da empresa em um único lugar."}
          </p>
          {data.company.demo > 0 && (
            <Badge tone="amber">Catálogo de demonstração</Badge>
          )}
          <button className="text-button" onClick={() => navigate("knowledge")}>
            Explorar conhecimento <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <section className="panel recent">
        <div className="panel-heading">
          <div>
            <h2>Conversas recentes</h2>
            <p>Cada conversa é uma oportunidade de cuidar.</p>
          </div>
          <button className="text-button" onClick={() => navigate("inbox")}>
            Ver atendimentos <ArrowRight size={16} />
          </button>
        </div>
        {!data.conversations.length ? (
          <div className="recent-empty">
            <span className="round-icon">
              <MessageCircle size={22} />
            </span>
            <div>
              <strong>Sua primeira conversa começa aqui.</strong>
              <p>Teste o assistente antes de conectar um número real.</p>
            </div>
            <Button variant="secondary" onClick={startSimulation}>
              Iniciar teste <ArrowUpRight size={15} />
            </Button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contato</th>
                  <th>Última mensagem</th>
                  <th>Situação</th>
                  <th>Canal</th>
                </tr>
              </thead>
              <tbody>
                {data.conversations.slice(0, 4).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.contact}</strong>
                    </td>
                    <td className="truncate-cell">
                      {c.last_message || "Conversa iniciada"}
                    </td>
                    <td>
                      <Badge
                        tone={
                          c.status === "AGUARDANDO_ATENDENTE" ? "amber" : ""
                        }
                      >
                        {statusNames[c.status]}
                      </Badge>
                    </td>
                    <td>
                      {c.mode === "simulation" ? "Simulador" : "WhatsApp"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function Knowledge({ data, cid, act, notify, search, setSearch, isAdmin }) {
  const [uploading, setUploading] = useState(false),
    [preview, setPreview] = useState(null),
    [errors, setErrors] = useState([]),
    [history, setHistory] = useState(null);
  const input = useRef();
  const products =
    data.knowledge?.products.filter((p) =>
      (p.nome + " " + p.codigo + " " + p.categoria)
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  async function upload(file) {
    if (!file) return;
    setUploading(true);
    setErrors([]);
    const form = new FormData();
    form.append("file", file);
    try {
      setPreview(
        await api(`/companies/${cid}/import`, { method: "POST", body: form }),
      );
    } catch (e) {
      setErrors(e.details || [e.message]);
      notify(e.message, true);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="CONHECIMENTO QUE ACOLHE"
        title="A base do seu assistente"
        description="Sua empresa ensina. O assistente transforma em boas respostas."
      >
        <a className="button secondary" href="/api/template">
          <Download size={17} />
          Baixar modelo
        </a>
        {isAdmin && (
          <Button
            icon={Upload}
            disabled={uploading}
            onClick={() => input.current.click()}
          >
            {uploading ? "Lendo planilha…" : "Importar Excel"}
          </Button>
        )}
      </PageTitle>
      <input
        type="file"
        accept=".xlsx"
        ref={input}
        hidden
        onChange={(e) => upload(e.target.files[0])}
      />
      <div className="import-banner">
        <div className="file-box">
          <FileSpreadsheet size={29} />
        </div>
        <div>
          <h3>Uma planilha. Todo o seu conhecimento.</h3>
          <p>
            Preencha empresa, produtos, perguntas e condições. Revise tudo antes
            de ativar.
          </p>
          <a href="/api/template?sample=1">
            Baixar exemplo preenchido da Formato <ArrowUpRight size={14} />
          </a>
        </div>
        <Badge tone="outline">Excel .xlsx · até 5 MB</Badge>
      </div>
      {errors.length > 0 && (
        <div className="error">
          <strong>Precisamos ajustar alguns campos:</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="knowledge-metrics">
        <div>
          <BookOpen size={18} />
          <strong>{data.knowledge?.products.length || 0}</strong>
          <span>produtos e variantes</span>
        </div>
        <div>
          <MessageCircle size={18} />
          <strong>{data.knowledge?.faqs.length || 0}</strong>
          <span>respostas aprovadas</span>
        </div>
        <div>
          <History size={18} />
          <strong>v{data.knowledge?.version || 0}</strong>
          <span>versão ativa</span>
        </div>
        {isAdmin && (
          <button
            className="text-button"
            onClick={async () => {
              try {
                setHistory(await api(`/companies/${cid}/knowledge/history`));
              } catch (e) {
                notify(e.message, true);
              }
            }}
          >
            Histórico <ChevronRight size={16} />
          </button>
        )}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Catálogo de produtos</h2>
            <p>
              {data.company.demo
                ? "Dados demonstrativos. Confirme preços antes de usar em atendimento real."
                : "Preços e regras que o bot pode usar nos orçamentos."}
            </p>
          </div>
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="Filtrar produtos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto ou código"
            />
          </div>
        </div>
        {products.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Preço</th>
                  <th>Entrada</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.codigo}>
                    <td>
                      <div className="product-cell">
                        <span className="product-icon">
                          <FileText size={19} />
                        </span>
                        <span>
                          <strong>{p.nome}</strong>
                          <small>
                            {p.codigo} · {p.prazo || "Prazo a confirmar"}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>{p.categoria || "Geral"}</td>
                    <td className="price">
                      {BRL(Math.round(p.preco * 100))}
                      <small> / {p.unidade === "M2" ? "m²" : "un."}</small>
                    </td>
                    <td>
                      {p.entrada === null ? "A confirmar" : p.entrada + "%"}
                    </td>
                    <td>
                      <Badge tone={p.ativo ? "green" : "neutral"}>
                        {p.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={BookOpen}
            title={
              search
                ? "Nenhum produto encontrado"
                : "Sua base está esperando por você"
            }
          >
            Importe uma planilha ou ajuste a busca.
          </Empty>
        )}
      </section>
      {!!data.knowledge?.faqs.length && (
        <section className="panel faq-panel">
          <div className="panel-heading">
            <h2>Respostas que o assistente já conhece</h2>
            <Badge>{data.knowledge.faqs.length} perguntas</Badge>
          </div>
          {data.knowledge.faqs.map((f, i) => (
            <details key={i}>
              <summary>
                {f.pergunta}
                <ChevronDown size={17} />
              </summary>
              <p>{f.resposta}</p>
            </details>
          ))}
        </section>
      )}
      {preview && (
        <Modal
          title="Revise sua nova base"
          subtitle="A versão atual será substituída. Orçamentos anteriores serão preservados."
          onClose={() => setPreview(null)}
        >
          <div className="preview-counts">
            <span>
              <strong>{preview.products.length}</strong> produtos
            </span>
            <span>
              <strong>{preview.faqs.length}</strong> respostas
            </span>
          </div>
          <p>
            <strong>{preview.company.nome}</strong>
            <br />
            {preview.company.segmento}
          </p>
          {preview.removed.length > 0 && (
            <div className="warning">
              {preview.removed.length} produto(s) sairão da base ativa:{" "}
              {preview.removed.join(", ")}
            </div>
          )}
          <div className="preview-list">
            {preview.products.slice(0, 6).map((p) => (
              <div key={p.codigo}>
                <span>{p.nome}</span>
                <strong>{BRL(p.preco * 100)}</strong>
              </div>
            ))}
          </div>
          <Button
            icon={Check}
            onClick={async () => {
              const r = await act(
                () =>
                  api(`/companies/${cid}/import/${preview.id}/activate`, {
                    method: "POST",
                  }),
                "Conhecimento ativado com sucesso.",
              );
              if (r) setPreview(null);
            }}
          >
            Confirmar e ativar base
          </Button>
        </Modal>
      )}
      {history && (
        <Modal
          title="Versões do conhecimento"
          subtitle="Restaurar cria uma nova versão com os dados selecionados."
          onClose={() => setHistory(null)}
        >
          {history.length ? (
            history.map((h) => (
              <div className="history-row" key={h.version}>
                <span>
                  Versão {h.version} · {date(h.created)}
                </span>
                {h.version === data.knowledge?.version ? (
                  <Badge>Ativa</Badge>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const r = await act(
                        () =>
                          api(`/companies/${cid}/knowledge/restore`, {
                            method: "POST",
                            body: { version: h.version },
                          }),
                        "Versão restaurada.",
                      );
                      if (r) setHistory(null);
                    }}
                  >
                    Restaurar
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p>Nenhuma versão ainda.</p>
          )}
        </Modal>
      )}
    </>
  );
}
function Inbox({
  data,
  cid,
  act,
  notify,
  selected,
  setSelected,
  startSimulation,
  enableNotifications,
}) {
  const [conversation, setConversation] = useState(null),
    [text, setText] = useState(""),
    [sending, setSending] = useState(false),
    [filter, setFilter] = useState("all"),
    [role, setRole] = useState("customer");
  const bottom = useRef();
  const list = data.conversations.filter(
    (c) => filter === "all" || c.status === "AGUARDANDO_ATENDENTE",
  );
  const load = () =>
    api(`/companies/${cid}/conversations/${selected}`).then(setConversation);
  useEffect(() => {
    setConversation(null);
    setRole("customer");
    if (!selected) return;
    let active = true;
    const update = () =>
      api(`/companies/${cid}/conversations/${selected}`)
        .then((c) => active && setConversation(c))
        .catch((e) => active && notify(e.message, true));
    update();
    const t = setInterval(update, 2500);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [selected, cid]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [conversation?.messages.length]);
  async function send(value = text) {
    if (!value.trim() || sending) return;
    setSending(true);
    try {
      await api(`/companies/${cid}/conversations/${selected}/message`, {
        method: "POST",
        body: {
          text: value,
          role: conversation.mode === "simulation" ? role : "human",
        },
      });
      setText("");
      await load();
      await act(async () => ({ ok: true }));
    } catch (e) {
      notify(e.message, true);
    } finally {
      setSending(false);
    }
  }
  async function change(status) {
    const r = await act(
      () =>
        api(`/companies/${cid}/conversations/${selected}/status`, {
          method: "POST",
          body: { status },
        }),
      status === "BOT_ATIVO"
        ? "Assistente retomou a conversa."
        : "Situação atualizada.",
    );
    if (r) {
      await load();
      if (status === "EM_ATENDIMENTO_HUMANO") setRole("human");
    }
  }
  return (
    <>
      <PageTitle
        title="Conversas que importam"
        description="O assistente cuida do início. Você entra quando faz a diferença."
      >
        <Button variant="secondary" icon={Bell} onClick={enableNotifications}>
          Ativar avisos
        </Button>
        <Button icon={FlaskConical} onClick={startSimulation}>
          Nova simulação
        </Button>
      </PageTitle>
      <div className="inbox-layout">
        <aside className="conversation-list">
          <div className="list-tabs">
            <button
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              Todas <span>{data.conversations.length}</span>
            </button>
            <button
              className={filter === "waiting" ? "selected" : ""}
              onClick={() => setFilter("waiting")}
            >
              Aguardando
            </button>
          </div>
          {list.length ? (
            list.map((c) => (
              <button
                key={c.id}
                className={
                  "conversation-item " + (selected === c.id ? "selected" : "")
                }
                onClick={() => setSelected(c.id)}
              >
                <span
                  className={
                    "avatar " + (c.mode === "simulation" ? "lavender" : "")
                  }
                >
                  {c.mode === "simulation" ? (
                    <FlaskConical size={18} />
                  ) : (
                    c.contact[0]
                  )}
                </span>
                <div>
                  <div>
                    <strong>{c.contact}</strong>
                    <small>{time(c.updated)}</small>
                  </div>
                  <p>{c.last_message || "Comece uma conversa"}</p>
                  <span
                    className={
                      "conversation-status " +
                      (c.status === "AGUARDANDO_ATENDENTE" ? "waiting" : "")
                    }
                  >
                    {statusNames[c.status]}
                  </span>
                </div>
              </button>
            ))
          ) : (
            <div className="list-empty">Nenhuma conversa por aqui.</div>
          )}
        </aside>
        <section className="chat-panel">
          {!conversation ? (
            <Empty icon={MessageCircle} title="Escolha uma conversa">
              Ou crie uma simulação para experimentar o atendimento com os dados
              da empresa.
            </Empty>
          ) : (
            <>
              <div className="chat-heading">
                <span className="avatar lavender">
                  {conversation.mode === "simulation" ? (
                    <FlaskConical size={19} />
                  ) : (
                    conversation.contact[0]
                  )}
                </span>
                <div>
                  <strong>{conversation.contact}</strong>
                  <small>
                    {conversation.mode === "simulation"
                      ? "Simulação · não envia ao WhatsApp"
                      : "Conversa via WhatsApp"}
                  </small>
                </div>
                <div className="chat-controls">
                  {conversation.status === "BOT_ATIVO" ? (
                    <Button
                      variant="secondary"
                      icon={Headphones}
                      onClick={() => change("EM_ATENDIMENTO_HUMANO")}
                    >
                      Assumir
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        icon={Play}
                        onClick={() => change("BOT_ATIVO")}
                      >
                        Devolver ao bot
                      </Button>
                      {conversation.status === "AGUARDANDO_ATENDENTE" && (
                        <Button onClick={() => change("EM_ATENDIMENTO_HUMANO")}>
                          Assumir
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {conversation.status === "AGUARDANDO_ATENDENTE" && (
                <div className="chat-notice">
                  <Headphones size={16} />O assistente pausou. Esta conversa
                  precisa de você.
                </div>
              )}
              <div className="messages">
                <div className="chat-day">
                  Hoje ·{" "}
                  {conversation.mode === "simulation"
                    ? "ambiente de teste"
                    : "atendimento"}
                </div>
                {!conversation.messages.length && (
                  <div className="chat-welcome">
                    <img src="/cassis.png" alt="" />
                    <h3>Vamos experimentar?</h3>
                    <p>
                      Converse como um cliente. Seu assistente vai usar a base
                      da empresa.
                    </p>
                    <div>
                      {[
                        "Olá!",
                        "Quero ver o catálogo",
                        "Preciso de um atendente",
                      ].map((s) => (
                        <button key={s} onClick={() => send(s)}>
                          {s}
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {conversation.messages.map((m) => (
                  <div key={m.id} className={"message " + m.role}>
                    <small>
                      {m.role === "customer"
                        ? "Cliente"
                        : m.role === "bot"
                          ? "cAssistAI"
                          : "Atendente"}
                    </small>
                    <div>{m.text}</div>
                    <footer>
                      {time(m.created)}
                      {m.role !== "customer" && (
                        <span>
                          {m.state === "sent" ? (
                            <CheckCheck size={13} />
                          ) : m.state === "queued" ? (
                            "Na fila"
                          ) : m.state === "cancelled" ? (
                            "Cancelada"
                          ) : (
                            "Envio a confirmar"
                          )}
                        </span>
                      )}
                    </footer>
                  </div>
                ))}
                {sending && (
                  <div className="typing">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                <div ref={bottom} />
              </div>
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                {conversation.mode === "simulation" && (
                  <div className="role-selector">
                    <FlaskConical size={14} />
                    <span>Você está simulando:</span>
                    <select
                      aria-label="Papel no simulador"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option value="customer">Cliente</option>
                      <option
                        value="human"
                        disabled={conversation.status === "BOT_ATIVO"}
                      >
                        Atendente
                      </option>
                    </select>
                    <span>Fora da franquia comercial</span>
                  </div>
                )}
                <div className="composer-input">
                  <textarea
                    aria-label="Mensagem"
                    placeholder={
                      conversation.mode === "simulation"
                        ? "Escreva como seu cliente…"
                        : conversation.status === "BOT_ATIVO"
                          ? "Assuma a conversa para responder"
                          : "Escreva sua resposta…"
                    }
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    disabled={
                      conversation.mode === "whatsapp" &&
                      conversation.status === "BOT_ATIVO"
                    }
                    rows={2}
                  />
                  <button
                    type="submit"
                    disabled={
                      sending ||
                      !text.trim() ||
                      (conversation.mode === "whatsapp" &&
                        conversation.status === "BOT_ATIVO")
                    }
                    aria-label="Enviar mensagem"
                  >
                    <Send size={19} />
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}
function Quotes({ data, cid, act, startSimulation }) {
  const [filter, setFilter] = useState("all"),
    [detail, setDetail] = useState(null);
  const quotes = data.quotes.filter(
    (q) => filter === "all" || q.status === filter,
  );
  const simIds = new Set(
    data.conversations.filter((c) => c.mode === "simulation").map((c) => c.id),
  );
  return (
    <>
      <PageTitle
        title="Do interesse à venda"
        description="Orçamentos claros. Cada próximo passo acompanhado."
      >
        <Button icon={FlaskConical} onClick={startSimulation}>
          Testar um orçamento
        </Button>
      </PageTitle>
      <div className="quote-summary">
        {[
          ["Orçamentos enviados", data.quotes.length],
          ["Aceitos", data.quotes.filter((q) => q.status === "ACEITO").length],
          [
            "Vendas confirmadas",
            data.quotes.filter((q) => q.status === "VENDA_CONFIRMADA").length,
          ],
        ].map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{n}</strong>
          </div>
        ))}
        <div>
          <span>Total confirmado</span>
          <strong>
            {BRL(
              data.quotes
                .filter((q) => q.status === "VENDA_CONFIRMADA")
                .reduce((s, q) => s + q.total, 0),
            )}
          </strong>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Seus orçamentos</h2>
          <select
            aria-label="Filtrar orçamentos"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todos os estados</option>
            {[
              "ENVIADO",
              "ACEITO",
              "VENDA_CONFIRMADA",
              "PERDIDO",
              "CANCELADO",
            ].map((s) => (
              <option key={s} value={s}>
                {statusNames[s]}
              </option>
            ))}
          </select>
        </div>
        {quotes.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Orçamento</th>
                  <th>Produto</th>
                  <th>Total</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <strong>{q.code}</strong>
                      <small className="block">
                        {date(q.created)}
                        {simIds.has(q.conversation_id) ? " · Simulação" : ""}
                      </small>
                    </td>
                    <td>
                      {q.quantity} × {q.product}
                    </td>
                    <td className="price">{BRL(q.total)}</td>
                    <td>
                      <Badge
                        tone={
                          q.status === "VENDA_CONFIRMADA"
                            ? "green"
                            : q.status === "ACEITO"
                              ? "amber"
                              : ""
                        }
                      >
                        {statusNames[q.status]}
                      </Badge>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setDetail(q)}
                      >
                        Detalhes <ArrowUpRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={FileText}
            title="O próximo orçamento começa em uma conversa"
          >
            Peça um produto ao assistente no simulador para acompanhar todo o
            fluxo.
          </Empty>
        )}
      </section>
      <div className="subtle-note">
        <ShieldCheck size={17} />
        Aceite não é confirmação de pagamento. A venda é confirmada por um
        funcionário. Os totais acima incluem simulações identificadas.
      </div>
      {detail && (
        <Modal
          title={detail.code}
          subtitle={`Base de conhecimento v${detail.knowledge_version} · ${simIds.has(detail.conversation_id) ? "Simulação" : "WhatsApp"}`}
          onClose={() => setDetail(null)}
        >
          <div className="quote-detail">
            <p>
              {detail.quantity} × {detail.product}
            </p>
            <strong>{BRL(detail.total)}</strong>
            <span>
              Entrada:{" "}
              {detail.deposit === null ? "A confirmar" : BRL(detail.deposit)}
            </span>
            <p className="muted">
              Prazo: {JSON.parse(detail.conditions).prazo || "A confirmar"}
            </p>
            <Badge>{statusNames[detail.status]}</Badge>
          </div>
          <div className="modal-actions">
            {(detail.status === "ENVIADO"
              ? ["ACEITO", "PERDIDO"]
              : detail.status === "ACEITO"
                ? ["VENDA_CONFIRMADA", "PERDIDO"]
                : []
            ).map((status) => (
              <Button
                key={status}
                variant={status === "PERDIDO" ? "secondary" : ""}
                onClick={async () => {
                  const r = await act(
                    () =>
                      api(`/companies/${cid}/quotes/${detail.id}/status`, {
                        method: "POST",
                        body: { status },
                      }),
                    "Orçamento atualizado.",
                  );
                  if (r) setDetail(null);
                }}
              >
                {status === "ACEITO"
                  ? "Registrar aceite"
                  : status === "PERDIDO"
                    ? "Marcar como perdido"
                    : "Confirmar venda"}
              </Button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
function Numbers({ data, cid, act, notify, isAdmin }) {
  const [adding, setAdding] = useState(false),
    [credentials, setCredentials] = useState(null),
    [qr, setQr] = useState(null),
    [remove, setRemove] = useState(null);
  useEffect(() => {
    if (!qr?.id) return;
    const timer = setInterval(async () => {
      try {
        const r = await api(`/companies/${cid}/numbers/${qr.id}/qr`);
        setQr((v) => ({ ...v, ...r }));
      } catch (e) {
        notify(e.message, true);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [qr?.id, cid]);
  return (
    <>
      <PageTitle
        title="Cada número, uma conexão"
        description="O WhatsApp roda no computador ou servidor do cliente. Você acompanha por aqui."
      >
        {isAdmin && (
          <Button
            icon={Plus}
            onClick={() => setAdding(true)}
            disabled={data.numbers.length >= data.company.number_limit}
          >
            Adicionar WhatsApp
          </Button>
        )}
      </PageTitle>
      <div className="connection-notice">
        <div className="round-icon">
          <Smartphone size={23} />
        </div>
        <div>
          <h3>Seu número precisa de um conector local.</h3>
          <p>
            Cadastre a conexão, instale o conector e escaneie o QR Code com o
            WhatsApp autorizado. O computador precisa ficar ligado e conectado.
          </p>
        </div>
        <Badge tone="outline">
          {data.numbers.length} de {data.company.number_limit} números
        </Badge>
      </div>
      {data.numbers.length ? (
        <div className="number-grid">
          {data.numbers.map((n) => (
            <section className="panel number-card" key={n.id}>
              <div className="panel-heading">
                <span className="stat-icon green">
                  <Smartphone size={22} />
                </span>
                <Badge tone={n.status === "online" ? "green" : "neutral"}>
                  {n.status === "online"
                    ? "Conectado"
                    : n.status === "connecting"
                      ? "Conectando"
                      : "Offline"}
                </Badge>
              </div>
              <h3>{n.label}</h3>
              <p>{n.phone || "Número será identificado após o pareamento"}</p>
              <small>
                Último contato:{" "}
                {n.heartbeat
                  ? new Date(n.heartbeat).toLocaleString("pt-BR")
                  : "aguardando conector"}
              </small>
              {isAdmin && (
                <div className="number-actions">
                  <Button
                    variant="secondary"
                    onClick={() => setQr({ id: n.id, qr: null })}
                  >
                    Ver QR Code
                  </Button>
                  <button
                    className="icon-button"
                    aria-label={`Remover ${n.label}`}
                    onClick={() => setRemove(n)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            icon={Smartphone}
            title="Seu primeiro WhatsApp está a um passo"
          >
            Cadastre uma conexão para receber as instruções de instalação.
            Nenhum número está conectado ainda.
          </Empty>
        </section>
      )}
      <div className="subtle-note">
        <AlertCircle size={17} />
        Integração por QR Code não oficial. Pode exigir reconexão e está sujeita
        a mudanças ou bloqueios pelo WhatsApp.
      </div>
      {adding && (
        <Modal
          title="Adicionar um WhatsApp"
          subtitle="O limite é definido por conta. Este cadastro ainda não conecta o número."
          onClose={() => setAdding(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await act(() =>
                api(`/companies/${cid}/numbers`, {
                  method: "POST",
                  body: Object.fromEntries(new FormData(e.target)),
                }),
              );
              if (r) {
                setAdding(false);
                setCredentials(r);
              }
            }}
          >
            <label>
              Nome da conexão
              <input
                name="label"
                required
                placeholder="Ex.: Atendimento principal"
              />
            </label>
            <Button type="submit" icon={Plus}>
              Criar conexão
            </Button>
          </form>
        </Modal>
      )}
      {credentials && (
        <Modal
          title="Instale o conector"
          subtitle="Guarde este token. Ele só é exibido uma vez e dá acesso a esta conexão."
          onClose={() => setCredentials(null)}
        >
          <ol className="setup-steps">
            <li>
              No computador do cliente, instale Node.js 24 e baixe este
              repositório.
            </li>
            <li>
              Na pasta <code>connector</code>, execute <code>npm ci</code>.
            </li>
            <li>
              Copie <code>.env.example</code> para <code>.env</code> e
              configure:
            </li>
          </ol>
          <label>
            Endereço da central
            <input readOnly value={window.location.origin} />
          </label>
          <p className="muted small">
            Para outro computador, use o endereço HTTPS público da central, não
            localhost.
          </p>
          <label>
            CONNECTOR_TOKEN
            <input readOnly value={credentials.token} />
          </label>
          <Button
            variant="secondary"
            icon={Copy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(credentials.token);
                notify("Token copiado.");
              } catch {
                notify("Copie o token diretamente do campo.", true);
              }
            }}
          >
            Copiar token
          </Button>
          <p>
            Execute <code>npm start</code>. Depois, abra “Ver QR Code” e
            autorize no WhatsApp.
          </p>
        </Modal>
      )}
      {qr && (
        <Modal
          title="Conectar ao WhatsApp"
          subtitle="No celular: WhatsApp → Aparelhos conectados → Conectar aparelho."
          onClose={() => setQr(null)}
        >
          {qr.status === "online" ? (
            <Empty icon={CheckCircle2} title="WhatsApp conectado">
              Você já pode receber mensagens pelo conector.
            </Empty>
          ) : qr.qr ? (
            <img
              className="qr-image"
              src={qr.qr}
              alt="QR Code para conectar o WhatsApp"
            />
          ) : (
            <Empty icon={WifiOff} title="Aguardando o conector">
              Inicie o serviço na máquina do cliente. O QR Code real aparecerá
              aqui quando estiver disponível.
            </Empty>
          )}
        </Modal>
      )}
      {remove && (
        <Modal
          title="Remover conexão?"
          subtitle="O token será revogado. As conversas serão preservadas e encerradas."
          onClose={() => setRemove(null)}
        >
          <Button
            variant="danger"
            onClick={async () => {
              const r = await act(
                () =>
                  api(`/companies/${cid}/numbers/${remove.id}`, {
                    method: "DELETE",
                  }),
                "Conexão removida.",
              );
              if (r) setRemove(null);
            }}
          >
            Remover {remove.label}
          </Button>
        </Modal>
      )}
    </>
  );
}
function Usage({ data }) {
  const confirmed = data.usage
      .filter((u) => u.kind === "bot" && u.state === "confirmed")
      .reduce((a, u) => a + u.count, 0),
    reserved = data.usage
      .filter((u) => u.kind === "bot" && u.state === "reserved")
      .reduce((a, u) => a + u.count, 0),
    simulation = data.usage
      .filter((u) => u.kind === "simulation")
      .reduce((a, u) => a + u.count, 0);
  return (
    <>
      <PageTitle
        title="Clareza em cada resposta"
        description="Acompanhe a franquia de atendimento e o uso de inteligência artificial."
      />
      <div className="usage-grid">
        <section className="panel usage-main">
          <span className="eyebrow">
            FRANQUIA MENSAL ·{" "}
            {new Date().toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <h2>
            {count(confirmed)}{" "}
            <small>/ {count(data.company.quota)} respostas</small>
          </h2>
          <div className="progress-track">
            <span
              style={{
                width:
                  Math.min(
                    100,
                    (100 * (confirmed + reserved)) /
                      Math.max(1, data.company.quota),
                  ) + "%",
              }}
            />
          </div>
          <div className="progress-label">
            <span>{reserved} reservadas ou com envio a confirmar</span>
            <strong>
              {count(Math.max(0, data.company.quota - confirmed - reserved))}{" "}
              disponíveis
            </strong>
          </div>
          <p className="muted">
            Uma resposta lógica do bot conta uma vez. Mensagens humanas e
            simulações não consomem a franquia.
          </p>
        </section>
        <section className="panel simulation-usage">
          <FlaskConical size={25} />
          <h2>{count(simulation)}</h2>
          <strong>respostas no simulador</strong>
          <p>
            Fora da franquia comercial. Se IA externa estiver configurada, ela
            pode gerar custo de API.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Inteligência artificial</h2>
            <p>
              {data.aiConfigured
                ? "Provedor configurado no servidor."
                : "Modo por regras ativo. Funciona com sua planilha, sem chave de IA."}
            </p>
          </div>
          <Badge tone={data.aiConfigured ? "green" : "neutral"}>
            {data.aiConfigured ? "IA configurada" : "Sem provedor externo"}
          </Badge>
        </div>
        <div className="ai-stats">
          <div>
            <strong>{count(data.ai.calls)}</strong>
            <span>chamadas registradas</span>
          </div>
          <div>
            <strong>{count(data.ai.input)}</strong>
            <span>tokens de entrada</span>
          </div>
          <div>
            <strong>{count(data.ai.output)}</strong>
            <span>tokens de saída</span>
          </div>
          <div>
            <strong>
              {data.ai.cost === null
                ? "Não calculado"
                : new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 4,
                  }).format(data.ai.cost)}
            </strong>
            <span>custo estimado em USD</span>
          </div>
        </div>
      </section>
      <div className="subtle-note">
        <AlertCircle size={17} />
        Tarifas de IA precisam ser configuradas e verificadas pelo
        administrador. Mensalidade, pacotes e cobrança automática ainda não
        estão ativados.
      </div>
    </>
  );
}
function SettingsPage({
  data,
  cid,
  act,
  notify,
  isAdmin,
  setModal,
  onCompanies,
}) {
  const [users, setUsers] = useState([]),
    [adding, setAdding] = useState(false);
  useEffect(() => {
    api(`/companies/${cid}/users`)
      .then(setUsers)
      .catch((e) => notify(e.message, true));
  }, [cid, adding]);
  return (
    <>
      <PageTitle
        title="Do seu jeito, bem organizado"
        description="Gerencie a empresa, os limites da conta e quem participa do atendimento."
      >
        {isAdmin && (
          <Button
            icon={Building2}
            variant="secondary"
            onClick={() => setModal("company")}
          >
            Nova empresa
          </Button>
        )}
      </PageTitle>
      <div className="settings-grid">
        <section className="panel settings-card">
          <h2>Dados da empresa</h2>
          <p className="muted">
            A identidade da central continua sendo cAssistAI.
          </p>
          <form
            key={data.company.id}
            onSubmit={async (e) => {
              e.preventDefault();
              const body = Object.fromEntries(new FormData(e.target));
              body.number_limit = Number(body.number_limit);
              body.quota = Number(body.quota);
              const r = await act(
                () => api(`/companies/${cid}`, { method: "PATCH", body }),
                "Configurações salvas.",
              );
              if (r) onCompanies();
            }}
          >
            <label>
              Nome da empresa
              <input
                name="name"
                required
                defaultValue={data.company.name}
                disabled={!isAdmin}
              />
            </label>
            <label>
              Segmento
              <input
                name="segment"
                defaultValue={data.company.segment}
                disabled={!isAdmin}
              />
            </label>
            <div className="form-grid">
              <label>
                Números permitidos
                <input
                  type="number"
                  min="1"
                  max="100"
                  name="number_limit"
                  required
                  defaultValue={data.company.number_limit}
                  disabled={!isAdmin}
                />
              </label>
              <label>
                Respostas por mês
                <input
                  type="number"
                  min="0"
                  max="10000000"
                  name="quota"
                  required
                  defaultValue={data.company.quota}
                  disabled={!isAdmin}
                />
              </label>
            </div>
            {isAdmin && (
              <Button type="submit" icon={Check}>
                Salvar configurações
              </Button>
            )}
          </form>
        </section>
        <section className="panel settings-card">
          <div className="panel-heading">
            <div>
              <h2>Quem cuida das conversas</h2>
              <p>Funcionários com acesso apenas a esta empresa.</p>
            </div>
            <Users size={21} />
          </div>
          {users.length ? (
            users.map((u) => (
              <div className="user-row" key={u.id}>
                <span className="avatar">{u.name[0]}</span>
                <div>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </div>
                <Badge>Atendente</Badge>
              </div>
            ))
          ) : (
            <p className="muted">
              Nenhum funcionário cadastrado. A conta administradora já tem
              acesso a esta empresa.
            </p>
          )}
          {isAdmin && (
            <Button
              variant="secondary"
              icon={Plus}
              onClick={() => setAdding(true)}
            >
              Adicionar funcionário
            </Button>
          )}
          <div className="settings-note">
            <ShieldCheck size={20} />
            <p>
              O administrador define o plano. Funcionários respondem conversas e
              acompanham orçamentos.
            </p>
          </div>
        </section>
      </div>
      {adding && (
        <Modal
          title="Adicionar funcionário"
          subtitle="Compartilhe a senha por um canal seguro. O funcionário terá acesso somente a esta empresa."
          onClose={() => setAdding(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await act(
                () =>
                  api(`/companies/${cid}/users`, {
                    method: "POST",
                    body: Object.fromEntries(new FormData(e.target)),
                  }),
                "Funcionário cadastrado.",
              );
              if (r) setAdding(false);
            }}
          >
            <label>
              Nome
              <input name="name" required />
            </label>
            <label>
              E-mail
              <input name="email" type="email" required />
            </label>
            <label>
              Senha inicial
              <input
                name="password"
                type="password"
                minLength={10}
                required
                autoComplete="new-password"
              />
            </label>
            <Button type="submit" icon={Plus}>
              Criar acesso
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
