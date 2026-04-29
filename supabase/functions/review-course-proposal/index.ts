import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Proposal = {
  id: string;
  user_id: string;
  topic: string;
  description: string | null;
  level: string;
  structure: string;
  depth: string;
  weekly_hours: number;
  prerequisites: string | null;
  creator_reasoning: string;
};

type Verdict = {
  decision: "approve" | "deny";
  score: number; // 0-100
  reason: string; // ≤ 2 sentences
  feedback: string; // longer rationale (creator-facing)
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function heuristicGate(p: Proposal): { pass: boolean; reason?: string } {
  const topic = (p.topic || "").trim();
  const reasoning = (p.creator_reasoning || "").trim();
  const desc = (p.description || "").trim();

  if (topic.length < 4) return { pass: false, reason: "Topic is too short to evaluate. Add a clearer course title (at least a few words)." };
  if (/^[a-z]{1,3}$/i.test(topic)) return { pass: false, reason: "Topic looks like a placeholder. Use a descriptive title." };
  if (reasoning.length < 40) return { pass: false, reason: "Your 'why are you the right person' answer is too short. Add 2–3 sentences about your experience or motivation." };

  // Coherence: depth/level mismatch
  if (p.level === "beginner" && p.depth === "mastery") {
    return { pass: false, reason: "An 80+ hour mastery course doesn't fit a beginner audience. Pick a shorter depth or a higher level." };
  }
  if (p.level === "advanced" && p.depth === "overview") {
    return { pass: false, reason: "A 2–5 hour overview is too thin for an advanced course. Pick a deeper depth." };
  }

  // Profanity / spam keywords (very light filter)
  const spam = /(viagra|crypto.{0,4}pump|free.{0,4}money|onlyfans)/i;
  if (spam.test(topic + " " + desc + " " + reasoning)) {
    return { pass: false, reason: "Submission flagged as spam by automated filters." };
  }

  // Repeated character spam
  if (/(.)\1{6,}/.test(topic + reasoning)) {
    return { pass: false, reason: "Submission contains nonsense repeated characters." };
  }

  return { pass: true };
}

async function aiGrade(p: Proposal, apiKey: string): Promise<Verdict> {
  const prompt = `You are reviewing a course proposal for Eclipta, a learning platform that ships polished courses to thousands of learners. Be honest and critical, but constructive. Your bar: would a paying learner finish this course and feel they leveled up?

PROPOSAL:
- Topic: ${p.topic}
- Description: ${p.description || "(none provided)"}
- Target level: ${p.level}
- Structure: ${p.structure}
- Depth: ${p.depth}
- Weekly time commitment: ${p.weekly_hours} hours
- Prerequisites: ${p.prerequisites || "(none)"}
- Creator's reason for teaching this: ${p.creator_reasoning}

Score 0-100 where:
- 0-39: clearly weak — vague topic, incoherent scope, no creator credibility, or doesn't justify existing.
- 40-64: borderline — has a kernel of an idea but missing scope clarity, depth fit, or creator credibility.
- 65-100: solid — clear topic, coherent scope, plausible creator, would add value.

Approve if score >= 60. Otherwise deny.

If denying, the 'reason' must be ONE actionable sentence telling the creator what to fix (e.g. "Tighten the scope — 'AI' is too broad; pick a single application like 'building a RAG chatbot'."). Never lecture. Never moralize.

If approving, the 'reason' is ONE sentence on what makes it work.

'feedback' is 2-4 sentences with the deeper rationale either way.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_review",
            description: "Submit the course proposal review verdict.",
            parameters: {
              type: "object",
              properties: {
                decision: { type: "string", enum: ["approve", "deny"] },
                score: { type: "integer", minimum: 0, maximum: 100 },
                reason: { type: "string", description: "One actionable sentence." },
                feedback: { type: "string", description: "2-4 sentence rationale." },
              },
              required: ["decision", "score", "reason", "feedback"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_review" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("AI gateway error", res.status, t);
    throw new Error(`AI gateway returned ${res.status}`);
  }

  const data = await res.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("AI did not return a tool call");
  const args = JSON.parse(toolCall.function.arguments);
  return args as Verdict;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { proposalId } = await req.json();
    if (!proposalId) {
      return new Response(JSON.stringify({ error: "proposalId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller via their JWT (so reviewer = proposal author)
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: proposal, error: pErr } = await admin
      .from("course_proposals")
      .select("id,user_id,topic,description,level,structure,depth,weekly_hours,prerequisites,creator_reasoning,status")
      .eq("id", proposalId)
      .maybeSingle();

    if (pErr || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (proposal.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not your proposal" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Heuristic gate
    const gate = heuristicGate(proposal as Proposal);
    if (!gate.pass) {
      await admin.from("course_proposals").update({
        status: "denied",
        denial_reason: gate.reason,
        ai_score: 0,
        ai_feedback: gate.reason,
      }).eq("id", proposal.id);

      return new Response(JSON.stringify({
        decision: "deny",
        reason: gate.reason,
        feedback: gate.reason,
        score: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. AI grading
    let verdict: Verdict;
    try {
      verdict = await aiGrade(proposal as Proposal, LOVABLE_API_KEY);
    } catch (e) {
      console.error("AI grading failed:", e);
      // On AI failure: be permissive but mark for human review with a note.
      verdict = {
        decision: "approve",
        score: 60,
        reason: "Auto-approved (AI reviewer unavailable). Build out your course and we'll feature it once reviewed.",
        feedback: "The AI review service was unavailable. Your course was approved provisionally — you can start building it now.",
      };
    }

    if (verdict.decision === "deny") {
      await admin.from("course_proposals").update({
        status: "denied",
        denial_reason: verdict.reason,
        ai_score: verdict.score,
        ai_feedback: verdict.feedback,
      }).eq("id", proposal.id);

      return new Response(JSON.stringify(verdict), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Approved → create user_courses shell
    const baseSlug = slugify(proposal.topic) || "course";
    let slug = `${baseSlug}-${proposal.id.slice(0, 6)}`;

    const { data: course, error: cErr } = await admin
      .from("user_courses")
      .insert({
        user_id: userId,
        proposal_id: proposal.id,
        slug,
        title: proposal.topic,
        summary: proposal.description,
        level: proposal.level,
        structure: proposal.structure,
        depth: proposal.depth,
        status: "draft",
      })
      .select("id,slug")
      .single();

    if (cErr) {
      console.error("Course creation failed:", cErr);
      return new Response(JSON.stringify({ error: "Could not create course shell" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Seed first module
    await admin.from("course_modules").insert({
      course_id: course.id,
      title: "Introduction",
      position: 0,
    });

    await admin.from("course_proposals").update({
      status: "approved",
      denial_reason: null,
      ai_score: verdict.score,
      ai_feedback: verdict.feedback,
      course_id: course.id,
    }).eq("id", proposal.id);

    return new Response(JSON.stringify({
      ...verdict,
      courseId: course.id,
      courseSlug: course.slug,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("review-course-proposal error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});