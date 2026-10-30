import { env, isDev } from '../config/environment.js';
import { constants } from '../config/constants.js';
import { consoleLog } from './ConsoleLogger.js';
import type { LogSeverity, LogCategory, CommandLogEvent } from '../../types/logging.js';
import { truncate } from '../utils/validators.js';

interface QueuedLog {
  content: string;
  timestamp: number;
}

const queue: QueuedLog[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSend = 0;

export function startWebhookLogger(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flushQueue, constants.webhookFlushInterval);
  flushTimer.unref();
}

export async function stopWebhookLogger(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  await flushQueue();
}

export function logEvent(
  severity: LogSeverity,
  category: LogCategory,
  message: string,
  details?: Record<string, unknown>,
): void {
  if (isDev()) consoleLog(severity, category, message, details);
  if (severity === 'debug') return;

  const detailLines = details
    ? Object.entries(details)
        .map(([k, v]) => `• **${k}:** ${String(v)}`)
        .join('\n')
    : '';
  const content = [`**[${severity.toUpperCase()}]** \`${category}\``, message, detailLines]
    .filter(Boolean)
    .join('\n');
  enqueue(truncate(content, 1900));
}

export function logCommand(event: CommandLogEvent): void {
  const outcomeKey = event.outcome || (event.success ? 'success' : 'fail');
  if (isDev()) {
    consoleLog('info', 'command_execution', `${event.userTag} used ${event.commandName} [${outcomeKey}]`, {
      guild: event.guildName,
      channel: event.channelName,
      args: event.rawArgs,
    });
  }

  const content = [
    `**Command Triggered** \`[${outcomeKey.toUpperCase()}]\``,
    `• **Who:** ${event.userTag} (\`${event.userId}\`)`,
    `• **Where:** ${event.guildName} → #${event.channelName}`,
    `• **Command:** \`${event.commandName}\`${event.aliasUsed !== event.commandName ? ` (alias: \`${event.aliasUsed}\`)` : ''}`,
    `• **Full:** \`${truncate(event.rawContent, 400)}\``,
    event.responseSnippet ? `• **Reply:** \`${truncate(event.responseSnippet, 250)}\`` : '',
    event.resolvedTargets?.length ? `• **Targets:** ${event.resolvedTargets.join(', ')}` : '',
    event.error ? `• **Reason / Error:** ${event.error}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  enqueue(truncate(content, 1900));
}

export function logInteraction(data: {
  type: string;
  customId: string;
  userTag: string;
  userId: string;
  guildName?: string;
  channelName?: string;
  details?: string;
}): void {
  if (isDev()) {
    consoleLog('info', 'interaction', `${data.userTag} interacted: ${data.customId} (${data.type})`);
  }

  const content = [
    `**Interaction Triggered** \`[${data.type.toUpperCase()}]\``,
    `• **Who:** ${data.userTag} (\`${data.userId}\`)`,
    `• **Where:** ${data.guildName ?? 'DM'} → #${data.channelName ?? 'unknown'}`,
    `• **Custom ID:** \`${data.customId}\``,
    data.details ? `• **Details:** ${data.details}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  enqueue(truncate(content, 1900));
}

function enqueue(content: string): void {
  queue.push({ content, timestamp: Date.now() });

  if (queue.length >= constants.webhookBatchSize) {
    void flushQueue();
  } else if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushTimeout = null;
      void flushQueue();
    }, 2000);
  }
}

async function flushQueue(): Promise<void> {
  if (queue.length === 0) return;
  if (!env.devWebhookUrl) {
    queue.length = 0;
    return;
  }
  const now = Date.now();
  if (now - lastSend < constants.webhookMinInterval) return;

  const batch = queue.splice(0, constants.webhookBatchSize);
  const combined = batch.map(q => q.content).join('\n\n---\n\n');
  lastSend = now;

  try {
    await fetch(env.devWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: truncate(combined, 1950),
        username: 'Hawk Logs',
      }),
    });
  } catch (error) {
    consoleLog(
      'error',
      'api_error',
      `Webhook send failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
