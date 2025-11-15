import type { BehaviourTestResult } from "./behaviourTests";

type FilePatch = {
  path: string;
  content: string;
};

export class PatchSandbox {
  private fileOverlay: Map<string, string> = new Map();
  private originalFiles: Map<string, string> = new Map();

  async applyPatch(patchText: string): Promise<{ success: boolean; error?: string }> {
    try {
      const patches = this.parsePatch(patchText);
      
      for (const patch of patches) {
        this.fileOverlay.set(patch.path, patch.content);
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private parsePatch(patchText: string): FilePatch[] {
    const patches: FilePatch[] = [];
    const lines = patchText.split('\n');
    let currentPath: string | null = null;
    let currentContent: string[] = [];
    let inFile = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('diff --git') || line.startsWith('--- a/') || line.startsWith('+++ b/')) {
        if (line.startsWith('+++ b/')) {
          if (currentPath && currentContent.length > 0) {
            patches.push({ path: currentPath, content: currentContent.join('\n') });
            currentContent = [];
          }
          currentPath = line.substring(6).trim();
          inFile = true;
        }
        continue;
      }

      if (line.startsWith('@@')) {
        inFile = true;
        continue;
      }

      if (inFile && currentPath) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentContent.push(line.substring(1));
        } else if (!line.startsWith('-') && !line.startsWith('\\')) {
          currentContent.push(line.startsWith(' ') ? line.substring(1) : line);
        }
      }
    }

    if (currentPath && currentContent.length > 0) {
      patches.push({ path: currentPath, content: currentContent.join('\n') });
    }

    if (patches.length === 0 && patchText.includes('FILE:')) {
      return this.parseSimplePatch(patchText);
    }

    return patches;
  }

  private parseSimplePatch(patchText: string): FilePatch[] {
    const patches: FilePatch[] = [];
    const fileRegex = /FILE:\s*(.+?)\n([\s\S]+?)(?=FILE:|$)/g;
    let match;

    while ((match = fileRegex.exec(patchText)) !== null) {
      patches.push({
        path: match[1].trim(),
        content: match[2].trim(),
      });
    }

    return patches;
  }

  getFile(path: string): string | undefined {
    return this.fileOverlay.get(path);
  }

  hasFile(path: string): boolean {
    return this.fileOverlay.has(path);
  }

  reset(): void {
    this.fileOverlay.clear();
    this.originalFiles.clear();
  }

  getModifiedFiles(): string[] {
    return Array.from(this.fileOverlay.keys());
  }

  getPatchSummary(): { filesModified: number; paths: string[] } {
    return {
      filesModified: this.fileOverlay.size,
      paths: this.getModifiedFiles(),
    };
  }
}
