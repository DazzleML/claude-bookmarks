// The read-state file's shape (unit 8 of the record-format goal): a sibling of the register,
// `<dataRoot>/bookmarks/sessions/<sid>.state.json`, holding where each reader stands with
// each prompt -- the hidden layer the 0.6.x read-state feature draws (#34). This unit fixes
// the shape only; nothing writes or draws it yet.
//
// Design (the 2026-10-16 assessments): keyed by the uuid of a USER row whose content is
// text -- never a `tool_result`, which the transcript also stores as a user row -- through
// the prompt store's own filter, so a key is a prompt the prompts pane would list; per owner;
// axes by NAME ({attention: 'read', processing: 'wip'}), never a rank, so "read" and "WIP"
// can both hold (C11: one ladder is a lens over two axes, and the lens is the feature's);
// a capped history per axis. Unknown keys ride through, as in the register.
//
// Pure: no I/O.

import type { AnchorOwner } from './anchor.ts'
import { promptTextOf } from '../prompts/prompt-rows.ts'

export const STATE_VERSION = 1

/** How many past values an axis remembers per prompt and owner. A named constant; the value is the maintainer's (the goal's open format values). */
export const AXIS_HISTORY_CAP = 20

export type AxisEntry = { value: string; at: number }
/** One reader's standing with one prompt: each axis's current value, and what it was before. */
export type Standing = { axes: Record<string, string>; history: Record<string, AxisEntry[]> }

export type ReadState = {
  version: number
  sessionId: string
  rev: number
  updatedAt: number
  writer: string
  /** By prompt uuid, then by owner. */
  entries: Record<string, Partial<Record<AnchorOwner, Standing>>>
}

export function emptyReadState(sessionId: string, writer: string, now: number): ReadState {
  return { version: STATE_VERSION, sessionId, rev: 0, updatedAt: now, writer, entries: {} }
}

/**
 * Whether a transcript row may key the read state: a user row whose content is text that
 * the prompts pane would list -- the prompt store's own filter (`promptTextOf`), so a
 * `tool_result` row, a slash command's record or an engine notice never gets a standing.
 */
export function isReadStateKey(row: unknown): boolean {
  return promptTextOf(row) !== undefined
}

/** The standing of `owner` with `uuid`, if any. */
export function standingOf(state: ReadState, uuid: string, owner: AnchorOwner): Standing | undefined {
  return state.entries[uuid]?.[owner]
}

/**
 * Sets one axis for one reader on one prompt. The history gains the new value at its head
 * unless it repeats the current one; it is capped at AXIS_HISTORY_CAP. `rev` moves when
 * anything changed. The key is not checked here (the caller has the row; `isReadStateKey`).
 */
export function setAxis(state: ReadState, uuid: string, owner: AnchorOwner, axis: string, value: string, at: number): { state: ReadState; changed: boolean } {
  const current = standingOf(state, uuid, owner) ?? { axes: {}, history: {} }
  if (current.axes[axis] === value) return { state, changed: false }
  const history = [{ value, at }, ...(current.history[axis] ?? [])].slice(0, AXIS_HISTORY_CAP)
  const next: Standing = { axes: { ...current.axes, [axis]: value }, history: { ...current.history, [axis]: history } }
  return {
    state: {
      ...state,
      rev: state.rev + 1,
      updatedAt: at,
      entries: { ...state.entries, [uuid]: { ...(state.entries[uuid] ?? {}), [owner]: next } },
    },
    changed: true,
  }
}

/** Clears one axis for one reader on one prompt: the current value goes, the history stays. */
export function clearAxis(state: ReadState, uuid: string, owner: AnchorOwner, axis: string, at: number): { state: ReadState; changed: boolean } {
  const current = standingOf(state, uuid, owner)
  if (!current || !(axis in current.axes)) return { state, changed: false }
  const { [axis]: _gone, ...axes } = current.axes
  return {
    state: { ...state, rev: state.rev + 1, updatedAt: at, entries: { ...state.entries, [uuid]: { ...(state.entries[uuid] ?? {}), [owner]: { axes, history: current.history } } } },
    changed: true,
  }
}

// Fixed key order, unknown keys after the known ones (the register's rule).
const STATE_KEYS = ['version', 'sessionId', 'rev', 'updatedAt', 'writer', 'entries'] as const

export function serializeReadState(state: ReadState): string {
  const ordered: Record<string, unknown> = {}
  for (const k of STATE_KEYS) if ((state as Record<string, unknown>)[k] !== undefined) ordered[k] = (state as Record<string, unknown>)[k]
  for (const [k, v] of Object.entries(state)) if (!(STATE_KEYS as readonly string[]).includes(k) && v !== undefined) ordered[k] = v
  return JSON.stringify(ordered, null, 2) + '\n'
}

/** Reads a state file's text; undefined when it is not one. Unknown keys are kept. */
export function parseReadState(text: string): ReadState | undefined {
  let o: any
  try {
    o = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!o || typeof o !== 'object' || typeof o.sessionId !== 'string' || !o.entries || typeof o.entries !== 'object' || Array.isArray(o.entries)) return undefined
  const state: ReadState = {
    version: typeof o.version === 'number' ? o.version : STATE_VERSION,
    sessionId: o.sessionId,
    rev: typeof o.rev === 'number' ? o.rev : 0,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
    writer: typeof o.writer === 'string' ? o.writer : '?',
    entries: o.entries,
  }
  for (const [k, v] of Object.entries(o)) if (!(STATE_KEYS as readonly string[]).includes(k) && v !== undefined) (state as Record<string, unknown>)[k] = v
  return state
}

/** The state file's path beside the register. */
export const readStatePath = (dataRoot: string, sessionId: string): string => `${dataRoot.replace(/\\/g, '/').replace(/\/+$/, '')}/bookmarks/sessions/${sessionId}.state.json`
