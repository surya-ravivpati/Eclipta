/**
 * One narrowing point for Supabase Edge Function calls.
 *
 * `@supabase/functions-js` types its failure branch as `{ data: null; error:
 * any }`, so every call site that so much as reads `error.message` inherits an
 * `any` and loses type checking from there on. Narrowing it once here keeps
 * the callers honest, and puts message extraction in one place instead of
 * repeating a slightly different version of it at each call.
 *
 * This deliberately does not validate the payload: what a given function
 * returns is that function's business, and each caller already knows the shape
 * it asked for. What it guarantees is that `error` is a string you can show
 * and `data` is either absent or the shape the caller named.
 */
import { supabase } from "@/integrations/supabase/client";

export interface EdgeResult<T> {
  data: T | null;
  /** A message fit to log or show. Null when the call succeeded. */
  error: string | null;
}

/** Pull a readable message out of an error of unknown shape. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "The request failed.";
}

export async function invokeEdgeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<EdgeResult<T>> {
  // This destructuring is the `any` the whole module exists to absorb: the
  // library types its failure branch as `error: any`, and `messageOf` takes
  // it from `unknown`. Contained here so no caller inherits it.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) return { data: null, error: messageOf(error) };
  return { data: data ?? null, error: null };
}
