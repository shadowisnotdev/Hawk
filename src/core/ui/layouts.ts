import {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { Message, GuildTextBasedChannel, ContainerBuilder } from 'discord.js';
import type { CommandContext } from '../../types/command.js';
import { sanitize, sanitizeAsync } from '../utils/validators.js';
import type { SectionOptions } from './components.js';
import { createContainer, createTextDisplay, createSeparator, createSection } from './components.js';

export interface ComponentV2Payload {
  components: ContainerBuilder[];
  flags: number;
}

export interface StandardLayoutOptions {
  title?: string;
  text?: string;
  sections?: (string | SectionOptions)[];
  components?: ActionRowBuilder<any>[];
  accentColor?: number;
  divider?: boolean;
  thumbnailUrl?: string;
  sanitize?: boolean;
}

export function standard(options: StandardLayoutOptions): ComponentV2Payload {
  const container = createContainer({ accentColor: options.accentColor });
  const shouldSanitize = options.sanitize !== false;
  const clean = (str: string): string => shouldSanitize ? sanitize(str) : str;

  if (options.title) {
    container.addTextDisplayComponents(createTextDisplay(`### ${clean(options.title)}`));
  }

  if (options.text) {
    if (options.title) {
      if (options.divider !== false) {
        container.addSeparatorComponents(createSeparator(true));
      }
    }
    if (options.thumbnailUrl) {
      const section = createSection({
        text: clean(options.text),
        thumbnailUrl: options.thumbnailUrl,
      });
      container.addSectionComponents(section);
    } else {
      container.addTextDisplayComponents(createTextDisplay(clean(options.text)));
    }
  }

  if (options.sections && options.sections.length > 0) {
    for (let i = 0; i < options.sections.length; i++) {
      if (i > 0 || options.title || options.text) {
        if (options.divider !== false) {
          container.addSeparatorComponents(createSeparator(true));
        }
      }
      const secItem = options.sections[i];
      if (typeof secItem === 'string') {
        container.addTextDisplayComponents(createTextDisplay(clean(secItem)));
      } else {
        container.addSectionComponents(createSection({
          text: clean(secItem.text),
          button: secItem.button,
          thumbnailUrl: secItem.thumbnailUrl,
        }));
      }
    }
  }

  if (options.components && options.components.length > 0) {
    if (options.divider !== false && (options.title || options.text || (options.sections && options.sections.length > 0))) {
      container.addSeparatorComponents(createSeparator(true));
    }
    for (const row of options.components) {
      container.addActionRowComponents(row);
    }
  }

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export interface DashboardField {
  name: string;
  value: string;
}

export interface DashboardLayoutOptions {
  title: string;
  description?: string;
  fields?: DashboardField[];
  components?: ActionRowBuilder<any>[];
  accentColor?: number;
}

export function dashboard(options: DashboardLayoutOptions) {
  const sections: string[] = [];
  if (options.description) {
    sections.push(options.description);
  }

  if (options.fields && options.fields.length > 0) {
    for (const field of options.fields) {
      sections.push(`**${field.name}**\n${field.value}`);
    }
  }

  return standard({
    title: options.title,
    sections,
    components: options.components,
    accentColor: options.accentColor,
  });
}

export interface PaginatedLayoutOptions {
  title: string;
  items: string[];
  pageSize?: number;
  emptyText?: string;
  timeoutMs?: number;
  accentColor?: number;
}

export async function paginated(
  ctx: CommandContext,
  options: PaginatedLayoutOptions,
): Promise<Message> {
  const { channel, member, guild } = ctx;
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 10;
  const timeoutMs = options.timeoutMs ?? 120_000;

  const title = sanitize(options.title, guild);
  const emptyText = sanitize(options.emptyText ?? 'No items found.', guild);
  const items = await Promise.all(options.items.map((it) => sanitizeAsync(it, guild)));
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  function buildPagePayload(page: number, disabled = false) {
    if (items.length === 0) {
      return standard({
        title,
        sections: [emptyText],
        accentColor: options.accentColor,
      });
    }

    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    const content = `${pageItems.join('\n')}\n\n*Page ${page}/${totalPages} (Total: ${items.length})*`;

    let buttonRow: ActionRowBuilder<ButtonBuilder> | undefined;
    if (totalPages > 1) {
      buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`v2_prev_${page}`)
          .setLabel('Prev')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || page <= 1),
        new ButtonBuilder()
          .setCustomId(`v2_page_indicator`)
          .setLabel(`${page} / ${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`v2_next_${page}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || page >= totalPages),
      );
    }

    return standard({
      title,
      sections: [content],
      components: buttonRow ? [buttonRow] : undefined,
      accentColor: options.accentColor,
    });
  }

  const textChannel = channel as GuildTextBasedChannel;
  let currentPage = 1;
  const initialPayload = buildPagePayload(currentPage);

  const sentMsg = await textChannel.send({
    components: initialPayload.components,
    flags: initialPayload.flags as any,
    allowedMentions: { parse: [], roles: [], users: [], repliedUser: false },
  });

  if (totalPages <= 1) {
    return sentMsg;
  }

  const collector = sentMsg.createMessageComponentCollector({
    time: timeoutMs,
  });

  collector.on('collect', async (i) => {
    if (i.user.id !== member.id) {
      await i.reply({
        content: 'Only the command executor can switch pages.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }

    if (i.customId.startsWith('v2_prev_')) {
      currentPage = Math.max(1, currentPage - 1);
    } else if (i.customId.startsWith('v2_next_')) {
      currentPage = Math.min(totalPages, currentPage + 1);
    } else {
      return;
    }

    const nextPayload = buildPagePayload(currentPage);
    await i.update({
      components: nextPayload.components,
      flags: nextPayload.flags as any,
    }).catch(() => {});
  });

  collector.on('end', async () => {
    const finalPayload = buildPagePayload(currentPage, true);
    await sentMsg.edit({
      components: finalPayload.components,
      flags: finalPayload.flags as any,
    }).catch(() => {});
  });

  return sentMsg;
}
