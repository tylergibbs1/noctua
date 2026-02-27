# Clayton County Case Inquiry Scraper

Standalone scraper for Clayton County case inquiry name searches. It performs a name search, follows case detail links, filters cases by filing date on the client side, and saves results to CSV.

## Requirements

- Python 3.9+
- `requests`
- `beautifulsoup4`

Install dependencies:

```bash
pip install requests beautifulsoup4
```

## Usage

```bash
python scraper.py --start-date YYYY-MM-DD --end-date YYYY-MM-DD \
  --party-name "Smith" [--first-name "John"] \
  [--case-type civil] [--court A] [--output /path/to/output.csv]
```

### Arguments

- `--start-date` (required): Start date in `YYYY-MM-DD`.
- `--end-date` (required): End date in `YYYY-MM-DD`.
- `--party-name` (required): Last name or full name to search. The site does not support date-only searches.
- `--first-name` (optional): First name for search; if omitted and `--party-name` contains a space, the script splits the last token as last name and preceding tokens as first name.
- `--case-type` (optional): `civil` or `criminal` (default `civil`).
- `--court` (optional): Court code for name searches: `A` (All), `L` (State), `M` (Magistrate), `U` (Superior). Default `A`.
- `--output` (optional): Output CSV path. Defaults to `clayton_cases_<lname>_<start>_<end>.csv`.

## Output

CSV columns:

```
case_number,case_type,filing_date,plaintiff,defendant,judge,status,court,detail_url
```

## Notes

- The site does not offer date-range search; a party name is required.
- The scraper uses retries, rate limiting (1–2 seconds), and follows pagination links when present.
- Pagination is limited to 3 pages by default for testing; adjust with `--max-pages`.
