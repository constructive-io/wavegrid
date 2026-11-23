import { type BrainConnection, type BrainExtensionRegistration, createBrainExtensionHost } from '@wavegrid/extensions';

test('dispatches a configured extension without exposing full state or commands to scoped sockets', () => {
  const store = { active: true };
  const publish = jest.fn();
  const grid = [{ h: 0, s: 0, b: 0 }, { h: 200, s: 80, b: 10 }];
  const setup: BrainExtensionRegistration<typeof store>['extension']['setup'] = ctx => ({
    authorize(connection) {
      if (!connection.url.searchParams.has('preview')) return;
      if (connection.principal?.sub !== 'previewer') return false;
      return {
        onMessage: message => {
          if (message.type === 'sample') ctx.publish('operator', { type: 'sampled' });
        },
        projectState: state => ({ ...state, grid: state.grid.slice(1) }),
        onConnect: () => [{ type: 'preview_layout' }],
        revalidate: () => ctx.getProject()?.store.active === true
      };
    },
    onOperatorMessage: (message, connection) => message.type === 'reset' && connection?.principal?.sub === 'operator',
    projectState: state => ({ ...state, extra: true }),
    projectSocketState: (state, connection) => ({ ...state, operator: connection.principal?.sub }),
    onConnect: ({ principal }) => principal ? [] : [{ type: 'receiver_config' }],
    compositeOutput: frame => frame.map(cell => ({ ...cell, b: cell.b + 1 }))
  });
  const extension = { id: 'preview', setup: jest.fn(setup) };
  const registration = {
    extension, enabled: true,
    requiresScope: (connection: BrainConnection) => connection.url.searchParams.has('preview')
  };
  const ctx = { publish, getProject: () => ({ store, project: 'demo' }) };
  const connection = (sub?: string, query = ''): BrainConnection => ({
    principal: sub ? { sub } : null, url: new URL(`http://localhost/${query}`), request: { headers: {} }
  });
  const disabled = createBrainExtensionHost([{ ...registration, enabled: false }], ctx);
  expect(disabled.authorize(connection('previewer', '?preview'))).toBe(false);
  expect(extension.setup).not.toHaveBeenCalled();

  const host = createBrainExtensionHost([registration], ctx);
  const attach = (client: BrainConnection) => {
    const peer = host.authorize(client);
    if (!peer) throw new Error('Expected a connection');
    const socket = {};
    host.attach(socket, peer);
    return socket;
  };
  expect(host.authorize(connection('operator', '?preview'))).toBe(false);
  const scoped = attach(connection('previewer', '?preview'));
  const operator = attach(connection('operator'));
  const receiver = attach(connection());
  const output = host.compositeOutput(grid);
  expect(output.map(cell => cell.b)).toEqual([1, 11]);
  const state = host.fullState(output);
  expect(host.stateFor(scoped, state, output)).toEqual({ type: 'state', grid: [output[1]] });
  expect(host.stateFor(operator, state, output)).toEqual({ ...state, operator: 'operator' });
  expect(host.initialPayloads(scoped)).toEqual([{ type: 'preview_layout' }]);
  expect(host.initialPayloads(receiver)).toEqual([{ type: 'receiver_config' }]);
  expect(host.scopedMessage(scoped, { type: 'reset' })).toBe(true);
  expect(host.scopedMessage(scoped, { type: 'sample' })).toBe(true);
  expect(publish.mock.calls).toEqual([['operator', { type: 'sampled' }]]);
  expect(host.operatorMessage({ type: 'reset' }, scoped)).toBe(false);
  expect(host.operatorMessage({ type: 'reset' }, receiver)).toBe(false);
  expect(host.operatorMessage({ type: 'reset' }, operator)).toBe(true);
  expect(host.revalidate(scoped)).toBe(true);
  store.active = false;
  expect(host.revalidate(scoped)).toBe(false);
  expect(host.revalidate(operator)).toBe(true);
});
