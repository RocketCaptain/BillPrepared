#run app with ./run.sh from project root directory
from flask import Flask, request, jsonify
from flask_cors import CORS
from database import get_db, init_db
import os
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import csv
import io
from collections import defaultdict
import difflib
import re
from datetime import datetime, timedelta
import json

app = Flask(__name__)
CORS(app)

def init_settings():
    """Initialize default settings if they don't exist"""
    defaults = {
        'recurring_sensitivity': 0.8,
        'auto_confirm_sensitivity': 0.7,
        'custom_recurring_algorithm': {
            "min_occurrences": 2,
            "interval_tolerance": 0.3,
            "amount_tolerance": 0.1,
            "frequency_detection": {
                "daily": 1,
                "weekly": 7,
                "monthly": 30
            }
        },
        'custom_auto_confirm_algorithm': {
            "similarity_threshold": 0.7,
            "amount_tolerance": 0.05,
            "date_diff_max": 3,
            "high_confidence": {
                "similarity": 0.9,
                "amount": 0.01
            }
        },
        'date_format': 'DD-MMMM-YYYY',
        'forecast_period': 12
    }
    
    with get_db() as conn:
        for key, value in defaults.items():
            # Check if key exists
            existing = conn.execute('SELECT id FROM settings WHERE key = ?', (key,)).fetchone()
            if not existing:
                conn.execute(
                    'INSERT INTO settings (key, value) VALUES (?, ?)',
                    (key, json.dumps(value) if isinstance(value, (dict, list)) else str(value))
                )
        conn.commit()

@app.route('/')
def hello():
    return jsonify({'message': 'BillPrepared API'})

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    forecast_period = request.args.get('forecast_period', type=int)
    confirmed = request.args.get('confirmed')
    limit = request.args.get('limit', type=int)
    offset = request.args.get('offset', 0, type=int)

    # If dates not provided, use defaults or settings
    if not start_date or not end_date:
        with get_db() as conn:
            settings_row = conn.execute('SELECT value FROM settings WHERE key = ?', ('forecast_period',)).fetchone()
            forecast_months = int(settings_row['value']) if settings_row else 12
        
        if not start_date:
            start = datetime.now() - relativedelta(months=1)
            start_date = start.strftime('%Y-%m-%d')
        
        if not end_date:
            if forecast_period:
                forecast_months = forecast_period
            end = datetime.now() + relativedelta(months=forecast_months)
            end_date = end.strftime('%Y-%m-%d')

    query = 'SELECT * FROM transactions WHERE 1=1'
    params = []

    query += ' AND date >= ?'
    params.append(start_date)
    query += ' AND date <= ?'
    params.append(end_date)
    
    if confirmed is not None:
        query += ' AND is_confirmed = ?'
        params.append(confirmed == 'true')

    query += ' ORDER BY date ASC'  # Oldest first, future dates at bottom

    if limit:
        query += ' LIMIT ? OFFSET ?'
        params.extend([limit, offset])

    with get_db() as conn:
        transactions = conn.execute(query, params).fetchall()

    return jsonify([dict(tx) for tx in transactions])

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    data = request.get_json()
    description = data['description']
    amount = data['amount']
    date = data['date']
    label = data.get('label')
    is_confirmed = data.get('is_confirmed', False)
    is_recurring = data.get('is_recurring', False)
    recurring_id = data.get('recurring_id')

    with get_db() as conn:
        cursor = conn.execute('''
            INSERT INTO transactions (description, amount, date, label, is_confirmed, is_recurring, recurring_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (description, amount, date, label, is_confirmed, is_recurring, recurring_id))
        transaction_id = cursor.lastrowid

    return jsonify({'id': transaction_id}), 201

@app.route('/api/transactions/<int:id>', methods=['PUT'])
def update_transaction(id):
    data = request.get_json()
    description = data.get('description')
    amount = data.get('amount')
    date = data.get('date')
    label = data.get('label')
    is_confirmed = data.get('is_confirmed')
    edit_type = data.get('edit_type')  # 'single' or 'future'

    with get_db() as conn:
        tx = conn.execute('SELECT * FROM transactions WHERE id = ?', (id,)).fetchone()
        if not tx:
            return jsonify({'error': 'Transaction not found'}), 404

        if tx['is_recurring'] and edit_type == 'single':
            # Create new non-recurring transaction
            conn.execute('''
                INSERT INTO transactions (description, amount, date, label, is_confirmed, is_recurring, recurring_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (description or tx['description'], amount or tx['amount'], date or tx['date'], label or tx['label'], is_confirmed if is_confirmed is not None else tx['is_confirmed'], False, None))
            # Delete the old recurring instance
            conn.execute('DELETE FROM transactions WHERE id = ?', (id,))
        elif tx['is_recurring'] and edit_type == 'future':
            # Update the recurring rule
            recurring_id = tx['recurring_id']
            conn.execute('''
                UPDATE recurring_transactions
                SET description = COALESCE(?, description),
                    amount = COALESCE(?, amount),
                    label = COALESCE(?, label),
                    start_date = COALESCE(?, start_date)
                WHERE id = ?
            ''', (description, amount, label, date, recurring_id))
            conn.commit()  # Commit to make changes visible to generate function
            # Regenerate future transactions
            conn.execute('DELETE FROM transactions WHERE recurring_id = ? AND date >= ?', (recurring_id, date or tx['date']))
            transactions = generate_recurring_transactions(recurring_id, date or tx['date'])
            for t in transactions:
                conn.execute('''
                    INSERT INTO transactions (description, amount, date, label, is_recurring, recurring_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (t['description'], t['amount'], t['date'], t['label'], t['is_recurring'], t['recurring_id']))
        else:
            # Regular update
            conn.execute('''
                UPDATE transactions
                SET description = COALESCE(?, description),
                    amount = COALESCE(?, amount),
                    date = COALESCE(?, date),
                    label = COALESCE(?, label),
                    is_confirmed = COALESCE(?, is_confirmed)
                WHERE id = ?
            ''', (description, amount, date, label, is_confirmed, id))

    return jsonify({'message': 'Transaction updated'})

@app.route('/api/transactions/<int:id>', methods=['DELETE'])
def delete_transaction(id):
    delete_type = request.args.get('delete_type', 'single')

    with get_db() as conn:
        tx = conn.execute('SELECT * FROM transactions WHERE id = ?', (id,)).fetchone()
        if not tx:
            return jsonify({'error': 'Transaction not found'}), 404

        if delete_type == 'future' and tx['is_recurring']:
            # Delete all future transactions for this recurring series
            conn.execute('DELETE FROM transactions WHERE recurring_id = ? AND date >= ?', (tx['recurring_id'], tx['date']))
        else:
            # Delete single transaction
            conn.execute('DELETE FROM transactions WHERE id = ?', (id,))

    return jsonify({'message': 'Transaction deleted'})

@app.route('/api/balance', methods=['GET'])
def get_balance():
    with get_db() as conn:
        settings = conn.execute('SELECT * FROM user_settings WHERE id = 1').fetchone()
        balance = settings['current_balance'] if settings else 0

    return jsonify({'balance': balance})

@app.route('/api/balance', methods=['PUT'])
def update_balance():
    data = request.get_json()
    balance = data['balance']

    with get_db() as conn:
        conn.execute('UPDATE user_settings SET current_balance = ? WHERE id = 1', (balance,))

    return jsonify({'message': 'Balance updated'})

def generate_recurring_transactions(recurring_id, start_date=None, end_date=None):
    """Generate future transactions for a recurring rule"""
    with get_db() as conn:
        recurring = conn.execute('SELECT * FROM recurring_transactions WHERE id = ?', (recurring_id,)).fetchone()
        if not recurring:
            return []
        
        # Fetch forecast_period from settings
        settings_row = conn.execute('SELECT value FROM settings WHERE key = ?', ('forecast_period',)).fetchone()
        forecast_months = int(settings_row['value']) if settings_row else 12

    description = recurring['description']
    amount = recurring['amount']
    label = recurring['label']
    frequency = recurring['frequency']
    interval = recurring['interval']
    start = datetime.fromisoformat(start_date) if start_date else datetime.fromisoformat(recurring['start_date'])
    end = datetime.fromisoformat(end_date) if end_date else datetime.now() + relativedelta(months=forecast_months)

    transactions = []
    current = start

    # Skip the first occurrence (start_date) to avoid duplicates
    if frequency == 'daily':
        current += timedelta(days=interval)
    elif frequency == 'weekly':
        current += timedelta(weeks=interval)
    elif frequency == 'monthly':
        current += relativedelta(months=interval)

    while current <= end:
        if current.date() >= (datetime.now() - timedelta(days=30)).date():  # Include past month
            transactions.append({
                'description': description,
                'amount': amount,
                'date': current.strftime('%Y-%m-%d'),
                'label': label,
                'is_recurring': True,
                'recurring_id': recurring_id
            })
        if frequency == 'daily':
            current += timedelta(days=interval)
        elif frequency == 'weekly':
            current += timedelta(weeks=interval)
        elif frequency == 'monthly':
            current += relativedelta(months=interval)
    return transactions

@app.route('/api/recurring', methods=['POST'])
def add_recurring_transaction():
    data = request.get_json()
    description = data['description']
    amount = data['amount']
    start_date = data['start_date']
    label = data.get('label')
    frequency = data['frequency']
    interval = data.get('interval', 1)
    end_date = data.get('end_date')

    with get_db() as conn:
        cursor = conn.execute('''
            INSERT INTO recurring_transactions (description, amount, start_date, label, frequency, interval, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (description, amount, start_date, label, frequency, interval, end_date))
        recurring_id = cursor.lastrowid
        conn.commit()  # Commit the insert so other connections can see it

        # Generate initial transactions
        transactions = generate_recurring_transactions(recurring_id, start_date, end_date)
        for tx in transactions:
            conn.execute('''
                INSERT INTO transactions (description, amount, date, label, is_confirmed, is_recurring, recurring_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (tx['description'], tx['amount'], tx['date'], tx['label'], False, tx['is_recurring'], tx['recurring_id']))

    return jsonify({'id': recurring_id}), 201

@app.route('/api/recurring/<int:id>', methods=['PUT'])
def update_recurring_transaction(id):
    data = request.get_json()
    description = data.get('description')
    amount = data.get('amount')
    start_date = data.get('start_date')
    label = data.get('label')
    frequency = data.get('frequency')
    interval = data.get('interval')
    end_date = data.get('end_date')

    with get_db() as conn:
        conn.execute('''
            UPDATE recurring_transactions
            SET description = COALESCE(?, description),
                amount = COALESCE(?, amount),
                start_date = COALESCE(?, start_date),
                label = COALESCE(?, label),
                frequency = COALESCE(?, frequency),
                interval = COALESCE(?, interval),
                end_date = COALESCE(?, end_date)
            WHERE id = ?
        ''', (description, amount, start_date, label, frequency, interval, end_date, id))

        # Regenerate future transactions
        conn.execute('DELETE FROM transactions WHERE recurring_id = ? AND date >= ?', (id, datetime.now().strftime('%Y-%m-%d')))
        transactions = generate_recurring_transactions(id, start_date or datetime.now().strftime('%Y-%m-%d'), end_date)
        for tx in transactions:
            conn.execute('''
                INSERT INTO transactions (description, amount, date, label, is_confirmed, is_recurring, recurring_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (tx['description'], tx['amount'], tx['date'], tx['label'], False, tx['is_recurring'], tx['recurring_id']))

    return jsonify({'message': 'Recurring transaction updated'})

@app.route('/api/recurring/<int:id>', methods=['DELETE'])
def delete_recurring_transaction(id):
    with get_db() as conn:
        # Delete all associated transactions
        conn.execute('DELETE FROM transactions WHERE recurring_id = ?', (id,))
        conn.execute('DELETE FROM recurring_transactions WHERE id = ?', (id,))

    return jsonify({'message': 'Recurring transaction deleted'})

@app.route('/api/import/csv/recurring', methods=['POST'])
def import_csv_recurring():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'File must be CSV'}), 400

    # Parse CSV
    csv_data = []
    stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
    reader = csv.reader(stream)
    for row in reader:
        if len(row) >= 3:
            date_str, amount_str, description = row[0], row[1], row[2]
            try:
                # Parse date DD/MM/YYYY to YYYY-MM-DD
                date_parts = date_str.split('/')
                if len(date_parts) == 3:
                    date = f"{date_parts[2]}-{date_parts[1].zfill(2)}-{date_parts[0].zfill(2)}"
                else:
                    continue
                amount = float(amount_str.strip('"'))
                csv_data.append({
                    'date': date,
                    'amount': amount,
                    'description': description.strip()
                })
            except ValueError:
                continue

    # Detect recurring transactions
    recurring_candidates = detect_recurring(csv_data)

    return jsonify({'recurring_candidates': recurring_candidates})

def normalize_description(desc):
    # Remove numbers and special characters to find common patterns
    # Keep only letters and spaces, remove numbers and punctuation
    normalized = re.sub(r'[^a-zA-Z\s]', '', desc).strip()
    # Remove extra spaces
    normalized = ' '.join(normalized.split())
    return normalized.lower()

def calculate_similarity(desc1, desc2):
    return difflib.SequenceMatcher(None, desc1, desc2).ratio()

def detect_recurring(csv_data):
    # Group by approximate amount only (within 10% tolerance) - ignore description to catch recurring payments from same merchant
    groups = defaultdict(list)
    for tx in csv_data:
        # Group amounts within 10% tolerance - use finer granularity for better accuracy
        amt_key = round(tx['amount'], 2)  # Use exact amount rounded to 2 decimals
        groups[amt_key].append(tx)

    candidates = []
    for amt_key, tx_list in groups.items():
        dates = [tx['date'] for tx in tx_list]
        amounts = [tx['amount'] for tx in tx_list]
        descriptions = [tx['description'] for tx in tx_list]

        if len(dates) >= 2:  # At least 2 occurrences
            # Sort dates
            sorted_indices = sorted(range(len(dates)), key=lambda i: dates[i])
            sorted_dates = [dates[i] for i in sorted_indices]
            sorted_amounts = [amounts[i] for i in sorted_indices]
            sorted_descriptions = [descriptions[i] for i in sorted_indices]

            # Check for regular intervals - be more lenient to avoid missing recurring transactions
            intervals = []
            for i in range(1, len(sorted_dates)):
                d1 = datetime.fromisoformat(sorted_dates[i-1])
                d2 = datetime.fromisoformat(sorted_dates[i])
                intervals.append((d2 - d1).days)

            if intervals:
                avg_interval = sum(intervals) / len(intervals)
                # Very lenient: within 7 days or 30% of average to catch irregular but still recurring patterns
                tolerance = max(7, avg_interval * 0.3)
                regular_intervals = all(abs(interval - avg_interval) <= tolerance for interval in intervals)

                # More lenient amount consistency check (within 10% instead of 20%)
                avg_amount = sum(sorted_amounts) / len(sorted_amounts)
                amount_consistent = all(abs(amt - avg_amount) / abs(avg_amount) <= 0.1 for amt in sorted_amounts)

                if regular_intervals and amount_consistent:
                    frequency = 'monthly' if avg_interval > 25 else 'weekly' if avg_interval > 5 else 'daily'
                    interval = 1 if avg_interval < 10 else round(avg_interval / 30) if frequency == 'monthly' else round(avg_interval / 7) if frequency == 'weekly' else round(avg_interval)

                    # Use most common description, or first if tie
                    desc_counts = defaultdict(int)
                    for desc in descriptions:
                        desc_counts[desc] += 1
                    most_common_desc = max(desc_counts, key=desc_counts.get)

                    # Get unique descriptions for user awareness
                    unique_descriptions = list(desc_counts.keys())

                    candidates.append({
                        'description': most_common_desc,
                        'amount': avg_amount,
                        'frequency': frequency,
                        'interval': interval,
                        'start_date': sorted_dates[0],  # First occurrence date
                        'last_date': sorted_dates[-1],   # Most recent occurrence
                        'occurrences': len(dates),
                        'unique_descriptions': len(unique_descriptions),
                        'description_examples': unique_descriptions[:3]  # Show up to 3 examples
                    })

    # Sort candidates by occurrences (most frequent first) to prioritize likely recurring transactions
    candidates.sort(key=lambda x: x['occurrences'], reverse=True)
    return candidates

@app.route('/api/import/csv/confirm', methods=['POST'])
def import_csv_confirm():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'File must be CSV'}), 400

    # Parse CSV
    csv_data = []
    stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
    reader = csv.reader(stream)
    for row in reader:
        if len(row) >= 3:
            date_str, amount_str, description = row[0], row[1], row[2]
            try:
                # Parse date DD/MM/YYYY to YYYY-MM-DD
                date_parts = date_str.split('/')
                if len(date_parts) == 3:
                    date = f"{date_parts[2]}-{date_parts[1].zfill(2)}-{date_parts[0].zfill(2)}"
                else:
                    continue
                amount = float(amount_str.strip('"'))
                csv_data.append({
                    'date': date,
                    'amount': amount,
                    'description': description.strip()
                })
            except ValueError:
                continue

    # Auto-confirm matching transactions
    result = auto_confirm_transactions(csv_data)

    return jsonify(result)

def auto_confirm_transactions(csv_data):
    confirmed_transactions = []
    potential_updates = []
    with get_db() as conn:
        for csv_tx in csv_data:
            # Find exact match
            exact_matches = conn.execute('''
                SELECT id, recurring_id FROM transactions
                WHERE date = ? AND amount = ? AND description = ? AND is_confirmed = FALSE
            ''', (csv_tx['date'], csv_tx['amount'], csv_tx['description'])).fetchall()

            if exact_matches:
                # Confirm the first match
                conn.execute('UPDATE transactions SET is_confirmed = TRUE WHERE id = ?', (exact_matches[0]['id'],))
                confirmed_transactions.append({
                    'description': csv_tx['description'],
                    'amount': csv_tx['amount'],
                    'date': csv_tx['date']
                })
                continue

            # Fuzzy matching with enhanced logic
            # Get all unconfirmed transactions for fuzzy comparison
            all_unconfirmed = conn.execute('''
                SELECT id, description, amount, date, recurring_id FROM transactions
                WHERE is_confirmed = FALSE
            ''').fetchall()

            best_match = None
            best_score = 0

            for db_tx in all_unconfirmed:
                # Date check with tolerance
                csv_date = datetime.fromisoformat(csv_tx['date'])
                db_date = datetime.fromisoformat(db_tx['date'])
                date_diff_days = abs((csv_date - db_date).days)

                if date_diff_days > 3:  # Skip if date difference > 3 days
                    continue

                # Normalize descriptions
                csv_norm = normalize_description(csv_tx['description'])
                db_norm = normalize_description(db_tx['description'])

                # Calculate similarity
                similarity = calculate_similarity(csv_norm, db_norm)

                # Amount difference
                amount_diff = abs(csv_tx['amount'] - db_tx['amount'])
                amount_ratio = amount_diff / abs(db_tx['amount']) if db_tx['amount'] != 0 else 1

                # Combined score (weighted)
                score = (similarity * 0.6) + ((1 - amount_ratio) * 0.3) + ((1 - date_diff_days/3) * 0.1)

                if score > best_score:
                    best_score = score
                    best_match = db_tx

            if best_match and best_score > 0.7:  # Minimum threshold
                csv_norm = normalize_description(csv_tx['description'])
                db_norm = normalize_description(best_match['description'])
                similarity = calculate_similarity(csv_norm, db_norm)
                amount_diff = abs(csv_tx['amount'] - best_match['amount'])
                amount_ratio = amount_diff / abs(best_match['amount']) if best_match['amount'] != 0 else 1

                if best_score > 0.9 and amount_ratio < 0.05:  # High confidence auto-confirm
                    conn.execute('UPDATE transactions SET is_confirmed = TRUE WHERE id = ?', (best_match['id'],))
                    confirmed_transactions.append({
                        'description': csv_tx['description'],
                        'amount': csv_tx['amount'],
                        'date': csv_tx['date']
                    })
                else:
                    # Potential update for user review
                    potential_updates.append({
                        'transaction_id': best_match['id'],
                        'recurring_id': best_match['recurring_id'],
                        'old_amount': best_match['amount'],
                        'new_amount': csv_tx['amount'],
                        'csv_description': csv_tx['description'],
                        'db_description': best_match['description'],
                        'csv_date': csv_tx['date'],
                        'db_date': best_match['date'],
                        'similarity_score': best_score,
                        'amount_difference': amount_ratio
                    })

    return {'confirmed_transactions': confirmed_transactions, 'potential_updates': potential_updates}

@app.route('/api/import/confirm_update', methods=['POST'])
def confirm_update():
    data = request.get_json()
    transaction_id = data['transaction_id']
    recurring_id = data['recurring_id']
    new_amount = data['new_amount']
    update_future = data.get('update_future', False)

    with get_db() as conn:
        # Use a single transaction for atomicity and better performance
        # Confirm the transaction and update its amount
        conn.execute('UPDATE transactions SET is_confirmed = TRUE, amount = ? WHERE id = ?', (new_amount, transaction_id))

        if update_future and recurring_id:
            # Update the recurring rule
            conn.execute('UPDATE recurring_transactions SET amount = ? WHERE id = ?', (new_amount, recurring_id))
            # Update all future unconfirmed transactions in one query
            conn.execute('''
                UPDATE transactions
                SET amount = ?
                WHERE recurring_id = ? AND date > ? AND is_confirmed = FALSE
            ''', (new_amount, recurring_id, datetime.now().strftime('%Y-%m-%d')))

    return jsonify({'message': 'Updated successfully'})

@app.route('/api/transactions/<int:id>/confirm', methods=['PUT'])
def confirm_single_transaction(id):
    """Optimized endpoint for confirming a single transaction"""
    with get_db() as conn:
        # Check if transaction exists and get its current state
        tx = conn.execute('SELECT is_confirmed FROM transactions WHERE id = ?', (id,)).fetchone()
        if not tx:
            return jsonify({'error': 'Transaction not found'}), 404

        if tx['is_confirmed']:
            return jsonify({'message': 'Transaction already confirmed'})

        # Confirm the transaction
        conn.execute('UPDATE transactions SET is_confirmed = TRUE WHERE id = ?', (id,))

    return jsonify({'message': 'Transaction confirmed'})

def get_user_preference():
    """Get current user's show_advanced preference (single-user id=1)"""
    with get_db() as conn:
        user = conn.execute('SELECT show_advanced FROM users WHERE id = ?', (1,)).fetchone()
        if user:
            return user['show_advanced']
        return False

def update_user_preference(show_advanced):
    """Update user's show_advanced preference (only allow setting to true)"""
    with get_db() as conn:
        if show_advanced:
            conn.execute('UPDATE users SET show_advanced = ? WHERE id = ?', (True, 1))
            return True
        return False  # Ignore false, no change

@app.route('/api/user/preferences', methods=['GET'])
def get_preferences():
    """Retrieve the user's show_advanced preference"""
    try:
        show_advanced = get_user_preference()
        return jsonify({'show_advanced': show_advanced})
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/user/preferences', methods=['POST'])
def update_preferences():
    """Update user's show_advanced preference (only to true)"""
    try:
        data = request.get_json()
        if not data or 'show_advanced' not in data:
            return jsonify({'error': 'Invalid data: show_advanced required'}), 400
        
        show_advanced = data['show_advanced']
        if not isinstance(show_advanced, bool):
            return jsonify({'error': 'show_advanced must be boolean'}), 400
        
        if update_user_preference(show_advanced):
            return jsonify({'message': 'Preference updated'}), 200
        
        # If false, just return success without changing
        return jsonify({'message': 'Preference unchanged (only true allowed)'}), 200
        
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON'}), 400
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get all settings as JSON"""
    with get_db() as conn:
        rows = conn.execute('SELECT key, value FROM settings').fetchall()
        settings = {}
        for row in rows:
            try:
                # Parse value based on key type
                value = row['value']
                key = row['key']
                if key in ['recurring_sensitivity', 'auto_confirm_sensitivity']:
                    settings[key] = float(value)
                elif key == 'forecast_period':
                    settings[key] = int(value)
                elif key in ['custom_recurring_algorithm', 'custom_auto_confirm_algorithm']:
                    settings[key] = json.loads(value)
                else:
                    settings[key] = value
            except (ValueError, json.JSONDecodeError):
                settings[key] = value  # Fallback to string
    
    return jsonify(settings)

@app.route('/api/settings', methods=['POST'])
def update_settings():
    """Update settings with validation"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Validation rules
    valid_date_formats = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MMM DD, YYYY', 'DD-MMMM-YYYY', 'DD-MMM-YY']
    
    updated_settings = {}
    errors = []
    
    with get_db() as conn:
        for key, value in data.items():
            if key == 'recurring_sensitivity' or key == 'auto_confirm_sensitivity':
                try:
                    val = float(value)
                    if not 0.0 <= val <= 1.0:
                        errors.append(f'{key} must be between 0.0 and 1.0')
                        continue
                    updated_settings[key] = val
                    conn.execute(
                        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                        (key, str(val))
                    )
                except ValueError:
                    errors.append(f'{key} must be a number')
            
            elif key == 'forecast_period':
                try:
                    val = int(value)
                    if val < 1 or val > 120:
                        errors.append('forecast_period must be between 1 and 120')
                        continue
                    updated_settings[key] = val
                    conn.execute(
                        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                        (key, str(val))
                    )
                except ValueError:
                    errors.append('forecast_period must be an integer')
            
            elif key in ['custom_recurring_algorithm', 'custom_auto_confirm_algorithm']:
                try:
                    json_val = json.dumps(value) if isinstance(value, (dict, list)) else str(value)
                    updated_settings[key] = value
                    conn.execute(
                        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                        (key, json_val)
                    )
                except (TypeError, ValueError):
                    errors.append(f'{key} must be valid JSON')
            
            elif key == 'date_format':
                if value not in valid_date_formats:
                    errors.append(f'date_format must be one of: {valid_date_formats}')
                    continue
                updated_settings[key] = value
                conn.execute(
                    'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                    (key, value)
                )
            
            else:
                errors.append(f'Unknown setting: {key}')
        
        conn.commit()
    
    if errors:
        return jsonify({'errors': errors}), 400
    
    # Return updated settings (only the ones that were updated)
    return jsonify({'message': 'Settings updated', 'updated': updated_settings})

# Restore defaults endpoint (bonus, but useful)
@app.route('/api/settings/<key>/restore', methods=['POST'])
def restore_default(key):
    """Restore default for a specific setting"""
    defaults = {
        'recurring_sensitivity': 0.8,
        'auto_confirm_sensitivity': 0.7,
        'custom_recurring_algorithm': {
            "min_occurrences": 2,
            "interval_tolerance": 0.3,
            "amount_tolerance": 0.1,
            "frequency_detection": {
                "daily": 1,
                "weekly": 7,
                "monthly": 30
            }
        },
        'custom_auto_confirm_algorithm': {
            "similarity_threshold": 0.7,
            "amount_tolerance": 0.05,
            "date_diff_max": 3,
            "high_confidence": {
                "similarity": 0.9,
                "amount": 0.01
            }
        },
        'date_format': 'DD-MMMM-YYYY',
        'forecast_period': 12
    }
    
    if key not in defaults:
        return jsonify({'error': 'Unknown setting'}), 400
    
    default_value = defaults[key]
    with get_db() as conn:
        conn.execute(
            'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            (key, json.dumps(default_value) if isinstance(default_value, (dict, list)) else str(default_value))
        )
        conn.commit()
    
    return jsonify({'message': f'{key} restored to default', 'value': default_value})

if __name__ == '__main__':
    init_db()
    init_settings()
    try:
        app.run(host='0.0.0.0', port=5000, debug=True)
    except OSError as e:
        if 'Address already in use' in str(e):
            print(f"Error: Port 5000 is already in use. Please free up the port or stop the conflicting service.")
            exit(1)
        else:
            raise
