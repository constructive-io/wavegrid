import { FormEvent, useState } from 'react';

interface LoginScreenProps {
  onLogin: (username: string, token: string) => void;
  /** Why this screen appeared, when it wasn't the operator's own sign-out. */
  notice?: string;
  /** Prefilled username — whoever was signed in on this device last. */
  defaultUsername?: string;
}

export function LoginScreen({ onLogin, notice, defaultUsername = '' }: LoginScreenProps) {
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      });
      const data = await res.json();

      if (data.ok && data.token) {
        onLogin(data.username, data.token);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex items-center justify-center h-screen"
      style={{ background: '#050508' }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 w-full max-w-xs px-6"
      >
        {/* Logo / Title */}
        <div className="text-center mb-4">
          <h1
            className="text-3xl font-bold tracking-widest"
            style={{ color: '#01A1FF' }}
          >
            ILLUMINATE
          </h1>
          <p className="text-sm mt-1" style={{ color: '#666' }}>
            Painting the sky with light
          </p>
        </div>

        {/* Why we're back here (session expired, revoked, or project switched) */}
        {notice && (
          <p className='text-center text-sm' style={{ color: '#d9a441' }}>
            {notice}
          </p>
        )}

        {/* Username */}
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="off"
          className="w-full px-4 py-3 rounded-lg text-base outline-none"
          style={{
            background: '#111118',
            border: '1px solid #222',
            color: '#eee',
            fontSize: 16
          }}
        />

        {/* Password */}
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full px-4 py-3 rounded-lg text-base outline-none"
          style={{
            background: '#111118',
            border: '1px solid #222',
            color: '#eee',
            fontSize: 16
          }}
        />

        {/* Error */}
        {error && (
          <p className="text-center text-sm" style={{ color: '#f44' }}>
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !username.trim() || !password.trim()}
          className="w-full py-3 rounded-lg text-base font-semibold transition-opacity"
          style={{
            background: '#01A1FF',
            color: '#fff',
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'wait' : 'pointer'
          }}
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    </div>
  );
}
