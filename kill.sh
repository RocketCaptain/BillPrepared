#!/bin/bash

echo "Stopping BillPrepared processes..."

# Get the current directory to make patterns more specific
CURRENT_DIR=$(pwd)

# Kill backend processes (Python Flask app) - specific to this project directory
echo "Stopping backend processes..."
echo "Looking for python processes with $CURRENT_DIR..."
ps aux | grep -v grep | grep "python.*app.py" | grep "$CURRENT_DIR" | awk '{print $2}' | xargs kill -TERM 2>/dev/null && echo "Backend processes killed" || echo "No backend processes found for this project"

# Kill frontend processes (Vite dev server) - specific to this project directory
echo "Stopping frontend processes..."
ps aux | grep -v grep | grep "npm.*run.*dev" | grep "$CURRENT_DIR" | awk '{print $2}' | xargs kill -TERM 2>/dev/null && echo "Frontend npm processes killed" || echo "No frontend npm processes found for this project"

# Kill Vite processes specifically for this project
ps aux | grep -v grep | grep "vite" | grep "$CURRENT_DIR" | awk '{print $2}' | xargs kill -TERM 2>/dev/null && echo "Vite processes killed" || echo "No Vite processes found for this project"

# Kill processes on specific ports only if they match our app
echo "Checking for processes on specific ports..."
if command -v lsof >/dev/null 2>&1; then
    # Only kill if the process command contains our project path
    lsof -i:5000 | grep "$CURRENT_DIR" | awk '{print $2}' | xargs kill -TERM 2>/dev/null || echo "No matching process on port 5000"
    lsof -i:5173 | grep "$CURRENT_DIR" | awk '{print $2}' | xargs kill -TERM 2>/dev/null || echo "No matching process on port 5173"
else
    echo "lsof not available, skipping port-based killing"
fi

echo "BillPrepared stopped successfully!"
