import { generateText } from "ai";
import { get } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_PATH = "side-ai/sidaamu-items.json";

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSidaamuRequest(text) {
  const q = normalize(text);

  return /sidaamu|sidaama|sidama|ሲዳም|ሲዳማ|አፎ|dialect|language|translation|ትርጉም/.test(q);
}

async function readItems() {
  try {
    const result = await get(DATA_PATH, {
      access: "private",
      useCache: false
    });

    if (!result) return [];

    const text = await new Response(result.stream).text();
    const data = JSON.parse(text);

    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function scoreItem(item, query) {
  const q = normalize(query);

  const fields = [
    item.sidaamu,
    item.amharic,
    item.english
  ].map(normalize);

  let score = 0;

  for (const field of fields) {
    if (!field) continue;

    if (field === q) score += 100;

    if (field.includes(q)) score += 25;

    for (const word of q.split(/\s+/).filter(Boolean)) {
      if (word.length > 1 && field.includes(word)) {
        score += 4;
      }
    }
  }

  return score;
}

function findRelevant(items, messages) {
  const latest = [...messages]
    .reverse()
    .find(
      (m) =>
        m &&
        m.role === "user" &&
        typeof m.content === "string"
    );

  const query = latest?.content || "";

  return items
    .filter((item) => item && item.verified === true)
    .map((item) => ({
      item,
      score: scoreItem(item, query)
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.item);
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-20)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 8000)
    }));
}

export async function POST(request) {
  try {
    const body = await request.json();

    const messages = cleanMessages(body?.messages);

    if (!messages.length) {
      return Response.json(
        {
          error: "message is required"
        },
        {
          status: 400
        }
      );
    }

    const items = await readItems();

    const relevant = findRelevant(
      items,
      messages
    );

    const latestUserMessage =
      [...messages]
        .reverse()
        .find((m) => m.role === "user")
        ?.content || "";

    const sidaamuRequest =
      isSidaamuRequest(latestUserMessage);

    const referenceText = relevant.length
      ? relevant
          .map(
            (item, index) =>
              `[${index + 1}] Sidaamu: ${
                item.sidaamu || ""
              } | Amharic: ${
                item.amharic || ""
              } | English: ${
                item.english || ""
              }`
          )
          .join("\n")
      : "No verified Sidaamu Afoo record matched this request.";

    const system = `
You are SiDE AI, a general-purpose AI assistant.

Rules:

1. Answer normally and helpfully for general questions.

2. Never invent a Sidaamu Afoo word,
translation, grammar rule, cultural claim,
or linguistic fact when the verified dataset
does not support it.

3. When a Sidaamu Afoo answer depends on
the supplied records, use only those records.

4. If the verified records are insufficient,
clearly say that the verified SiDE AI
Sidaamu Afoo record is insufficient.

5. Never present an unverified guess as
an official translation.

6. Prefer the user's language when practical.

7. Be concise unless the user asks for detail.

Verified Sidaamu Afoo records relevant
to the latest request:

${referenceText}

Latest request appears to concern Sidaamu Afoo:
${sidaamuRequest ? "yes" : "no"}.
`;

    const result = await generateText({
      model:
        process.env.SIDE_AI_MODEL ||
        "openai/gpt-5.5",

      system,

      messages
    });

    return Response.json({
      text: result.text,
      used: relevant.length
    });
  } catch (error) {
    console.error(
      "SiDE AI chat error:",
      error
    );

    return Response.json(
      {
        error:
          error?.message ||
          "AI service is not configured or temporarily unavailable."
      },
      {
        status: 500
      }
    );
  }
}
