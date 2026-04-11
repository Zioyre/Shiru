import { createDeferred } from '@/modules/util.js'

export const development = process.env.NODE_ENV?.trim() === 'development'
export const loadingClient = createDeferred()
