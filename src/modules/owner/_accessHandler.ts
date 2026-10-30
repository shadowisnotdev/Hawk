import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type Guild,
  MessageFlags,
} from 'discord.js';
import {
  getPermitsForGuild,
  removeAllPermitsForTarget,
} from '../../core/database/repositories/permissionRepo.js';
import { ui, type ComponentV2Payload } from '../../core/ui/index.js';
import { mentionUser, mentionRole } from '../../core/utils/formatters.js';
import { sanitize } from '../../core/utils/validators.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';
import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';

export interface GroupedPermit {
  targetType: 'user' | 'role';
  targetId: string;
  hasAll: boolean;
  commands: Set<string>;
  modules: Set<string>;
  earliestCreatedAt: Date;
}

export const PAGE_SIZE = 6;

/**
 * Group flat permit records by target user or role.
 */
export function groupPermits(permits: Awaited<ReturnType<typeof getPermitsForGuild>>): GroupedPermit[] {
  const map = new Map<string, GroupedPermit>();

  for (const p of permits) {
    const key = `${p.targetType}:${p.targetId}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        targetType: p.targetType,
        targetId: p.targetId,
        hasAll: false,
        commands: new Set<string>(),
        modules: new Set<string>(),
        earliestCreatedAt: p.createdAt ?? new Date(),
      };
      map.set(key, entry);
    }

    if (p.createdAt && p.createdAt < entry.earliestCreatedAt) {
      entry.earliestCreatedAt = p.createdAt;
    }

    if (!p.commandName && !p.moduleName) {
      entry.hasAll = true;
    } else if (p.commandName) {
      entry.commands.add(p.commandName);
    } else if (p.moduleName) {
      entry.modules.add(p.moduleName);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.targetType !== b.targetType) {
      return a.targetType === 'role' ? -1 : 1;
    }
    return 0;
  });
}

/**
 * Builds the paginated access list Components V2 payload.
 */
export async function buildAccessListPayload(
  guild: Guild,
  page = 0
): Promise<{ payload: ComponentV2Payload; components: any[] } | null> {
  const permits = await getPermitsForGuild(guild.id);
  if (permits.length === 0) {
    return null;
  }

  const sortedEntries = groupPermits(permits);

  // Pre-fetch uncached members/users to display friendly names
  const userNameMap = new Map<string, string>();
  const uncachedUserIds = sortedEntries
    .filter((g) => g.targetType === 'user' && !guild.members.cache.has(g.targetId))
    .map((g) => g.targetId);

  if (uncachedUserIds.length > 0) {
    await Promise.all(
      Array.from(new Set(uncachedUserIds)).map(async (uid) => {
        const member = guild.members.cache.get(uid) ?? (await guild.members.fetch(uid).catch(() => null));
        if (member) {
          userNameMap.set(uid, member.displayName);
        } else {
          const user = guild.client.users.cache.get(uid) ?? (await guild.client.users.fetch(uid).catch(() => null));
          if (user) {
            userNameMap.set(uid, user.displayName || user.globalName || user.username);
          }
        }
      })
    );
  }

  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE));
  const clampedPage = Math.max(0, Math.min(page, totalPages - 1));
  const start = clampedPage * PAGE_SIZE;
  const pageItems = sortedEntries.slice(start, start + PAGE_SIZE);

  const lines = pageItems.map((g) => {
    let targetStr: string;
    if (g.targetType === 'user') {
      const resolvedName = userNameMap.get(g.targetId) || guild.members.cache.get(g.targetId)?.displayName;
      targetStr = resolvedName ? `**${resolvedName}**` : mentionUser(g.targetId, guild);
    } else {
      targetStr = mentionRole(g.targetId, guild);
    }

    let scopesText: string;
    if (g.hasAll) {
      scopesText = '**ALL Commands & Modules**';
    } else {
      const parts: string[] = [];
      if (g.modules.size > 0) {
        const modList = Array.from(g.modules).map((m) => `\`${m}\``).join(', ');
        parts.push(`Modules: ${modList}`);
      }
      if (g.commands.size > 0) {
        const cmdList = Array.from(g.commands).map((c) => `\`${c}\``).join(', ');
        parts.push(`Commands: ${cmdList}`);
      }
      scopesText = parts.join(' • ');
    }

    return `• ${targetStr} (${g.targetType}) ➜ ${scopesText}`;
  });

  const listContent = lines.length > 0 ? lines.join('\n') : 'No active permits.';
  const footerText = `Page ${clampedPage + 1}/${totalPages} (Total Targets: ${sortedEntries.length} | Scopes: ${permits.length})`;

  let buttonRow: ActionRowBuilder<ButtonBuilder> | undefined;
  if (totalPages > 1) {
    const prevBtn = new ButtonBuilder()
      .setCustomId(`access_page_prev:${clampedPage - 1}`)
      .setLabel('Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clampedPage <= 0);

    const countBtn = new ButtonBuilder()
      .setCustomId(`access_page_count:${clampedPage}`)
      .setLabel(`${clampedPage + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const nextBtn = new ButtonBuilder()
      .setCustomId(`access_page_next:${clampedPage + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clampedPage >= totalPages - 1);

    buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, countBtn, nextBtn);
  }

  const basePayload = ui.standard({
    title: `Active Custom Permits (${sortedEntries.length} Targets)`,
    text: `${listContent}\n\n*${footerText}*`,
    components: buttonRow ? [buttonRow] : undefined,
  });

  const selectOptions: StringSelectMenuOptionBuilder[] = sortedEntries.slice(0, 25).map((g) => {
    let nameLabel = g.targetId;
    if (g.targetType === 'user') {
      const memberObj = guild.members.cache.get(g.targetId);
      nameLabel = memberObj ? memberObj.displayName : (userNameMap.get(g.targetId) || `User ${g.targetId}`);
    } else {
      const roleObj = guild.roles.cache.get(g.targetId);
      nameLabel = roleObj ? roleObj.name : `Role ${g.targetId}`;
    }

    let desc = '';
    if (g.hasAll) {
      desc = 'ALL Commands & Modules';
    } else {
      const modStr = g.modules.size > 0 ? `Modules: ${Array.from(g.modules).join(', ')}` : '';
      const cmdStr = g.commands.size > 0 ? `Commands: ${Array.from(g.commands).join(', ')}` : '';
      desc = [modStr, cmdStr].filter(Boolean).join(' | ');
    }

    return new StringSelectMenuOptionBuilder()
      .setLabel(`${nameLabel.slice(0, 50)} (${g.targetType})`)
      .setValue(`inspect:${g.targetType}:${g.targetId}:${clampedPage}`)
      .setDescription(desc.slice(0, 100) || 'Active Permits');
  });

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`access_select_inspect:${clampedPage}`)
      .setPlaceholder('Select a role or user to inspect details...')
      .addOptions(selectOptions)
  );

  return {
    payload: basePayload,
    components: [...basePayload.components, selectRow],
  };
}

/**
 * Renders target inspection profile card.
 */
export async function renderTargetInspection(
  guild: Guild,
  targetType: 'user' | 'role',
  targetId: string,
  returnPage = 0
): Promise<ComponentV2Payload | null> {
  const permits = await getPermitsForGuild(guild.id);
  const sortedEntries = groupPermits(permits);
  const targetEntry = sortedEntries.find((g) => g.targetType === targetType && g.targetId === targetId);

  if (!targetEntry) return null;

  const details: string[] = [];
  let targetTitleName = targetId;
  let targetAvatarUrl: string | undefined;

  if (targetType === 'user') {
    const member = guild.members.cache.get(targetId) ?? (await guild.members.fetch(targetId).catch(() => null));
    const user =
      member?.user ??
      guild.client.users.cache.get(targetId) ??
      (await guild.client.users.fetch(targetId).catch(() => null));

    const displayName = member?.displayName || user?.displayName || user?.username || 'Unknown User';
    const username = user
      ? `${user.username}${user.discriminator !== '0' ? `#${user.discriminator}` : ''}`
      : 'Unknown';
    targetTitleName = displayName;
    targetAvatarUrl = user?.displayAvatarURL({ size: 128 }) || member?.displayAvatarURL({ size: 128 }) || undefined;

    details.push(`• **Target User:** <@${targetId}> (\`${targetId}\`)`);
    details.push(`• **Username / Tag:** \`${username}\``);
    if (user) {
      const createdTs = Math.floor(user.createdTimestamp / 1000);
      details.push(`• **Account Created:** <t:${createdTs}:R> (<t:${createdTs}:d>)`);
    }
    if (member?.joinedTimestamp) {
      const joinedTs = Math.floor(member.joinedTimestamp / 1000);
      details.push(`• **Joined Server:** <t:${joinedTs}:R> (<t:${joinedTs}:d>)`);
    } else {
      details.push(`• **Server Status:** *Not currently in server*`);
    }
  } else {
    const roleObj = guild.roles.cache.get(targetId);
    targetTitleName = roleObj?.name || `Role ${targetId}`;
    targetAvatarUrl = roleObj?.iconURL({ size: 128 }) || undefined;

    details.push(`• **Target Role:** ${mentionRole(targetId, guild)} (\`${targetId}\`)`);
    if (roleObj) {
      details.push(`• **Role Members:** **${roleObj.members.size}** members`);
      details.push(`• **Role Color:** \`${roleObj.hexColor}\``);
      details.push(`• **Hierarchy Position:** #${roleObj.position}`);
    } else {
      details.push(`• **Role Status:** *Role was deleted from server*`);
    }
  }

  details.push('');
  details.push('**Active Custom Permits:**');

  if (targetEntry.hasAll) {
    details.push('• **ALL Commands & Modules** (Full Bypass)');
  } else {
    if (targetEntry.modules.size > 0) {
      const modItems = Array.from(targetEntry.modules).map((m) => `\`${m}\``).join(', ');
      details.push(`• **Modules (${targetEntry.modules.size}):** ${modItems}`);
    }
    if (targetEntry.commands.size > 0) {
      const cmdItems = Array.from(targetEntry.commands).map((c) => `\`${c}\``).join(', ');
      details.push(`• **Commands (${targetEntry.commands.size}):** ${cmdItems}`);
    }
  }

  const unixEarliest = Math.floor(new Date(targetEntry.earliestCreatedAt).getTime() / 1000);
  details.push('');
  details.push(`*First permit granted <t:${unixEarliest}:R> (<t:${unixEarliest}:d>)*`);

  const backBtn = new ButtonBuilder()
    .setCustomId(`access_back_list:${returnPage}`)
    .setLabel('Back to List')
    .setStyle(ButtonStyle.Secondary);

  const revokeBtn = new ButtonBuilder()
    .setCustomId(`access_ask_revoke:${targetType}:${targetId}:${returnPage}`)
    .setLabel('Revoke All Access')
    .setStyle(ButtonStyle.Danger);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn, revokeBtn);

  return ui.standard({
    title: `Permits Profile: ${targetTitleName}`,
    text: details.join('\n'),
    thumbnailUrl: targetAvatarUrl,
    components: [actionRow],
  });
}

/**
 * Renders revocation confirmation dialog for permits.
 */
export async function renderRevokeConfirmation(
  guild: Guild,
  targetType: 'user' | 'role',
  targetId: string,
  returnPage = 0
): Promise<ComponentV2Payload> {
  let targetName = targetId;
  if (targetType === 'user') {
    const mem = guild.members.cache.get(targetId) ?? (await guild.members.fetch(targetId).catch(() => null));
    const fetched = mem?.user ?? guild.client.users.cache.get(targetId) ?? (await guild.client.users.fetch(targetId).catch(() => null));
    targetName = mem?.displayName || fetched?.displayName || fetched?.username || `User ${targetId}`;
  } else {
    const roleObj = guild.roles.cache.get(targetId);
    targetName = roleObj?.name || `Role ${targetId}`;
  }

  const targetDisplay = targetType === 'role' ? mentionRole(targetId, guild) : `<@${targetId}>`;

  const confirmBtn = new ButtonBuilder()
    .setCustomId(`access_confirm_revoke:${targetType}:${targetId}:${returnPage}`)
    .setLabel('Yes, Revoke All Access')
    .setStyle(ButtonStyle.Danger);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`access_cancel_revoke:${targetType}:${targetId}:${returnPage}`)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn);

  return ui.standard({
    title: 'Confirm Access Revocation',
    text:
      `Are you sure you want to revoke **ALL** custom permits for **${targetName}** (${targetDisplay})?\n\n` +
      `This will immediately remove all permitted commands and modules for this ${targetType}.`,
    components: [row],
  });
}

/**
 * Persistent button handler for all `access_` buttons.
 */
export async function handleAccessButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return;

  const authority = getAuthorityLevel(interaction.user.id, interaction.guild.ownerId);
  if (authority !== AuthorityLevel.Owner) {
    await interaction.reply({
      content: 'Only **Bot Owners** can manage custom permits.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const customId = interaction.customId;

  // 1. Counter button (disabled)
  if (customId.startsWith('access_page_count')) {
    await interaction.deferUpdate().catch(() => {});
    return;
  }

  // 2. Pagination (Prev / Next)
  if (customId.startsWith('access_page_prev') || customId.startsWith('access_page_next')) {
    const parts = customId.split(':');
    let targetPage = parts[1] !== undefined ? parseInt(parts[1], 10) : NaN;

    if (isNaN(targetPage)) {
      // Fallback: parse from count button label in message components
      const rows = (interaction.message as any)?.components || [];
      let foundPage: number | null = null;
      for (const row of rows) {
        for (const comp of row.components || []) {
          if (comp.customId?.startsWith('access_page_count') && comp.label) {
            const m = comp.label.match(/(\d+)\s*\/\s*(\d+)/);
            if (m) {
              foundPage = parseInt(m[1], 10) - 1;
            }
          }
        }
      }
      if (foundPage !== null) {
        targetPage = customId.startsWith('access_page_prev') ? foundPage - 1 : foundPage + 1;
      } else {
        targetPage = 0;
      }
    }

    const updated = await buildAccessListPayload(interaction.guild, targetPage);
    if (!updated) {
      await interaction.update({
        content: 'No active permits found in this server.',
        components: [],
      });
      return;
    }

    await interaction.update({
      components: updated.components,
      flags: updated.payload.flags as any,
    });
    return;
  }

  // 3. Back to list
  if (customId.startsWith('access_back_list')) {
    const parts = customId.split(':');
    const returnPage = parts[1] !== undefined ? parseInt(parts[1], 10) : 0;
    const updated = await buildAccessListPayload(interaction.guild, isNaN(returnPage) ? 0 : returnPage);
    if (!updated) {
      await interaction.update({
        content: 'No active permits found in this server.',
        components: [],
      });
      return;
    }

    await interaction.update({
      components: updated.components,
      flags: updated.payload.flags as any,
    });
    return;
  }

  // 4. Revoke confirmation request
  if (customId.startsWith('access_ask_revoke:')) {
    const parts = customId.split(':');
    const targetType = parts[1] as 'user' | 'role';
    const targetId = parts[2];
    const returnPage = parts[3] !== undefined ? parseInt(parts[3], 10) : 0;

    const confirmPayload = await renderRevokeConfirmation(
      interaction.guild,
      targetType,
      targetId,
      isNaN(returnPage) ? 0 : returnPage
    );

    await interaction.update({
      components: confirmPayload.components,
      flags: confirmPayload.flags as any,
    });
    return;
  }

  // 5. Cancel revocation
  if (customId.startsWith('access_cancel_revoke:')) {
    const parts = customId.split(':');
    const targetType = parts[1] as 'user' | 'role';
    const targetId = parts[2];
    const returnPage = parts[3] !== undefined ? parseInt(parts[3], 10) : 0;

    const inspectPayload = await renderTargetInspection(
      interaction.guild,
      targetType,
      targetId,
      isNaN(returnPage) ? 0 : returnPage
    );

    if (inspectPayload) {
      await interaction.update({
        components: inspectPayload.components,
        flags: inspectPayload.flags as any,
      });
    } else {
      const updated = await buildAccessListPayload(interaction.guild, isNaN(returnPage) ? 0 : returnPage);
      if (updated) {
        await interaction.update({
          components: updated.components,
          flags: updated.payload.flags as any,
        });
      }
    }
    return;
  }

  // 6. Confirm revocation
  if (customId.startsWith('access_confirm_revoke:')) {
    const parts = customId.split(':');
    const targetType = parts[1] as 'user' | 'role';
    const targetId = parts[2];
    const returnPage = parts[3] !== undefined ? parseInt(parts[3], 10) : 0;

    const member = interaction.member ? interaction.guild.members.cache.get(interaction.user.id) : null;
    const memberName = sanitize(member?.displayName || interaction.user.tag);

    const removedCount = await removeAllPermitsForTarget(
      interaction.guild.id,
      targetType,
      targetId,
      interaction.user.id,
      memberName
    );

    logAuditAction({
      guild: interaction.guild,
      action: 'Access Target Revoked',
      executor: member || (interaction.user as any),
      details: [
        `• **Target Type:** ${targetType.toUpperCase()}`,
        `• **Target ID:** \`${targetId}\``,
        `• **Permits Revoked:** ${removedCount}`,
      ],
    });

    const backBtn = new ButtonBuilder()
      .setCustomId(`access_back_list:${isNaN(returnPage) ? 0 : returnPage}`)
      .setLabel('Back to Access List')
      .setStyle(ButtonStyle.Secondary);
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn);

    const revokeConfirmPayload = ui.standard({
      title: 'Access Revocation Successful',
      text: `Successfully revoked all **${removedCount}** permit(s) for <@${targetType === 'role' ? '&' : ''}${targetId}> (\`${targetId}\`).`,
      components: [buttonRow],
    });

    await interaction.update({
      components: revokeConfirmPayload.components,
      flags: revokeConfirmPayload.flags as any,
    });
    return;
  }
}

/**
 * Persistent select menu handler for `access_select_inspect`.
 */
export async function handleAccessSelect(interaction: AnySelectMenuInteraction): Promise<void> {
  if (!interaction.guild) return;

  const authority = getAuthorityLevel(interaction.user.id, interaction.guild.ownerId);
  if (authority !== AuthorityLevel.Owner) {
    await interaction.reply({
      content: 'Only **Bot Owners** can manage custom permits.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Permits selection
  if (interaction.customId.startsWith('access_select_inspect')) {
    const selectedVal = interaction.values[0];
    const parts = selectedVal.split(':');
    const targetType = parts[1] as 'user' | 'role';
    const targetId = parts[2];
    const returnPage = parts[3] !== undefined ? parseInt(parts[3], 10) : 0;

    const inspectPayload = await renderTargetInspection(
      interaction.guild,
      targetType,
      targetId,
      isNaN(returnPage) ? 0 : returnPage
    );

    if (!inspectPayload) {
      await interaction.reply({
        content: 'Selected target is no longer active in permits.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.update({
      components: inspectPayload.components,
      flags: inspectPayload.flags as any,
    });
  }
}
