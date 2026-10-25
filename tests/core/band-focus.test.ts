// The band records where its own focus moves put the ring (handlers/band.ts focusBand; input
// routing, 2026-10-25). A plugin's own $.ui.focus is not reported to its own ui.focus hook, so
// without this the ring read as the command field and the first arrow off the band's field
// moved the ring instead of stepping (djdarcy, 07:40:53: "when I hit up first it navigates the
// band rather than the panel"). The kit does not route a plugin's own focus, so the handler is
// driven here with stand-in ports. Run: node --test tests/core/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { focusBand } from '../../plugin/hooks/handlers/band.ts'
import { BandState } from '../../plugin/hooks/core/band/band-state.ts'

function portsWith(answer: { deny?: string } | object) {
  const band = new BandState()
  band.drawn('band-1')
  band.ringMoved('band-cmd-3') // the person's leader put the ring on the command field
  const ports = { band, focus: async () => answer, log: () => undefined } as unknown as Parameters<typeof focusBand>[0]
  return { band, ports }
}

test('a focus move the engine grants is recorded as the ring', async () => {
  const { band, ports } = portsWith({})
  assert.equal(await focusBand(ports, 'band-num-field-4'), undefined)
  assert.equal(band.ring, 'band-num-field-4')
})

test('a refused focus move leaves the ring where it was', async () => {
  const { band, ports } = portsWith({ deny: 'that site does not hold the keyboard' })
  assert.equal(await focusBand(ports, 'band-num-field-4'), 'that site does not hold the keyboard')
  assert.equal(band.ring, 'band-cmd-3')
})
