import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** Mã giao dịch hiển thị cho khách, dạng BLP... */
export function newTransactionRef(): string {
  const time = Date.now().toString(36).toUpperCase();
  const random = randomBytes(4).toString('hex').toUpperCase();

  return `BLP${time}${random}`.slice(0, 40);
}

/**
 * OTP mô phỏng: sinh tất định từ mã giao dịch và thời điểm hết hạn,
 * nên không cần lưu mã trong database và vẫn đổi theo từng phiên.
 */
export function deriveOtp(
  secret: string,
  transactionRef: string,
  expiresAt: Date,
): string {
  const digest = createHmac('sha256', secret)
    .update(`${transactionRef}:${expiresAt.getTime()}`)
    .digest();

  const value = digest.readUInt32BE(0) % 1_000_000;

  return String(value).padStart(6, '0');
}

/** So sánh OTP theo thời gian hằng định. */
export function otpMatches(expected: string, actual: string): boolean {
  if (typeof actual !== 'string' || !/^\d{6}$/.test(actual)) {
    return false;
  }

  const left = Buffer.from(expected);
  const right = Buffer.from(actual);

  return left.length === right.length && timingSafeEqual(left, right);
}
