import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  GuildMember,
  PartialGuildMember,
  GuildTextBasedChannel,
} from 'discord.js';
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import {
  getWelcomeConfig,
  setGreetPayload,
  setLeavePayload,
} from '../../core/database/repositories/welcomeRepo.js';
import { buildVariableContext, renderWelcomePayload } from './welcomeEngine.js';
import { getEmoji } from '../../core/config/branding.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';

export async function handleWelcomeButton(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;
  if (!customId.startsWith('welcome_') || interaction.replied || interaction.deferred) return;

  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'Manage Server (ManageGuild) permission is required.', flags: MessageFlags.Ephemeral });
    return;
  }

  const isGreet = customId.endsWith('_greet');
  const type = isGreet ? 'greet' : 'leave';

  const modal = new ModalBuilder()
    .setCustomId(`welcome_modal_simple_${type}`)
    .setTitle(`Configure ${isGreet ? 'Welcome' : 'Leave'} Message`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('welcome_text_input')
          .setLabel('Plain Text Message (with variables)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(
            isGreet
              ? 'Welcome {user} to {server}! You are member #{servermember}.'
              : 'Goodbye {user}, thanks for being part of {server}!'
          )
          .setRequired(true)
          .setMaxLength(2000),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleWelcomeModal(interaction: ModalSubmitInteraction): Promise<void> {
  const { customId, guild, user } = interaction;
  if (!guild || interaction.replied || interaction.deferred) return;
  if (!customId.startsWith('welcome_modal_')) return;

  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'Manage Server (ManageGuild) permission is required.', flags: MessageFlags.Ephemeral });
    return;
  }

  const isGreet = customId.endsWith('_greet');
  const isJson = customId.includes('_json_');
  const type = isGreet ? 'greet' : 'leave';

  const inputKey = isJson ? 'welcome_json_input' : 'welcome_text_input';
  const rawInput = interaction.fields.getTextInputValue(inputKey).trim();

  if (!rawInput) {
    await interaction.reply({ content: 'Payload cannot be empty.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Validate JSON if JSON mode
  if (isJson) {
    try {
      JSON.parse(rawInput);
    } catch {
      await interaction.reply({ content: 'Invalid JSON format. Please verify your JSON payload and try again.', flags: MessageFlags.Ephemeral });
      return;
    }
  }

  // Save payload in database
  if (isGreet) {
    await setGreetPayload(guild.id, rawInput);
  } else {
    await setLeavePayload(guild.id, rawInput);
  }

  const successEmoji = getEmoji('success');
  await interaction.reply({
    content: `${successEmoji ? `${successEmoji} ` : ''}${isGreet ? 'Welcome' : 'Leave'} ${isJson ? 'JSON payload' : 'simple message'} configured successfully. Use \`!welcome ${type} test\` to send a preview.`,
    flags: MessageFlags.Ephemeral,
  });

  logEvent('info', 'command_execution', `Welcome ${type} payload configured by ${user.tag}`, {
    administrator: user.tag,
    adminId: user.id,
    guild: guild.name,
    guildId: guild.id,
    type,
    mode: isJson ? 'json' : 'simple',
  });
}

export async function handleMemberJoin(member: GuildMember): Promise<void> {
  if (!member.guild) return;
  const config = await getWelcomeConfig(member.guild.id);
  if (!config?.greetChannelId || !config.greetPayload || config.greetEnabled === false) return;

  const textChannel = (await member.guild.channels.fetch(config.greetChannelId).catch(() => null)) as GuildTextBasedChannel | null;
  if (!textChannel) return;

  try {
    const ctx = buildVariableContext(member.guild, member);
    const payload = renderWelcomePayload(config.greetPayload, ctx);

    await textChannel.send(payload);

    logEvent('info', 'command_execution', `Welcome greeting sent for ${member.user.tag}`, {
      user: member.user.tag,
      userId: member.id,
      guild: member.guild.name,
      guildId: member.guild.id,
      channelId: textChannel.id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    consoleLog('warning', 'command_execution', `Failed to send welcome greeting in ${member.guild.id}`, { error: msg });
  }
}

export async function handleMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
  if (!member.guild) return;
  const config = await getWelcomeConfig(member.guild.id);
  if (!config?.leaveChannelId || !config.leavePayload) return;

  const textChannel = (await member.guild.channels.fetch(config.leaveChannelId).catch(() => null)) as GuildTextBasedChannel | null;
  if (!textChannel) return;

  try {
    const user = member.user;
    const ctx = buildVariableContext(member.guild, user);
    const payload = renderWelcomePayload(config.leavePayload, ctx);

    await textChannel.send(payload);

    logEvent('info', 'command_execution', `Leave message sent for ${user.tag}`, {
      user: user.tag,
      userId: user.id,
      guild: member.guild.name,
      guildId: member.guild.id,
      channelId: textChannel.id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    consoleLog('warning', 'command_execution', `Failed to send leave message in ${member.guild.id}`, { error: msg });
  }
}
