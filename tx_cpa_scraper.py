"""
Scrape Texas Comptroller franchise tax account search results and export CSV.

Usage:
  python tx_cpa_scraper.py --name "A1" --zip 78701 --out results.csv
  python tx_cpa_scraper.py --taxpayer-id 32066021794 --out results.csv
  python tx_cpa_scraper.py --file-number 0802914689 --out results.csv

Notes:
- The public search API only accepts one query parameter: name, taxpayerId, or fileNumber.
- Zip filtering is applied client-side using the mailingAddressZip field.
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from typing import Dict, Iterable, List, Optional

import requests

SEARCH_API_URL = "https://comptroller.texas.gov/data-search/franchise-tax"
DETAIL_API_TEMPLATE = "https://comptroller.texas.gov/data-search/franchise-tax/{taxpayer_id}"

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)


class RateLimiter:
    def __init__(self, min_delay: float) -> None:
        self.min_delay = max(min_delay, 0.0)
        self._last_ts: Optional[float] = None

    def wait(self) -> None:
        if self.min_delay <= 0:
            return
        now = time.time()
        if self._last_ts is not None:
            elapsed = now - self._last_ts
            if elapsed < self.min_delay:
                time.sleep(self.min_delay - elapsed)
        self._last_ts = time.time()


def build_params(args: argparse.Namespace) -> Dict[str, str]:
    params: Dict[str, str] = {}
    if args.name:
        params["name"] = args.name
    elif args.taxpayer_id:
        params["taxpayerId"] = args.taxpayer_id
    elif args.file_number:
        params["fileNumber"] = args.file_number
    else:
        raise ValueError("One of --name, --taxpayer-id, or --file-number is required")
    return params


def extract_next_page(payload: Dict[str, object], current_page: int) -> Optional[int]:
    pagination = None
    if isinstance(payload.get("pagination"), dict):
        pagination = payload["pagination"]

    if pagination:
        page = pagination.get("page") or pagination.get("currentPage")
        total = pagination.get("totalPages") or pagination.get("total_pages")
        if isinstance(page, int) and isinstance(total, int) and page < total:
            return page + 1

    page = payload.get("page") or payload.get("currentPage")
    total = payload.get("totalPages") or payload.get("total_pages")
    if isinstance(page, int) and isinstance(total, int) and page < total:
        return page + 1

    links = payload.get("links")
    if isinstance(links, dict) and links.get("next"):
        return current_page + 1

    return None


def fetch_search_page(
    session: requests.Session,
    rate_limiter: RateLimiter,
    params: Dict[str, str],
    page: Optional[int],
    page_size: Optional[int],
    timeout: float,
) -> Dict[str, object]:
    query = dict(params)
    if page is not None:
        query["page"] = str(page)
    if page_size is not None:
        query["size"] = str(page_size)
    rate_limiter.wait()
    response = session.get(SEARCH_API_URL, params=query, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if payload.get("success") is False:
        raise RuntimeError(f"Search request failed: {payload}")
    return payload


def iter_search_results(
    session: requests.Session,
    rate_limiter: RateLimiter,
    params: Dict[str, str],
    page_size: Optional[int],
    max_pages: Optional[int],
    timeout: float,
) -> Iterable[Dict[str, object]]:
    page = 1 if page_size else None
    pages_fetched = 0
    while True:
        payload = fetch_search_page(
            session,
            rate_limiter,
            params,
            page,
            page_size,
            timeout,
        )
        data = payload.get("data") or payload.get("results") or []
        if not isinstance(data, list):
            raise RuntimeError("Unexpected search response format: 'data' is not a list")
        for row in data:
            if isinstance(row, dict):
                yield row
        pages_fetched += 1
        if max_pages and pages_fetched >= max_pages:
            break
        next_page = extract_next_page(payload, page or 1)
        if not next_page:
            break
        page = next_page


def fetch_detail(
    session: requests.Session,
    rate_limiter: RateLimiter,
    taxpayer_id: str,
    timeout: float,
) -> Dict[str, object]:
    rate_limiter.wait()
    response = session.get(
        DETAIL_API_TEMPLATE.format(taxpayer_id=taxpayer_id),
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("success") is False:
        raise RuntimeError(f"Detail request failed for {taxpayer_id}: {payload}")
    detail = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(detail, dict):
        raise RuntimeError(f"Unexpected detail response format for {taxpayer_id}")
    return detail


def format_address(detail: Dict[str, object]) -> str:
    if detail.get("address"):
        return str(detail["address"]).strip()
    street = str(detail.get("mailingAddressStreet") or "").strip()
    city = str(detail.get("mailingAddressCity") or "").strip()
    state = str(detail.get("mailingAddressState") or "").strip()
    zip_code = str(detail.get("mailingAddressZip") or "").strip()
    parts = [part for part in [street, city, state, zip_code] if part]
    if len(parts) >= 3 and city and state and zip_code:
        return f"{street}, {city}, {state}, {zip_code}" if street else ", ".join(parts)
    return ", ".join(parts)


def extract_record(detail: Dict[str, object], fallback: Dict[str, object]) -> Dict[str, str]:
    business_name = (
        detail.get("businessName")
        or detail.get("name")
        or fallback.get("businessName")
        or fallback.get("name")
        or ""
    )
    taxpayer_id = detail.get("taxpayerId") or fallback.get("taxpayerId") or ""
    sos_file_number = detail.get("sosFileNumber") or detail.get("fileNumber") or fallback.get("fileNumber") or ""
    permit_number = detail.get("permitNumber") or detail.get("permit_number") or ""
    address = format_address(detail) or format_address(fallback)

    return {
        "business_name": str(business_name).strip(),
        "address": str(address).strip(),
        "permit_number": str(permit_number).strip(),
        "taxpayer_id": str(taxpayer_id).strip(),
        "sos_file_number": str(sos_file_number).strip(),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape Texas Comptroller franchise tax search")
    parser.add_argument("--name", help="Entity name query (2-50 chars)")
    parser.add_argument("--taxpayer-id", help="Taxpayer ID (9 or 11 digits)")
    parser.add_argument("--file-number", help="SOS file number (6-10 digits)")
    parser.add_argument("--zip", dest="zip_code", help="Filter results by mailing ZIP")
    parser.add_argument("--out", required=True, help="Output CSV path")
    parser.add_argument("--page-size", type=int, help="Optional page size for pagination")
    parser.add_argument("--max-pages", type=int, help="Max pages to fetch (safety cap)")
    parser.add_argument("--rate-limit", type=float, default=1.0, help="Seconds between requests")
    parser.add_argument("--timeout", type=float, default=30.0, help="Request timeout in seconds")
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT, help="Custom User-Agent header")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        params = build_params(args)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(2)

    rate_limiter = RateLimiter(args.rate_limit)
    headers = {"User-Agent": args.user_agent}
    zip_filter = str(args.zip_code).strip() if args.zip_code else None

    session = requests.Session()
    session.headers.update(headers)

    fieldnames = [
        "business_name",
        "address",
        "permit_number",
        "taxpayer_id",
        "sos_file_number",
    ]

    try:
        with open(args.out, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            for row in iter_search_results(
                session,
                rate_limiter,
                params,
                args.page_size,
                args.max_pages,
                args.timeout,
            ):
                mailing_zip = row.get("mailingAddressZip") or row.get("zip") or ""
                if zip_filter and str(mailing_zip).strip() != zip_filter:
                    continue
                taxpayer_id = str(row.get("taxpayerId") or "").strip()
                if not taxpayer_id:
                    continue
                detail = fetch_detail(session, rate_limiter, taxpayer_id, args.timeout)
                if zip_filter:
                    detail_zip = str(detail.get("mailingAddressZip") or "").strip()
                    if detail_zip and detail_zip != zip_filter:
                        continue
                record = extract_record(detail, row)
                writer.writerow(record)
    except requests.RequestException as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        sys.exit(1)
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
