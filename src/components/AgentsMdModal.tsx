import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Save, FileText, Loader2 } from 'lucide-react';
import { BashSystem } from '@/lib/bash/bash-system';

interface AgentsMdModalProps {
  onClose: () => void;
}

export function AgentsMdModal({ onClose }: AgentsMdModalProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAgentsMd = async () => {
      try {
        const bash = BashSystem.getInstance();
        const exists = await bash.fs.exists('/home/user/AGENTS.md');
        if (exists) {
          const data = await bash.fs.readFile('/home/user/AGENTS.md');
          setContent(data);
        } else {
          setError('AGENTS.md not found in virtual filesystem.');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadAgentsMd();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const bash = BashSystem.getInstance();
      await bash.fs.writeFile('/home/user/AGENTS.md', content);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 md:p-4 animate-fade-in">
      <div className="w-full max-w-4xl animate-scale-in overflow-hidden rounded-xl border border-border bg-card shadow-2xl h-[90vh] md:h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-base md:text-lg font-semibold">Edit AGENTS.md</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-hidden p-4 md:p-6 flex flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <textarea
              className="flex-1 w-full rounded-lg border border-border bg-muted/30 p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Project Documentation..."
            />
          )}
        </div>
        
        <div className="flex items-center justify-end gap-3 border-t border-border px-4 md:px-6 py-3 md:py-4 bg-muted/10">
          <Button variant="ghost" onClick={onClose} className="text-sm">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="gap-2 text-sm shadow-lg shadow-primary/20">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
