import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

export type RuntimeTelemetry = {
  activeRequests: number
  lastEventLoop: {
    p50Ms: number
    p95Ms: number
    p99Ms: number
    maxMs: number
    utilization: number
  }
}

const histogram = monitorEventLoopDelay({ resolution: 20 })
let previousElu = performance.eventLoopUtilization()

const state: RuntimeTelemetry = {
  activeRequests: 0,
  lastEventLoop: {
    p50Ms: 0,
    p95Ms: 0,
    p99Ms: 0,
    maxMs: 0,
    utilization: 0
  }
}

function nsToMs(value: number) {
  return Number.isFinite(value) ? value / 1_000_000 : 0
}

export function incrementActiveRequests() {
  state.activeRequests += 1
}

export function decrementActiveRequests() {
  state.activeRequests = Math.max(0, state.activeRequests - 1)
}

export function getActiveRequests() {
  return state.activeRequests
}

export function getRuntimeTelemetry(): RuntimeTelemetry {
  return {
    activeRequests: state.activeRequests,
    lastEventLoop: { ...state.lastEventLoop }
  }
}

export function startRuntimeTelemetry() {
  histogram.enable()

  const timer = setInterval(() => {
    const nowElu = performance.eventLoopUtilization()
    const delta = performance.eventLoopUtilization(nowElu, previousElu)
    previousElu = nowElu

    state.lastEventLoop = {
      p50Ms: nsToMs(histogram.percentile(50)),
      p95Ms: nsToMs(histogram.percentile(95)),
      p99Ms: nsToMs(histogram.percentile(99)),
      maxMs: nsToMs(histogram.max),
      utilization: delta.utilization
    }

    const memory = process.memoryUsage()

    console.log(JSON.stringify({
      event: 'runtime_metrics',
      ts: new Date().toISOString(),
      activeRequests: state.activeRequests,
      eventLoopDelayP50Ms: state.lastEventLoop.p50Ms,
      eventLoopDelayP95Ms: state.lastEventLoop.p95Ms,
      eventLoopDelayP99Ms: state.lastEventLoop.p99Ms,
      eventLoopDelayMaxMs: state.lastEventLoop.maxMs,
      eventLoopUtilization: state.lastEventLoop.utilization,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external
    }))

    histogram.reset()
  }, 30_000)

  timer.unref()

  return () => {
    clearInterval(timer)
    histogram.disable()
  }
}
