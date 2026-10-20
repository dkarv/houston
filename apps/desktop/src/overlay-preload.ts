import { contextBridge, ipcRenderer } from 'electron';

/** For the overlay and the Stop bar: local pages shipped with the app. */
contextBridge.exposeInMainWorld('houstonOverlay', {
  onPointer: (listener: (move: { x: number; y: number }) => void) =>
    ipcRenderer.on('overlay:pointer', (_event, move) => listener(move)),
  onClick: (listener: (click: { x: number; y: number; b: number }) => void) =>
    ipcRenderer.on('overlay:click', (_event, click) => listener(click)),
  stop: () => ipcRenderer.send('control:stop-by-user'),
});
