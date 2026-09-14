import Stripe from "stripe";

const MAX_URL = 500; // Stripe caps a metadata value at 500 chars.

// ponytail: no rate limit — a session costs nothing and Stripe owns everything past the
// redirect. /api/generate already guards the path that spends money.
export async function POST(request: Request) {
  const { artUrl, backUrl } = await request.json();
  // Both faces: the back carries the message and address as real text. Only accept keys this
  // app minted — without that the metadata is a free redirect, and whatever lands here is
  // what a print job later downloads.
  if (!isOwnUpload(artUrl) || !isOwnUpload(backUrl)) return bad("not an uploaded card");
  if (!process.env.STRIPE_SECRET_KEY) return bad("STRIPE_SECRET_KEY is not set", 500);
  if (!process.env.STRIPE_PRICE_ID) return bad("STRIPE_PRICE_ID is not set", 500);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const origin = request.headers.get("origin") ?? new URL(request.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // The amount comes from the price id, never from the browser.
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      metadata: { artUrl, backUrl },
      // Session metadata is what the webhook sees, but the dashboard's Payments page shows
      // the PaymentIntent, and Stripe does not copy one to the other. Set both, or hand
      // fulfilment has nothing to read.
      payment_intent_data: { metadata: { artUrl, backUrl } },
      shipping_address_collection: { allowed_countries: ["HK", "TW", "US", "GB"] },
      // {CHECKOUT_SESSION_ID} is substituted by Stripe on the redirect — that is how the
      // success page knows which order to show.
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app`,
    });
    if (!session.url) return bad("Stripe returned no checkout url", 502);
    return Response.json({ url: session.url });
  } catch (e) {
    console.error("checkout failed", e);
    return bad(e instanceof Error ? e.message : "checkout failed", 502);
  }
}

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

function isOwnUpload(url: unknown) {
  if (typeof url !== "string" || url.length > MAX_URL) return false;
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith("/api/o/") && pathname.endsWith(".png");
  } catch {
    return false;
  }
}
