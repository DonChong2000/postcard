import { AwsClient } from "aws4fetch";

const MAX_BYTES = 20 * 1024 * 1024; // an A5 300dpi PNG runs a few MB; this is slack, not a target
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const KEY = /^[0-9a-f]{32}\.png$/;

// POST stores the finished card, GET serves it back. They live in one file because they
// share the R2 client and the key format — splitting them just duplicates both.
//
// ponytail: GET proxies the bytes through this server instead of exposing the bucket. Costs
// a few MB of egress per order and buys three things: the bucket stays private (these are
// customers' own photos), no DNS setup, and the URL sits on the domain the app already has.
// To move delivery onto a custom domain later: `wrangler r2 bucket domain add`, then return
// that base here instead — no other code changes.
function r2() {
  const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  return {
    client: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    }),
    base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
  };
}

export async function POST(request: Request) {
  const r = r2();
  if (!r) return bad("R2 is not configured", 500);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return bad("no image");
  if (bytes.length > MAX_BYTES) return bad(`image is larger than ${MAX_BYTES} bytes`);
  // Sniff the magic bytes, not the Content-Type header — same guard as /api/generate.
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) return bad("not a png");

  // Random key, never sequential: this URL is the only thing protecting the photo.
  const key = `${crypto.randomUUID().replaceAll("-", "")}.png`;
  const res = await r.client.fetch(`${r.base}/${key}`, {
    method: "PUT",
    body: bytes,
    // R2 rejects a chunked PUT (411 MissingContentLength), so set the length explicitly.
    headers: { "content-type": "image/png", "content-length": String(bytes.length) },
  });
  if (!res.ok) {
    console.error("r2 put failed", res.status, await res.text());
    return bad("could not store the image", 502);
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  return Response.json({ url: `${origin}/api/o/${key}` });
}

export async function GET(request: Request, ctx: RouteContext<"/api/o/[[...key]]">) {
  const r = r2();
  if (!r) return bad("R2 is not configured", 500);

  const { key } = await ctx.params;
  const name = key?.[0];
  // Reject anything that isn't a key we minted, so this can't be walked into a bucket lister.
  if (!name || key.length !== 1 || !KEY.test(name)) return bad("not found", 404);

  const res = await r.client.fetch(`${r.base}/${name}`);
  if (!res.ok) return bad("not found", 404);
  return new Response(res.body, {
    headers: {
      "content-type": "image/png",
      // Keys are random and content never changes under one, so this is safe to pin.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}
