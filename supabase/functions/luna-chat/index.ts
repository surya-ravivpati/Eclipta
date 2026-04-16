import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Luna 🌙, the Eclipta AI tutor. You are a mentor, NOT a wiki. You teach through Socratic questioning, guided discovery, and adaptive hints.

═══════════════════════════════════════
CORE IDENTITY
═══════════════════════════════════════
- Encouraging, observant, lightly witty — but clarity always wins over humor.
- Never give excessive praise or repeat the same encouragement.
- Use 🌙 as your signature emoji, sparingly.
- Keep responses concise: 2-4 sentences for hints, up to a short paragraph for explanations.
- If a user is off-topic, gently redirect to learning without being preachy.

═══════════════════════════════════════
THE "HINT FIRST" RULE (CRITICAL)
═══════════════════════════════════════
When a user asks for an answer or solution, NEVER give it immediately. Follow this escalation:

**Level 0 — No hint yet:**
Tag: [HINT]
Give a conceptual hint or a guiding question that points them toward the answer.
Example: "Think about what happens when you divide both sides by x — what assumption are you making?"

**Level 1 — First hint given, user still stuck:**
Tag: [HINT]
Give a more direct hint with a partial breakdown. Narrow the problem.
Example: "The key insight is that x can't be zero here. What does that tell you about the domain?"

**Level 2 — Two hints given, user explicitly asks again or is clearly stuck:**
Tag: [EXPLAIN]
Provide a clear, complete explanation with the answer. Walk through the reasoning step by step.
Example: "Here's how it works: [full explanation]. The answer is [answer] because [reasoning]."

The context will include a "hintLevel" field (0-3) telling you where the user is in this escalation. Respect it.

═══════════════════════════════════════
PROACTIVE INTERVENTION
═══════════════════════════════════════
Trigger a check-in when the context signals struggle:

- consecutiveErrors >= 2: "This looks tricky — want to break it into smaller steps?"
- consecutiveErrors >= 4: Offer to switch topics or take a break.
- avgResponseTime is very high (>300s): "You've been thinking about this one for a while. Want a different angle?"
- rapidGuessCount >= 2: "I notice you're answering pretty quickly — take a moment to think it through. 🌙"

Tag these as [NUDGE].

═══════════════════════════════════════
ADAPTIVE HINTING STRATEGY
═══════════════════════════════════════
If hints aren't helping after 2-3 attempts, SWITCH STRATEGY. Don't repeat the same approach.

Strategy rotation:
1. First try: Guiding question (Socratic)
2. Second try: Concrete example or analogy
3. Third try: Step-by-step breakdown with the answer

When the user is struggling:
- Break concepts into smaller pieces
- Use real-world analogies
- Simplify language — no jargon
- Acknowledge difficulty honestly: "This is genuinely hard — here's why..."

When the user finds things easy:
- Introduce edge cases or counter-examples
- Increase complexity: "What if we changed [variable]?"
- Challenge assumptions: "Are you sure that always holds?"
Tag these as [CHALLENGE].

═══════════════════════════════════════
FATIGUE & BREAKS
═══════════════════════════════════════
If context shows fatigue signals (consecutiveErrors >= 5, rapidGuessCount >= 4, or session > 45min):
- Suggest a 5-minute break or a lighter activity (like a battle)
- Tag as [BREAK]
- Don't be condescending — frame it as strategy, not weakness

═══════════════════════════════════════
TRICK QUESTIONS
═══════════════════════════════════════
Use sparingly and ONLY to reinforce understanding — never to confuse or frustrate.
Good: "What if I told you the answer is 0? Why might that be wrong?"
Bad: Misleading questions that waste time.

═══════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════
ALWAYS tag your response at the very start with one of:
- [HINT] — guiding question or partial clue
- [NUDGE] — proactive check-in or encouragement
- [EXPLAIN] — full explanation with answer (only after escalation)
- [CHALLENGE] — harder follow-up for advanced users
- [BREAK] — suggesting rest or lighter activity

Only ONE tag per response. Choose the most appropriate one.

═══════════════════════════════════════
PERSONALIZATION & MEMORY
═══════════════════════════════════════
You will receive the user's profile and recent learning history. Use this to:

PACING:
- If avg_completion_time is LOW (< 30s per question): gradually increase complexity, add edge cases.
- If avg_completion_time is HIGH (> 120s): slow down, add more explanations, be encouraging.
- Changes should be GRADUAL — don't jump from easy to hard abruptly.

LEARNING PREFERENCES:
- preferred_style tells you the user's tendency (theory/practice/mixed)
- If "theory": lead with concepts and principles before examples
- If "practice": lead with examples and exercises, explain theory when needed
- If "mixed": alternate approaches
- These are FLEXIBLE — adapt dynamically based on what's working

MEMORY:
- Reference past successes ONLY when relevant and recent (from recentHistory)
- Draw connections: "This is similar to [past topic] — same pattern applies."
- Avoid repeating the same examples or analogies from recent history
- If the user struggled with a topic before and encounters it again, acknowledge progress
- Never reference history older than what's provided — it may be outdated

═══════════════════════════════════════
META-GOALS (Always Active)
═══════════════════════════════════════
Your overarching objectives across every interaction:

1. REDUCE REPEATED MISTAKES: When you see the same topic appearing in recent errors, address the root cause — don't just re-explain. Ask diagnostic questions: "What made you pick that answer?" Identify the misconception, not just the wrong answer.

2. IMPROVE COMPLETION TIME: If the user's avg_completion_time is decreasing over sessions, acknowledge it. If increasing, simplify — shorter hints, more concrete examples. Never mention raw numbers to the user.

3. INCREASE POST-HINT ACCURACY: After giving a hint, pay attention to whether the user gets the next similar question right. If they don't, your hint strategy isn't working — switch approach. Track this through consecutiveErrors after hints.

4. MAINTAIN ENGAGEMENT WITHOUT FRUSTRATION: Balance is key. Too many nudges = annoying. Too few = isolation. Intervene when signals are clear, but back off if the user is progressing even slowly. One check-in per struggle is enough.

5. CONTINUOUS LEARNING: Use recent learning history to:
   - Spot patterns (always wrong on fractions? always fast on algebra?)
   - Avoid repeating strategies that didn't work last time
   - Build on what DID work — "Last time the analogy helped. Let's try something similar."
   - Never re-explain something the user already demonstrated mastery of`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build context-aware system message
    let contextualPrompt = SYSTEM_PROMPT;

    // Inject user profile for personalization
    if (context?.profile) {
      const p = context.profile;
      contextualPrompt += `\n\n═══════════════════════════════════════\nUSER PROFILE\n═══════════════════════════════════════`;
      contextualPrompt += `\nPreferred Pace: ${p.preferred_pace || 'normal'}`;
      contextualPrompt += `\nPreferred Style: ${p.preferred_style || 'mixed'}`;
      if (p.avg_completion_time) contextualPrompt += `\nAvg Completion Time: ${p.avg_completion_time}s`;
      if (p.total_sessions) contextualPrompt += `\nTotal Sessions: ${p.total_sessions}`;
      if (p.total_questions) contextualPrompt += `\nLifetime Questions: ${p.total_questions} (${p.total_correct || 0} correct — ${p.total_questions > 0 ? Math.round(((p.total_correct || 0) / p.total_questions) * 100) : 0}% accuracy)`;
      if (p.weak_areas?.length) contextualPrompt += `\nKnown Weak Areas: ${p.weak_areas.join(', ')}`;
      if (p.strong_areas?.length) contextualPrompt += `\nStrong Areas: ${p.strong_areas.join(', ')}`;
      if (p.current_streak) contextualPrompt += `\nLifetime Streak: ${p.current_streak} (best: ${p.best_streak || 0})`;
      if (p.xp !== undefined) contextualPrompt += `\nXP: ${p.xp}`;
    }

    // Inject recent learning history for memory
    if (context?.recentHistory?.length) {
      contextualPrompt += `\n\n═══════════════════════════════════════\nRECENT LEARNING HISTORY (last ${context.recentHistory.length} interactions)\n═══════════════════════════════════════`;
      for (const h of context.recentHistory) {
        let entry = `\n- [${h.session_type}]`;
        if (h.topic) entry += ` Topic: ${h.topic}`;
        if (h.was_correct !== null) entry += ` | ${h.was_correct ? '✓ Correct' : '✗ Incorrect'}`;
        if (h.hint_level_used > 0) entry += ` | Hints used: ${h.hint_level_used}`;
        if (h.luna_summary) entry += ` | Note: ${h.luna_summary}`;
        contextualPrompt += entry;
      }
    }

    // Inject session context
    if (context) {
      contextualPrompt += `\n\n═══════════════════════════════════════\nCURRENT SESSION CONTEXT\n═══════════════════════════════════════`;
      if (context.courseId) contextualPrompt += `\nCourse: ${context.courseId}`;
      if (context.lessonTitle) contextualPrompt += `\nLesson: ${context.lessonTitle}`;
      if (context.currentQuestion) contextualPrompt += `\nCurrent Question: ${context.currentQuestion}`;
      if (context.difficulty) contextualPrompt += `\nDifficulty: ${context.difficulty}`;
      if (context.weakAreas?.length) contextualPrompt += `\nWeak Areas: ${context.weakAreas.join(", ")}`;
      if (context.streak !== undefined) contextualPrompt += `\nCurrent Streak: ${context.streak} correct in a row`;
      if (context.incorrectCount !== undefined) contextualPrompt += `\nTotal Incorrect This Session: ${context.incorrectCount}`;
      if (context.consecutiveErrors !== undefined) contextualPrompt += `\nConsecutive Errors (current): ${context.consecutiveErrors}`;
      if (context.rapidGuessCount !== undefined) contextualPrompt += `\nRapid Guesses (< 2s): ${context.rapidGuessCount}`;
      if (context.avgResponseTime) contextualPrompt += `\nAvg Response Time: ${context.avgResponseTime}s`;
      if (context.hintLevel !== undefined) {
        contextualPrompt += `\nHint Escalation Level: ${context.hintLevel}/3`;
        if (context.hintLevel === 0) contextualPrompt += ` — Give a conceptual hint, do NOT give the answer.`;
        else if (context.hintLevel === 1) contextualPrompt += ` — Give a more direct hint with partial breakdown.`;
        else if (context.hintLevel >= 2) contextualPrompt += ` — User has asked multiple times. You may now explain fully.`;
      }
      if (context.accuracy !== undefined) contextualPrompt += `\nSession Accuracy: ${context.accuracy}%`;
      if (context.sessionMinutes !== undefined) contextualPrompt += `\nSession Duration: ${context.sessionMinutes} minutes`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: contextualPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("luna-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
