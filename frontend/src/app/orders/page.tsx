'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface OrderItem {
  id: number;
  productId?: number;
  productName?: string;
  name?: string;
  quantity: number;
  size: string;
  unitPrice: number | string;
  subtotal?: number | string;
  toppings?: unknown;
}

interface Order {
  id: number;
  totalAmount: number | string;
  status: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  note?: string | null;
  paymentMethod?: string;
  createdAt: string;
  items: OrderItem[];
}

interface OrdersResponse {
  orders?: Order[];
}

/**
 * Định dạng số tiền theo đơn vị Việt Nam đồng.
 */
const formatMoney = (amount: number | string): string => {
  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return '0 ₫';
  }

  return value.toLocaleString('vi-VN') + ' ₫';
};

/**
 * Định dạng ngày giờ đặt hàng.
 */
const formatDate = (date: string): string => {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return parsedDate.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Chuyển mã trạng thái đơn hàng thành nội dung tiếng Việt.
 */
const getStatus = (
  status: string,
): { label: string; color: string } => {
  const statuses: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'Chờ xác nhận', color: '#b7791f' },
    CONFIRMED: { label: 'Đã xác nhận', color: '#2563eb' },
    PROCESSING: { label: 'Đang chuẩn bị', color: '#7c3aed' },
    PREPARING: { label: 'Đang chuẩn bị', color: '#7c3aed' },
    SHIPPING: { label: 'Đang giao hàng', color: '#0369a1' },
    DELIVERING: { label: 'Đang giao hàng', color: '#0369a1' },
    COMPLETED: { label: 'Hoàn thành', color: '#15803d' },
    DELIVERED: { label: 'Đã giao hàng', color: '#15803d' },
    CANCELLED: { label: 'Đã hủy', color: '#dc2626' },
    PAID: { label: 'Đã thanh toán', color: '#15803d' },
    PAYMENT_FAILED: {
      label: 'Thanh toán thất bại',
      color: '#dc2626',
    },
  };

  return statuses[status] || {
    label: status,
    color: '#64748b',
  };
};

/**
 * Chuyển mã phương thức thanh toán thành tiếng Việt.
 */
const getPaymentMethod = (method?: string): string => {
  const methods: Record<string, string> = {
    COD: 'Thanh toán khi nhận hàng',
    EWALLET: 'Ví điện tử',
    BANK_CARD: 'Thẻ ngân hàng',
  };

  return method
    ? methods[method] || method
    : 'Chưa có thông tin';
};

/**
 * Lấy tên topping từ dữ liệu API.
 *
 * Hỗ trợ:
 * - Mảng chuỗi: ["Trân châu", "Pudding"]
 * - Mảng object: [{ name: "Trân châu" }]
 * - Chuỗi JSON chứa mảng topping.
 * - Object có các trường name, toppingName, topping_name,
 *   label, title hoặc topping.
 */
const getToppings = (toppings: unknown): string[] => {
  if (toppings == null || toppings === '') {
    return [];
  }

  let toppingsData: unknown = toppings;

  if (typeof toppingsData === 'string') {
    const originalString = toppingsData;

    try {
      toppingsData = JSON.parse(originalString) as unknown;
    } catch {
      const name = originalString.trim();
      return name ? [name] : [];
    }
  }

  /**
   * Lấy tên topping từ một giá trị bất kỳ.
   */
  const getToppingName = (topping: unknown): string => {
    if (typeof topping === 'string') {
      return topping.trim();
    }

    if (typeof topping === 'number') {
      return String(topping);
    }

    if (
      typeof topping !== 'object' ||
      topping === null ||
      Array.isArray(topping)
    ) {
      return '';
    }

    const item = topping as Record<string, unknown>;

    const possibleNames = [
      item.name,
      item.toppingName,
      item.topping_name,
      item.label,
      item.title,
    ];

    for (const value of possibleNames) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    if (item.topping !== undefined) {
      return getToppingName(item.topping);
    }

    return '';
  };

  if (Array.isArray(toppingsData)) {
    return toppingsData
      .map((item: unknown) => getToppingName(item))
      .filter((name: string) => name.length > 0);
  }

  const name = getToppingName(toppingsData);

  return name ? [name] : [];
};

export default function OrderHistoryPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /**
   * Lấy lịch sử đơn hàng của tài khoản đang đăng nhập.
   */
  const fetchOrders = useCallback(async () => {
    const token = sessionStorage.getItem('access_token');

    if (!token) {
      router.replace('/login');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/orders/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      if (response.status === 401) {
        sessionStorage.removeItem('access_token');
        router.replace('/login');
        return;
      }

      if (!response.ok) {
        throw new Error(
          `Không thể tải lịch sử đơn hàng (HTTP ${response.status}).`,
        );
      }

      const data: OrdersResponse | Order[] = await response.json();

      const orderList = Array.isArray(data)
        ? data
        : data.orders;

      if (!Array.isArray(orderList)) {
        throw new Error(
          'Dữ liệu API chưa đúng định dạng. Hãy kiểm tra GET /orders/me.',
        );
      }

      setOrders(orderList);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Đã xảy ra lỗi khi tải lịch sử đơn hàng.',
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#faf8f4',
        padding: '36px 20px 60px',
        color: '#29251f',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Tiêu đề */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div>
            <Link
              href="/"
              style={{
                color: '#94613b',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              ← Quay lại menu
            </Link>

            <h1
              style={{
                fontSize: 'clamp(28px, 5vw, 36px)',
                fontWeight: 800,
                margin: '16px 0 8px',
              }}
            >
              Lịch sử đơn hàng
            </h1>

            <p style={{ color: '#78716c', margin: 0 }}>
              Theo dõi những đơn hàng bạn đã đặt tại BrewLite.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void fetchOrders()}
            disabled={loading}
            style={{
              padding: '11px 18px',
              borderRadius: 10,
              border: '1px solid #d6c7b7',
              background: loading ? '#eee8e1' : '#fff',
              color: '#68472e',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Đang tải...' : '↻ Tải lại'}
          </button>
        </header>

        {/* Đang tải */}
        {loading && (
          <section
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 40,
              textAlign: 'center',
              border: '1px solid #eee5dc',
            }}
          >
            <p style={{ fontSize: 16 }}>
              Đang tải lịch sử đơn hàng...
            </p>
          </section>
        )}

        {/* Thông báo lỗi */}
        {!loading && error && (
          <section
            style={{
              background: '#fff',
              border: '1px solid #fecaca',
              borderRadius: 16,
              padding: 28,
              textAlign: 'center',
            }}
          >
            <p style={{ color: '#dc2626', fontWeight: 600 }}>
              {error}
            </p>

            <button
              type="button"
              onClick={() => void fetchOrders()}
              style={{
                background: '#94613b',
                color: '#fff',
                border: 0,
                borderRadius: 10,
                padding: '11px 20px',
                cursor: 'pointer',
              }}
            >
              Thử lại
            </button>
          </section>
        )}

        {/* Chưa có đơn hàng */}
        {!loading && !error && orders.length === 0 && (
          <section
            style={{
              background: '#fff',
              border: '1px solid #eee5dc',
              borderRadius: 16,
              padding: '52px 24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 52, marginBottom: 12 }}>
              ☕
            </div>

            <h2 style={{ fontSize: 23, margin: '0 0 10px' }}>
              Bạn chưa có đơn hàng nào
            </h2>

            <p style={{ color: '#78716c', marginBottom: 24 }}>
              Hãy khám phá menu và đặt món yêu thích của bạn nhé!
            </p>

            <Link
              href="/"
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                background: '#94613b',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: 10,
                fontWeight: 700,
              }}
            >
              Khám phá menu
            </Link>
          </section>
        )}

        {/* Danh sách đơn hàng */}
        {!loading &&
          !error &&
          orders.map((order) => {
            const status = getStatus(order.status);

            return (
              <article
                key={order.id}
                style={{
                  background: '#fff',
                  border: '1px solid #eee5dc',
                  borderRadius: 16,
                  marginBottom: 22,
                  overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(60, 40, 20, 0.04)',
                }}
              >
                {/* Tổng quan đơn hàng */}
                <div
                  style={{
                    padding: '22px 24px',
                    borderBottom: '1px solid #eee5dc',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 16,
                    background: '#fffdfb',
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: '0 0 6px',
                        color: '#78716c',
                        fontSize: 13,
                      }}
                    >
                      MÃ ĐƠN HÀNG
                    </p>

                    <h2 style={{ margin: 0, fontSize: 21 }}>
                      #{order.id}
                    </h2>

                    <p
                      style={{
                        margin: '8px 0 0',
                        color: '#78716c',
                        fontSize: 14,
                      }}
                    >
                      Ngày đặt: {formatDate(order.createdAt)}
                    </p>
                  </div>

                  <span
                    style={{
                      display: 'inline-block',
                      padding: '8px 13px',
                      borderRadius: 20,
                      background: `${status.color}15`,
                      color: status.color,
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {status.label}
                  </span>
                </div>

                {/* Chi tiết món hàng */}
                <div style={{ padding: '22px 24px' }}>
                  <h3
                    style={{
                      fontSize: 17,
                      margin: '0 0 16px',
                    }}
                  >
                    Chi tiết đơn hàng
                  </h3>

                  {order.items?.length ? (
                    order.items.map((item) => {
                      const toppings = getToppings(item.toppings);

                      return (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 16,
                            padding: '14px 0',
                            borderBottom: '1px solid #f0ebe5',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                margin: '0 0 6px',
                                fontWeight: 700,
                                fontSize: 15,
                              }}
                            >
                              {item.productName ||
                                item.name ||
                                `Sản phẩm #${item.productId ?? item.id}`}
                            </p>

                            <p
                              style={{
                                margin: '0 0 5px',
                                color: '#78716c',
                                fontSize: 13,
                              }}
                            >
                              Size {item.size} · Số lượng: {item.quantity}
                            </p>

                            {toppings.length > 0 && (
                              <p
                                style={{
                                  margin: 0,
                                  color: '#78716c',
                                  fontSize: 13,
                                }}
                              >
                                Topping: {toppings.join(', ')}
                              </p>
                            )}

                            <p
                              style={{
                                margin: '6px 0 0',
                                color: '#78716c',
                                fontSize: 13,
                              }}
                            >
                              Đơn giá: {formatMoney(item.unitPrice)}
                            </p>
                          </div>

                          <strong
                            style={{
                              whiteSpace: 'nowrap',
                              fontSize: 15,
                            }}
                          >
                            {formatMoney(
                              item.subtotal !== undefined
                                ? item.subtotal
                                : Number(item.unitPrice) * item.quantity,
                            )}
                          </strong>
                        </div>
                      );
                    })
                  ) : (
                    <p style={{ color: '#78716c' }}>
                      Không có thông tin chi tiết món hàng.
                    </p>
                  )}
                </div>

                {/* Thông tin nhận hàng và thanh toán */}
                <div
                  style={{
                    padding: '0 24px 22px',
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 18,
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: '0 0 6px',
                        color: '#78716c',
                        fontSize: 13,
                      }}
                    >
                      PHƯƠNG THỨC THANH TOÁN
                    </p>

                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {getPaymentMethod(order.paymentMethod)}
                    </p>
                  </div>

                  {order.recipientName && (
                    <div>
                      <p
                        style={{
                          margin: '0 0 6px',
                          color: '#78716c',
                          fontSize: 13,
                        }}
                      >
                        NGƯỜI NHẬN
                      </p>

                      <p
                        style={{
                          margin: '0 0 4px',
                          fontWeight: 600,
                        }}
                      >
                        {order.recipientName}
                      </p>

                      {order.recipientPhone && (
                        <p
                          style={{
                            margin: '0 0 4px',
                            color: '#78716c',
                            fontSize: 13,
                          }}
                        >
                          {order.recipientPhone}
                        </p>
                      )}

                      {order.recipientAddress && (
                        <p
                          style={{
                            margin: 0,
                            color: '#78716c',
                            fontSize: 13,
                          }}
                        >
                          {order.recipientAddress}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Ghi chú */}
                {order.note && (
                  <div
                    style={{
                      margin: '0 24px 20px',
                      padding: 12,
                      background: '#faf8f4',
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                  >
                    <strong>Ghi chú:</strong> {order.note}
                  </div>
                )}

                {/* Tổng tiền */}
                <div
                  style={{
                    padding: '20px 24px',
                    background: '#f7f1e9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    Tổng thanh toán
                  </span>

                  <strong
                    style={{
                      fontSize: 23,
                      color: '#94613b',
                    }}
                  >
                    {formatMoney(order.totalAmount)}
                  </strong>
                </div>
              </article>
            );
          })}
      </div>
    </main>
  );
}
