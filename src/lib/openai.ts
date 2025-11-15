import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️  OPENAI_API_KEY not set. Evaluator diagnosis will not work until API key is provided.");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "placeholder-key-not-set",
});
