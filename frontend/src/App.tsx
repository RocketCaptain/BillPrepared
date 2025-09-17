import { useState, useEffect } from 'react'
import './App.css'
import SettingsPage from './components/SettingsPage'

interface Transaction {
  id: number
  description: string
  amount: number
  date: string
  label?: string
  is_recurring: boolean
  recurring_id?: number
  is_confirmed: boolean
}

interface RecurringCandidate {
  description: string
  amount: number
  frequency: string
  interval: number
  start_date: string
  last_date: string
  label?: string
  occurrences: number
}

interface PotentialUpdate {
  transaction_id: number
  recurring_id: number | null
  old_amount: number
  new_amount: number
  csv_description: string
  db_description: string
  csv_date: string
  db_date: string
  similarity_score?: number
  amount_difference?: number
}

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [newTransaction, setNewTransaction] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    label: '',
    isRecurring: false,
    frequency: 'monthly',
    interval: 1,
    endDate: ''
  })
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [editType, setEditType] = useState<'single' | 'future'>('single')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [recurringCandidates, setRecurringCandidates] = useState<RecurringCandidate[]>([])
  const [showRecurringReview, setShowRecurringReview] = useState(false)
  const [potentialUpdates, setPotentialUpdates] = useState<PotentialUpdate[]>([])
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)
  const [currentUpdate, setCurrentUpdate] = useState<PotentialUpdate | null>(null)
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null)
  const [confirmedTransactions, setConfirmedTransactions] = useState<any[]>([])
  const [showConfirmedModal, setShowConfirmedModal] = useState(false)
  const [addedCandidates, setAddedCandidates] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [confirmingTransactions, setConfirmingTransactions] = useState<Set<number>>(new Set())
  const [hideConfirmed, setHideConfirmed] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('auto')
  const [showThemeMenu, setShowThemeMenu] = useState(false)

  // Fetch settings on app load for date formatting
  const [appSettings, setAppSettings] = useState({ date_format: 'YYYY-MM-DD', forecast_period: 12 });

  const fetchAppSettings = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/settings`);
      if (response.ok) {
        const data = await response.json();
        console.log('DEBUG: Fetched app settings:', data);
        setAppSettings(data);
      }
    } catch (error) {
      console.error('DEBUG: Failed to fetch app settings:', error);
    }
  };

  useEffect(() => {
    fetchAppSettings();
  }, []);
  useEffect(() => {
    fetchBalance()
    fetchTransactions()
  }, [appSettings]) // Re-fetch when settings change, e.g., forecast_period

  useEffect(() => {
    const handleClickOutside = () => {
      setActionMenuOpen(null)
    }
    if (actionMenuOpen !== null) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [actionMenuOpen])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.dropdown')) {
        setShowThemeMenu(false)
      }
    }
    if (showThemeMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showThemeMenu])

  // Theme initialization and management
  useEffect(() => {
    console.log('Theme init useEffect triggered');
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'auto' | null
    console.log('Saved theme from localStorage:', savedTheme);
    const initialTheme = savedTheme || 'auto'
    console.log('Initial theme set to:', initialTheme);
    setTheme(initialTheme)
    applyTheme(initialTheme)
  }, [])

  useEffect(() => {
    console.log('Media query useEffect triggered for theme:', theme);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      console.log('System theme preference changed');
      if (theme === 'auto') {
        applyTheme('auto')
      }
    }

    if (theme === 'auto') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  // Diagnostic log for sidebar render
  useEffect(() => {
    console.log('App component mounted - sidebar should be rendered');
  }, []);

  const applyTheme = (newTheme: 'light' | 'dark' | 'auto') => {
    console.log('applyTheme called with:', newTheme);
    const body = document.body
    if (newTheme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      console.log('System prefers dark:', prefersDark);
      body.classList.toggle('dark-mode', prefersDark)
      console.log('Body classList after toggle:', body.className);
    } else {
      body.classList.toggle('dark-mode', newTheme === 'dark')
      console.log('Body classList after toggle:', body.className);
    }
  }
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const monthNum = date.getMonth() + 1;
    const month = monthNum.toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const shortMonth = date.toLocaleDateString('en-US', { month: 'short' });

    const format = appSettings.date_format;
    switch (format) {
      case 'MM/DD/YYYY':
        return `${month}/${day}/${year}`;
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'DD-MM-YYYY':
        return `${day}-${month}-${year}`;
      case 'MMM DD, YYYY':
        return `${shortMonth} ${day}, ${year}`;
      case 'DD-MMMM-YYYY':
        const partsLong = new Intl.DateTimeFormat('en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }).formatToParts(date);
        const dayLong = partsLong.find(p => p.type === 'day')?.value || '';
        const monthLong = partsLong.find(p => p.type === 'month')?.value || '';
        const yearLong = partsLong.find(p => p.type === 'year')?.value || '';
        return `${dayLong.padStart(2, '0')}-${monthLong}-${yearLong}`;
      case 'DD-MMM-YY':
        const partsShort = new Intl.DateTimeFormat('en-US', {
          day: 'numeric',
          month: 'short',
          year: '2-digit'
        }).formatToParts(date);
        const dayShort = partsShort.find(p => p.type === 'day')?.value || '';
        const monthShort = partsShort.find(p => p.type === 'month')?.value || '';
        const yearShort = partsShort.find(p => p.type === 'year')?.value || '';
        return `${dayShort.padStart(2, '0')}-${monthShort}-${yearShort}`;
      default:
        // Fallback to new format
        const fallbackDate = new Intl.DateTimeFormat('en-US', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        }).format(date);
        return fallbackDate.replace(/\s/g, '-');
    }
  }

  const changeTheme = (newTheme: 'light' | 'dark' | 'auto') => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    applyTheme(newTheme)
    setShowThemeMenu(false)
  }

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
  console.log('API URL resolved to:', apiUrl);


  const fetchBalance = async () => {
    console.log('Fetching balance from:', `${apiUrl}/api/balance`);
    setLoading(true)
    try {
      const response = await fetch(`${apiUrl}/api/balance`)
      if (!response.ok) {
        console.error('Balance fetch failed with status:', response.status);
      }
      const data = await response.json()
      setBalance(data.balance)
    } catch (error) {
      console.error('Error fetching balance:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTransactions = async () => {
    console.log('Fetching transactions from:', `${apiUrl}/api/transactions`);
    setLoading(true)
    try {
      const startDate = new Date()
      startDate.setMonth(startDate.getMonth() - 1)
      const endDate = new Date()
      const forecastMonths = appSettings.forecast_period || 12;
      endDate.setMonth(endDate.getMonth() + forecastMonths)

      const response = await fetch(`${apiUrl}/api/transactions?start_date=${startDate.toISOString().split('T')[0]}&end_date=${endDate.toISOString().split('T')[0]}&forecast_period=${forecastMonths}`)
      if (!response.ok) {
        console.error('Transactions fetch failed with status:', response.status);
      }
      const data = await response.json()
      setTransactions(data)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const addTransaction = async () => {
    const amount = parseFloat(newTransaction.amount)
    if (isNaN(amount)) {
      alert('Please enter a valid amount')
      return
    }

    if (newTransaction.isRecurring) {
      const response = await fetch(`${apiUrl}/api/recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: newTransaction.description,
          amount: amount,
          start_date: newTransaction.date,
          label: newTransaction.label,
          frequency: newTransaction.frequency,
          interval: newTransaction.interval,
          end_date: newTransaction.endDate || null
        })
      })
      if (response.ok) {
        setNewTransaction({ description: '', amount: '', date: new Date().toISOString().split('T')[0], label: '', isRecurring: false, frequency: 'monthly', interval: 1, endDate: '' })
        fetchTransactions()
      } else {
        alert('Failed to add recurring transaction')
      }
    } else {
      const response = await fetch(`${apiUrl}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: newTransaction.description,
          amount: amount,
          date: newTransaction.date,
          label: newTransaction.label
        })
      })
      if (response.ok) {
        setNewTransaction({ description: '', amount: '', date: new Date().toISOString().split('T')[0], label: '', isRecurring: false, frequency: 'monthly', interval: 1, endDate: '' })
        fetchTransactions()
      } else {
        alert('Failed to add transaction')
      }
    }
  }

  const confirmTransaction = async (id: number, confirmed: boolean) => {
    // Add to confirming set for loading state
    setConfirmingTransactions(prev => new Set([...prev, id]))

    try {
      // Use optimized endpoint for confirmation
      const endpoint = confirmed
        ? `${apiUrl}/api/transactions/${id}/confirm`
        : `${apiUrl}/api/transactions/${id}`

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: confirmed ? undefined : JSON.stringify({ is_confirmed: confirmed })
      })

      if (response.ok) {
        // Optimistic update - immediately update the UI
        setTransactions(prevTransactions =>
          prevTransactions.map(tx =>
            tx.id === id ? { ...tx, is_confirmed: confirmed } : tx
          )
        )
      } else {
        console.error('Failed to confirm transaction')
        // Revert optimistic update by refetching
        fetchTransactions()
      }
    } catch (error) {
      console.error('Error confirming transaction:', error)
      fetchTransactions()
    } finally {
      // Remove from confirming set
      setConfirmingTransactions(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  const deleteTransaction = async (id: number, type: 'single' | 'future' = 'single') => {
    const confirmMsg = type === 'single' ? 'this transaction' : 'all future transactions'
    if (window.confirm(`Are you sure you want to delete ${confirmMsg}?`)) {
      await fetch(`${apiUrl}/api/transactions/${id}?delete_type=${type}`, { method: 'DELETE' })
      fetchTransactions()
    }
  }

  const startEdit = (tx: Transaction) => {
    setEditingTransaction(tx)
    setEditType('single')
  }

  const cancelEdit = () => {
    setEditingTransaction(null)
  }

  const saveEdit = async () => {
    if (!editingTransaction) return

    // Prevent saving if amount is invalid
    if (isNaN(editingTransaction.amount)) {
      alert('Please enter a valid amount')
      return
    }

    const response = await fetch(`${apiUrl}/api/transactions/${editingTransaction.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: editingTransaction.description,
        amount: editingTransaction.amount,
        date: editingTransaction.date,
        label: editingTransaction.label,
        edit_type: editType
      })
    })
    if (response.ok) {
      // Optimistic update
      const updatedTransactions = transactions.map(tx =>
        tx.id === editingTransaction.id ? editingTransaction : tx
      )
      setTransactions(updatedTransactions)
      setEditingTransaction(null)
      // Fetch to ensure consistency
      fetchTransactions()
    } else {
      alert('Failed to update transaction')
    }
  }

  const uploadCsvForRecurring = async () => {
    if (!csvFile) {
      alert('Please select a CSV file')
      return
    }

    const formData = new FormData()
    formData.append('file', csvFile)

    const response = await fetch(`${apiUrl}/api/import/csv/recurring`, {
      method: 'POST',
      body: formData
    })

    if (response.ok) {
      const data = await response.json()
      setRecurringCandidates(data.recurring_candidates)
      setShowRecurringReview(true)
    } else {
      alert('Failed to process CSV')
    }
  }

  const uploadCsvForConfirm = async () => {
    if (!csvFile) {
      alert('Please select a CSV file')
      return
    }

    const formData = new FormData()
    formData.append('file', csvFile)

    const response = await fetch(`${apiUrl}/api/import/csv/confirm`, {
      method: 'POST',
      body: formData
    })

    if (response.ok) {
      const data = await response.json()
      if (data.confirmed_transactions.length > 0) {
        setConfirmedTransactions(data.confirmed_transactions)
        setShowConfirmedModal(true)
      } else {
        alert('No transactions were auto-confirmed')
      }
      if (data.potential_updates.length > 0) {
        setPotentialUpdates(data.potential_updates)
        setCurrentUpdate(data.potential_updates[0])
        setShowUpdatePrompt(true)
      }
      fetchTransactions()
    } else {
      alert('Failed to process CSV')
    }
  }

  const handleUpdateDecision = async (updateFuture: boolean) => {
    if (!currentUpdate) return

    const response = await fetch(`${apiUrl}/api/import/confirm_update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: currentUpdate.transaction_id,
        recurring_id: currentUpdate.recurring_id,
        new_amount: currentUpdate.new_amount,
        update_future: updateFuture
      })
    })

    if (response.ok) {
      // Remove this update from the list
      const remaining = potentialUpdates.filter(u => u.transaction_id !== currentUpdate.transaction_id)
      setPotentialUpdates(remaining)
      if (remaining.length > 0) {
        setCurrentUpdate(remaining[0])
      } else {
        setShowUpdatePrompt(false)
        setCurrentUpdate(null)
      }
      fetchTransactions()
    } else {
      alert('Failed to update')
    }
  }

  const addRecurringFromCandidate = async (candidate: RecurringCandidate, index: number) => {
    // Add the last transaction as confirmed
    const lastTxResponse = await fetch(`${apiUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: candidate.description,
        amount: candidate.amount,
        date: candidate.last_date,
        label: candidate.label,
        is_confirmed: true
      })
    })

    if (!lastTxResponse.ok) {
      alert('Failed to add last transaction')
      return
    }

    // Add the recurring rule starting from last_date
    const response = await fetch(`${apiUrl}/api/recurring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: candidate.description,
        amount: candidate.amount,
        start_date: candidate.last_date, // Start from last occurrence
        label: candidate.label,
        frequency: candidate.frequency,
        interval: candidate.interval
      })
    })
    if (response.ok) {
      // Mark as added and refresh transactions
      setAddedCandidates(prev => new Set([...prev, index]))
      fetchTransactions()
    } else {
      alert('Failed to add recurring transaction')
    }
  }


  return (
    <div className="wrapper">
      {/* Navbar */}
      <nav className="main-header navbar navbar-expand navbar-white navbar-light">
        <ul className="navbar-nav">
          <li className="nav-item">
            <a className="nav-link" data-widget="pushmenu" href="#" role="button">
              <i className="fas fa-bars"></i>
            </a>
          </li>
          <li className="nav-item d-none d-sm-inline-block">
            <a href="#" className="nav-link">Home</a>
          </li>
        </ul>
        <ul className="navbar-nav ml-auto">
          <li className="nav-item">
            <span className="nav-link">
              <i className="fas fa-wallet"></i> BillPrepared
            </span>
          </li>
          <li className="nav-item dropdown">
            <a
              className="nav-link"
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setShowThemeMenu(!showThemeMenu)
              }}
              style={{ cursor: 'pointer' }}
            >
              <i className={`fas ${theme === 'dark' ? 'fa-moon' : theme === 'light' ? 'fa-sun' : 'fa-adjust'}`}></i>
            </a>
            {showThemeMenu && (
              <div className="dropdown-menu dropdown-menu-right show" style={{ position: 'absolute', right: 0, zIndex: 1000 }}>
                <a
                  className={`dropdown-item ${theme === 'light' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    changeTheme('light')
                  }}
                >
                  <i className="fas fa-sun mr-2"></i> Light
                </a>
                <a
                  className={`dropdown-item ${theme === 'dark' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    changeTheme('dark')
                  }}
                >
                  <i className="fas fa-moon mr-2"></i> Dark
                </a>
                <a
                  className={`dropdown-item ${theme === 'auto' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    changeTheme('auto')
                  }}
                >
                  <i className="fas fa-adjust mr-2"></i> Auto
                </a>
              </div>
            )}
          </li>
        </ul>
      </nav>

      {/* Main Sidebar Container */}
      <aside className="main-sidebar sidebar-dark-primary elevation-4">
        <a href="#" className="brand-link">
          <img src="/billprepared_logo.png" alt="BillPrepared Logo" className="brand-text" style={{ height: '52px', width: 'auto', marginTop: '5px' }} />
        </a>
        <div className="sidebar">
          <nav className="mt-2">
            <ul className="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu">
              <li className="nav-item">
                <a href="#" className={`nav-link ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentPage('dashboard')}>
                  <i className="nav-icon fas fa-tachometer-alt"></i>
                  <p>Dashboard</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="#" className={`nav-link ${currentPage === 'add-transaction' ? 'active' : ''}`} onClick={() => setCurrentPage('add-transaction')}>
                  <i className="nav-icon fas fa-plus"></i>
                  <p>Add Transaction</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="#" className={`nav-link ${currentPage === 'transactions' ? 'active' : ''}`} onClick={() => setCurrentPage('transactions')}>
                  <i className="nav-icon fas fa-list"></i>
                  <p>Transactions</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="#" className={`nav-link ${currentPage === 'import-csv' ? 'active' : ''}`} onClick={() => setCurrentPage('import-csv')}>
                  <i className="nav-icon fas fa-upload"></i>
                  <p>Import CSV</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="#" className={`nav-link ${currentPage === 'settings' ? 'active' : ''}`} onClick={() => setCurrentPage('settings')}>
                  <i className="nav-icon fas fa-cog"></i>
                  <p>Settings</p>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </aside>

      {/* Content Wrapper */}
      <div className="content-wrapper">
        <div className="content-header">
          <div className="container-fluid">
            <div className="row mb-2">
              <div className="col-sm-6">
                <h1 className="m-0">
                  {currentPage === 'dashboard' && 'Dashboard'}
                  {currentPage === 'add-transaction' && 'Add Transaction'}
                  {currentPage === 'transactions' && 'Transactions'}
                  {currentPage === 'import-csv' && 'Import CSV'}
                </h1>
              </div>
              <div className="col-sm-6">
                <ol className="breadcrumb float-sm-right">
                  <li className="breadcrumb-item"><a href="#" onClick={() => setCurrentPage('dashboard')}>Home</a></li>
                  <li className="breadcrumb-item active">
                    {currentPage === 'dashboard' && 'Dashboard'}
                    {currentPage === 'add-transaction' && 'Add Transaction'}
                    {currentPage === 'transactions' && 'Transactions'}
                    {currentPage === 'import-csv' && 'Import CSV'}
                    {currentPage === 'settings' && 'Settings'}
                    {currentPage === 'settings' && 'Settings'}
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <section className="content">
          <div className="container-fluid">
            {currentPage === 'dashboard' && (
              <>
                {/* Balance Info Box */}
                <div className="row">
                  <div className="col-lg-3 col-6">
                    <div className="small-box bg-info">
                      <div className="inner">
                        <h3>${balance.toFixed(2)}</h3>
                        <p>Current Balance</p>
                      </div>
                      <div className="icon">
                        <i className="fas fa-wallet"></i>
                      </div>
                      <div className="small-box-footer">
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          value={balance}
                          onChange={(e) => setBalance(parseFloat(e.target.value))}
                          onBlur={() => fetch('/api/balance', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ balance })
                          })}
                          style={{ background: 'transparent', border: 'none', color: 'white' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Transactions Preview */}
                <div className="row">
                  <div className="col-md-12">
                    <div className="card">
                      <div className="card-header">
                        <h3 className="card-title">Upcoming Transactions</h3>
                        <div className="card-tools">
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCurrentPage('transactions')}>
                            <i className="fas fa-list"></i> View All
                          </button>
                        </div>
                      </div>
                      <div className="card-body table-responsive p-0">
                        {loading ? (
                          <div className="text-center p-4">
                            <div className="spinner-border text-primary" role="status">
                              <span className="sr-only">Loading...</span>
                            </div>
                            <p className="mt-2">Loading transactions...</p>
                          </div>
                        ) : transactions.filter(tx => !tx.is_confirmed).length === 0 ? (
                          <div className="text-center p-4">
                            <i className="fas fa-inbox fa-3x text-muted mb-3"></i>
                            <h5>No upcoming transactions</h5>
                            <p className="text-muted">Get started by adding your first transaction or importing a CSV file.</p>
                            <div className="mt-3">
                              <button type="button" className="btn btn-primary mr-2" onClick={() => setCurrentPage('add-transaction')}>
                                <i className="fas fa-plus"></i> Add Transaction
                              </button>
                              <button type="button" className="btn btn-secondary" onClick={() => setCurrentPage('import-csv')}>
                                <i className="fas fa-upload"></i> Import CSV
                              </button>
                            </div>
                          </div>
                        ) : (
                          <table className="table table-hover text-nowrap">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Amount</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {transactions.filter(tx => !tx.is_confirmed).slice(0, 5).map((tx) => (
                                <tr key={tx.id}>
                                  <td>{formatDate(tx.date)}</td>
                                  <td>{tx.description}</td>
                                  <td className={tx.amount >= 0 ? 'text-success' : 'text-danger'}>
                                    ${tx.amount.toFixed(2)}
                                  </td>
                                  <td>
                                    {tx.is_confirmed ? (
                                      <span className="badge badge-success">Confirmed</span>
                                    ) : (
                                      <span className="badge badge-warning">Pending</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              {/* Forecast Section */}
              <div className="row mt-4">
                <div className="col-md-12">
                  <div className="card">
                    <div className="card-header d-flex justify-content-between align-items-center">
                      <h3 className="card-title mb-0">Financial Forecast ({appSettings.forecast_period || 12} Months)</h3>
                      <small className="text-muted">Projected balance based on recurring transactions</small>
                    </div>
                    <div className="card-body">
                      {loading ? (
                        <div className="text-center p-4">
                          <div className="spinner-border text-primary" role="status">
                            <span className="sr-only">Loading...</span>
                          </div>
                          <p className="mt-2">Calculating forecast...</p>
                        </div>
                      ) : (
                        <>
                          {/* Monthly Breakdown */}
                          <div className="table-responsive mb-4">
                            <table className="table table-sm">
                              <thead>
                                <tr>
                                  <th>Month</th>
                                  <th>Projected Income/Expenses</th>
                                  <th>Running Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  const forecastMonths = appSettings.forecast_period || 12;
                                  const monthlyProjections = [];
                                  let runningBalance = balance;
                                  const now = new Date();
                                  for (let i = 0; i < forecastMonths; i++) {
                                    const monthDate = new Date(now);
                                    monthDate.setMonth(now.getMonth() + i + 1); // Start from next month
                                    
                                    // Filter transactions for this month (including projected recurring)
                                    const monthTransactions = transactions.filter(tx => {
                                      const txDate = new Date(tx.date);
                                      return txDate.getFullYear() === monthDate.getFullYear() &&
                                             txDate.getMonth() === monthDate.getMonth();
                                    });
                                    
                                    const monthTotal = monthTransactions.reduce((sum, tx) => sum + tx.amount, 0);
                                    runningBalance += monthTotal;
                                    
                                    monthlyProjections.push({
                                      month: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                                      total: monthTotal,
                                      balance: runningBalance
                                    });
                                  }
                                  return monthlyProjections.map((proj, index) => (
                                    <tr key={index}>
                                      <td>{proj.month}</td>
                                      <td className={proj.total >= 0 ? 'text-success' : 'text-danger'}>
                                        ${proj.total.toFixed(2)}
                                      </td>
                                      <td className={proj.balance >= 0 ? 'text-success' : 'text-danger'}>
                                        ${proj.balance.toFixed(2)}
                                      </td>
                                    </tr>
                                  ));
                                })()}
                              </tbody>
                            </table>
                          </div>
                          
                          {/* Summary */}
                          <div className="row">
                            <div className="col-md-6">
                              <div className="info-box bg-success">
                                <div className="info-box-content">
                                  <span className="info-box-text">End of Period Balance</span>
                                  <span className="info-box-number">${(() => {
                                    const forecastMonths = appSettings.forecast_period || 12;
                                    let endBalance = balance;
                                    const now = new Date();
                                    for (let i = 0; i < forecastMonths; i++) {
                                      const monthDate = new Date(now);
                                      monthDate.setMonth(now.getMonth() + i + 1);
                                      const monthTx = transactions.filter(tx => {
                                        const txDate = new Date(tx.date);
                                        return txDate.getFullYear() === monthDate.getFullYear() &&
                                               txDate.getMonth() === monthDate.getMonth();
                                      });
                                      endBalance += monthTx.reduce((sum, tx) => sum + tx.amount, 0);
                                    }
                                    return endBalance.toFixed(2);
                                  })()}</span>
                                </div>
                              </div>
                            </div>
                            <div className="col-md-6">
                              <div className="info-box bg-info">
                                <div className="info-box-content">
                                  <span className="info-box-text">Avg Monthly Change</span>
                                  <span className="info-box-number">${(() => {
                                    const forecastMonths = appSettings.forecast_period || 12;
                                    const totalChange = transactions.reduce((sum, tx) => sum + tx.amount, 0);
                                    return (totalChange / forecastMonths).toFixed(2);
                                  })()}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {transactions.filter(tx => tx.is_recurring).length === 0 && (
                            <div className="alert alert-info mt-3">
                              <i className="fas fa-info-circle"></i> No recurring transactions found. Add some recurring expenses/income for better forecasts.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </>
            )}

            {currentPage === 'add-transaction' && (
              /* Add Transaction Card */
              <div className="row">
                <div className="col-md-12">
                  <div className="card card-primary">
                    <div className="card-header">
                      <h3 className="card-title">Add Transaction</h3>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>Description</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Description"
                              value={newTransaction.description}
                              onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>Label/Category</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Category label (optional)"
                              value={newTransaction.label}
                              onChange={(e) => setNewTransaction({ ...newTransaction, label: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-md-4">
                          <div className="form-group">
                            <label>Amount</label>
                            <input
                              type="number"
                              className="form-control"
                              placeholder="Amount"
                              value={newTransaction.amount}
                              onChange={(e) => setNewTransaction({ ...newTransaction, amount: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="col-md-4">
                          <div className="form-group">
                            <label>{newTransaction.isRecurring ? 'Start Date' : 'Date'}</label>
                            <input
                              type="date"
                              className="form-control"
                              value={newTransaction.date}
                              onChange={(e) => setNewTransaction({ ...newTransaction, date: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="col-md-4">
                          <div className="form-group">
                            <label>&nbsp;</label>
                            <div className="icheck-primary">
                              <input
                                type="checkbox"
                                id="isRecurring"
                                checked={newTransaction.isRecurring}
                                onChange={(e) => setNewTransaction({ ...newTransaction, isRecurring: e.target.checked })}
                              />
                              <label htmlFor="isRecurring">Recurring</label>
                            </div>
                          </div>
                        </div>
                      </div>
                      {newTransaction.isRecurring && (
                        <div className="row">
                          <div className="col-md-4">
                            <div className="form-group">
                              <label>Frequency</label>
                              <select
                                className="form-control"
                                value={newTransaction.frequency}
                                onChange={(e) => setNewTransaction({ ...newTransaction, frequency: e.target.value })}
                              >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                              </select>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div className="form-group">
                              <label>Interval</label>
                              <input
                                type="number"
                                className="form-control"
                                placeholder="Interval"
                                value={newTransaction.interval}
                                onChange={(e) => setNewTransaction({ ...newTransaction, interval: parseInt(e.target.value) })}
                                min="1"
                              />
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div className="form-group">
                              <label>End Date (optional)</label>
                              <input
                                type="date"
                                className="form-control"
                                value={newTransaction.endDate}
                                onChange={(e) => setNewTransaction({ ...newTransaction, endDate: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="card-footer">
                      <button type="button" className="btn btn-primary" onClick={addTransaction}>
                        <i className="fas fa-plus"></i> Add Transaction
                      </button>
                      <button type="button" className="btn btn-secondary ml-2" onClick={() => setCurrentPage('dashboard')}>
                        <i className="fas fa-arrow-left"></i> Back to Dashboard
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentPage === 'transactions' && (
              /* Transactions Table Card */
              <div className="row">
                <div className="col-md-12">
                  <div className="card">
                    <div className="card-header">
                      <h3 className="card-title">All Transactions</h3>
                      <div className="card-tools">
                        <button type="button" className="btn btn-warning btn-sm mr-2" onClick={() => setHideConfirmed(!hideConfirmed)}>
                          <i className="fas fa-eye-slash"></i> {hideConfirmed ? 'Show Confirmed' : 'Hide Confirmed'}
                        </button>
                        <button type="button" className="btn btn-success btn-sm" onClick={() => setCurrentPage('add-transaction')}>
                          <i className="fas fa-plus"></i> Add Transaction
                        </button>
                      </div>
                    </div>
                    <div className="card-body table-responsive p-0">
                      {(() => {
                        const filteredTransactions = transactions.filter(tx => !hideConfirmed || !tx.is_confirmed)
                        return loading ? (
                          <div className="text-center p-4">
                            <div className="spinner-border text-primary" role="status">
                              <span className="sr-only">Loading...</span>
                            </div>
                            <p className="mt-2">Loading transactions...</p>
                          </div>
                        ) : filteredTransactions.length === 0 ? (
                          <div className="text-center p-4">
                            <i className="fas fa-inbox fa-3x text-muted mb-3"></i>
                            <h5>No transactions found</h5>
                            <p className="text-muted">Get started by adding your first transaction or importing a CSV file.</p>
                            <div className="mt-3">
                              <button type="button" className="btn btn-primary mr-2" onClick={() => setCurrentPage('add-transaction')}>
                                <i className="fas fa-plus"></i> Add Transaction
                              </button>
                              <button type="button" className="btn btn-secondary" onClick={() => setCurrentPage('import-csv')}>
                                <i className="fas fa-upload"></i> Import CSV
                              </button>
                            </div>
                          </div>
                        ) : (
                          <table className="table table-hover text-nowrap">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Label</th>
                                <th>Amount</th>
                                <th>Confirmed</th>
                                <th>Running Total</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredTransactions.map((tx, index) => {
                                const cumulative = balance + filteredTransactions.slice(0, index + 1).reduce((total, t) => total + t.amount, 0)
                                return (
                                  <tr key={tx.id}>
                                    <td>
                                      {editingTransaction?.id === tx.id ? (
                                        <input
                                          type="date"
                                          className="form-control form-control-sm"
                                          value={editingTransaction.date}
                                          onChange={(e) => setEditingTransaction({ ...editingTransaction, date: e.target.value })}
                                        />
                                      ) : (
                                        formatDate(tx.date)
                                      )}
                                    </td>
                                    <td>
                                      {editingTransaction?.id === tx.id ? (
                                        <input
                                          type="text"
                                          className="form-control form-control-sm"
                                          value={editingTransaction.description}
                                          onChange={(e) => setEditingTransaction({ ...editingTransaction, description: e.target.value })}
                                        />
                                      ) : (
                                        tx.description
                                      )}
                                    </td>
                                    <td>
                                      {editingTransaction?.id === tx.id ? (
                                        <input
                                          type="text"
                                          className="form-control form-control-sm"
                                          placeholder="Category label"
                                          value={editingTransaction.label || ''}
                                          onChange={(e) => setEditingTransaction({ ...editingTransaction, label: e.target.value })}
                                        />
                                      ) : (
                                        tx.label || ''
                                      )}
                                    </td>
                                    <td className={tx.amount >= 0 ? 'text-success' : 'text-danger'}>
                                      {editingTransaction?.id === tx.id ? (
                                        <input
                                          type="number"
                                          className="form-control form-control-sm"
                                          value={editingTransaction.amount}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value)
                                            if (!isNaN(val)) {
                                              setEditingTransaction({ ...editingTransaction, amount: val })
                                            }
                                          }}
                                        />
                                      ) : (
                                        `$${tx.amount.toFixed(2)}`
                                      )}
                                    </td>
                                    <td>
                                      {confirmingTransactions.has(tx.id) ? (
                                        <div className="d-flex align-items-center">
                                          <div className="spinner-border spinner-border-sm mr-2" role="status">
                                            <span className="sr-only">Loading...</span>
                                          </div>
                                          <small className="text-muted">Confirming...</small>
                                        </div>
                                      ) : tx.is_confirmed ? (
                                        <i className="fas fa-check text-success" style={{cursor: 'pointer'}} onClick={() => confirmTransaction(tx.id, false)}></i>
                                      ) : (
                                        <i className="fas fa-clock text-warning" style={{cursor: 'pointer'}} onClick={() => confirmTransaction(tx.id, true)}></i>
                                      )}
                                    </td>
                                    <td>{tx.is_confirmed ? '' : `$${cumulative.toFixed(2)}`}</td>
                                    <td>
                                      {editingTransaction?.id === tx.id ? (
                                        <>
                                          {tx.is_recurring && (
                                            <select className="form-control form-control-sm mb-1" value={editType} onChange={(e) => setEditType(e.target.value as 'single' | 'future')}>
                                              <option value="single">This instance</option>
                                              <option value="future">All future</option>
                                            </select>
                                          )}
                                          <button className="btn btn-success btn-sm mr-1" onClick={saveEdit}>
                                            <i className="fas fa-save"></i> Save
                                          </button>
                                          <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                                            <i className="fas fa-times"></i> Cancel
                                          </button>
                                        </>
                                      ) : (
                                        <div className="btn-group">
                                          <button
                                            type="button"
                                            className="btn btn-info btn-sm"
                                            onClick={() => startEdit(tx)}
                                          >
                                            <i className="fas fa-edit"></i>
                                          </button>
                                          {tx.is_recurring ? (
                                            <>
                                              <button
                                                type="button"
                                                className="btn btn-danger btn-sm"
                                                onClick={() => deleteTransaction(tx.id, 'single')}
                                              >
                                                <i className="fas fa-trash-alt"></i>
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-warning btn-sm"
                                                onClick={() => deleteTransaction(tx.id, 'future')}
                                              >
                                                <i className="fas fa-calendar-times"></i>
                                              </button>
                                            </>
                                          ) : (
                                            <button
                                              type="button"
                                              className="btn btn-danger btn-sm"
                                              onClick={() => deleteTransaction(tx.id, 'single')}
                                            >
                                              <i className="fas fa-trash"></i>
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )
                      })()}
                    </div>
                    <div className="card-footer">
                      <button type="button" className="btn btn-secondary" onClick={() => setCurrentPage('dashboard')}>
                        <i className="fas fa-arrow-left"></i> Back to Dashboard
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentPage === 'import-csv' && (
              /* CSV Import Card */
              <div className="row">
                <div className="col-md-12">
                  <div className="card card-warning">
                    <div className="card-header">
                      <h3 className="card-title">CSV Import</h3>
                    </div>
                    <div className="card-body">
                      <div className="form-group">
                        <label htmlFor="csvFile">Select CSV File</label>
                        <input
                          type="file"
                          className="form-control-file"
                          id="csvFile"
                          accept=".csv"
                          onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>
                    <div className="card-footer">
                      <button type="button" className="btn btn-info mr-2" onClick={uploadCsvForRecurring}>
                        <i className="fas fa-search"></i> Find Recurring Transactions
                      </button>
                      <button type="button" className="btn btn-success" onClick={uploadCsvForConfirm}>
                        <i className="fas fa-check"></i> Auto Confirm Transactions
                      </button>
                      <button type="button" className="btn btn-secondary ml-2" onClick={() => setCurrentPage('dashboard')}>
                        <i className="fas fa-arrow-left"></i> Back to Dashboard
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentPage === 'settings' && <SettingsPage fetchAppSettings={fetchAppSettings} />}
          </div>
        </section>
      </div>

      {/* Recurring Review Modal - Full Screen Overlay */}
      {showRecurringReview && (
        <div className="recurring-fullscreen-modal" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="recurring-modal-content" style={{
            backgroundColor: document.body.classList.contains('dark-mode') ? '#343a40' : 'white',
            color: document.body.classList.contains('dark-mode') ? 'white' : 'inherit',
            borderRadius: '8px',
            width: '98vw',
            height: '95vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <div className="modal-header" style={{
              padding: '15px 20px',
              borderBottom: '1px solid #dee2e6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h4 className="modal-title" style={{ margin: 0 }}>Recurring Transaction Candidates</h4>
              <button type="button" className="close" onClick={() => setShowRecurringReview(false)} style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#6c757d'
              }}>
                <span>&times;</span>
              </button>
            </div>
            <div className="modal-body" style={{
              flex: 1,
              padding: '20px',
              overflow: 'auto'
            }}>
              <p className="text-muted" style={{ marginBottom: '20px' }}>
                Edit the details below and click "Add as Recurring" to import the pattern.
                The last transaction will be confirmed and future transactions will be generated.
              </p>
              <div className="table-responsive">
                <table className="table table-bordered table-hover">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Label</th>
                      <th>Frequency</th>
                      <th>Interval</th>
                      <th>First Date</th>
                      <th>Last Date</th>
                      <th>Occurrences</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringCandidates.map((candidate, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={candidate.description}
                            onChange={(e) => {
                              const updated = [...recurringCandidates]
                              updated[index].description = e.target.value
                              setRecurringCandidates(updated)
                            }}
                          />
                        </td>
                        <td className={candidate.amount >= 0 ? 'text-success' : 'text-danger'}>
                          <input
                            type="number"
                            step="0.01"
                            className="form-control form-control-sm"
                            value={candidate.amount}
                            onChange={(e) => {
                              const updated = [...recurringCandidates]
                              updated[index].amount = parseFloat(e.target.value) || 0
                              setRecurringCandidates(updated)
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Category label"
                            value={candidate.label || ''}
                            onChange={(e) => {
                              const updated = [...recurringCandidates]
                              updated[index].label = e.target.value
                              setRecurringCandidates(updated)
                            }}
                          />
                        </td>
                        <td>
                          <select
                            className="form-control form-control-sm"
                            value={candidate.frequency}
                            onChange={(e) => {
                              const updated = [...recurringCandidates]
                              updated[index].frequency = e.target.value
                              setRecurringCandidates(updated)
                            }}
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            className="form-control form-control-sm"
                            value={candidate.interval}
                            onChange={(e) => {
                              const updated = [...recurringCandidates]
                              updated[index].interval = parseInt(e.target.value) || 1
                              setRecurringCandidates(updated)
                            }}
                          />
                        </td>
                        <td>{formatDate(candidate.start_date)}</td>
                        <td>{formatDate(candidate.last_date)}</td>
                        <td>{candidate.occurrences}</td>
                        <td>
                          {addedCandidates.has(index) ? (
                            <span className="badge badge-success">✓ Added</span>
                          ) : (
                            <button className="btn btn-primary btn-sm" onClick={() => addRecurringFromCandidate(candidate, index)}>
                              <i className="fas fa-plus"></i> Add as Recurring
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer" style={{
              padding: '15px 20px',
              borderTop: '1px solid #dee2e6',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowRecurringReview(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Prompt Modal */}
      {showUpdatePrompt && currentUpdate && (
        <div className="modal fade show" style={{ display: 'block' }} tabIndex={-1} role="dialog">
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h4 className="modal-title">Potential Match Found</h4>
                <button type="button" className="close" onClick={() => setShowUpdatePrompt(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row">
                  <div className="col-12">
                    <div className="callout callout-info">
                      <h5>CSV Transaction:</h5>
                      <p><strong>{currentUpdate.csv_description}</strong> <small className="text-muted">({formatDate(currentUpdate.csv_date)})</small></p>
                    </div>
                    <div className="callout callout-warning">
                      <h5>Database Transaction:</h5>
                      <p><strong>{currentUpdate.db_description}</strong> <small className="text-muted">({formatDate(currentUpdate.db_date)})</small></p>
                    </div>
                  </div>
                </div>
                <div className="row">
                  <div className="col-md-6">
                    <div className="info-box bg-light">
                      <div className="info-box-content">
                        <span className="info-box-text">Old Amount</span>
                        <span className="info-box-number text-danger">${currentUpdate.old_amount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="info-box bg-light">
                      <div className="info-box-content">
                        <span className="info-box-text">New Amount</span>
                        <span className="info-box-number text-success">${currentUpdate.new_amount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {currentUpdate.similarity_score && (
                  <p><strong>Match Confidence:</strong> {(currentUpdate.similarity_score * 100).toFixed(1)}%</p>
                )}
                {currentUpdate.amount_difference && (
                  <p><strong>Amount Difference:</strong> {(currentUpdate.amount_difference * 100).toFixed(1)}%</p>
                )}
                <p className="text-center font-weight-bold">
                  Do you want to update future recurring transactions with the new amount?
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-success" onClick={() => handleUpdateDecision(true)}>
                  <i className="fas fa-check"></i> Yes, update future
                </button>
                <button type="button" className="btn btn-warning" onClick={() => handleUpdateDecision(false)}>
                  <i className="fas fa-times"></i> No, just confirm this one
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmed Transactions Modal */}
      {showConfirmedModal && (
        <div className="modal fade show" style={{ display: 'block' }} tabIndex={-1} role="dialog">
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h4 className="modal-title">Auto-Confirmed Transactions</h4>
                <button type="button" className="close" onClick={() => setShowConfirmedModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="text-muted mb-3">
                  The following transactions were automatically confirmed based on your CSV import:
                </p>
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {confirmedTransactions.map((tx: any, index: number) => (
                        <tr key={index}>
                          <td>{tx.description}</td>
                          <td className={tx.amount >= 0 ? 'text-success' : 'text-danger'}>
                            ${tx.amount.toFixed(2)}
                          </td>
                          <td>{formatDate(tx.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-primary" onClick={() => setShowConfirmedModal(false)}>
                  <i className="fas fa-check"></i> OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Backdrop */}
      {(showRecurringReview || showUpdatePrompt || showConfirmedModal) && (
        <div className="modal-backdrop fade show"></div>
      )}
    </div>
  )
}

export default App
