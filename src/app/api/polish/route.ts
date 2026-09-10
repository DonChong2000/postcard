import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const MAX_CHARS = 1000;

// The card has room for a short note, so the rewrite has to stay short. Plain text only:
// whatever comes back is dropped straight into the textarea.
const SYSTEM =
  "You rewrite a short handwritten postcard message. Keep the writer's voice, facts and " +
  "language; fix grammar and awkward phrasing; make it warmer and more vivid. Stay within " +
  "the original length, roughly. Reply with the rewritten message only — no quotes, no " +
  "preamble, no options, no markdown.";

// ponytail: no rate limit here — one text call is a rounding error next to an image, and
// /api/generate already guards the expensive path. Add one if this gets abused.
export async function POST(request: Request) {
  const { message } = await request.json();
  if (typeof message !== "string" || !message.trim()) return bad("nothing to improve");
  if (message.length > MAX_CHARS) return bad(`message is longer than ${MAX_CHARS} characters`);
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return bad("GOOGLE_GENERATIVE_AI_API_KEY is not set", 500);
  }

  try {
    const { text } = await generateText({
      model: google("gemini-flash-lite-latest"),
      system: SYSTEM,
      prompt: message,
    });
    const out = text.trim();
    if (!out) return bad("the model returned nothing", 502);
    return Response.json({ message: out });
  } catch (e) {
    console.error("polish failed", e);
    return bad(e instanceof Error ? e.message : "polish failed", 502);
  }
}

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}
