# noctua

> sees everything

autonomous scraper and data acquisition agent — tell it what you want and watch it work

powered by [stratus sdk](https://github.com/tylergibbs1/stratus) + azure openai gpt-5.2-codex (272k context)

## what it does

noctua is a terminal-based AI agent that can browse the web, extract data, process files, and build scrapers — all from natural language. you describe what you want, it figures out the tools and steps.

```
> go to hacker news, get the top 30 stories with titles, links, and scores, save to hn.csv

⏺  crawl(url=https://news.ycombinator.com)
   ⎿  # Hacker News... in 1.2s

⏺  extract(selector=.titleline > a, attribute=href)
   ⎿  30 result(s)... in 24ms

⏺  shell(command=python3 -c "import csv...")
   ⎿  wrote 30 rows in 45ms

saved to hn.csv — 30 stories with titles, links, and scores
```

the browser opens on your screen so you can watch the agent navigate, click, and fill forms in real time.

## setup

```bash
git clone https://github.com/tylergibbs1/noctua.git
cd noctua
bun install
bunx playwright install chromium
```

optional — for `web_crawl` (clean markdown extraction):
```bash
pip install crawl4ai && crawl4ai-setup
```

create `.env` with your azure credentials:
```
AZURE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_API_KEY=your-key
AZURE_DEPLOYMENT=gpt-5.2-codex
```

## usage

```bash
bun run dev                  # start (browser visible by default)
bun run dev -- --headless    # headless browser mode
bun run dev -- --debug       # show debug panel
```

| command | description |
|---------|-------------|
| `/new` | clear session, start fresh |
| `/help` | show commands |
| `exit` | quit noctua |
| `ESC` | interrupt current query |

## tools (24)

### web — browsing and scraping (17)

| tool | what it does |
|------|-------------|
| `web_crawl` | fetch a URL as clean markdown, boilerplate stripped (powered by crawl4ai) |
| `web_navigate` | go to URL / back / forward / reload in the persistent browser |
| `web_wait` | wait for text to appear, element to load, or N seconds |
| `web_click` | click element by CSS selector (single, double, right-click) |
| `web_hover` | hover to reveal dropdown menus, tooltips, mega-navs |
| `web_fill` | fill input field — instant or character-by-character for autocomplete |
| `web_fill_form` | fill multiple fields in one call — saves turns on complex forms |
| `web_press_key` | keyboard shortcuts (Enter, Escape, Tab, Control+a, etc.) |
| `web_select_option` | select from `<select>` dropdowns |
| `web_file_upload` | upload files to file inputs |
| `web_extract` | extract text or attributes from elements by CSS selector — primary scraping tool |
| `web_snapshot` | accessibility tree of the page — structured layout without screenshots |
| `web_screenshot` | save screenshot of page or element to file |
| `web_evaluate` | run arbitrary JavaScript in the page context |
| `web_handle_dialog` | dismiss alert/confirm/prompt dialogs that block the page |
| `web_tabs` | list, create, close, or switch browser tabs |
| `web_close` | close the browser |

### shell — system commands (1)

| tool | what it does |
|------|-------------|
| `bash` | full unix CLI — curl, jq, python3, node, awk, sed, pipes, heredocs (30s timeout) |

### files — local filesystem (5)

| tool | what it does |
|------|-------------|
| `read_file` | read file contents |
| `write_file` | create or overwrite a file |
| `edit_file` | find and replace a unique string |
| `list_directory` | list directory with types and sizes |
| `glob_files` | find files by glob pattern |

### search — code and data (1)

| tool | what it does |
|------|-------------|
| `grep` | regex search across files with glob filtering |

## example queries

**scrape structured data**
```
go to github.com/trending and extract all repo names, descriptions,
star counts, and languages into trending.json
```

**build a reusable scraper**
```
go to oscn.net, navigate to Oklahoma County case search, search for
cases filed in the last 7 days, then build me a python scraper that
replicates this and saves results to CSV
```

**research and extract**
```
search arxiv.org for "large language models" papers from the last week,
get the first 20 titles, authors, and abstract links
```

**process local data**
```
find all TODO comments in .ts files in this project, group by file,
save a summary to todos.md
```

**multi-step workflow**
```
go to news.ycombinator.com, find the top story, navigate to it,
extract the article text, use python to count word frequency,
show the top 20 words
```

## architecture

```
src/
├── agent/
│   ├── session.ts          # stratus Session with multi-turn memory + hooks
│   ├── system-prompt.ts    # agent instructions and tool descriptions
│   └── tools/
│       ├── web.ts          # 17 playwright browser tools
│       ├── crawl.ts        # crawl4ai clean markdown extraction
│       ├── bash.ts         # shell command execution
│       ├── files.ts        # filesystem operations
│       ├── grep.ts         # regex search
│       └── index.ts        # tool registry
├── browser/
│   └── index.ts            # lazy playwright chromium singleton
├── tui/
│   ├── App.tsx             # main TUI shell (react/ink)
│   ├── components/         # input, markdown, tool events, spinner
│   └── hooks/              # agent runner, input history
└── index.ts                # CLI entry point
```

**key design decisions:**
- **stratus sessions** — multi-turn conversation memory across queries, prompt caching
- **hooks** — `beforeToolCall` / `afterToolCall` fire TUI events with actual tool results
- **headed browser** — visible by default so you see the agent working
- **token-efficient tools** — plain text returns, truncation, helpful error messages
- **crawl4ai integration** — `web_crawl` for reading, `web_navigate` for interaction

## license

MIT — Tyler Gibbs
