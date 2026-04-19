import { registerPlugin } from '@capacitor/core'

const FileManagerPlugin = registerPlugin('FileManager')
export const FileManager = {
  hasAllFilesAccess: async () => (await FileManagerPlugin.hasAllFilesAccess()).granted,
  requestAllFilesAccess: () => FileManagerPlugin.requestAllFilesAccess(),
  pickFolder: async () => (await FileManagerPlugin.pickFolder()).path
}