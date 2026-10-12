// POC B: pass by reference -- register.tsx hands $ itself to this file once (setEngine),
// and the file calls $.ui.toast through the stored reference.
let engine: { ui: { toast: (text: string) => void } } | undefined
export function setEngine(e: { ui: { toast: (text: string) => void } }): void {
  engine = e
}
export function toastViaRef(text: string): void {
  engine?.ui.toast(text)
}
