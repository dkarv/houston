import { randomBytes } from 'node:crypto';
import { Message, type MessageBus, sessionBus, Variant } from 'dbus-next';
import type { ControlEvent } from '@houston/protocol';
import type { InputBackend } from './input';
import { evdevButtons, keysym } from './keys';

/**
 * Wayland doesn't let apps synthesize input. The XDG RemoteDesktop portal does, after the
 * person agrees in a system dialog. We combine it with a ScreenCast source, which gives
 * the stream whose coordinates absolute pointer motion uses.
 */

const DESTINATION = 'org.freedesktop.portal.Desktop';
const PATH = '/org/freedesktop/portal/desktop';
const REMOTE_DESKTOP = 'org.freedesktop.portal.RemoteDesktop';
const SCREEN_CAST = 'org.freedesktop.portal.ScreenCast';
const KEYBOARD = 1;
const POINTER = 2;
const MONITOR = 1;
/** Pixels of browser wheel delta per discrete wheel step. */
const PIXELS_PER_STEP = 40;

type Results = Record<string, Variant>;

export class PortalDeclined extends Error {}

function token() {
  return `houston_${randomBytes(6).toString('hex')}`;
}

/** dbus-next sets the unique name after the Hello call; its types don't declare it. */
function uniqueName(bus: MessageBus): string | null {
  return (bus as MessageBus & { name: string | null }).name;
}

async function connect(): Promise<MessageBus> {
  const bus = sessionBus();
  if (!uniqueName(bus)) await new Promise<void>((resolve) => bus.once('connect', () => resolve()));
  return bus;
}

function call(bus: MessageBus, iface: string, member: string, signature: string, body: unknown[]) {
  return bus.call(
    new Message({
      destination: DESTINATION,
      path: PATH,
      interface: iface,
      member,
      signature,
      body,
    }),
  );
}

/** Portal requests answer asynchronously with a Response signal on a request object. */
async function request(
  bus: MessageBus,
  iface: string,
  member: string,
  signature: string,
  body: unknown[],
  options: Record<string, Variant>,
): Promise<Results> {
  const handle = token();
  const sender = uniqueName(bus)!.slice(1).replace(/\./g, '_');
  const path = `${PATH}/request/${sender}/${handle}`;
  const response = new Promise<Results>((resolve, reject) => {
    const onMessage = (message: Message) => {
      if (message.path !== path || message.member !== 'Response') return;
      bus.off('message', onMessage);
      const [code, results] = message.body as [number, Results];
      if (code === 0) resolve(results);
      else reject(new PortalDeclined(`${member} ended with code ${code}`));
    };
    bus.on('message', onMessage);
  });
  await call(bus, iface, member, signature, [
    ...body,
    { ...options, handle_token: new Variant('s', handle) },
  ]);
  return response;
}

export async function portalSupported(): Promise<boolean> {
  if (process.platform !== 'linux') return false;
  try {
    const bus = await connect();
    const reply = await bus.call(
      new Message({
        destination: DESTINATION,
        path: PATH,
        interface: 'org.freedesktop.DBus.Properties',
        member: 'Get',
        signature: 'ss',
        body: [REMOTE_DESKTOP, 'AvailableDeviceTypes'],
      }),
    );
    bus.disconnect();
    const types = (reply?.body[0] as Variant).value as number;
    return (types & (KEYBOARD | POINTER)) === (KEYBOARD | POINTER);
  } catch {
    return false;
  }
}

/** Opens a portal session; the system asks the person first. Rejects if they decline. */
export async function portalBackend(): Promise<InputBackend> {
  const bus = await connect();
  await bus.call(
    new Message({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'AddMatch',
      signature: 's',
      body: ["type='signal',interface='org.freedesktop.portal.Request',member='Response'"],
    }),
  );

  try {
    const created = await request(bus, REMOTE_DESKTOP, 'CreateSession', 'a{sv}', [], {
      session_handle_token: new Variant('s', token()),
    });
    const session = created.session_handle!.value as string;
    await request(bus, REMOTE_DESKTOP, 'SelectDevices', 'oa{sv}', [session], {
      types: new Variant('u', KEYBOARD | POINTER),
    });
    await request(bus, SCREEN_CAST, 'SelectSources', 'oa{sv}', [session], {
      types: new Variant('u', MONITOR),
      multiple: new Variant('b', false),
    });
    const started = await request(bus, REMOTE_DESKTOP, 'Start', 'osa{sv}', [session, ''], {});

    const streams = (started.streams?.value ?? []) as Array<[number, Record<string, Variant>]>;
    const [stream] = streams;
    if (!stream) throw new PortalDeclined('No screen selected');
    const [node, properties] = stream;
    const [width, height] = (properties.size?.value ?? [1920, 1080]) as [number, number];

    const notify = (member: string, signature: string, ...args: unknown[]) =>
      void call(bus, REMOTE_DESKTOP, member, signature, [session, {}, ...args]).catch(() => {});
    const pressedKeys = new Set<number>();
    const pressedButtons = new Set<number>();
    const move = (x: number, y: number) =>
      notify('NotifyPointerMotionAbsolute', 'oa{sv}udd', node, x * width, y * height);
    const key = (sym: number, down: boolean) => {
      notify('NotifyKeyboardKeysym', 'oa{sv}iu', sym, down ? 1 : 0);
      if (down) pressedKeys.add(sym);
      else pressedKeys.delete(sym);
    };

    return {
      move,
      handle(event: ControlEvent) {
        switch (event.t) {
          case 'down':
          case 'up': {
            move(event.x, event.y);
            const button = evdevButtons[event.b];
            notify('NotifyPointerButton', 'oa{sv}iu', button, event.t === 'down' ? 1 : 0);
            if (event.t === 'down') pressedButtons.add(button);
            else pressedButtons.delete(button);
            break;
          }
          case 'wheel': {
            move(event.x, event.y);
            const steps = (delta: number) =>
              delta === 0
                ? 0
                : Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / PIXELS_PER_STEP));
            // Axis 0 is vertical, 1 horizontal; positive scrolls down/right like browsers.
            if (event.dy) notify('NotifyPointerAxisDiscrete', 'oa{sv}ui', 0, steps(event.dy));
            if (event.dx) notify('NotifyPointerAxisDiscrete', 'oa{sv}ui', 1, steps(event.dx));
            break;
          }
          case 'key': {
            const sym = keysym(event.key);
            if (sym !== null) key(sym, event.down);
            break;
          }
          case 'text':
            for (const char of event.text) {
              const sym = keysym(char);
              if (sym === null) continue;
              key(sym, true);
              key(sym, false);
            }
            break;
        }
      },
      close() {
        for (const sym of pressedKeys) key(sym, false);
        for (const button of pressedButtons) {
          notify('NotifyPointerButton', 'oa{sv}iu', button, 0);
        }
        void bus
          .call(
            new Message({
              destination: DESTINATION,
              path: session,
              interface: 'org.freedesktop.portal.Session',
              member: 'Close',
            }),
          )
          .catch(() => {})
          .finally(() => bus.disconnect());
      },
    };
  } catch (error) {
    bus.disconnect();
    throw error;
  }
}
