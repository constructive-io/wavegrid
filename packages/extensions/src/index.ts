export interface BrainPrincipal {
  sub: string;
  sid?: string;
  [claim: string]: unknown;
}

export interface BrainConnection {
  url: URL;
  request: { headers: Record<string, string | string[] | undefined> };
  principal: BrainPrincipal | null;
}

export interface BrainColor { h: number; s: number; b: number }
export type BrainMessage = Record<string, unknown>;
export interface BrainState extends BrainMessage { type: 'state'; grid: BrainColor[] }
export type BrainAudience = 'receiver' | 'operator';

export interface BrainProject<Store> { store: Store; project: string }

export interface BrainExtensionContext<Store> {
  getProject(): BrainProject<Store> | null;
  publish(audience: BrainAudience, payload: BrainMessage): void;
}

export interface BrainScope {
  onMessage?(message: BrainMessage): void;
  projectState?(state: BrainState): BrainState | undefined;
  onConnect?(): readonly BrainMessage[];
  revalidate?(): boolean;
}

export interface BrainExtensionHooks {
  authorize?(connection: BrainConnection): BrainScope | false | undefined;
  onOperatorMessage?(message: BrainMessage, connection: BrainConnection | null): boolean;
  projectState?(state: BrainState): BrainState;
  projectSocketState?(state: BrainState, connection: BrainConnection): BrainState;
  onConnect?(connection: BrainConnection): readonly BrainMessage[];
  compositeOutput?(frame: BrainColor[]): BrainColor[];
  beforeRevalidate?(): void;
  revalidate?(connection: BrainConnection): boolean;
}

export interface BrainExtension<Store> {
  id: string;
  setup(ctx: BrainExtensionContext<Store>): BrainExtensionHooks;
}

export interface BrainExtensionRegistration<Store> {
  extension: BrainExtension<Store>;
  enabled: boolean;
  requiresScope?(connection: BrainConnection): boolean;
}

export interface BrainPeer {
  connection: BrainConnection;
  scope?: BrainScope;
}

export function createBrainExtensionHost<Socket extends object, Store>(
  registrations: readonly BrainExtensionRegistration<Store>[],
  ctx: BrainExtensionContext<Store>
) {
  const ids = new Set<string>();
  const extensions = registrations.map(({ extension, enabled, requiresScope }) => {
    if (ids.has(extension.id)) throw new Error(`Duplicate brain extension: ${extension.id}`);
    ids.add(extension.id);
    return { requiresScope, hooks: enabled ? extension.setup(ctx) : undefined };
  });
  const peers = new WeakMap<Socket, BrainPeer>();

  return {
    authorize(connection: BrainConnection): BrainPeer | false {
      let scope: BrainScope | undefined;
      for (const { hooks, requiresScope } of extensions) {
        const result = hooks?.authorize?.(connection);
        if (result === false || (!result && requiresScope?.(connection)) || (result && scope)) return false;
        if (result) scope = result;
      }
      return { connection, scope };
    },
    attach(socket: Socket, peer: BrainPeer): void { peers.set(socket, peer); },
    principal(socket: Socket): BrainPrincipal | null { return peers.get(socket)?.connection.principal ?? null; },
    isScoped(socket: Socket): boolean { return peers.get(socket)?.scope !== undefined; },
    audience(socket: Socket): BrainAudience | undefined {
      const peer = peers.get(socket);
      return peer && !peer.scope ? peer.connection.principal ? 'operator' : 'receiver' : undefined;
    },
    scopedMessage(socket: Socket, message: BrainMessage): boolean {
      const scope = peers.get(socket)?.scope;
      if (!scope) return false;
      scope.onMessage?.(message);
      return true;
    },
    operatorMessage(message: BrainMessage, socket?: Socket): boolean {
      const peer = socket && peers.get(socket);
      if (socket && (!peer?.connection.principal || peer.scope)) return false;
      return extensions.some(({ hooks }) => hooks?.onOperatorMessage?.(message, peer?.connection ?? null) === true);
    },
    fullState(grid: BrainColor[]): BrainState {
      return extensions.reduce<BrainState>((state, { hooks }) => hooks?.projectState?.(state) ?? state, { type: 'state', grid });
    },
    stateFor(socket: Socket, fullState: BrainState, grid: BrainColor[]): BrainState | undefined {
      const peer = peers.get(socket);
      if (!peer) return undefined;
      if (peer.scope) return peer.scope.projectState?.({ type: 'state', grid });
      return extensions.reduce((state, { hooks }) => hooks?.projectSocketState?.(state, peer.connection) ?? state, fullState);
    },
    initialPayloads(socket: Socket): readonly BrainMessage[] {
      const peer = peers.get(socket);
      if (!peer) return [];
      if (peer.scope) return peer.scope.onConnect?.() ?? [];
      return extensions.flatMap(({ hooks }) => hooks?.onConnect?.(peer.connection) ?? []);
    },
    compositeOutput(frame: BrainColor[]): BrainColor[] {
      return extensions.reduce((grid, { hooks }) => hooks?.compositeOutput?.(grid) ?? grid, frame);
    },
    beforeRevalidate(): void {
      for (const { hooks } of extensions) hooks?.beforeRevalidate?.();
    },
    revalidate(socket: Socket): boolean {
      const peer = peers.get(socket);
      return !!peer && peer.scope?.revalidate?.() !== false &&
        extensions.every(({ hooks }) => hooks?.revalidate?.(peer.connection) !== false);
    }
  };
}
