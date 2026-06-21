// The Token Company context compression. We compress battle prompts before
// sending them to Claude to cut tokens/latency. If the key/URL are missing or
// the call fails, we gracefully pass the original text through so battles never
// break.
export async function compressContext(text: string): Promise<string> {
  const apiKey = process.env.TOKENCOMPANY_API_KEY;
  const url =
    process.env.TOKENCOMPANY_API_URL || "https://api.thetokencompany.com/v1/compress";
  if (!apiKey) return text;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      // Don't let a slow optimizer stall the battle.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return text;
    const data = (await res.json()) as {
      compressed?: string;
      text?: string;
      result?: string;
    };
    return data.compressed || data.text || data.result || text;
  } catch {
    return text;
  }
}
