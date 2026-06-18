# Bounty Scorer

Automated quality scoring for bounty submissions on owockibot.xyz.

## What It Does

- Accepts a **submission URL** and **bounty requirements** as input
- Checks if the URL is live and accessible
- Fetches page content and analyzes it against requirements
- Generates a **quality score (0–100)** with breakdown
- Flags potential **low-effort or spam submissions**
- Provides **actionable feedback** for the submitter

## Scoring Methodology

| Category | Max Points | Description |
|----------|-----------|-------------|
| Liveness | 20 | URL returns a valid HTTP response |
| Requirements | 50 | Keyword coverage against each requirement line |
| Content Depth | 15 | Based on content length (>2K chars = full) |
| Spam Penalty | -15 | Deducted for spam signals (repetition, short content, spam phrases) |

**Total: 0–100** (content depth + spam can net -15 to +15)

### Requirements Analysis

Each requirement line is broken into keywords (>3 chars). The tool checks how many keywords appear in the submission content:
- **≥50% keyword match** = PASS (full weight)
- **>0% but <50%** = PARTIAL (shown with %)
- **0% match** = FAIL

### Spam Signals

- Very short content (<200 chars) → HIGH
- Repetitive characters → HIGH  
- Known spam phrases → MEDIUM
- Low code indicators → LOW
- Excessive URLs (>20) → MEDIUM

### Low-Effort Flag

Any submission scoring **below 30** is flagged as potential spam/low-effort.

## Installation

```bash
cd bounty-scorer
npm install
npm start
```

Server runs on **port 3001** by default (set `PORT` env var to change).

## API Usage

### Score a Submission

```bash
curl -X POST http://localhost:3001/api/score \
  -H "Content-Type: application/json" \
  -d '{
    "submissionUrl": "https://github.com/user/bounty-project",
    "requirements": "Build a REST API with auth\nInclude unit tests\nDeploy to public URL"
  }'
```

### Response Format

```json
{
  "submissionUrl": "https://...",
  "liveness": { "live": true, "statusCode": 200 },
  "score": 72,
  "breakdown": {
    "livenessPoints": 20,
    "requirementPoints": 35,
    "contentDepthPoints": 15,
    "spamPenalty": 2
  },
  "requirements": [...],
  "spamSignals": [...],
  "isLowEffort": false,
  "feedback": ["✅ Most requirements are well covered..."]
}
```

### Health Check

```bash
curl http://localhost:3001/api/health
```

## Web UI

Open `http://localhost:3001` in your browser for the visual scoring interface.

## License

MIT
