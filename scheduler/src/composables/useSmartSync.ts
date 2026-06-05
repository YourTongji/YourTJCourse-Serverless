import { Modal } from 'ant-design-vue'
import { createVNode } from 'vue'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { useStore } from 'vuex'
import { getLatestUpdateTime } from '../services/api'
import { isUpToDate } from '../utils/misc'
import { errorNotify, successNotify } from '../utils/notify'

export function useSmartSync() {
  const store = useStore()

  /**
   * Check for data updates and trigger smart sync if outdated.
   * Called on app mount — does not show loading for empty courses.
   */
  async function checkAndSync(calendarId: number): Promise<void> {
    store.commit('loadSolidifyTime')
    const latestTime = await getLatestUpdateTime()
    store.commit('setLatestUpdateTime', latestTime)

    if (store.state.updateTime === '') {
      store.commit('syncLatestData')
      return
    }

    if (isUpToDate(store.state.updateTime, latestTime)) {
      store.commit('setDataOutdated', false)
      return
    }

    store.commit('setDataOutdated', true)
    // Show the sync button in header — user can click to sync manually
  }

  return { checkAndSync }
}
