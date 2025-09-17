#!/bin/bash

echo "Stopping BillPrepared..."

# Try to read PID from file first
if [ -f .budget_app.pid ]; then
    RUN_PID=$(cat .budget_app.pid)
    echo "Found PID file with PID: $RUN_PID"
else
    # Fallback to finding the process
    RUN_PID=$(ps aux | grep "run.sh" | grep -v grep | awk '{print $2}')
    echo "Found run.sh process (PID: $RUN_PID)"
fi

if [ -n "$RUN_PID" ] && kill -0 $RUN_PID 2>/dev/null; then
    echo "Sending stop signal to process (PID: $RUN_PID)..."
    kill -USR1 $RUN_PID
    sleep 3
    if kill -0 $RUN_PID 2>/dev/null; then
        echo "Process still running, sending TERM signal..."
        kill -TERM $RUN_PID
        sleep 2
        if kill -0 $RUN_PID 2>/dev/null; then
            echo "Force killing process..."
            kill -KILL $RUN_PID
        fi
    fi
    echo "BillPrepared stopped."
    rm -f .budget_app.pid
else
    echo "No run.sh process found, trying kill.sh..."
    ./kill.sh
fi
