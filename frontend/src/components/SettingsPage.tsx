
import React, { useState, useEffect } from 'react';

interface Settings {
  recurring_sensitivity: number; // 0.0-1.0
  auto_confirm_sensitivity: number; // 0.0-1.0
  custom_recurring_algorithm: object;
  custom_auto_confirm_algorithm: object;
  date_format: string;
  forecast_period: number; // months, 1-120
}

const dateFormatOptions = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' },
  { value: 'MMM DD, YYYY', label: 'MMM DD, YYYY' },
  { value: 'DD-MMMM-YYYY', label: 'DD-MMMM-YYYY' },
  { value: 'DD-MMM-YY', label: 'DD-MMM-YY' },
];

interface SettingsPageProps {
  fetchAppSettings: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ fetchAppSettings }) => {
  const [settings, setSettings] = useState<Settings>({
    recurring_sensitivity: 0.8,
    auto_confirm_sensitivity: 0.7,
    custom_recurring_algorithm: {
      "min_occurrences": 2,
      "interval_tolerance": 0.3,
      "amount_tolerance": 0.1,
      "frequency_detection": {
        "daily": 1,
        "weekly": 7,
        "monthly": 30
      }
    },
    custom_auto_confirm_algorithm: {
      "similarity_threshold": 0.7,
      "amount_tolerance": 0.05,
      "date_diff_max": 3,
      "high_confidence": {
        "similarity": 0.9,
        "amount": 0.01
      }
    },
    date_format: 'DD-MMMM-YYYY',
    forecast_period: 12,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Advanced settings state
  const [minOccurrences, setMinOccurrences] = useState(2);
  const [intervalTolerance, setIntervalTolerance] = useState(0.3);
  const [amountTolerance, setAmountTolerance] = useState(0.1);
  const [daily, setDaily] = useState(1);
  const [weekly, setWeekly] = useState(7);
  const [monthly, setMonthly] = useState(30);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);
  const [confirmAmountTolerance, setConfirmAmountTolerance] = useState(0.05);
  const [dateDiffMax, setDateDiffMax] = useState(3);
  const [highConfidenceSimilarity, setHighConfidenceSimilarity] = useState(0.9);
  const [highConfidenceAmount, setHighConfidenceAmount] = useState(0.01);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    loadPreferences();
    loadSettings();
  }, []);

  const loadPreferences = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/user/preferences`);
      if (response.ok) {
        const data = await response.json();
        setShowAdvanced(data.show_advanced || false);
      } else if (response.status === 401) {
        // Redirect to login if needed, assume window.location for now
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
      // Default to false on error
    }
  };

  const loadSettings = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/settings`);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        // Update advanced state from loaded data
        if (data.custom_recurring_algorithm) {
          setMinOccurrences(data.custom_recurring_algorithm.min_occurrences || 2);
          setIntervalTolerance(data.custom_recurring_algorithm.interval_tolerance || 0.3);
          setAmountTolerance(data.custom_recurring_algorithm.amount_tolerance || 0.1);
          if (data.custom_recurring_algorithm.frequency_detection) {
            setDaily(data.custom_recurring_algorithm.frequency_detection.daily || 1);
            setWeekly(data.custom_recurring_algorithm.frequency_detection.weekly || 7);
            setMonthly(data.custom_recurring_algorithm.frequency_detection.monthly || 30);
          }
        }
        if (data.custom_auto_confirm_algorithm) {
          setSimilarityThreshold(data.custom_auto_confirm_algorithm.similarity_threshold || 0.7);
          setConfirmAmountTolerance(data.custom_auto_confirm_algorithm.amount_tolerance || 0.05);
          setDateDiffMax(data.custom_auto_confirm_algorithm.date_diff_max || 3);
          if (data.custom_auto_confirm_algorithm.high_confidence) {
            setHighConfidenceSimilarity(data.custom_auto_confirm_algorithm.high_confidence.similarity || 0.9);
            setHighConfidenceAmount(data.custom_auto_confirm_algorithm.high_confidence.amount || 0.01);
          }
        }
      }
    } catch (err) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (key: keyof Settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };


  const saveSettings = async () => {
    setSaving(true);
    setError(null);

    // Validation for simple settings
    if (settings.recurring_sensitivity < 0 || settings.recurring_sensitivity > 1 ||
        settings.auto_confirm_sensitivity < 0 || settings.auto_confirm_sensitivity > 1) {
      setError('Sensitivity values must be between 0 and 1');
      setSaving(false);
      return;
    }
    if (settings.forecast_period < 1 || settings.forecast_period > 120) {
      setError('Forecast period must be between 1 and 120 months');
      setSaving(false);
      return;
    }
    if (!dateFormatOptions.some(opt => opt.value === settings.date_format)) {
      setError('Invalid date format');
      setSaving(false);
      return;
    }

    // Validation for advanced settings
    if (intervalTolerance < 0 || intervalTolerance > 1 || amountTolerance < 0 || amountTolerance > 1 ||
        similarityThreshold < 0 || similarityThreshold > 1 || confirmAmountTolerance < 0 || confirmAmountTolerance > 1 ||
        highConfidenceSimilarity < 0 || highConfidenceSimilarity > 1 || highConfidenceAmount < 0 || highConfidenceAmount > 1) {
      setError('Tolerance and threshold values must be between 0 and 1');
      setSaving(false);
      return;
    }
    if (minOccurrences < 1 || dateDiffMax < 1 || daily < 1 || weekly < 1 || monthly < 1) {
      setError('Min occurrences, date diff, and frequency values must be at least 1');
      setSaving(false);
      return;
    }

    // Construct JSON from form fields
    const recurringAlgo = {
      min_occurrences: minOccurrences,
      interval_tolerance: intervalTolerance,
      amount_tolerance: amountTolerance,
      frequency_detection: {
        daily: daily,
        weekly: weekly,
        monthly: monthly
      }
    };

    const autoConfirmAlgo = {
      similarity_threshold: similarityThreshold,
      amount_tolerance: confirmAmountTolerance,
      date_diff_max: dateDiffMax,
      high_confidence: {
        similarity: highConfidenceSimilarity,
        amount: highConfidenceAmount
      }
    };

    const payload = {
      ...settings,
      recurring_sensitivity: settings.recurring_sensitivity,
      auto_confirm_sensitivity: settings.auto_confirm_sensitivity,
      custom_recurring_algorithm: recurringAlgo,
      custom_auto_confirm_algorithm: autoConfirmAlgo,
    };

    try {
      const response = await fetch(`${apiUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        await loadSettings();
        if (fetchAppSettings) {
          fetchAppSettings();
        }
      } else {
        setError('Failed to save settings');
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center p-4">
        <div className="spinner-border text-primary" role="status">
          <span className="sr-only">Loading...</span>
        </div>
        <p className="mt-2">Loading settings...</p>
      </div>
    );
  }

  return (
    <>
      <div className="row">
        <div className="col-md-12">
          <div className="card card-primary" style={{ maxWidth: '500px' }}>
            <div className="card-header">
              <h3 className="card-title">Application Settings</h3>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}
              <button
                type="button"
                className="btn btn-success mb-3"
                onClick={saveSettings}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm mr-2" role="status"></span>
                    Saving...
                  </>
                ) : (
                  'Save All Settings'
                )}
              </button>

              {!showAdvanced && (
                <button
                  type="button"
                  className="btn btn-outline-primary mb-3 ml-2"
                  onClick={async () => {
                    try {
                      const response = await fetch(`${apiUrl}/api/user/preferences`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ show_advanced: true }),
                      });
                      if (response.ok) {
                        setShowAdvanced(true);
                      } else if (response.status === 401) {
                        window.location.href = '/login';
                      } else {
                        setError('Failed to update preferences. Please try again.');
                      }
                    } catch (err) {
                      setError('Failed to update preferences. Please check your connection.');
                    }
                  }}
                >
                  Show Advanced
                </button>
              )}

              {showAdvanced && (
                <button
                  type="button"
                  className="btn btn-outline-primary mb-3 ml-2"
                  onClick={async () => {
                    try {
                      const response = await fetch(`${apiUrl}/api/user/preferences`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ show_advanced: false }),
                      });
                      if (response.ok) {
                        setShowAdvanced(false);
                      } else if (response.status === 401) {
                        window.location.href = '/login';
                      } else {
                        setError('Failed to update preferences. Please try again.');
                      }
                    } catch (err) {
                      setError('Failed to update preferences. Please check your connection.');
                    }
                  }}
                >
                  Show Simple
                </button>
              )}

              {!showAdvanced && (
                <>
                  {/* Date Format and Forecast Period - Always Visible */}
                  <div className="form-group mb-4">
                    <label>Date Format</label>
                    <select
                      className="form-control"
                      value={settings.date_format}
                      onChange={(e) => updateSetting('date_format', e.target.value)}
                    >
                      {dateFormatOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group mb-4">
                    <label>Forecast Period (months)</label>
                    <div className="mb-2">Value: {settings.forecast_period} months</div>
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: '33.33%' }}
                      value={settings.forecast_period}
                      onChange={(e) => updateSetting('forecast_period', parseInt(e.target.value) || 12)}
                      min="1"
                      max="120"
                    />
                  </div>

                  {/* Sensitivity Inputs */}
                  <div className="form-group mb-4">
                    <label>Find Recurring Transactions Sensitivity</label>
                    <div className="mb-2">Value: {(settings.recurring_sensitivity * 100).toFixed(0)}%</div>
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: '33.33%' }}
                      value={settings.recurring_sensitivity}
                      onChange={(e) => updateSetting('recurring_sensitivity', parseFloat(e.target.value) || 0)}
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </div>

                  <div className="form-group mb-4">
                    <label>Auto-Confirm Transactions Sensitivity</label>
                    <div className="mb-2">Value: {(settings.auto_confirm_sensitivity * 100).toFixed(0)}%</div>
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: '33.33%' }}
                      value={settings.auto_confirm_sensitivity}
                      onChange={(e) => updateSetting('auto_confirm_sensitivity', parseFloat(e.target.value) || 0)}
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </div>
                </>
              )}

              {showAdvanced && (
                <>

                  {/* Date Format and Forecast Period - Always Visible */}
                  <div className="form-group mb-4">
                    <label>Date Format</label>
                    <select
                      className="form-control"
                      value={settings.date_format}
                      onChange={(e) => updateSetting('date_format', e.target.value)}
                    >
                      {dateFormatOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group mb-4">
                    <label>Forecast Period (months)</label>
                    <div className="mb-2">Value: {settings.forecast_period} months</div>
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: '33.33%' }}
                      value={settings.forecast_period}
                      onChange={(e) => updateSetting('forecast_period', parseInt(e.target.value) || 12)}
                      min="1"
                      max="120"
                    />
                  </div>

                  <h5 className="mt-4 mb-3">Advanced Recurring Detection Settings</h5>
                  
                  <div className="form-group mb-3">
                    <label>Minimum Occurrences for Recurring</label>
                    <input
                      type="number"
                      className="form-control"
                      value={minOccurrences}
                      onChange={(e) => setMinOccurrences(parseInt(e.target.value) || 2)}
                      min="1"
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label>Interval Tolerance (0-1)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={intervalTolerance}
                      onChange={(e) => setIntervalTolerance(parseFloat(e.target.value) || 0.3)}
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label>Amount Tolerance (0-1)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={amountTolerance}
                      onChange={(e) => setAmountTolerance(parseFloat(e.target.value) || 0.1)}
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label>Frequency Detection Days</label>
                    <div className="row">
                      <div className="col-md-4">
                        <label className="form-label">Daily</label>
                        <input
                          type="number"
                          className="form-control"
                          value={daily}
                          onChange={(e) => setDaily(parseInt(e.target.value) || 1)}
                          min="1"
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Weekly</label>
                        <input
                          type="number"
                          className="form-control"
                          value={weekly}
                          onChange={(e) => setWeekly(parseInt(e.target.value) || 7)}
                          min="1"
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Monthly</label>
                        <input
                          type="number"
                          className="form-control"
                          value={monthly}
                          onChange={(e) => setMonthly(parseInt(e.target.value) || 30)}
                          min="1"
                        />
                      </div>
                    </div>
                  </div>

                  <h5 className="mt-4 mb-3">Advanced Auto-Confirm Settings</h5>

                  <div className="form-group mb-3">
                    <label>Similarity Threshold (0-1)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={similarityThreshold}
                      onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value) || 0.7)}
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label>Amount Tolerance (0-1)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={confirmAmountTolerance}
                      onChange={(e) => setConfirmAmountTolerance(parseFloat(e.target.value) || 0.05)}
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label>Maximum Date Difference (days)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={dateDiffMax}
                      onChange={(e) => setDateDiffMax(parseInt(e.target.value) || 3)}
                      min="1"
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label>High Confidence Similarity (0-1)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={highConfidenceSimilarity}
                      onChange={(e) => setHighConfidenceSimilarity(parseFloat(e.target.value) || 0.9)}
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label>High Confidence Amount Tolerance (0-1)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={highConfidenceAmount}
                      onChange={(e) => setHighConfidenceAmount(parseFloat(e.target.value) || 0.01)}
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPage;