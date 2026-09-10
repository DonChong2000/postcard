"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Caveat, Courier_Prime, Gloria_Hallelujah } from "next/font/google";
import { download, renderBack, renderFront } from "@/lib/canvas";
import { MODELS, STYLES, type ModelKey, type StyleKey } from "@/lib/postcard";

const gloria = Gloria_Hallelujah({ weight: "400", subsets: ["latin"] });
const caveat = Caveat({ subsets: ["latin"] });
const courier = Courier_Prime({ weight: "400", subsets: ["latin"] });

// The face the message and address are written in — on screen and in the download.
// `card` is the on-card size in cqw (container-relative, so it scales with the card at
// any width); `chip` is the size the name is set in on its own picker chip.
const FONTS = {
  script: { label: "Caveat", css: caveat.style.fontFamily, card: "3.5cqw", chip: 18 },
  plain: { label: "Gloria Hallelujah", css: gloria.style.fontFamily, card: "2.3cqw", chip: 12 },
  type: { label: "Courier Prime", css: courier.style.fontFamily, card: "2.5cqw", chip: 12 },
} as const;

type FontKey = keyof typeof FONTS;
type Result = { front: string; back: string };
type Results = Record<StyleKey, Result>;

const FONT_KEYS = Object.keys(FONTS) as FontKey[];
const STYLE_KEYS = Object.keys(STYLES) as StyleKey[];
const ADDRESS_LINES = ["Name", "Street", "City, postcode"];

// The wait is 30-60s of nothing; naming what is happening beats a dead spinner. The API
// generates all styles in parallel, so the stages are timed rather than reported.
const STAGES = ["Reading your photo", "Printing the fronts", "Printing the backs", "Trimming to A6"];

// ponytail: the model picker and dry run are dev tools, not part of the flow — an env
// check keeps them out of the shipped UI without a second build of the page.
const DEV = process.env.NODE_ENV === "development";

const GHOST =
  "flex-none cursor-pointer rounded-full px-[10px] py-[4px] text-[12px] text-accent-700 hover:bg-[rgba(198,113,57,.12)]";
const PILL =
  "cursor-pointer rounded-full bg-accent p-[13px] font-heading text-[15px] text-bg shadow-[0_6px_20px_rgba(46,43,37,.18)] hover:bg-accent-600 active:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none";

export default function Home() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [info, setInfo] = useState("");
  const [font, setFont] = useState<FontKey>("script");
  const [model, setModel] = useState<ModelKey>("gemini-3.1-flash-image");
  const [face, setFace] = useState<"front" | "back">("front");
  const [message, setMessage] = useState("");
  const [address, setAddress] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [activeStyle, setActiveStyle] = useState<StyleKey>(STYLE_KEYS[0]);
  const [stage, setStage] = useState(-1);
  const [error, setError] = useState("");
  const [dry, setDry] = useState("");
  const [both, setBoth] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [fold, setFold] = useState(true);
  const [saved, setSaved] = useState(false);

  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = stage >= 0;
  const addr = address.split("\n");
  const active = results ? results[activeStyle] : null;
  // Step 4 has no state of its own — it unlocks with the results that step 3 needs too.
  const step = !photo ? 1 : !results ? 2 : 3;

  // Preview of the chosen photo on the card front, before generation. Revoked whenever
  // `photo` changes so blob URLs don't pile up.
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  // Below 700px the rail doesn't fit beside a readable card, so the whole layout swaps:
  // the card stays pinned to the top and one action is offered at a time. False on first
  // paint so SSR and hydration match, then synced from the media query on mount.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  useEffect(() => () => {
    clearInterval(timer.current);
    clearTimeout(savedTimer.current);
    abort.current?.abort();
  }, []);

  function setAddrLine(i: number, v: string) {
    const next = [addr[0] ?? "", addr[1] ?? "", addr[2] ?? ""];
    next[i] = v;
    setAddress(next.join("\n"));
  }

  // Picking a photo *is* the generate action — the old "chosen, now press Generate" beat
  // was dead. Commitment stays reversible instead: Stop, Replace, Generate three more.
  function pick(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("That isn't an image file.");
    setPhoto(file);
    setInfo("");
    generate(file);
  }

  function stop() {
    abort.current?.abort();
    clearInterval(timer.current);
    setStage(-1);
  }

  // Both "Replace" and "Start over": back to an empty card, keeping what was written.
  function reset() {
    stop();
    setPhoto(null);
    setResults(null);
    setInfo("");
    setError("");
    setFace("front");
    setSheet(false);
    setSaved(false);
  }

  async function generate(file: File | null = photo) {
    if (!file) return setError("Pick a photo first.");
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setError("");
    setResults(null);
    setSaved(false);
    setFace("front");
    setStage(0);
    clearInterval(timer.current);
    timer.current = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      12_000,
    );
    try {
      const { blob, px } = await shrink(file);
      setInfo(`${px} px · ${Math.round(blob.size / 1024)} KB`);
      const entries = await Promise.all(
        STYLE_KEYS.map(async (k) => {
          const f = new FormData();
          f.set("style", k);
          f.set("model", model);
          if (both) f.set("back", "1");
          f.set("photo", blob, "photo.jpg");
          const res = await fetch("/api/generate", { method: "POST", body: f, signal: ac.signal });
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
          return [k, json] as const;
        }),
      );
      setResults(Object.fromEntries(entries) as Results);
      setActiveStyle(STYLE_KEYS[0]);
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      // Aborted means either Stop (which already cleared) or a newer run that owns the
      // timer now — either way this run must not touch the stage.
      if (!ac.signal.aborted) {
        clearInterval(timer.current);
        setStage(-1);
      }
    }
  }

  async function dryRun() {
    const entries = await Promise.all(
      STYLE_KEYS.map(async (k) => {
        const f = new FormData();
        f.set("style", k);
        f.set("model", model);
        const res = await fetch("/api/generate?dryRun=1", { method: "POST", body: f });
        return [k, await res.json()] as const;
      }),
    );
    setDry(JSON.stringify(Object.fromEntries(entries), null, 2));
  }

  async function saveBoth() {
    if (!active) return;
    download(await renderFront(active.front), "postcard-front.png");
    download(
      await renderBack(active.back, { message, address, font: FONTS[font].css }),
      "postcard-back.png",
    );
    clearTimeout(savedTimer.current);
    setSaved(true);
    savedTimer.current = setTimeout(() => setSaved(false), 2600);
  }

  // Raw model output, before the A5 crop and the text overlay. data: URLs, so an
  // anchor click is the whole download.
  function saveRaw() {
    if (!results) return;
    for (const style of STYLE_KEYS) {
      for (const k of ["front", "back"] as const) {
        const src = results[style][k];
        if (!src) continue;
        const a = document.createElement("a");
        a.href = src;
        a.download = `raw-${style}-${k}.${src.slice(11, src.indexOf(";"))}`;
        a.click();
      }
    }
  }

  const card = {
    face,
    fold,
    busy,
    active,
    photoUrl,
    message,
    addr,
    font,
    onFlip: () => setFace((f) => (f === "front" ? "back" : "front")),
  };

  const skeletons = (
    <div className="grid grid-cols-3 gap-2">
      {STYLE_KEYS.map((k) => (
        <span
          key={k}
          className="relative m-[4px] block aspect-[2480/1748] overflow-hidden rounded-[12px] bg-surface"
        >
          <span className="animate-sweep absolute inset-y-0 w-[45%] bg-linear-to-r from-transparent via-paper/70 to-transparent" />
        </span>
      ))}
    </div>
  );

  const progress = (
    <div className="h-[6px] overflow-hidden rounded-full bg-surface">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
        style={{ width: `${(stage + 1) * 25}%` }}
      />
    </div>
  );

  const styleGrid = results && (
    <div className="grid grid-cols-3 gap-2">
      {STYLE_KEYS.map((k) => (
        <button
          key={k}
          onClick={() => {
            setActiveStyle(k);
            setFace("front");
          }}
          className={`flex cursor-pointer flex-col gap-[5px] rounded-[16px] border-2 p-[4px] ${
            activeStyle === k ? "border-accent bg-accent-100" : "border-transparent"
          }`}
        >
          <span className="relative block aspect-[2480/1748] overflow-hidden rounded-[12px] bg-surface">
            <img
              src={results[k].front}
              alt={STYLES[k].label}
              className="absolute inset-0 size-full object-cover"
            />
          </span>
          <span
            className={`text-center text-[11px] ${
              activeStyle === k ? "text-accent-700" : "text-muted"
            }`}
          >
            {STYLES[k].label.split(" ")[0]}
          </span>
        </button>
      ))}
    </div>
  );

  const chips = (
    <div className="flex flex-none flex-wrap items-center gap-[6px]">
      <span className="w-full text-[12px] text-muted">Handwriting</span>
      {FONT_KEYS.map((k) => (
        <button
          key={k}
          onClick={() => setFont(k)}
          aria-pressed={font === k}
          className={`inline-flex cursor-pointer items-center rounded-full border-2 px-[11px] py-[3px] leading-[1.3] whitespace-nowrap ${
            font === k ? "border-accent bg-accent-100" : "border-transparent bg-surface"
          }`}
          style={{ fontFamily: FONTS[k].css, fontSize: FONTS[k].chip }}
        >
          {FONTS[k].label}
        </button>
      ))}
    </div>
  );

  const seg = (compact: boolean) => (
    <div className="inline-flex overflow-hidden rounded-full border border-divider bg-bg">
      {(["front", "back"] as const).map((k) => (
        <button
          key={k}
          onClick={() => setFace(k)}
          aria-pressed={face === k}
          className={`cursor-pointer capitalize ${
            compact ? "px-4 py-[7px] text-[12px]" : "px-[22px] py-[9px] text-[13px]"
          } ${face === k ? "bg-accent text-bg" : "hover:bg-[rgba(32,30,29,.06)]"}`}
        >
          {k}
        </button>
      ))}
    </div>
  );

  const desktop = (
    <div className="grid h-dvh w-full grid-cols-[minmax(360px,400px)_1fr] overflow-hidden">
      <div className="flex flex-col gap-4 overflow-y-auto border-r border-[rgba(32,30,29,.1)] px-[30px] pt-[26px] pb-[22px]">
        <div className="flex flex-none items-baseline gap-[10px]">
          <span className="font-heading text-[22px]">Postcard</span>
          <span className="ml-auto text-[11px] tracking-[.06em] whitespace-nowrap text-muted uppercase">
            A5 · 300 dpi
          </span>
        </div>

        <Step n={1} on title="Your photo">
          {!photo ? (
            <button
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files[0]);
              }}
              // :hover doesn't fire while a drag is in progress, so `dragging` stands in.
              className={`flex w-full cursor-pointer items-center gap-3 rounded-[20px] border-2 border-dashed p-[14px] text-left hover:border-accent hover:bg-accent-100 ${
                dragging
                  ? "border-accent bg-accent-100"
                  : "border-neutral-400 bg-[rgba(235,221,197,.55)]"
              }`}
            >
              <span className="grid size-[40px] flex-none place-items-center rounded-full bg-accent-200 text-accent-700">
                <ArrowUp />
              </span>
              <span className="flex flex-col">
                <span className="text-[14px] font-semibold">Drop a photo, or browse</span>
                <span className="text-[12px] text-muted">
                  Three styles start printing right away
                </span>
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-[20px] bg-surface py-[10px] pr-[14px] pl-[10px]">
              <img
                src={photoUrl ?? ""}
                alt=""
                className="h-[40px] w-[52px] flex-none rounded-[12px] object-cover"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-semibold">{photo.name}</span>
                <span className="text-[12px] text-muted">{info || "reading…"}</span>
              </span>
              <button onClick={reset} className={GHOST}>
                Replace
              </button>
            </div>
          )}
          {error && <p className="text-[12px] text-accent-700">{error}</p>}
        </Step>

        <Step
          n={2}
          on={step >= 2}
          title="Pick a style"
          meta={results ? "3 generated" : busy ? "generating" : "3 at once"}
        >
          {busy ? (
            <>
              {skeletons}
              {progress}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted">{STAGES[stage]} · {both ? "front and back" : "front"}</span>
                <button onClick={stop} className={`${GHOST} ml-auto`}>
                  Stop
                </button>
              </div>
            </>
          ) : results ? (
            <>
              {styleGrid}
              <button
                onClick={() => generate()}
                className={`${GHOST} self-start whitespace-nowrap`}
              >
                Generate three more
              </button>
            </>
          ) : (
            <button onClick={() => generate()} disabled={!photo} className={PILL}>
              Generate the card
            </button>
          )}
        </Step>

        <Step n={3} on={step >= 3} title="Write the back" meta={`${message.length} characters`}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your message here…"
            className="h-[72px] flex-none resize-none rounded-[16px] border border-divider bg-paper px-[14px] py-[12px] text-[14px] leading-[1.6] text-neutral-900"
          />
          <div className="flex flex-none flex-col gap-2">
            {ADDRESS_LINES.map((ph, i) => (
              <input
                key={ph}
                value={addr[i] ?? ""}
                onChange={(e) => setAddrLine(i, e.target.value)}
                placeholder={ph}
                className="rounded-full border border-divider bg-paper px-4 py-[9px] text-[14px] text-neutral-900"
              />
            ))}
          </div>
          {chips}
        </Step>

        <Step n={4} on={!!results} title="Download">
          <button
            onClick={saveBoth}
            disabled={!active}
            className={`${PILL} flex items-center justify-center gap-2`}
          >
            <DownloadIcon />
            Download front + back
          </button>
          <span className="text-[12px] text-muted">
            {saved
              ? "Saved postcard-front.png and postcard-back.png"
              : "Two PNGs, 2480 × 1748 px — prints A5, folds to A6."}
          </span>
        </Step>

        <button
          onClick={reset}
          className="mt-auto flex-none cursor-pointer self-start rounded-full px-[10px] py-[4px] text-[12px] text-muted hover:bg-[rgba(32,30,29,.07)]"
        >
          Start over
        </button>

        {DEV && (
          <details className="flex-none text-[14px]">
            <summary className="w-fit cursor-pointer list-none rounded-full px-1 text-[12px] text-accent">
              Dev panel
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ModelKey)}
                className="min-h-[40px] rounded-full border border-divider bg-surface px-[14px]"
              >
                {Object.entries(MODELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={both}
                  onChange={(e) => setBoth(e.target.checked)}
                />
                Generate back too (2× cost)
              </label>
              <button
                onClick={saveRaw}
                disabled={!results}
                className="cursor-pointer rounded-full border border-divider px-4 py-2 text-[14px] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Download raw output (all styles)
              </button>
              <button
                onClick={dryRun}
                className="cursor-pointer rounded-full border border-divider px-4 py-2 font-heading text-[14px]"
              >
                Dry run (no cost)
              </button>
              {dry && (
                <pre className="max-h-60 overflow-auto rounded-md bg-surface p-3 text-xs whitespace-pre-wrap">
                  {dry}
                </pre>
              )}
            </div>
          </details>
        )}
      </div>

      <div className="flex min-h-0 flex-col items-center justify-center gap-[18px] bg-surface p-9">
        <div className="flex items-center gap-[10px]">
          {seg(false)}
          <button
            onClick={() => setFold((f) => !f)}
            aria-pressed={fold}
            className={`cursor-pointer rounded-full border px-[14px] py-[7px] text-[12px] whitespace-nowrap ${
              fold ? "border-accent bg-accent-100 text-accent-700" : "border-divider text-muted"
            }`}
          >
            Fold guide
          </button>
        </div>
        <Card
          {...card}
          className="w-full max-w-[780px]"
          perspective={1800}
          shadow="shadow-[0_18px_44px_rgba(46,43,37,.28)]"
        />
        <span className="text-[12px] whitespace-nowrap text-muted">
          {busy
            ? `${STAGES[stage]}…`
            : face === "front"
              ? "Click the card to turn it over"
              : "Message and address print as real text"}
        </span>
      </div>
    </div>
  );

  const mobile = !photo
    ? {
        title: "Start with a photo",
        hint: "One photo becomes three postcard fronts — printing starts as soon as you pick it.",
        label: "Add a photo",
        fn: () => fileInput.current?.click(),
        on: true,
      }
    : busy
      ? {
          title: "Making three cards",
          hint: `${STAGES[stage]}… about 40 seconds in all.`,
          label: `${STAGES[stage]}…`,
          fn: () => {},
          on: false,
        }
      : !results
        ? {
            title: "Stopped",
            hint: "Nothing was generated. Try again, or pick a different photo.",
            label: "Generate the card",
            fn: () => generate(),
            on: true,
          }
        : {
            title: "Pick a style, then write",
            hint: "Tap a style above, then write the message.",
            label: "Write the message",
            fn: () => {
              setFace("back");
              setSheet(true);
            },
            on: true,
          };

  const phone = (
    <div className="grid h-dvh w-full grid-rows-[auto_auto_1fr] overflow-hidden">
      <div className="flex items-baseline gap-[10px] px-4 pt-[14px] pb-[10px]">
        <span className="font-heading text-[17px]">Postcard</span>
        <span className="ml-auto text-[11px] tracking-[.06em] whitespace-nowrap text-muted uppercase">
          A5 · 300 dpi
        </span>
      </div>

      <div className="flex flex-col items-center gap-[10px] bg-surface px-4 pt-[14px] pb-4">
        <Card
          {...card}
          compact
          className="w-full"
          perspective={1400}
          shadow="shadow-[0_10px_26px_rgba(46,43,37,.26)]"
        />
        <div className="flex items-center gap-[10px]">
          {seg(true)}
          <span className="text-[11px] whitespace-nowrap text-muted">
            {busy
              ? `${STAGES[stage]}…`
              : face === "front"
                ? "Tap to turn it over"
                : "Real text, not generated"}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-5">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={`h-[6px] rounded-full transition-[width] duration-[250ms] ${
                n === step ? "w-[18px]" : "w-[6px]"
              } ${n <= step ? "bg-accent" : "bg-[#d3c7ae]"}`}
            />
          ))}
          <span className="ml-[6px] text-[12px] text-muted">Step {step} of 4</span>
        </div>

        <span className="font-heading text-[19px]">{mobile.title}</span>
        <span className="-mt-[6px] text-[13px] text-muted">{mobile.hint}</span>

        {!photo && (
          <div className="flex flex-col gap-[10px] rounded-[20px] bg-surface px-4 py-[14px]">
            {[
              "Add a photo — printing starts immediately.",
              "Three fronts come back — paper, watercolour, vintage.",
              "Write the back, download both sides to print.",
            ].map((t, i) => (
              <div key={t} className="flex items-baseline gap-[10px]">
                <span className="text-[12px] font-semibold text-accent-700">{i + 1}</span>
                <span className="text-[13px]">{t}</span>
              </div>
            ))}
          </div>
        )}

        {busy && (
          <>
            {skeletons}
            {progress}
            <button onClick={stop} className={`${GHOST} self-start`}>
              Stop
            </button>
          </>
        )}

        {styleGrid}

        {error && <p className="text-[12px] text-accent-700">{error}</p>}

        <div className="mt-auto flex flex-col gap-2 pt-3">
          <button
            onClick={mobile.fn}
            disabled={!mobile.on}
            className="cursor-pointer rounded-full bg-accent p-[14px] font-heading text-[16px] text-bg shadow-[0_6px_20px_rgba(46,43,37,.18)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
          >
            {mobile.label}
          </button>
          {results && (
            <button
              onClick={saveBoth}
              className="cursor-pointer rounded-full border border-divider p-[13px] font-heading text-[15px]"
            >
              {saved ? "Saved both PNGs" : "Download front + back"}
            </button>
          )}
        </div>
      </div>

      {/* A sheet, not a takeover: the card stays visible above it and updates as you type. */}
      {sheet && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(32,30,29,.45)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheet(false);
          }}
        >
          <div className="animate-rise flex flex-col gap-3 rounded-t-[28px] bg-paper p-[18px] pb-[22px]">
            <div className="flex items-center gap-3">
              <span className="flex-none font-heading text-[17px] whitespace-nowrap">
                Write the back
              </span>
              <button
                onClick={() => setSheet(false)}
                className="ml-auto cursor-pointer rounded-full bg-accent px-5 py-[9px] font-heading text-[14px] text-bg"
              >
                Done
              </button>
            </div>
            {/* 16px everywhere in here, or iOS zooms the viewport on focus. */}
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your message here…"
              className="h-[120px] resize-none rounded-[16px] border border-divider bg-bg px-[14px] py-3 text-[16px] leading-[1.6] text-neutral-900"
            />
            {ADDRESS_LINES.map((ph, i) => (
              <input
                key={ph}
                value={addr[i] ?? ""}
                onChange={(e) => setAddrLine(i, e.target.value)}
                placeholder={ph}
                className="min-h-[44px] rounded-full border border-divider bg-bg px-4 py-[10px] text-[16px] text-neutral-900"
              />
            ))}
            {chips}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* One picker for both layouts: the desktop drop target and the phone primary
          button both click it. Clearing the value lets the same file be re-picked. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="sr-only"
      />
      {narrow ? phone : desktop}
    </>
  );
}

// A numbered row in the flow rail. `on` drives both the badge fill and whether the step
// is reachable yet — a step you cannot act on dims out rather than disappearing, so the
// shape of the whole flow stays visible from the first screen.
function Step({
  n,
  on,
  title,
  meta,
  children,
}: {
  n: number;
  on: boolean;
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-none gap-[14px] transition-opacity duration-[250ms] ${
        on ? "" : "pointer-events-none opacity-45"
      }`}
    >
      <div
        className={`mt-[2px] grid size-[26px] flex-none place-items-center rounded-full text-[12px] font-semibold ${
          on ? "bg-accent text-bg" : "bg-surface text-[rgba(32,30,29,.6)]"
        }`}
      >
        {n}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="flex-none font-heading text-[15px] whitespace-nowrap">{title}</span>
          {meta && (
            <span className="ml-auto text-[12px] whitespace-nowrap text-muted">{meta}</span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// Both faces are `@container`s, so everything drawn on them sizes itself in cqw and
// scales with the card at any width — one component for the 780px desktop card and the
// phone one. `compact` drops the watermark and caption pill, which are noise at 358px.
function Card({
  className = "",
  perspective,
  shadow,
  compact = false,
  face,
  fold,
  busy,
  active,
  photoUrl,
  message,
  addr,
  font,
  onFlip,
}: {
  className?: string;
  perspective: number;
  shadow: string;
  compact?: boolean;
  face: "front" | "back";
  fold: boolean;
  busy: boolean;
  active: Result | null;
  photoUrl: string | null;
  message: string;
  addr: string[];
  font: FontKey;
  onFlip: () => void;
}) {
  const ink = { fontFamily: FONTS[font].css, fontSize: FONTS[font].card };
  const faceClass = `absolute inset-0 @container overflow-hidden rounded-[4px] bg-paper [backface-visibility:hidden] ${shadow}`;
  return (
    <div className={className} style={{ perspective: `${perspective}px` }}>
      <div
        onClick={onFlip}
        className="relative aspect-[2480/1748] w-full cursor-pointer transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] [transform-style:preserve-3d]"
        style={{ transform: `rotateY(${face === "back" ? 180 : 0}deg)` }}
      >
        <div className={faceClass}>
          {active ? (
            <img
              src={active.front}
              alt="Generated front artwork"
              className="absolute inset-0 size-full object-cover"
            />
          ) : photoUrl ? (
            <img
              src={photoUrl}
              alt="Your uploaded photo"
              className="absolute inset-0 size-full object-cover opacity-15"
            />
          ) : (
            // Stands in until there is a real card, watermarked so it never reads as the
            // user's own. Never exported — the canvas renderers don't see it.
            <div className="pointer-events-none absolute inset-0 select-none">
              {/* fill, not cover: the sample's art is in its corners, which cover crops. */}
              <img src="/sample-front.jpg" alt="" className="size-full object-fill opacity-[.13]" />
              {!compact && (
                <span className="absolute inset-0 grid place-items-center font-heading text-[13cqw] tracking-[.18em] text-neutral-500/40">
                  SAMPLE
                </span>
              )}
            </div>
          )}
          {busy && (
            <div className="animate-sweep absolute inset-y-0 w-[35%] bg-linear-to-r from-transparent via-paper/75 to-transparent" />
          )}
          {!compact && (
            <span className="absolute bottom-[2.4cqw] left-[2.4cqw] rounded-full bg-paper/90 px-3 py-1 text-[12px] text-neutral-800">
              {active ? "front · generated art" : photoUrl ? "front · your photo" : "front · sample"}
            </span>
          )}
          <FoldGuide on={fold} />
        </div>

        <div className={`${faceClass} grid grid-cols-2 [transform:rotateY(180deg)]`}>
          {active?.back ? (
            <img
              src={active.back}
              alt="Generated back artwork"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <img
              src="/sample-back.jpg"
              alt=""
              className="pointer-events-none absolute inset-0 size-full object-fill opacity-15"
            />
          )}
          <div
            className="relative overflow-hidden px-[7cqw] pt-[10cqw] pb-[6cqw] leading-[1.7] whitespace-pre-wrap text-neutral-900"
            style={ink}
          >
            {message}
          </div>
          <div className="relative flex flex-col gap-[3cqw] px-[7cqw] pt-[7cqw] pb-[6cqw]">
            <div className="h-[17cqw] w-[14cqw] self-end rounded-[1cqw] border-[.3cqw] border-dashed border-[rgba(32,30,29,.25)]" />
            <div className="flex flex-col gap-[4cqw] text-neutral-900" style={ink}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="min-h-[3.4cqw] overflow-hidden border-b-[max(1px,0.22cqw)] border-neutral-400 pb-[.6cqw] whitespace-nowrap"
                >
                  {addr[i] ?? ""}
                </div>
              ))}
            </div>
          </div>
          <FoldGuide on={fold} />
        </div>
      </div>
    </div>
  );
}

// Preview only — a CSS overlay, never part of the exported PNG.
function FoldGuide({ on }: { on: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 left-1/2 w-0 border-l-[max(1px,0.24cqw)] border-dashed border-fold transition-opacity duration-200 ${
        on ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

function ArrowUp() {
  return (
    <svg
      width="18"
      height="18"
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
// Returns the longest edge too — step 1 shows what was actually sent.
async function shrink(file: File, max = 1600): Promise<{ blob: Blob; px: number }> {
  const bmp = await createImageBitmap(file);
  const longest = Math.max(bmp.width, bmp.height);
  const scale = Math.min(1, max / longest);
  const px = Math.round(longest * scale);
  if (scale === 1 && file.size < 1_000_000) return { blob: file, px };
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r({ blob: b!, px }), "image/jpeg", 0.9));
}
