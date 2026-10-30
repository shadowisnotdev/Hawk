export type SuggestionStatus = 'pending' | 'accepted' | 'considered' | 'denied';
export type VoteType = 'up' | 'down';

export interface SuggestionConfig {
  guildId: string;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuggestionRecord {
  id: number;
  guildId: string;
  number: number;
  authorId: string;
  content: string;
  channelId: string;
  messageId: string;
  status: SuggestionStatus;
  staffId: string | null;
  staffActionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuggestionVoteRecord {
  id: number;
  guildId: string;
  suggestionId: number;
  userId: string;
  voteType: VoteType;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuggestionBlacklistRecord {
  id: number;
  guildId: string;
  userId: string;
  createdBy: string;
  createdAt: Date;
}

export interface VoteCounts {
  upvotes: number;
  downvotes: number;
}
