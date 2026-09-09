// Browser-only. Composes the print-ready PNGs: the generated art is cropped to the A6
// ratio, and the back gets its divider / stamp box / message drawn on top in real text
// (image models cannot render legible lettering, so nothing that must be read is
// generated).
import { SIZES, type SizeKey } from "./postcard";

// `font` is a CSS font-family list; the page passes the handwriting face the user
// picked so the download matches what they see written on the card.
export type BackFields = { message: string; address: string; font: string };

const INK = "#22303c";

async function load(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function sheet(size: SizeKey): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const { w, h } = SIZES[size].px;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, w, h);
  return [c, ctx];
}

// Fill the sheet with the image, cropping the overflow — the models only offer 4:3 or
// 3:2 and A6 is 1.41:1, so something always has to go.
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderFront(src: string, size: SizeKey): Promise<HTMLCanvasElement> {
  const [c, ctx] = sheet(size);
  cover(ctx, await load(src), c.width, c.height);
  return c;
}

export async function renderBack(
  src: string,
  size: SizeKey,
  fields: BackFields,
  guides = false,
): Promise<HTMLCanvasElement> {
  const [c, ctx] = sheet(size);
  const { width: w, height: h } = c;
  cover(ctx, await load(src), w, h);
  // The handwriting faces are webfonts; canvas silently falls back if they are not in
  // yet. They are already painted on the card preview, so this resolves immediately.
  await document.fonts.ready;

  const pad = Math.round(w * 0.05);
  const mid = w / 2;
  const fold = SIZES[size].fold;
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;

  // A folded card gets no printed divider — the fold itself is the divider.
  if (!fold) {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mid, pad);
    ctx.lineTo(mid, h - pad);
    ctx.stroke();
  }

  // Stamp box, top right. On a folded card the stamp goes on the outside, not here.
  let addressTop = pad + Math.round(h * 0.1);
  if (!fold) {
    const bw = Math.round(w * 0.11);
    const bh = Math.round(bw * 1.2);
    ctx.save();
    ctx.setLineDash([12, 10]);
    ctx.lineWidth = 3;
    ctx.strokeRect(w - pad - bw, pad, bw, bh);
    ctx.restore();
    addressTop = pad + bh + Math.round(h * 0.06);
  }

  // Address lines, right half.
  const addrLeft = mid + pad;
  const addrRight = w - pad;
  const gap = Math.round(h * 0.09);
  const addrLines = fields.address.split("\n");
  ctx.font = `${Math.round(h * 0.035)}px ${fields.font}`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const y = addressTop + i * gap;
    if (addrLines[i]) ctx.fillText(addrLines[i], addrLeft + 8, y - 12);
    ctx.beginPath();
    ctx.moveTo(addrLeft, y);
    ctx.lineTo(addrRight, y);
    ctx.stroke();
  }

  // Message, left half.
  const msgSize = Math.round(h * 0.042);
  ctx.font = `${msgSize}px ${fields.font}`;
  const msgWidth = mid - pad * 2;
  let y = pad + msgSize;
  for (const line of wrap(ctx, fields.message, msgWidth)) {
    if (y > h - pad) break;
    ctx.fillText(line, pad, y);
    y += msgSize * 1.45;
  }

  // Preview-only fold guide. Never in the exported file.
  if (guides && fold) {
    ctx.save();
    ctx.setLineDash([20, 16]);
    ctx.strokeStyle = "#c0392b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, h);
    ctx.stroke();
    ctx.restore();
  }

  return c;
}

export function download(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
