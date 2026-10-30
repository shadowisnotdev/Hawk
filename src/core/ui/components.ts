import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { HawkTheme } from './theme.js';

export function createContainer(options?: { accentColor?: number }): ContainerBuilder {
  const container = new ContainerBuilder();
  const accent = options?.accentColor ?? HawkTheme.container.accentColor;
  if (accent !== undefined) {
    container.setAccentColor(accent);
  }
  return container;
}

export function createTextDisplay(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

export function createSeparator(divider = true, spacing = SeparatorSpacingSize.Small): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(divider).setSpacing(spacing);
}

export function createThumbnail(url: string, description?: string): ThumbnailBuilder {
  const thumb = new ThumbnailBuilder().setURL(url);
  if (description) thumb.setDescription(description);
  return thumb;
}

export interface SectionOptions {
  text: string;
  button?: ButtonBuilder;
  thumbnailUrl?: string;
}

export function createSection(options: SectionOptions): SectionBuilder {
  const section = new SectionBuilder().addTextDisplayComponents(createTextDisplay(options.text));
  if (options.button) {
    section.setButtonAccessory(options.button);
  } else if (options.thumbnailUrl) {
    section.setThumbnailAccessory(createThumbnail(options.thumbnailUrl));
  }
  return section;
}

export interface ButtonOptions {
  customId: string;
  label?: string;
  emoji?: string;
  style?: ButtonStyle;
  disabled?: boolean;
  url?: string;
}

export function createButton(options: ButtonOptions): ButtonBuilder {
  const button = new ButtonBuilder();
  if (options.url) {
    button.setStyle(ButtonStyle.Link).setURL(options.url);
  } else {
    button.setCustomId(options.customId).setStyle(options.style ?? ButtonStyle.Secondary);
  }

  if (options.label) button.setLabel(options.label);
  if (options.emoji) button.setEmoji(options.emoji);
  if (options.disabled !== undefined) button.setDisabled(options.disabled);

  return button;
}

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
  default?: boolean;
}

export interface SelectMenuOptions {
  customId: string;
  placeholder?: string;
  options: SelectOption[];
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
}

export function createSelectMenu(options: SelectMenuOptions): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder().setCustomId(options.customId);
  if (options.placeholder) menu.setPlaceholder(options.placeholder);
  if (options.minValues !== undefined) menu.setMinValues(options.minValues);
  if (options.maxValues !== undefined) menu.setMaxValues(options.maxValues);
  if (options.disabled !== undefined) menu.setDisabled(options.disabled);

  const optionBuilders = options.options.map((opt) => {
    const builder = new StringSelectMenuOptionBuilder().setLabel(opt.label).setValue(opt.value);
    if (opt.description) builder.setDescription(opt.description);
    if (opt.emoji) builder.setEmoji(opt.emoji);
    if (opt.default) builder.setDefault(opt.default);
    return builder;
  });

  menu.addOptions(optionBuilders);
  return menu;
}
