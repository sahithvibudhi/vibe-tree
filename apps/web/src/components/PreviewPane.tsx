import { useEffect, useRef, useState } from 'react';
import { RotateCw, ExternalLink, X, ArrowRight } from 'lucide-react';

interface PreviewPaneProps {
  initialUrl?: string;
  onClose: () => void;
}

/**
 * In-app browser beside the terminal, so watching the running app does
 * not require leaving VibeTree. Passive preview only: cross-origin
 * iframes cannot expose the DOM, so element-level interactions stay out
 * of scope here.
 */
export function PreviewPane({ initialUrl, onClose }: PreviewPaneProps) {
  const [address, setAddress] = useState(initialUrl ?? '');
  const [loadedUrl, setLoadedUrl] = useState(initialUrl ?? '');
  // Changing the key forces the iframe to reload even for the same URL
  const [reloadKey, setReloadKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialUrl) {
      setAddress(initialUrl);
      setLoadedUrl(initialUrl);
    } else {
      inputRef.current?.focus();
    }
  }, [initialUrl]);

  const navigate = () => {
    const trimmed = address.trim();
    if (!trimmed) return;
    const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
    setAddress(withScheme);
    setLoadedUrl(withScheme);
    setReloadKey((key) => key + 1);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col border-l" data-testid="preview-pane">
      <div className="h-9 px-2 border-b flex items-center gap-1.5 flex-shrink-0 bg-background">
        <input
          ref={inputRef}
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate();
          }}
          placeholder="http://localhost:3000"
          spellCheck={false}
          className="flex-1 h-6 px-2.5 font-mono text-[12px] border border-input bg-muted/50 rounded-full focus:outline-none focus:ring-2 focus:ring-ring/15 focus:border-foreground/30"
          data-testid="preview-address"
        />
        <button
          onClick={navigate}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="Go"
          aria-label="Go"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setReloadKey((key) => key + 1)}
          disabled={!loadedUrl}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-50"
          title="Reload"
          aria-label="Reload preview"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => loadedUrl && window.open(loadedUrl, '_blank', 'noopener')}
          disabled={!loadedUrl}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-50"
          title="Open in browser tab"
          aria-label="Open in browser tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
          title="Close preview"
          aria-label="Close preview"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {loadedUrl ? (
        <iframe
          key={reloadKey}
          src={loadedUrl}
          title="App preview"
          className="flex-1 w-full bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center max-w-xs px-6">
            <p className="text-sm font-medium mb-1">No app to preview yet</p>
            <p className="text-xs text-muted-foreground">
              Start your dev server in the terminal; its URL is picked up automatically. Or type
              one above.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
