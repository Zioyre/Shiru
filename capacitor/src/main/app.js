/* globals AndroidFullScreen, PictureInPicture */
import { LocalNotifications } from '@capacitor/local-notifications'
import { SystemBars, SystemBarType } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { Keyboard } from '@capacitor/keyboard'
import { NodeJS } from 'capacitor-nodejs'
import { App as Capacitor } from '@capacitor/app'

import Debugger from './debugger.js'
import Protocol from './protocol.js'
import Updater from './updater.js'
import Dialog from './dialog.js'

import { cache, caches } from '@/modules/cache.js'
import { IPC } from '../preload/preload.js'
import { loadingClient } from './util.js'

export default class App {
  protocol = new Protocol()
  debugger = new Debugger()
  updater = new Updater('RockinChaos', 'Shiru')
  dialog = new Dialog()

  ready = NodeJS.whenReady()

  kbLastScrollY = null
  kbHideTimeout = null
  kbScrollContainer = null

  canNotify = false
  handleNotify = false
  NOTIFICATION_FG_ID = 9001
  notifyTypes = [
    {
      id: 'view_anime',
      actions: [{ id: 'view_anime', title: 'View Anime' }]
    },
    {
      id: 'start_watching',
      actions: [{ id: 'watch_anime', title: 'Start Watching' }, { id: 'view_anime', title: 'View Anime' }]
    },
    {
      id: 'continue_watching',
      actions: [{ id: 'watch_anime', title: 'Resume' }, { id: 'view_anime', title: 'View Anime' }]
    },
    {
      id: 'watch_now',
      actions: [{ id: 'watch_anime', title: 'Watch' }, { id: 'view_anime', title: 'View Anime' }]
    },
    {
      id: 'update_app',
      actions: [{ id: 'update_now', title: 'Update Now' }, { id: 'whats_new', title: `What's New` }]
    }
  ]

  constructor() {
    this.updateOrientationInsets()
    screen.orientation.addEventListener('change', this.updateOrientationInsets)
    Capacitor.addListener('appStateChange', (state) => {
      if (state.isActive) this.updateOrientationInsets()
    })

    SystemBars.hide({ bar: SystemBarType.StatusBar })
    Keyboard.addListener('keyboardWillHide', () => SystemBars.hide({ bar: SystemBarType.StatusBar }))
    Capacitor.addListener('appStateChange', (state) => {
      if (state.isActive) SystemBars.hide({ bar: SystemBarType.StatusBar })
    })
    IPC.once('main-ready', async () => setTimeout(() => SplashScreen.hide({ fadeOutDuration: 200 }), 150).unref?.())

    IPC.on('portRequest', async () => {
      window.port = {
        onmessage: cb => {
          NodeJS.addListener('ipc', ({ args }) => cb(args[0]))
        },
        postMessage: (data, b) => {
          NodeJS.send({ eventName: 'ipc', args: [{ data }] })
        }
      }
      await this.ready
      await cache.isReady
      this.handleNotify = true
      NodeJS.send({ eventName: 'port-init', args: [] })
      let stethoscope = true
      NodeJS.addListener('webtorrent-heartbeat', () => {
        if (stethoscope) {
          stethoscope = false
          NodeJS.send({ eventName: 'main-heartbeat', args: [{ ...cache.getEntry(caches.GENERAL, 'settings'), userID: cache.cacheID }] })
          NodeJS.addListener('torrentRequest', () => {
            NodeJS.send({ eventName: 'torrentPort', args: [] })
            IPC.emit('port')
          })
          loadingClient.resolve()
        }
      })
    })
    IPC.on('webtorrent-reload', () => NodeJS.send({eventName: 'webtorrent-reload', args: []}))

    LocalNotifications.registerActionTypes({ types: this.notifyTypes })
    LocalNotifications.checkPermissions().then(value => {
      if (value?.display !== 'granted') {
        try {
          LocalNotifications.requestPermissions().then(() => this.canNotify = true)
        } catch (error) {
          console.debug(error)
        }
      } else this.canNotify = true
    })
    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      const url = ['watch_anime', 'update_now'].includes(notification.actionId) ? notification.notification.extra?.buttons?.[0]?.activation : notification.notification.extra?.buttons?.[notification.notification.extra?.buttons?.length - 1]?.activation
      if (url) {
        const checkInterval = setInterval(() => {
          if (this.handleNotify) {
            clearInterval(checkInterval)
            window.location.href = url
          }
        }, 50)
      }
    })
    IPC.on('notification', opts => {
      if (!this.canNotify) return
      LocalNotifications.schedule({
        notifications: [{
          smallIcon: 'ic_filled',
          largeIcon: opts.icon || opts.iconXL,
          sound: 'ic_notification.wav',
          iconColor: '#2F4F4F',
          id: this.NOTIFICATION_FG_ID++,
          title: opts.title,
          body: opts.message,
          actionTypeId: opts.button.length > 1 ? opts.button[0].text?.includes('Start') ? 'start_watching' : (opts.button[0].text?.includes('Continue') ? 'continue_watching' : (opts.button[0].text?.includes('Update') ? 'update_app' : 'watch_now')) : 'view_anime',
          attachments: [{ id: 'my_preview', url: opts.heroImg || opts.iconXL || opts.icon }],
          extra: { buttons: opts.button }
        }]
      })
    })

    IPC.on('quit-and-install', () => {
      if (this.updater.updateAvailable) this.updater.install(true)
    })
  }

  /** Updates navigation and notch inset variables based on screen orientation. */
  updateOrientationInsets() {
    document.documentElement.style.setProperty('--notch-inset-right', screen.orientation.type === 'landscape-primary' ? '0px' : 'env(safe-area-inset-right)')
    document.documentElement.style.setProperty('--navigation-inset-right', screen.orientation.type === 'landscape-secondary' ? '0px' : 'env(safe-area-inset-right)')
  }
}