import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(__dirname, '..')
const repoDir = path.resolve(frontendDir, '..')
const publicDir = path.join(frontendDir, 'public')
const simDir = path.join(publicDir, 'sim')
const wlcDir = path.join(publicDir, 'wlc')
const frontendEnvLocalPath = path.join(frontendDir, '.env.local')
const simBuildMetaPath = path.join(simDir, '.build-meta.json')

function run(cmd, args, cwd, extra = {}) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true, ...extra })
  if (res.error) throw res.error
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${res.status}`)
}

function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const entries = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim()
    entries[key] = value
  }

  return entries
}

function readSimBuildMeta() {
  if (!fs.existsSync(simBuildMetaPath)) return null

  try {
    return JSON.parse(fs.readFileSync(simBuildMetaPath, 'utf8'))
  } catch {
    return null
  }
}

function ensureSimAssets() {
  const schedulerDir = path.join(repoDir, 'scheduler')
  const localEnv = loadDotenv(frontendEnvLocalPath)
  const apiUrl = localEnv.VITE_API_URL || process.env.VITE_API_URL || ''
  const currentMeta = readSimBuildMeta()
  const hasIndex = fs.existsSync(path.join(simDir, 'index.html'))

  if (hasIndex && currentMeta?.VITE_API_URL === apiUrl) return

  run('npm', ['install'], schedulerDir)
  run('node', ['./node_modules/vite/bin/vite.js', 'build'], schedulerDir, {
    env: {
      ...process.env,
      ...localEnv,
      VITE_API_URL: apiUrl
    }
  })
  fs.mkdirSync(simDir, { recursive: true })
  fs.writeFileSync(simBuildMetaPath, JSON.stringify({ VITE_API_URL: apiUrl }, null, 2) + '\n')
}

function ensureWlcAssets() {
  if (fs.existsSync(path.join(wlcDir, 'index.html'))) return
  run('node', ['./scripts/build-wlc.mjs'], frontendDir)
}

fs.mkdirSync(publicDir, { recursive: true })
ensureSimAssets()
ensureWlcAssets()

console.log('[prepare-embedded-assets] embedded assets ready')
