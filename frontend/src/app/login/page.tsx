
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setLoading(true);

    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message;

        throw new Error(message || 'Đăng nhập thất bại.');
      }

      if (!data.access_token) {
        throw new Error('Backend chưa trả về access token.');
      }

      // Lưu token đăng nhập.
       sessionStorage.setItem('access_token', data.access_token);

        // Lưu thông tin người dùng để sử dụng cho giỏ hàng.
       sessionStorage.setItem('user', JSON.stringify(data.user));

       setPassword('');
       router.push('/');
    } catch (err) {
      if (err instanceof Error && err.message === 'Failed to fetch') {
        setError('Không thể kết nối backend. Hãy kiểm tra server.');
      } else {
        setError(
          err instanceof Error ? err.message : 'Đã xảy ra lỗi khi đăng nhập.',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#f8f3ed',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#fff',
          padding: '36px',
          borderRadius: '16px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
        }}
      >
        <h1
          style={{
            textAlign: 'center',
            color: '#6f422b',
            fontSize: '30px',
            marginBottom: '8px',
          }}
        >
          BrewLite ☕
        </h1>

        <p style={{ textAlign: 'center', color: '#777' }}>
          Chào mừng bạn trở lại!
        </p>

        <h2 style={{ marginTop: '28px', marginBottom: '20px' }}>
          Đăng nhập
        </h2>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">Email</label>

          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Nhập email của bạn"
            required
            style={inputStyle}
          />

          <label htmlFor="password">Mật khẩu</label>

          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nhập mật khẩu"
            required
            style={inputStyle}
          />

          {error && (
            <p style={{ color: '#c62828', marginBottom: '12px' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '12px',
              background: loading ? '#a58b7d' : '#6f422b',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: '16px',
            }}
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px' }}>
          Chưa có tài khoản?{' '}
          <Link href="/register" style={{ color: '#8b5e3c' }}>
            Đăng ký
          </Link>
        </p>

        <p style={{ textAlign: 'center', marginTop: '12px' }}>
          <Link href="/" style={{ color: '#777' }}>
            ← Quay lại menu
          </Link>
        </p>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '12px',
  marginTop: '8px',
  marginBottom: '18px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  boxSizing: 'border-box',
};
