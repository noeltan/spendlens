import { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Overview from './views/Overview';
import Transactions from './views/Transactions';
import Config from './views/Config';
import SetupWizard from './views/SetupWizard';
import { fetchConfig } from './api';
import { getBillingMonth, getCalendarMonth } from './utils/dateUtils';

function getCurrentMonth() {
  return new Date().toISOString().substring(0, 7);
}

function getGoogleAuthErrorMessage(errorType) {
  switch (errorType) {
    case 'popup_closed':
      return 'Google sign-in was canceled before it completed.';
    case 'popup_failed_to_open':
      return 'Google sign-in popup was blocked by the browser. Please allow popups for this site and try again.';
    case 'unknown':
      return 'Google sign-in did not complete. Please try again.';
    default:
      return `Google authentication failed: ${errorType}`;
  }
}

function AuthenticatedShell({ currentMonth, viewBy, onPrevMonth, onNextMonth, onSignOut, setViewBy }) {
  return (
    <div className="min-h-screen lg:flex">
      <NavBar
        monthLabel={formatMonthLabel(currentMonth, viewBy)}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onSignOut={onSignOut}
        viewBy={viewBy}
        setViewBy={setViewBy}
      />
      <div className="min-w-0 flex-1">
        <Routes>
          <Route path="/" element={<Overview currentMonth={currentMonth} viewBy={viewBy} />} />
          <Route path="/transactions" element={<Transactions currentMonth={currentMonth} viewBy={viewBy} />} />
          <Route path="/config" element={<Config currentMonth={currentMonth} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function formatMonthLabel(ym, viewBy) {
  const [year, month] = ym.split('-').map(Number);
  const label = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  return viewBy === 'billing' ? `${label} Bill` : label;
}

export default function App() {
  const [accessToken, setAccessToken] = useState(() => {
    const t = localStorage.getItem('spendlens_token');
    const valid = (!t || t === 'undefined' || t === 'null') ? null : t;
    if (valid) window.__ACCESS_TOKEN__ = valid;
    return valid;
  });
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth());
  const [viewBy, setViewBy] = useState('billing');
  const [config, setConfig] = useState(null);
  const [setupComplete, setSetupComplete] = useState(null); // null = loading
  const [authError, setAuthError] = useState('');

  function handleSignIn() {
    setAuthError('');
    console.log('Initiating Google Sign-In...');

    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      setAuthError('Google Sign-In is not configured for this environment yet.');
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      setAuthError('Google Sign-In is unavailable right now. Please refresh and try again.');
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/gmail.readonly email profile',
      callback: async (response) => {
        console.log('Google Auth callback received:', response.access_token ? 'Success' : 'Failed');
        if (response.error || !response.access_token) {
          setAuthError(getGoogleAuthErrorMessage(response.error || 'unknown'));
          return;
        }

        // Set global token FIRST so API calls use it immediately
        window.__ACCESS_TOKEN__ = response.access_token;
        localStorage.setItem('spendlens_token', response.access_token);
        setAccessToken(response.access_token);
      },
      error_callback: (err) => {
        console.error('Google Auth error callback:', err);
        setAuthError(getGoogleAuthErrorMessage(err?.type || 'unknown'));
      }
    });
    client.requestAccessToken();
  }

  function handleSignOut() {
    window.__ACCESS_TOKEN__ = null;
    localStorage.removeItem('spendlens_token');
    setAccessToken(null);
    setConfig(null);
    setSetupComplete(null);
    setAuthError('');
  }

  // Load user config whenever access token changes
  useEffect(() => {
    let cancelled = false;

    if (!accessToken) {
      setConfig(null);
      setSetupComplete(null);
      return () => {
        cancelled = true;
      };
    }

    setAuthError('');
    fetchConfig()
      .then(cfg => {
        if (cancelled) return;
        setConfig(cfg);
        setSetupComplete(!!cfg.setupComplete);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to fetch config after login:', err);
        setSetupComplete(false);
        setAuthError(`Signed in, but failed to load app data: ${err.message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function changeMonth(delta) {
    const [year, month] = currentMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + delta);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // Update month based on view mode (calendar vs billing)
  const lastViewBy = useRef(viewBy);
  useEffect(() => {
    if (setupComplete && config) {
      const today = new Date();
      if (viewBy === 'billing') {
        const firstCard = Object.keys(config.billingCycles || {})[0];
        const cycle = config.billingCycles?.[firstCard] || 1;
        setCurrentMonth(getBillingMonth(today, cycle));
      } else {
        setCurrentMonth(getCalendarMonth(today));
      }
    }
    lastViewBy.current = viewBy;
  }, [viewBy, setupComplete, config]);

  if (!accessToken) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '24px', background: '#f8f9fa' }}>
        <div className="stitch-card animate-in stitch-card--raised" style={{ padding: '48px', textAlign: 'center', maxWidth: '440px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '8px', margin: '0 auto 24px',
            background: 'var(--accent-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '28px', fontWeight: 900
          }}>S</div>
          <h1 style={{ fontSize: '2rem', marginBottom: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
            SpendLens
          </h1>
          <p style={{ marginBottom: '32px', color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: '1.5' }}>
            Sign in securely with Google to analyze your bank transactions and track your budget.
          </p>
          {authError && (
            <div style={{ marginBottom: '24px', padding: '12px', background: '#fce8e6', color: '#c5221f', borderRadius: '4px', fontSize: '0.8125rem', border: '1px solid #f5c2c7' }}>
              {authError}
            </div>
          )}
          <button onClick={handleSignIn} className="primary" style={{ width: '100%', padding: '12px 24px', fontSize: '1rem' }}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (accessToken && setupComplete === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    );
  }

  // Show wizard if setup not complete
  if (accessToken && setupComplete === false) {
    return <SetupWizard onComplete={() => setSetupComplete(true)} />;
  }

  return (
    <HashRouter>
      <AuthenticatedShell
        currentMonth={currentMonth}
        viewBy={viewBy}
        onPrevMonth={() => changeMonth(-1)}
        onNextMonth={() => changeMonth(1)}
        onSignOut={handleSignOut}
        setViewBy={setViewBy}
      />
    </HashRouter>
  );
}
