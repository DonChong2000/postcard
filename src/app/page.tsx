"use client";

import { useEffect, useRef, useState } from "react";
import { Caveat, Courier_Prime, Gloria_Hallelujah } from "next/font/google";
import { download, renderBack, renderFront } from "@/lib/canvas";
import {
  MODELS,
  SIZES,
  STYLES,
  type ModelKey,
  type SizeKey,
  type StyleKey,
} from "@/lib/postcard";

const gloria = Gloria_Hallelujah({ weight: "400", subsets: ["latin"] });
const caveat = Caveat({ subsets: ["latin"] });
const courier = Courier_Prime({ weight: "400", subsets: ["latin"] });

// The face the message and address are written in — on screen and in the download.
// `card` is the on-card size in cqw (container-relative, so it scales with the card at
// any width — these are the old 640px-preview px sizes divided by 640);
// `chip` is the size the name is set in on its own picker chip, unaffected by the card.
const FONTS = {
  script: { label: "Caveat", css: caveat.style.fontFamily, card: "3.13cqw", chip: 19 },
  plain: { label: "Gloria Hallelujah", css: gloria.style.fontFamily, card: "2.03cqw", chip: 13 },
  type: { label: "Courier Prime", css: courier.style.fontFamily, card: "2.19cqw", chip: 13 },
} as const;

type FontKey = keyof typeof FONTS;
type Result = { front: string; back: string };

// The picker copy for each STYLES / SIZES key. The prompts themselves live in
// postcard.ts; these are only ever read to draw the two controls.
const STYLE_CARDS: Record<StyleKey, { inks: string[]; blurb: string }> = {
  vintage: { inks: ["#f7efdf", "#1d3557", "#e63946"], blurb: "Three flat inks, lots of paper" },
  polygon: { inks: ["#7a8a5e", "#c67139", "#46514f"], blurb: "Flat facets, colours from your photo" },
};
const SIZE_CARDS: Record<SizeKey, { label: string; note: string }> = {
  standard: {
    label: "Standard A6",
    note: "148 × 105 mm · 1748 × 1240 px at 300 dpi",
  },
  foldable: {
    label: "Foldable A7",
    note: "A6 sheet folded to A7 · the red line is the fold, a guide only — it is not in the download",
  },
};

// The wait is 30-60s of nothing; naming what is happening beats a dead spinner. The API
// is a single request, so the stages are timed rather than reported.
const STAGES = ["Reading your photo", "Printing the front", "Printing the back", "Trimming to A6"];

export default function Home() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [style, setStyle] = useState<StyleKey>("vintage");
  const [size, setSize] = useState<SizeKey>("standard");
  const [font, setFont] = useState<FontKey>("script");
  const [model, setModel] = useState<ModelKey>("gemini-3.1-flash-image");
  const [face, setFace] = useState<"front" | "back">("front");
  const [message, setMessage] = useState("");
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [stage, setStage] = useState(-1);
  const [error, setError] = useState("");
  const [dry, setDry] = useState("");
  const [dragging, setDragging] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [writing, setWriting] = useState(false);

  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const busy = stage >= 0;
  const fold = SIZES[size].fold;
  const addr = address.split("\n");

  // Below 700px the card is too small to type into directly (Caveat lands near 11px), so
  // focusing a card field instead opens a full-screen write sheet. False on first paint so
  // SSR and hydration match, then synced from the media query on mount.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!writing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWriting(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [writing]);

  function setAddrLine(i: number, v: string) {
    const next = [addr[0] ?? "", addr[1] ?? "", addr[2] ?? ""];
    next[i] = v;
    setAddress(next.join("\n"));
  }

  // Never opens the sheet on a wide screen — there the field just takes focus normally.
  function openWrite(e: React.FocusEvent<HTMLElement>) {
    if (!narrow) return;
    e.currentTarget.blur();
    setFace("back");
    setWriting(true);
  }

  function fields(): FormData {
    const f = new FormData();
    f.set("style", style);
    f.set("size", size);
    f.set("model", model);
    return f;
  }

  async function generate() {
    if (!photo) return setError("Pick a photo first.");
    setError("");
    setResult(null);
    setStage(0);
    timer.current = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      12_000,
    );
    try {
      const f = fields();
      f.set("photo", await shrink(photo), "photo.jpg");
      const res = await fetch("/api/generate", { method: "POST", body: f });
      // A reverse proxy rejecting the upload answers with an HTML error page, and
      // res.json() on that throws "Unexpected token '<'" instead of anything useful.
      if (!res.headers.get("content-type")?.includes("json")) {
        throw new Error(
          res.status === 413
            ? "The server rejected the upload as too large."
            : `Server returned ${res.status} with a non-JSON error page.`,
        );
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json);
      setFace("front");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(timer.current);
      setStage(-1);
    }
  }

  async function dryRun() {
    const res = await fetch("/api/generate?dryRun=1", { method: "POST", body: fields() });
    setDry(JSON.stringify(await res.json(), null, 2));
  }

  async function saveBoth() {
    if (!result) return;
    download(await renderFront(result.front, size), `postcard-${size}-front.png`);
    download(
      await renderBack(result.back, size, { message, address, font: FONTS[font].css }, false),
      `postcard-${size}-back.png`,
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-[1440px] items-center gap-3 px-[clamp(16px,4vw,32px)] py-[clamp(12px,2.2vw,20px)]">
        <span className="font-heading text-[clamp(16px,3.4vw,18px)]">Postcard</span>
        <span className="ml-auto text-[12px] text-muted">A6 · 300 dpi</span>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-row-reverse flex-wrap items-start gap-[clamp(20px,3vw,40px)] px-[clamp(16px,4vw,32px)] pt-2 pb-8">
        <div className="flex min-w-[min(100%,380px)] flex-[1_1_520px] flex-col gap-[14px]">
          <div className="flex flex-wrap items-center gap-[10px] self-stretch">
            <Seg className="flex-[1_1_180px]">
              {(["front", "back"] as const).map((k) => (
                <SegOpt
                  key={k}
                  name="face"
                  on={face === k}
                  onSelect={() => setFace(k)}
                  className="flex-1 justify-center px-[18px] py-[9px] capitalize"
                >
                  {k}
                </SegOpt>
              ))}
            </Seg>
            <button
              onClick={saveBoth}
              disabled={!result}
              className="flex flex-[1_1_180px] cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-4 py-[10px] font-heading text-[14px] text-bg hover:bg-accent-600 active:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <DownloadIcon />
              Download both
            </button>
          </div>

          <div className="grid w-full place-items-center [perspective:1800px]">
            <div
              className="relative aspect-[1748/1240] w-full max-w-[820px] transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] [transform-style:preserve-3d]"
              style={{ transform: `rotateY(${face === "back" ? 180 : 0}deg)` }}
            >
              {/* Front */}
              <Face>
                {result ? (
                  <img
                    src={result.front}
                    alt="Generated front artwork"
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <Sample src="/sample-front.jpg" watermark={!narrow} />
                )}
                <div className="absolute bottom-[2.8cqw] left-[3.4cqw] flex items-center gap-2">
                  <span className="rounded-full bg-paper/90 px-[1.6cqw] py-[0.5cqw] text-[max(9px,1.72cqw)] text-neutral-800">
                    front · generated art
                  </span>
                  {busy && (
                    <span className="animate-rise rounded-full bg-accent px-[10px] py-[3px] text-[11px] text-bg">
                      {STAGES[stage]}…
                    </span>
                  )}
                </div>
                {busy && (
                  <div className="animate-sweep absolute inset-y-0 w-[35%] bg-linear-to-r from-transparent via-paper/75 to-transparent" />
                )}
                {narrow && (
                  <CardUpload
                    photo={photo}
                    setPhoto={setPhoto}
                    dragging={dragging}
                    setDragging={setDragging}
                    setError={setError}
                  />
                )}
                {fold && <FoldGuide />}
              </Face>

              {/* Back */}
              <Face className="grid grid-cols-2 [transform:rotateY(180deg)]">
                {result ? (
                  <img
                    src={result.back}
                    alt="Generated back artwork"
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <Sample src="/sample-back.jpg" />
                )}
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onFocus={openWrite}
                  placeholder="Write your message here…"
                  className="writable relative resize-none leading-[1.7]"
                  style={{
                    padding: "20% 11% 10%",
                    borderRight: fold ? "0" : "2px solid var(--color-neutral-300)",
                    fontFamily: FONTS[font].css,
                    fontSize: FONTS[font].card,
                  }}
                />
                <div
                  className="relative flex flex-col"
                  style={{ padding: "14% 11% 10%", gap: "4%" }}
                >
                  {!fold && (
                    <div className="aspect-[.83] w-[26%] self-end rounded-[max(3px,0.6cqw)] border-[max(1.5px,0.3cqw)] border-dashed border-neutral-400" />
                  )}
                  <div
                    className="mt-[2%] flex flex-col gap-[5%]"
                    style={{ fontFamily: FONTS[font].css, fontSize: FONTS[font].card }}
                  >
                    {["Name", "Street", "City, postcode"].map((ph, i) => (
                      <input
                        key={ph}
                        value={addr[i] ?? ""}
                        onChange={(e) => setAddrLine(i, e.target.value)}
                        onFocus={openWrite}
                        placeholder={ph}
                        className="writable min-h-[3.4cqw] border-b-[max(1px,0.24cqw)] border-neutral-400"
                      />
                    ))}
                  </div>
                </div>
                {fold && <FoldGuide />}
              </Face>
            </div>
          </div>

          {/* Sits by the card, not in the sidebar, so nothing stands between the user
              and Generate — the face is only worth choosing once there is a card. */}
          <div className="hscroll -mx-[clamp(16px,4vw,32px)] flex items-center gap-2 overflow-x-auto px-[clamp(16px,4vw,32px)] pb-[2px]">
            <span className="mr-1 flex-none text-[12px] text-muted">Handwriting</span>
            {(Object.keys(FONTS) as FontKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setFont(k)}
                aria-pressed={font === k}
                className={`inline-flex flex-none cursor-pointer items-center rounded-full border-2 px-[14px] py-[5px] leading-[1.3] ${
                  font === k ? "border-accent bg-accent-100" : "border-transparent bg-surface"
                }`}
                style={{ fontFamily: FONTS[k].css, fontSize: FONTS[k].chip }}
              >
                {FONTS[k].label}
              </button>
            ))}
            <span className="flex-none pr-1 text-[12px] text-muted">
              {narrow ? "Tap the card to write full screen" : "Click to turn it over"}
            </span>
          </div>
        </div>

        <div className="flex min-w-[min(100%,260px)] flex-[1_1_300px] flex-col gap-[22px]">
          {!narrow && (
            <section>
              <Heading>1 · Your photo</Heading>
              {/* The hidden input can't be a drop target, so the label is one. */}
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (!f) return;
                  if (!f.type.startsWith("image/")) return setError("That isn't an image file.");
                  setError("");
                  setPhoto(f);
                }}
                // :hover doesn't fire while a drag is in progress, so `dragging` stands in for it.
                className={`flex cursor-pointer flex-row flex-wrap items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-[color-mix(in_srgb,var(--color-surface)_55%,transparent)] p-[clamp(16px,3vw,22px)] text-center hover:border-accent hover:bg-accent-100 ${
                  dragging ? "border-accent bg-accent-100" : "border-neutral-400"
                }`}
              >
                <span className="grid size-[58px] flex-none place-items-center rounded-full bg-accent-200 text-accent-700">
                  <ArrowUp />
                </span>
                <span className="flex min-w-[150px] flex-col gap-[2px] text-left">
                  <span className="font-heading text-[15px]">
                    {photo ? "Photo ready" : "Drop a photo"}
                  </span>
                  <span className="text-[12px] text-muted">
                    {photo ? (
                      photo.name
                    ) : (
                      <>
                        or{" "}
                        <span className="text-accent-700 underline underline-offset-[3px]">
                          browse
                        </span>{" "}
                        · JPG, PNG, WebP
                      </>
                    )}
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
              </label>
            </section>
          )}

          <section>
            <Heading>{narrow ? 1 : 2} · Style</Heading>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[10px]">
              {(Object.keys(STYLES) as StyleKey[]).map((k) => (
                <Pill key={k} on={style === k} onClick={() => setStyle(k)}>
                  <span className="flex flex-none gap-1">
                    {STYLE_CARDS[k].inks.map((c, i) => (
                      <span
                        key={i}
                        // The cream ink needs an outline to read against the tinted card.
                        className="h-[34px] w-[22px] rounded-[6px]"
                        style={{
                          background: c,
                          boxShadow: i === 0 && k === "vintage" ? "inset 0 0 0 1px var(--color-neutral-400)" : undefined,
                        }}
                      />
                    ))}
                  </span>
                  <span>
                    <span className="block font-heading text-[15px]">{STYLES[k].label}</span>
                    <span className="block text-[12px] text-muted">{STYLE_CARDS[k].blurb}</span>
                  </span>
                </Pill>
              ))}
            </div>
          </section>

          <section>
            <Heading>{narrow ? 2 : 3} · Size</Heading>
            <Seg className="w-full">
              {(Object.keys(SIZES) as SizeKey[]).map((k) => (
                <SegOpt
                  key={k}
                  name="size"
                  on={size === k}
                  onSelect={() => setSize(k)}
                  className="flex-1 justify-center px-[12px] py-[9px]"
                >
                  {SIZE_CARDS[k].label}
                </SegOpt>
              ))}
            </Seg>
            <p className="mt-2 text-[12px] text-muted">{SIZE_CARDS[size].note}</p>
          </section>

          <button
            onClick={generate}
            disabled={busy}
            className="sticky bottom-[12px] w-full cursor-pointer rounded-full bg-accent p-[14px] font-heading text-[15px] text-bg shadow-[0_6px_20px_rgba(46,43,37,.18)] hover:bg-accent-600 active:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? `${STAGES[stage]}…` : "Generate the card"}
          </button>

          {error && <p className="text-accent-700">{error}</p>}
        </div>
      </main>

      <details className="mx-auto w-full max-w-[1440px] px-[clamp(16px,4vw,32px)] pt-[18px] pb-8 text-[14px]">
        <summary className="ml-auto w-fit cursor-pointer list-none rounded-full px-1 text-[12px] text-accent hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]">
          Dev panel
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-[1_1_240px] flex-col gap-1">
            Model
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ModelKey)}
              className="min-h-[40px] w-full rounded-full border border-divider bg-surface px-[14px] py-1.5"
            >
              {Object.entries(MODELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={dryRun}
            className="flex-[1_1_160px] cursor-pointer rounded-full border border-divider px-4 py-2 font-heading text-[14px]"
          >
            Dry run (no cost)
          </button>
        </div>
        {dry && (
          <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-surface p-3 text-xs whitespace-pre-wrap">
            {dry}
          </pre>
        )}
      </details>

      {writing && (
        <div
          className="fixed inset-0 z-50 flex flex-col gap-3 bg-[rgba(32,30,29,.55)] p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWriting(false);
          }}
        >
          <div className="flex items-center gap-3">
            <span className="font-heading text-[15px] text-bg">Write the back</span>
            <button
              onClick={() => setWriting(false)}
              className="ml-auto cursor-pointer rounded-full bg-accent px-[18px] py-2 font-heading text-[14px] text-bg"
            >
              Done
            </button>
          </div>
          <div className="relative flex aspect-[1240/1748] w-full max-h-[calc(100dvh-120px)] flex-col overflow-hidden rounded-[6px] bg-paper shadow-[0_12px_32px_rgba(46,43,37,.35)]">
            <img
              src="/sample-back.jpg"
              alt=""
              className="pointer-events-none absolute inset-0 size-full object-fill opacity-15"
            />
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your message here…"
              className="writable relative flex-1 resize-none leading-[1.7]"
              style={{ padding: "9% 9% 4%", fontFamily: FONTS[font].css, fontSize: "6.2cqw" }}
            />
            <div
              className="relative flex flex-col"
              style={{ padding: "0 9% 9%", gap: "3%", fontFamily: FONTS[font].css, fontSize: "6.2cqw" }}
            >
              {["Name", "Street", "City, postcode"].map((ph, i) => (
                <input
                  key={ph}
                  value={addr[i] ?? ""}
                  onChange={(e) => setAddrLine(i, e.target.value)}
                  placeholder={ph}
                  className="writable min-h-[44px] border-b-[1.5px] border-neutral-400"
                  style={{ padding: "4px 2px" }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h6 className="mb-[10px] font-heading text-[13px] tracking-[0.08em] text-accent-700 uppercase">
      {children}
    </h6>
  );
}

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex cursor-pointer items-center gap-[10px] rounded-lg border-2 p-[14px] text-left ${
        on ? "border-accent bg-accent-100" : "border-transparent bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

function Seg({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`inline-flex overflow-hidden rounded-full border border-divider ${className}`}>
      {children}
    </div>
  );
}

function SegOpt({
  name,
  on,
  onSelect,
  className = "",
  children,
}: {
  name: string;
  on: boolean;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center px-3 py-[7px] text-[13px] not-first:border-l not-first:border-divider has-[:checked]:bg-accent has-[:checked]:text-bg not-has-[:checked]:hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent ${className}`}
    >
      <input
        type="radio"
        name={name}
        checked={on}
        onChange={onSelect}
        className="absolute size-0 opacity-0"
      />
      {children}
    </label>
  );
}

// Both card faces get this so everything drawn on them can size itself in cqw and scale
// with the card at any width, from a 340px phone to an 820px desktop card.
function Face({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`absolute inset-0 @container overflow-hidden bg-paper shadow-lg [backface-visibility:hidden] ${className}`}
    >
      {children}
    </div>
  );
}

// Stands in until there is a real card: an example postcard faded right back, watermarked
// so it never reads as the user's own. Never exported — the canvas renderers don't see it.
// `watermark` is turned off on a narrow front face, where the on-card upload pill sits in
// its place — the two would otherwise overlap.
function Sample({ src, watermark = true }: { src: string; watermark?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 select-none @container">
      {/* fill, not cover: the back sample's art is in its corners, which cover would crop off. */}
      <img src={src} alt="" className="size-full object-fill opacity-15" />
      {watermark && (
        <span className="absolute inset-0 grid place-items-center font-heading text-[14cqw] tracking-[0.18em] text-neutral-500/40">
          SAMPLE
        </span>
      )}
    </div>
  );
}

// Narrow-only: replaces the sidebar's step-1 section, so the card front itself is the drop
// target. No scrim or inner box — the dashed outline (real drag) and hover widen from 0 so
// the sample art stays visible underneath, same as the step-1 dropzone it replaces.
function CardUpload({
  photo,
  setPhoto,
  dragging,
  setDragging,
  setError,
}: {
  photo: File | null;
  setPhoto: (f: File | null) => void;
  dragging: boolean;
  setDragging: (b: boolean) => void;
  setError: (s: string) => void;
}) {
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) return setError("That isn't an image file.");
        setError("");
        setPhoto(f);
      }}
      className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-[2.2cqw] text-center outline-0 outline-dashed outline-accent hover:[outline-width:max(2px,0.45cqw)]"
      style={{
        outlineOffset: "-2.6cqw",
        outlineWidth: dragging ? "max(2px, 0.45cqw)" : undefined,
      }}
    >
      <span className="inline-flex items-center gap-[0.5em] rounded-full bg-accent px-[4.6cqw] py-[2.2cqw] font-heading text-[max(13px,3.4cqw)] text-bg shadow-[0_6px_20px_rgba(46,43,37,.22)]">
        <ArrowUp size="1.1em" />
        {photo ? "Photo ready" : "Add a photo"}
      </span>
      <span className="text-[max(10px,2.5cqw)] text-[rgba(32,30,29,.6)]">
        {photo ? photo.name : "or drop one on the card · JPG, PNG, WebP"}
      </span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
    </label>
  );
}

// Preview only — renderBack draws its own guide and never puts it in the export.
function FoldGuide() {
  return (
    <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0 border-l-[max(1px,0.3cqw)] border-dashed border-fold" />
  );
}

function ArrowUp({ size = 26 }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

// Phone photos run 3-12MB and the models resample to about 1024px anyway, so uploading
// the original only buys a reverse-proxy size rejection. 1600px keeps it under ~400KB.
async function shrink(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1_000_000) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
}
