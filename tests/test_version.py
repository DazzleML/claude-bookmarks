"""Tests for the root version.py and the plugin manifest that must match it.

version.py is the version source for repokit-common's tooling. It lives at
the repo root because the product is a Claude Code mod, not a Python
package, so it is loaded by path rather than imported.
"""

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_spec = importlib.util.spec_from_file_location("version", ROOT / "version.py")
_version = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_version)

MAJOR, MINOR, PATCH = _version.MAJOR, _version.MINOR, _version.PATCH
PHASE, PROJECT_PHASE = _version.PHASE, _version.PROJECT_PHASE
get_version, get_base_version = _version.get_version, _version.get_base_version
get_display_version, get_pip_version = _version.get_display_version, _version.get_pip_version
__app_name__ = _version.__app_name__

MANIFEST = ROOT / ".claude-plugin" / "plugin.json"


def test_plugin_manifest_version_matches_version_py():
    """Claude Code reads the plugin's version from plugin.json first, so it
    must equal version.py's base version. Guards the hand-bump until
    repokit-common's extra-targets keeps the two in sync automatically."""
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert manifest["version"] == get_base_version()


def test_plugin_manifest_name_is_not_reserved():
    """Third-party plugin names may not start with "claude-" (and others);
    `claude plugin validate` refuses them."""
    name = json.loads(MANIFEST.read_text(encoding="utf-8"))["name"]
    assert name == "convo-bookmarks"
    assert not name.startswith(("claude-", "anthropic-", "anthropics-", "cc-plugin-"))


def test_app_name():
    assert __app_name__ == "claude-bookmarks"


def test_version_components():
    assert isinstance(MAJOR, int)
    assert isinstance(MINOR, int)
    assert isinstance(PATCH, int)


def test_phase_valid():
    """PHASE is empty string (stable release) or a string like 'alpha', 'beta', 'rc1'."""
    assert isinstance(PHASE, str)


def test_get_version_returns_string():
    v = get_version()
    assert isinstance(v, str)
    assert len(v) > 0


def test_base_version_format():
    base = get_base_version()
    assert base.startswith(f"{MAJOR}.{MINOR}.{PATCH}")


def test_display_version_includes_project_phase():
    display = get_display_version()
    if PROJECT_PHASE and PROJECT_PHASE != "stable":
        assert PROJECT_PHASE.upper() in display
    else:
        assert display == get_base_version()


def test_pip_version_pep440():
    pip_v = get_pip_version()
    assert "-" not in pip_v
    if PHASE:
        assert any(c.isalpha() for c in pip_v.split(".")[-1])
    else:
        assert all(c.isdigit() or c == "." for c in pip_v)
