// Minimal types for the small MIME libraries this package uses (they ship none).

declare module "mailsplit" {
  import type { Transform } from "node:stream";

  export interface Headers {
    get(key: string): string[];
    getFirst(key: string): string;
    hasHeader(key: string): boolean;
    add(key: string, value: string, index?: number): void;
    update(key: string, value: string): void;
    remove(key: string): void;
  }

  export interface MimeNode {
    type: "node";
    root: boolean;
    parentNode: MimeNode | false | undefined;
    headers: Headers;
    contentType: string | false;
    charset: string | false;
    encoding: string | false;
    disposition: string | false;
    multipart: string | false;
    /** format=flowed, and its delsp=yes. */
    flowed?: boolean;
    delSp?: boolean;
    getHeaders(): Buffer;
    setCharset(charset: string): void;
  }

  export type SplitItem = MimeNode | { type: "data"; value: Buffer } | { type: "body"; value: Buffer; node: MimeNode };

  export class Splitter extends Transform {
    constructor(options?: { ignoreEmbedded?: boolean; maxHeadSize?: number });
  }
}

declare module "libqp" {
  export function encode(buffer: Buffer | string): string;
  export function decode(str: string): Buffer;
  export function wrap(str: string, lineLength?: number): string;
}

declare module "libbase64" {
  export function encode(buffer: Buffer | string): string;
  export function decode(str: string): Buffer;
  export function wrap(str: string, lineLength?: number): string;
}

declare module "libmime" {
  const libmime: {
    decodeWords(str: string): string;
    parseHeaderValue(str: string): { value: string; params: Record<string, string> };
  };
  export default libmime;
}
