# BillPrepared

A web-based bill coverage application with recurring transaction support.

## Features

- ✅ Transaction management (CRUD operations)
- ✅ Recurring transactions (daily, weekly, monthly)
- ✅ Edit individual or all future recurring transactions
- ✅ Delete confirmation dialogs
- ✅ Real-time balance calculations
- ✅ Color-coded income/expense display

## Quick Start

### Option 1: Docker (Recomended)

```bash
# Build and run
./docker_install.sh

# Or manually
docker-compose up --build
```

### Option 2: Shell Scripts (For Development) 

```bash
# Start the app
./run.sh

# Stop the app
./stop.sh

# Force close the app
./kill.sh
```

### Option 3: Python Script

```bash
python run.py
```

### Option 4: Manual Start

```bash
# Terminal 1: Backend
cd backend && source venv/bin/activate && python app.py

# Terminal 2: Frontend
cd frontend && npm run dev
```

## Access URLs - using ./run.sh

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000

## Access URLs - using ./docker_install.sh

- **Frontend**: http://localhost:80
- **Backend API**: http://localhost:5000

## Project Structure

```
BillPrepared/
├── run.sh              # Start script (shell)
├── kill.sh             # Stop script
├── run.py              # Start script (Python)
├── docker_install.sh   # Docker setup
├── docker-compose.yml  # Docker orchestration
├── data/               # Persistent data storage (Created by docker on run)
├── backend/            # Flask API server
└── frontend/           # React application
```

## Development

The app supports:
- Adding one-time or recurring transactions
- Editing transactions with options for individual or future instances
- Confirming processed transactions
- Viewing running balance calculations
- Professional UI with responsive design

## Database

Uses SQLite with automatic schema initialization. Database file: `data/budget.db`
