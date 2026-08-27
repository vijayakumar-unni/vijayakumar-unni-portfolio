"""Extract a committed resume PDF into the small data file used by the portfolio."""
import json
import re
from datetime import date
from pathlib import Path

from pypdf import PdfReader

resume_path = Path("resume/resume.pdf")
output_path = Path("resume-data.json")

if not resume_path.exists():
    raise SystemExit("resume/resume.pdf is missing")

text = "\n".join(page.extract_text() or "" for page in PdfReader(resume_path).pages)
paragraphs = [" ".join(part.split()) for part in re.split(r"\n\s*\n", text) if part.strip()]
summary = next((item for item in paragraphs if "experience" in item.lower()), "Resume available for review.")
data = {
    "lastUpdated": date.today().isoformat(),
    "summary": summary[:320],
    "source": "resume/resume.pdf",
}
output_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(f"Updated {output_path} from {resume_path}")
