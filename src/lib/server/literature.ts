import { createServerFn } from "@tanstack/react-start";
import { writerAuthMiddleware } from "@/lib/server/firebase-middleware";
import { analyzeLiterature } from "@/lib/ai/literature/analyze";

export const analyzeLiteratureHandler = createServerFn({ method: "POST" })
  .middleware([writerAuthMiddleware])
  .validator((input: { text: string; focusQuestions?: string }) => input)
  .handler(async ({ data }) => {
    try {
      const literature = await analyzeLiterature(data);
      return { ok: true as const, literature };
    } catch (err) {
      return { 
        ok: false as const, 
        error: err instanceof Error ? err.message : "문헌 분석 중 오류가 발생했습니다.",
        literature: null
      };
    }
  });

export const analyzeLiteratureWithFileHandler = createServerFn({ method: "POST" })
  .middleware([writerAuthMiddleware])
  .validator((input: unknown) => {
    if (input instanceof FormData) return input;
    throw new Error("오디오 또는 문서 데이터 형식이 올바르지 않습니다.");
  })
  .handler(async ({ data }) => {
    try {
      if (!data) throw new Error("전송된 데이터가 없습니다.");
      const rawFile = data.get("file");
      const file = rawFile instanceof Blob ? rawFile : null;
      let text = (data.get("text") as string | null) || undefined;
      const focusQuestions = (data.get("focusQuestions") as string | null) || undefined;
      
      let inlineData: { mimeType: string; data: string } | undefined;
      
      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = (file as { name?: string }).name || "";
        let mimeType = file.type;
        if (!mimeType) {
          if (fileName.endsWith(".pdf")) mimeType = "application/pdf";
          else if (fileName.endsWith(".txt")) mimeType = "text/plain";
          else if (fileName.endsWith(".md")) mimeType = "text/markdown";
          else if (fileName.endsWith(".csv")) mimeType = "text/csv";
          else mimeType = "application/pdf";
        }

        if (mimeType.startsWith("text/")) {
          const fileTextContent = buffer.toString("utf-8");
          text = text ? `${text}\n\n${fileTextContent}` : fileTextContent;
        } else {
          inlineData = {
            mimeType,
            data: buffer.toString("base64"),
          };
        }
      }

      console.log("Analyzing literature with inlineData size:", inlineData?.data.length || 0, "text length:", text?.length || 0);

      const literature = await analyzeLiterature({
        text,
        focusQuestions,
        inlineData,
      });

      return { ok: true as const, literature };
    } catch (err) {
      console.error("Error in analyzeLiteratureWithFileHandler:", err);
      return { 
        ok: false as const, 
        error: err instanceof Error ? err.message : "문헌 분석 중 알 수 없는 오류가 발생했습니다.",
        literature: null
      };
    }
  });
