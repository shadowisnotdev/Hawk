import { MessageFlags } from 'discord.js';
import type { ActionRowBuilder } from 'discord.js';
import { HawkTheme } from './theme.js';
import { createContainer, createTextDisplay, createSeparator } from './components.js';

export interface StatusOptions {
  text: string;
  title?: string;
  components?: ActionRowBuilder<any>[];
  accentColor?: number;
}

function buildStatusContainer(emoji: string, text: string, title?: string, components?: ActionRowBuilder<any>[], accentColor?: number) {
  const container = createContainer({ accentColor });

  if (title) {
    container.addTextDisplayComponents(createTextDisplay(`### ${emoji} ${title}`));
    container.addSeparatorComponents(createSeparator(true));
    container.addTextDisplayComponents(createTextDisplay(text));
  } else {
    container.addTextDisplayComponents(createTextDisplay(`${emoji} ${text}`));
  }

  if (components && components.length > 0) {
    container.addSeparatorComponents(createSeparator(true));
    for (const row of components) {
      container.addActionRowComponents(row);
    }
  }

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export const status = {
  success: (options: StatusOptions | string) => {
    const opt = typeof options === 'string' ? { text: options } : options;
    return buildStatusContainer(HawkTheme.emojis.success, opt.text, opt.title, opt.components, opt.accentColor);
  },

  error: (options: StatusOptions | string) => {
    const opt = typeof options === 'string' ? { text: options } : options;
    return buildStatusContainer(HawkTheme.emojis.error, opt.text, opt.title, opt.components, opt.accentColor);
  },

  warning: (options: StatusOptions | string) => {
    const opt = typeof options === 'string' ? { text: options } : options;
    return buildStatusContainer(HawkTheme.emojis.warning, opt.text, opt.title, opt.components, opt.accentColor);
  },

  info: (options: StatusOptions | string) => {
    const opt = typeof options === 'string' ? { text: options } : options;
    return buildStatusContainer(HawkTheme.emojis.info, opt.text, opt.title, opt.components, opt.accentColor);
  },

  empty: (options: StatusOptions | string) => {
    const opt = typeof options === 'string' ? { text: options } : options;
    return buildStatusContainer('', opt.text, opt.title ?? 'No Items Found', opt.components, opt.accentColor);
  },

  loading: (text = 'Processing request...') => {
    return buildStatusContainer('', text);
  },
};
