# ClaimGuard

Autonomous medical billing denial prediction agent. ClaimGuard analyzes medical claims against CMS/NCCI rules to identify potential denial risks before submission.

## Features

- **Code Validation** — Verifies ICD-10 and CPT/HCPCS codes exist and are active
- **PTP Edit Detection** — Checks all pairwise NCCI Procedure-to-Procedure edit conflicts
- **MUE Enforcement** — Validates units against Medically Unlikely Edit limits
- **Add-on Code Checks** — Ensures add-on codes have required primary codes
- **Modifier Validation** — Validates modifier usage (59/X-modifiers, 25, 26/TC)
- **Demographics Checks** — Flags age/sex inappropriate codes
- **Risk Scoring** — 0-100 risk score with severity breakdown

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- An Anthropic API key (`ANTHROPIC_API_KEY` env var)

## Setup

```bash
bun install
bun run sync --mock    # Seed the rules database with mock data
```

## Usage

### Analyze a Claim (Interactive TUI)

```bash
bun run dev analyze examples/sample-claim.json
```

### Analyze a Claim (JSON output)

```bash
bun run dev analyze examples/sample-claim.json --batch
```

### Run Evaluation Suite

```bash
bun run eval
```

### Sync CMS Data

```bash
# Use mock data
bun run sync --mock

# Download from CMS (when available)
bun run sync --dataset icd10,hcpcs,ptp,mue,addon
```

## Claim Format

Claims are JSON files with this structure:

```json
{
  "claimId": "CLM-001",
  "dateOfService": "2024-06-15",
  "patient": {
    "id": "P001",
    "dateOfBirth": "1975-03-20",
    "sex": "M"
  },
  "provider": { "type": "practitioner" },
  "lineItems": [
    {
      "cpt": "99214",
      "modifiers": [],
      "icd10": ["E11.9", "I10"],
      "units": 1
    }
  ]
}
```

## Architecture

- **Agent SDK** — Claude Agent SDK (V1 `query()` API) with custom MCP tools
- **Database** — `bun:sqlite` with WAL mode for CMS rules lookup
- **TUI** — Ink (React for terminal) with real-time progress
- **Tools** — 8 MCP tools for code validation, bundling checks, and demographics

## License

MIT
