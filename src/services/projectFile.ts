/**
 * ProjectFile Service
 *
 * Tracks the on-disk file backing the currently-open project. Used by
 * the auto-save loop to write changes back to disk whenever the project
 * state changes.
 *
 *  - Electron: holds an absolute file path. Writes go through the
 *    `printfold:writeFile` IPC handler.
 *  - Web (Chromium): holds a FileSystemFileHandle. Writes use the
 *    File System Access API.
 *  - Web (Safari/Firefox): no handle is held; `canAutoSave()` returns
 *    false. The UI exposes a manual save button and warns the user.
 */

export type FileHandleRef =
  | { kind: 'electron'; path: string }
  | { kind: 'web'; handle: FileSystemFileHandle }
  | { kind: 'none' };

class ProjectFileService {
  private ref: FileHandleRef = { kind: 'none' };
  private name: string = 'Untitled';

  /** True when a writable destination is bound. */
  hasFile(): boolean {
    return this.ref.kind !== 'none';
  }

  /** True when we can write without further user interaction. */
  canAutoSave(): boolean {
    return this.ref.kind !== 'none';
  }

  getName(): string {
    return this.name;
  }

  getRef(): FileHandleRef {
    return this.ref;
  }

  /** Bind an Electron file path. */
  setElectronPath(path: string, name: string): void {
    this.ref = { kind: 'electron', path };
    this.name = name;
  }

  /** Bind a Web FileSystemFileHandle. */
  setWebHandle(handle: FileSystemFileHandle, name: string): void {
    this.ref = { kind: 'web', handle };
    this.name = name;
  }

  /** Clear the current file binding. */
  clear(): void {
    this.ref = { kind: 'none' };
    this.name = 'Untitled';
  }

  /**
   * Write bytes to the bound destination. Throws if no file is bound.
   */
  async write(bytes: Uint8Array): Promise<void> {
    if (this.ref.kind === 'electron') {
      const api = window.electronAPI;
      if (!api?.writeProjectFile) {
        throw new Error('Electron writeProjectFile bridge is unavailable');
      }
      const result = await api.writeProjectFile(this.ref.path, bytes);
      if (!result.success) {
        throw new Error(result.error || 'Failed to write project file');
      }
    } else if (this.ref.kind === 'web') {
      const writable = await this.ref.handle.createWritable();
      // BufferSource accepts a Uint8Array; some TS lib targets are stricter.
      await writable.write(bytes as unknown as BufferSource);
      await writable.close();
    } else {
      throw new Error('No project file bound');
    }
  }
}

export const projectFile = new ProjectFileService();
