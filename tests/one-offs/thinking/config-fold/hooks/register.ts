// Proof-of-concept: the /config fold. One row ("fold") hides this plugin's other rows
// through a config.describe hook while it reads "hidden", and calls
// $.ui.invalidate("config.describe") when it changes so the menu can redraw. A second row
// ("foldNoInvalidate") does the same hiding WITHOUT the invalidate: the control arm,
// predicted to leave the rows visible (the describe answers are cached until invalidate
// or a reload -- typings 4380-4384).
//
// /bmfold-rows logs the rows $.config.list() returns now (hidden rows are left out), so
// arm (a) can be read from the log; arm (b), whether the OPEN menu repaints, is a look.
// Throwaway: tests/one-offs/thinking/config-fold; never part of the shipped plugin.
import type { Register } from 'claude-code'

let fold = 'shown'
let control = 'shown'

export const register: Register = (on, options) => {
  fold = String(options.fold ?? 'shown')
  control = String(options.foldNoInvalidate ?? 'shown')

  // The three test rows are hidden while either fold row says so.
  on('config.describe', { key: /^bmfoldpoc\.row[ABC]$/ }, async (_$, e, next) => {
    const r = await next(e)
    return { ...r, isHidden: fold === 'hidden' || control === 'hidden' }
  })

  // The real candidate: remember the value, then drop the describe cache.
  on('config.set', { key: 'bmfoldpoc.fold' }, async ($, e, next) => {
    const r = await next(e)
    if (!r.deny) {
      fold = String(r.value)
      await $.ui.invalidate('config.describe')
      $.ui.log(`bmfoldpoc: fold=${fold}, describe cache invalidated`)
    }
    return r
  })

  // The control: remember the value, do NOT invalidate.
  on('config.set', { key: 'bmfoldpoc.foldNoInvalidate' }, async ($, e, next) => {
    const r = await next(e)
    if (!r.deny) {
      control = String(r.value)
      $.ui.log(`bmfoldpoc: control=${control}, cache NOT invalidated (control arm)`)
    }
    return r
  })

  on('session.start', async $ => {
    await $.command.register({ name: 'bmfold-rows', description: 'Fold POC: log which of this plugin\'s /config rows would be drawn now', immediate: true })
  })

  on('command.run', { command: 'bmfold-rows' }, async $ => {
    const rows = await $.config.list()
    const mine = rows.filter(r => r.key.startsWith('bmfoldpoc.')).map(r => r.key.slice('bmfoldpoc.'.length))
    $.ui.log(`bmfoldpoc rows drawn now: [${mine.join(' ')}]  (fold=${fold}, control=${control})`)
    return {}
  })
}
