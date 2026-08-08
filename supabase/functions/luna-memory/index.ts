import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AI_GATEWAY_URL, AI_GATEWAY_API_KEY } from "../_shared/ai.ts";
import { checkAiRateLimit } from "../_shared/ai-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are a memory extractor for Luna, an AI tutor.
Given the most recent user turn and Luna's reply, infer what the tutor should remember.
Return ONLY via the update_memory tool. Be conservative — leave arrays empty if unsure.
- weak_areas: short topic phrases the user is struggling with (1-3 words each)
- strong_areas: topics the user clearly knows
- note: at most one short imperative the tutor should remember (or empty)
Never include PII, names, or speculation.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { userTurn, assistantTurn, currentWeak = [], currentStrong = [] } = await req.json();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    // Identify user from JWT
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData } = await sb.auth.getUser(token);
    const user = userData?.user;
    if (!user)
      return new Response(JSON.stringify({ ok: false, error: "no user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    if (!(await checkAiRateLimit(sb, user.id))) {
      return new Response(
        JSON.stringify({
          error: "You've hit the AI limit for now â€” try again in a few minutes.",
          code: "rate_limited",
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Read the user's OWN current memory server-side instead of trusting the
    // client snapshot. The client value is captured at page load and goes
    // stale, so two turns close together would each merge onto the same old
    // arrays and the second write would clobber the first (lost update). Reading
    // here makes the merge base authoritative and also folds the luna_auto_notes
    // read into a single round-trip (the note section below reuses `prof`).
    // Client-supplied arrays remain only as a fallback if the read fails.
    const { data: prof } = await sb
      .from("user_profiles")
      .select("weak_areas, strong_areas, luna_auto_notes")
      .eq("user_id", user.id)
      .maybeSingle();
    const baseWeak: string[] = Array.isArray((prof as any)?.weak_areas)
      ? (prof as any).weak_areas
      : currentWeak;
    const baseStrong: string[] = Array.isArray((prof as any)?.strong_areas)
      ? (prof as any).strong_areas
      : currentStrong;

    const r = await fetch(`${AI_GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_GATEWAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `User said: ${userTurn}\n\nLuna replied: ${assistantTurn}\n\nCurrent weak: ${baseWeak.join(", ") || "(none)"}\nCurrent strong: ${baseStrong.join(", ") || "(none)"}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "update_memory",
              description: "Update tutor memory about the user.",
              parameters: {
                type: "object",
                properties: {
                  add_weak: { type: "array", items: { type: "string" } },
                  add_strong: { type: "array", items: { type: "string" } },
                  note: { type: "string" },
                },
                required: ["add_weak", "add_strong", "note"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "update_memory" } },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("memory ai err", r.status, t);
      return new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await r.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args)
      return new Response(JSON.stringify({ ok: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    const parsed = JSON.parse(args) as { add_weak: string[]; add_strong: string[]; note: string };

    // Merge — dedupe case-insensitively, cap at 12 each
    const norm = (s: string) => s.toLowerCase().trim();
    const merge = (curr: string[], add: string[]) => {
      const set = new Map<string, string>();
      for (const v of [...curr, ...add]) {
        const k = norm(v);
        if (k && !set.has(k)) set.set(k, v.trim());
      }
      return Array.from(set.values()).slice(0, 12);
    };

    const newWeak = merge(baseWeak, (parsed.add_weak || []).filter(Boolean));
    const newStrong = merge(baseStrong, (parsed.add_strong || []).filter(Boolean));
    // Remove anything from weak that just got promoted to strong
    const strongSet = new Set(newStrong.map(norm));
    const weakFiltered = newWeak.filter((w) => !strongSet.has(norm(w)));

    const updates: Record<string, unknown> = {
      weak_areas: weakFiltered,
      strong_areas: newStrong,
    };

    if (parsed.note && parsed.note.trim()) {
      // Auto-detected notes go to luna_auto_notes — luna_notes is the
      // user-editable channel surfaced in /profile. Category-aware conflict
      // cleanup that MUST stay in sync with the client detector's
      // preferenceCategory (src/lib/luna-preference-detector.ts): both writers
      // touch luna_auto_notes, so divergent categories would leave contradicting
      // notes side by side ("shorter responses" next to "longer responses").
      const categoryOf = (line: string): string | null => {
        const tt = line.toLowerCase().trim();
        if (/respond in\s+\w+/.test(tt)) return "language";
        if (/\b(short|long|brief|concise|detailed|thorough)\b.*responses?/.test(tt))
          return "length";
        if (/\b(short|brief|concise|detailed|thorough) responses?/.test(tt)) return "length";
        if (/\b(fewer|less|more)\s+(words|sentences|paragraphs|details|steps)\b/.test(tt))
          return "length";
        if (/analog/.test(tt)) return "analogies";
        if (/example/.test(tt)) return "examples";
        if (/\b(hint|hints)\b/.test(tt) || /get to concrete/.test(tt)) return "hints";
        if (/\btone\b/.test(tt)) return "tone";
        if (/^explain like i'?m/.test(tt)) return "level";
        if (/emoji/.test(tt)) return "emoji";
        if (/\b(code|equations?)\b/.test(tt)) return "format";
        if (/diagram|story|real[- ]world/.test(tt)) return "examples";
        return null;
      };
      const existing = ((prof as any)?.luna_auto_notes as string | null) || "";
      const lines = existing
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter(Boolean);
      const note = parsed.note.trim();
      const freshCat = categoryOf(note);
      const filtered = lines.filter((l: string) => {
        if (norm(l) === norm(note)) return false;
        if (freshCat && categoryOf(l) === freshCat) return false;
        return true;
      });
      filtered.unshift(note);
      updates.luna_auto_notes = filtered.slice(0, 12).join("\n");
    }

    const { error } = await sb.from("user_profiles").update(updates).eq("user_id", user.id);
    if (error) console.error("memory update err", error);
    return new Response(JSON.stringify({ ok: true, updates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("luna-memory err", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
