/**
 * WelcomeScreen Component
 *
 * The first thing the user sees on launch. Drives the file-first flow:
 * a project must be created or opened (which creates/uses an on-disk
 * .printfold file) before the editor becomes interactive.
 */

import { recentProjects, type RecentEntry } from '../services/recentProjects';

export type WelcomeAction =
  | { kind: 'new' }
  | { kind: 'open' }
  | { kind: 'openRecent'; entry: RecentEntry };

export class WelcomeScreen {
  private root: HTMLElement | null = null;
  private onAction: ((action: WelcomeAction) => void) | null = null;

  setOnAction(handler: (action: WelcomeAction) => void): void {
    this.onAction = handler;
  }

  mount(): void {
    this.root = document.getElementById('welcome-screen');
    if (!this.root) return;

    const newBtn = this.root.querySelector<HTMLButtonElement>('#welcome-new');
    const openBtn = this.root.querySelector<HTMLButtonElement>('#welcome-open');

    newBtn?.addEventListener('click', () => this.onAction?.({ kind: 'new' }));
    openBtn?.addEventListener('click', () => this.onAction?.({ kind: 'open' }));
  }

  async show(): Promise<void> {
    if (!this.root) return;
    this.root.classList.remove('hidden');
    document.body.classList.add('welcome-active');
    await this.renderRecents();
  }

  hide(): void {
    if (!this.root) return;
    this.root.classList.add('hidden');
    document.body.classList.remove('welcome-active');
  }

  private async renderRecents(): Promise<void> {
    if (!this.root) return;
    const list = this.root.querySelector<HTMLDivElement>('#welcome-recents-list');
    const empty = this.root.querySelector<HTMLElement>('#welcome-recents-empty');
    if (!list || !empty) return;

    const entries = await recentProjects.list();

    list.innerHTML = '';
    if (entries.length === 0) {
      empty.style.display = '';
      list.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    list.style.display = '';

    for (const entry of entries) {
      list.appendChild(this.renderRecentRow(entry));
    }
  }

  private renderRecentRow(entry: RecentEntry): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'recent-row';

    const name = document.createElement('span');
    name.className = 'recent-name';
    name.textContent = entry.name;

    const sub = document.createElement('span');
    sub.className = 'recent-sub';
    sub.textContent = entry.path
      ? entry.path
      : formatRelativeTime(entry.lastOpened);

    const remove = document.createElement('span');
    remove.className = 'recent-remove';
    remove.textContent = '×';
    remove.title = 'Remove from recents';
    remove.addEventListener('click', async (e) => {
      e.stopPropagation();
      await recentProjects.remove(entry);
      await this.renderRecents();
    });

    row.append(name, sub, remove);
    row.addEventListener('click', () => {
      this.onAction?.({ kind: 'openRecent', entry });
    });
    return row;
  }
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
