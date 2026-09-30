import { createServerFn } from "@tanstack/react-start";
import { firebaseAuthMiddleware } from "@/lib/server/firebase-middleware";
import { geminiEmbed } from "@/lib/ai/embed";

export const embedText = createServerFn({ method: "POST" })
  .middleware([firebaseAuthMiddleware])
  .validator((input: { text: string; taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" }) => input)
  .handler(async ({ data }) => {
    try {
      const embedding = await geminiEmbed(data.text, data.taskType);
      return { ok: true as const, embedding };
    } catch {
      return { ok: false as const, embedding: null as number[] | null };
    }
  });
