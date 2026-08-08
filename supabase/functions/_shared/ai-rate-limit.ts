export interface AiRateLimitRpcClient {
  rpc(
    functionName: "check_ai_rate_limit",
    arguments_: { p_user: string; p_max: number; p_window_secs: number },
  ): Promise<{ data: boolean | null }>;
}

const MAX_CALLS = 40;
const WINDOW_SECONDS = 300;

export async function checkAiRateLimit(
  client: AiRateLimitRpcClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data } = await client.rpc("check_ai_rate_limit", {
      p_user: userId,
      p_max: MAX_CALLS,
      p_window_secs: WINDOW_SECONDS,
    });
    return data !== false;
  } catch (error) {
    console.error("AI rate-limit check failed; allowing request:", error);
    return true;
  }
}
