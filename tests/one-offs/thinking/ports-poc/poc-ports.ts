// POC A: an object of closures built in register.tsx (each one calls $ there), handed to a
// class in this file. The class never sees $.
export type Ports = {
  toast: (text: string) => void
  storeSet: (key: string, value: unknown) => Promise<void>
  storeGet: (key: string) => Promise<unknown>
  log: (line: string) => void
}

export class PocCommand {
  constructor(private readonly ports: Ports) {}
  async run(arg: string): Promise<void> {
    const before = await this.ports.storeGet('poc:count')
    const n = typeof before === 'number' ? before + 1 : 1
    await this.ports.storeSet('poc:count', n)
    this.ports.toast(`poc ${arg}: ${n}`)
    this.ports.log(`[poc] ports ran ${n} times`)
  }
}
