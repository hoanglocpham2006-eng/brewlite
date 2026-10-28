
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    if (password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }

    setLoading(true);

    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message;

        throw new Error(message || 'Đăng ký thất bại.');
      }

      setSuccess('Đăng ký thành công! Đang chuyển đến trang đăng nhập...');

      setTimeout(() => {
        router.push('/login');
      }, 1200);
    } catch (err) {
      if (err instanceof Error && err.message === 'Failed to fetch') {
        setError('Không thể kết nối backend. Hãy kiểm tra server.');
      } else {
        setError(
          err instanceof Error ? err.message : 'Đã xảy ra lỗi khi đăng ký.',
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
          maxWidth: '440px',
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
          Tạo tài khoản để thưởng thức đồ uống yêu thích.
        </p>

        <h2 style={{ marginTop: '28px', marginBottom: '20px' }}>
          Đăng ký tài khoản
        </h2>

        <form onSubmit={handleRegister}>
          <label htmlFor="fullName">Họ và tên</label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nhập họ và tên"
            maxLength={100}
            required
            style={inputStyle}
          />

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Nhập email"
            required
            style={inputStyle}
          />

          <label htmlFor="phone">Số điện thoại (không bắt buộc)</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Nhập số điện thoại"
            maxLength={20}
            style={inputStyle}
          />

          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ít nhất 8 ký tự"
            minLength={8}
            maxLength={72}
            required
            style={inputStyle}
          />

          <label htmlFor="confirmPassword">Xác nhận mật khẩu</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Nhập lại mật khẩu"
            minLength={8}
            maxLength={72}
            required
            style={inputStyle}
          />

          {error && (
            <p style={{ color: '#c62828', marginBottom: '12px' }}>
              {error}
            </p>
          )}

          {success && (
            <p style={{ color: '#2e7d32', marginBottom: '12px' }}>
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '8px',
              background: loading ? '#a58b7d' : '#6f422b',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: '16px',
            }}
          >
            {loading ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px' }}>
          Đã có tài khoản?{' '}
          <Link href="/login" style={{ color: '#8b5e3c' }}>
            Đăng nhập
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
  marginBottom: '16px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  boxSizing: 'border-box',
};
