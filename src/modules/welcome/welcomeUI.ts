import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { WELCOME_VARIABLES_GUIDE } from './welcomeEngine.js';
import { ui, type ComponentV2Payload } from '../../core/ui/index.js';

export function buildWelcomeConfigPanel(type: 'greet' | 'leave'): ComponentV2Payload {
  const isGreet = type === 'greet';
  const title = isGreet ? 'Welcome Greeting Configuration' : 'Leave Message Configuration';

  const body =
    `Configure the plain text message for **${isGreet ? 'Welcome' : 'Leave'}** events:\n\n` +
    WELCOME_VARIABLES_GUIDE;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`welcome_simple_${type}`)
      .setLabel('Set Message')
      .setStyle(ButtonStyle.Primary),
  );

  return ui.standard({
    title,
    text: body,
    components: [row],
  });
}
