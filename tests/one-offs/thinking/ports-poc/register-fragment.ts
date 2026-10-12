// POC A2's factory: the engine primitives a sub-file may need, each a closure over $.
function portsOf($: EngineInterface): Ports {
  return {
    toast: text => $.ui.toast(text),
    storeSet: (key, value) => $.store.set(key, value),
    storeGet: key => $.store.get(key),
    log: line => log($, line),
  }
}
