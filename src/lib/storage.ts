import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

/**
 * Storage abstraction: S3-compatible in production (Cloudflare R2, B2, MinIO,
 * AWS S3), local `public/uploads` in development. Railway's filesystem is
 * ephemeral, so a production deploy without S3 credentials is a misconfiguration
 * and uploads are refused rather than silently lost.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export type StoredObject = { url: string; key: string; bytes: number };

export type UploadFailure = { ok: false; error: string };
export type UploadSuccess = { ok: true; object: StoredObject };
export type UploadResult = UploadSuccess | UploadFailure;

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.S3_REGION || "auto",
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export function storageDriver(): "s3" | "local" {
  return env.s3Configured ? "s3" : "local";
}

function randomKey(prefix: string, extension: string): string {
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${prefix}/${yyyymm}/${randomBytes(16).toString("hex")}.${extension}`;
}

/** Detect real image type from magic bytes; never trust the client's header. */
export function sniffImageType(buffer: Buffer): AllowedImageType | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Re-encode through sharp: this both strips EXIF/GPS metadata and guarantees
 * the bytes we store really are the image we think they are.
 */
async function normalizeImage(
  buffer: Buffer,
  type: AllowedImageType,
  maxDimension: number,
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  const { default: sharp } = await import("sharp");

  const pipeline = sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true });

  if (type === "image/png") {
    return {
      buffer: await pipeline.png({ compressionLevel: 9 }).toBuffer(),
      contentType: "image/png",
      extension: "png",
    };
  }

  return {
    buffer: await pipeline.webp({ quality: 82 }).toBuffer(),
    contentType: "image/webp",
    extension: "webp",
  };
}

export type UploadOptions = {
  prefix?: string;
  maxDimension?: number;
};

export async function uploadImage(
  input: Buffer | ArrayBuffer,
  declaredType: string,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  if (buffer.byteLength === 0) return { ok: false, error: "The file is empty." };
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "Images must be 8 MB or smaller." };
  }

  const sniffed = sniffImageType(buffer);
  if (!sniffed) {
    return { ok: false, error: "Only JPG, PNG and WebP images are supported." };
  }
  if (declaredType && !(declaredType in ALLOWED_IMAGE_TYPES)) {
    return { ok: false, error: "Only JPG, PNG and WebP images are supported." };
  }

  let normalized: Awaited<ReturnType<typeof normalizeImage>>;
  try {
    normalized = await normalizeImage(buffer, sniffed, options.maxDimension ?? 2048);
  } catch (error) {
    console.error("[inkpub] image processing failed", error);
    return { ok: false, error: "That image could not be processed." };
  }

  const key = randomKey(options.prefix ?? "uploads", normalized.extension);

  if (storageDriver() === "s3") {
    try {
      await s3().send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET!,
          Key: key,
          Body: normalized.buffer,
          ContentType: normalized.contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    } catch (error) {
      console.error("[inkpub] s3 upload failed", error);
      return { ok: false, error: "Upload failed. Please try again." };
    }

    const base = (env.S3_PUBLIC_BASE_URL || `${env.S3_ENDPOINT}/${env.S3_BUCKET}`).replace(
      /\/+$/,
      "",
    );
    return {
      ok: true,
      object: { url: `${base}/${key}`, key, bytes: normalized.buffer.byteLength },
    };
  }

  if (env.isProduction) {
    return {
      ok: false,
      error:
        "Image storage is not configured on this deployment. " +
        "Set the S3_* environment variables.",
    };
  }

  const target = path.join(process.cwd(), "public", "uploads", key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, normalized.buffer);

  return {
    ok: true,
    object: { url: `/uploads/${key}`, key, bytes: normalized.buffer.byteLength },
  };
}
