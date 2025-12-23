# Leak Monitor API Tests

This directory contains comprehensive tests for the leak-monitor backend API.

## Test Structure

- `test_health.py` - Tests for health and root endpoints
- `test_victims.py` - Tests for victim CRUD operations
- `test_monitors.py` - Tests for monitor management
- `test_analysis.py` - Tests for AI analysis endpoints
- `run_tests.sh` - Shell script for quick API validation
- `test_runner.py` - Python-based test runner (requires httpx)
- `conftest.py` - Pytest fixtures and configuration

## Running Tests

### Quick Validation (Shell Script)

The fastest way to validate the API is running:

```bash
./run_tests.sh
```

This runs 11 core API tests and reports pass/fail status.

### Pytest Suite

To run the full pytest suite:

```bash
# Install test dependencies
pip install -r requirements-dev.txt

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_health.py

# Run with verbose output
pytest -v
```

## Test Coverage

### Phase 1: Basic Endpoints ✅
- Health endpoint
- Root endpoint
- OpenAPI documentation

### Phase 2: Core API ✅
- **Victims API:**
  - List victims with filters
  - Get specific victim
  - Update victim classification
  - Get pending victims
  - Get statistics
  - Export to Excel

- **Monitors API:**
  - List monitors
  - Create monitor
  - Delete monitor
  - Poll monitor for new victims
  - List available groups

### Phase 3: AI Analysis ✅
- **Authentication:**
  - API key validation (401 on missing key)
  - Header-based authentication

- **AI Classification:**
  - Batch classification
  - Request validation (empty/oversized batches)
  - Error handling for invalid victims

- **News Correlation:**
  - News search endpoint
  - API key requirement

- **SEC 8-K Tracking:**
  - Individual 8-K checks
  - Batch 8-K processing
  - SEC regulation validation
  - Route ordering (batch before individual)

## Test Results Summary

**Run Date:** 2025-12-23

**Shell Test Suite:**
- Total Tests: 11
- Passed: 11 ✅
- Failed: 0
- Success Rate: 100%

**Tests Executed:**
1. Health endpoint - PASS
2. Root endpoint - PASS
3. List victims - PASS
4. List monitors - PASS
5. List groups - PASS
6. Get stats - PASS
7. Get pending victims - PASS
8. AI auth check (401) - PASS
9. 8-K batch endpoint - PASS
10. Invalid UUID validation - PASS
11. OpenAPI docs - PASS

## Known Issues Fixed

### Issue #1: Route Ordering Bug
**Problem:** The `/api/analyze/8k/batch` endpoint was returning 422 errors because FastAPI was matching "batch" as a UUID parameter for `/api/analyze/8k/{victim_id}`.

**Root Cause:** Route handlers in FastAPI are matched in order. The generic `{victim_id}` route was defined before the specific `batch` route.

**Fix:** Reordered routes in `backend/app/api/analysis.py` to place `/8k/batch` before `/8k/{victim_id}`.

**File:** `backend/app/api/analysis.py:180-316`

**Verification:** Test now passes successfully - batch endpoint returns proper JSON response.

## Manual Testing Examples

### Test AI Classification (requires API key)

```bash
# Get a pending victim
VICTIM_ID=$(curl -s "http://localhost:8001/api/victims/pending?limit=1" | jq -r '.[0].id')

# Classify with AI (requires real Anthropic API key)
curl -X POST "http://localhost:8001/api/analyze/classify" \
  -H "X-Anthropic-Key: sk-ant-api-xxxxx" \
  -H "Content-Type: application/json" \
  -d "{\"victim_ids\": [\"$VICTIM_ID\"]}"
```

### Test News Search

```bash
# Search news for a classified victim (requires real Anthropic API key)
curl -X POST "http://localhost:8001/api/analyze/news/{VICTIM_ID}" \
  -H "X-Anthropic-Key: sk-ant-api-xxxxx"
```

### Test 8-K Checking

```bash
# Check single victim
curl -X POST "http://localhost:8001/api/analyze/8k/{VICTIM_ID}"

# Batch check SEC-regulated victims
curl -X POST "http://localhost:8001/api/analyze/8k/batch?limit=10"
```

## Pytest Configuration

See `pytest.ini` for configuration details:
- Test discovery pattern: `test_*.py`
- Async mode: auto
- Test path: `tests/`

## Future Test Enhancements

- [ ] Integration tests with mock Anthropic API
- [ ] Database transaction rollback between tests
- [ ] Performance/load testing
- [ ] End-to-end tests with frontend
- [ ] Security testing (SQL injection, XSS, etc.)
- [ ] Rate limiting tests
- [ ] Concurrent request handling

## Continuous Integration

Tests should be run as part of CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: |
    cd backend
    pip install -r requirements-dev.txt
    pytest --cov=app --cov-report=xml
```

## Contributing

When adding new endpoints:
1. Add corresponding tests to appropriate test file
2. Update this README with test coverage details
3. Ensure all tests pass before committing
4. Run `./run_tests.sh` for quick validation
