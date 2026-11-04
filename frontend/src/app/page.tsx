
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import SiteHeader from './components/SiteHeader';

interface Product {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
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
      <SiteHeader />

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
