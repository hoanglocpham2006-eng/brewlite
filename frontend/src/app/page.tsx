
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Product {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
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

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProducts() {
      try {
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

        const response = await fetch(`${apiUrl}/products`);

        if (!response.ok) {
          throw new Error('Không thể tải sản phẩm.');
        }

        const data: Product[] = await response.json();
        setProducts(data);
      } catch {
        setError('Không thể kết nối API. Hãy kiểm tra backend.');
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  return (
    <main className="brew-page">
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
            <Link href="/login" className="icon-link" aria-label="Tài khoản"
              title="Đăng nhập">
              <UserIcon />
            </Link>

            <Link
                href="/orders"
                title="Lịch sử đơn hàng"
                aria-label="Xem lịch sử đơn hàng"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 12px',
                  border: '1px solid #e5d5c5',
                  borderRadius: 10,
                  background: '#fff',
                  color: '#68472e',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <span aria-hidden="true">📋</span>
                <span>Lịch sử</span>
            </Link>

            <Link href="/cart" className="icon-link" aria-label="Giỏ hàng"
              title="Giỏ hàng">
              <CartIcon />
            </Link>

            <Link href="/login" className="header-login">
              Đăng nhập
            </Link>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">MỘT CHÚT CÀ PHÊ, MỘT CHÚT YÊU ĐỜI</span>
          <h1>
            Bắt đầu ngày mới
            <br />
            cùng <span>BrewLite.</span>
          </h1>
          <p>
            Những thức uống thơm ngon được chuẩn bị để
            mang đến cho bạn một ngày thật tuyệt vời.
          </p>
          <a href="#menu" className="primary-button">
            Khám phá menu <span aria-hidden="true">→</span>
          </a>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="hero-circle">
            <span className="hero-coffee">☕</span>
            <span className="hero-caption">Your daily coffee break</span>
          </div>
          <span className="hero-decoration decoration-one">✳</span>
          <span className="hero-decoration decoration-two">✦</span>
        </div>
      </section>

      <section id="menu" className="menu-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THỨC UỐNG DÀNH CHO BẠN</span>
            <h2>Menu đồ uống</h2>
            <p>Chọn hương vị yêu thích của bạn hôm nay.</p>
          </div>
        </div>

        {loading && (
          <p className="status-message">Đang tải menu đồ uống...</p>
        )}

        {!loading && error && (
          <p className="status-message error-message">{error}</p>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="status-message">Hiện chưa có sản phẩm nào.</p>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="product-grid">
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/products/${product.id}`}
                className="product-card"
              >
                <div className="product-image-wrap">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="product-image"
                  />
                  <span className="product-tag">BrewLite chọn</span>
                </div>

                <div className="product-info">
                  <h3>{product.name}</h3>
                  <div className="product-bottom">
                    <p className="product-price">
                      {Number(product.price).toLocaleString('vi-VN')} đ
                    </p>
                    <span className="product-arrow" aria-hidden="true">↗</span>
                  </div>
                  <span className="product-detail">Xem chi tiết</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="about" className="about-section">
        <span className="about-icon">☕</span>
        <div>
          <h2>Mỗi ngày một chút niềm vui</h2>
          <p>BrewLite đồng hành cùng những khoảnh khắc thư giãn của bạn.</p>
        </div>
      </section>

      <footer className="site-footer">
        <Link href="/" className="brand footer-brand">
          <span className="brand-symbol">☕</span>
          <span>Brew<span>Lite</span></span>
        </Link>
        <p>© 2026 BrewLite. Made with love.</p>
      </footer>
    </main>
  );
}
