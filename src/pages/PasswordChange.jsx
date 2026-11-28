import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame.jsx';
import { Button, Field, Panel } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { rolesLabel } from '../lib/permissions.js';

function messageFor(error) {
  if (error.status === 401) return error.message || 'Current password is incorrect.';
  if (error.status === 400) return error.message || 'New password must differ from current password.';
  if (error.status === 422) return 'New password must be between 12 and 256 characters.';
  if (error.kind === 'network') return 'Backend unavailable. Try again when the API is reachable.';
  return error.message || 'Could not change password.';
}

export default function PasswordChange() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const setField = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const validate = () => {
    const found = {};
    if (!form.current) found.current = 'Current password is required.';
    if (form.next.length < 12 || form.next.length > 256) {
      found.next = 'Use between 12 and 256 characters.';
    }
    if (form.next && form.next === form.current) {
      found.next = 'New password must differ from the current password.';
    }
    if (!form.confirm) found.confirm = 'Confirm the new password.';
    else if (form.confirm !== form.next) found.confirm = 'Passwords do not match.';
    return found;
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setMessage('Correct the highlighted fields before continuing.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      navigate('/', { replace: true });
    } catch (error) {
      setMessage(messageFor(error));
      setForm((current) => ({ ...current, current: '', next: '', confirm: '' }));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <AuthFrame
      number="01"
      kicker="ACCESS / PASSWORD"
      title={<>CHANGE<br />PASSWORD</>}
      subtitle="Update the password for this account."
      meta={[
        { label: 'ACCOUNT', value: user?.username || '—' },
        { label: 'ROLE', value: rolesLabel(user) },
      ]}
      footnote="Successful changes keep this session active and revoke every other active session for this account."
      action={<Button variant="ghost" type="button" onClick={signOut} disabled={busy}>SIGN OUT →</Button>}
    >
      <Panel label="PASSWORD / 01" title="SET A NEW PASSWORD" className="auth-panel">
        <form onSubmit={submit} noValidate>
          {message && <p className="form-message message-error auth-message">{message}</p>}
          <div className="form-grid">
            <Field label="CURRENT PASSWORD" error={errors.current} className="field-wide">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={form.current}
                onChange={setField('current')}
                disabled={busy}
              />
            </Field>
            <Field label="NEW PASSWORD" unit="12–256" error={errors.next} className="field-wide">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={form.next}
                onChange={setField('next')}
                disabled={busy}
              />
            </Field>
            <Field label="CONFIRM NEW PASSWORD" error={errors.confirm} className="field-wide">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={setField('confirm')}
                disabled={busy}
              />
            </Field>
          </div>
          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              {busy ? 'UPDATING…' : 'CHANGE PASSWORD →'}
            </Button>
          </div>
        </form>
      </Panel>
    </AuthFrame>
  );
}
