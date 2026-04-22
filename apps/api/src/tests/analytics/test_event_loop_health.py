import asyncio
import time
import inspect
from unittest.mock import patch, MagicMock
from sqlalchemy.orm import Session

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from src.infra.db.session import get_db_session
from src.app.factory import create_app
from src.services.analytics.filters import AnalyticsFilters


async def mock_heavy_computation(*args, **kwargs):
    # Simulate a blocking call by sleeping in a thread
    # In a real scenario, this would be a heavy DB query
    time.sleep(0.5)
    return MagicMock()


@pytest.mark.asyncio
async def test_analytics_does_not_block_event_loop():
    """
    Test that heavy analytics queries do not block the event loop.
    We mock the heavy computation to take 0.5s (blocking) and then
    fire a 'health' request concurrently. If the event loop is NOT blocked,
    the health request should finish almost immediately while the analytics
    request is still 'running' in its thread.
    """
    app = create_app()
    
    # Mock the database session dependency
    app.dependency_overrides[get_db_session] = lambda: MagicMock(spec=Session)
    
    # We need to mock the service call that we wrapped in to_thread
    # get_teacher_overview is one of them.
    with patch("src.routers.analytics.get_teacher_overview", side_effect=mock_heavy_computation):
        # We also need to bypass authentication for this test
        with patch("src.routers.analytics.get_current_user", return_value=MagicMock(id=1)):
            with patch("src.routers.analytics._scope_for", return_value=MagicMock(course_ids=[1])):
                
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                    # Start the heavy analytics request
                    analytics_task = asyncio.create_task(
                        ac.get("/api/v1/analytics/teacher/overview")
                    )
                    
                    # Wait a tiny bit to ensure the task has started
                    await asyncio.sleep(0.05)
                    
                    # Now hit a lightweight endpoint
                    start_time = time.time()
                    health_response = await ac.get("/api/v1/health/live")
                    end_time = time.time()
                    
                    health_duration = end_time - start_time
                    
                    # If blocked, health_duration would be ~0.45s (0.5s - 0.05s)
                    # If NOT blocked (using threads), health_duration should be < 0.1s
                    assert health_response.status_code == 200
                    assert health_duration < 0.2, f"Event loop was blocked for {health_duration}s"
                    
                    # Clean up
                    await analytics_task
    
    # Clear overrides
    app.dependency_overrides = {}

@pytest.mark.asyncio
async def test_all_analytics_endpoints_are_async():
    """
    Verify that all analytics endpoints are defined as 'async def'
    so they don't block the default thread pool unnecessarily if they 
    don't need to, but more importantly, to ensure our to_thread wrapping
    is actually reachable in an async context.
    """
    from src.routers.analytics import router
    for route in router.routes:
        assert inspect.iscoroutinefunction(route.endpoint), f"Endpoint {route.path} is not async"
