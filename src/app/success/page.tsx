import Link from "next/link";
import Stripe from "stripe";

// Stripe substitutes {CHECKOUT_SESSION_ID} into the success_url, so this page can show the
// actual order rather than a generic thank-you. Arriving without a usable id — someone typed
// the URL, or the session expired — is not an error: fall back to the plain version.
export default async function Success({ searchParams }: PageProps<"/success">) {
  const { session_id } = await searchParams;
  const order = await load(typeof session_id === "string" ? session_id : null);

  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-lg bg-paper p-7 shadow-lg">
        <p className="font-heading text-[13px] tracking-wide text-accent-700">
          {order ? "Paid" : "Thank you"}
        </p>
        <h1 className="mt-1 font-heading text-[28px] leading-tight text-neutral-900">
          Your postcard is on its way
        </h1>
        <p className="mt-3 text-[14px] text-muted">
          {order
            ? "We print it and put it in the post. Nothing else for you to do."
            : "If you have just paid, your order is safely recorded — this page simply could not load the details."}
        </p>

        {order && (
          <dl className="mt-6 flex flex-col gap-3 border-t border-divider pt-5 text-[14px]">
            <Row label="Total" value={order.total} />
            {order.email && <Row label="Receipt sent to" value={order.email} />}
            {order.shipTo && <Row label="Posting to" value={order.shipTo} />}
          </dl>
        )}

        <Link
          href="/"
          className="mt-7 inline-block cursor-pointer rounded-full bg-accent p-[13px] px-6 font-heading text-[15px] text-bg shadow-[0_6px_20px_rgba(46,43,37,.18)] hover:bg-accent-600"
        >
          Make another
        </Link>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="flex-none text-muted">{label}</dt>
      <dd className="text-right whitespace-pre-line text-neutral-900">{value}</dd>
    </div>
  );
}

async function load(id: string | null) {
  if (!id || !process.env.STRIPE_SECRET_KEY) return null;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(id);
    // Only celebrate money that actually arrived. An abandoned session still resolves here.
    if (s.payment_status !== "paid") return null;

    const ship = s.collected_information?.shipping_details;
    return {
      // ponytail: /100 assumes a two-decimal currency. True for HKD; revisit if you ever
      // price this in JPY.
      total: new Intl.NumberFormat("en", {
        style: "currency",
        currency: (s.currency ?? "hkd").toUpperCase(),
      }).format((s.amount_total ?? 0) / 100),
      email: s.customer_details?.email ?? null,
      shipTo: ship
        ? [ship.name, ship.address.line1, ship.address.line2, ship.address.city, ship.address.postal_code, ship.address.country]
            .filter(Boolean)
            .join("\n")
        : null,
    };
  } catch (e) {
    console.error("could not load the paid session", e);
    return null;
  }
}
