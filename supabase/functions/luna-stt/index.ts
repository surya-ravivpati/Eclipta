import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AI_AUDIO_URL, AI_AUDIO_API_KEY } from "../_shared/ai.ts";
import { checkAiRateLimit } from "../_shared/ai-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData } = await sb.auth.getUser(token);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(await checkAiRateLimit(sb, userData.user.id))) {
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

    if (!AI_AUDIO_API_KEY) throw new Error("Audio AI is not configured (set AI_AUDIO_API_KEY)");

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inForm = await req.formData();
    const file = inForm.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return new Response(JSON.stringify({ error: "Missing or empty audio file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.size > 20 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Audio too large (max 20MB)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const outForm = new FormData();
    outForm.append("model", "openai/gpt-4o-mini-transcribe");
    outForm.append("file", file, file.name || "recording.webm");

    const upstream = await fetch(`${AI_AUDIO_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AI_AUDIO_API_KEY}` },
      body: outForm,
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error("luna-stt upstream error", upstream.status, errText);
      const msg =
        upstream.status === 429
          ? "Rate limited — try again in a moment."
          : upstream.status === 402
            ? "AI credits exhausted."
            : `Transcription failed (${upstream.status})`;
      return new Response(JSON.stringify({ error: msg }), {
        status: upstream.status === 429 || upstream.status === 402 ? upstream.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await upstream.json();
    return new Response(JSON.stringify({ text: data?.text ?? "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("luna-stt error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
