"""SEC 8-K Tracker Client.

Hybrid approach for matching 8-K cybersecurity incident disclosures:
1. Primary: SEC EDGAR API lookup by CIK (authoritative)
2. Fallback: board-cybersecurity.com tracker with fuzzy name matching

Data sources:
- SEC EDGAR: https://data.sec.gov/submissions/
- Tracker: https://www.board-cybersecurity.com/incidents/tracker/

This tracks SEC 8-K Item 1.05 cybersecurity incident disclosures.
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Board Cybersecurity tracker (fallback)
TRACKER_URL = "https://www.board-cybersecurity.com/incidents/tracker/"
CACHE_TTL = timedelta(hours=24)

# SEC EDGAR API
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_FILING_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{filename}"
SEC_USER_AGENT = "LeakMonitor/1.0 (jay@js-home-lab.com)"  # SEC requires contact info

# Rate limiting for SEC API (10 requests/second max per SEC guidelines)
SEC_RATE_LIMIT = asyncio.Semaphore(5)  # Conservative: 5 concurrent
SEC_REQUEST_DELAY = 0.2  # 200ms between requests


@dataclass
class SEC8KIncident:
    """Represents an SEC 8-K cybersecurity incident disclosure."""
    company_name: str
    disclosure_date: date
    last_update: date
    detail_url: str
    cik: Optional[str] = None  # Added for CIK matching


@dataclass
class SECEdgarFiling:
    """Represents an 8-K filing from SEC EDGAR."""
    cik: str
    accession_number: str
    filing_date: date
    form_type: str
    primary_document: str
    items: List[str] = field(default_factory=list)

    @property
    def filing_url(self) -> str:
        """Generate URL to the filing."""
        # Accession number without dashes for URL
        accession_clean = self.accession_number.replace("-", "")
        return f"https://www.sec.gov/Archives/edgar/data/{self.cik}/{accession_clean}/{self.primary_document}"


class SECEdgarClient:
    """Client for SEC EDGAR API with rate limiting."""

    def __init__(self):
        self._last_request_time: Optional[datetime] = None
        # Cache CIK -> recent 8-K filings
        self._cache: Dict[str, List[SECEdgarFiling]] = {}
        self._cache_time: Dict[str, datetime] = {}

    async def _rate_limited_request(self, url: str) -> Optional[Dict[str, Any]]:
        """Make a rate-limited request to SEC EDGAR API."""
        async with SEC_RATE_LIMIT:
            # Enforce minimum delay between requests
            if self._last_request_time:
                elapsed = (datetime.now() - self._last_request_time).total_seconds()
                if elapsed < SEC_REQUEST_DELAY:
                    await asyncio.sleep(SEC_REQUEST_DELAY - elapsed)

            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        url,
                        timeout=30,
                        headers={"User-Agent": SEC_USER_AGENT}
                    )
                    self._last_request_time = datetime.now()

                    if response.status_code == 404:
                        logger.debug(f"CIK not found: {url}")
                        return None
                    response.raise_for_status()
                    return response.json()
            except httpx.HTTPError as e:
                logger.error(f"SEC EDGAR API error: {e}")
                return None

    async def get_8k_filings(
        self,
        cik: str,
        after_date: Optional[date] = None,
        force_refresh: bool = False
    ) -> List[SECEdgarFiling]:
        """Get 8-K filings for a company by CIK.

        Args:
            cik: SEC Central Index Key (with or without leading zeros)
            after_date: Only return filings after this date
            force_refresh: Bypass cache

        Returns:
            List of 8-K filings, newest first
        """
        # Normalize CIK to 10 digits with leading zeros
        cik_normalized = cik.lstrip("0").zfill(10)

        # Check cache
        if not force_refresh and cik_normalized in self._cache:
            cache_age = datetime.now() - self._cache_time.get(cik_normalized, datetime.min)
            if cache_age < CACHE_TTL:
                logger.debug(f"Using cached EDGAR data for CIK {cik_normalized}")
                filings = self._cache[cik_normalized]
                if after_date:
                    filings = [f for f in filings if f.filing_date >= after_date]
                return filings

        # Fetch from SEC EDGAR
        url = SEC_SUBMISSIONS_URL.format(cik=cik_normalized)
        logger.info(f"Fetching SEC EDGAR submissions for CIK {cik_normalized}")

        data = await self._rate_limited_request(url)
        if not data:
            return []

        filings = []
        recent_filings = data.get("filings", {}).get("recent", {})

        if not recent_filings:
            logger.warning(f"No recent filings found for CIK {cik_normalized}")
            return []

        # Parse filings
        forms = recent_filings.get("form", [])
        dates = recent_filings.get("filingDate", [])
        accessions = recent_filings.get("accessionNumber", [])
        primary_docs = recent_filings.get("primaryDocument", [])
        items_list = recent_filings.get("items", [])

        for i, form in enumerate(forms):
            if form != "8-K":
                continue

            try:
                filing_date = datetime.strptime(dates[i], "%Y-%m-%d").date()
                items = items_list[i].split(",") if i < len(items_list) and items_list[i] else []

                filings.append(SECEdgarFiling(
                    cik=cik_normalized.lstrip("0"),
                    accession_number=accessions[i],
                    filing_date=filing_date,
                    form_type=form,
                    primary_document=primary_docs[i] if i < len(primary_docs) else "",
                    items=[item.strip() for item in items]
                ))
            except (IndexError, ValueError) as e:
                logger.warning(f"Error parsing filing {i}: {e}")
                continue

        # Cache results
        self._cache[cik_normalized] = filings
        self._cache_time[cik_normalized] = datetime.now()
        logger.info(f"Found {len(filings)} 8-K filings for CIK {cik_normalized}")

        # Filter by date if requested
        if after_date:
            filings = [f for f in filings if f.filing_date >= after_date]

        return filings

    def find_cybersecurity_8k(
        self,
        filings: List[SECEdgarFiling],
        after_date: Optional[date] = None
    ) -> Optional[SECEdgarFiling]:
        """Find 8-K with Item 1.05 (Material Cybersecurity Incidents).

        Only matches Item 1.05 which is the definitive SEC disclosure requirement
        for material cybersecurity incidents. Other items (7.01, 8.01) can also
        contain cyber disclosures but are too ambiguous - those cases are handled
        by the board-cybersecurity.com tracker fallback which has verified content.

        Args:
            filings: List of 8-K filings to search
            after_date: Only consider filings after this date

        Returns:
            Most recent Item 1.05 8-K or None
        """
        for filing in filings:
            if after_date and filing.filing_date < after_date:
                continue

            for item in filing.items:
                if "1.05" in item:
                    logger.info(f"Found Item 1.05 cybersecurity 8-K: {filing.accession_number} ({filing.filing_date})")
                    return filing

        return None


# Singleton SEC EDGAR client
_edgar_client: Optional[SECEdgarClient] = None


def get_edgar_client() -> SECEdgarClient:
    """Get the singleton SECEdgarClient instance."""
    global _edgar_client
    if _edgar_client is None:
        _edgar_client = SECEdgarClient()
    return _edgar_client


class SEC8KTracker:
    """Client for fetching and matching SEC 8-K cybersecurity disclosures."""

    def __init__(self):
        self._cache: List[SEC8KIncident] = []
        self._cache_time: Optional[datetime] = None

    async def fetch_incidents(self, force_refresh: bool = False) -> List[SEC8KIncident]:
        """Fetch all 8-K incidents from tracker.

        Args:
            force_refresh: Bypass cache and fetch fresh data

        Returns:
            List of SEC8KIncident records
        """
        # Check cache
        if not force_refresh and self._cache and self._cache_time:
            if datetime.now() - self._cache_time < CACHE_TTL:
                logger.debug(f"Using cached 8-K data ({len(self._cache)} incidents)")
                return self._cache

        logger.info(f"Fetching 8-K tracker data from {TRACKER_URL}")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    TRACKER_URL,
                    timeout=30,
                    follow_redirects=True,
                    headers={
                        "User-Agent": "SEC-8K-Research/1.0 (Python httpx)"
                    }
                )
                response.raise_for_status()
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch 8-K tracker: {e}")
            return self._cache if self._cache else []

        soup = BeautifulSoup(response.text, 'html.parser')
        table = soup.find('table')
        if not table:
            logger.warning("No table found in tracker page")
            return self._cache if self._cache else []

        incidents = []
        rows = table.find_all('tr')[1:]  # Skip header row

        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 3:
                last_update = self._parse_date(cells[0].text.strip())
                disclosure_date = self._parse_date(cells[1].text.strip())

                # Get company name and link
                link = cells[2].find('a')
                if link:
                    company_name = link.text.strip()
                    href = link.get('href', '')
                    # Build full URL if relative
                    if href and not href.startswith('http'):
                        detail_url = f"https://www.board-cybersecurity.com/incidents/tracker/{href}"
                    else:
                        detail_url = href
                else:
                    company_name = cells[2].text.strip()
                    detail_url = ""

                if disclosure_date and company_name:
                    incidents.append(SEC8KIncident(
                        company_name=company_name,
                        disclosure_date=disclosure_date,
                        last_update=last_update or disclosure_date,
                        detail_url=detail_url
                    ))

        self._cache = incidents
        self._cache_time = datetime.now()
        logger.info(f"Loaded {len(incidents)} 8-K incidents from tracker")
        return incidents

    def _parse_date(self, date_str: str) -> Optional[date]:
        """Parse a date string in YYYY-MM-DD format."""
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None

    def find_match(
        self,
        company_name: str,
        incidents: List[SEC8KIncident]
    ) -> Optional[SEC8KIncident]:
        """Find matching 8-K incident for a company.

        Uses fuzzy matching to account for variations in company names.

        Args:
            company_name: Company name to search for
            incidents: List of SEC8KIncident records to search

        Returns:
            Matching SEC8KIncident or None
        """
        normalized_search = self._normalize_name(company_name)

        for incident in incidents:
            normalized_incident = self._normalize_name(incident.company_name)

            # Exact match after normalization
            if normalized_search == normalized_incident:
                return incident

            # Search name contained in incident name
            if normalized_search in normalized_incident:
                return incident

            # Incident name contained in search name
            if normalized_incident in normalized_search:
                return incident

            # Word-based matching (at least 2 significant words match)
            search_words = set(normalized_search.split())
            incident_words = set(normalized_incident.split())
            # Remove common short words
            common_words = {'THE', 'AND', 'OF', 'FOR', 'A', 'AN'}
            search_words -= common_words
            incident_words -= common_words

            if len(search_words) >= 2 and len(incident_words) >= 2:
                matching_words = search_words & incident_words
                if len(matching_words) >= 2:
                    return incident

        return None

    def _normalize_name(self, name: str) -> str:
        """Normalize company name for matching.

        Removes common suffixes, punctuation, and normalizes case.

        Args:
            name: Company name to normalize

        Returns:
            Normalized company name
        """
        # Convert to uppercase
        name = name.upper().strip()

        # Remove common corporate suffixes
        suffixes = [
            'INC', 'INC.', 'INCORPORATED',
            'CORP', 'CORP.', 'CORPORATION',
            'LLC', 'L.L.C.',
            'LTD', 'LTD.', 'LIMITED',
            'CO', 'CO.', 'COMPANY',
            'S.A.', 'SA',
            'PLC', 'P.L.C.',
            'N.V.', 'NV',
            'AG', 'A.G.',
            'GMBH',
            'HOLDINGS', 'HOLDING',
            'GROUP', 'INTERNATIONAL', 'INTL',
        ]

        for suffix in suffixes:
            # Remove suffix with space or comma before it
            name = re.sub(rf'[,\s]+{re.escape(suffix)}$', '', name)
            name = re.sub(rf'\s+{re.escape(suffix)}\s*$', '', name)

        # Remove punctuation and extra spaces
        name = re.sub(r'[.,\'"()&]', ' ', name)
        name = re.sub(r'\s+', ' ', name)

        return name.strip()


# Singleton instance
_tracker: Optional[SEC8KTracker] = None


def get_sec8k_tracker() -> SEC8KTracker:
    """Get the singleton SEC8KTracker instance."""
    global _tracker
    if _tracker is None:
        _tracker = SEC8KTracker()
    return _tracker


async def check_8k_filing(
    company_name: str,
    sec_cik: Optional[str],
    post_date: date
) -> dict:
    """Check for SEC 8-K cybersecurity filing for a company.

    Queries BOTH sources and returns comprehensive results:
    1. SEC EDGAR API (CIK-based): Authoritative, returns Item 1.05 filings
    2. Board Cybersecurity tracker: Curated list including 7.01/8.01 disclosures

    Args:
        company_name: Company name to search for
        sec_cik: SEC Central Index Key (for EDGAR lookup)
        post_date: Date the victim was posted on ransomware leak site

    Returns:
        Dictionary with:
            - found: bool - Whether a matching 8-K was found
            - filing_date: Optional[date] - Date of 8-K filing
            - filing_url: Optional[str] - URL to filing details
            - disclosure_days: Optional[int] - Days between post_date and filing_date
            - source: str - "edgar" or "tracker" (primary source used)
            - item: str - SEC Item number (e.g., "1.05", "7.01")
            - edgar_result: dict - Raw EDGAR result (if CIK provided)
            - tracker_result: dict - Raw tracker result
    """
    edgar_result = None
    tracker_result = None
    search_start = post_date - timedelta(days=365)

    # Check SEC EDGAR API (if CIK provided)
    if sec_cik:
        logger.info(f"Checking SEC EDGAR for CIK {sec_cik} ({company_name})")
        edgar_client = get_edgar_client()

        filings = await edgar_client.get_8k_filings(sec_cik, after_date=search_start)

        if filings:
            cyber_8k = edgar_client.find_cybersecurity_8k(filings, after_date=search_start)

            if cyber_8k:
                # Extract item number from the filing
                item_number = None
                for item in cyber_8k.items:
                    if "1.05" in item:
                        item_number = "1.05"
                        break

                edgar_result = {
                    "found": True,
                    "filing_date": cyber_8k.filing_date,
                    "filing_url": cyber_8k.filing_url,
                    "disclosure_days": (cyber_8k.filing_date - post_date).days,
                    "item": item_number or "1.05",
                    "accession_number": cyber_8k.accession_number
                }
            else:
                edgar_result = {"found": False}
        else:
            edgar_result = {"found": False}
    else:
        edgar_result = {"found": False, "reason": "no_cik"}

    # Always check tracker (catches 7.01/8.01 disclosures)
    logger.info(f"Checking tracker for {company_name}")
    tracker = get_sec8k_tracker()
    incidents = await tracker.fetch_incidents()
    match = tracker.find_match(company_name, incidents)

    if match:
        tracker_result = {
            "found": True,
            "filing_date": match.disclosure_date,
            "filing_url": match.detail_url,
            "disclosure_days": (match.disclosure_date - post_date).days,
            "item": None  # Tracker doesn't specify item, but we know it's cyber-related
        }
    else:
        tracker_result = {"found": False}

    # Determine primary result (prefer EDGAR if found, else tracker)
    if edgar_result.get("found"):
        primary = edgar_result
        source = "edgar"
    elif tracker_result.get("found"):
        primary = tracker_result
        source = "tracker"
        # Try to infer item type: if EDGAR didn't find 1.05, it's likely 7.01/8.01
        if sec_cik and not edgar_result.get("found"):
            primary["item"] = "7.01/8.01"  # Non-material disclosure
    else:
        primary = {"found": False}
        source = None

    return {
        "found": primary.get("found", False),
        "filing_date": primary.get("filing_date"),
        "filing_url": primary.get("filing_url"),
        "disclosure_days": primary.get("disclosure_days"),
        "source": source,
        "item": primary.get("item"),
        "edgar_result": edgar_result,
        "tracker_result": tracker_result
    }


async def check_8k_filings_batch(
    companies: List[tuple],
    max_concurrent: int = 3
) -> List[dict]:
    """Check 8-K filings for multiple companies with rate limiting.

    Args:
        companies: List of (company_name, sec_cik, post_date) tuples
        max_concurrent: Maximum concurrent checks (default 3 for rate limiting)

    Returns:
        List of check_8k_filing results in same order as input
    """
    semaphore = asyncio.Semaphore(max_concurrent)

    async def check_with_limit(company_name: str, sec_cik: Optional[str], post_date: date):
        async with semaphore:
            return await check_8k_filing(company_name, sec_cik, post_date)

    tasks = [
        check_with_limit(name, cik, pdate)
        for name, cik, pdate in companies
    ]

    return await asyncio.gather(*tasks)
