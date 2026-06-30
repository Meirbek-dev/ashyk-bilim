Write-Host "Starting frontend (in a new window)..."
# Using -WorkingDirectory ensures bun runs inside the apps/web folder
Start-Process bun.cmd -ArgumentList "run dev" -WorkingDirectory "apps/web"

Write-Host "Starting API (in a new window)..."
Start-Process powershell -ArgumentList "-NoExit -Command `"cd apps/api; uv run app.py`""

Write-Host "Starting PostgreSQL and Redis with Docker Compose..."
docker-compose up -d db redis

Write-Host "All services started."
