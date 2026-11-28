import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame.jsx';
import { Button, Field, Panel } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function messageFor(error) {
  if (error.status === 423 || error.kind === 'lockout') {
    return 'Account locked after too many failed attempts. Try again later.';
  }
  if (error.status === 401) return error.message || 'Invalid username or password.';
  if (error.kind === 'network') {
    return 'Backend unavailable. Sign-in requires the API; offline demo remains available.';
  }
  return error.message || 'Could not sign in.';
}

export default function Login() {
  const { login, notice } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const setField = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const validate = () => {
    const found = {};
    if (!form.username.trim()) found.username = 'Username is required.';
    if (!form.password) found.password = 'Password is required.';
    return found;
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setMessage('Enter a username and password to continue.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await login(form.username.trim(), form.password);
      setForm({ username: '', password: '' });
      navigate('/', { replace: true });
    } catch (error) {
      setMessage(messageFor(error));
      setForm((current) => ({ ...current, password: '' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      number="00"
      kicker="ACCESS / SECURE"
      title={<>SIGN<br />IN</>}
      subtitle="Authenticate to attach your role and permissions to API requests. Anonymous legacy demonstration remains available."
      meta={[
        { label: 'SESSION', value: 'THIS TAB' },
        { label: 'CREDENTIALS', value: 'NEVER STORED' },
      ]}
      footnote="Passwords are sent only to POST /api/auth/login. Tokens are held in sessionStorage and never written to localStorage."
      action={<Button variant="ghost" type="button" onClick={() => navigate('/')}>CONTINUE IN DEMO MODE →</Button>}
    >
      <Panel label="LOGIN / 01" title="ACCOUNT ACCESS" className="auth-panel">
        <form onSubmit={submit} noValidate>
          {(notice || message) && (
            <p className={`form-message message-error auth-message`}>{message || notice}</p>
          )}
          <div className="form-grid">
            <Field label="USERNAME" error={errors.username} className="field-wide">
              <input
                className="input"
                type="text"
                name="username"
                autoComplete="username"
                placeholder="operator"
                value={form.username}
                onChange={setField('username')}
                disabled={busy}
              />
            </Field>
            <Field label="PASSWORD" error={errors.password} className="field-wide">
              <input
                className="input"
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="At least 12 characters"
                value={form.password}
                onChange={setField('password')}
                disabled={busy}
              />
            </Field>
          </div>
          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              {busy ? 'SIGNING IN…' : 'SIGN IN →'}
            </Button>
          </div>
        </form>
      </Panel>
    </AuthFrame>
  );
}
