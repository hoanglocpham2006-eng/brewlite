
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Topping {
  name: string;
  price: number;
}

interface CartItem {
  id: number;
  productId: number;
  name: string;
  imageUrl: string;
  size: string;
  toppings: Topping[];
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface Cart {
  userId: number;
  items: CartItem[];
  total: number;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const formatPrice = (price: number) =>
  price.toLocaleString('vi-VN') + ' đ';

export default function CartPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<number | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadCart = useCallback(async (id: number) => {
    const response = await fetch(`${API_URL}/cart/${id}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data.message === 'string'
          ? data.message
          : 'Không thể tải giỏ hàng.',
      );
    }

    setCart(data as Cart);
  }, []);

  useEffect(() => {
    const savedUser = sessionStorage.getItem('user');
    const token = sessionStorage.getItem('access_token');

    if (!savedUser || !token) {
      router.replace('/login');
      return;
    }

    try {
      const user = JSON.parse(savedUser);
      const id = Number(user.id);

      if (!Number.isInteger(id) || id <= 0) {
        router.replace('/login');
        return;
      }

      setUserId(id);

      loadCart(id)
        .catch((err: unknown) => {
          setError(
            err instanceof Error
              ? err.message
              : 'Không thể tải giỏ hàng.',
          );
        })
        .finally(() => setLoading(false));
    } catch {
      router.replace('/login');
    }
  }, [router, loadCart]);

  async function updateQuantity(itemId: number, quantity: number) {
    if (userId === null || quantity < 1) return;

    setBusyItemId(itemId);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${API_URL}/cart/items/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          quantity,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.message === 'string'
            ? data.message
            : 'Không thể cập nhật số lượng.',
        );
      }

      setCart(data as Cart);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể cập nhật số lượng.',
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function removeItem(itemId: number) {
    if (userId === null) return;

    const confirmed = window.confirm(
      'Bạn có chắc muốn xóa sản phẩm này khỏi giỏ hàng?',
    );

    if (!confirmed) return;

    setBusyItemId(itemId);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        `${API_URL}/cart/items/${itemId}?userId=${userId}`,
        {
          method: 'DELETE',
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.message === 'string'
            ? data.message
            : 'Không thể xóa sản phẩm.',
        );
      }

      setCart(data as Cart);
      setMessage('Đã xóa sản phẩm khỏi giỏ hàng.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể xóa sản phẩm.',
      );
    } finally {
      setBusyItemId(null);
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <p>Đang tải giỏ hàng...</p>
      </main>
    );
  }

  if (error && !cart) {
    return (
      <main style={styles.page}>
        <h1 style={styles.heading}>Giỏ hàng</h1>
        <p style={styles.error}>{error}</p>
        <button style={styles.secondaryButton} onClick={() => router.push('/')}>
          Quay lại menu
        </button>
      </main>
    );
  }

  const items = cart?.items ?? [];

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <button
          style={styles.backButton}
          onClick={() => router.push('/')}
        >
          ← Tiếp tục mua sắm
        </button>

        <h1 style={styles.heading}>Giỏ hàng của bạn</h1>
        <p style={styles.subtitle}>
          Kiểm tra đồ uống trước khi đặt hàng nhé!
        </p>
      </header>

      {error && <p style={styles.error}>{error}</p>}
      {message && <p style={styles.success}>{message}</p>}

      {items.length === 0 ? (
        <section style={styles.empty}>
          <div style={{ fontSize: 52 }}>🛒</div>
          <h2>Giỏ hàng đang trống</h2>
          <p>Hãy chọn món đồ uống yêu thích của bạn.</p>
          <button
            style={styles.primaryButton}
            onClick={() => router.push('/')}
          >
            Khám phá menu
          </button>
        </section>
      ) : (
        <>
          <section style={styles.list}>
            {items.map((item) => (
              <article key={item.id} style={styles.item}>
                <img
                  src={item.imageUrl || '/placeholder.png'}
                  alt={item.name}
                  style={styles.image}
                />

                <div style={styles.itemInfo}>
                  <h2 style={styles.productName}>{item.name}</h2>

                  <p style={styles.detail}>Size: {item.size}</p>

                  <p style={styles.detail}>
                    Topping:{' '}
                    {item.toppings?.length
                      ? item.toppings.map((t) => t.name).join(', ')
                      : 'Không có'}
                  </p>

                  <p style={styles.price}>
                    {formatPrice(item.unitPrice)} / món
                  </p>

                  <div style={styles.actions}>
                    <div style={styles.quantityControl}>
                      <button
                        aria-label={`Giảm số lượng ${item.name}`}
                        disabled={busyItemId !== null || item.quantity <= 1}
                        onClick={() =>
                          updateQuantity(item.id, item.quantity - 1)
                        }
                        style={styles.quantityButton}
                      >
                        −
                      </button>

                      <span style={styles.quantity}>{item.quantity}</span>

                      <button
                        aria-label={`Tăng số lượng ${item.name}`}
                        disabled={busyItemId !== null}
                        onClick={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                        style={styles.quantityButton}
                      >
                        +
                      </button>
                    </div>

                    <button
                      disabled={busyItemId !== null}
                      onClick={() => removeItem(item.id)}
                      style={styles.removeButton}
                    >
                      Xóa
                    </button>
                  </div>
                </div>

                <div style={styles.subtotal}>
                  {formatPrice(item.subtotal)}
                </div>
              </article>
            ))}
          </section>

          <section style={styles.summary}>
            <div style={styles.summaryRow}>
              <span>Số lượng món</span>
              <strong>
                {items.reduce((sum, item) => sum + item.quantity, 0)}
              </strong>
            </div>

            <div style={styles.summaryRow}>
              <span>Tạm tính</span>
              <strong>{formatPrice(cart?.total ?? 0)}</strong>
            </div>

            <div style={styles.totalRow}>
              <span>Tổng cộng</span>
              <strong>{formatPrice(cart?.total ?? 0)}</strong>
            </div>

            <button
              style={styles.primaryButton}
              onClick={() => router.push('/checkout')}
              disabled={busyItemId !== null || items.length === 0}
            >
              Tiến hành thanh toán
            </button>
          
          </section>
        </>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f8f3ed',
    padding: '36px 20px 60px',
    color: '#3c2a20',
    fontFamily: 'Arial, sans-serif',
  },
  header: {
    maxWidth: 1000,
    margin: '0 auto 28px',
  },
  backButton: {
    background: 'transparent',
    border: 'none',
    color: '#6f422b',
    cursor: 'pointer',
    padding: '8px 0',
    fontSize: 15,
  },
  heading: {
    fontSize: 32,
    color: '#6f422b',
    margin: '20px 0 8px',
  },
  subtitle: {
    color: '#78685e',
    margin: 0,
  },
  list: {
    maxWidth: 1000,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    flexWrap: 'wrap',
    background: '#fff',
    borderRadius: 14,
    padding: 20,
    boxShadow: '0 4px 18px rgba(60, 42, 32, 0.06)',
  },
  image: {
    width: 112,
    height: 112,
    objectFit: 'cover',
    borderRadius: 12,
    background: '#eee5db',
  },
  itemInfo: {
    flex: '1 1 220px',
    minWidth: 0,
  },
  productName: {
    fontSize: 20,
    margin: '0 0 10px',
    color: '#4c3020',
  },
  detail: {
    fontSize: 14,
    color: '#78685e',
    margin: '5px 0',
  },
  price: {
    color: '#6f422b',
    fontWeight: 600,
    margin: '10px 0',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    flexWrap: 'wrap',
    marginTop: 12,
  },
  quantityControl: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    border: '1px solid #e1d4c8',
    borderRadius: 8,
    padding: 4,
  },
  quantityButton: {
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 6,
    background: '#f3e9df',
    color: '#6f422b',
    cursor: 'pointer',
    fontSize: 20,
  },
  quantity: {
    minWidth: 18,
    textAlign: 'center',
    fontWeight: 600,
  },
  removeButton: {
    border: 'none',
    background: 'transparent',
    color: '#b33b32',
    cursor: 'pointer',
    padding: 8,
  },
  subtotal: {
    fontWeight: 700,
    fontSize: 18,
    color: '#6f422b',
    marginLeft: 'auto',
  },
  summary: {
    maxWidth: 420,
    margin: '24px max(0px, calc((100% - 1000px) / 2)) 0 auto',
    background: '#fff',
    borderRadius: 14,
    padding: 24,
    boxShadow: '0 4px 18px rgba(60, 42, 32, 0.06)',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
    color: '#78685e',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    borderTop: '1px solid #eadfd5',
    paddingTop: 18,
    marginTop: 8,
    marginBottom: 20,
    fontSize: 20,
    color: '#6f422b',
  },
  primaryButton: {
    width: '100%',
    padding: 14,
    background: '#6f422b',
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 600,
  },
  secondaryButton: {
    padding: 12,
    background: '#6f422b',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  empty: {
    maxWidth: 600,
    margin: '50px auto',
    padding: 36,
    textAlign: 'center',
    background: '#fff',
    borderRadius: 16,
  },
  error: {
    maxWidth: 1000,
    margin: '12px auto',
    color: '#c62828',
  },
  success: {
    maxWidth: 1000,
    margin: '12px auto',
    color: '#267642',
  },
};
