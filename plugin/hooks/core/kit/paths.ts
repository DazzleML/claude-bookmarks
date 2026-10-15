// The folders the plugin works in, from the environment's values (read in register.tsx,
// where the validator follows `$.env.get`). Forward slashes throughout, so a path built
// here reads the same on Windows and elsewhere.

/** A path with forward slashes. */
export const forwardSlashes = (p: string): string => p.replace(/\\/g, '/')

/** Claude Code's config folder: `CLAUDE_CONFIG_DIR`, else `<home>/.claude`. */
export function configDirOf(claudeConfigDir: string | undefined, home: string | undefined): string | undefined {
  return claudeConfigDir ?? (home ? `${forwardSlashes(home)}/.claude` : undefined)
}

/** The data root, where the plugin keeps what is the person's: `CLAUDE_USER_DIR`, else `<home>/claude`; never under `~/.claude`, which is Claude Code's to clean (#6). No trailing slash. */
export function dataRootOf(userDir: string | undefined, home: string | undefined): string | undefined {
  if (userDir) return forwardSlashes(userDir).replace(/\/+$/, '')
  return home ? `${forwardSlashes(home)}/claude` : undefined
}
