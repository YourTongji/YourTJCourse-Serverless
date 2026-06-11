import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(__dirname, '..')
const repoDir = path.resolve(frontendDir, '..')
const wlcDir = path.join(repoDir, 'wlc')
const wlcDistDir = path.join(wlcDir, '.vitepress', 'dist')
const destDir = path.join(frontendDir, 'public', 'wlc')

const npmCmd = 'npm'

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true })
  if (res.error) throw res.error
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${res.status}`)
}

if (!fs.existsSync(wlcDir)) {
  console.error(`[build:wlc] Missing docs source dir: ${wlcDir}`)
  process.exit(1)
}

run(npmCmd, ['install'], wlcDir)
run(npmCmd, ['run', 'build'], wlcDir)

if (!fs.existsSync(wlcDistDir)) {
  console.error(`[build:wlc] Missing build output dir: ${wlcDistDir}`)
  process.exit(1)
}

fs.rmSync(destDir, { recursive: true, force: true })
fs.mkdirSync(destDir, { recursive: true })
fs.cpSync(wlcDistDir, destDir, { recursive: true })

function patchHtmlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      patchHtmlFiles(full)
      continue
    }
    if (!e.isFile() || !e.name.endsWith('.html')) continue

    const raw = fs.readFileSync(full, 'utf8')
    // VitePress default theme preloads Inter font. Under throttled networks this can delay CSS/JS downloads and hurt FCP/LCP.
    // Inter is still loaded on-demand (font-display: swap), so removing the preload improves performance without breaking layout.
    const next = raw.replace(/\s*<link\s+rel="preload"[^>]+inter-[^\s"']+\.woff2"[^>]*>\s*/gi, '\n')
    if (next !== raw) fs.writeFileSync(full, next, 'utf8')
  }
}

patchHtmlFiles(destDir)

console.log(`[build:wlc] Copied ${wlcDistDir} -> ${destDir}`)
