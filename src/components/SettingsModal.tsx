import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Save, Server, Key, Bot, HardDrive } from 'lucide-react';
import { loadConfig, saveConfig, AgentConfig, ModelProvider } from '@/lib/agent-config';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [config, setConfig] = useState<AgentConfig>(loadConfig());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProviderChange = (provider: ModelProvider) => {
    setConfig(prev => ({ ...prev, provider }));
  };

  const handleSave = () => {
    setSaving(true);
    setError(null);
    try {
      if (config.provider === 'openai' && !config.openai.baseUrl) {
        setError('Please enter the API URL');
        setSaving(false);
        return;
      }
      saveConfig(config);
      window.dispatchEvent(new CustomEvent('agent-config-changed'));
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 md:p-4 animate-fade-in">
      <div className="w-full max-w-md animate-scale-in overflow-hidden rounded-xl border border-border bg-card shadow-2xl max-h-[85vh] md:max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 md:px-6 py-3 md:py-4">
          <h2 className="text-base md:text-lg font-semibold">Settings</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="mb-3 block text-sm font-medium">Model Provider</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleProviderChange('local')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 md:p-4 transition-all ${
                  config.provider === 'local' 
                    ? 'border-primary bg-primary/5 text-primary' 
                    : 'border-border hover:border-primary/50 hover:bg-muted'
                }`}
              >
                <HardDrive className="h-5 w-5" />
                <span className="text-sm font-medium">Local (WebGPU)</span>
                <span className="text-xs text-muted-foreground">Downloaded weights</span>
              </button>
              <button
                type="button"
                onClick={() => handleProviderChange('openai')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 md:p-4 transition-all ${
                  config.provider === 'openai' 
                    ? 'border-primary bg-primary/5 text-primary' 
                    : 'border-border hover:border-primary/50 hover:bg-muted'
                }`}
              >
                <Server className="h-5 w-5" />
                <span className="text-sm font-medium">OpenAI API</span>
                <span className="text-xs text-muted-foreground">Ollama, LM Studio</span>
              </button>
            </div>
          </div>

          {config.provider === 'local' && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Model ID</label>
                <Input
                  value={config.local.modelId}
                  onChange={(e) => setConfig(prev => ({ ...prev, local: { ...prev.local, modelId: e.target.value } }))}
                  placeholder="onnx-community/gemma-4-E2B-it-ONNX"
                />
                <p className="mt-1 text-xs text-muted-foreground">HuggingFace model ID for local WebGPU inference</p>
              </div>
            </div>
          )}

          {config.provider === 'openai' && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Server className="h-4 w-4" />
                  API URL
                </label>
                <Input
                  value={config.openai.baseUrl}
                  onChange={(e) => setConfig(prev => ({ ...prev, openai: { ...prev.openai, baseUrl: e.target.value } }))}
                  placeholder="http://localhost:11434/v1"
                />
                <p className="mt-1 text-xs text-muted-foreground">Ollama default: http://localhost:11434/v1</p>
              </div>
              
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Key className="h-4 w-4" />
                  API Key (optional)
                </label>
                <Input
                  type="password"
                  value={config.openai.apiKey}
                  onChange={(e) => setConfig(prev => ({ ...prev, openai: { ...prev.openai, apiKey: e.target.value } }))}
                  placeholder="Leave empty for local APIs"
                />
              </div>
              
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Bot className="h-4 w-4" />
                  Model Name
                </label>
                <Input
                  value={config.openai.modelId}
                  onChange={(e) => setConfig(prev => ({ ...prev, openai: { ...prev.openai, modelId: e.target.value } }))}
                  placeholder="gemma-4-e2b-it"
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-end gap-3 border-t border-border px-4 md:px-6 py-3 md:py-4">
          <Button variant="ghost" onClick={onClose} className="text-sm">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 text-sm">
            {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}