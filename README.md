# noctua

sees everything — AI-powered scraper and data acquisition agent powered by [stratus sdk](https://github.com/tylergibbs1/stratus) and azure openai (gpt-5.2-codex)

## setup

```bash
git clone https://github.com/tylergibbs1/noctua.git
cd noctua
bun install
bunx playwright install chromium
pip install crawl4ai && crawl4ai-setup   # optional, for web_crawl tool
```

set your azure credentials in `.env`:

```
AZURE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_API_KEY=your-key
AZURE_DEPLOYMENT=gpt-5.2-codex
```

## usage

```bash
bun run dev                  # start the TUI (browser visible by default)
bun run dev -- --headless    # run browser in headless mode
bun run dev -- --debug       # show debug panel
```

### commands

| command  | description             |
|----------|-------------------------|
| `/new`   | start fresh session     |
| `/help`  | show help               |
| `exit`   | quit                    |
| `ESC`    | interrupt current query |

## tools

24 tools across 4 categories:

### web (17)

| tool | purpose |
|------|---------|
| `web_crawl` | fetch URL as clean LLM-friendly markdown (crawl4ai) |
| `web_navigate` | go to URL / back / forward / reload in persistent browser |
| `web_wait` | wait for text, selector, or time |
| `web_click` | click element by CSS selector |
| `web_hover` | hover to reveal menus, tooltips |
| `web_fill` | fill single input (instant or character-by-character) |
| `web_fill_form` | fill multiple form fields in one call |
| `web_press_key` | press keyboard key or shortcut |
| `web_select_option` | select dropdown options |
| `web_file_upload` | upload files to file input |
| `web_extract` | extract text/attributes by CSS selector |
| `web_snapshot` | accessibility tree snapshot |
| `web_screenshot` | save screenshot to file |
| `web_evaluate` | run JavaScript in page context |
| `web_handle_dialog` | accept/dismiss alert/confirm/prompt |
| `web_tabs` | manage browser tabs |
| `web_close` | close the browser |

### shell (1)

| tool | purpose |
|------|---------|
| `bash` | run any command — curl, jq, python3, node, awk, pipes |

### files (5)

| tool | purpose |
|------|---------|
| `read_file` | read file contents |
| `write_file` | create/overwrite file |
| `edit_file` | find and replace in file |
| `list_directory` | list directory with sizes |
| `glob_files` | find files by glob pattern |

### search (1)

| tool | purpose |
|------|---------|
| `grep` | regex search across files |

## architecture

- **TUI**: react/ink terminal interface with markdown rendering, tool event display, input history
- **agent**: stratus sdk `Session` with multi-turn memory, hooks for tool callbacks
- **model**: azure responses api via `AzureResponsesModel` (gpt-5.2-codex, 272k context, 128k max output)
- **browser**: playwright chromium, headed by default, lazy-launched on first web tool call
- **crawl**: crawl4ai CLI for clean markdown extraction
