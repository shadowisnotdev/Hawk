export interface GamePingConfig {
  id: number;
  guildId: string;
  identifier: string;
  gameName: string;
  roleId: string;
  vcId: string;
  cooldownSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGamePingInput {
  guildId: string;
  identifier: string;
  gameName: string;
  roleId: string;
  vcId: string;
  cooldownSeconds?: number;
}

export interface UpdateGamePingInput {
  newIdentifier?: string;
  gameName?: string;
  roleId?: string;
  vcId?: string;
  cooldownSeconds?: number;
}
