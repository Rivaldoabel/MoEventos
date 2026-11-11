import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  Activity, ArrowDownToLine, ArrowUpRight, CalendarDays, Check, CheckCircle2,
  ChevronDown, CircleHelp, ClipboardList, Clock3, Download, Eye, FileText,
  Globe2, LayoutDashboard, LogOut, Menu, Plus, QrCode, Search, Settings,
  ShieldCheck, Ticket, Trash2, Users, X, XCircle, Camera, ImagePlus, LockKeyhole
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import QRCode from "qrcode";
import type { EventItem, Ticket as TicketItem, ScanLog } from "./types";
import { demoEvents, demoLogs, demoTickets } from "./data/demo";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import Modal from "./components/Modal";
import StatCard from "./components/StatCard";

type Page = "dashboard" | "events" | "guests" | "scanner" | "reports" | "public" | "users";
const nav = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { id: "events", label: "Eventos", icon: CalendarDays },
  { id: "guests", label: "Ingressos e convidados", icon: Ticket },
  { id: "scanner", label: "Leitor QR", icon: QrCode },
  { id: "reports", label: "Relatórios", icon: ClipboardList }
] as const;

const money = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [events, setEvents] = useState<EventItem[]>(demoEvents);
  const [tickets, setTickets] = useState<TicketItem[]>(demoTickets);
  const [logs, setLogs] = useState<ScanLog[]>(demoLogs);
  const [selectedEvent, setSelectedEvent] = useState(demoEvents[0].id);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"event" | "ticket" | "login" | "template" | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scannerCode, setScannerCode] = useState("");
  const [scanResult, setScanResult] = useState<ScanLog | null>(null);
  const [publicMode, setPublicMode] = useState(false);
  const [templateUrl, setTemplateUrl] = useState("");
  const [currentUser, setCurrentUser] = useState("Administrador de demonstração");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const totalUsed = tickets.filter(t => t.status === "used").length;
  const filteredEvents = events.filter(e => (publicMode ? e.visibility === "public" && e.status === "published" : true) && `${e.name} ${e.venue}`.toLowerCase().includes(query.toLowerCase()));
  const selected = events.find(e => e.id === selectedEvent) ?? events[0];

  const chartData = useMemo(() => events.map(e => ({
    name: e.name.length > 17 ? `${e.name.slice(0, 17)}…` : e.name,
    emitidos: tickets.filter(t => t.event_id === e.id).length,
    entradas: tickets.filter(t => t.event_id === e.id && t.status === "used").length
  })), [events, tickets]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    if (!supabase) { flash("Modo de demonstração: configure o Supabase para autenticar utilizadores."); setModal(null); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) flash(error.message);
    else { setCurrentUser(loginEmail); setModal(null); flash("Sessão iniciada."); }
  }

  async function saveEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const item: EventItem = {
      id: editingEvent?.id ?? crypto.randomUUID(),
      name: String(fd.get("name")), description: String(fd.get("description") || ""),
      venue: String(fd.get("venue")), event_date: String(fd.get("event_date")),
      event_time: String(fd.get("event_time") || "18:00"),
      visibility: String(fd.get("visibility")) as EventItem["visibility"],
      status: String(fd.get("status")) as EventItem["status"],
      capacity: Number(fd.get("capacity") || 100),
      ticket_price: Number(fd.get("ticket_price") || 0),
      cover_url: editingEvent?.cover_url, created_at: editingEvent?.created_at ?? new Date().toISOString()
    };
    if (editingEvent) setEvents(old => old.map(x => x.id === item.id ? item : x));
    else { setEvents(old => [item, ...old]); setSelectedEvent(item.id); }
    setModal(null); setEditingEvent(null);
    flash("Evento guardado no modo de demonstração. Ligue o Supabase para persistir os dados.");
  }

  function removeEvent(id: string) {
    if (!window.confirm("Tem a certeza de que pretende remover este evento? Esta acção também removerá os dados de demonstração associados.")) return;
    setEvents(old => old.filter(e => e.id !== id));
    setTickets(old => old.filter(t => t.event_id !== id));
    setLogs(old => old.filter(l => l.event_id !== id));
    if (selectedEvent === id && events.length > 1) setSelectedEvent(events.find(e => e.id !== id)!.id);
    flash("Evento removido da demonstração.");
  }

  async function createTicket(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const eventId = String(fd.get("event_id"));
    const name = String(fd.get("guest_name"));
    const count = Math.max(1, Math.min(50, Number(fd.get("quantity") || 1)));
    const prefix = (events.find(x => x.id === eventId)?.name ?? "MO").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    const newTickets: TicketItem[] = Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(), event_id: eventId, guest_name: count > 1 ? `${name} (${i + 1})` : name,
      guest_email: String(fd.get("guest_email") || ""), code: `MO-${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: "valid", created_at: new Date().toISOString()
    }));
    setTickets(old => [...newTickets, ...old]); setModal(null);
    flash(`${count} ingresso(s) gerado(s) no modo de demonstração.`);
  }

  function validateCode() {
    const code = scannerCode.trim().toUpperCase();
    if (!selectedEvent || !code) return;
    const ticket = tickets.find(t => t.code.toUpperCase() === code);
    let result: ScanLog;
    if (!ticket) result = { id: crypto.randomUUID(), event_id: selectedEvent, guest_name: "Não identificado", code, result: "RECUSADO", reason: "Código inexistente.", operator_name: currentUser, scanned_at: new Date().toISOString() };
    else if (ticket.event_id !== selectedEvent) result = { id: crypto.randomUUID(), event_id: selectedEvent, ticket_id: ticket.id, guest_name: ticket.guest_name, code, result: "RECUSADO", reason: "Este ingresso pertence a outro evento.", operator_name: currentUser, scanned_at: new Date().toISOString() };
    else if (ticket.status === "used") result = { id: crypto.randomUUID(), event_id: selectedEvent, ticket_id: ticket.id, guest_name: ticket.guest_name, code, result: "RECUSADO", reason: "Este ingresso já foi utilizado.", operator_name: currentUser, scanned_at: new Date().toISOString() };
    else if (ticket.status !== "valid") result = { id: crypto.randomUUID(), event_id: selectedEvent, ticket_id: ticket.id, guest_name: ticket.guest_name, code, result: "RECUSADO", reason: "Este ingresso não está activo.", operator_name: currentUser, scanned_at: new Date().toISOString() };
    else {
      setTickets(old => old.map(t => t.id === ticket.id ? { ...t, status: "used", used_at: new Date().toISOString() } : t));
      result = { id: crypto.randomUUID(), event_id: selectedEvent, ticket_id: ticket.id, guest_name: ticket.guest_name, code, result: "ACEITE", reason: "Entrada autorizada.", operator_name: currentUser, scanned_at: new Date().toISOString() };
    }
    setLogs(old => [result, ...old]); setScanResult(result); setScannerCode("");
  }

  async function downloadTicket(ticket: TicketItem) {
    const dataUrl = await QRCode.toDataURL(ticket.code, { width: 260, margin: 1, color: { dark: "#292929", light: "#FFFFFF" } });
    const w = window.open("", "_blank", "width=520,height=650");
    if (!w) { flash("Permita janelas de pop-up para imprimir o ingresso."); return; }
    w.document.write(`<html><head><title>Ingresso ${ticket.code}</title><style>body{font-family:Arial;padding:30px;text-align:center;color:#292929}.ticket{border:2px dashed #BD4812;border-radius:18px;padding:28px;max-width:390px;margin:auto}img{width:190px}small{color:#777}</style></head><body><div class="ticket"><h1>MO EVENTOS</h1><h2>${ticket.guest_name}</h2><p>${events.find(e=>e.id===ticket.event_id)?.name ?? "Evento"}</p><img src="${dataUrl}"/><h3>${ticket.code}</h3><small>Apresente este código à entrada.</small></div><script>window.print()</script></body></html>`);
    w.document.close();
  }

  function renderDashboard() {
    return <>
      <div className="page-heading"><div><span className="eyebrow">PAINEL DE CONTROLO</span><h1>Visão geral</h1><p>Acompanhe o desempenho dos seus eventos.</p></div><button className="btn btn-primary" onClick={() => { setEditingEvent(null); setModal("event"); }}><Plus size={17}/> Novo evento</button></div>
      <div className="stats-grid">
        <StatCard label="Total de eventos" value={events.length} note={`${events.filter(e => e.status === "published").length} publicados`} icon={CalendarDays}/>
        <StatCard label="Ingressos emitidos" value={tickets.length} note="Total de convites e bilhetes" icon={Ticket} tone="slate"/>
        <StatCard label="Entradas validadas" value={totalUsed} note={`${tickets.length ? Math.round(totalUsed / tickets.length * 100) : 0}% dos emitidos`} icon={CheckCircle2} tone="green"/>
        <StatCard label="Leituras recusadas" value={logs.filter(l => l.result === "RECUSADO").length} note="Registos de acesso" icon={XCircle} tone="red"/>
      </div>
      <div className="content-grid dashboard-grid">
        <section className="panel chart-panel"><div className="panel-heading"><div><h2>Actividade por evento</h2><p>Ingressos emitidos e entradas validadas</p></div><span className="subtle-tag">Visão geral</span></div>
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} barGap={8}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECEDEF"/><XAxis dataKey="name" tick={{fontSize:11,fill:"#85888D"}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:"#85888D"}} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="emitidos" name="Emitidos" fill="#BD4812" radius={[5,5,0,0]}/><Bar dataKey="entradas" name="Validados" fill="#343A40" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>
        </section>
        <section className="panel"><div className="panel-heading"><div><h2>Próximos eventos</h2><p>Eventos publicados</p></div><button className="text-btn" onClick={() => setPage("events")}>Ver todos <ArrowUpRight size={14}/></button></div>
          <div className="mini-event-list">{events.filter(e => e.status === "published").slice(0, 4).map(e => <div className="mini-event" key={e.id}><div className="date-tile"><b>{new Date(`${e.event_date}T12:00:00`).getDate()}</b><small>{new Date(`${e.event_date}T12:00:00`).toLocaleDateString("pt-PT",{month:"short"}).replace(".","")}</small></div><div className="mini-event-info"><b>{e.name}</b><small>{e.venue}</small></div><span className="mini-count">{tickets.filter(t=>t.event_id===e.id).length}</span></div>)}</div>
        </section>
      </div>
      <section className="panel"><div className="panel-heading"><div><h2>Actividade recente</h2><p>Últimas operações de validação</p></div><button className="text-btn" onClick={() => setPage("reports")}>Consultar histórico <ArrowUpRight size={14}/></button></div><LogTable logs={logs.slice(0, 5)} events={events}/></section>
    </>;
  }

  function renderEvents() {
    return <>
      <div className="page-heading"><div><span className="eyebrow">ORGANIZAÇÃO</span><h1>Eventos</h1><p>Crie, publique e gira os seus eventos.</p></div><button className="btn btn-primary" onClick={() => { setEditingEvent(null); setModal("event"); }}><Plus size={17}/> Adicionar evento</button></div>
      <div className="toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar eventos..."/></div><span className="result-count">{filteredEvents.length} evento(s)</span></div>
      <div className="event-grid">{filteredEvents.map(e=><article className="event-card" key={e.id}><div className="event-cover" style={{background: e.cover_url ? `linear-gradient(90deg,#1f242bcc,#1f242b55),url(${e.cover_url}) center/cover` : undefined}}><span className={`status-pill ${e.status}`}>{e.status === "published" ? "Publicado" : e.status === "draft" ? "Rascunho" : e.status === "completed" ? "Concluído" : "Cancelado"}</span><span className="visibility-pill">{e.visibility === "public" ? <><Globe2 size={12}/> Público</> : <><LockKeyhole size={12}/> Privado</>}</span><div className="cover-title">{e.name}</div></div><div className="event-card-body"><div className="event-meta"><span><CalendarDays size={14}/>{fmtDate(e.event_date)}</span><span><Clock3 size={14}/>{e.event_time}</span></div><p className="event-venue">{e.venue}</p><div className="event-card-foot"><span><Users size={15}/> {tickets.filter(t=>t.event_id===e.id).length} ingressos</span><div className="inline-actions"><button className="icon-btn" title="Editar" onClick={()=>{setEditingEvent(e);setModal("event");}}><Settings size={16}/></button><button className="icon-btn danger-hover" title="Eliminar" onClick={()=>removeEvent(e.id)}><Trash2 size={16}/></button></div></div></div></article>)}</div>
    </>;
  }

  function renderGuests() {
    const list = tickets.filter(t => (!selectedEvent || t.event_id === selectedEvent) && `${t.guest_name} ${t.code}`.toLowerCase().includes(query.toLowerCase()));
    return <>
      <div className="page-heading"><div><span className="eyebrow">PARTICIPANTES</span><h1>Ingressos e convidados</h1><p>Emita convites individuais e gira os ingressos.</p></div><button className="btn btn-primary" onClick={()=>setModal("ticket")}><Plus size={17}/> Emitir ingressos</button></div>
      <div className="filter-row"><label className="select-wrap"><CalendarDays size={16}/><select value={selectedEvent} onChange={e=>setSelectedEvent(e.target.value)}>{events.map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select><ChevronDown size={14}/></label><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar convidado ou código..."/></div></div>
      <section className="panel table-panel"><div className="panel-heading"><div><h2>Lista de ingressos</h2><p>{list.length} registo(s) encontrados</p></div><button className="btn btn-secondary btn-sm" onClick={()=>flash("A exportação CSV será activada na próxima iteração.")}><Download size={15}/> Exportar</button></div><div className="table-scroll"><table><thead><tr><th>Convidado</th><th>Código</th><th>Evento</th><th>Estado</th><th>Emissão</th><th></th></tr></thead><tbody>{list.map(t=><tr key={t.id}><td><b>{t.guest_name}</b><small>{t.guest_email || "Sem correio electrónico"}</small></td><td><code>{t.code}</code></td><td>{events.find(e=>e.id===t.event_id)?.name ?? "—"}</td><td><TicketStatus status={t.status}/></td><td>{new Date(t.created_at).toLocaleDateString("pt-PT")}</td><td><button className="icon-btn" title="Imprimir ingresso" onClick={()=>downloadTicket(t)}><ArrowDownToLine size={16}/></button></td></tr>)}</tbody></table></div></section>
    </>;
  }

  function renderScanner() {
    return <>
      <div className="page-heading"><div><span className="eyebrow">CONTROLO DE ACESSO</span><h1>Leitor QR</h1><p>Seleccione primeiro o evento que pretende validar.</p></div><span className="online-indicator"><i/> Sistema pronto</span></div>
      <div className="scanner-layout"><section className="panel scanner-panel"><div className="panel-heading"><div><h2>Evento em validação</h2><p>Os ingressos de outros eventos serão recusados.</p></div><ShieldCheck color="#BD4812"/></div><label className="field-label">Seleccionar evento</label><select className="input-control event-select" value={selectedEvent} onChange={e=>{setSelectedEvent(e.target.value);setScanResult(null);}}>{events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <div className="scanner-frame"><div className="scan-corners"><QrCode size={82} strokeWidth={1.1}/></div><b>Leitura por câmara</b><small>Utilize um dispositivo com câmara e permita o acesso no navegador.</small><button className="btn btn-secondary" onClick={()=>flash("A leitura pela câmara será activada com a integração de um leitor compatível. Utilize por enquanto a validação por código.")}><Camera size={16}/> Activar câmara</button></div>
        <div className="or-divider"><span>OU INTRODUZA O CÓDIGO</span></div><div className="code-entry"><input value={scannerCode} onChange={e=>setScannerCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&validateCode()} placeholder="Ex.: MO-TEC-0001"/><button className="btn btn-primary" onClick={validateCode}><QrCode size={17}/> Validar</button></div>
        {scanResult && <div className={`scan-feedback ${scanResult.result==="ACEITE"?"accepted":"rejected"}`}>{scanResult.result==="ACEITE"?<CheckCircle2 size={27}/>:<XCircle size={27}/>}<div><b>{scanResult.result==="ACEITE"?"ENTRADA AUTORIZADA":"ENTRADA RECUSADA"}</b><strong>{scanResult.guest_name}</strong><small>{scanResult.reason}</small><small>{scanResult.code}</small></div></div>}
      </section><aside className="panel scanner-side"><h2>Resumo do evento</h2><p className="muted">{selected?.name}</p><div className="scanner-stat"><span>Ingressos emitidos</span><b>{tickets.filter(t=>t.event_id===selectedEvent).length}</b></div><div className="scanner-stat"><span>Entradas validadas</span><b className="green-text">{tickets.filter(t=>t.event_id===selectedEvent&&t.status==="used").length}</b></div><div className="scanner-stat"><span>Por validar</span><b>{tickets.filter(t=>t.event_id===selectedEvent&&t.status==="valid").length}</b></div><div className="scanner-stat"><span>Leituras recusadas</span><b className="red-text">{logs.filter(l=>l.event_id===selectedEvent&&l.result==="RECUSADO").length}</b></div><div className="notice-box"><ShieldCheck size={17}/><span>A validação está limitada ao evento seleccionado.</span></div></aside></div>
    </>;
  }

  function renderReports() {
    return <>
      <div className="page-heading"><div><span className="eyebrow">ANÁLISE E AUDITORIA</span><h1>Relatórios</h1><p>Consulte o histórico de entradas e operações.</p></div><button className="btn btn-secondary" onClick={()=>downloadCSV(logs, events)}><Download size={16}/> Exportar CSV</button></div>
      <div className="stats-grid compact-stats"><StatCard label="Leituras totais" value={logs.length} note="Todas as operações" icon={Activity}/><StatCard label="Aceites" value={logs.filter(l=>l.result==="ACEITE").length} note="Entradas autorizadas" icon={CheckCircle2} tone="green"/><StatCard label="Recusadas" value={logs.filter(l=>l.result==="RECUSADO").length} note="Entradas não autorizadas" icon={XCircle} tone="red"/></div>
      <section className="panel table-panel"><div className="panel-heading"><div><h2>Histórico de validações</h2><p>Registo cronológico de leituras</p></div></div><LogTable logs={logs} events={events}/></section>
    </>;
  }

  function renderPublic() {
    return <>
      <div className="public-hero"><div><span className="eyebrow light">DESCUBRA • PARTICIPE • VIVA</span><h1>Os seus próximos<br/><em>momentos começam aqui.</em></h1><p>Encontre eventos, escolha o seu ingresso e prepare-se para viver novas experiências.</p><button className="btn btn-light" onClick={()=>document.getElementById("public-events")?.scrollIntoView({behavior:"smooth"})}>Explorar eventos <ArrowUpRight size={16}/></button></div><div className="hero-art"><div className="hero-ticket"><Ticket size={54}/><b>VIVA A EXPERIÊNCIA</b><small>O próximo evento espera por si.</small><div className="hero-dots"/></div></div></div>
      <div className="public-list-head" id="public-events"><div><span className="eyebrow">AGENDA</span><h2>Eventos em destaque</h2></div><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar eventos..."/></div></div>
      <div className="event-grid public-grid">{filteredEvents.map(e=><article className="event-card" key={e.id}><div className="event-cover public-cover"><span className="status-pill published">Em destaque</span><div className="cover-title">{e.name}</div></div><div className="event-card-body"><div className="event-meta"><span><CalendarDays size={14}/>{fmtDate(e.event_date)}</span><span><Clock3 size={14}/>{e.event_time}</span></div><p className="event-venue">{e.venue}</p><div className="public-buy-row"><b>{e.ticket_price ? money(e.ticket_price) : "Entrada gratuita"}</b><button className="btn btn-primary btn-sm" onClick={()=>flash("A compra online será ligada após a integração de um prestador de pagamentos.")}>Ver evento <ArrowUpRight size={14}/></button></div></div></article>)}</div>
    </>;
  }

  function renderUsers() {
    return <>
      <div className="page-heading"><div><span className="eyebrow">ACESSO E SEGURANÇA</span><h1>Utilizadores</h1><p>Gestão de perfis e responsabilidades por evento.</p></div><button className="btn btn-primary" onClick={()=>flash("A criação segura de utilizadores será feita por uma Edge Function protegida. Consulte a documentação.")}><Plus size={17}/> Adicionar utilizador</button></div>
      <div className="notice-box large"><ShieldCheck size={20}/><div><b>Gestão de permissões protegida</b><span>As contas e funções administrativas devem ser criadas no servidor. Nunca atribua privilégios apenas no navegador.</span></div></div>
      <section className="panel"><div className="panel-heading"><div><h2>Modelo de permissões</h2><p>Perfis previstos para a plataforma</p></div></div><div className="permission-list"><div><div className="permission-icon"><ShieldCheck/></div><div><b>Administrador da plataforma</b><small>Gestão global de utilizadores, eventos e configurações.</small></div><span className="role-tag">Global</span></div><div><div className="permission-icon"><CalendarDays/></div><div><b>Administrador de evento</b><small>Gere os eventos que lhe foram atribuídos.</small></div><span className="role-tag">Por evento</span></div><div><div className="permission-icon"><QrCode/></div><div><b>Operador</b><small>Valida ingressos apenas nos eventos autorizados.</small></div><span className="role-tag">Leitura</span></div></div></section>
    </>;
  }

  return <div className="app-shell">
    {sidebarOpen && <div className="mobile-overlay" onClick={()=>setSidebarOpen(false)}/>}
    <aside className={`sidebar ${sidebarOpen?"open":""}`}>
      <div className="brand"><div className="brand-mark"><Ticket size={21}/></div><div><b>MO EVENTOS</b><small>GESTÃO DE EVENTOS</small></div><button className="mobile-close icon-btn" onClick={()=>setSidebarOpen(false)}><X/></button></div>
      <div className="workspace"><div className="workspace-avatar">MO</div><div><b>Meu espaço</b><small>Plano de demonstração</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav className="side-nav">{nav.map(item=><button key={item.id} className={`nav-item ${page===item.id?"active":""}`} onClick={()=>{setPage(item.id);setPublicMode(false);setSidebarOpen(false);}}><item.icon size={18}/><span>{item.label}</span>{item.id==="scanner"&&<span className="nav-live"/>}</button>)}</nav>
      <div className="nav-label secondary-label">PLATAFORMA</div>
      <nav className="side-nav"><button className={`nav-item ${page==="users"?"active":""}`} onClick={()=>{setPage("users");setPublicMode(false);setSidebarOpen(false);}}><Users size={18}/><span>Utilizadores</span></button><button className={`nav-item ${page==="public"?"active":""}`} onClick={()=>{setPage("public");setPublicMode(true);setSidebarOpen(false);}}><Globe2 size={18}/><span>Área pública</span><ArrowUpRight size={14} className="nav-external"/></button></nav>
      <div className="sidebar-bottom"><div className="help-card"><CircleHelp size={18}/><div><b>Precisa de ajuda?</b><small>Consulte o guia da plataforma.</small></div></div><div className="user-profile"><div className="profile-avatar">RA</div><div><b>{currentUser}</b><small>Administrador</small></div><button className="icon-btn" title="Terminar sessão" onClick={async()=>{await supabase?.auth.signOut();setCurrentUser("Administrador de demonstração");flash("Sessão terminada.");}}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-btn" onClick={()=>setSidebarOpen(true)}><Menu/></button><span className="breadcrumb">Plataforma <b>/</b> {page==="dashboard"?"Visão geral":page==="events"?"Eventos":page==="guests"?"Ingressos e convidados":page==="scanner"?"Leitor QR":page==="reports"?"Relatórios":page==="public"?"Área pública":"Utilizadores"}</span></div><div className="topbar-actions"><span className={`environment ${isSupabaseConfigured?"connected":"demo"}`}><i/>{isSupabaseConfigured?"Supabase ligado":"Modo demonstração"}</span><button className="icon-btn top-help" title="Ajuda" onClick={()=>flash("Consulte o README.md para instalar e configurar a plataforma.")}><CircleHelp size={18}/></button><button className="top-avatar" onClick={()=>setModal("login")}>RA</button></div></header>
      <div className={`page-content ${page==="public"?"public-content":""}`}>{page==="dashboard"?renderDashboard():page==="events"?renderEvents():page==="guests"?renderGuests():page==="scanner"?renderScanner():page==="reports"?renderReports():page==="public"?renderPublic():renderUsers()}</div>
      <footer className="app-footer"><span>© 2026 MO EVENTOS. Todos os direitos reservados.</span><span>Concepção, identidade visual e desenvolvimento: <b>Rivaldo Abel</b></span></footer>
    </main>
    {notice && <div className="toast"><CheckCircle2 size={18}/>{notice}<button onClick={()=>setNotice("")}><X size={15}/></button></div>}
    {modal==="event"&&<Modal title={editingEvent?"Editar evento":"Adicionar evento"} onClose={()=>setModal(null)}><form className="form-stack" onSubmit={saveEvent}><label>Nome do evento<input className="input-control" name="name" required defaultValue={editingEvent?.name}/></label><label>Descrição<textarea className="input-control" name="description" rows={3} defaultValue={editingEvent?.description}/></label><div className="form-two"><label>Data<input className="input-control" type="date" name="event_date" required defaultValue={editingEvent?.event_date}/></label><label>Hora<input className="input-control" type="time" name="event_time" defaultValue={editingEvent?.event_time??"18:00"}/></label></div><label>Local<input className="input-control" name="venue" required defaultValue={editingEvent?.venue}/></label><div className="form-two"><label>Visibilidade<select className="input-control" name="visibility" defaultValue={editingEvent?.visibility??"public"}><option value="public">Público</option><option value="private">Privado</option></select></label><label>Estado<select className="input-control" name="status" defaultValue={editingEvent?.status??"draft"}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></label></div><div className="form-two"><label>Capacidade<input className="input-control" name="capacity" type="number" min="1" defaultValue={editingEvent?.capacity??100}/></label><label>Preço (Kz)<input className="input-control" name="ticket_price" type="number" min="0" defaultValue={editingEvent?.ticket_price??0}/></label></div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" type="submit">Guardar evento</button></div></form></Modal>}
    {modal==="ticket"&&<Modal title="Emitir ingressos" onClose={()=>setModal(null)}><form className="form-stack" onSubmit={createTicket}><label>Evento<select className="input-control" name="event_id" defaultValue={selectedEvent}>{events.map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select></label><label>Nome do convidado/comprador<input className="input-control" name="guest_name" required placeholder="Nome completo"/></label><label>Correio electrónico<input className="input-control" type="email" name="guest_email" placeholder="nome@exemplo.com"/></label><label>Quantidade<input className="input-control" name="quantity" type="number" min="1" max="50" defaultValue="1"/></label><div className="notice-box"><QrCode size={18}/><span>Cada ingresso recebe um código único e um QR Code próprio.</span></div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button type="submit" className="btn btn-primary">Gerar ingressos</button></div></form></Modal>}
    {modal==="login"&&<Modal title="Iniciar sessão" onClose={()=>setModal(null)}><form className="form-stack" onSubmit={login}><p className="muted">Utilize as credenciais da sua conta Supabase.</p><label>Correio electrónico<input className="input-control" type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required/></label><label>Palavra-passe<input className="input-control" type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} required/></label><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary">Entrar</button></div></form></Modal>}
  </div>;
}

function TicketStatus({status}:{status:TicketItem["status"]}) {
  const labels = { valid:"Válido", used:"Utilizado", cancelled:"Cancelado", pending:"Pendente" };
  return <span className={`ticket-status ${status}`}>{labels[status]}</span>;
}
function LogTable({logs,events}:{logs:ScanLog[];events:EventItem[]}) {
  if (!logs.length) return <div className="empty-state"><ClipboardList size={30}/><b>Sem registos</b><span>As validações efectuadas aparecerão aqui.</span></div>;
  return <div className="table-scroll"><table><thead><tr><th>Convidado</th><th>Evento</th><th>Resultado</th><th>Operador</th><th>Data e hora</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}><td><b>{l.guest_name}</b><small>{l.code}</small></td><td>{events.find(e=>e.id===l.event_id)?.name??"—"}</td><td><span className={`result-pill ${l.result==="ACEITE"?"ok":"no"}`}>{l.result==="ACEITE"?<Check size={13}/>:<X size={13}/>} {l.result}</span><small>{l.reason}</small></td><td>{l.operator_name}</td><td>{new Date(l.scanned_at).toLocaleString("pt-PT")}</td></tr>)}</tbody></table></div>;
}
function downloadCSV(logs:ScanLog[], events:EventItem[]) {
  const rows = [["Convidado","Código","Evento","Resultado","Motivo","Operador","Data"]];
  logs.forEach(l=>rows.push([l.guest_name,l.code,events.find(e=>e.id===l.event_id)?.name??"",l.result,l.reason,l.operator_name,new Date(l.scanned_at).toLocaleString("pt-PT")]));
  const csv = "\uFEFF"+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));a.download="mo-eventos-relatorio.csv";a.click();URL.revokeObjectURL(a.href);
}
