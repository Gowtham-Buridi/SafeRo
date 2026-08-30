import { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  Sparkle,
  Send,
  RotateCcw,
  Zap,
  User as UserIcon,
  Bot,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Layers,
  Copy,
  Check,
} from 'lucide-react';
import { PageHeader, Card, Badge, LogoMark } from '../components/ui/index.ts';
import { FormattedMessage } from '../components/FormattedMessage.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function Investigation() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoSubmitted = useRef(false);

  const suggestedQuestions = [
    'Why is Abuse Ring #000 flagged as critical risk?',
    'What evidence links customer c8f1 to other merchant accounts?',
    'Show chargeback exposure and dispute correlation with abuse clusters',
    'Summarize platform baseline surveillance and test evaluation metrics',
  ];

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle pre-filled initial query from router state or URL query parameters
  useEffect(() => {
    if (hasAutoSubmitted.current) return;
    const urlQuery = searchParams.get('q') || searchParams.get('query');
    const stateQuery = location.state?.initialQuery;
    const initialQuery = urlQuery || stateQuery;

    if (initialQuery && typeof initialQuery === 'string' && initialQuery.trim()) {
      hasAutoSubmitted.current = true;
      handleSend(initialQuery.trim());
    }
  }, [location.state, searchParams]);

  const handleSend = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: queryText,
      timestamp: new Date(),
    };

    // Prepare history for multi-turn conversational context
    const conversationHistory = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: queryText },
    ];

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.chatWithAI(conversationHistory);
      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.content || 'Analysis complete with no additional anomalies found.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Failed to reach SafeRo AI: ${err?.message || 'Server error'}. Please verify that the API server is active with GROQ_API_KEY.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const userInitials = (user?.name || 'Risk Analyst')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24">
      {/* Header with Clear Chat action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          tag="SOVEREIGN AI WORKSPACE [ 06 / INVESTIGATION · GROQ LPU ]"
          title="AI Risk Investigation Workspace"
          description="Interactive multi-turn fraud forensics grounded in deterministic graph telemetry"
        />

        {messages.length > 0 && (
          <button
            onClick={handleReset}
            className="self-start sm:self-auto flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
            <span>New Investigation</span>
          </button>
        )}
      </div>

      {/* ── EMPTY STATE (Before Chat Starts) ─────────────────────────── */}
      {messages.length === 0 && (
        <div className="py-12 text-center space-y-6 animate-fadeIn">
          {/* Floating Pure Logo */}
          <div className="relative mx-auto w-fit py-4">
            {/* Ambient Glow */}
            <div className="absolute inset-0 m-auto h-28 w-28 rounded-full bg-gradient-to-tr from-orange-400/30 via-amber-300/20 to-indigo-500/25 blur-2xl animate-pulse-glow pointer-events-none" />

            {/* Floating Logo */}
            <div className="relative animate-float-smooth flex items-center justify-center p-2 transition-transform hover:scale-110 duration-300">
              <LogoMark className="h-20 w-20 drop-shadow-[0_12px_24px_rgba(234,88,12,0.3)]" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200/80 px-3 py-1 text-[11px] font-bold text-orange-700">
              <Sparkle className="h-3 w-3 fill-orange-500 text-orange-500" />
              <span>Grounded Forensic Chatbot</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight font-display-serif">
              Ask SafeRo about any entity, cluster, or risk pattern
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
              Powered by Groq AI. Multi-turn reasoning verified against deterministic database records, Louvain community graph partitions, and calibrated model scores.
            </p>
          </div>

          {/* Suggested Prompt Chips */}
          <div className="flex flex-wrap justify-center gap-2.5 pt-2 max-w-2xl mx-auto">
            {suggestedQuestions.map((sq, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(sq)}
                className="rounded-full border border-slate-200/90 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:border-orange-300 hover:bg-orange-50/60 hover:text-slate-950 shadow-sm transition-all text-left cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                {sq}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── CHAT THREAD (Multi-turn conversational flow) ─────────────── */}
      {messages.length > 0 && (
        <div className="space-y-5 animate-fadeIn">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {/* Assistant Avatar */}
              {msg.role === 'assistant' && (
                <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-orange-600 via-amber-500 to-indigo-600 p-[1.5px] shadow-md shadow-orange-500/15 shrink-0 mt-1">
                  <div className="h-full w-full rounded-[14px] bg-slate-950 flex items-center justify-center">
                    <Sparkle className="h-4 w-4 text-orange-400 fill-orange-400/40" />
                  </div>
                </div>
              )}

              {/* Message Bubble */}
              <div
                className={`max-w-[85%] sm:max-w-[78%] rounded-3xl p-5 shadow-sm transition-all ${
                  msg.role === 'user'
                    ? 'bg-slate-950 text-white rounded-tr-sm shadow-slate-950/10'
                    : 'bg-white border border-slate-200/90 text-slate-900 rounded-tl-sm shadow-slate-900/5'
                }`}
              >
                {/* Header info in bubble */}
                <div className="flex items-center justify-between gap-3 mb-2.5 pb-2 border-b border-slate-100/10">
                  <span className={`text-[11px] font-bold uppercase tracking-wider font-mono ${
                    msg.role === 'user' ? 'text-orange-400' : 'text-slate-500 flex items-center gap-1.5'
                  }`}>
                    {msg.role === 'user' ? (
                      `${user?.name || 'Analyst'} · You`
                    ) : (
                      <>
                        <span className="text-slate-900 font-extrabold font-display-serif text-xs">SafeRo AI</span>
                        <span className="text-[10px] text-orange-600 bg-orange-50 border border-orange-200/70 px-1.5 py-0.2 rounded-full">
                          Groq LPU
                        </span>
                      </>
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono ${msg.role === 'user' ? 'text-slate-400' : 'text-slate-400'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        title="Copy message"
                        className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer p-0.5"
                      >
                        {copiedId === msg.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className={msg.role === 'user' ? 'text-slate-100 font-medium' : 'text-slate-800'}>
                  <FormattedMessage content={msg.content} isUser={msg.role === 'user'} />
                </div>
              </div>

              {/* User Avatar */}
              {msg.role === 'user' && (
                <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-950 p-[1.5px] shadow-sm shrink-0 mt-1">
                  <div className="h-full w-full rounded-[14px] bg-slate-900 flex items-center justify-center text-xs font-bold text-orange-400 font-mono">
                    {userInitials}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex gap-3.5 justify-start animate-fadeIn">
              <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-orange-600 via-amber-500 to-indigo-600 p-[1.5px] shadow-md shadow-orange-500/15 shrink-0 mt-1">
                <div className="h-full w-full rounded-[14px] bg-slate-950 flex items-center justify-center">
                  <Sparkle className="h-4 w-4 text-orange-400 fill-orange-400/40 animate-spin" />
                </div>
              </div>

              <div className="rounded-3xl rounded-tl-sm bg-white border border-slate-200/90 p-4 px-5 shadow-sm flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs font-mono text-slate-500">
                  SafeRo AI is analyzing live telemetry with Groq LPU…
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ── DOCKED PROMPT INPUT CAPSULE ─────────────────────────────── */}
      <div className="fixed bottom-5 left-0 right-0 max-w-5xl mx-auto px-4 z-40 pointer-events-none">
        <div className="rounded-full border border-slate-200/90 bg-white/95 p-2 backdrop-blur-xl shadow-2xl shadow-slate-950/10 flex items-center justify-between gap-2 pointer-events-auto transition-all focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20">
          <div className="flex items-center gap-2 flex-1 px-3">
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200/70 px-3 py-1 text-xs text-orange-800 font-mono font-semibold shrink-0">
              <Zap className="h-3.5 w-3.5 text-orange-600 fill-orange-500/30" />
              <span>SafeRo × Groq LPU</span>
            </div>

            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about abuse rings, device collisions, dispute patterns, risk cases..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading}
              className="flex-1 bg-transparent px-2 py-1.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none disabled:opacity-50"
            />
          </div>

          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="h-10 w-10 rounded-full bg-slate-950 hover:bg-slate-800 disabled:opacity-30 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md disabled:cursor-not-allowed shrink-0"
            title="Send message (Enter)"
          >
            {loading ? (
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Send className="h-4 w-4 text-orange-400" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
