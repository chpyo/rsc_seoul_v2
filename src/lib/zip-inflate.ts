/** Minimal ZIP reader for DOCX/HWPX (store + deflate). */

function u16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([data as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const { inflateRawSync } = await import("node:zlib");
  return inflateRawSync(data);
}

function findEocd(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

export function isZip(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b;
}

export function isOleCompound(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return (
    b.length >= 8 &&
    b[0] === 0xd0 &&
    b[1] === 0xcf &&
    b[2] === 0x11 &&
    b[3] === 0xe0
  );
}

export async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder("utf-8");

  const eocd = findEocd(bytes);
  if (eocd < 0) {
    throw new Error("압축 문서를 읽지 못했습니다.");
  }
  const cdOffset = u32(view, eocd + 16);
  const cdCount = u16(view, eocd + 10);
  let offset = cdOffset;

  for (let i = 0; i < cdCount; i += 1) {
    if (u32(view, offset) !== 0x02014b50) break;
    const method = u16(view, offset + 10);
    const compSize = u32(view, offset + 20);
    const nameLen = u16(view, offset + 28);
    const extraLen = u16(view, offset + 30);
    const commentLen = u16(view, offset + 32);
    const localOff = u32(view, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    const localNameLen = u16(view, localOff + 26);
    const localExtra = u16(view, localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtra;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);
    if (method === 0) {
      files.set(name, compressed.slice());
    } else if (method === 8) {
      files.set(name, await inflateRaw(compressed));
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
