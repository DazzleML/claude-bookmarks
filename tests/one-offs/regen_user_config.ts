// Regenerate plugin.json's `userConfig` from core/settings.ts FIELDS (tests/core/settings.test.ts
// checks the two are equal). Run from the repository root:
//   node --experimental-strip-types tests/one-offs/regen_user_config.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { manifestUserConfig } from '../../plugin/hooks/core/settings.ts'

const path = 'plugin/.claude-plugin/plugin.json'
const manifest = JSON.parse(readFileSync(path, 'utf8'))
const before = Object.keys(manifest.userConfig ?? {}).length
manifest.userConfig = manifestUserConfig()
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
console.log(`userConfig: ${before} -> ${Object.keys(manifest.userConfig).length} fields`)
