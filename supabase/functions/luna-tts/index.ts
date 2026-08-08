import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AI_AUDIO_URL, AI_AUDIO_API_KEY } from "../_shared/ai.ts";
import { checkAiRateLimit } from "../_shared/ai-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
    if (!text) {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // "sage" reads warm and natural; matches Luna's mentor persona.
    const voice = typeof body?.voice === "string" ? body.voice : "sage";
    const instructions =
      "You are Luna, a warm, encouraging AI tutor. Read in a natural, conversational voice — like a thoughtful friend explaining something one-on-one. Use light, human intonation, gentle pacing with brief pauses at commas and periods, and a calm, upbeat tone. Never sound robotic, flat, or read-out-loud. Skip any formatting characters, brackets, hashtags, or stage directions.";

    const upstream = await fetch(`${AI_AUDIO_URL}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_AUDIO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: text,
        voice,
        instructions,
        response_format: "mp3",
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error("luna-tts upstream error", upstream.status, errText);
      return new Response(JSON.stringify({ error: `TTS failed (${upstream.status})` }), {
        status: upstream.status === 429 || upstream.status === 402 ? upstream.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("luna-tts error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
