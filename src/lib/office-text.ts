import { isOleCompound, isZip, unzip } from "@/lib/zip-inflate";
import { decodeTranscriptFile } from "@/lib/parse-transcript";

function decodeEntities(text: string): string {
  return text
    .replace(new RegExp("\u0026amp;", "gi"), "&")
    .replace(new RegExp("\u0026lt;", "gi"), "<")
    .replace(new RegExp("\u0026gt;", "gi"), ">")
    .replace(new RegExp("\u0026quot;", "gi"), '"')
    .replace(new RegExp("\u0026apos;", "gi"), "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) =>
      String.fromCharCode(Number.parseInt(n, 16)),
    );
}

export function xmlToPlainText(xml: string): string {
  const withBreaks = xml
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<w:br\b[^>]*>/gi, "\n")
    .replace(/<w:tab\b[^>]*>/gi, "\t")
    .replace(/<\/hp:p>/gi, "\n")
    .replace(/<\/hs:p>/gi, "\n")
    .replace(/<hp:lineBreak\b[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return decodeEntities(stripped)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textFromFiles(files: Map<string, Uint8Array>, names: string[]): string {
  const decoder = new TextDecoder("utf-8");
  const parts: string[] = [];
  for (const name of names) {
    const data = files.get(name);
    if (!data) continue;
    parts.push(xmlToPlainText(decoder.decode(data)));
  }
  return parts.filter(Boolean).join("\n\n");
}

export async function extractOfficeText(
  filename: string,
  buffer: ArrayBuffer,
): Promise<string> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return decodeTranscriptFile(buffer);
  }

  if (isOleCompound(buffer) || (lower.endsWith(".hwp") && !isZip(buffer))) {
    throw new Error(
      "구형 한글 문서(.hwp)는 읽을 수 없습니다. 한글에서 HWPX 또는 TXT로 저장해 주세요.",
    );
  }

  if (lower.endsWith(".doc") && !isZip(buffer)) {
    throw new Error(
      "구형 Word 문서(.doc)는 읽을 수 없습니다. DOCX 또는 텍스트로 저장해 주세요.",
    );
  }

  if (!isZip(buffer)) {
    return decodeTranscriptFile(buffer);
  }

  const files = await unzip(buffer);

  if (lower.endsWith(".docx") || files.has("word/document.xml")) {
    const text = textFromFiles(files, ["word/document.xml"]);
    if (!text) throw new Error("DOCX에서 본문을 찾지 못했습니다.");
    return text;
  }

  const hwpxSections = [...files.keys()]
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort();
  if (lower.endsWith(".hwpx") || hwpxSections.length > 0) {
    const text = textFromFiles(files, hwpxSections);
    if (!text) throw new Error("HWPX에서 본문을 찾지 못했습니다.");
    return text;
  }

  throw new Error("지원하지 않는 파일입니다. TXT, MD, DOCX, HWPX를 올려 주세요.");
}
