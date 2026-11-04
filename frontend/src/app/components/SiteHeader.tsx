'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

const AUTH_EVENT = 'brewlite-auth-change';

interface StoredUser {
  fullName?: string;
  email?: string;
}

// Đọc trạng thái đăng nhập từ sessionStorage (cùng nơi trang đăng nhập lưu).
// Trả về undefined khi chạy trên server để tránh lệch giao diện lúc hydrate.
function getSnapshot(): string | null | undefined {
  try {
    const token = sessionStorage.getItem('access_token');
    const user = sessionStorage.getItem('user');
    return token && user ? user : null;
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null | undefined {
  return undefined;
}

function subscribe(onChange: () => void) {
  window.addEventListener(AUTH_EVENT, onChange);
  return () => window.removeEventListener(AUTH_EVENT, onChange);
}

function parseUser(raw: string | null | undefined): StoredUser | null {
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as StoredUser) : null;
  } catch {
    return null;
  }
}

// Tên người Việt: tên gọi là từ cuối cùng (Phạm Hoàng Lộc -> Lộc).
function getShortName(user: StoredUser): string {
  const parts = (user.fullName ?? '').trim().split(/\s+/).filter(Boolean);

  if (parts.length > 0) return parts[parts.length - 1];

  return user.email?.split('@')[0] || 'Bạn';
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2 3h2l3 13h12l3-10H5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="account-chevron" viewBox="0 0 24 24" width="16" height="16"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function SiteHeader() {
  const rawUser = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const user = useMemo(() => parseUser(rawUser), [rawUser]);

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Đóng menu khi bấm ra ngoài hoặc nhấn Esc.
  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function handleLogout() {
    try {
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('user');
    } catch {
      // Bỏ qua nếu trình duyệt chặn sessionStorage.
    }

    setOpen(false);
    window.dispatchEvent(new Event(AUTH_EVENT));
  }

  const shortName = user ? getShortName(user) : '';
  const initial = Array.from(shortName)[0]?.toUpperCase() ?? '';

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          <span className="brand-symbol">☕</span>
          <span>Brew<span>Lite</span></span>
        </Link>

        <nav className="main-nav" aria-label="Điều hướng chính">
          <Link href="/" className="nav-active">Trang chủ</Link>
          <a href="#menu">Menu đồ uống</a>
          <a href="#about">Về BrewLite</a>
        </nav>

        <div className="header-actions">
          <Link href="/cart" className="icon-link" aria-label="Giỏ hàng"
            title="Giỏ hàng">
            <CartIcon />
          </Link>

          {rawUser === undefined && (
            <span className="header-slot" aria-hidden="true" />
          )}

          {rawUser !== undefined && !user && (
            <>
              <Link href="/register" className="header-register">
                Đăng ký
              </Link>
              <Link href="/login" className="header-login">
                Đăng nhập
              </Link>
            </>
          )}

          {user && (
            <div className="account-menu" ref={menuRef}>
              <button
                type="button"
                className="account-trigger"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
              >
                <span className="account-avatar" aria-hidden="true">
                  {initial}
                </span>
                <span className="account-name">{shortName}</span>
                <ChevronIcon />
              </button>

              {open && (
                <div className="account-dropdown" role="menu">
                  <div className="account-summary">
                    <strong>{user.fullName || shortName}</strong>
                    {user.email && <span>{user.email}</span>}
                  </div>

                  <Link href="/orders" role="menuitem"
                    onClick={() => setOpen(false)}>
                    Lịch sử đơn hàng
                  </Link>

                  <button type="button" role="menuitem"
                    className="account-logout" onClick={handleLogout}>
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}