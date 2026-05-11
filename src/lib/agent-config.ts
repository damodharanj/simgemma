export type ModelProvider = 'local' | 'openai';

export interface AgentConfig {
  provider: ModelProvider;
  local: {
    modelId: string;
  };
  openai: {
    baseUrl: string;
    apiKey: string;
    modelId: string;
  };
}

export const DEFAULT_CONFIG: AgentConfig = {
  provider: 'local',
  local: {
    modelId: 'onnx-community/gemma-4-E2B-it-ONNX',
  },
  openai: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    modelId: 'google/gemma-4-26b-a4b-it',
  },
};

export function loadConfig(): AgentConfig {
  const stored = localStorage.getItem('agent-config');
  if (stored) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: AgentConfig): void {
  localStorage.setItem('agent-config', JSON.stringify(config));
}