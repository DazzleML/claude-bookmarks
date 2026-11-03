// D1: the live four-session case through the shipped membershipOf / listsFolderOf / layoutFor.
import { membershipOf, listsFolderOf } from '../../../../plugin/hooks/core/projects/placement.ts'
import { layoutFor } from '../../../../plugin/hooks/core/lists/layout.ts'
import { fnv1a64 } from '../../../../plugin/hooks/core/bookmarks/migrations.ts'

const P = (id, root, n) => ({ version: 1, id, root, members: [], linked: false, n, updated_at: '2026-11-03T14:00:00Z' })
const placements = [
  P('eqtp5tl4', 'C:/code/claude-projects/claude-bookmarks', 1),
  P('dcpdcpdc', 'C:/code/claude-projects/dazzle-claude-plugins', 2),
  P('dzlbdzlb', 'C:/code/dazzle-lib', 3),
]
const names = new Map([['eqtp5tl4', 'claude-bookmarks'], ['dcpdcpdc', 'dazzle-claude-plugins'], ['dzlbdzlb', 'dazzle-lib']])
const folders = ['claude-bookmarks__eqtp5tl4__Extreme', 'dazzle-claude-plugins__dcpdcpdc__Extreme', 'dazzle-lib__dzlbdzlb__Extreme']
const sessions = {
  'director (dazzle-claude-plugins)': 'C:/code/claude-projects/dazzle-claude-plugins',
  'lead worker (repo root)': 'C:/code/claude-projects/claude-bookmarks',
  'oracle (private/claude)': 'C:/code/claude-projects/claude-bookmarks/private/claude',
  'dazzle-lib session': 'C:/code/dazzle-lib',
}
for (const [who, cwd] of Object.entries(sessions)) {
  const m = membershipOf(cwd, placements)
  const a = layoutFor({ dataRoot: 'R', cwdReal: cwd, user: 'Extreme', placements, names, folders, hash: fnv1a64 })
  const l = a.kind === 'found' ? a.layout : undefined
  console.log(`${who}\n   HOME: ${m ? `${names.get(m.id)} (${m.id}) via ${m.via}` : 'own project'}\n   lists file: ${l?.listsPath}\n   bundle set: ${l?.bundlesDir}`)
}
