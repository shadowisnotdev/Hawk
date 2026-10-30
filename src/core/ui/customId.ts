import type { Interaction } from 'discord.js';

export function buildCustomId(prefix: string, action: string, ownerId?: string, extra?: string): string {
  const parts = [prefix, action];
  if (ownerId) parts.push(ownerId);
  if (extra) parts.push(extra);
  return parts.join('_');
}

export function parseCustomId(customId: string): { prefix: string; action: string; ownerId?: string; extra?: string } {
  const parts = customId.split('_');
  return {
    prefix: parts[0] || '',
    action: parts[1] || '',
    ownerId: parts[2],
    extra: parts.slice(3).join('_') || undefined,
  };
}

export function isInteractionOwner(interaction: Interaction, ownerId?: string): boolean {
  if (!ownerId) return true;
  return interaction.user.id === ownerId;
}
