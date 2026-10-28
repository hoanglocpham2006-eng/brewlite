'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Topping {
  name: string;
  price: number;
}

interface CartItem {
  id: number;
  productId: number;
  name: string;
  imageUrl?: string;
  size: string;
  toppings: Topping[];
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface CartResponse {
  userId: number;
  items: CartItem[];
  total: number;
}

interface OrderResponse {
  message: string;
  order: {
    id: number;
    totalAmount: number;
    status: string;
    recipientName: string;
    recipientPhone: string;
  };
}

const colors = {
  background: '#f8f6f2',
  brown: '#76513a',
  brownDark: '#5d3d2a',
  text: '#30271f',
  muted: '#786d63',
  border: '#ece4da',
  white: '#ffffff',
};

const styles = {
  page: {
    minHeight: '100vh',
    padding: '36px 20px 60px',
    background: colors.background,
    color: colors.text,
    fontFamily: 'Arial, Helvetica, sans-serif',
    boxSizing: 'border-box' as const,
  },
  container: {
    width: '100%',
    maxWidth: '1120px',
    margin: '0 auto',
  },
  backButton: {
    padding: '9px 0',
    border: 'none',
    background: 'transparent',
    color: colors.brown,
    fontSize: '14px',
    cursor: 'pointer',
  },
  header: {
    marginBottom: '30px',
    textAlign: 'center' as const,
  },
  title: {
    margin: '12px 0',
    fontSize: '36px',
    fontWeight: 800,
    letterSpacing: '-1px',
  },
  subtitle: {
    margin: 0,
    color: colors.muted,
    fontSize: '15px',
    lineHeight: 1.6,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.5fr) minmax(300px, 1fr)',
    alignItems: 'start',
    gap: '24px',
  },
  card: {
    minWidth: 0,
    padding: '28px',
    border: `1px solid ${colors.border}`,
    borderRadius: '18px',
    background: colors.white,
    boxShadow: '0 8px 28px rgba(67, 47, 29, 0.05)',
    boxSizing: 'border-box' as const,
  },
  sectionTitle: {
    margin: '0 0 24px',
    fontSize: '21px',
    fontWeight: 750,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    marginBottom: '20px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 650,
  },
  input: {
    display: 'block',
    width: '100%',
    minWidth: 0,
    padding: '13px 14px',
    border: '1px solid #ded5cb',
    borderRadius: '10px',
    background: '#fffdfa',
    color: colors.text,
    fontFamily: 'inherit',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
    outlineColor: '#9a6a45',
  },
  textarea: {
    display: 'block',
    width: '100%',
    minWidth: 0,
    padding: '13px 14px',
    border: '1px solid #ded5cb',
    borderRadius: '10px',
    background: '#fffdfa',
    color: colors.text,
    fontFamily: 'inherit',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    outlineColor: '#9a6a45',
  },
  paymentBox: {
    margin: '26px 0',
    padding: '18px',
    border: '1px solid #e8ded2',
    borderRadius: '12px',
    background: '#fcfaf7',
  },
  paymentLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  paymentTitle: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: 700,
  },
  mutedText: {
    color: colors.muted,
    fontSize: '12px',
    lineHeight: 1.6,
  },
  primaryButton: {
    display: 'block',
    width: '100%',
    minHeight: '48px',
    padding: '13px 18px',
    border: 'none',
    borderRadius: '10px',
    background: colors.brown,
    color: colors.white,
    fontSize: '14px',
    fontWeight: 750,
    cursor: 'pointer',
  },
  secondaryButton: {
    display: 'block',
    width: '100%',
    minHeight: '46px',
    padding: '12px 16px',
    border: 'none',
    borderRadius: '10px',
    background: '#eee4da',
    color: colors.brownDark,
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '18px',
  },
  cartItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    paddingBottom: '18px',
    borderBottom: '1px solid #eee7df',
  },
  itemImage: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: '76px',
    height: '76px',
    overflow: 'hidden',
    borderRadius: '12px',
    background: '#f3ece4',
    fontSize: '28px',
  },
  image: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  itemDetails: {
    display: 'flex',
    flex: 1,
    minWidth: 0,
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
    gap: '7px',
  },
  itemName: {
    fontSize: '14px',
    fontWeight: 700,
    overflowWrap: 'anywhere' as const,
  },
  itemPrice: {
    marginTop: '3px',
    color: colors.brown,
    fontSize: '14px',
    fontWeight: 750,
  },
  totalRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginTop: '24px',
    paddingTop: '20px',
    borderTop: '1px solid #e8ded2',
  },
  totalPrice: {
    color: colors.brown,
    fontSize: '21px',
    fontWeight: 800,
  },
  message: {
    marginBottom: '22px',
    padding: '14px 16px',
    border: '1px solid #efc4bd',
    borderRadius: '10px',
    background: '#fff0ee',
    color: '#a33225',
    fontSize: '14px',
    lineHeight: 1.6,
  },
  center: {
    padding: '60px 20px',
    textAlign: 'center' as const,
    color: colors.muted,
  },
  successCard: {
    width: '100%',
    maxWidth: '560px',
    margin: '40px auto',
    padding: '32px',
    border: `1px solid ${colors.border}`,
    borderRadius: '18px',
    background: colors.white,
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
    boxShadow: '0 8px 28px rgba(67, 47, 29, 0.05)',
  },
  successIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '64px',
    height: '64px',
    margin: '0 auto 20px',
    borderRadius: '50%',
    background: '#e6f4e8',
    color: '#258044',
    fontSize: '34px',
    fontWeight: 800,
  },
  infoRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    padding: '13px 0',
    borderBottom: '1px solid #eee7df',
    textAlign: 'left' as const,
  },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

export default function CheckoutPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartResponse | null>(null);

  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'EWALLET' | 'BANK_CARD'>('COD');
  const [simulateFailure, setSimulateFailure] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [order, setOrder] = useState<OrderResponse['order'] | null>(null);

  useEffect(() => {
    async function loadCheckout() {
      try {
        const storedUser = sessionStorage.getItem('user');

        if (!storedUser) {
          setError('Không tìm thấy thông tin đăng nhập. Vui lòng đăng nhập lại.');
          return;
        }

        const user = JSON.parse(storedUser);
        const id = Number(user.id);

        if (!Number.isInteger(id) || id < 1) {
          setError('Thông tin tài khoản không hợp lệ.');
          return;
        }

        setUserId(id);

        const response = await fetch(`${API_URL}/cart/${id}`);

        if (!response.ok) {
          throw new Error('Không thể tải giỏ hàng.');
        }

        const data: CartResponse = await response.json();

        setCart({
          ...data,
          items: (data.items ?? []).map((item) => ({
            ...item,
            toppings: item.toppings ?? [],
          })),
        });
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    loadCheckout();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (userId === null) {
      setError('Không xác định được tài khoản. Vui lòng đăng nhập lại.');
      return;
    }

    if (!cart || cart.items.length === 0) {
      setError('Giỏ hàng đang trống. Vui lòng chọn đồ uống trước.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          recipientName: recipientName.trim(),
          recipientPhone: recipientPhone.trim(),
          deliveryAddress: deliveryAddress.trim(),
          note: note.trim() || undefined,
          paymentMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message || 'Đặt hàng thất bại.';
        throw new Error(message);
      }

      const result = data as OrderResponse;

      if (paymentMethod === 'COD') {
        setOrder(result.order);
        setCart({ userId, items: [], total: 0 });
      } else {
        const paymentResponse = await fetch(`${API_URL}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: result.order.id,
            paymentMethod,
            simulateFailure,
          }),
        });
        const paymentData = await paymentResponse.json();

        if (!paymentResponse.ok) {
          throw new Error(
            typeof paymentData.message === 'string'
              ? paymentData.message
              : 'Không thể xử lý thanh toán.',
          );
        }

        if (!paymentData.success) {
          setError(
            paymentData.message ||
              'Thanh toán thất bại. Giỏ hàng của bạn vẫn được giữ nguyên.',
          );
          return;
        }

        setOrder({ ...result.order, status: paymentData.status || 'PAID' });
        setCart({ userId, items: [], total: 0 });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <p style={styles.center}>Đang tải thông tin thanh toán...</p>
        </div>
      </main>
    );
  }

  if (order) {
    return (
      <main style={styles.page}>
        <section style={styles.successCard}>
          <div style={styles.successIcon}>✓</div>

          <h1 style={{ fontSize: '28px', margin: '0 0 12px' }}>
            Đặt hàng thành công!
          </h1>

          <p style={{ ...styles.subtitle, marginBottom: '28px' }}>
            Cảm ơn bạn đã lựa chọn BrewLite. Đơn hàng của bạn đã được ghi nhận.
          </p>

          <div
            style={{
              marginBottom: '28px',
              padding: '18px',
              borderRadius: '12px',
              background: '#fcfaf7',
            }}
          >
            <div style={styles.infoRow}>
              <span style={styles.mutedText}>Mã đơn hàng</span>
              <strong>#{order.id}</strong>
            </div>

            <div style={styles.infoRow}>
              <span style={styles.mutedText}>Người nhận</span>
              <strong>{order.recipientName}</strong>
            </div>

            <div style={styles.infoRow}>
              <span style={styles.mutedText}>Số điện thoại</span>
              <strong>{order.recipientPhone}</strong>
            </div>

            <div style={styles.infoRow}>
              <span style={styles.mutedText}>Tổng thanh toán</span>
              <strong>{formatCurrency(Number(order.totalAmount))}</strong>
            </div>

            <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
              <span style={styles.mutedText}>Trạng thái</span>
              <strong style={{ color: '#a66b19' }}>{order.status}</strong>
            </div>
          </div>

          <button
            style={styles.primaryButton}
            onClick={() => router.push('/')}
          >
            Tiếp tục mua sắm
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={{ textAlign: 'left' }}>
            <button
              style={styles.backButton}
              onClick={() => router.push('/cart')}
            >
              ← Quay lại giỏ hàng
            </button>
          </div>

          <h1 style={styles.title}>Thanh toán</h1>

          <p style={styles.subtitle}>
            Hoàn tất thông tin để BrewLite giao đồ uống đến bạn.
          </p>
        </header>

        {error && (
          <div style={styles.message} role="alert">
            {error}
          </div>
        )}

        <div className="checkout-grid" style={styles.grid}>
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>Thông tin giao hàng</h2>

            <form onSubmit={handleSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label} htmlFor="recipientName">
                  Họ và tên người nhận *
                </label>

                <input
                  style={styles.input}
                  id="recipientName"
                  type="text"
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                  maxLength={100}
                  required
                  placeholder="Nhập họ và tên"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label} htmlFor="recipientPhone">
                  Số điện thoại *
                </label>

                <input
                  style={styles.input}
                  id="recipientPhone"
                  type="tel"
                  value={recipientPhone}
                  onChange={(event) => setRecipientPhone(event.target.value)}
                  maxLength={20}
                  required
                  placeholder="Ví dụ: 0901234567"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label} htmlFor="deliveryAddress">
                  Địa chỉ giao hàng *
                </label>

                <textarea
                  style={styles.textarea}
                  id="deliveryAddress"
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  required
                  rows={3}
                  placeholder="Số nhà, đường, phường/xã, quận/huyện..."
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label} htmlFor="note">
                  Ghi chú
                </label>

                <textarea
                  style={styles.textarea}
                  id="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  placeholder="Ví dụ: Ít đá, giao tại cổng..."
                />
              </div>

              <div style={styles.paymentBox}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px' }}>
                  Phương thức thanh toán
                </h3>

                {([
                  ['COD', 'Thanh toán khi nhận hàng (COD)', 'Thanh toán trực tiếp khi nhận đồ uống.'],
                  ['EWALLET', 'Ví điện tử', 'Thanh toán mô phỏng bằng ví điện tử.'],
                  ['BANK_CARD', 'Thẻ ngân hàng', 'Thanh toán mô phỏng bằng thẻ ngân hàng.'],
                ] as const).map(([value, title, description]) => (
                  <label
                    key={value}
                    style={{ ...styles.paymentLabel, marginBottom: '14px', cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={value}
                      checked={paymentMethod === value}
                      onChange={() => setPaymentMethod(value)}
                      style={{ marginTop: '4px', accentColor: colors.brown }}
                    />
                    <span>
                      <strong style={styles.paymentTitle}>{title}</strong>
                      <small style={styles.mutedText}>{description}</small>
                    </span>
                  </label>
                ))}

                {paymentMethod !== 'COD' && (
                  <label style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', marginTop: '8px', fontSize: '12px', color: colors.muted }}>
                    <input
                      type="checkbox"
                      checked={simulateFailure}
                      onChange={(event) => setSimulateFailure(event.target.checked)}
                      style={{ marginTop: '2px', accentColor: colors.brown }}
                    />
                    Mô phỏng thanh toán thất bại (dùng để kiểm thử Task 8)
                  </label>
                )}
              </div>

              <button
                type="submit"
                style={{
                  ...styles.primaryButton,
                  opacity:
                    submitting || !cart || cart.items.length === 0 ? 0.6 : 1,
                  cursor:
                    submitting || !cart || cart.items.length === 0
                      ? 'not-allowed'
                      : 'pointer',
                }}
                disabled={
                  submitting || !cart || cart.items.length === 0
                }
              >
                {submitting ? 'Đang xử lý...' : paymentMethod === 'COD' ? 'Xác nhận đặt hàng' : 'Đặt hàng và thanh toán'}
              </button>
            </form>
          </section>

          <aside style={styles.card}>
            <h2 style={styles.sectionTitle}>Đơn hàng của bạn</h2>

            {!cart || cart.items.length === 0 ? (
              <div style={{ padding: '18px 0', textAlign: 'center' }}>
                <p style={{ color: colors.muted, marginBottom: '20px' }}>
                  Giỏ hàng đang trống.
                </p>

                <button
                  style={styles.secondaryButton}
                  onClick={() => router.push('/')}
                >
                  Chọn đồ uống
                </button>
              </div>
            ) : (
              <>
                <div style={styles.itemList}>
                  {cart.items.map((item) => (
                    <div style={styles.cartItem} key={item.id}>
                      <div style={styles.itemImage}>
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            style={styles.image}
                            src={item.imageUrl}
                            alt={item.name}
                          />
                        ) : (
                          <span>☕</span>
                        )}
                      </div>

                      <div style={styles.itemDetails}>
                        <strong style={styles.itemName}>{item.name}</strong>

                        <span style={styles.mutedText}>
                          Cỡ {item.size} · SL: {item.quantity}
                        </span>

                        {item.toppings?.length > 0 && (
                          <small style={styles.mutedText}>
                            {item.toppings
                              .map((topping) =>
                                typeof topping === 'string'
                                  ? topping
                                  : topping.name,
                              )
                              .join(', ')}
                          </small>
                        )}

                        <strong style={styles.itemPrice}>
                          {formatCurrency(Number(item.subtotal))}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={styles.totalRow}>
                  <span style={{ fontSize: '15px', fontWeight: 650 }}>
                    Tổng cộng
                  </span>

                  <strong style={styles.totalPrice}>
                    {formatCurrency(Number(cart.total))}
                  </strong>
                </div>

                <p
                  style={{
                    ...styles.mutedText,
                    margin: '16px 0 0',
                    lineHeight: 1.7,
                  }}
                >
                  Giá trị đơn hàng được backend tính toán và xác nhận khi đặt
                  hàng.
                </p>
              </>
            )}
          </aside>
        </div>
      </div>

      <style jsx>{`
        .checkout-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr);
          align-items: start;
          gap: 24px;
        }

        @media (max-width: 760px) {
          .checkout-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </main>
  );
}