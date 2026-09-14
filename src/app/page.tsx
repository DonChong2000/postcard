import Link from "next/link";
import SampleCard from "./SampleCard";

// The landing page. One screen: wordmark, headline, sentence, CTA, and a card that
// flips. Everything else drafted for it was cut by the designer — don't add it back.
export default function Landing() {
  return (
    <div className="px-[clamp(18px,5vw,56px)]">
      <header className="mx-auto flex max-w-[1180px] items-baseline gap-[14px] pt-[22px]">
        <span className="font-heading text-[22px]">Postcard</span>
      </header>

      <section className="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-center gap-[clamp(28px,5vw,64px)] pt-[clamp(40px,7vw,86px)] pb-[clamp(36px,6vw,72px)]">
        <div className="flex min-w-0 flex-col items-start gap-[22px]">
          <h1 className="font-heading text-[clamp(34px,5.4vw,58px)] leading-[1.08] tracking-[-.01em] text-pretty">
            One photo, three postcards, ready to print.
          </h1>
          <p className="max-w-[46ch] text-[clamp(16px,1.6vw,18px)] text-[rgba(32,30,29,.72)] text-pretty">
            Upload a picture and get three illustrated fronts back. Write the message
            beside the card and watch it land on it.
          </p>
          <Link
            href="/app"
            className="rounded-full bg-accent px-[28px] py-[15px] font-heading text-[16px] text-bg shadow-[0_6px_20px_rgba(46,43,37,.18)] hover:bg-accent-600"
          >
            Make one
          </Link>
        </div>

        <SampleCard />
      </section>
    </div>
  );
}
