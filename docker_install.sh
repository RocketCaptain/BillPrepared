#!/bin/bash

set -e

echo "Starting Docker installation for BillPrepared..."

# Cleanup any existing containers and volumes to ensure clean start
echo "Stopping and removing existing containers..."
docker compose down -v --remove-orphans 2>/dev/null || true

# Build frontend assets to include latest code changes (dark mode, sidebar, features)
echo "Building frontend assets..."
cd frontend
npm ci
npm run build
cd ..

# Build Docker images (includes latest backend code via COPY, frontend via built dist/)
echo "Building Docker images..."
docker compose build

# Start containers in detached mode
echo "Starting containers..."
docker compose up -d

# Wait for services to be healthy
echo "Waiting for services to start..."
sleep 5

# Check if services are running
if docker compose ps | grep -q "Up"; then
    echo ""
    echo "🎉 BillPrepared Docker setup complete!"
    echo "🌐 Frontend: http://localhost (port 80)"
    echo "📊 Backend API: http://localhost:5000"
    echo ""
    echo "The app matches the development version:"
    echo "- Latest features from App.tsx (sidebar, transactions, CSV import, recurring detection)"
    echo "- Dark mode enabled (auto-detects system preference or uses localStorage; toggle via navbar)"
    echo "- Backend uses latest app.py/database.py"
    echo ""
    echo "To stop: ./docker_install.sh (will cleanup) or docker-compose down"
    echo "To view logs: docker-compose logs -f"
else
    echo "Error: Services failed to start. Check logs with 'docker-compose logs'"
    exit 1
fi
