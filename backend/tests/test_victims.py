"""Tests for victims endpoints."""

import pytest
import httpx
from uuid import UUID


@pytest.mark.asyncio
async def test_list_victims(api_base_url):
    """Test listing victims."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{api_base_url}/api/victims?limit=10")

        assert response.status_code == 200
        data = response.json()

        assert isinstance(data, list)
        if len(data) > 0:
            victim = data[0]
            # Verify structure
            assert "id" in victim
            assert "victim_raw" in victim
            assert "group_name" in victim
            assert "post_date" in victim
            assert "review_status" in victim


@pytest.mark.asyncio
async def test_list_victims_with_filters(api_base_url):
    """Test listing victims with filters."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{api_base_url}/api/victims?review_status=pending&limit=5"
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 5


@pytest.mark.asyncio
async def test_get_victim(api_base_url, sample_victim_id):
    """Test getting a specific victim."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{api_base_url}/api/victims/{sample_victim_id}")

        assert response.status_code == 200
        data = response.json()

        assert data["id"] == sample_victim_id
        assert "victim_raw" in data
        assert "group_name" in data
        assert "post_date" in data


@pytest.mark.asyncio
async def test_get_nonexistent_victim(api_base_url):
    """Test getting a nonexistent victim returns 404."""
    fake_uuid = "00000000-0000-0000-0000-000000000000"
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{api_base_url}/api/victims/{fake_uuid}")

        assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_victim(api_base_url, sample_victim_id):
    """Test updating a victim."""
    async with httpx.AsyncClient() as client:
        update_data = {
            "company_name": "Test Company",
            "company_type": "private",
            "country": "United States",
            "notes": "Test update"
        }

        response = await client.put(
            f"{api_base_url}/api/victims/{sample_victim_id}",
            json=update_data
        )

        assert response.status_code == 200
        data = response.json()

        assert data["company_name"] == "Test Company"
        assert data["company_type"] == "private"
        assert data["country"] == "United States"


@pytest.mark.asyncio
async def test_get_pending_victims(api_base_url):
    """Test getting pending victims for classification."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{api_base_url}/api/victims/pending?limit=5")

        assert response.status_code == 200
        data = response.json()

        assert isinstance(data, list)
        assert len(data) <= 5
        for victim in data:
            assert victim["review_status"] == "pending"


@pytest.mark.asyncio
async def test_get_stats(api_base_url):
    """Test getting victim statistics."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{api_base_url}/api/victims/stats")

        assert response.status_code == 200
        data = response.json()

        assert "total_victims" in data
        assert "by_review_status" in data
        assert "by_company_type" in data
        assert "by_group" in data
        assert isinstance(data["total_victims"], int)
