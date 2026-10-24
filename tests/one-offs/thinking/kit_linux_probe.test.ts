// A probe, copied into a scratch plugin/tests/ by kit_linux_probe.sh, never into the repo's own
// plugin/tests/. It fails on purpose: the failure message prints the paths the plugin's file
// calls carried and the keys the harness's files map holds, so a Linux run shows where they part.
import { expect, test } from 'claude-code/testing'
import { DATA_ROOT, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-999999999999'

test('PROBE: the paths the plugin uses at a start, and the keys the harness holds', async ($, on) => {
  const w = world(on, { session: SID, files: { [`${DATA_ROOT}/sessions/${SID}.json`]: '{}' } })
  await ($ as unknown as { session: { start: (i: object) => Promise<unknown> } }).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 300))
  const fsCalls = w.calls.filter(c => c.event.startsWith('fs.')).map(c => `${c.event} ${JSON.stringify((c.input as { path?: unknown }).path)}`)
  const env = w.calls.filter(c => c.event === 'env.get').map(c => String((c.input as { name?: unknown }).name))
  expect({ keys: Object.keys(w.files), fsCalls: fsCalls.slice(0, 25), env: [...new Set(env)] }).toEqual({})
})
