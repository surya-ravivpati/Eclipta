// Provider-agnostic AI gateway config for the Luna / moderation edge functions.
//
// These functions all speak the OpenAI-compatible REST shape
// (POST /chat/completions, /audio/speech, /audio/transcriptions), so they can
// point at any compatible provider: OpenRouter, OpenAI, Groq, Together, a
// self-hosted proxy, etc.
//
// Free-tier setup (OpenRouter): set these as Supabase Edge Function secrets
// — never in a committed file, never in this repo's .env:
//   AI_GATEWAY_URL       https://openrouter.ai/api/v1
//   AI_GATEWAY_API_KEY   your OpenRouter key (sk-or-v1-...)
// OpenRouter's `:free` models are rate-limited (roughly 20 req/min, 50-1000
// req/day) but cost nothing. Their free lineup rotates — if AI_GATEWAY_MODEL
// stops resolving, check https://openrouter.ai/models?max_price=0 and set a
// new one, or point AI_GATEWAY_MODEL at "openrouter/free" to let OpenRouter
// auto-pick a working free model instead of pinning one slug.
//
// Text-to-speech / speech-to-text need a real audio API — OpenRouter doesn't
// proxy audio, so AI_AUDIO_* must point at an actual provider (e.g. OpenAI).
// That tier isn't free; leave AI_AUDIO_* unset to run Luna text-only, or set
// it if voice is worth the (small, usage-based) cost to you.
//   AI_AUDIO_URL          e.g. https://api.openai.com/v1
//   AI_AUDIO_API_KEY      your OpenAI key
//
// Until AI_GATEWAY_* are set, these fall back to the legacy Lovable gateway so
// nothing breaks mid-migration.

const LEGACY_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

export const AI_GATEWAY_URL = Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1";
export const AI_GATEWAY_API_KEY = Deno.env.get("AI_GATEWAY_API_KEY") ?? LEGACY_KEY;

// Single source of truth for the text/chat model id, so a free-tier slug
// change (OpenRouter's free lineup rotates) is a one-env-var fix instead of
// an edit-six-files fix. "openai/gpt-oss-20b:free" was confirmed free on
// OpenRouter and supports the `reasoning` param these functions pass.
export const AI_GATEWAY_MODEL = Deno.env.get("AI_GATEWAY_MODEL") ?? "openai/gpt-oss-20b:free";

// Audio (TTS/STT) can use a different provider than chat.
export const AI_AUDIO_URL = Deno.env.get("AI_AUDIO_URL") ?? AI_GATEWAY_URL;
export const AI_AUDIO_API_KEY = Deno.env.get("AI_AUDIO_API_KEY") ?? AI_GATEWAY_API_KEY;

export function assertAiConfigured() {
  if (!AI_GATEWAY_API_KEY) {
    throw new Error(
      "AI gateway is not configured. Set AI_GATEWAY_API_KEY (and AI_GATEWAY_URL) in the edge function secrets.",
    );
  }
}
