import sqlite3
from datetime import datetime

VALIDATED_FORMATS = [
    'MM/DD/YYYY',
    'DD/MM/YYYY',
    'YYYY-MM-DD',
    'DD-MM-YYYY',
    'MMM DD, YYYY',
    'DD-MMMM-YYYY',
    'DD-MMM-YY'
]

DATABASE = 'budget.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                date TEXT NOT NULL,
                label TEXT,  -- Category/label for the transaction
                is_recurring BOOLEAN DEFAULT FALSE,
                recurring_id INTEGER,
                is_confirmed BOOLEAN DEFAULT FALSE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS recurring_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                start_date TEXT NOT NULL,
                label TEXT,  -- Category/label for the recurring transaction
                frequency TEXT NOT NULL,  -- 'daily', 'weekly', 'monthly'
                interval INTEGER DEFAULT 1,
                end_date TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS user_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                current_balance REAL DEFAULT 0,
                payday_frequency TEXT DEFAULT 'monthly',
                payday_date TEXT
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # Insert default user settings if not exists
        conn.execute('INSERT OR IGNORE INTO user_settings (id) VALUES (1)')

        # Create users table if not exists (single-user setup)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                show_advanced BOOLEAN DEFAULT FALSE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # Insert default user if not exists
        conn.execute('INSERT OR IGNORE INTO users (id) VALUES (1)')

        # Migration: Add show_advanced column if it doesn't exist
        cursor = conn.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'show_advanced' not in columns:
            conn.execute('ALTER TABLE users ADD COLUMN show_advanced BOOLEAN DEFAULT FALSE')

        # Create indexes for performance
        conn.execute('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_transactions_is_confirmed ON transactions(is_confirmed)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_transactions_recurring_id ON transactions(recurring_id)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_transactions_date_confirmed ON transactions(date, is_confirmed)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_recurring_transactions_start_date ON recurring_transactions(start_date)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_recurring_transactions_frequency ON recurring_transactions(frequency)')

if __name__ == '__main__':
    init_db()
    print("Database initialized.")
