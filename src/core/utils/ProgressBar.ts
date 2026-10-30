import type { Message } from 'discord.js';
import { ui } from '../ui/index.js';

export function renderProgressBar(current: number, total: number, width = 10): string {
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.min(safeTotal, Math.max(0, current));
  const percent = Math.round((safeCurrent / safeTotal) * 100);
  const filled = Math.round((percent / 100) * width);
  const empty = Math.max(0, width - filled);

  const bar = '▓'.repeat(filled) + '░'.repeat(empty);
  return `${bar} \`${percent}%\``;
}

export class LiveProgressTracker {
  private lastUpdateMs = 0;
  private minIntervalMs = 1500; // Throttle edits to 1.5s to comply with Discord rate limits

  constructor(
    private progressMsg: Message,
    private title: string,
    private total: number,
  ) {}

  async update(current: number, extraStats?: string, force = false): Promise<void> {
    const now = Date.now();
    if (!force && current < this.total && now - this.lastUpdateMs < this.minIntervalMs) {
      return;
    }
    this.lastUpdateMs = now;

    const barStr = renderProgressBar(current, this.total);
    const sections = [
      `**Progress:** ${barStr} (${current}/${this.total})`,
    ];

    if (extraStats) {
      sections.push(extraStats);
    }

    const payload = ui.standard({
      title: this.title,
      sections,
    });

    await this.progressMsg.edit({
      content: undefined,
      components: payload.components,
    }).catch(() => {});
  }
}
