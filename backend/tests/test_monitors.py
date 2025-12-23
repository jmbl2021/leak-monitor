"""Tests for monitors endpoints."""

import pytest
import httpx


@pytest.mark.asyncio
async def test_list_monitors(api_base_url):
    """Test listing monitors."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{api_base_url}/api/monitors")

        assert response.status_code == 200
        data = response.json()

        assert isinstance(data, list)
        if len(data) > 0:
            monitor = data[0]
            assert "id" in monitor
            assert "group_name" in monitor
            assert "start_date" in monitor
            assert "poll_interval_hours" in monitor
            assert "is_active" in monitor


@pytest.mark.asyncio
async def test_list_groups(api_base_url):
    """Test listing available ransomware groups."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{api_base_url}/api/monitors/groups/list")

        assert response.status_code == 200
        data = response.json()

        # API returns a list of group names directly
        assert isinstance(data, list)
        assert len(data) > 0
        # Verify akira group exists (we have test data for it)
        assert "akira" in data


@pytest.mark.asyncio
async def test_create_monitor_invalid_group(api_base_url):
    """Test creating monitor with invalid group returns error."""
    async with httpx.AsyncClient() as client:
        monitor_data = {
            "group_name": "nonexistent_group_xyz",
            "start_date": "2025-12-01",
            "poll_interval_hours": 6
        }

        response = await client.post(
            f"{api_base_url}/api/monitors",
            json=monitor_data
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_poll_monitor(api_base_url):
    """Test polling a monitor."""
    async with httpx.AsyncClient() as client:
        # First get an existing monitor
        monitors = await client.get(f"{api_base_url}/api/monitors")
        monitors_data = monitors.json()

        if len(monitors_data) > 0:
            monitor_id = monitors_data[0]["id"]

            # Poll the monitor
            response = await client.post(
                f"{api_base_url}/api/monitors/{monitor_id}/poll"
            )

            assert response.status_code == 200
            data = response.json()

            assert "monitor_id" in data
            assert "inserted" in data
            assert "skipped" in data
            assert isinstance(data["inserted"], int)
            assert isinstance(data["skipped"], int)
