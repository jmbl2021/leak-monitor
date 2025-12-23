"""Tests for AI analysis endpoints."""

import pytest
import httpx


@pytest.mark.asyncio
async def test_classify_without_api_key(api_base_url, sample_victim_id):
    """Test that classification endpoint requires API key."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{api_base_url}/api/analyze/classify",
            json={"victim_ids": [sample_victim_id]}
        )

        assert response.status_code == 401
        assert "api key" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_classify_with_invalid_victim_id(api_base_url, mock_anthropic_key):
    """Test classification with nonexistent victim ID."""
    fake_uuid = "00000000-0000-0000-0000-000000000000"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{api_base_url}/api/analyze/classify",
            headers={"X-Anthropic-Key": mock_anthropic_key},
            json={"victim_ids": [fake_uuid]}
        )

        # Should return 200 but with error in results
        assert response.status_code == 200
        data = response.json()

        assert len(data) == 1
        assert data[0]["success"] is False
        assert "not found" in data[0]["error"].lower()


@pytest.mark.asyncio
async def test_news_search_without_api_key(api_base_url, sample_victim_id):
    """Test that news search requires API key."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{api_base_url}/api/analyze/news/{sample_victim_id}"
        )

        assert response.status_code == 401
        assert "api key" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_8k_check_valid_victim(api_base_url, sample_victim_id):
    """Test 8-K check endpoint."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{api_base_url}/api/analyze/8k/{sample_victim_id}"
        )

        # Might be 200 or 400 depending on whether victim is SEC-regulated
        assert response.status_code in [200, 400]

        if response.status_code == 200:
            data = response.json()
            assert "success" in data
            assert "has_8k_filing" in data
        else:
            # Should be validation error about SEC regulation
            assert "sec" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_8k_check_nonexistent_victim(api_base_url):
    """Test 8-K check with nonexistent victim."""
    fake_uuid = "00000000-0000-0000-0000-000000000000"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{api_base_url}/api/analyze/8k/{fake_uuid}"
        )

        assert response.status_code == 404


@pytest.mark.asyncio
async def test_8k_batch_endpoint(api_base_url):
    """Test batch 8-K checking."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{api_base_url}/api/analyze/8k/batch?limit=5"
        )

        assert response.status_code == 200
        data = response.json()

        assert "success" in data
        assert "checked" in data
        assert "results" in data
        assert data["success"] is True
        assert isinstance(data["checked"], int)
        assert isinstance(data["results"], list)


@pytest.mark.asyncio
async def test_classify_request_validation(api_base_url, mock_anthropic_key):
    """Test that classify endpoint validates request format."""
    async with httpx.AsyncClient() as client:
        # Empty victim_ids list should fail
        response = await client.post(
            f"{api_base_url}/api/analyze/classify",
            headers={"X-Anthropic-Key": mock_anthropic_key},
            json={"victim_ids": []}
        )

        assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_classify_request_max_batch_size(api_base_url, mock_anthropic_key):
    """Test that classify endpoint enforces max batch size."""
    # Generate 11 fake UUIDs (max is 10)
    fake_uuids = [f"00000000-0000-0000-0000-{i:012d}" for i in range(11)]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{api_base_url}/api/analyze/classify",
            headers={"X-Anthropic-Key": mock_anthropic_key},
            json={"victim_ids": fake_uuids}
        )

        assert response.status_code == 422  # Validation error
