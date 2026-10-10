# Security

Bookmarks runs inside Claude Code with your permissions, as any installed tool does. We take defects in it seriously. If you find one, here is how to tell us.

## Reporting a vulnerability

Please report privately first, so a fix can ship before the details are public.

1. Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**, or go directly to `https://github.com/DazzleML/claude-bookmarks/security/advisories/new`. Only the maintainers see the report.
2. If that is not available to you, open an issue at `https://github.com/DazzleML/claude-bookmarks/issues` that says only that you have a security report, without the details, and a maintainer will arrange a private channel.

Include the plugin version (`/bm-env` prints it), your Claude Code version and platform, what the plugin did, and what you expected. A minimal reproduction helps most.

## What to expect

- An acknowledgement within 7 days.
- A fix or a mitigation as soon as the problem is understood, released as a new version on `main`, which the directory and marketplace installs pick up.
- Credit in the CHANGELOG if you want it.

## Scope

In scope: anything the plugin does on your machine that this repository's [PRIVACY.md](PRIVACY.md) does not describe, in particular anything that sends data off the machine, writes outside the paths listed there, runs a program other than the ones listed there, or lets text from a conversation become a command.

Out of scope: Claude Code itself (report that to Anthropic), and any companion tools used to extend functionality.

## Supported versions

The plugin is pre-alpha. Only the latest version on `main` receives fixes.
