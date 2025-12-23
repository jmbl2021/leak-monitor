#!/usr/bin/env python3
"""Simple test runner script for manual API testing."""

import asyncio
import httpx


async def run_tests():
    """Run basic API tests."""
    base_url = "http://localhost:8001"
    results = []

    print("Running API Tests...")
    print("=" * 60)

    # Test 1: Health endpoint
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/api/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            results.append(("Health endpoint", "PASS"))
    except Exception as e:
        results.append(("Health endpoint", f"FAIL: {e}"))

    # Test 2: List victims
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/api/victims?limit=5")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            results.append(("List victims", "PASS"))
    except Exception as e:
        results.append(("List victims", f"FAIL: {e}"))

    # Test 3: List monitors
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/api/monitors")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            results.append(("List monitors", "PASS"))
    except Exception as e:
        results.append(("List monitors", f"FAIL: {e}"))

    # Test 4: AI classification without API key (should fail with 401)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{base_url}/api/analyze/classify",
                json={"victim_ids": ["00000000-0000-0000-0000-000000000000"]}
            )
            assert response.status_code == 401
            results.append(("AI auth check", "PASS"))
    except Exception as e:
        results.append(("AI auth check", f"FAIL: {e}"))

    # Test 5: 8-K batch endpoint
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{base_url}/api/analyze/8k/batch?limit=5")
            assert response.status_code == 200
            data = response.json()
            assert "success" in data
            results.append(("8-K batch endpoint", "PASS"))
    except Exception as e:
        results.append(("8-K batch endpoint", f"FAIL: {e}"))

    # Test 6: Get groups list
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/api/monitors/groups/list")
            assert response.status_code == 200
            data = response.json()
            assert "groups" in data
            results.append(("List groups", "PASS"))
    except Exception as e:
        results.append(("List groups", f"FAIL: {e}"))

    # Test 7: Get stats
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/api/victims/stats")
            assert response.status_code == 200
            data = response.json()
            assert "total" in data
            results.append(("Get stats", "PASS"))
    except Exception as e:
        results.append(("Get stats", f"FAIL: {e}"))

    # Print results
    print("\nTest Results:")
    print("=" * 60)
    passed = 0
    failed = 0
    for test_name, status in results:
        print(f"{test_name:.<40} {status}")
        if status == "PASS":
            passed += 1
        else:
            failed += 1

    print("=" * 60)
    print(f"Total: {len(results)} | Passed: {passed} | Failed: {failed}")

    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(run_tests())
    exit(0 if success else 1)
