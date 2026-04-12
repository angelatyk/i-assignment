import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * getModel instantiates and returns an LLM based on environment variables.
 *
 * Supported providers: "google" | "anthropic"
 * Configure via .env:
 *   LLM_PROVIDER=google
 *   LLM_MODEL=gemini-1.5-flash
 */
export function getModel(): BaseChatModel {
  const provider = process.env.LLM_PROVIDER ?? "google";
  const model = process.env.LLM_MODEL ?? "gemini-2.5-flash";

  console.log(`[llmFactory] Initializing model: ${provider}/${model}`);

  switch (provider.toLowerCase()) {
    case "google": {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error("[llmFactory] GOOGLE_API_KEY is not defined in .env");
      }
      return new ChatGoogleGenerativeAI({
        model,
        apiKey,
        temperature: 0,
      }) as BaseChatModel;
    }

    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("[llmFactory] ANTHROPIC_API_KEY is not defined in .env");
      }
      return new ChatAnthropic({
        model,
        apiKey,
        temperature: 0,
      }) as BaseChatModel;
    }

    default:
      throw new Error(`[llmFactory] Unsupported provider: "${provider}". Supported: google, anthropic`);
  }
}
