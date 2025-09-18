#!/bin/bash

echo "Starting BillPrepared..."

# Store our PID for stop script
echo $$ > .budget_app.pid

# Function to cleanup processes on exit
cleanup() {
    echo ""
    echo "Stopping BillPrepared..."
    echo "Killing backend process (PID: $backend_pid)..."
    kill -TERM $backend_pid 2>/dev/null || echo "Backend process already stopped"
    echo "Killing frontend process (PID: $frontend_pid)..."
    kill -TERM $frontend_pid 2>/dev/null || echo "Frontend process already stopped"

    # Wait a moment for processes to terminate
    sleep 2

    # Force kill if still running
    if kill -0 $backend_pid 2>/dev/null; then
        echo "Force killing backend..."
        kill -KILL $backend_pid 2>/dev/null
    fi
    if kill -0 $frontend_pid 2>/dev/null; then
        echo "Force killing frontend..."
        kill -KILL $frontend_pid 2>/dev/null
    fi

    echo "BillPrepared stopped successfully!"
    rm -f .budget_app.pid
    exit 0
}

# Function to handle custom stop signal
custom_stop() {
    echo ""
    echo "Received custom stop signal..."
    cleanup
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM SIGHUP SIGQUIT
trap custom_stop SIGUSR1

# Start backend
echo "Starting backend server..."
cd backend
source venv/bin/activate
./venv/bin/python app.py &
backend_pid=$!
cd ..

# Wait a moment for backend to initialize
sleep 3

# Check if backend is still running
if ! kill -0 $backend_pid 2>/dev/null; then
    echo "Failed to start backend server"
    exit 1
fi

# Start frontend
echo "Starting frontend server..."
cd frontend
npm run dev -- --host 0.0.0.0 &
frontend_pid=$!
cd ..

# Wait a moment for frontend to initialize
sleep 3

# Check if frontend is still running
if ! kill -0 $frontend_pid 2>/dev/null; then
    echo "Failed to start frontend server"
    kill $backend_pid 2>/dev/null
    exit 1
fi

echo ""
echo "🎉 BillPrepared is running!"
echo "📊 Backend API: http://localhost:5000"
echo "🌐 Frontend: http://localhost:5173"
echo ""
echo "To stop the application:"
echo "  - Press Ctrl+C (SIGINT)"
echo "  - Or run: kill -USR1 $$  (custom stop signal)"
echo "  - Or use: ./kill.sh (force kill)"

# Wait for processes
wait
