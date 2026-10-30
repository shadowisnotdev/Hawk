// Shared browser/server DSL. Values are data; no JavaScript is ever evaluated.
export const flowActions = ['trigger', 'hasRole', 'hasPermission', 'inChannel', 'reply', 'send', 'embed', 'addRole', 'removeRole', 'react', 'wait'] as const;
export type FlowAction = typeof flowActions[number];
export interface FlowNode { id: string; type?: string; position: { x: number; y: number }; data: { action: FlowAction; args: Record<string, string | number>; label?: string } }
export interface FlowEdge { id: string; source: string; target: string; sourceHandle?: string | null }
export interface CommandFlow { nodes: FlowNode[]; edges: FlowEdge[] }
const conditions = new Set<FlowAction>(['hasRole', 'hasPermission', 'inChannel']);
const permissions = ['Administrator', 'ManageGuild', 'ManageMessages', 'ManageRoles', 'SendMessages', 'ViewChannel', 'Connect'];
export function validateFlow(input: unknown): CommandFlow {
  if (!input || typeof input !== 'object') throw new Error('Flow must be an object');
  const flow = input as CommandFlow;
  if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges) || flow.nodes.length < 1 || flow.nodes.length > 50 || flow.edges.length > 100) throw new Error('Use 1–50 nodes and at most 100 edges');
  const ids = new Set<string>(); let waitTotal = 0;
  for (const n of flow.nodes) {
    if (!n || !/^[\w-]{1,64}$/.test(n.id) || ids.has(n.id)) throw new Error('Invalid or duplicate node ID');
    ids.add(n.id);
    if (!n.data || !flowActions.includes(n.data.action)) throw new Error('Unknown action');
    const args = n.data.args;
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Action arguments must be an object');
    for (const [key, value] of Object.entries(args)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe argument key');
      if (!['string', 'number'].includes(typeof value) || String(value).length > 4000 || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Invalid action argument');
    }
    const action = n.data.action;
    if (['hasRole', 'addRole', 'removeRole'].includes(action) && !/^\d{17,20}$/.test(String(args.roleId || ''))) throw new Error('Role action needs a Discord role ID');
    if (['inChannel', 'send', 'embed'].includes(action) && !/^\d{17,20}$/.test(String(args.channelId || ''))) throw new Error('Channel action needs a Discord channel ID');
    if (action === 'hasPermission' && !permissions.includes(String(args.permission))) throw new Error('Unknown permission');
    if (action === 'reply' || action === 'send') { if (typeof args.text !== 'string' || !args.text.trim() || args.text.length > 2000) throw new Error('Message needs 1–2000 characters'); }
    if (action === 'embed' && (typeof args.description !== 'string' || !args.description.trim())) throw new Error('Embed needs a description');
    if (action === 'react' && (typeof args.emoji !== 'string' || !args.emoji || args.emoji.length > 100)) throw new Error('Reaction needs an emoji');
    if (action === 'wait') { const ms = args.ms; if (typeof ms !== 'number' || ms < 0 || ms > 5000) throw new Error('Wait must be between 0 and 5000ms'); waitTotal += ms; }
  }
  if (waitTotal > 10_000) throw new Error('Total wait cannot exceed 10 seconds');
  const triggers = flow.nodes.filter(n => n.data.action === 'trigger');
  if (triggers.length !== 1) throw new Error('Flow needs exactly one trigger');
  const edgeIds = new Set<string>(); const branches = new Set<string>();
  for (const e of flow.edges) {
    if (!e || !ids.has(e.source) || !ids.has(e.target) || e.target === triggers[0].id || edgeIds.has(e.id)) throw new Error('Invalid edge or edge into trigger');
    edgeIds.add(e.id);
    const condition = conditions.has(flow.nodes.find(n => n.id === e.source)!.data.action);
    if (condition && !['yes', 'no'].includes(e.sourceHandle || '')) throw new Error('Condition edge must select yes or no');
    if (!condition && e.sourceHandle) throw new Error('Action edge cannot have a branch');
    const branch = `${e.source}:${e.sourceHandle || ''}`;
    if (branches.has(branch)) throw new Error('Only one connection per output is allowed');
    branches.add(branch);
  }
  const active = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string) => { if (active.has(id)) throw new Error('Flow contains a cycle'); if (visited.has(id)) return; active.add(id); for (const e of flow.edges.filter(e => e.source === id)) visit(e.target); active.delete(id); visited.add(id); };
  visit(triggers[0].id);
  if (visited.size !== ids.size) throw new Error('Every node must be connected to the trigger');
  return { nodes: flow.nodes.map(n => ({ id: n.id, type: 'hawk', position: n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y) ? n.position : { x: 0, y: 0 }, data: { action: n.data.action, args: { ...n.data.args } } })), edges: flow.edges.map(e => ({ id: e.id, source: e.source, target: e.target, ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}) })) };
}
export function flowToScript(flow: CommandFlow): string {
  return ['flow {', ...flow.nodes.map(n => `  node ${JSON.stringify(n.id)} ${n.data.action} ${JSON.stringify(n.data.args)}`), ...flow.edges.map(e => `  connect ${JSON.stringify(e.source)} -> ${JSON.stringify(e.target)}${e.sourceHandle ? ` ${e.sourceHandle}` : ''}`), '}'].join('\n');
}
export function scriptToFlow(script: string): CommandFlow {
  if (script.length > 100_000) throw new Error('Script is too large');
  const lines = script.split(/\r?\n/).map(v => v.trim()).filter(v => v && !v.startsWith('//'));
  if (lines.shift() !== 'flow {' || lines.pop() !== '}') throw new Error('Invalid flow syntax');
  const nodes: FlowNode[] = []; const edges: FlowEdge[] = [];
  for (const line of lines) {
    const node = line.match(/^node "([\w-]{1,64})" (\w+) (\{.*\})$/);
    const edge = line.match(/^connect "([\w-]{1,64})" -> "([\w-]{1,64})"(?: (yes|no))?$/);
    if (node) nodes.push({ id: node[1], type: 'hawk', position: { x: (nodes.length % 3) * 250, y: Math.floor(nodes.length / 3) * 160 }, data: { action: node[2] as FlowAction, args: JSON.parse(node[3]) } });
    else if (edge) edges.push({ id: `edge-${edges.length}`, source: edge[1], target: edge[2], ...(edge[3] ? { sourceHandle: edge[3] } : {}) });
    else throw new Error(`Invalid syntax: ${line.slice(0, 80)}`);
  }
  return validateFlow({ nodes, edges });
}
