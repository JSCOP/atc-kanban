import { promises as fs, existsSync } from 'node:fs';
import { platform } from 'node:os';
import path from 'node:path';

export interface FsRoot {
  path: string;
  label: string;
  kind: 'drive' | 'root';
}

export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo: boolean;
  size?: number;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: FsEntry[];
}

export class FilesystemBrowserService {
  private static readonly ROOT_CACHE_MS = 30_000;
  private static readonly ENTRY_LIMIT = 500;
  private static readonly FILTERED_NAMES = new Set(['node_modules', 'dist', '.cache', '.git']);

  private cachedRoots: { timestamp: number; roots: FsRoot[] } | null = null;

  async getRoots(): Promise<FsRoot[]> {
    const now = Date.now();
    if (
      this.cachedRoots &&
      now - this.cachedRoots.timestamp < FilesystemBrowserService.ROOT_CACHE_MS
    ) {
      return this.cachedRoots.roots;
    }

    let roots: FsRoot[];
    if (platform() === 'win32') {
      roots = [];
      for (let code = 65; code <= 90; code += 1) {
        const letter = String.fromCharCode(code);
        const drivePath = `${letter}:/`;
        try {
          await fs.access(drivePath);
          roots.push({
            path: drivePath,
            label: `${letter}:`,
            kind: 'drive',
          });
        } catch {
          // Drive does not exist or is inaccessible.
        }
      }
    } else {
      roots = [{ path: '/', label: '/', kind: 'root' }];
    }

    this.cachedRoots = { timestamp: now, roots };
    return roots;
  }

  async browse(dirPath: string, showHidden = false): Promise<BrowseResult> {
    this.validatePathInput(dirPath);

    const resolvedPathRaw = await fs.realpath(dirPath);
    const resolvedPath = this.normalizePath(resolvedPathRaw);
    await this.assertWithinAllowedRoots(resolvedPath);

    const dirents = await fs.readdir(resolvedPathRaw, { withFileTypes: true });
    const entries: FsEntry[] = [];

    for (const dirent of dirents) {
      if (!this.shouldInclude(dirent.name, showHidden)) {
        continue;
      }

      const fullPathRaw = path.join(resolvedPathRaw, dirent.name);
      const fullPath = this.normalizePath(fullPathRaw);
      const isDirectory = dirent.isDirectory();
      const fsEntry: FsEntry = {
        name: dirent.name,
        path: fullPath,
        isDirectory,
        isGitRepo: isDirectory && existsSync(path.join(fullPathRaw, '.git')),
      };

      if (!isDirectory) {
        try {
          const stats = await fs.stat(fullPathRaw);
          fsEntry.size = stats.size;
        } catch {
          // Ignore stat errors for individual files.
        }
      }

      entries.push(fsEntry);
    }

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'accent' });
    });

    const parentPath = this.normalizePath(path.dirname(resolvedPathRaw));
    const parent = parentPath === resolvedPath ? null : parentPath;

    return {
      path: resolvedPath,
      parent,
      entries: entries.slice(0, FilesystemBrowserService.ENTRY_LIMIT),
    };
  }

  private validatePathInput(dirPath: string): void {
    if (dirPath.includes('\0')) {
      throw new Error('Invalid path: NUL bytes are not allowed');
    }

    if (!dirPath.startsWith('/') && !/^[A-Za-z]:/.test(dirPath)) {
      throw new Error('Invalid path: expected an absolute Unix path or Windows drive path');
    }

    const segments = dirPath.split(/[\\/]+/);
    if (segments.includes('..')) {
      throw new Error('Invalid path: parent directory traversal is not allowed');
    }
  }

  private async assertWithinAllowedRoots(resolvedPath: string): Promise<void> {
    const roots = await this.getRoots();
    const allowed = roots.some((root) => this.isWithinRoot(resolvedPath, root.path));
    if (!allowed) {
      throw new Error(`Access denied: path is outside allowed roots (${resolvedPath})`);
    }
  }

  private isWithinRoot(targetPath: string, rootPath: string): boolean {
    const target = this.normalizePath(targetPath);
    const root = this.normalizePath(rootPath);

    if (platform() === 'win32') {
      const lowerTarget = target.toLowerCase();
      const lowerRoot = root.toLowerCase();
      const withSlash = lowerRoot.endsWith('/') ? lowerRoot : `${lowerRoot}/`;
      return lowerTarget === lowerRoot || lowerTarget.startsWith(withSlash);
    }

    const withSlash = root.endsWith('/') ? root : `${root}/`;
    return target === root || target.startsWith(withSlash);
  }

  private shouldInclude(name: string, showHidden: boolean): boolean {
    if (name === '.git') {
      return false;
    }

    if (showHidden) {
      return true;
    }

    if (name.startsWith('.')) {
      return false;
    }

    return !FilesystemBrowserService.FILTERED_NAMES.has(name);
  }

  private normalizePath(input: string): string {
    return path
      .normalize(input)
      .replace(/^\\\\\?\\/, '')
      .replace(/\\/g, '/');
  }
}
