
# Mock Test Platform V4

V4 continues the V2 Node.js + Express approach, keeps JSON storage for Node.js 24 compatibility, and adds the banking-exam PDF workflow and candidate analytics.

## Included

- Node.js + Express 5
- JSON persistence (`data/data.json`)
- Admin and candidate login
- Test creation/settings
- PDF upload and text extraction
- Conservative banking-paper parser
- Section detection
- Directions/caselet retention
- A-E option extraction
- Answer/solution extraction when present in the PDF text
- Import Preview with review warnings
- Published timed test
- Question palette
- Auto-submit when timer expires
- Positive/negative marking
- Candidate result
- Rank and percentile
- Topper comparison
- Section-wise analysis
- Question-wise answer/solution review
- Leaderboard

## Run

Requires Node.js 18+.

```bash
npm install
npm start
```

Open:

http://localhost:3000

## Demo accounts

Candidate:
- candidate@example.com
- candidate123

Admin:
- admin@example.com
- admin123

## PDF importer notes

The importer is deliberately conservative. Banking PDFs often contain shared directions, wrapped text, tables/charts, mathematical expressions, and separate solution pages. V4 flags questions with weak extraction instead of silently publishing them.

The sample PDF supplied with the project contains:
- Reasoning
- Quantitative Aptitude
- English Language
- directions/caselets
- five-option questions
- chart/table based sets
- answer/solution material

The PDF parser currently extracts text. Image-only questions and complex chart geometry should remain in Admin Review for a later OCR/image-aware importer.

## Data

All runtime data is stored in `data/data.json`. This is suitable for local/demo use. For production multi-user deployment, replace it with PostgreSQL/MySQL and add proper password hashing/session or JWT authentication.


## Recommended PDF upload format

For reliable automatic extraction, create each question as a labelled block:

Question Number: 1
Question: What is 2 + 2?
Option A: 3
Option B: 4
Option C: 5
Option D: 6
Option E: 7
Right Option: B
Solution: 2 + 2 = 4.

Repeat the same block for every question. Multi-line Question and Solution text is supported.

Use `mock-test-demo-labelled-format.pdf` as the working example.
