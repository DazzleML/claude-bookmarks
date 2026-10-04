# claude-bookmarks

A new project created from git-repokit-template

## Installation

```bash
pip install claude_bookmarks
```

### From Source

```bash
git clone https://github.com/DazzleML/claude-bookmarks.git
cd claude-bookmarks
pip install -e ".[dev]"
```

## Usage

```bash
claude-bookmarks --help
```

## Development

```bash
# Clone and install
git clone https://github.com/DazzleML/claude-bookmarks.git
cd claude-bookmarks
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"

# Run tests
python -m pytest tests/ -v

# Install git hooks (if using repokit-common submodule)
bash scripts/repokit-common/install-hooks.sh
```

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) for details.

