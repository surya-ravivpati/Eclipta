import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Sparkles, Eye, Lightbulb, AlertTriangle } from "lucide-react";

type Message = { role: "luna" | "user"; content: string; type?: "hint" | "nudge" | "trick" | "refuse" };

const LUNA_INTROS = [
  "Hey, I noticed you've been here a while. Need a hand? 🌙",
  "I see you're exploring — want me to suggest a path?",
  "Stuck? I can give you a hint... but you'll have to think first.",
];

const LUNA_RESPONSES: { patterns: RegExp[]; responses: Message[] }[] = [
  {
    patterns: [/help/i, /stuck/i, /don't understand/i, /confused/i],
    responses: [
      { role: "luna", content: "Hmm, I could tell you the answer... but where's the fun in that? Let me give you a hint instead.", type: "hint" },
      { role: "luna", content: "Think about what you already know about this topic. What's the first principle? Start there. 🌙", type: "hint" },
    ],
  },
  {
    patterns: [/answer/i, /tell me/i, /what is/i, /solution/i],
    responses: [
      { role: "luna", content: "Not so fast. 🛑 Try working through it yourself first. I'll check back in a minute.", type: "refuse" },
      { role: "luna", content: "I could... but you'd forget it by tomorrow. Let me rephrase the question instead — sometimes a different angle helps.", type: "refuse" },
    ],
  },
  {
    patterns: [/easy/i, /boring/i, /too simple/i, /already know/i],
    responses: [
      { role: "luna", content: "Oh really? Let me throw you a curveball then. 😏 Here's a twist on that concept — what happens when the input is negative?", type: "trick" },
      { role: "luna", content: "If it's too easy, you're ready for the next level. Want me to bump your difficulty?", type: "nudge" },
    ],
  },
  {
    patterns: [/hard/i, /difficult/i, /too much/i, /overwhelm/i],
    responses: [
      { role: "luna", content: "Let's break this down into smaller pieces. What's the one part that confuses you the most?", type: "hint" },
      { role: "luna", content: "Take a breath. Complex topics are just simple ideas stacked up. Let me peel back a layer for you.", type: "hint" },
    ],
  },
  {
    patterns: [/recommend/i, /suggest/i, /what should/i, /next/i],
    responses: [
      { role: "luna", content: "Based on what I've seen, you might enjoy diving into algorithms next. Your pattern recognition is strong. 🌙" },
      { role: "luna", content: "I'd suggest revisiting the fundamentals one more time — solid foundations make everything easier later." },
    ],
  },
  {
    patterns: [/hi/i, /hello/i, /hey/i, /luna/i],
    responses: [
      { role: "luna", content: "Hey there! 🌙 I'm Luna, your AI learning companion. I hang around, observe how you learn, and jump in when I think I can help. What are you working on?" },
    ],
  },
];

const DEFAULT_RESPONSES: Message[] = [
  { role: "luna", content: "Interesting... Let me think about that. In the meantime, try approaching it from a different angle. 🌙" },
  { role: "luna", content: "I'm watching how you work through this. Keep going — you're closer than you think." },
  { role: "luna", content: "Here's a thought: what would happen if you reversed the problem? Sometimes working backwards reveals the path forward." },
];

function getLunaResponse(input: string): Message {
  for (const group of LUNA_RESPONSES) {
    if (group.patterns.some(p => p.test(input))) {
      return group.responses[Math.floor(Math.random() * group.responses.length)];
    }
  }
  return DEFAULT_RESPONSES[Math.floor(Math.random() * DEFAULT_RESPONSES.length)];
}

export function Luna() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [hasNudged, setHasNudged] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Nudge after 30s on page
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNudged && !open) {
        setHasNudged(true);
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [hasNudged, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setIsTyping(true);

    // Simulate thinking delay
    const delay = 800 + Math.random() * 1200;
    setTimeout(() => {
      const response = getLunaResponse(text);
      setMessages(prev => [...prev, response]);
      setIsTyping(false);
    }, delay);
  };

  const typeIcon = (type?: string) => {
    switch (type) {
      case "hint": return <Lightbulb className="w-3 h-3 text-neon-cyan" />;
      case "refuse": return <AlertTriangle className="w-3 h-3 text-neon-pink" />;
      case "trick": return <Eye className="w-3 h-3 text-neon-pink" />;
      case "nudge": return <Sparkles className="w-3 h-3 text-neon-purple" />;
      default: return null;
    }
  };

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => { setOpen(true); setHasNudged(false); if (messages.length === 0) { setMessages([{ role: "luna", content: LUNA_INTROS[Math.floor(Math.random() * LUNA_INTROS.length)] }]); } }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-neon-purple text-primary-foreground flex items-center justify-center neon-glow-purple hover:scale-105 transition-transform"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Open Luna AI assistant"
      >
        <span className="text-xl font-display font-bold">🌙</span>
        {/* Nudge badge */}
        {hasNudged && !open && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-4 h-4 bg-neon-pink rounded-full border-2 border-background"
          />
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-[360px] max-h-[500px] flex flex-col glass-panel border border-acrylic-border overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌙</span>
                <div>
                  <span className="font-display font-bold text-sm tracking-wide">LUNA</span>
                  <span className="text-[10px] text-muted-foreground ml-2 tracking-widest">AI COMPANION</span>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[340px]">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-neon-purple/20 border border-neon-purple/20 text-foreground"
                      : "bg-secondary/50 border border-border text-foreground"
                  }`}>
                    {msg.role === "luna" && msg.type && (
                      <div className="flex items-center gap-1 mb-1">
                        {typeIcon(msg.type)}
                        <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">{msg.type}</span>
                      </div>
                    )}
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-secondary/50 border border-border px-3 py-2 text-sm text-muted-foreground">
                    <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>
                      Luna is thinking...
                    </motion.span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-3 py-2 border-t border-border">
              <form
                onSubmit={e => { e.preventDefault(); send(); }}
                className="flex items-center gap-2"
              >
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask Luna anything..."
                  className="flex-1 bg-secondary/30 border border-input rounded-sm px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple"
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="p-2 bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
