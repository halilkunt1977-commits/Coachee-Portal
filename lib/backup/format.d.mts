// Typen zu format.mjs (reines JavaScript, damit scripts/restore.mjs ohne Build läuft)
import type { IncomingMessage } from "node:http";
import type { Transform } from "node:stream";

export declare const MAGIC: Buffer;
export declare const HEADER_LEN: number;
export declare const TAG_LEN: number;
export declare const KEY_SOURCE: { BACKUP_KEY: 1; APP_SECRET: 2 };
type Env = Record<string, string | undefined>;

export declare function backupKey(env?: Env): { source: 1 | 2; key: Buffer };
export declare function keyForSource(source: number, env?: Env): Buffer;
export declare function keyId(key: Buffer): Buffer;
export declare function secretFingerprint(secret: string | undefined): string | null;
export declare function encryptStream(k: { key: Buffer; source: number }): Transform;
export declare function decryptStream(env?: Env): Transform;
export declare function parseHeader(buf: Buffer): { version: number; source: number; keyId: Buffer; iv: Buffer };
export declare function hashTap(): Transform & { bytes: number; digest(): string };

export declare function tarHeader(name: string, size: number, mtime?: Date): Buffer;
export declare function tarPadding(size: number): Buffer;
export declare function tarEnd(): Buffer;
export type TarEntry = { name: string; size: number; type: string };
export type TarSink = { data(chunk: Buffer): unknown; end(): unknown };
export declare function readTar(source: AsyncIterable<Buffer>, handler: (entry: TarEntry) => TarSink | null | Promise<TarSink | null>): Promise<void>;

export declare function isBackupName(name: string): boolean;
export declare function backupName(date?: Date): string;
export declare function dateOfBackup(name: string): Date | null;
export declare function berlinDate(d: Date): string;
export type Retention = { daily: number; weekly: number; monthly: number };
export declare const DEFAULT_RETENTION: Retention;
export declare function selectKeep(names: string[], retention?: Retention, now?: Date): Set<string>;

export declare const EMPTY_SHA256: string;
export declare function awsEncode(s: string, keepSlash?: boolean): string;
export declare function amzDate(d: Date): string;
export declare function signV4(o: {
  method: string;
  path: string;
  query?: [string, string][];
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service?: string;
  accessKey: string;
  secretKey: string;
  date: Date;
}): { authorization: string; signature: string; canonicalRequest: string; stringToSign: string };

export type S3Config = { endpoint: URL; region: string; bucket: string; accessKey: string; secretKey: string; prefix: string; pathStyle: boolean };
export declare function s3Config(env?: Env): S3Config | null;
export type S3Object = { key: string; size: number; lastModified: string | null };
export declare function s3Client(cfg: S3Config): {
  keyFor(name: string): string;
  put(key: string, filePath: string, o: { sha256: string; size: number; contentType?: string }): Promise<string>;
  putBuffer(key: string, data: Buffer, contentType?: string): Promise<string>;
  get(key: string): Promise<IncomingMessage>;
  del(key: string): Promise<string>;
  list(prefix?: string): Promise<S3Object[]>;
};
