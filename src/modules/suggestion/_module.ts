import type { ModuleManifest } from '../../types/module.js';
import {
  handleSuggestionButton,
  handleSuggestionModal,
  handleSuggestionPanelResurface,
  initializeSuggestionPanels,
  handleSuggestionReactionAdd,
  handleSuggestionReactionRemove,
} from './_suggestionHandler.js';

export default {
  name: 'suggestion',
  description: 'Suggestion panel system with voting, comments, and status workflows',
  buttonPrefixes: ['sug_', 'suggest_'],
  modalPrefixes: ['sug_', 'suggest_'],
  onButton: handleSuggestionButton,
  onModal: handleSuggestionModal,
  onMessage: handleSuggestionPanelResurface,
  onReactionAdd: handleSuggestionReactionAdd,
  onReactionRemove: handleSuggestionReactionRemove,
  onReady: initializeSuggestionPanels,
} satisfies ModuleManifest;
