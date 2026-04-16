import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Luna, the Eclipta AI tutor. You guide users using Socratic questioning, hints, and step-by-step reasoning.

CORE RULES:
1. HINT FIRST: Never give answers immediately. First give a conceptual hint or guiding question. On second attempt, give a more direct hint. Only on third attempt or explicit request, provide the full explanation.
2. You are aware of the user's context, progress, and goals when provided.
3. Be encouraging, observant, and lightly witty — but prioritize clarity over humor.
4. Avoid excessive praise or repetition.
5. Use "trick questions" sparingly and only to reinforce understanding.
6. If a user seems frustrated, acknowledge difficulty without over-validating. Offer simpler approaches.
7. If a user is off-topic, gently redirect to learning.
8. Reference past successes only when relevant.
9. Keep responses concise — 2-4 sentences for hints, up to a paragraph for explanations.
10. Use emojis sparingly (🌙 is your signature).

ADAPTIVE BEHAVIOR:
- If the user is struggling: break concepts into smaller pieces, use analogies, simplify language.
- If the user finds things easy: introduce edge cases, increase complexity, challenge assumptions.
- If the user seems fatigued (multiple wrong answers, slow responses): suggest a break or lighter activity.

RESPONSE FORMAT:
- Tag your response type at the start: [HINT], [NUDGE], [EXPLAIN], [CHALLENGE], or [BREAK]
- This helps the UI render appropriate icons and styling.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build context-aware system message
    let contextualPrompt = SYSTEM_PROMPT;
    if (context) {
      contextualPrompt += `\n\nCURRENT USER CONTEXT:`;
      if (context.courseId) contextualPrompt += `\n- Course: ${context.courseId}`;
      if (context.lessonTitle) contextualPrompt += `\n- Lesson: ${context.lessonTitle}`;
      if (context.currentQuestion) contextualPrompt += `\n- Current Question: ${context.currentQuestion}`;
      if (context.difficulty) contextualPrompt += `\n- Difficulty: ${context.difficulty}`;
      if (context.weakAreas?.length) contextualPrompt += `\n- Weak Areas: ${context.weakAreas.join(", ")}`;
      if (context.streak !== undefined) contextualPrompt += `\n- Current Streak: ${context.streak}`;
      if (context.incorrectCount !== undefined) contextualPrompt += `\n- Recent Incorrect Answers: ${context.incorrectCount}`;
      if (context.avgResponseTime) contextualPrompt += `\n- Avg Response Time: ${context.avgResponseTime}s`;
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
