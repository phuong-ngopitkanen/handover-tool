import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { TEAM_MEMBERS } from "@/lib/team";

export const runtime = "nodejs";

const buildPrompt = (text: string) => `
You are a JSON extraction assistant. Read the on-call handover document below and extract key information.
You must respond with ONLY a raw JSON object. Do not include any explanation, markdown, or backticks before or after the JSON.
The response must start with { and end with }.

Extract these exact fields:
{
  "title": "short descriptive title for this handover",
  "onCallPerson": "name of who was on call",
  "whatHappened": "2-3 sentence summary",
  "watchOut": "2-3 sentences for next person",
  "nextSteps": ["step 1", "step 2"],
  "openItems": ["item 1", "item 2"],
  "peopleInvolved": ["name1", "name2", "name3"],
  "handoverTo": "name of the person receiving this handover if mentioned, else empty string"
}

Title should be concise and descriptive, for example:
"Night shift Apr 27 — DB spike" or "Morning shift — API gateway issue".

peopleInvolved should include:
- The on call person
- Anyone mentioned by name in the document
- People assigned to action items
Always return as array of strings, deduplicated.

In nextSteps and openItems arrays, when a person is mentioned write their name as @FirstName LastName exactly matching their full name. For example: "@David Wong and @Sarah Kim to do postmortem" or "@Tom Harris to document rollback steps".

Document:
${text.slice(0, 3000)}

JSON:`.trim();

function safeStr(val: unknown): string {
  if (typeof val === "string") return val.trim();
  if (val == null) return "";
  return String(val).trim();
}

function stripMarkdownFences(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```[a-zA-Z0-9]*\s*/, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

export async function POST(request: Request) {
  console.log("MISTRAL KEY:", process.env.MISTRAL_API_KEY ? "loaded" : "MISSING");

  const fallbackResponse = {
    fallback: true,
    title: "",
    onCallPerson: "",
    whatHappened: "",
    watchOut: "",
    nextSteps: [] as string[],
    openItems: [] as string[],
    peopleInvolved: [] as string[],
    handoverTo: "",
    unresolvedMentions: [] as string[],
  };

  try {
    let inputText = "";
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        throw new Error("Missing file upload.");
      }

      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".docx")) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const { value } = await mammoth.extractRawText({ buffer });
        inputText = value;
      } else if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
        inputText = await file.text();
      } else {
        throw new Error("Unsupported file type. Use .docx, .txt, or .md.");
      }
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as { text?: string };
      inputText = (body.text ?? "").trim();
    } else {
      throw new Error("Unsupported content type.");
    }

    if (!inputText) {
      throw new Error("Missing handover text in request body.");
    }

    let raw = "";

    try {
      console.log("Sending to Mistral...");

      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages: [{ role: "user", content: buildPrompt(inputText) }],
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json() as {
        choices?: { message?: { content?: string } }[]
        error?: { message?: string }
      };

      if (data.error) {
        console.error("Mistral full error:", JSON.stringify(data.error));
        throw new Error(`Mistral error: ${data.error.message}`);
      }

      raw = data.choices?.[0]?.message?.content ?? "";
      console.log("Mistral raw response:", raw);

    } catch (apiErr) {
      console.error("Mistral extract failed:", apiErr);
      return NextResponse.json(fallbackResponse);
    }

    try {
      const cleaned = stripMarkdownFences(raw);
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      const jsonText =
        firstBrace !== -1 && lastBrace > firstBrace
          ? cleaned.slice(firstBrace, lastBrace + 1)
          : cleaned;

      const parsed = JSON.parse(jsonText) as {
        title?: unknown;
        onCallPerson?: unknown;
        whatHappened?: unknown;
        watchOut?: unknown;
        nextSteps?: unknown;
        openItems?: unknown;
        peopleInvolved?: unknown;
        handoverTo?: unknown;
      };

      const nextSteps = Array.isArray(parsed.nextSteps)
        ? parsed.nextSteps.map((s) => safeStr(s)).filter(Boolean)
        : [];
      const openItems = Array.isArray(parsed.openItems)
        ? parsed.openItems.map((s) => safeStr(s)).filter(Boolean)
        : [];

      const rawPeople = Array.isArray(parsed.peopleInvolved)
        ? [...new Set(parsed.peopleInvolved.map((name) => safeStr(name)).filter(Boolean))]
        : [];

      const resolvedSet = new Set<string>();
      const unresolvedMentions: string[] = [];

      for (const rawName of rawPeople) {
        const name = rawName.trim();
        if (!name) continue;
        const match = TEAM_MEMBERS.find((member) => {
          const memberLower = member.toLowerCase();
          const nameLower = name.toLowerCase();
          return (
            memberLower.includes(nameLower) ||
            nameLower.includes(member.split(" ")[0].toLowerCase())
          );
        });
        if (match) {
          resolvedSet.add(match);
        } else {
          unresolvedMentions.push(name);
        }
      }

      return NextResponse.json({
        title: safeStr(parsed.title),
        onCallPerson: safeStr(parsed.onCallPerson),
        whatHappened: safeStr(parsed.whatHappened),
        watchOut: safeStr(parsed.watchOut),
        nextSteps,
        openItems,
        peopleInvolved: [...resolvedSet],
        handoverTo: safeStr(parsed.handoverTo),
        unresolvedMentions: unresolvedMentions.map((m) => safeStr(m)).filter(Boolean),
      });

    } catch (parseErr) {
      console.error("Parsing failed:", parseErr);
      return NextResponse.json(fallbackResponse);
    }

  } catch (err) {
    console.error("Extract error full:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}