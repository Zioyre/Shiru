const noopVoid = () => {}
const noopAsyncVoid = async () => {}
const noopAsyncBool = async () => false
const noopAsyncString = async () => ''
const commonDefaults = {
  getAppVersion: noopAsyncString,
  getPlatformInfo: () => ({ platform: '', arch: '', session: '' }),
  openURI: noopAsyncVoid,
  linkAccount: noopAsyncVoid
}
const androidDefaults = {
  requestFileAccess: noopAsyncBool,
  launchExternal: noopAsyncVoid
}
const electronDefaults = {
  exit: noopVoid,
  setDoH: noopVoid,
  getAngle: async () => 'default',
  setAngle: noopVoid,
  isMinimized: noopAsyncBool,
  isFullScreen: noopAsyncBool,
  onMinimize: noopVoid,
  onFullScreen: noopVoid,
  hideWindow: noopVoid,
  showAndFocus: noopVoid,
  onExitIntent: noopVoid,
  openTorrentDevTools: noopVoid,
  openDevTools: noopVoid,
  setUnreadCount: noopVoid,
  setDiscordRPC: noopVoid,
  setPresence: noopVoid,
  clearPresence: noopVoid,
  handleProtocol: noopVoid,
  getYouTube: async () => 'https://www.youtube-nocookie.com'
}

export const IPC = window.IPC
export const COMMON = window.common || commonDefaults
export const ANDROID = window.android || androidDefaults
export const ELECTRON = window.electron || electronDefaults