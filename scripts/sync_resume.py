"""Extract a committed resume PDF into the small data file used by the portfolio."""
import json
import re
from datetime import date
from pathlib import Path

from pypdf import PdfReader

resume_files = sorted(Path("resume").glob("*.pdf"))
resume_path = resume_files[0] if resume_files else Path("resume/resume.pdf")
output_path = Path("resume-data.json")

if not resume_path.exists():
    raise SystemExit("No PDF found in resume/")

text = "\n".join(page.extract_text() or "" for page in PdfReader(resume_path).pages)
paragraphs = [" ".join(part.split()) for part in re.split(r"\n\s*\n", text) if part.strip()]
summary = next((item for item in paragraphs if "experience" in item.lower()), "Resume available for review.")
data = {
    "lastUpdated": date.today().isoformat(),
    "summary": summary[:320],
    # The PDF actually parsed, not a fixed filename — build.js derives the
    # download link by globbing resume/ so the two can never disagree.
    "source": resume_path.as_posix(),
}
output_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(f"Updated {output_path} from {resume_path}")
