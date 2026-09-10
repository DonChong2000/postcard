export async function register() {
  // Local dev only: Node's fetch (undici) ignores HTTPS_PROXY unless told to use it.
  // Vercel prod never sets this, so this is a no-op there.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.HTTPS_PROXY) {
    const { setGlobalDispatcher, ProxyAgent } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
  }
}
