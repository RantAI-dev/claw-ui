// Curated model suggestions per provider. These power a datalist (dropdown +
// free-text), so anything not listed still works — they're suggestions that
// keep the model in sync with the chosen provider (the #1 footgun otherwise).
export const MODELS_BY_PROVIDER: Record<string, string[]> = {
  minimax: ["MiniMax-M2.7", "MiniMax-M2.5", "MiniMax-Text-01"],
  openrouter: [
    "anthropic/claude-sonnet-4.6",
    "anthropic/claude-haiku-4.5",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash",
    "deepseek/deepseek-chat",
    "meta-llama/llama-3.3-70b-instruct",
  ],
  anthropic: ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-1"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  mistral: ["mistral-large-latest", "mistral-small-latest"],
  ollama: ["llama3.2", "qwen2.5", "mistral", "phi4"],
  glm: ["glm-4-plus", "glm-4-flash"],
  zai: ["glm-4-plus", "glm-4-flash"],
  moonshot: ["moonshot-v1-128k", "kimi-k2"],
  "kimi-code": ["kimi-k2"],
  xai: ["grok-2-latest", "grok-beta"],
  together: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
};

export function modelsForProvider(provider: string | undefined | null): string[] {
  if (!provider) return [];
  return MODELS_BY_PROVIDER[provider.toLowerCase()] ?? [];
}

/** Whether a model looks valid for a provider per the curated list (empty list = unknown → accept anything). */
export function isModelLikelyValid(provider: string | undefined | null, model: string): boolean {
  const list = modelsForProvider(provider);
  return list.length === 0 || list.includes(model);
}
