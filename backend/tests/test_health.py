"""Tests for health endpoint."""

import pytest
import httpx


@pytest.mark.asyncio
async def test_health_endpoint(api_base_url):
    """Test that health endpoint returns expected structure."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{api_base_url}/api/health")

        assert response.status_code == 200
        data = response.json()

        # Verify structure
        assert "status" in data
        assert "database" in data
        assert "version" in data
        assert "active_monitors" in data
        assert "total_victims" in data
        assert "pending_reviews" in data

        # Verify values
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        assert data["version"] == "1.0.0"
        assert isinstance(data["active_monitors"], int)
        assert isinstance(data["total_victims"], int)
        assert isinstance(data["pending_reviews"], int)


@pytest.mark.asyncio
async def test_root_endpoint(api_base_url):
    """Test root endpoint returns API info."""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{api_base_url}/")

        assert response.status_code == 200
        data = response.json()

        assert data["name"] == "Leak Monitor API"
        assert data["version"] == "1.0.0"
        assert data["docs"] == "/docs"
        assert data["health"] == "/api/health"
