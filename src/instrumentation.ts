export async function register() {
  // Local dev only: Node's fetch (undici) ignores HTTPS_PROXY unless told to use it.
  // The production server doesn't set this, so it's a no-op there.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.HTTPS_PROXY) {
    const { setGlobalDispatcher, ProxyAgent } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
  }
}
