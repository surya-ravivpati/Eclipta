import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * luna-room — Study Room modes for Luna, reusing the same Lovable AI gateway as
 * luna-chat (NOT a separate provider). Two modes:
 *   stuck  — server-side, race-free AI fallback: atomically CLAIM an open Stuck
 *            card (open→resolving), and only the first claimer calls the model
 *            and writes the answer. Others no-op. No DB profile/history context.
 *   recap  — summarize ONLY the structured events passed in (never chat). The
 *            client guarantees events is non-empty before calling.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function callLuna(system: string, user: string, key: string): Promise<string> {
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.4,
    }),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}: ${await r.text().catch(() => "")}`);
  const data = await r.json();
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData } = await sb.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;

    // ── STUCK: claim → answer → write (race-free) ──
    if (mode === "stuck") {
      const stuckId = body?.stuck_id;
      if (!stuckId) return json({ error: "stuck_id required" }, 400);

      // Atomic claim: only the first caller flips open→resolving and proceeds.
      const { data: claimed } = await sb
        .from("stuck_requests")
        .update({ status: "resolving" })
        .eq("id", stuckId)
        .eq("status", "open")
        .select("id, room_id, note")
        .maybeSingle();
      if (!claimed) return json({ claimed: false });   // already resolved/claimed elsewhere

      // Caller must be a member of the room.
      const { data: mem } = await sb.from("study_room_members")
        .select("user_id").eq("room_id", claimed.room_id).eq("user_id", user.id).maybeSingle();
      if (!mem) {
        await sb.from("stuck_requests").update({ status: "open" }).eq("id", stuckId);
        return json({ error: "Not a room member" }, 403);
      }

      try {
        const sys = "You are Luna, a warm study-room tutor. A learner asked the room for help and no one answered in time, so you're stepping in as the fallback. Give a SHORT, concrete hint or explanation (3-5 sentences) that genuinely moves them forward on what they're stuck on. Be specific, not vague. No preamble, no sign-off.";
        const q = claimed.note
          ? `The learner is stuck on: "${claimed.note}". Help them.`
          : `The learner said they're stuck but didn't say on what. Give them a useful way to get unstuck and ask what specifically is blocking them.`;
        const answer = await callLuna(sys, q, LOVABLE_API_KEY);
        await sb.from("stuck_requests").update({
          status: "resolved", resolved_by: "ai", resolver_name: "Luna",
          resolution_summary: answer || "Luna couldn't generate a hint — try rephrasing your question.",
          resolved_at: new Date().toISOString(),
        }).eq("id", stuckId);
        return json({ claimed: true });
      } catch (e) {
        // Failed mid-way — revert so a human (or a retry) can still resolve it.
        await sb.from("stuck_requests").update({ status: "open" }).eq("id", stuckId);
        console.error("luna-room stuck error", e);
        return json({ error: "AI fallback failed" }, 500);
      }
    }

    // ── RECAP: structured events ONLY (never chat) ──
    if (mode === "recap") {
      const events: { type: string; text: string }[] = Array.isArray(body?.events) ? body.events : [];
      if (events.length === 0) return json({ error: "no events" }, 400);   // belt-and-suspenders; client also guards
      const goal = typeof body?.goal_text === "string" ? body.goal_text : "";
      const capped = events.slice(-40);   // cap prompt size on very long sessions
      const sys = "You are Luna. Write a study-session recap as 3 to 5 short bullet points covering: concepts covered, questions resolved, and anything left open. Use ONLY the structured events provided — never add, infer, or invent anything that isn't in them. Output ONLY the bullets, each on its own line starting with '- '. No title, no preamble, no closing line.";
      const userContent =
        `Session goal (context only, not an event): ${goal || "(none set)"}\n\n` +
        `Structured events (${events.length}${capped.length < events.length ? `, showing latest ${capped.length}` : ""}):\n` +
        capped.map((e) => `- [${e.type}] ${e.text}`).join("\n");
      const text = await callLuna(sys, userContent, LOVABLE_API_KEY);
      return json({ text });
    }

    return json({ error: "unknown mode" }, 400);
  } catch (e) {
    console.error("luna-room error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
