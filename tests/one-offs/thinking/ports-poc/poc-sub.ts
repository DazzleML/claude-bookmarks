// POC C: register.tsx passes the sub-object $.ui (not $) into this file.
export function toastUi(ui: { toast: (text: string) => void }, text: string): void {
  ui.toast(text)
}
// POC D: register.tsx passes the method $.ui.toast as a value.
export function toastFn(toast: (text: string) => void, text: string): void {
  toast(text)
}
