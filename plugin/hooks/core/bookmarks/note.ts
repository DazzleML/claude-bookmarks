// The Markdown export as an Obsidian note (unit 9 of the record-format goal; the 2026-10-16
// assessments: "The Markdown", and the second review's point 6, the ingest guard). The JSON
// register is complete; the note is a projection of it with a declared write-back set --
// `label`, `why`, `tags` -- owned by the message's PRIMARY record. A person edits those three
// in Obsidian; the next time the plugin writes the note it reads them back first (ingest
// before regenerate) and applies what changed as a relabel operation, so the register stays
// the one source and the note never silently wins or silently loses.
//
// Write-back is detected against `md.base` on the record: the values the note was last
// generated from. A field equal to its base was not edited (the register's value, which
// may have moved since, wins); a field that differs was. Three guards keep an old or odd
// note from being read as an edit: a note is adopted only when its `bm-writer` is at or
// above NOTE_WRITER_FLOOR (older builds wrote `tags` as one comma string and kept no base);
// a field ABSENT from the note is never adopted (an old build regenerating the note without
// a property is not a deletion); the derived `bm/*` tags are stripped before comparing.
//
// Pure: no I/O. The handler (handlers/bookmarks.ts writeExport) reads the note, calls
// `ingest`, commits the relabel, writes the note and then commits the new base.

import { ownerOf, tierOf, type AnchorOwner, type AnchorRecord } from './anchor.ts'
import { admits } from './tiers.ts'

/** The fields a person may change in the note; everything else in the front matter is the register's. */
export const WRITE_BACK = ['label', 'why', 'tags'] as const

/** What the note was last generated from, per write-back field; kept on the record as `md.base`. */
export type NoteBase = { label?: string; why?: string; tags?: string[] }

/**
 * The first writer whose notes may be read back: 0.5.9 is the build that made the note an
 * Obsidian note (tags and aliases as lists, a base kept). A note whose `bm-writer` is older,
 * or missing, is regenerated and never adopted.
 */
export const NOTE_WRITER_FLOOR = '0.5.9'

/** Tags the writer derives from the records (`bm/tier/perma`, `bm/owner/user`); never a person's, stripped on read. */
export const DERIVED_TAG_PREFIX = 'bm/'

/** The version in a `bm-writer` value (`claude-bookmarks 0.5.9` -> [0, 5, 9]); undefined when it carries none. */
export function writerVersion(bmWriter: unknown): [number, number, number] | undefined {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(typeof bmWriter === 'string' ? bmWriter : '')
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined
}

export function atOrAbove(v: [number, number, number], floor: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) if (v[i] !== floor[i]) return v[i]! > floor[i]!
  return true
}

/** A message's records that the note describes: every list's record on it, a letter's (tier `mark`) left out. */
export function noteRecords(records: readonly AnchorRecord[]): AnchorRecord[] {
  return records.filter(r => tierOf(r) !== 'mark')
}

/**
 * The record that owns the note's writable fields: the person's warmest record on the message,
 * else Claude's warmest, else any other owner's; among equals the earliest. Undefined when the
 * message has only marks.
 */
export function primaryRecord(records: readonly AnchorRecord[]): AnchorRecord | undefined {
  const rank = (o: AnchorOwner) => (o === 'user' ? 0 : o === 'claude' ? 1 : 2)
  return noteRecords(records).reduce<AnchorRecord | undefined>((best, r) => {
    if (!best) return r
    const ob = rank(ownerOf(best)), or = rank(ownerOf(r))
    if (or !== ob) return or < ob ? r : best
    const tb = tierOf(best), tr = tierOf(r)
    if (tb !== tr) return admits(tr, tb) ? r : best
    return r.createdAt < best.createdAt ? r : best
  }, undefined)
}

/** The other records' labels, as the note's `aliases`: Obsidian finds the note under each. */
export function aliasesOf(primary: AnchorRecord, records: readonly AnchorRecord[]): string[] {
  const out: string[] = []
  for (const r of noteRecords(records)) {
    if (r === primary || (r.uuid === primary.uuid && ownerOf(r) === ownerOf(primary))) continue
    if (r.label && r.label !== primary.label && !out.includes(r.label)) out.push(r.label)
  }
  return out
}

/** The note's `tags`: the primary's own, then one `bm/tier/*` and one `bm/owner/*` per record on the message, the primary's first. */
export function noteTags(primary: AnchorRecord, records: readonly AnchorRecord[]): string[] {
  const out = [...userTags(primary.tags ?? [])]
  const all = [primary, ...noteRecords(records).filter(r => r !== primary)]
  const add = (t: string) => { if (!out.includes(t)) out.push(t) }
  for (const r of all) add(`${DERIVED_TAG_PREFIX}tier/${tierOf(r)}`)
  for (const r of all) add(`${DERIVED_TAG_PREFIX}owner/${ownerOf(r)}`)
  return out
}

/** The lists the note is on, the primary's first. */
export function noteOwners(primary: AnchorRecord, records: readonly AnchorRecord[]): AnchorOwner[] {
  const out: AnchorOwner[] = [ownerOf(primary)]
  for (const r of noteRecords(records)) if (!out.includes(ownerOf(r))) out.push(ownerOf(r))
  return out
}

/** A person's tags: the derived `bm/*` ones removed. */
export function userTags(tags: readonly string[]): string[] {
  return tags.filter(t => !t.startsWith(DERIVED_TAG_PREFIX))
}

/** The base a note written from `record` leaves behind. */
export function baseOf(record: AnchorRecord): NoteBase {
  return {
    label: record.label,
    ...(record.why ? { why: record.why } : {}),
    tags: userTags(record.tags ?? []),
  }
}

export function sameBase(a: NoteBase | undefined, b: NoteBase | undefined): boolean {
  if (!a || !b) return a === b
  return (a.label ?? '') === (b.label ?? '') && (a.why ?? '') === (b.why ?? '') && (a.tags ?? []).join('\n') === (b.tags ?? []).join('\n')
}

/** What `ingest` found to adopt: only the fields that differ from the base, as a relabel's changes. */
export type Adopted = { label?: string; why?: string; tags?: string[] }

export type IngestResult =
  | { changes: Adopted }
  /** Nothing to adopt, and why: for the log, never a toast. */
  | { changes?: undefined; reason: string }

/**
 * Reads a note's front matter back against the record's base. `fm` is `parseFrontMatter`'s
 * result (a scalar or a list per property). Each write-back field present in the note and
 * different from its base is adopted; a field absent from the note is not; `bm/*` tags are
 * stripped first. Nothing is adopted when the note's writer is below the floor or the record
 * has no base yet (the first write by a floor build sets it).
 */
export function ingest(fm: Record<string, string | string[]>, base: NoteBase | undefined, floor = NOTE_WRITER_FLOOR): IngestResult {
  const v = writerVersion(fm['bm-writer'])
  const f = writerVersion(floor)!
  if (!v) return { reason: 'the note names no writer' }
  if (!atOrAbove(v, f)) return { reason: `the note's writer ${v.join('.')} is below ${floor}` }
  if (!base) return { reason: 'the record has no base yet' }
  const changes: Adopted = {}
  const label = scalarOf(fm.label)
  if (label !== undefined && label !== '' && label !== (base.label ?? '')) changes.label = label
  const why = scalarOf(fm.why)
  if (why !== undefined && why !== (base.why ?? '')) changes.why = why
  if (fm.tags !== undefined) {
    const tags = userTags(listOf(fm.tags))
    if (tags.join('\n') !== (base.tags ?? []).join('\n')) changes.tags = tags
  }
  return Object.keys(changes).length > 0 ? { changes } : { reason: 'the note matches its base' }
}

const scalarOf = (v: string | string[] | undefined): string | undefined => (typeof v === 'string' ? v : undefined)
/** A list property as a list; a scalar written by hand (`a, b`) splits on commas, as Obsidian reads it. */
const listOf = (v: string | string[]): string[] =>
  Array.isArray(v) ? v.map(s => s.trim()).filter(Boolean) : v.split(',').map(s => s.trim()).filter(Boolean)
