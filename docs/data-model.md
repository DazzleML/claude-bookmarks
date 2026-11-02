# How the plugin's data fits together

Everything the plugin keeps is built from a few small pieces, and each larger piece is made of smaller ones. A place in a conversation is the smallest. A list of bundles, each gathering everything about one piece of work, is the largest. In between, a piece can be promoted to the next one up -- a mark into a bookmark, a bookmark into an item on a list -- without losing what it was.

This page names each piece, says what it adds to the one below it, where it is kept, and which part of the plugin works with it. The how-to for each is in [Using the plugin](usage.md).

## The idea: a continuum, not a set of separate features

The pieces sit on one ordered line, from the most passing to the most lasting:

```
a place  ->  a mark  ->  Claude's reference  ->  a bookmark  ->  a link on an item  ->  a bundle  ->  a list
(an address)  (a letter)   (a link it cites)      (a named place)   (one of its links)    (a packet)    (a queue)
```

The line comes from DazzleLib's *continuum*: an ordered axis whose steps can be taken in either direction, where each step up adds something and keeps what was there. Here that means:

- **Nothing is copied when a piece moves up.** A bookmark made from a mark points at the same message; a bundle holds the same places and files the bookmarks did. Each piece keeps its own address, so a link written to it at any level still works.
- **Each step adds one thing:** a letter, permanence and a note, a label and a reason, a place among other links, membership in one or more lists.
- **Every piece is plain, readable data in your own folder,** never under `~/.claude` (Claude Code cleans that), and you can read and edit it without the plugin.

## The pieces

| Piece | What it is | What it adds | Where it is kept | Who makes it |
|---|---|---|---|---|
| **A place** | The address of one row of a conversation: a prompt, a reply, a tool call, its output, an agent's message. Named by the message's id (and the block, for a row inside a message). | -- (the base) | Nowhere of its own: it is the transcript's own id | Claude Code |
| **A short reference** | A place, or a numbered record, written in a few characters: `bm:8f0f9b27/e92204f6` (exact) or `bm:8f0f9b27.12~e92204f6` (a record by its number). | A form short enough for a prompt, a commit message or a note | Wherever you write it | You, or Claude |
| **A mark** | A letter `a`-`z` on a place, for jumping back in a keystroke. Re-marking a letter keeps the old place as `a_001`. The reading position is a mark of its own. | A letter, and its history | The conversation's bookmark file | You (`Ctrl+] m`) |
| **Claude's reference** | A link Claude cites in its reply to an earlier place, drawn without the `⚓`. | Permanence: the link keeps working in later sessions | The conversation's bookmark file, on Claude's side | Claude (its `bookmark` tool) |
| **A bookmark** | A named place you will want again: a label, why it matters, and a note file with the message quoted and a section for your own notes. Yours and Claude's are two lists. | A label, a reason, a note you can edit, a place in a list of bookmarks | The conversation's bookmark file, and one note per message | You (`Ctrl+] P`, or by asking), or Claude |
| **A link** | One thing an item points at: a place, a file, a web page, a GitHub issue, a marked line in a file, or a plain line of text. It can carry one sentence of what it is. | A kind, and a description | Inside the item (or the bundle) that holds it | You or Claude, through the lists pane and tool |
| **An item** | One entry of a list: a label, a reason, its links, done or not. The first link is what a press opens. | A label, a reason, done, an order in a list | The project's lists file | You or Claude |
| **A bundle** | The set of links of an item with two or more of them, kept once so several lists can show it, each leading with a link of its own. | Sharing: one packet, shown in many lists | The project's lists file (see "What is changing" below) | Made by the plugin when an item reaches two links |
| **A list** | A named, ordered list of items -- what is left to do, tests to run, ideas -- that belongs to the project, not to one conversation. | A name, an order, a project, yours or Claude's | The project's lists file, with a page beside it for reading elsewhere | You or Claude |

A bookmark and a link to a place both name the same message. A bundle often holds bookmarks of several conversations, files from the project's own notes, and issues. That mixing is the point: a bundle is everything about one piece of work, wherever it lives.

## Two that look alike: a mark and a bookmark

Both name one place in the conversation, and you can turn one into the other. The difference is what you want it for.

A **mark** is a letter you press to get back somewhere now. It costs one keystroke, it has no name, and re-marking the letter moves it (the old place is kept as history). It answers *"where was I?"*

A **bookmark** is a place you have decided to keep. It has a label, a reason, and a note file you can write in; it shows in the bookmarks pane, Claude can cite it, and it can be put on a list. It answers *"what was that, and why did it matter?"*

Both exist because pressing a letter is fast and disposable, and writing a label is a commitment. Most places you mark you will never bookmark, and promoting a mark (`Ctrl+] P`, then its letter) is how a place earns its name.

## What a link is

A link is not a kind of place; it is one of the things an item on a list points at. A bookmark stands on its own, in the conversation's file. A link exists only as part of an item, beside the item's other links, and it can point at things that are not places at all: a file, an issue, a web page, a marked line, a line of text.

So a link to a place and a bookmark can name the same message, and that is fine: the bookmark says *"I kept this"*, the link says *"this belongs with these other things"*. Linking a place does not make a bookmark, and bookmarking a place does not put it on a list.

## Which one do I want?

| You want to | Use |
|---|---|
| get back here in a keystroke | a mark |
| keep this, with a name and a note | a bookmark |
| cite it in a reply, a commit message or a note | a short reference |
| gather it with everything else about one piece of work | a link on a list item (two or more links make a bundle) |

## Where the files are

```
~/claude/bookmarks/
  sessions/<session id>.json            a conversation's bookmark file: its marks, reading position, pins, bookmarks and Claude's references
  sessions/<session id>/<id>.md         one note per bookmarked message
  sessions/index.json, INDEX.md         every conversation with bookmarks, generated
  lists/<folder>.json                   the lists of the folder Claude Code runs in: items, links and bundles
  lists/<folder>.md                     the same as a page, rewritten on every change
```

(`CLAUDE_USER_DIR`, if set, replaces `~/claude`.) A conversation continued under a new session id (a branch, a resume, a background hand-off) copies its earlier bookmark files' records in once; see [One file per conversation](usage.md#one-file-per-conversation-forks-resumes-and-references).

## Which part of the plugin works with which piece

| Part | Works with |
|---|---|
| The band (`Ctrl+]`) | marks, the reading position, the jumplist; opens every pane |
| The prompts pane | places (your prompts), pins, and the reading position |
| The search pane | places of every kind, across the whole conversation |
| The bookmarks pane | bookmarks, yours and Claude's |
| Claude's replies | Claude's references and short references, drawn as links you can click |
| The lists pane | lists, items, their links and bundles |
| Claude's `bookmark` and `lists` tools | every piece above, by request |

## What is changing next

The next minor version gives each bundle a file of its own and an age, and adds an **optional** project layout for people who keep notes inside their projects.

For everyone:

- **each bundle becomes a file of its own**, and the file is the bundle's source: the plugin keeps the links in a part of it it owns, and everything below a marker line is yours, never rewritten;
- **lists stay per folder, as now:** each folder Claude Code runs in keeps lists of its own;
- **an opened bundle says how old it is:** when it was first discussed, and when it last moved.

These files stay where everything else is, under `~/claude/bookmarks/`. Nothing about your project changes, and nothing needs configuring. If you keep notes inside a project, you can link a folder of the plugin's there yourself, and the plugin keeps reading and writing the same place either way. The details come with that version.

Until it ships, bundles stay in the lists file as described above.
