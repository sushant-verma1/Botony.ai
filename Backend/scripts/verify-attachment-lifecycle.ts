/**
 * End-to-end production-readiness check for the attachment pipeline.
 *
 * Runs the real Express app, the real Prisma client against a real Postgres,
 * and a real ClamAV daemon. Only Cloudinary is stood in for by a local HTTP
 * server (see the caveats printed at the end): every other component is the
 * one that runs in production.
 *
 *   DATABASE_URL=... CLAMAV_HOST=127.0.0.1 CLAMAV_PORT=3310 \
 *   FIXTURE_DIR=... npm run verify:lifecycle
 *
 * Exits non-zero on the first failed assertion.
 */
import "dotenv/config";
import http from "node:http";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { AddressInfo } from "node:net";

const FIXTURE_DIR = process.env.FIXTURE_DIR;
if (!FIXTURE_DIR) {
  console.error("FIXTURE_DIR is required (see scripts/make-fixtures.py).");
  process.exit(1);
}
if (!process.env.DATABASE_URL || /prod/i.test(process.env.DATABASE_URL)) {
  console.error("DATABASE_URL must be set and must not look like production.");
  process.exit(1);
}

// The Cloudinary SDK decides between the http and https modules once, at
// module load, from config().upload_prefix -- so the prefix has to be in place
// before anything requires it. CLOUDINARY_URL query params are the only hook
// that runs that early, which is also why the stand-in uses a fixed port.
const CLOUD_PORT = 39080;
process.env.CLOUDINARY_URL =
  `cloudinary://${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}` +
  `@${process.env.CLOUDINARY_CLOUD_NAME}` +
  `?upload_prefix=${encodeURIComponent(`http://127.0.0.1:${CLOUD_PORT}`)}`;

// ---------------------------------------------------------------- reporting
let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

// -------------------------------------------------------- fake Cloudinary
interface StoredAsset {
  buf: Buffer;
  resourceType: string;
  format: string;
  width?: number;
  height?: number;
}

const storage = new Map<string, StoredAsset>();
const destroyed: string[] = [];

/** Re-saves an image with no metadata, the way Cloudinary does on a derivative. */
function stripMetadata(buf: Buffer, format: string): Buffer {
  const b64 = execFileSync(
    "python",
    [
      "-c",
      [
        "import sys,base64,io",
        "from PIL import Image",
        "d=base64.b64decode(sys.stdin.read())",
        "im=Image.open(io.BytesIO(d))",
        "clean=Image.new(im.mode, im.size)",
        "clean.putdata(list(im.getdata()))",
        "o=io.BytesIO()",
        `clean.save(o, ${format === "png" ? "'PNG'" : "'JPEG'"})`,
        "sys.stdout.write(base64.b64encode(o.getvalue()).decode())",
      ].join("\n"),
    ],
    { input: buf.toString("base64"), maxBuffer: 256 * 1024 * 1024 },
  );
  return Buffer.from(b64.toString(), "base64");
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });
}

function findByUrl(url: string): string | undefined {
  for (const key of storage.keys()) {
    const uuid = key.split("/").pop();
    if (uuid && url.includes(uuid)) return key;
  }
  return undefined;
}

const cloudinaryServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  // GET /v1_1/<cloud>/resources/<resource_type>/<type>/<public_id>
  const resource = url.pathname.match(
    /^\/v1_1\/[^/]+\/resources\/([^/]+)\/([^/]+)\/(.+)$/,
  );
  if (req.method === "GET" && resource) {
    const asset = storage.get(decodeURIComponent(resource[3]));
    if (!asset) return json(404, { error: { message: "Resource not found" } });
    return json(200, {
      public_id: resource[3],
      resource_type: asset.resourceType,
      type: resource[2],
      format: asset.format,
      bytes: asset.buf.length,
      ...(asset.width ? { width: asset.width, height: asset.height } : {}),
    });
  }

  // GET /v1_1/<cloud>/<resource_type>/download?...
  if (req.method === "GET" && /\/download$/.test(url.pathname)) {
    const publicId = url.searchParams.get("public_id") ?? "";
    const asset = storage.get(publicId);
    if (!asset) return json(404, { error: { message: "Not found" } });

    const range = req.headers.range;
    let body = asset.buf;
    let code = 200;
    if (range) {
      const suffix = range.match(/^bytes=-(\d+)$/);
      const window = range.match(/^bytes=(\d+)-(\d+)$/);
      if (suffix) body = asset.buf.subarray(-Number(suffix[1]));
      else if (window)
        body = asset.buf.subarray(Number(window[1]), Number(window[2]) + 1);
      code = 206;
    }
    res.writeHead(code, { "content-length": String(body.length) });
    return res.end(body);
  }

  const body = await readBody(req);
  const field = (name: string) =>
    body.match(new RegExp(`${name}=([^&]+)`))?.[1] ??
    body.match(new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]+)`))?.[1];

  // POST /v1_1/<cloud>/<resource_type>/destroy
  if (req.method === "POST" && /\/destroy$/.test(url.pathname)) {
    const publicId = decodeURIComponent(field("public_id") ?? "");
    destroyed.push(publicId);
    const existed = storage.delete(publicId);
    return json(200, { result: existed ? "ok" : "not found" });
  }

  // POST /v1_1/<cloud>/<resource_type>/upload — the sanitize round trip:
  // Cloudinary fetches the derivative URL we hand it and overwrites the
  // original. The derivative is what carries the metadata stripping.
  if (req.method === "POST" && /\/upload$/.test(url.pathname)) {
    const publicId = decodeURIComponent(field("public_id") ?? "");
    const sourceUrl = decodeURIComponent(field("file") ?? "");
    const source = storage.get(findByUrl(sourceUrl) ?? "");
    if (!source) return json(400, { error: { message: "Source not found" } });

    const stripped = stripMetadata(source.buf, source.format);
    const dims = imageDimensions(stripped);
    storage.set(publicId, { ...source, buf: stripped, ...dims });
    return json(200, {
      public_id: publicId,
      format: source.format,
      bytes: stripped.length,
      ...dims,
      resource_type: "image",
      type: "authenticated",
    });
  }

  json(404, { error: { message: `unhandled ${req.method} ${url.pathname}` } });
});

function imageDimensions(buf: Buffer): { width: number; height: number } {
  const out = execFileSync(
    "python",
    [
      "-c",
      [
        "import sys,base64,io",
        "from PIL import Image",
        "im=Image.open(io.BytesIO(base64.b64decode(sys.stdin.read())))",
        "print(im.width, im.height)",
      ].join("\n"),
    ],
    { input: buf.toString("base64"), maxBuffer: 256 * 1024 * 1024 },
  );
  const [w, h] = out.toString().trim().split(" ").map(Number);
  return { width: w, height: h };
}

function hasExif(buf: Buffer): boolean {
  const out = execFileSync(
    "python",
    [
      "-c",
      [
        "import sys,base64,io",
        "from PIL import Image",
        "im=Image.open(io.BytesIO(base64.b64decode(sys.stdin.read())))",
        "e=im.getexif()",
        "print(len(dict(e)) > 0)",
      ].join("\n"),
    ],
    { input: buf.toString("base64"), maxBuffer: 256 * 1024 * 1024 },
  );
  return out.toString().trim() === "True";
}

/**
 * The EICAR test string, assembled at runtime. Written to disk it would be
 * quarantined by the host antivirus before this script could read it back --
 * and a fixture that silently disappears turns a scanner check into a pass.
 */
function eicarBytes(): Buffer {
  return Buffer.concat([
    Buffer.from("X5O!P%@AP[4"),
    Buffer.from([0x5c]),
    Buffer.from("PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"),
  ]);
}

/**
 * A structurally valid PDF whose content stream carries the EICAR string: it
 * satisfies every format check we make (magic bytes, %PDF- header, %%EOF
 * trailer), so only a real scanner can reject it.
 */
function eicarPdfBytes(): Buffer {
  const eicar = eicarBytes();
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    [
      `<< /Length ${eicar.length} >>`,
      "stream",
      eicar.toString("latin1"),
      "endstream",
    ].join("\n"),
  ];

  const lines: string[] = ["%PDF-1.4"];
  const offsets: number[] = [];
  // +1 per line for the newline join() will add back.
  const size = () => lines.reduce((n, l) => n + l.length + 1, 0);

  for (const [i, obj] of objs.entries()) {
    offsets.push(size());
    lines.push(`${i + 1} 0 obj`, obj, "endobj");
  }

  const xref = size();
  lines.push(`xref`, `0 ${objs.length + 1}`, "0000000000 65535 f ");
  for (const offset of offsets) {
    lines.push(`${String(offset).padStart(10, "0")} 00000 n `);
  }
  lines.push(
    "trailer",
    `<< /Size ${objs.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xref),
    "%%EOF",
    "",
  );

  return Buffer.from(lines.join("\n"), "latin1");
}

// ------------------------------------------------------------------- main
async function main() {
  await new Promise<void>((r) => cloudinaryServer.listen(CLOUD_PORT, "127.0.0.1", r));

  const { cloudinary } = await import("../src/config/cloudinary.js");
  if (!/^http:/.test(cloudinary.config().upload_prefix as string)) {
    throw new Error("upload_prefix did not reach the SDK; the stand-in is unused");
  }

  const { default: app } = await import("../src/app.js");
  const { prisma } = await import("../src/config/db.js");
  const service = await import("../src/services/attachment.service.js");
  const { scanAttachment } = await import("../src/services/malware.service.js");

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const manifest = JSON.parse(
    readFileSync(join(FIXTURE_DIR!, "manifest.json"), "utf8"),
  ) as Record<
    string,
    { bytes: number; decodable: boolean; width?: number; height?: number; format?: string }
  >;

  // ---------------------------------------------------------------- users
  await prisma.attachment.deleteMany({ where: {} });
  await prisma.message.deleteMany({ where: {} });
  await prisma.conversation.deleteMany({ where: {} });
  await prisma.user.deleteMany({ where: { email: { contains: "@lifecycle-verify.example.com" } } });

  async function api(
    path: string,
    init: RequestInit & { token?: string } = {},
  ): Promise<{ status: number; body: any }> {
    const { token, ...rest } = init;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetch(`${base}${path}`, {
        ...rest,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(rest.headers ?? {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429 && attempt === 0) {
        console.log("    (rate limited; waiting 61s)");
        await new Promise((r) => setTimeout(r, 61_000));
        continue;
      }
      return { status: res.status, body };
    }
    throw new Error("unreachable");
  }

  async function makeUser(tag: string): Promise<string> {
    const res = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${tag}@lifecycle-verify.example.com`,
        password: "Str0ngPassw0rd",
        firstName: "Test",
        lastName: "User",
        age: 30,
      }),
    });
    if (!res.body.accessToken) {
      throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.accessToken as string;
  }

  const alice = await makeUser("alice");
  const bob = await makeUser("bob");

  /** Signature → simulated browser→Cloudinary upload → confirm. */
  async function lifecycle(
    fixture: string,
    mimeType: string,
    kind: "IMAGE" | "DOCUMENT",
    token = alice,
    opts: { declareBytes?: number; forceDecodable?: boolean; bytes?: Buffer } = {},
  ) {
    const buf = opts.bytes ?? readFileSync(join(FIXTURE_DIR!, fixture));
    const meta = manifest[fixture] ?? { bytes: buf.length, decodable: false };

    const sig = await api("/api/attachments/signature", {
      method: "POST",
      token,
      body: JSON.stringify({
        kind,
        mimeType,
        sizeBytes: opts.declareBytes ?? buf.length,
      }),
    });
    if (sig.status !== 200) return { sig, confirm: null as any, buf };

    // Step 2 of the architecture: the browser uploads straight to Cloudinary.
    // The backend never sees these bytes, so the harness writes them directly.
    const decodable = opts.forceDecodable ?? meta.decodable;
    storage.set(sig.body.publicId, {
      buf,
      resourceType: kind === "IMAGE" ? "image" : "raw",
      format: kind === "IMAGE" ? (meta.format ?? "jpg") : "pdf",
      ...(decodable && meta.width
        ? { width: meta.width, height: meta.height }
        : opts.forceDecodable
          ? { width: 800, height: 600 }
          : {}),
    });

    const confirm = await api(`/api/attachments/${sig.body.attachmentId}/confirm`, {
      method: "POST",
      token,
    });
    return { sig, confirm, buf };
  }

  // ============================================================ item 4 + 6
  section("Item 4/6 — upload lifecycle and file content validation");

  const jpg = await lifecycle("clean.jpg", "image/jpeg", "IMAGE");
  check("clean JPEG reaches READY", jpg.confirm?.body?.status === "READY",
    `status=${jpg.confirm?.status} body=${JSON.stringify(jpg.confirm?.body)}`);

  const png = await lifecycle("clean.png", "image/png", "IMAGE");
  check("clean PNG reaches READY", png.confirm?.body?.status === "READY",
    `status=${png.confirm?.status}`);

  const pdf = await lifecycle("clean.pdf", "application/pdf", "DOCUMENT");
  check("clean PDF reaches READY", pdf.confirm?.body?.status === "READY",
    `status=${pdf.confirm?.status}`);

  const oversized = await lifecycle("oversized.jpg", "image/jpeg", "IMAGE");
  check("oversized image rejected at signature time, before any upload",
    oversized.sig.status === 400,
    `status=${oversized.sig.status} (${(manifest["oversized.jpg"].bytes / 1048576).toFixed(1)}MB)`);

  const malformedImg = await lifecycle("malformed.jpg", "image/jpeg", "IMAGE");
  check("malformed image rejected (no decodable dimensions)",
    malformedImg.confirm?.status === 422, `status=${malformedImg.confirm?.status}`);

  // forceDecodable models a lenient/compromised Cloudinary reporting plausible
  // metadata, which isolates our own magic-byte check as the catching layer.
  const exe = await lifecycle("renamed-exe.jpg", "image/jpeg", "IMAGE", alice, {
    forceDecodable: true,
  });
  check("renamed executable rejected by our own magic-byte check",
    exe.confirm?.status === 422, `status=${exe.confirm?.status}`);

  const malformedPdf = await lifecycle("malformed.pdf", "application/pdf", "DOCUMENT");
  check("malformed PDF rejected (no %%EOF trailer)",
    malformedPdf.confirm?.status === 422, `status=${malformedPdf.confirm?.status}`);

  const eicarPdf = await lifecycle("eicar.pdf", "application/pdf", "DOCUMENT", alice, {
    bytes: eicarPdfBytes(),
  });
  check("structurally valid PDF carrying EICAR rejected by ClamAV",
    eicarPdf.confirm?.status === 422, `status=${eicarPdf.confirm?.status}`);

  const eicarRow = await prisma.attachment.findFirst({
    where: { publicId: eicarPdf.sig.body.publicId },
  });
  check("EICAR attachment row left REJECTED", eicarRow?.status === "REJECTED",
    `status=${eicarRow?.status}`);
  check("EICAR asset destroyed in storage",
    destroyed.includes(eicarPdf.sig.body.publicId));
  check("scanner name recorded on a clean attachment",
    (await prisma.attachment.findFirst({ where: { publicId: jpg.sig.body.publicId } }))
      ?.scanner === "clamav");

  // Direct scanner checks against the real daemon.
  section("Item 6 — ClamAV directly");
  const scanBytes = new Map<string, Buffer>([
    ["clean.jpg", readFileSync(join(FIXTURE_DIR!, "clean.jpg"))],
    ["clean.png", readFileSync(join(FIXTURE_DIR!, "clean.png"))],
    ["clean.pdf", readFileSync(join(FIXTURE_DIR!, "clean.pdf"))],
    ["malformed.jpg", readFileSync(join(FIXTURE_DIR!, "malformed.jpg"))],
    ["malformed.pdf", readFileSync(join(FIXTURE_DIR!, "malformed.pdf"))],
    ["renamed-exe.jpg", readFileSync(join(FIXTURE_DIR!, "renamed-exe.jpg"))],
    ["eicar.com", eicarBytes()],
    ["eicar.pdf", eicarPdfBytes()],
  ]);
  const scanServer = createServer((req, res) => {
    const name = new URL(req.url ?? "/", "http://x").searchParams.get("f")!;
    res.end(scanBytes.get(name));
  });
  await new Promise<void>((r) => scanServer.listen(0, "127.0.0.1", r));
  const scanBase = `http://127.0.0.1:${(scanServer.address() as AddressInfo).port}`;

  for (const [name, expectClean] of [
    ["clean.jpg", true],
    ["clean.png", true],
    ["clean.pdf", true],
    ["malformed.jpg", true],
    ["malformed.pdf", true],
    ["renamed-exe.jpg", true],
    ["eicar.com", false],
    ["eicar.pdf", false],
  ] as const) {
    const result = await scanAttachment({
      publicId: `scan/${name}`,
      downloadUrl: `${scanBase}/?f=${name}`,
      sizeBytes: scanBytes.get(name)!.length,
    });
    check(`ClamAV: ${name} → ${result.clean ? "clean" : "infected"}`,
      result.clean === expectClean,
      `scanner=${result.scanner}${result.reason ? ` reason=${result.reason}` : ""}`);
  }
  scanServer.close();

  // ================================================================ item 7
  section("Item 7 — EXIF removal from the stored/delivered image");
  const original = readFileSync(join(FIXTURE_DIR!, "clean.jpg"));
  check("source fixture genuinely carries EXIF/GPS", hasExif(original));

  const storedJpg = storage.get(jpg.sig.body.publicId);
  check("stored image has no EXIF after confirm",
    storedJpg ? !hasExif(storedJpg.buf) : false);

  const delivery = await api(`/api/attachments/${jpg.sig.body.attachmentId}`, {
    token: alice,
  });
  const deliveredUrl = new URL(delivery.body.url);
  const deliveredBytes = Buffer.from(
    await (await fetch(delivery.body.url)).arrayBuffer(),
  );
  check("delivered image has no EXIF", !hasExif(deliveredBytes));
  check("delivery URL is time-limited",
    deliveredUrl.searchParams.has("expires_at"),
    deliveredUrl.searchParams.get("expires_at") ?? "");

  const sanitizeUrl = cloudinary.url(jpg.sig.body.publicId, {
    resource_type: "image",
    type: "authenticated",
    sign_url: true,
    secure: true,
    format: "jpg",
    transformation: [{ width: 2048, height: 2048, crop: "limit", quality: "auto" }],
  });
  check("sanitize derivative requests no metadata-preserving flag",
    !/keep_iptc|fl_keep|image_metadata/.test(sanitizeUrl));

  // ================================================================ item 5
  section("Item 5 — PENDING attachments are unusable through every path");

  const pendingSig = await api("/api/attachments/signature", {
    method: "POST",
    token: alice,
    body: JSON.stringify({ kind: "IMAGE", mimeType: "image/jpeg", sizeBytes: 1000 }),
  });
  const pendingId = pendingSig.body.attachmentId as string;
  const pendingRow = await prisma.attachment.findUnique({ where: { id: pendingId } });
  check("a fresh signature creates a PENDING row", pendingRow?.status === "PENDING");

  const read = await api(`/api/attachments/${pendingId}`, { token: alice });
  check("GET /api/attachments/:id refuses a PENDING attachment (404, no oracle)",
    read.status === 404, `status=${read.status}`);

  const convo = await api("/api/chat/newchat", {
    method: "POST",
    token: alice,
    body: JSON.stringify({ title: "lifecycle" }),
  });
  const chatId = convo.body.conversation?.id ?? convo.body.id ?? convo.body.conversationId;

  const withPending = await api(`/api/chat/${chatId}/message`, {
    method: "POST",
    token: alice,
    body: JSON.stringify({ content: "please look at this", attachmentIds: [pendingId] }),
  });
  check("POST message refuses a PENDING attachment", withPending.status === 400,
    `status=${withPending.status}`);
  check("no message row was written for the refused request",
    (await prisma.message.count({ where: { conversationId: chatId } })) === 0);
  check("PENDING attachment was not bound to any message",
    (await prisma.attachment.findUnique({ where: { id: pendingId } }))?.messageId === null);

  const pendingEntity = (await prisma.attachment.findUnique({
    where: { id: pendingId },
  }))!;
  let aiThrew = false;
  try {
    service.getAiImageUrl(pendingEntity);
  } catch {
    aiThrew = true;
  }
  check("getAiImageUrl refuses a PENDING attachment", aiThrew);

  let pdfThrew = false;
  try {
    await service.extractPdfText(pendingEntity);
  } catch {
    pdfThrew = true;
  }
  check("extractPdfText refuses a PENDING attachment", pdfThrew);

  let bindThrew = false;
  try {
    const msg = await prisma.message.create({
      data: { content: "x", role: "user", conversationId: chatId, userId: pendingEntity.userId },
    });
    await service.bindAttachmentsToMessage([pendingId], msg.id);
  } catch {
    bindThrew = true;
  }
  check("bindAttachmentsToMessage refuses a PENDING attachment", bindThrew);
  await prisma.message.deleteMany({ where: { conversationId: chatId } });

  const rejectedRow = await prisma.attachment.findFirst({ where: { status: "REJECTED" } });
  const rejectedRead = await api(`/api/attachments/${rejectedRow!.id}`, { token: alice });
  check("GET refuses a REJECTED attachment too", rejectedRead.status === 404,
    `status=${rejectedRead.status}`);

  section("Item 5 — cross-user access");
  const bobRead = await api(`/api/attachments/${jpg.sig.body.attachmentId}`, { token: bob });
  check("another user cannot read a READY attachment (404)", bobRead.status === 404,
    `status=${bobRead.status}`);
  const bobDelete = await api(`/api/attachments/${jpg.sig.body.attachmentId}`, {
    method: "DELETE",
    token: bob,
  });
  check("another user cannot delete it", bobDelete.status === 404,
    `status=${bobDelete.status}`);
  const anon = await api(`/api/attachments/${jpg.sig.body.attachmentId}`);
  check("unauthenticated read is refused", anon.status === 401,
    `status=${anon.status}`);
  check("the attachment still exists after those attempts",
    (await prisma.attachment.findUnique({
      where: { id: jpg.sig.body.attachmentId },
    })) !== null);

  section("Item 4 — abandoned PENDING cleanup");
  await prisma.attachment.update({
    where: { id: pendingId },
    data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  });
  storage.set(pendingRow!.publicId, {
    buf: Buffer.from("x"),
    resourceType: "image",
    format: "jpg",
  });
  const summary = await service.sweepAbandonedAttachments();
  check("sweep destroys the abandoned PENDING asset", summary.pendingDestroyed >= 1,
    JSON.stringify(summary));
  check("sweep removes the row",
    (await prisma.attachment.findUnique({ where: { id: pendingId } })) === null);
  check("sweep called destroy in storage", destroyed.includes(pendingRow!.publicId));

  // --------------------------------------------------------------- wrap up
  server.close();
  cloudinaryServer.close();
  await prisma.$disconnect();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log(
    "\nCaveat: Cloudinary is a local stand-in. Everything else — Express, " +
      "Prisma/Postgres, ClamAV, file-type, unpdf — is the production component.",
  );
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
