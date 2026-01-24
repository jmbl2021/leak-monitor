# Leak Monitor Troubleshooting Session - 2026-01-09

## Issue 1: "Classify All Pending" returns 422 error

**Root Cause:** Frontend/backend schema mismatch
- Frontend sent `{ limit: 50 }` to `/analyze/classify`
- Backend expected `{ victim_ids: [UUID, ...] }`

**Fix Applied:**
1. Added `ClassifyPendingRequest` schema (`backend/app/models/schemas.py:237-244`)
2. Added new endpoint `POST /analyze/classify/pending` (`backend/app/api/analysis.py:112-196`)
3. Updated frontend API to call new endpoint (`frontend/src/api/analysis.js:16`)

**Status:** Fixed - 422 error resolved

---

## Issue 2: "Classify All Pending" returns 504 Gateway Timeout

**Root Cause:** Classification takes ~15 sec per victim. With limit=50, that's 12+ minutes. Nginx proxy timeout defaults to 60 seconds.

**Fix Applied:**
- Added timeout settings to `frontend/nginx.conf` (lines 23-26):
  ```nginx
  proxy_read_timeout 600s;
  proxy_connect_timeout 60s;
  proxy_send_timeout 60s;
  ```

**Status:** Partially fixed - frontend nginx timeout extended to 10 minutes. NPM may also need timeout adjustment if it still times out.

---

## Remaining Work

1. **Test extended timeout** - Verify 504 is resolved with new 10-minute timeout
2. **NPM timeout** - May need custom nginx config in NPM advanced settings if NPM is also timing out
3. **Consider async pattern** - Long-running classification could benefit from:
   - Background task queue (Celery, etc.)
   - Progress tracking / SSE for real-time updates
   - Lower default limit (3-5 instead of 50)

---

## Files Modified (not yet committed)

| File | Change |
|------|--------|
| `backend/app/models/schemas.py` | Added `ClassifyPendingRequest` |
| `backend/app/models/__init__.py` | Export new schema |
| `backend/app/api/analysis.py` | Added `/classify/pending` endpoint |
| `frontend/src/api/analysis.js` | Changed endpoint URL |
| `frontend/nginx.conf` | Added proxy timeout settings |

---

## Commands to Rebuild

```bash
cd /home/jay/Projects/leak-monitor
docker compose up -d --build backend frontend
```
