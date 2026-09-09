"use client";

import { useEffect, useRef, useState } from "react";
import { download, renderBack, renderFront } from "@/lib/canvas";
import {
  MODELS,
  SIZES,
  STYLES,
  type ModelKey,
  type SizeKey,
  type StyleKey,
} from "@/lib/postcard";

type Result = { front: string; back: string };

export default function Home() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [style, setStyle] = useState<StyleKey>("vintage");
  const [size, setSize] = useState<SizeKey>("standard");
  const [model, setModel] = useState<ModelKey>("gemini-3.1-flash-image");
  const [message, setMessage] = useState("");
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dry, setDry] = useState("");

  const frontBox = useRef<HTMLDivElement>(null);
  const backBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!result) return;
    let alive = true;
    renderFront(result.front, size).then((c) => show(alive, frontBox.current, c));
    return () => {
      alive = false;
    };
  }, [result, size]);

  useEffect(() => {
    if (!result) return;
    let alive = true;
    renderBack(result.back, size, { message, address }, true).then((c) =>
      show(alive, backBox.current, c),
    );
    return () => {
      alive = false;
    };
  }, [result, size, message, address]);

  function fields(): FormData {
    const f = new FormData();
    f.set("style", style);
    f.set("size", size);
    f.set("model", model);
    return f;
  }

  async function generate() {
    if (!photo) return setError("Pick a photo first.");
    setBusy(true);
    setError("");
    setResult(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function dryRun() {
    const res = await fetch("/api/generate?dryRun=1", { method: "POST", body: fields() });
    setDry(JSON.stringify(await res.json(), null, 2));
  }

  async function save(side: "front" | "back") {
    if (!result) return;
    const c =
      side === "front"
        ? await renderFront(result.front, size)
        : await renderBack(result.back, size, { message, address }, false);
    download(c, `postcard-${size}-${side}.png`);
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Postcard</h1>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Photo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Style
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as StyleKey)}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {Object.entries(STYLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Size
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as SizeKey)}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {Object.entries(SIZES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={generate}
            disabled={busy}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {busy && (
          <p className="text-sm text-zinc-500">
            Two images per postcard, about 30–60 seconds.
          </p>
        )}

        {result && (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <figure className="flex flex-col gap-2">
                <div ref={frontBox} className="[&>canvas]:h-auto [&>canvas]:w-full" />
                <button
                  onClick={() => save("front")}
                  className="self-start rounded border border-zinc-400 px-3 py-1 text-sm"
                >
                  Download front
                </button>
              </figure>
              <figure className="flex flex-col gap-2">
                <div ref={backBox} className="[&>canvas]:h-auto [&>canvas]:w-full" />
                <button
                  onClick={() => save("back")}
                  className="self-start rounded border border-zinc-400 px-3 py-1 text-sm"
                >
                  Download back
                </button>
              </figure>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                Message
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="rounded border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Address (one line each)
                <textarea
                  rows={4}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="rounded border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            </div>

            {SIZES[size].fold && (
              <p className="text-sm text-zinc-500">
                The red dashed line is the fold — it is a guide only and is not in the
                downloaded file.
              </p>
            )}
          </>
        )}

        <details className="mt-4 rounded border border-zinc-300 p-3 text-sm dark:border-zinc-700">
          <summary className="cursor-pointer">Dev panel</summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              Model
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ModelKey)}
                className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {Object.entries(MODELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={dryRun} className="rounded border border-zinc-400 px-3 py-1">
              Dry run (no cost)
            </button>
          </div>
          {dry && (
            <pre className="mt-3 max-h-80 overflow-auto rounded bg-zinc-100 p-3 text-xs whitespace-pre-wrap dark:bg-zinc-900">
              {dry}
            </pre>
          )}
        </details>
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
        A project by{" "}
        <a href="https://donchong.top" className="font-medium underline underline-offset-4">
          Don Chong
        </a>
      </footer>
    </div>
  );
}

function show(alive: boolean, box: HTMLDivElement | null, canvas: HTMLCanvasElement) {
  if (alive && box) box.replaceChildren(canvas);
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
