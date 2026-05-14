const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro-latest",
];

const resolveGeminiModels = () => {
  const preferredModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  return [preferredModel, ...FALLBACK_MODELS.filter((model) => model !== preferredModel)];
};

const hasGeminiConfig = () => Boolean(process.env.GEMINI_API_KEY);

const buildGeminiUrl = (model) => {
  return `${GEMINI_BASE_URL}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
};

const safeJsonParse = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
};

const stripMarkdownFence = (text) => {
  if (!text) return "";
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
};

const extractBalancedJsonObject = (text) => {
  if (!text) return "";

  let start = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (start < 0) start = i;
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return "";
};

const extractJsonCandidate = (text) => {
  if (!text) return "";

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const fencedContent = fencedMatch?.[1]?.trim();
  if (fencedContent) return fencedContent;

  const bareText = stripMarkdownFence(text);
  const balancedFromBareText = extractBalancedJsonObject(bareText);
  if (balancedFromBareText) return balancedFromBareText;

  return extractBalancedJsonObject(text);
};

const parseGeminiText = (data) => {
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "";

  // Gemini may wrap JSON in fenced blocks or prepend/append text.
  const cleanedText = extractJsonCandidate(text) || stripMarkdownFence(text);

  return { rawText: text, cleanedText };
};

const requestWithModel = async ({ model, systemPrompt, userPrompt, forceJson = false }) => {
  const response = await fetch(buildGeminiUrl(model), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 700,
        ...(forceJson ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(
      `Gemini request failed for ${model}: ${response.status} ${errorText}`
    );
    error.statusCode = response.status;
    throw error;
  }

  const data = await response.json();
  return parseGeminiText(data);
};

const generateGeminiResponse = async ({ systemPrompt, userPrompt, forceJson = false }) => {
  if (!hasGeminiConfig()) {
    throw new Error("Gemini API key is not configured.");
  }

  const models = resolveGeminiModels();
  let lastError = null;

  for (const model of models) {
    try {
      return await requestWithModel({ model, systemPrompt, userPrompt, forceJson });
    } catch (error) {
      lastError = error;
      // Retry only if model is not available for this account/API.
      if (error.statusCode !== 404) {
        break;
      }
    }
  }

  throw lastError || new Error("Gemini request failed.");
};

const generateGeminiJson = async ({ systemPrompt, userPrompt }) => {
  const { cleanedText, rawText } = await generateGeminiResponse({
    systemPrompt,
    userPrompt,
    forceJson: true,
  });

  const parsed = safeJsonParse(cleanedText) || safeJsonParse(extractJsonCandidate(rawText));
  if (!parsed) {
    const preview = String(rawText || "").slice(0, 260);
    throw new Error(`Gemini returned non-JSON response: ${preview}`);
  }

  return parsed;
};

module.exports = {
  hasGeminiConfig,
  generateGeminiResponse,
  generateGeminiJson,
};
