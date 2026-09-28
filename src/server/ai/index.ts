import type { AIProvider } from "@/core/ai/provider";
import { LocalAIProvider } from "@/core/ai/local";
import { env } from "../env";
import { AnthropicAIProvider } from "./anthropic";

let provider: AIProvider | undefined;

/** The configured AI provider. Services depend on the interface, never on a vendor. */
export function ai(): AIProvider {
  provider ??= env.ANTHROPIC_API_KEY ? new AnthropicAIProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : new LocalAIProvider();
  return provider;
}
