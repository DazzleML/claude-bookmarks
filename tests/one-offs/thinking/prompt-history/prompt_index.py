"""Arm B: print one compact JSON line per user prompt in a session transcript."""
import json
import sys


def prompt_text(o):
    """The prompt's text, or None when the row is not a typed user prompt."""
    if o.get("type") != "user" or o.get("isMeta") or o.get("isSidechain"):
        return None
    content = (o.get("message") or {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
            return None
        texts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
        return " ".join(texts) if texts else None
    return None


def main(path):
    out = sys.stdout.buffer
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                o = json.loads(line)
            except ValueError:
                continue
            text = prompt_text(o)
            if text is None:
                continue
            row = {"uuid": o.get("uuid"), "t": o.get("timestamp"), "text": text[:200]}
            out.write(json.dumps(row, ensure_ascii=False).encode("utf-8") + b"\n")


if __name__ == "__main__":
    main(sys.argv[1])
