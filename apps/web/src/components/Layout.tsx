import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowRightLeft,
  Network,
  ShieldAlert,
  BarChart3,
  Sparkles,
  Settings as SettingsIcon,
  ChevronDown,
  Sparkle,
  ArrowUpRight,
  LogOut,
  Building2,
  CheckCircle2,
  Lock,
  MessageSquare,
  X,
  Send,
  Bot,
  User as UserIcon,
  Cpu,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Logo, AnimatedBackground } from './ui/index.ts';
import { FormattedMessage } from './FormattedMessage.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';

const navItems = [
  { name: 'Risk Overview', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Transactions', path: '/transactions', icon: ArrowRightLeft },
  { name: 'Abuse Rings', path: '/abuse-rings', icon: Network, isHero: true },
  { name: 'Risk Cases', path: '/risk-cases', icon: ShieldAlert },
  { name: 'Analytics', path: '/analytics', icon: BarChart3 },
  { name: 'AI Investigation', path: '/investigation', icon: Sparkles },
];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  evidenceCards?: Array<{ title: string; details: string; severity?: string }>;
}

const SUGGESTED_CHIPS = [
  'Why is Abuse Ring #000 critical?',
  'How many fraud rings are active?',
  'Show open risk cases',
  'What is my detection accuracy?',
  'Explain the latest chargeback pattern',
];

// ─────────────────────────────────────────────────────────────
// AI Chat Panel
// ─────────────────────────────────────────────────────────────
function AIChatPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hi! I'm SafeRo AI. Ask me anything about your fraud rings, transactions, risk cases, or platform metrics. I'll give you grounded answers backed by live data.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  const sendMessage = async (text?: string) => {
    const queryText = (text || input).trim();
    if (!queryText || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: queryText,
      timestamp: new Date(),
    };

    // Build conversation history to send (exclude welcome message, only real turns)
    const history = messages
      .filter((m) => m.id !== 'welcome' && m.id !== 'welcome-reset')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.chatWithAI([
        ...history,
        { role: 'user', content: queryText },
      ]);

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.content || 'I processed your request but received an empty response.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Could not reach SafeRo AI: ${err?.message || 'server error'}. Make sure the API server is running and your GROQ_API_KEY is set in .env.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: "Hi! I'm SafeRo AI. Ask me anything about your fraud rings, transactions, risk cases, or platform metrics.",
        timestamp: new Date(),
      },
    ]);
    setInput('');
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/10 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Chat Panel */}
      <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] flex flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10 overflow-hidden animate-fadeIn"
        style={{ height: 'min(560px, calc(100vh - 120px))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-900 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center shadow-md shadow-orange-500/20">
              <Sparkle className="h-4 w-4 text-white fill-white/50" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">SafeRo AI <span className="text-orange-400 font-mono text-[10px] ml-1">× Groq</span></p>
              <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                Groq LPU · Live data
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleReset}
              title="Clear chat"
              className="h-7 w-7 rounded-full text-slate-400 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="h-7 w-7 rounded-full text-slate-400 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* Avatar */}
              <div className={`h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${msg.role === 'user'
                ? 'bg-gradient-to-tr from-orange-600 via-amber-500 to-indigo-600'
                : 'bg-slate-100 border border-slate-200'
                }`}>
                {msg.role === 'user'
                  ? <span className="text-white text-[9px]">GB</span>
                  : <Bot className="h-3.5 w-3.5 text-orange-600" />
                }
              </div>

              <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Bubble */}
                <div className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${msg.role === 'user'
                  ? 'bg-slate-950 text-white rounded-tr-sm'
                  : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-sm'
                  }`}>
                  <FormattedMessage content={msg.content} isUser={msg.role === 'user'} />
                </div>

                {/* Evidence Cards */}
                {msg.evidenceCards && msg.evidenceCards.length > 0 && (
                  <div className="space-y-1.5 w-full">
                    {msg.evidenceCards.map((ec, i) => (
                      <div
                        key={i}
                        className={`rounded-xl border px-3 py-2 text-[11px] ${ec.severity === 'critical'
                          ? 'border-rose-200 bg-rose-50'
                          : ec.severity === 'high'
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-slate-200 bg-white'
                          }`}
                      >
                        <p className={`font-bold mb-0.5 ${ec.severity === 'critical' ? 'text-rose-800' :
                          ec.severity === 'high' ? 'text-amber-800' : 'text-slate-800'
                          }`}>{ec.title}</p>
                        <p className="text-slate-500 leading-relaxed">{ec.details}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Timestamp */}
                <span className="text-[10px] text-slate-400 px-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-2.5 flex-row">
              <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-bounce" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggested Chips — only when only welcome msg exists */}
        {messages.length === 1 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
            {SUGGESTED_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 hover:border-orange-300 hover:bg-orange-50 hover:text-slate-950 transition-all cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-slate-100 shrink-0">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-orange-300 focus-within:bg-white transition-colors">
            <Cpu className="h-4 w-4 text-orange-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about fraud rings, cases, patterns..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              disabled={loading}
              className="flex-1 bg-transparent text-xs text-slate-900 placeholder-slate-400 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="h-7 w-7 rounded-full bg-slate-950 hover:bg-black disabled:opacity-30 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <Send className="h-3.5 w-3.5 text-orange-400" />
            </button>
          </div>
          <p className="text-center text-[10px] text-slate-400 mt-2 font-mono">
            Answers grounded in live database records
          </p>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Layout
// ─────────────────────────────────────────────────────────────
export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, environment, setEnvironment } = useAuth();
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Derive display values from auth user
  const displayName = user?.name ?? 'Demo Analyst';
  const displayEmail = user?.email ?? 'demo@safero.ai';
  const displayRole = user?.role ?? 'Risk Analyst';
  const nameParts = displayName.split(' ');
  const firstName = nameParts[0] ?? '';
  const lastNameInitial = nameParts[1]?.[0] ? `${nameParts[1][0]}.` : '';
  const displayShortName = `${firstName} ${lastNameInitial}`.trim();
  const displayInitials = nameParts
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: Ctrl+K / Cmd+K to open chat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setChatOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-slate-900 flex flex-col relative selection:bg-orange-500/20 selection:text-orange-900">
      <AnimatedBackground />

      {/* Floating Pill Top Navigation Bar */}
      <div className="sticky top-3 z-50 max-w-6xl w-full mx-auto px-4">
        <header className="rounded-full border border-slate-200/90 bg-white/95 backdrop-blur-xl px-5 py-2.5 shadow-lg shadow-slate-900/[0.04] flex items-center justify-between transition-all">
          {/* Left: Brand + Space Selector */}
          <div className="flex items-center gap-3">
            <NavLink to="/dashboard" className="flex items-center gap-2 group">
              <Logo size="sm" withSubtitle={false} />
            </NavLink>

            <span className="text-slate-300 text-xs hidden sm:inline">|</span>

            {/* Static Environment Status Badge (Locked to user account type) */}
            <div className="relative hidden sm:block">
              {user?.isDemo ? (
                <div className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50/80 px-3 py-1 text-xs text-orange-900 font-semibold shadow-2xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                  <span className="text-[11px] font-bold">Demo Sandbox (Testbed Dataset)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs text-emerald-900 font-semibold shadow-2xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-bold">Live Store Active</span>
                </div>
              )}
            </div>
          </div>

          {/* Center: Segmented Navigation Capsule */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150 ${isActive
                    ? 'bg-slate-950 text-white shadow-md shadow-slate-950/20'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/80'
                    }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-orange-400' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                  {item.isHero && !isActive && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping" />
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Right: Settings + User */}
          <div className="flex items-center gap-2">

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors border ${isActive ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-transparent'
                }`
              }
              title="Platform Settings"
            >
              <SettingsIcon className="h-4 w-4" />
            </NavLink>

            {/* User Details Pill & Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-full border border-slate-200/90 bg-slate-50/80 hover:bg-white hover:border-slate-300 p-1 pr-3 transition-all cursor-pointer shadow-sm group"
                title="User Profile & Merchant Account"
              >
                <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-orange-600 via-amber-500 to-indigo-600 p-[1.5px] shadow-sm shadow-orange-500/20">
                  <div className="h-full w-full rounded-full bg-slate-950 flex items-center justify-center text-[10px] font-bold text-white">
                    {displayInitials}
                  </div>
                </div>

                <div className="hidden sm:flex flex-col text-left justify-center leading-tight gap-0.5">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-orange-600 transition-colors truncate max-w-[100px]">
                    {displayShortName}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 capitalize tracking-tight">{displayRole}</span>
                </div>

                <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* User Details Dropdown */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl z-50 animate-fadeIn space-y-3.5 text-slate-900">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-orange-600 via-amber-500 to-indigo-600 p-[2px] shadow-md shadow-orange-500/20 shrink-0">
                      <div className="h-full w-full rounded-full bg-slate-950 flex items-center justify-center text-xs font-bold text-white">
                        {displayInitials}
                      </div>
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-extrabold text-slate-950 truncate font-display-serif">{displayName}</h4>
                        {user?.isDemo ? (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">
                            <Zap className="h-2.5 w-2.5" />DEMO
                          </span>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate font-mono">{displayEmail}</p>
                      <span className="inline-block mt-0.5 text-[9px] font-mono font-bold bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded-full">
                        {displayRole}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-slate-400" /> Merchant ID:
                      </span>
                      <span className="font-mono font-bold text-slate-900">{user?.isDemo ? 'm_demo_testbed' : (user?.id ? `m_${user.id.slice(0, 10)}` : 'm_ecommerce_01')}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>Surveillance Tier:</span>
                      <span className="font-semibold text-indigo-700">Enterprise AI</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>Security:</span>
                      <span className="flex items-center gap-1 text-emerald-700 font-medium">
                        <Lock className="h-2.5 w-2.5" /> 2FA Verified
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 pt-1 text-xs">
                    <NavLink
                      to="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <SettingsIcon className="h-3.5 w-3.5 text-slate-500" />
                        <span>Platform Settings</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Policy</span>
                    </NavLink>

                    <button
                      onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <LogOut className="h-3.5 w-3.5 text-rose-500" />
                        <span>Sign Out</span>
                      </span>
                      <span className="text-[10px] font-mono text-rose-400">
                        {user?.isDemo ? 'Demo' : 'Secure'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
      </div>

      {/* Mobile Navigation Drawer */}
      <div className="lg:hidden flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 backdrop-blur-md px-3 py-2 mt-4 z-40">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${isActive
                ? 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              <Icon className="h-3 w-3" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </div>

      {/* Main Canvas Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12 z-10">
        <Outlet />
      </main>

      {/* ── GLOBAL AI CHAT BUTTON ─────────────────────────────── */}
      <button
        onClick={() => setChatOpen((prev) => !prev)}
        title="Ask SafeRo AI (Ctrl+K)"
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full px-4 py-3 shadow-2xl shadow-orange-500/20 transition-all duration-200 cursor-pointer group ${chatOpen
          ? 'bg-slate-950 text-white'
          : 'bg-gradient-to-r from-orange-600 to-amber-500 text-white hover:from-orange-700 hover:to-amber-600'
          }`}
      >
        {chatOpen ? (
          <>
            <X className="h-5 w-5" />
            <span className="text-sm font-bold hidden sm:inline">Close</span>
          </>
        ) : (
          <>
            <div className="relative">
              <MessageSquare className="h-5 w-5" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 border border-orange-500" />
            </div>
            <span className="text-sm font-bold hidden sm:inline">Ask SafeRo AI</span>
            <kbd className="hidden sm:inline text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white/80">⌘K</kbd>
          </>
        )}
      </button>

      {/* ── AI CHAT PANEL ─────────────────────────────────────── */}
      <AIChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
