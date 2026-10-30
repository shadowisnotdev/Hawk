import type {
  Interaction,
  ButtonInteraction,
  AnySelectMenuInteraction,
  ChannelSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import type { ModuleManifest } from '../../types/module.js';
import { consoleLog } from '../logging/ConsoleLogger.js';
import { logInteraction } from '../logging/WebhookLogger.js';
import { logInteractionAudit } from '../logging/AuditLogger.js';

type ButtonHandler = (interaction: ButtonInteraction) => Promise<void>;
type SelectHandler = (interaction: AnySelectMenuInteraction) => Promise<void>;
type ChannelSelectHandler = (interaction: ChannelSelectMenuInteraction) => Promise<void>;
type ModalHandler = (interaction: ModalSubmitInteraction) => Promise<void>;

interface PrefixRoute<T> {
  prefix: string;
  moduleName: string;
  handler: T;
}

export class InteractionRouter {
  private buttonRoutes: PrefixRoute<ButtonHandler>[] = [];
  private selectRoutes: PrefixRoute<SelectHandler>[] = [];
  private channelSelectRoutes: PrefixRoute<ChannelSelectHandler>[] = [];
  private modalRoutes: PrefixRoute<ModalHandler>[] = [];

  registerModule(manifest: ModuleManifest): void {
    if (manifest.onButton) {
      for (const prefix of manifest.buttonPrefixes ?? []) {
        this.buttonRoutes.push({ prefix, moduleName: manifest.name, handler: manifest.onButton });
      }
    }

    if (manifest.onSelect) {
      for (const prefix of manifest.selectPrefixes ?? []) {
        this.selectRoutes.push({ prefix, moduleName: manifest.name, handler: manifest.onSelect });
      }
    }

    if (manifest.onChannelSelect) {
      for (const prefix of manifest.channelSelectPrefixes ?? []) {
        this.channelSelectRoutes.push({ prefix, moduleName: manifest.name, handler: manifest.onChannelSelect });
      }
    }

    if (manifest.onModal) {
      for (const prefix of manifest.modalPrefixes ?? []) {
        this.modalRoutes.push({ prefix, moduleName: manifest.name, handler: manifest.onModal });
      }
    }
  }

  registerModules(manifests: ModuleManifest[]): void {
    for (const manifest of manifests) {
      this.registerModule(manifest);
    }
  }

  async dispatch(interaction: Interaction): Promise<boolean> {
    try {
      if (interaction.isButton()) {
        return await this.dispatchButton(interaction);
      }
      if (interaction.isChannelSelectMenu()) {
        return await this.dispatchChannelSelect(interaction);
      }
      if (interaction.isAnySelectMenu()) {
        return await this.dispatchSelect(interaction);
      }
      if (interaction.isModalSubmit()) {
        return await this.dispatchModal(interaction);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Interaction has already been acknowledged') || msg.includes('Unknown interaction')) {
        return false;
      }
      consoleLog('error', 'unhandled_exception', `Unhandled error in interaction router: ${msg}`);
    }
    return false;
  }

  private async dispatchButton(interaction: ButtonInteraction): Promise<boolean> {
    const route = this.buttonRoutes.find(r => interaction.customId.startsWith(r.prefix));
    if (route) {
      await route.handler(interaction);
      return true;
    }
    return false;
  }

  private async dispatchSelect(interaction: AnySelectMenuInteraction): Promise<boolean> {
    const route = this.selectRoutes.find(r => interaction.customId.startsWith(r.prefix));
    const data = {
      type: 'select_menu',
      customId: interaction.customId,
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      guildName: interaction.guild?.name,
      channelId: interaction.channel?.id,
      channelName: (interaction.channel as any)?.name,
      details: `Selected: [${interaction.values.join(', ')}]${route ? ` (Routed to ${route.moduleName})` : ''}`,
    };
    logInteraction(data);
    logInteractionAudit(interaction.client, data).catch(() => {});
    if (route) {
      await route.handler(interaction);
      return true;
    }
    return false;
  }

  private async dispatchChannelSelect(interaction: ChannelSelectMenuInteraction): Promise<boolean> {
    const route = this.channelSelectRoutes.find(r => interaction.customId.startsWith(r.prefix));
    const data = {
      type: 'channel_select',
      customId: interaction.customId,
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      guildName: interaction.guild?.name,
      channelId: interaction.channel?.id,
      channelName: (interaction.channel as any)?.name,
      details: `Selected channels: [${interaction.values.join(', ')}]${route ? ` (Routed to ${route.moduleName})` : ''}`,
    };
    logInteraction(data);
    logInteractionAudit(interaction.client, data).catch(() => {});
    if (route) {
      await route.handler(interaction);
      return true;
    }
    return false;
  }

  private async dispatchModal(interaction: ModalSubmitInteraction): Promise<boolean> {
    const route = this.modalRoutes.find(r => interaction.customId.startsWith(r.prefix));
    const data = {
      type: 'modal_submit',
      customId: interaction.customId,
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      guildName: interaction.guild?.name,
      channelId: interaction.channel?.id,
      channelName: (interaction.channel as any)?.name,
      details: route ? `Routed to ${route.moduleName}` : 'Unrouted modal',
    };
    logInteraction(data);
    logInteractionAudit(interaction.client, data).catch(() => {});
    if (route) {
      await route.handler(interaction);
      return true;
    }
    return false;
  }
}

export const interactionRouter = new InteractionRouter();
