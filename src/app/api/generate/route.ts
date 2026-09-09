import { generateText } from "ai";
import OpenAI from "openai";
import {
  buildPrompt,
  isKey,
  MODELS,
  SIZES,
  STYLES,
  type ModelKey,
} from "@/lib/postcard";

export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;
const RATE_LIMIT = 10; // generations
const RATE_WINDOW = 60 * 60 * 1000; // per hour, per IP

// ponytail: in-memory rate limit — resets on container restart and is per-instance.
// Only reason it exists is that every click spends real money. Swap for a shared store
// if this ever runs on more than one instance.
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW);
  hits.set(ip, recent);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  return false;
}

// Browsers set Content-Type from the file extension, so a .txt renamed to .jpg arrives
// claiming to be an image. Check the actual bytes.
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

async function generate(
  model: ModelKey,
  prompt: string,
  photo: Uint8Array,
  mediaType: string,
): Promise<string> {
  const m = MODELS[model];

  if (m.provider === "google") {
    // Observed in testing: with TEXT in responseModalities the model sometimes replies
    // "I have created a postcard back..." and no image at all. Asking for IMAGE only
    // removes that option; the retry covers the rest.
    let text = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await generateText({
        model: m.id,
        providerOptions: {
          google: {
            responseModalities: ["IMAGE"],
            // No model offers A6's 1.41:1, so take the nearest and crop on export.
            imageConfig: { aspectRatio: "4:3", imageSize: "2K" },
          },
        },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "file", mediaType, data: photo },
            ],
          },
        ],
      });
      const file = r.files.find((f) => f.mediaType?.startsWith("image/"));
      if (file) {
        const b64 = Buffer.from(file.uint8Array).toString("base64");
        return `data:${file.mediaType};base64,${b64}`;
      }
      text = r.text;
    }
    throw new Error(`${m.id} returned no image (said: ${text.slice(0, 200)})`);
  }

  // generateImage() in the AI SDK cannot take an input image (vercel/ai#14044), so the
  // OpenAI models go through the gateway's OpenAI-compatible /v1/images/edits.
  const client = new OpenAI({
    apiKey: process.env.AI_GATEWAY_API_KEY,
    baseURL: "https://ai-gateway.vercel.sh/v1",
  });
  const r = await client.images.edit({
    model: m.id,
    image: await OpenAI.toFile(Buffer.from(photo), "photo", { type: mediaType }),
    prompt,
    size: "1536x1024",
  });
  const b64 = r.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${m.id} returned no image data`);
  return `data:image/png;base64,${b64}`;
}

export async function POST(request: Request) {
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  const form = await request.formData();
  const style = form.get("style");
  const size = form.get("size");
  const model = form.get("model");

  if (!isKey(STYLES, style)) return bad(`unknown style: ${style}`);
  if (!isKey(SIZES, size)) return bad(`unknown size: ${size}`);
  if (!isKey(MODELS, model)) return bad(`unknown model: ${model}`);

  const prompts = {
    front: buildPrompt(style, size, "front"),
    back: buildPrompt(style, size, "back"),
  };

  if (dryRun) {
    return Response.json({
      dryRun: true,
      model: MODELS[model].id,
      export: SIZES[size].px,
      prompts,
    });
  }

  const photo = form.get("photo");
  if (!(photo instanceof File)) return bad("no photo uploaded");
  if (photo.size > MAX_BYTES) return bad("photo is larger than 10MB", 413);

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const mediaType = sniff(bytes);
  if (!mediaType) return bad("that file is not a PNG, JPEG or WebP image");

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (rateLimited(ip)) return bad(`more than ${RATE_LIMIT} postcards in an hour`, 429);

  if (!process.env.AI_GATEWAY_API_KEY) return bad("AI_GATEWAY_API_KEY is not set", 500);

  try {
    const [front, back] = await Promise.all([
      generate(model, prompts.front, bytes, mediaType),
      generate(model, prompts.back, bytes, mediaType),
    ]);
    return Response.json({ front, back });
  } catch (e) {
    console.error("generation failed", e);
    return bad(e instanceof Error ? e.message : "generation failed", 502);
  }
}

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}
