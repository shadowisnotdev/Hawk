import test from 'node:test';
import assert from 'node:assert/strict';
const load = () => import('../src/core/commands/customCommandFlow.js');
const flow = { nodes: [{ id: 'start', position: { x: 0, y: 0 }, data: { action: 'trigger', args: {} } }, { id: 'reply', position: { x: 250, y: 0 }, data: { action: 'reply', args: { text: 'Hello {user}' } } }], edges: [{ id: 'e', source: 'start', target: 'reply' }] };
test('flow and safe command script round-trip all actions and connections', async () => {
  const { validateFlow, flowToScript, scriptToFlow } = await load();
  const parsed = validateFlow(scriptToFlow(flowToScript(validateFlow(flow))));
  assert.deepEqual(parsed.nodes.map(n => n.data), flow.nodes.map(n => n.data));
  assert.equal(parsed.edges[0].target, 'reply');
});
test('command validation rejects cycles, dangling edges, unknown actions and excessive waits', async () => {
  const { validateFlow } = await load();
  assert.throws(() => validateFlow({ ...flow, edges: [...flow.edges, { id: 'back', source: 'reply', target: 'start' }] }), /cycle|trigger/i);
  assert.throws(() => validateFlow({ ...flow, edges: [{ id: 'e', source: 'start', target: 'missing' }] }), /edge/i);
  assert.throws(() => validateFlow({ ...flow, nodes: [...flow.nodes, { id: 'bad', data: { action: 'eval', args: {} } }] }), /action/i);
  assert.throws(() => validateFlow({ ...flow, nodes: [flow.nodes[0], { ...flow.nodes[1], data: { action: 'wait', args: { ms: 999999 } } }] }), /wait/i);
});
test('script parser treats JavaScript and prototype keys as invalid input', async () => {
  const { scriptToFlow } = await load();
  assert.throws(() => scriptToFlow('process.exit(1)'), /syntax/i);
  assert.throws(() => scriptToFlow('flow {\nnode "start" trigger {"__proto__":{}}\n}'), /key/i);
});
