/** Phiên thanh toán đang chờ khách thao tác. */
export const ACTIVE_PAYMENT_STATUSES = [
  'AWAITING_PAYMENT',
  'AWAITING_OTP',
] as const;

/** Phương thức phải mở phiên thanh toán trực tuyến. */
export const ONLINE_METHODS = ['EWALLET', 'BANK_CARD'] as const;

/** Số lần nhập sai tối đa cho mỗi bước (PIN, thông tin thẻ, OTP). */
export const MAX_ATTEMPTS = 3;

/** Thời hạn của một phiên thanh toán: 5 phút. */
export const PAYMENT_SESSION_TTL_MS = 5 * 60 * 1000;

/** Thời hạn của mã OTP: 3 phút. */
export const OTP_TTL_MS = 3 * 60 * 1000;

/** Thời gian khóa ví sau khi nhập sai PIN quá số lần cho phép. */
export const WALLET_LOCK_MS = 5 * 60 * 1000;

/** Số dư tối đa của ví BrewPay. */
export const MAX_WALLET_BALANCE = 10_000_000;

/** Số tiền nạp tối thiểu mỗi lần. */
export const MIN_TOPUP_AMOUNT = 10_000;

/** Số tiền nạp tối đa mỗi lần. */
export const MAX_TOPUP_AMOUNT = 2_000_000;
