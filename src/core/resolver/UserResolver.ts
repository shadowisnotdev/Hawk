import type { Guild, GuildMember, User } from 'discord.js';
import type { ResolvedUser, ResolutionResult } from '../../types/resolver.js';
import { isSnowflake } from '../utils/validators.js';
import { layeredMatch, type MatchItem } from './LayeredMatcher.js';

interface UserMatchItem extends MatchItem {
  id: string;
  name: string;
  member: GuildMember;
  user: User;
}

export async function resolveUser(input: string, guild: Guild): Promise<ResolutionResult<ResolvedUser>> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { success: false, error: 'No user specified.' };
  }

  // 1. Direct mention or Snowflake ID
  const mentionMatch = /^<@!?(\d{17,20})>$/.exec(trimmed);
  const idInput = mentionMatch ? mentionMatch[1] : trimmed;

  if (isSnowflake(idInput)) {
    try {
      const member = await guild.members.fetch(idInput);
      if (member) {
        return { success: true, value: memberToResolved(member) };
      }
    } catch {
      // Member not in guild; fallback to global user fetch
    }

    try {
      const user = await guild.client.users.fetch(idInput);
      return {
        success: true,
        value: {
          id: user.id,
          username: user.username,
          displayName: user.displayName ?? user.username,
          tag: user.tag,
          member: null,
          user,
        },
      };
    } catch {
      return { success: false, error: `Could not find user with ID \`${idInput}\`.` };
    }
  }

  // 2. Fetch uncached members from Discord Gateway / API matching query
  try {
    await guild.members.fetch({ query: trimmed, limit: 20 });
  } catch {
    // Ignore fetch failures (e.g. rate limit / network issue), fallback to local cache
  }

  // 3. Build candidate match items from guild member cache
  const matchItems: UserMatchItem[] = [];
  const seenMemberIds = new Set<string>();

  for (const [, member] of guild.members.cache) {
    if (seenMemberIds.has(member.id)) continue;
    seenMemberIds.add(member.id);

    // Add display name match item
    matchItems.push({
      id: member.id,
      name: member.displayName,
      member,
      user: member.user,
    });

    // If username differs from display name, also index username for exact/prefix lookup
    if (member.user.username.toLowerCase() !== member.displayName.toLowerCase()) {
      matchItems.push({
        id: member.id,
        name: member.user.username,
        member,
        user: member.user,
      });
    }

    // If member has a global name distinct from username and display name
    if (
      member.user.globalName &&
      member.user.globalName.toLowerCase() !== member.displayName.toLowerCase() &&
      member.user.globalName.toLowerCase() !== member.user.username.toLowerCase()
    ) {
      matchItems.push({
        id: member.id,
        name: member.user.globalName,
        member,
        user: member.user,
      });
    }
  }

  if (matchItems.length === 0) {
    return { success: false, error: `No members found in this server.` };
  }

  // 4. Run layered name matching
  const result = layeredMatch(matchItems, trimmed);

  switch (result.outcome) {
    case 'resolved': {
      const resolvedMember = result.item.member;
      return { success: true, value: memberToResolved(resolvedMember) };
    }

    case 'ambiguous': {
      // Deduplicate ambiguous candidates by ID
      const uniqueCandidates = new Map<string, UserMatchItem>();
      for (const cand of result.candidates) {
        if (!uniqueCandidates.has(cand.id)) {
          uniqueCandidates.set(cand.id, cand);
        }
      }

      const list = Array.from(uniqueCandidates.values())
        .slice(0, 5)
        .map((c) => `• **${c.member.displayName}** (\`@${c.user.username}\` — ID: \`${c.id}\`)`)
        .join('\n');

      return {
        success: false,
        error: `Multiple users match \`${trimmed}\`. Please be more specific or use an ID/mention:\n${list}`,
      };
    }

    case 'not_found':
      return { success: false, error: `Could not find a user matching \`${trimmed}\`.` };
  }
}

function memberToResolved(member: GuildMember): ResolvedUser {
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    tag: member.user.tag,
    member,
    user: member.user,
  };
}
