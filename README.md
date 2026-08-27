# Vijayakumar Unni - Portfolio

Static portfolio for Vijayakumar Unni, Adobe Certified AEM Developer.

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server.

## Deploy

This repository is configured for GitHub Pages from the `main` branch root. Push changes to `main`, then enable Pages in the repository's Settings under **Pages**.

## Keep the portfolio in sync with a resume

Place the latest PDF at `resume/resume.pdf` and push it to `main`. The `Resume sync` workflow extracts the PDF text, updates `resume-data.json`, and redeploys the site automatically. The extraction currently refreshes the sync metadata and summary; project details should still be reviewed manually for accuracy before publishing.

The portfolio download button expects the recruiter-facing PDF at the repository root with this exact name: `Vijayakumar Unni - Resume.pdf`.