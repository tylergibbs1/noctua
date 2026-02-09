# claimguard

catch denials before they happen

autonomous medical billing denial prediction agent — analyzes claims against CMS/NCCI rules to flag risks before submission

## what it does

- **code validation** — verifies ICD-10 and HCPCS codes exist and are active
- **PTP edit detection** — checks all pairwise NCCI procedure-to-procedure edit conflicts
- **MUE enforcement** — validates units against medically unlikely edit limits
- **add-on code checks** — ensures add-on codes have required primary codes
- **modifier validation** — validates modifier usage (59/X-modifiers, 25, 26/TC)
- **demographics checks** — flags age/sex inappropriate codes
- **risk scoring** — 0-100 risk score with severity breakdown

## prerequisites

- [bun](https://bun.sh) v1.0+
- anthropic API key (`ANTHROPIC_API_KEY` env var)

## setup

```bash
git clone https://github.com/tylergibbs1/claimguard.git
cd claimguard
export ANTHROPIC_API_KEY=sk-ant-...
bun run setup
```

that's it — `bun run setup` installs deps, links the `claimguard` command globally, and syncs CMS data

### manual setup

```bash
bun install
bun link                         # makes claimguard available globally
claimguard sync                  # download CMS rules data
```

## usage

### interactive TUI

```bash
claimguard                       # start the TUI
claimguard --session <id>        # resume a previous session
claimguard --debug               # show debug panel
claimguard --model <model-id>    # use a specific claude model
```

### slash commands

| command    | description              |
|------------|--------------------------|
| `/help`    | list available commands   |
| `/new`     | start a fresh session    |
| `/session` | show current session id  |
| `exit`     | quit claimguard          |

### keyboard shortcuts

| key              | action                  |
|------------------|-------------------------|
| `enter`          | submit query            |
| `shift+enter`    | insert newline          |
| `esc`            | interrupt running query |
| `up/down`        | navigate input history  |
| `ctrl+a / ctrl+e`| line start / end       |
| `opt+left/right` | word navigation         |
| `opt+backspace`  | delete word backward    |

### analyze a claim (JSON output)

```bash
claimguard analyze examples/sample-claim.json
claimguard analyze examples/sample-claim.json --model claude-opus-4-6
```

### run evaluation suite

```bash
claimguard eval
```

### sync CMS data

```bash
claimguard sync                                    # sync all datasets
claimguard sync --dataset icd10,hcpcs,ptp,mue,addon  # sync specific datasets
```

## claim format

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

## architecture

- **agent** — claude agent SDK (V1 `query()` API) with 8 MCP tools served via `createSdkMcpServer`
- **database** — `bun:sqlite` with WAL mode for CMS rules lookup
- **TUI** — ink (react 19) with branded theme, markdown rendering, streaming tool events
- **sync** — downloads and parses CMS data files (ICD-10, HCPCS Level II, PTP edits, MUE, add-on codes)
- **evals** — evaluation suite with automated scoring against real CMS data

## tools

| tool                 | description                                |
|----------------------|--------------------------------------------|
| `lookup_icd10`       | validate diagnosis codes                   |
| `lookup_hcpcs`       | validate procedure codes                   |
| `validate_code_pair` | check a single PTP edit pair               |
| `check_bundling`     | scan all PTP conflicts for a code          |
| `check_mue`          | check medically unlikely edit limits       |
| `check_addon`        | verify add-on code requirements            |
| `check_modifier`     | review modifier usage                      |
| `check_age_sex`      | check demographic appropriateness          |

## license

MIT
