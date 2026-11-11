'use client';

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PaymentSession {
  paymentId: number;
  orderId: number;
  orderStatus: string;
  method: 'EWALLET' | 'BANK_CARD';
  status: string;
  amount: number;
  transactionRef: string | null;
  expiresAt: string | null;
  attemptsLeft: number;
  card: { brand: string | null; last4: string | null } | null;
  wallet: { lockedUntil: string | null } | null;
  otpExpiresAt: string | null;
  sandboxSms: { from: string; message: string } | null;
  failure: { code: string; message: string } | null;
  result: {
    authCode?: string;
    paidAt?: string;
    pointsEarned?: number;
    loyaltyPointsBalance?: number;
  } | null;
}

interface WalletInfo {
  exists: boolean;
  balance: number;
  lockedUntil: string | null;
}

interface TestCard {
  number: string;
  brand: string;
  description: string;
}

class ApiError extends Error {
  code?: string;
  attemptsLeft?: number;

  constructor(message: string, code?: string, attemptsLeft?: number) {
    super(message);
    this.code = code;
    this.attemptsLeft = attemptsLeft;
  }
}

const colors = {
  background: '#f8f6f2',
  brown: '#76513a',
  brownDark: '#5d3d2a',
  text: '#30271f',
  muted: '#786d63',
  border: '#ece4da',
  white: '#ffffff',
  green: '#15803d',
  red: '#b91c1c',
  amber: '#a66b19',
};

const formatMoney = (amount: number) =>
  `${Math.round(amount).toLocaleString('vi-VN')} ₫`;

const formatCountdown = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');

  return `${minutes}:${seconds}`;
};

const isActive = (status: string) =>
  status === 'AWAITING_PAYMENT' || status === 'AWAITING_OTP';

const methodLabel = (method: string) =>
  method === 'EWALLET' ? 'Ví BrewPay' : 'Thẻ ngân hàng';

const styles = {
  page: {
    minHeight: '100vh',
    padding: '36px 20px 60px',
    background: colors.background,
    color: colors.text,
    fontFamily: 'Arial, Helvetica, sans-serif',
    boxSizing: 'border-box' as const,
  },
  container: { width: '100%', maxWidth: '560px', margin: '0 auto' },
  card: {
    padding: '28px',
    border: `1px solid ${colors.border}`,
    borderRadius: '18px',
    background: colors.white,
    boxShadow: '0 8px 28px rgba(67, 47, 29, 0.05)',
    boxSizing: 'border-box' as const,
    marginBottom: '18px',
  },
  title: { margin: '0 0 6px', fontSize: '26px', fontWeight: 800 },
  muted: { color: colors.muted, fontSize: '14px', lineHeight: 1.6 },
  label: { display: 'block', margin: '0 0 8px', fontSize: '14px', fontWeight: 650 },
  input: {
    width: '100%',
    padding: '13px 14px',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    fontSize: '16px',
    color: colors.text,
    background: '#fffdfb',
    boxSizing: 'border-box' as const,
    marginBottom: '16px',
    outline: 'none',
  },
  primary: {
    width: '100%',
    padding: '14px 18px',
    border: 'none',
    borderRadius: '12px',
    background: colors.brown,
    color: colors.white,
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondary: {
    padding: '12px 18px',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    background: colors.white,
    color: colors.brown,
    fontSize: '15px',
    fontWeight: 650,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
    textAlign: 'center' as const,
  },
  linkButton: {
    border: 'none',
    background: 'transparent',
    color: colors.muted,
    fontSize: '14px',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: '8px 0',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 0',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: '14px',
  },
  errorBox: {
    margin: '0 0 16px',
    padding: '12px 14px',
    borderRadius: '10px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: colors.red,
    fontSize: '14px',
    lineHeight: 1.5,
  },
  sandbox: {
    margin: '0 0 18px',
    padding: '10px 14px',
    borderRadius: '10px',
    background: '#fff8e8',
    border: '1px solid #f3dfb1',
    color: colors.amber,
    fontSize: '13px',
    lineHeight: 1.5,
  },
};

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <main style={styles.page}>
          <div style={styles.container}>
            <p style={{ ...styles.muted, textAlign: 'center' }}>
              Đang mở phiên thanh toán...
            </p>
          </div>
        </main>
      }
    >
      <PayPageContent />
    </Suspense>
  );
}

function PayPageContent() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const orderId = Number(params.orderId);
  const invalidOrder = !Number.isInteger(orderId) || orderId < 1;

  const [session, setSession] = useState<PaymentSession | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(!invalidOrder);
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState('');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(() => Date.now());

  const refreshedFor = useRef<string | null>(null);
  const started = useRef(false);

  const api = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = sessionStorage.getItem('access_token');

      if (!token) {
        router.replace('/login');
        throw new ApiError('Bạn cần đăng nhập để thanh toán.');
      }

      const response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
        cache: 'no-store',
      });

      if (response.status === 401) {
        sessionStorage.removeItem('access_token');
        router.replace('/login');
        throw new ApiError('Phiên đăng nhập đã hết hạn.');
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message || 'Không thể xử lý yêu cầu.';

        throw new ApiError(message, data.code, data.attemptsLeft);
      }

      return data as T;
    },
    [router],
  );

  const loadWallet = useCallback(async () => {
    try {
      setWallet(await api<WalletInfo>('/wallet'));
    } catch {
      // Bỏ qua: giao diện ví sẽ hiển thị trạng thái đang tải.
    }
  }, [api]);

  const openSession = useCallback(
    async (forceNew: boolean) => {
      const storageKey = `brewlite-pay-key-${orderId}`;
      let key = forceNew ? null : sessionStorage.getItem(storageKey);

      if (!key) {
        key = `pay-${orderId}-${crypto.randomUUID()}`;
        sessionStorage.setItem(storageKey, key);
      }

      const data = await api<PaymentSession>('/payments', {
        method: 'POST',
        body: JSON.stringify({ orderId, idempotencyKey: key }),
      });

      setSession(data);

      return data;
    },
    [api, orderId],
  );

  // Mở phiên thanh toán khi vào trang.
  useEffect(() => {
    if (started.current || invalidOrder) return;
    started.current = true;

    const wantsRetry =
      new URLSearchParams(window.location.search).get('retry') === '1';

    openSession(wantsRetry)
      .then((data) => {
        if (data.method === 'EWALLET') void loadWallet();
      })
      .catch((err: unknown) =>
        setFatal(err instanceof Error ? err.message : 'Không thể mở thanh toán.'),
      )
      .finally(() => setLoading(false));
  }, [invalidOrder, openSession, loadWallet]);

  // Đồng hồ đếm ngược.
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!session) return;

    try {
      setSession(await api<PaymentSession>(`/payments/${session.paymentId}`));
    } catch {
      // Lần cập nhật sau sẽ thử lại.
    }
  }, [api, session]);

  const remainingMs = session?.expiresAt
    ? Date.parse(session.expiresAt) - tick
    : 0;

  // Hết giờ: hỏi lại máy chủ để đóng phiên và cập nhật trạng thái đơn.
  useEffect(() => {
    if (
      session &&
      isActive(session.status) &&
      remainingMs <= 0 &&
      refreshedFor.current !== session.transactionRef
    ) {
      refreshedFor.current = session.transactionRef;
      void refreshSession();
    }
  }, [session, remainingMs, refreshSession]);

  // Chạy một thao tác gọi API; lỗi nhập liệu hiển thị ngay trên biểu mẫu.
  async function run(action: () => Promise<void>) {
    setError('');
    setBusy(true);

    try {
      await action();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Đã xảy ra lỗi. Vui lòng thử lại.';

      setError(message);

      if (err instanceof ApiError && err.code) {
        // Lỗi nhập liệu có thể sửa được: cập nhật số lần còn lại.
        void refreshSession();
        void loadWallet();
      }
    } finally {
      setBusy(false);
    }
  }

  const post = <T,>(path: string, body?: object) =>
    api<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });

  const confirmWallet = (pin: string) =>
    run(async () => {
      if (!session) return;
      setSession(
        await post<PaymentSession>(`/payments/${session.paymentId}/confirm`, {
          pin,
        }),
      );
      void loadWallet();
    });

  const confirmCard = (card: {
    cardNumber: string;
    cardHolder: string;
    expiry: string;
    cvv: string;
  }) =>
    run(async () => {
      if (!session) return;
      setSession(
        await post<PaymentSession>(
          `/payments/${session.paymentId}/confirm`,
          card,
        ),
      );
    });

  const submitOtp = (otp: string) =>
    run(async () => {
      if (!session) return;
      setSession(
        await post<PaymentSession>(`/payments/${session.paymentId}/otp`, {
          otp,
        }),
      );
    });

  const cancelPayment = () =>
    run(async () => {
      if (!session) return;
      setSession(
        await post<PaymentSession>(`/payments/${session.paymentId}/cancel`),
      );
    });

  const retry = () =>
    run(async () => {
      const data = await openSession(true);

      if (data.method === 'EWALLET') await loadWallet();
    });

  const cancelOrder = () =>
    run(async () => {
      if (!window.confirm(`Hủy đơn hàng #${orderId}?`)) return;
      await post(`/orders/${orderId}/cancel`);
      router.push('/orders');
    });

  const createWallet = (pin: string) =>
    run(async () => {
      setWallet(await post<WalletInfo>('/wallet', { pin }));
    });

  const topUp = (amount: number) =>
    run(async () => {
      setWallet(await post<WalletInfo>('/wallet/topup', { amount }));
    });

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <p style={{ ...styles.muted, textAlign: 'center' }}>
            Đang mở phiên thanh toán...
          </p>
        </div>
      </main>
    );
  }

  const fatalMessage = invalidOrder ? 'Mã đơn hàng không hợp lệ.' : fatal;

  if (fatalMessage || !session) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <section style={styles.card}>
            <h1 style={styles.title}>Không thể thanh toán</h1>
            <p style={{ ...styles.muted, marginBottom: '20px' }}>
              {fatalMessage || 'Không tìm thấy phiên thanh toán.'}
            </p>
            <Link href="/orders" style={styles.secondary}>
              Xem đơn hàng của tôi
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const active = isActive(session.status);

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <Link
          href="/orders"
          style={{ color: colors.brown, fontSize: '14px', textDecoration: 'none' }}
        >
          ← Đơn hàng của tôi
        </Link>

        <h1 style={{ ...styles.title, margin: '14px 0 16px' }}>
          Thanh toán đơn hàng #{session.orderId}
        </h1>

        <div style={styles.sandbox}>
          Cổng thanh toán <strong>mô phỏng</strong>: không có tiền thật được
          chuyển. Dùng thẻ thử nghiệm bên dưới để thử các tình huống khác nhau.
        </div>

        <section style={styles.card}>
          <div style={styles.row}>
            <span style={styles.muted}>Phương thức</span>
            <strong>{methodLabel(session.method)}</strong>
          </div>
          <div style={styles.row}>
            <span style={styles.muted}>Mã giao dịch</span>
            <strong style={{ fontFamily: 'monospace' }}>
              {session.transactionRef}
            </strong>
          </div>
          <div style={{ ...styles.row, borderBottom: active ? undefined : 'none' }}>
            <span style={styles.muted}>Số tiền</span>
            <strong style={{ fontSize: '20px', color: colors.brown }}>
              {formatMoney(session.amount)}
            </strong>
          </div>
          {active && (
            <div style={{ ...styles.row, borderBottom: 'none' }}>
              <span style={styles.muted}>Phiên hết hạn sau</span>
              <strong
                style={{
                  fontFamily: 'monospace',
                  color: remainingMs < 60_000 ? colors.red : colors.text,
                }}
              >
                {formatCountdown(remainingMs)}
              </strong>
            </div>
          )}
        </section>

        {error && <div style={styles.errorBox} role="alert">{error}</div>}

        {session.status === 'AWAITING_PAYMENT' && session.method === 'EWALLET' && (
          <WalletPanel
            session={session}
            wallet={wallet}
            now={tick}
            busy={busy}
            onCreate={createWallet}
            onTopUp={topUp}
            onConfirm={confirmWallet}
          />
        )}

        {session.status === 'AWAITING_PAYMENT' && session.method === 'BANK_CARD' && (
          <CardPanel
            session={session}
            busy={busy}
            onConfirm={confirmCard}
            loadTestCards={() => api<TestCard[]>('/payments/test-cards')}
          />
        )}

        {session.status === 'AWAITING_OTP' && (
          <OtpPanel session={session} busy={busy} onSubmit={submitOtp} />
        )}

        {active && (
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              style={styles.linkButton}
              onClick={cancelPayment}
              disabled={busy}
            >
              Hủy thanh toán
            </button>
          </div>
        )}

        {session.status === 'SUCCESS' && (
          <section style={{ ...styles.card, textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                margin: '0 auto 16px',
                borderRadius: '50%',
                background: '#e7f6ec',
                color: colors.green,
                fontSize: 32,
                lineHeight: '64px',
              }}
            >
              ✓
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Thanh toán thành công</h2>
            <p style={{ ...styles.muted, margin: '0 0 6px' }}>
              Đơn hàng #{session.orderId} đã được thanh toán
              {session.card?.last4 ? ` bằng thẻ ${session.card.brand} •••• ${session.card.last4}` : ''}.
            </p>
            {session.result?.pointsEarned ? (
              <p style={{ ...styles.muted, margin: '0 0 6px' }}>
                Bạn nhận được <strong>{session.result.pointsEarned} điểm</strong> thưởng
                (tổng {session.result.loyaltyPointsBalance} điểm).
              </p>
            ) : null}
            <p style={{ ...styles.muted, margin: '0 0 22px', fontSize: 13 }}>
              Mã xác nhận: {session.result?.authCode}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/orders" style={styles.secondary}>Xem đơn hàng</Link>
              <Link href="/" style={{ ...styles.secondary, background: colors.brown, color: colors.white, border: 'none' }}>
                Tiếp tục mua sắm
              </Link>
            </div>
          </section>
        )}

        {!active && session.status !== 'SUCCESS' && (
          <section style={styles.card}>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, color: colors.red }}>
              {session.status === 'EXPIRED'
                ? 'Phiên thanh toán đã hết hạn'
                : session.status === 'CANCELLED'
                  ? 'Giao dịch đã bị hủy'
                  : 'Thanh toán thất bại'}
            </h2>
            <p style={{ ...styles.muted, margin: '0 0 6px' }}>
              {session.failure?.message || 'Giao dịch không thành công.'}
            </p>
            <p style={{ ...styles.muted, margin: '0 0 20px', fontSize: 13 }}>
              Giỏ hàng của bạn vẫn được giữ nguyên. Nguyên liệu đã được hoàn lại
              cho đến khi bạn thanh toán lại.
            </p>

            {session.orderStatus === 'PAYMENT_FAILED' || session.orderStatus === 'PENDING' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <button type="button" style={styles.primary} onClick={retry} disabled={busy}>
                  Thử thanh toán lại
                </button>
                <button type="button" style={styles.secondary} onClick={cancelOrder} disabled={busy}>
                  Hủy đơn hàng
                </button>
              </div>
            ) : (
              <Link href="/orders" style={styles.secondary}>Xem đơn hàng</Link>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------
// Ví BrewPay
// ---------------------------------------------------------------------

function WalletPanel(props: {
  session: PaymentSession;
  wallet: WalletInfo | null;
  now: number;
  busy: boolean;
  onCreate: (pin: string) => void;
  onTopUp: (amount: number) => void;
  onConfirm: (pin: string) => void;
}) {
  const { session, wallet, busy, now } = props;
  const [pin, setPin] = useState('');
  const [pinAgain, setPinAgain] = useState('');

  if (!wallet) {
    return (
      <section style={styles.card}>
        <p style={styles.muted}>Đang tải ví BrewPay...</p>
      </section>
    );
  }

  if (!wallet.exists) {
    const mismatch = pinAgain.length > 0 && pin !== pinAgain;

    return (
      <section style={styles.card}>
        <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>Kích hoạt ví BrewPay</h2>
        <p style={{ ...styles.muted, margin: '0 0 18px' }}>
          Tạo mã PIN gồm 6 chữ số để bảo vệ ví. Số dư ban đầu là 0 ₫, bạn có
          thể nạp tiền thử nghiệm ngay sau đó.
        </p>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!mismatch) props.onCreate(pin);
          }}
        >
          <label style={styles.label} htmlFor="new-pin">Tạo mã PIN (6 số)</label>
          <input id="new-pin" style={styles.input} type="password" inputMode="numeric"
            autoComplete="off" maxLength={6} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          <label style={styles.label} htmlFor="new-pin-again">Nhập lại mã PIN</label>
          <input id="new-pin-again" style={styles.input} type="password" inputMode="numeric"
            autoComplete="off" maxLength={6} value={pinAgain}
            onChange={(e) => setPinAgain(e.target.value.replace(/\D/g, ''))} />
          {mismatch && <div style={styles.errorBox}>Hai mã PIN chưa khớp nhau.</div>}
          <button type="submit" style={{ ...styles.primary, opacity: busy || pin.length !== 6 || mismatch ? 0.6 : 1 }}
            disabled={busy || pin.length !== 6 || pin !== pinAgain}>
            Kích hoạt ví
          </button>
        </form>
      </section>
    );
  }

  const lockedUntil = session.wallet?.lockedUntil ?? wallet.lockedUntil;
  const locked = Boolean(lockedUntil && Date.parse(lockedUntil) > now);
  const enough = wallet.balance >= session.amount;

  return (
    <section style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ ...styles.muted, fontSize: 13 }}>Số dư ví BrewPay</div>
          <strong style={{ fontSize: 24, color: enough ? colors.text : colors.red }}>
            {formatMoney(wallet.balance)}
          </strong>
        </div>
      </div>

      {!enough && (
        <div style={styles.errorBox}>
          Số dư chưa đủ, bạn cần thêm {formatMoney(session.amount - wallet.balance)}. Hãy nạp tiền bên dưới.
        </div>
      )}

      <div style={{ ...styles.muted, fontSize: 13, marginBottom: 8 }}>
        Nạp tiền thử nghiệm (từ ngân hàng liên kết)
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
        {[50_000, 100_000, 200_000, 500_000].map((amount) => (
          <button key={amount} type="button" style={{ ...styles.secondary, padding: '8px 14px', fontSize: 14 }}
            disabled={busy} onClick={() => props.onTopUp(amount)}>
            +{amount.toLocaleString('vi-VN')}
          </button>
        ))}
      </div>

      {locked && (
        <div style={styles.errorBox}>
          Ví đang bị khóa tạm thời do nhập sai PIN
          {lockedUntil ? ` (đến ${new Date(lockedUntil).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})` : ''}.
        </div>
      )}

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          props.onConfirm(pin);
          setPin('');
        }}
      >
        <label style={styles.label} htmlFor="pay-pin">
          Nhập mã PIN để thanh toán
          {session.attemptsLeft < 3 && (
            <span style={{ color: colors.red, fontWeight: 400 }}> · còn {session.attemptsLeft} lần thử</span>
          )}
        </label>
        <input id="pay-pin" style={styles.input} type="password" inputMode="numeric"
          autoComplete="off" maxLength={6} placeholder="••••••" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        <button type="submit"
          style={{ ...styles.primary, opacity: busy || pin.length !== 6 || locked ? 0.6 : 1 }}
          disabled={busy || pin.length !== 6 || locked}>
          {busy ? 'Đang xử lý...' : `Thanh toán ${formatMoney(session.amount)}`}
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------
// Thẻ ngân hàng
// ---------------------------------------------------------------------

function CardPanel(props: {
  session: PaymentSession;
  busy: boolean;
  onConfirm: (card: { cardNumber: string; cardHolder: string; expiry: string; cvv: string }) => void;
  loadTestCards: () => Promise<TestCard[]>;
}) {
  const { session, busy } = props;
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [testCards, setTestCards] = useState<TestCard[] | null>(null);

  const formatNumber = (value: string) =>
    value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);

    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  };

  const valid =
    cardNumber.replace(/\s/g, '').length >= 13 &&
    cardHolder.trim().length >= 2 &&
    expiry.length === 5 &&
    cvv.length === 3;

  async function toggleTestCards(open: boolean) {
    if (open && !testCards) {
      try {
        setTestCards(await props.loadTestCards());
      } catch {
        setTestCards([]);
      }
    }
  }

  return (
    <section style={styles.card}>
      <h2 style={{ margin: '0 0 18px', fontSize: 20 }}>Thông tin thẻ</h2>

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          props.onConfirm({ cardNumber, cardHolder, expiry, cvv });
        }}
      >
        <label style={styles.label} htmlFor="card-number">
          Số thẻ
          {session.attemptsLeft < 3 && (
            <span style={{ color: colors.red, fontWeight: 400 }}> · còn {session.attemptsLeft} lần thử</span>
          )}
        </label>
        <input id="card-number" style={{ ...styles.input, fontFamily: 'monospace' }} inputMode="numeric"
          autoComplete="off" placeholder="0000 0000 0000 0000" value={cardNumber}
          onChange={(e) => setCardNumber(formatNumber(e.target.value))} />

        <label style={styles.label} htmlFor="card-holder">Tên chủ thẻ</label>
        <input id="card-holder" style={{ ...styles.input, textTransform: 'uppercase' }} autoComplete="off"
          placeholder="NGUYEN VAN A" value={cardHolder} maxLength={60}
          onChange={(e) => setCardHolder(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={styles.label} htmlFor="card-expiry">Hết hạn (MM/YY)</label>
            <input id="card-expiry" style={styles.input} inputMode="numeric" autoComplete="off"
              placeholder="12/30" value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))} />
          </div>
          <div>
            <label style={styles.label} htmlFor="card-cvv">CVV</label>
            <input id="card-cvv" style={styles.input} type="password" inputMode="numeric"
              autoComplete="off" maxLength={3} placeholder="•••" value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>

        <button type="submit" style={{ ...styles.primary, opacity: busy || !valid ? 0.6 : 1 }}
          disabled={busy || !valid}>
          {busy ? 'Đang xử lý...' : `Thanh toán ${formatMoney(session.amount)}`}
        </button>
      </form>

      <details
        style={{ marginTop: 20 }}
        onToggle={(event) => void toggleTestCards((event.target as HTMLDetailsElement).open)}
      >
        <summary style={{ cursor: 'pointer', color: colors.brown, fontSize: 14, fontWeight: 650 }}>
          Thẻ thử nghiệm
        </summary>
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {!testCards && <span style={styles.muted}>Đang tải...</span>}
          {testCards?.map((card) => (
            <button key={card.number} type="button"
              style={{ ...styles.secondary, textAlign: 'left', padding: '10px 12px', fontWeight: 400 }}
              onClick={() => {
                setCardNumber(formatNumber(card.number));
                setCardHolder('NGUYEN VAN A');
                setExpiry('12/30');
                setCvv('123');
              }}>
              <strong style={{ fontFamily: 'monospace' }}>{formatNumber(card.number)}</strong>
              <span style={{ display: 'block', color: colors.muted, fontSize: 13 }}>
                {card.brand} · {card.description}
              </span>
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------
// Xác thực OTP (3-D Secure)
// ---------------------------------------------------------------------

function OtpPanel(props: {
  session: PaymentSession;
  busy: boolean;
  onSubmit: (otp: string) => void;
}) {
  const { session, busy } = props;
  const [otp, setOtp] = useState('');

  return (
    <section style={styles.card}>
      <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>Xác thực giao dịch</h2>
      <p style={{ ...styles.muted, margin: '0 0 16px' }}>
        Ngân hàng phát hành thẻ {session.card?.brand} •••• {session.card?.last4}{' '}
        đã gửi mã OTP đến số điện thoại của bạn.
      </p>

      {session.sandboxSms && (
        <div
          style={{
            margin: '0 0 18px',
            padding: '12px 14px',
            borderRadius: 14,
            background: '#f1f5f9',
            border: '1px solid #e2e8f0',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>
            Tin nhắn mô phỏng · {session.sandboxSms.from}
          </div>
          {session.sandboxSms.message}
        </div>
      )}

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          props.onSubmit(otp);
          setOtp('');
        }}
      >
        <label style={styles.label} htmlFor="otp">
          Nhập mã OTP
          {session.attemptsLeft < 3 && (
            <span style={{ color: colors.red, fontWeight: 400 }}> · còn {session.attemptsLeft} lần thử</span>
          )}
        </label>
        <input id="otp" style={{ ...styles.input, letterSpacing: 6, fontFamily: 'monospace' }}
          inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••"
          value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
        <button type="submit" style={{ ...styles.primary, opacity: busy || otp.length !== 6 ? 0.6 : 1 }}
          disabled={busy || otp.length !== 6}>
          {busy ? 'Đang xác thực...' : 'Xác nhận'}
        </button>
      </form>
    </section>
  );
}
