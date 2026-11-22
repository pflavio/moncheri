"""Hält die als einzelne Datei installierbare Google Web-App auf Stand."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
backend = root / "apps-script" / "Code.gs"
html = (root / "docs" / "index.html").read_text(encoding="utf-8")
marker = "// Eingebettetes Formular aus docs/index.html"
before = backend.read_text(encoding="utf-8").split(marker)[0].rstrip()
lines = ",\n".join("    " + json.dumps(line, ensure_ascii=False) for line in html.splitlines())
backend.write_text(before + "\n\n" + marker + "\nfunction formular_() {\n  return [\n" + lines
                   + "\n  ].join('\\n');\n}\n", encoding="utf-8")
