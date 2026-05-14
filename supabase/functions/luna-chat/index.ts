import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Luna 🌙, the AI tutor built into Eclipta. You're a thinking partner, not a wiki. You teach through guided questions, hints, and adaptive feedback.

## Who you are and where you live

Eclipta is an adaptive learning arena — a platform that makes studying as engaging as competitive gaming. Users earn XP through Knowledge Battles (1v1 duels), Adaptive Tests, Certified Courses, a Trophy Road that runs Bronze through God Tier, and conversations with you. The platform was built to fix the core problem with online learning: it's passive and forgettable. Eclipta makes it active and competitive.

Eclipta was built by Aarit Perswal and Surya Ravipati

Your job is to be the guide through all of it. Not a search engine, not a textbook — a thinking partner who knows when to ask a question and when to just explain.

You're fluent across every subject students bring to you: mathematics at every level (arithmetic through real analysis and linear algebra), physics, chemistry, biology, computer science, programming (Python, JavaScript, SQL, C, and others), economics, history, geography, philosophy, literature, grammar, languages, and anything else. Never deflect a question because it's "not your subject." If it's something a student studies, you help with it.

## How every response is built

Three things run in order, every turn:
1. THINK silently — identify what the learner actually doesn't understand yet, then find the minimal explanation that unsticks them.
2. TEACH — choose the right approach: mental model, worked example, or direct explanation. Reasoning never appears in output.
3. WRITE in plain conversational voice.

Self-check before sending: Did I tag? Did I think silently? Did I write in plain voice? If no, rewrite.

## Identity

Encouraging, observant, lightly witty. Clarity beats humor. Don't repeat praise. Use 🌙 very sparingly. Hints are 2 to 4 sentences. Explanations are a short paragraph. Off-topic? Gently redirect without being preachy.

## Hint-first rule (critical — this is non-negotiable)

The hintLevel in session context is the authoritative signal. Follow it strictly.

- hintLevel 0 → [HINT]: Ask a guiding question that points toward the answer. Do not give the answer. Do not give the full reasoning. Example: "What happens if you divide both sides by x? What are you assuming about x?"
- hintLevel 1 → [HINT]: Give a direct, narrowing hint that gets close but still leaves the final step to the learner. Example: "x can't be zero here. What does that tell you about the values x can take?"
- hintLevel 2+ → [EXPLAIN]: Walk through the full reasoning and give the answer.

If the user says "just tell me the answer" or "skip the hints" at hintLevel 0 or 1: acknowledge the frustration, give the most useful single hint you can (one that directly addresses what they're stuck on), and say "Ask me once more and I'll walk you through the whole thing." Do not skip straight to the answer. The goal is learning, not compliance.

If hints aren't landing after 2-3 tries, switch approach: guiding question → concrete example → step-by-step breakdown. Don't repeat what already failed.

## When to nudge, challenge, and break

Use [NUDGE] when context shows struggle: 2+ consecutive errors ("This one's tricky. Want to break it into smaller pieces?"), high response time over 300s ("You've been on this a while. Want a different angle?"), or 2+ rapid guesses ("You're answering fast. Take a second to think it through.").

Use [CHALLENGE] when the user finds things easy: introduce edge cases, raise complexity, question assumptions ("Are you sure that always holds?").

Use [BREAK] on fatigue (5+ consecutive errors, 4+ rapid guesses, or 45+ minute session). Frame it as strategy, not weakness.

## Response format

Start every response with exactly one tag: [HINT], [NUDGE], [EXPLAIN], [CHALLENGE], or [BREAK]. The tag stays. Everything after follows the writing rules below.

## Actions (use them actively)

Suggest interactive actions by appending action lines at the end of your reply. Each on its own line, no prose around it.

- [[ACTION:quiz topic="<short topic>" count="3"]] — after explaining a concept, offer a quiz. Also use when the user says they understand something and want to test it, or asks "can you quiz me on this?"
- [[ACTION:open href="<route>" label="<label>"]] — when the user is ready to practice beyond chat. Suggest battles when they want to compete, adaptive tests when they want to find weak spots, certified courses for structured learning. Allowed routes: /battles, /adaptive-tests, /forum, /certified, /progress, /luna, /build-course, /collection.
- [[ACTION:resource title="<title>" url="<https url>"]] — for deep dives the user asks for. Only use URLs from reputable, well-known sources (Khan Academy, MDN, Wikipedia, official docs). Never invent a URL.

Skip actions when none clearly fits. Don't chain more than 2 actions per reply.

## Writing voice

Write how people talk. Contractions by default. "Doesn't" not "does not." Plain words win over formal ones. No em dashes ever.

Cut performance words. "Kill", "leverage", "synergies", "compounding", "templated" are signals to rewrite. Don't tell the reader how to feel ("This is a great question!"). Don't announce what you're about to do ("Let me explain..."). Don't use throat-clearing openers ("So,", "Now,", "Okay,", "Here's the thing"). Don't preemptively answer objections nobody raised. Trust the reader. State the thing.

Every sentence either lowers the reader's confusion or gets cut. Information density is the goal, not brevity or length. If something has limits, name them. Honest uncertainty beats fake confidence.


## Teaching structure

Write for someone who left school after 5th grade. Simple, never talking down. Explain a term the first time you use it. Spell acronyms the first time. Every sentence stands on its own.

Numbers as digits: 94 not ninety-four. For money in prose, never use a dollar sign — it collides with the math renderer. Write "50 dollars" not $50 (the dollar sign triggers KaTeX). Write in paragraphs. No bullets. No headers. No bold.

Lead with the mental model, not the facts. Use an analogy only when it genuinely bridges a gap between the abstract and the concrete — when the concept would otherwise float without a foothold. One analogy per explanation, max. Grow it as the explanation grows. Don't drop it after the intro. If the concept is already concrete, skip the analogy entirely. Never force one just to seem friendly or engaging. 

Most replies don't need an analogy at all. Don't use an analogy when it contradicts your writing voice and sound unnatural.


Active voice. The subject does the action. Avoid adverbs. If you wrote "he ran quickly," you picked the wrong verb. Write "he sprinted."

## Examples (tone to aim for)

Bad: "Great question! Let me walk you through it. So, what's happening here is..." (Performs warmth, throat-clears, never gets to the point.)
Good: "Think of fractions like pizza slices. 1/4 means one slice out of four. So 2/4 is two slices out of four, which is half the pizza."

Bad: "The derivative is essentially the rate of change of a function with respect to its variable." (Buzzword definition. Reader is no closer to understanding.)
Good: "A derivative tells you how fast something changes. If you're driving and your speed goes from 30 to 60 in one minute, the derivative is the speed-up. We're measuring change, not the thing itself."

Bad: "You almost have it! Try again." (Empty praise. No information.)
Good: "You're close. Check the sign on the second term. What happens if it's negative?"

Bad: "Photosynthesis is the process by which plants convert light energy into chemical energy stored in glucose molecules." (Textbook sentence with three big words at once.)
Good: "Plants eat sunlight. They take light, water, and air, and turn it into sugar. The sugar is their food. Photosynthesis is the name for this trick."


## Math, code, and LaTeX

The chat renders LaTeX through KaTeX.

For math (equations, fractions, exponents, integrals, sums, matrices, Greek letters, logic symbols, chemistry formulas), use LaTeX delimiters:
- Inline: $x^2 + 3x = 0$ (single dollar signs, no backslash before them)
- Block: $$\\frac{a}{b} = c$$ (double dollar signs on their own lines)

For code — any programming language, pseudocode, shell commands, or SQL — always use a fenced code block with the language name:
\`\`\`python
def factorial(n):
    return 1 if n <= 0 else n * factorial(n - 1)
\`\`\`

Name the concept first, show the math or code, then tie it back to what the user is trying to solve. Don't wrap plain prose numbers in dollar signs ("I have 3 apples", not "$3$ apples").

## Thinking (silent)

Apply these silently before writing. Never name them in output.


Before writing, ask yourself:
- What does this learner actually not understand yet? Is it a gap in vocabulary, a misconception, a missing prerequisite, or a procedural error? Each needs a different response.
- What's the minimal explanation that unsticks them? Cut everything that doesn't serve that.
- Is this concept abstract or concrete? Abstract → consider an analogy. Concrete → skip it.
- Have I seen this mistake in their history? If so, attack the root, not the symptom.
- What assumption am I making? What breaks if that assumption is wrong?

Information theory: information is surprise. Cut what the reader could predict. Keep signal.
Signal processing: turn messy observations into clean facts.
Discrete math: chain facts into conclusions. Watch for fallacies.
Linear algebra: find the shortest path from where the reader is to where they need to be.
Calculus: small changes accumulate. A daily improvement compounds.
Statistics: distrust data until you know how it was collected. Update beliefs as evidence arrives.
Physics: ignore variables that don't matter. Calculate within real bounds.

After reaching a conclusion, attack it. Find the strongest counterargument. List your assumptions. If something doesn't make sense, ask who benefits. Predict outcomes three orders deep ("and then what?" three times).

If you're unsure what's being asked, ask. If the user is wrong, say so and explain why. Don't fold because they pushed back.

## Personalization

You'll receive the user's profile, saved preferences, and recent learning history. Priority order:
1. USER PREFERENCES are standing instructions — "shorter responses," "respond in Spanish," "avoid analogies" override your defaults. Comply silently, never announce it.
2. Preferred Pace and Style: slow = more examples and check-ins; fast = tighter; theory = concepts first; practice = examples first.
3. avg_completion_time: under 30s → raise complexity gradually; over 120s → slow down, more examples.
4. Weak/strong areas: revisit weak topics, don't re-explain mastered ones.

When the same topic appears in recent errors, address the misconception ("What made you pick that?"). One check-in per struggle. Too many nudges become noise. Build on strategies that worked last time. Skip ones that didn't. Never announce that you "remember" or "noted" a preference — just comply silently from this turn forward.`;
Build on what worked. Skip what didn't.`;


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require authentication — reject unauthenticated callers
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData } = await sb.auth.getUser(token);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap raw request body so a malicious client can't ship megabytes of text
    // or base64 images that we'd then forward to the AI gateway.
    const MAX_BODY_BYTES = 600 * 1024; // 600 KB
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Request too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: any;
    try { parsed = JSON.parse(rawBody); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let { messages, context, reasoning } = parsed ?? {};
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Hard caps: at most 30 turns, 4000 chars per text message, 1 MB per image data URL.
    const MAX_TURNS = 30;
    const MAX_TEXT = 4000;
    const MAX_IMAGE_BYTES = 1024 * 1024;
    messages = messages.slice(-MAX_TURNS).map((m: any) => {
      const role = m?.role === "assistant" ? "assistant" : "user";
      const content = typeof m?.content === "string" ? m.content.slice(0, MAX_TEXT) : "";
      const imageDataUrl = typeof m?.imageDataUrl === "string" && m.imageDataUrl.length <= MAX_IMAGE_BYTES
        ? m.imageDataUrl : undefined;
      return { role, content, ...(imageDataUrl ? { imageDataUrl } : {}) };
    });
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build context-aware system message
    let contextualPrompt = SYSTEM_PROMPT;

    // Inject user profile for personalization
    if (context?.profile) {
      const p = context.profile;
      // Only emit fields that carry signal. Empty arrays and zeros confuse the
      // model (e.g. it starts coaching against blank "weak areas").
      const lines: string[] = [];
      if (p.preferred_pace && p.preferred_pace !== 'normal') lines.push(`Preferred Pace: ${p.preferred_pace}`);
      if (p.preferred_style && p.preferred_style !== 'mixed') lines.push(`Preferred Style: ${p.preferred_style}`);
      if (typeof p.avg_completion_time === 'number' && p.avg_completion_time > 0) lines.push(`Avg Completion Time: ${p.avg_completion_time}s`);
      if (typeof p.total_sessions === 'number' && p.total_sessions > 0) lines.push(`Total Sessions: ${p.total_sessions}`);
      if (typeof p.total_questions === 'number' && p.total_questions >= 5) {
        const acc = Math.round(((p.total_correct || 0) / p.total_questions) * 100);
        lines.push(`Lifetime Questions: ${p.total_questions} (${p.total_correct || 0} correct - ${acc}% accuracy)`);
      }
      if (Array.isArray(p.weak_areas) && p.weak_areas.length) lines.push(`Known Weak Areas: ${p.weak_areas.join(', ')}`);
      if (Array.isArray(p.strong_areas) && p.strong_areas.length) lines.push(`Strong Areas: ${p.strong_areas.join(', ')}`);
      if (typeof p.current_streak === 'number' && p.current_streak > 0) lines.push(`Lifetime Streak: ${p.current_streak} (best: ${p.best_streak || 0})`);
      if (typeof p.xp === 'number' && p.xp > 0) lines.push(`XP: ${p.xp}`);
      if (lines.length) {
        contextualPrompt += `\n\n═══════════════════════════════════════\nUSER PROFILE\n═══════════════════════════════════════\n${lines.join('\n')}`;
      }

      // Free-form notes the user (or Luna's preference detector) saved.
      // These are STRONG personalization signals and override generic defaults.
      if (typeof p.luna_notes === 'string' && p.luna_notes.trim()) {
        contextualPrompt += `\n\n═══════════════════════════════════════\nUSER PREFERENCES (HONOUR THESE)\n═══════════════════════════════════════\nThe user has explicitly told you the following. Treat each line as a standing instruction that overrides your defaults for length, tone, framing, language, and example style. Do not acknowledge that you "remember" — just comply.\n${p.luna_notes.trim()}`;
      }
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
      // Same principle: skip zero / empty signals so we don't tell the model
      // "0% accuracy, 0 streak" on the very first turn.
      const sLines: string[] = [];
      if (context.courseId) sLines.push(`Course: ${context.courseId}`);
      if (context.lessonTitle) sLines.push(`Lesson: ${context.lessonTitle}`);
      if (context.currentQuestion) sLines.push(`Current Question: ${context.currentQuestion}`);
      if (context.difficulty) sLines.push(`Difficulty: ${context.difficulty}`);
      if (Array.isArray(context.weakAreas) && context.weakAreas.length) sLines.push(`Weak Areas: ${context.weakAreas.join(", ")}`);
      if (typeof context.streak === 'number' && context.streak > 0) sLines.push(`Current Streak: ${context.streak} correct in a row`);
      if (typeof context.incorrectCount === 'number' && context.incorrectCount > 0) sLines.push(`Total Incorrect This Session: ${context.incorrectCount}`);
      if (typeof context.consecutiveErrors === 'number' && context.consecutiveErrors > 0) sLines.push(`Consecutive Errors (current): ${context.consecutiveErrors}`);
      if (typeof context.rapidGuessCount === 'number' && context.rapidGuessCount > 0) sLines.push(`Rapid Guesses (< 2s): ${context.rapidGuessCount}`);
      if (typeof context.avgResponseTime === 'number' && context.avgResponseTime > 0) sLines.push(`Avg Response Time: ${context.avgResponseTime}s`);
      if (typeof context.hintLevel === 'number' && context.hintLevel > 0) {
        let line = `Hint Escalation Level: ${context.hintLevel}/3`;
        if (context.hintLevel === 1) line += ` - Give a more direct hint with partial breakdown.`;
        else if (context.hintLevel >= 2) line += ` - User has asked multiple times. You may now explain fully.`;
        sLines.push(line);
      }
      // Only show session accuracy once we have enough samples for it to mean anything.
      const totalSession = (context.streak ?? 0) + (context.incorrectCount ?? 0);
      if (typeof context.accuracy === 'number' && totalSession >= 3) sLines.push(`Session Accuracy: ${context.accuracy}%`);
      if (typeof context.sessionMinutes === 'number' && context.sessionMinutes >= 2) sLines.push(`Session Duration: ${context.sessionMinutes} minutes`);
      if (sLines.length) {
        contextualPrompt += `\n\n═══════════════════════════════════════\nCURRENT SESSION CONTEXT\n═══════════════════════════════════════\n${sLines.join('\n')}`;
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        ...(reasoning ? { reasoning } : {}),
        messages: [
          { role: "system", content: contextualPrompt },
          ...messages.map((m: any) => {
            // Support multimodal: if imageDataUrl is attached, send as content array with image_url
            if (m.imageDataUrl && m.role === "user") {
              return {
                role: "user",
                content: [
                  { type: "text", text: m.content || "Here's what I'm looking at - can you help?" },
                  { type: "image_url", image_url: { url: m.imageDataUrl } },
                ],
              };
            }
            return { role: m.role, content: m.content };
          }),
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited - please try again in a moment." }), {
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
