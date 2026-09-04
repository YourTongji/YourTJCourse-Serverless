export type SearchRuntimeState = {
  mode: 'worker-kv' | 'local-prebuilt' | 'fts-fallback'
  loaded: boolean
  usable: boolean
  generation: string | null
  requiredGeneration: string | null
  docCountShowIcu0: number
  docCountShowIcu1: number
  lastError: string | null
}

type ServiceRuntimeState = {
  shuttingDown: boolean
  search: SearchRuntimeState
}

const state: ServiceRuntimeState = {
  shuttingDown: false,
  search: {
    mode: 'worker-kv',
    loaded: true,
    usable: true,
    generation: null,
    requiredGeneration: null,
    docCountShowIcu0: 0,
    docCountShowIcu1: 0,
    lastError: null
  }
}

export function setShuttingDown(value: boolean) {
  state.shuttingDown = value
}

export function setSearchRuntimeState(value: Partial<SearchRuntimeState>) {
  state.search = { ...state.search, ...value }
}

export function getServiceRuntimeState(): ServiceRuntimeState {
  return {
    shuttingDown: state.shuttingDown,
    search: { ...state.search }
  }
}
