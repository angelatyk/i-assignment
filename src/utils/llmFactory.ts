import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

/**
 * getModel instantiates and returns an LLM based on environment variables.
 * The instance is memoized per provider+model combination — subsequent calls
 * within the same process reuse the existing client rather than creating a new one.
 *
 * Supported providers: "google" | "anthropic"
 * Configure via .env:
 *   LLM_PROVIDER=google
 *   LLM_MODEL=gemini-2.5-flash
 *
 * Note: dotenv must be initialized at the application entry point (src/index.ts),
 * not here. This function is a pure factory and must not have side-effects.
 */

const modelCache = new Map<string, BaseChatModel>();

export function getModel(): BaseChatModel {
  const provider = process.env.LLM_PROVIDER ?? "google";
  const model = process.env.LLM_MODEL ?? "gemini-2.5-flash";
  const cacheKey = `${provider}:${model}`;

  const cached = modelCache.get(cacheKey);
  if (cached) return cached;

  console.log(`[llmFactory] Initializing model: ${provider}/${model}`);

  let instance: BaseChatModel;

  switch (provider.toLowerCase()) {
    case "google": {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error("[llmFactory] GOOGLE_API_KEY is not defined in .env");
      }
      instance = new ChatGoogleGenerativeAI({
        model,
        apiKey,
        temperature: 0,
      }) as BaseChatModel;
      break;
    }

    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("[llmFactory] ANTHROPIC_API_KEY is not defined in .env");
      }
      instance = new ChatAnthropic({
        model,
        apiKey,
        temperature: 0,
      }) as BaseChatModel;
      break;
    }

    default:
      throw new Error(
        `[llmFactory] Unsupported provider: "${provider}". Supported: google, anthropic`,
      );
  }

  modelCache.set(cacheKey, instance);
  return instance;
}

/**
 * Counts the estimated number of tokens for a given string using the
 * active model's default tokenizer.
 */
export async function countTokens(text: string): Promise<number> {
  const provider = process.env.LLM_PROVIDER ?? "google";

  // LangChain's BaseChatModel hardcodes tiktoken for getNumTokens. When it sees
  // a Gemini model name, it doesn't recognize it, dumps a massive stack trace to 
  // console.warn, and then falls back to `text.length / 4`. 
  // We skip calling it entirely for Google to keep the console logs clean.
  if (provider === "google") {
    return Math.ceil(text.length / 4);
  }

  const model = getModel();
  try {
    // We suppress console.warn temporarily in case Anthropic also triggers LangChain's internal warning
    const originalWarn = console.warn;
    console.warn = () => {}; 
    const tokens = await model.getNumTokens(text);
    console.warn = originalWarn;
    
    return tokens;
  } catch (error) {
    return Math.ceil(text.length / 4);
  }
}
