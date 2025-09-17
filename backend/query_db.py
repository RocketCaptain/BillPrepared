import sqlite3

conn = sqlite3.connect('budget.db')
cursor = conn.cursor()

print('Recurring Transactions:')
cursor.execute('SELECT * FROM recurring_transactions')
for row in cursor.fetchall():
    print(row)

print('\nAll Transactions:')
cursor.execute('SELECT * FROM transactions')
for row in cursor.fetchall():
    print(row)

print('\nGenerated Transactions:')
cursor.execute('SELECT * FROM transactions WHERE recurring_id IS NOT NULL')
for row in cursor.fetchall():
    print(row)

conn.close()