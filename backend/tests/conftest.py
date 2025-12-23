"""Pytest configuration and fixtures."""

import pytest
from httpx import AsyncClient
from app.main import app


@pytest.fixture
def api_base_url():
    """Base URL for API tests."""
    return "http://localhost:8001"


@pytest.fixture
async def async_client():
    """Async HTTP client for testing."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


@pytest.fixture
def sample_victim_id():
    """Sample victim ID for testing."""
    return "b2f43c2f-ac2b-4382-8e39-38f3f888bbe7"


@pytest.fixture
def mock_anthropic_key():
    """Mock Anthropic API key for testing."""
    return "sk-ant-test-mock-key-123"
