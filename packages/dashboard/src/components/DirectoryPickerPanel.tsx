import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { FsEntry, FsRoot } from '../types';

interface DirectoryPickerPanelProps {
  isOpen: boolean;
  onSelect: (path: string) => void;
  onClose: () => void;
  initialPath?: string;
}

export function DirectoryPickerPanel({
  isOpen,
  onSelect,
  onClose,
  initialPath,
}: DirectoryPickerPanelProps) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [roots, setRoots] = useState<FsRoot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const loadRoots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFsRoots();
      setRoots(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load filesystem roots');
    } finally {
      setLoading(false);
    }
  }, []);

  const browsePath = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.browsePath(path, showHidden);
        setCurrentPath(data.path);
        setEntries(data.entries);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to browse directory');
      } finally {
        setLoading(false);
      }
    },
    [showHidden],
  );

  // Initial load — only when panel opens
  useEffect(() => {
    if (!isOpen) return;

    if (initialPath) {
      browsePath(initialPath);
    } else {
      loadRoots();
    }
  // eslint-disable-next-line -- only run when panel opens
  }, [isOpen]); // intentionally exclude browsePath/loadRoots/initialPath

  // Re-fetch when showHidden changes
  useEffect(() => {
    if (!isOpen || !currentPath) return;
    browsePath(currentPath);
  // eslint-disable-next-line -- only react to showHidden toggle
  }, [showHidden]);

  if (!isOpen) return null;

  const handleEntryClick = (entry: FsEntry) => {
    if (entry.isDirectory) {
      browsePath(entry.path);
    }
  };

  const handleRootClick = (root: FsRoot) => {
    browsePath(root.path);
  };

  const handleBreadcrumbClick = (targetPath: string) => {
    browsePath(targetPath);
  };

  const handleGoUp = () => {
    if (currentPath) {
      const parent =
        entries.length > 0
          ? entries[0].path.startsWith(currentPath)
            ? currentPath.split(/[\\/]/).slice(0, -1).join('/') || '/'
            : null
          : null;

      if (parent && parent !== '/') {
        browsePath(parent);
      } else {
        // Check if we can get parent from current path directly
        const separator = currentPath.includes('\\') ? '\\' : '/';
        const parts = currentPath.split(separator).filter(Boolean);
        if (parts.length > 1) {
          const newPath = parts.slice(0, -1).join(separator);
          browsePath(separator === '\\' && !newPath.includes(':') ? `${newPath}\\` : newPath);
        } else if (parts.length === 1 && parts[0].includes(':')) {
          // Windows drive root - go back to roots
          setCurrentPath(null);
          loadRoots();
        } else {
          // At root level
          setCurrentPath(null);
          loadRoots();
        }
      }
    }
  };

  const generateBreadcrumbs = () => {
    if (!currentPath) return [];

    const separator = currentPath.includes('\\') ? '\\' : '/';
    const parts = currentPath.split(separator).filter(Boolean);

    // Handle Windows drive letter like "C:"
    const breadcrumbs: { label: string; path: string }[] = [];
    let accumulatedPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === 0 && part.includes(':')) {
        accumulatedPath = part + separator;
      } else {
        accumulatedPath += (accumulatedPath.endsWith(separator) ? '' : separator) + part;
      }
      breadcrumbs.push({
        label: part.replace(/\\$/, ''),
        path: accumulatedPath,
      });
    }

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();
  const directoryEntries = entries.filter((e) => e.isDirectory);

  const canSelect = currentPath !== null;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-medium flex items-center gap-2">
          <span>📂</span>
          Browse Directory
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 transition-colors"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="mb-2 text-sm">
        <span className="text-gray-400">Path:</span>{' '}
        {currentPath ? (
          <span className="text-gray-300">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.path}>
                {index > 0 && <span className="text-gray-500 mx-1">{'>'}</span>}
                <button
                  onClick={() => handleBreadcrumbClick(crumb.path)}
                  className="hover:text-white hover:underline transition-colors"
                  type="button"
                >
                  {crumb.label || '/'}
                </button>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-gray-500">Roots</span>
        )}
      </div>

      {/* Up button */}
      {currentPath && (
        <button
          onClick={handleGoUp}
          className="mb-2 text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
          type="button"
        >
          <span>↑</span> Up
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Directory List */}
      <div className="border border-gray-700 rounded-lg bg-gray-900/50 max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <svg className="animate-spin h-6 w-6 text-blue-500" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        ) : currentPath === null ? (
          // Show roots
          roots.length === 0 ? (
            <div className="p-4 text-gray-500 text-center text-sm">No filesystem roots found</div>
          ) : (
            <ul className="divide-y divide-gray-800">
              {roots.map((root) => (
                <li key={root.path}>
                  <button
                    onClick={() => handleRootClick(root)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-800 transition-colors text-left"
                    type="button"
                  >
                    <span className="text-xl">💾</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{root.label}</div>
                      <div className="text-gray-500 text-xs truncate">{root.path}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : directoryEntries.length === 0 ? (
          <div className="p-4 text-gray-500 text-center text-sm">This directory is empty</div>
        ) : (
          // Show directory entries
          <ul className="divide-y divide-gray-800">
            {directoryEntries.map((entry) => (
              <li key={entry.path}>
                <button
                  onClick={() => handleEntryClick(entry)}
                  className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-800 transition-colors text-left"
                  type="button"
                >
                  <span className="text-xl">📁</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{entry.name}</div>
                  </div>
                  {entry.isGitRepo && (
                    <span
                      className="text-xs text-green-400 flex items-center gap-1 shrink-0"
                      title="Git repository"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      git
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Controls */}
      <div className="mt-3 flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
          />
          Show hidden files
        </label>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex justify-end gap-3 pt-3 border-t border-gray-700">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          type="button"
        >
          Cancel
        </button>
        <button
          onClick={() => canSelect && currentPath && onSelect(currentPath)}
          disabled={!canSelect}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          type="button"
        >
          Select This Path
        </button>
      </div>
    </div>
  );
}
