import { contextBridge, ipcRenderer } from 'electron';

/**
 * The bridge the Houston web app uses for remote control (see HoustonDesktopBridge in
 * apps/app). Only exposed to pages from servers the person trusted; the main process
 * checks the origin of every call again.
 */
if (ipcRenderer.sendSync('bridge:trusted') === true) {
  const subscribe = (channel: string, listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on(channel, handler);
    return () => void ipcRenderer.off(channel, handler);
  };

  contextBridge.exposeInMainWorld('houstonDesktop', {
    version: ipcRenderer.sendSync('bridge:version') as string,
    platform: process.platform,
    controlMode: () => ipcRenderer.sendSync('control:mode') as string,
    onControlModeChange: (listener: () => void) => subscribe('control:mode-changed', listener),
    startControl: async (mode: string) => {
      const result = (await ipcRenderer.invoke('control:start', mode)) as
        'started' | 'declined' | 'failed';
      if (result !== 'started') throw new Error(result);
    },
    stopControl: () => ipcRenderer.send('control:stop'),
    onControlStopped: (listener: () => void) => subscribe('control:stopped', listener),
    input: (event: unknown) => ipcRenderer.send('control:input', event),
    pointer: (move: unknown) => ipcRenderer.send('control:pointer', move),
  });
}
