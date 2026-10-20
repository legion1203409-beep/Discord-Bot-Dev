import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Storage, type File } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export class ObjectStorageService {
  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    const { bucketName, objectName } = parseObjectPath(`${privateObjectDir}/uploads/${randomUUID()}`);
    return signObjectUrl({ bucketName, objectName, method: "PUT", ttlSec: 900 });
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) return rawPath;
    const url = new URL(rawPath);
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR ?? "";
    if (!url.pathname.startsWith(privateObjectDir)) return url.pathname;
    return `/objects/${url.pathname.slice(privateObjectDir.length).replace(/^\/+/, "")}`;
  }

  async getObjectEntityFile(objectPath: string, signal?: AbortSignal): Promise<File> {
    signal?.throwIfAborted();
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    const { bucketName, objectName } = parseObjectPath(
      `${privateObjectDir}/${objectPath.slice("/objects/".length)}`,
    );
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    // The SDK's exists/getMetadata promises cannot be aborted. Cancellable
    // callers validate existence through the signed GET instead.
    if (signal) return file;
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async downloadObject(file: File, signal?: AbortSignal): Promise<Response> {
    if (signal) {
      signal.throwIfAborted();
      const url = await signObjectUrl({
        bucketName: file.bucket.name, objectName: file.name, method: "GET", ttlSec: 60, signal,
      });
      signal.throwIfAborted();
      return fetch(url, { signal, redirect: "error" });
    }
    const [metadata] = await file.getMetadata();
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream<Uint8Array>;
    const headers = new Headers({
      "Content-Type": metadata.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    if (metadata.size) headers.set("Content-Length", String(metadata.size));
    return new Response(stream, { headers });
  }
}

function parseObjectPath(value: string): { bucketName: string; objectName: string } {
  const normalized = value.startsWith("/") ? value : `/${value}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signObjectUrl({
  bucketName,
  objectName,
  method,
  ttlSec,
  signal,
}: {
  bucketName: string;
  objectName: string;
  method: "PUT" | "GET";
  ttlSec: number;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Failed to sign object URL: ${response.status}`);
  const payload = await response.json() as { signed_url?: unknown };
  if (typeof payload.signed_url !== "string") throw new Error("Storage did not return a signed URL");
  return payload.signed_url;
}