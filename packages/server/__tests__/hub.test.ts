import {
  fanout,
  OPEN_READY_STATE,
  selectRevokedSockets,
  sweepLiveness,
  type HubSocket
} from '../src/hub';

function fakeSocket(overrides: Partial<HubSocket> = {}): HubSocket & { sent: string[]; pings: number } {
  const socket = {
    readyState: OPEN_READY_STATE,
    sent: [] as string[],
    pings: 0,
    send(payload: string) {
      this.sent.push(payload);
    },
    close() {},
    terminate() {},
    ping() {
      this.pings++;
    },
    ...overrides
  };
  return socket;
}

describe('WebSocket hub helpers', () => {
  it('isolates fanout failures and skips non-open sockets', () => {
    const throwing = fakeSocket({
      send() {
        throw new Error('gone');
      }
    });
    const closed = fakeSocket({ readyState: 3 });
    const healthy = fakeSocket();
    const failed: HubSocket[] = [];

    const delivered = fanout([throwing, closed, healthy], 'payload', (socket) => failed.push(socket));

    expect(delivered).toBe(1);
    expect(failed).toEqual([throwing]);
    expect(healthy.sent).toEqual(['payload']);
  });

  it('terminates missed peers and pings peers that answered', () => {
    const missed = fakeSocket();
    const responsive = fakeSocket();
    const terminated: HubSocket[] = [];
    const liveness = new Map<HubSocket, { alive: boolean }>([
      [missed, { alive: false }],
      [responsive, { alive: true }]
    ]);
    missed.terminate = () => terminated.push(missed);

    sweepLiveness(liveness, (socket) => {
      socket.terminate();
      liveness.delete(socket);
    }, () => {
      throw new Error('unexpected ping failure');
    });

    expect(terminated).toEqual([missed]);
    expect(liveness.has(missed)).toBe(false);
    expect(responsive.pings).toBe(1);
    expect(liveness.get(responsive)?.alive).toBe(false);
  });

  it('selects only sockets whose session ids are no longer live', () => {
    const live = fakeSocket();
    const revoked = fakeSocket();
    const receiver = fakeSocket();

    expect(
      selectRevokedSockets(
        [
          [live, { sid: 'live' }],
          [revoked, { sid: 'revoked' }],
          [receiver, {}]
        ],
        (sid) => sid === 'live'
      )
    ).toEqual([revoked]);
  });
});
