export type Viewer = {
  id: string
  name: string
  avatar: null
  picture: null
}

export type MediaListEntry = {
  media: any
  progress: number
  score: number
  status: string
  repeat: number
  updatedAt: number
}

export type MediaList = {
  status: string
  entries: MediaListEntry[]
}

export type MediaListCollection = {
  lists: MediaList[]
}

export type Query<T> = {
  data?: T
  errors?: any[]
}
