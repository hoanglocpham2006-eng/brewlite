/**
 * Cổng thẻ mô phỏng (BrewBank Sandbox).
 * Không gọi ra ngoài, không lưu số thẻ đầy đủ hay CVV.
 */

export interface CardInput {
  cardNumber?: string;
  cardHolder?: string;
  expiry?: string;
  cvv?: string;
}

export type CardEvaluation =
  | { kind: 'invalid_input'; code: string; message: string }
  | {
      kind: 'declined';
      code: string;
      message: string;
      brand: string;
      last4: string;
    }
  | { kind: 'requires_otp'; brand: string; last4: string }
  | { kind: 'approved'; brand: string; last4: string };

export interface TestCard {
  number: string;
  brand: string;
  description: string;
}

/** Danh sách thẻ thử nghiệm hiển thị trên trang thanh toán. */
export const TEST_CARDS: readonly TestCard[] = [
  {
    number: '4242424242424242',
    brand: 'Visa',
    description: 'Thành công ngay',
  },
  {
    number: '5555555555554444',
    brand: 'Mastercard',
    description: 'Thành công sau khi nhập OTP',
  },
  {
    number: '9704000000000018',
    brand: 'NAPAS',
    description: 'Thẻ nội địa, thành công sau khi nhập OTP',
  },
  {
    number: '4000000000000002',
    brand: 'Visa',
    description: 'Bị từ chối (CARD_DECLINED)',
  },
  {
    number: '4000000000009995',
    brand: 'Visa',
    description: 'Không đủ số dư (INSUFFICIENT_FUNDS)',
  },
  {
    number: '4000000000000069',
    brand: 'Visa',
    description: 'Thẻ hết hạn (EXPIRED_CARD)',
  },
  {
    number: '4000000000000127',
    brand: 'Visa',
    description: 'Thẻ bị khóa (CARD_BLOCKED)',
  },
];

const digitsOnly = (value: string) => value.replace(/\D/g, '');

/** Kiểm tra số thẻ bằng thuật toán Luhn. */
export function isValidLuhn(cardNumber: string): boolean {
  const digits = digitsOnly(cardNumber);

  if (!/^\d{13,19}$/.test(digits)) return false;

  let sum = 0;
  let double = false;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);

    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
}

export function detectBrand(cardNumber: string): string {
  const digits = digitsOnly(cardNumber);

  if (/^4/.test(digits)) return 'Visa';
  if (/^5[1-5]/.test(digits)) return 'Mastercard';
  if (/^2(2[2-9]|[3-6]\d|7[01]\d|720)/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^9704/.test(digits)) return 'NAPAS';

  return 'Thẻ';
}

/** Hạn thẻ hợp lệ: MM/YY hoặc MM/YYYY, còn hạn trong tháng đó. */
function parseExpiry(
  value: string,
  now: Date,
): { ok: true } | { ok: false; message: string } {
  const match = /^\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})\s*$/.exec(value);

  if (!match) {
    return { ok: false, message: 'Hạn thẻ phải có dạng MM/YY.' };
  }

  const month = Number(match[1]);
  const year =
    match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);

  if (month < 1 || month > 12) {
    return { ok: false, message: 'Tháng trên hạn thẻ không hợp lệ.' };
  }

  // Thẻ còn hiệu lực đến hết ngày cuối cùng của tháng ghi trên thẻ.
  const expiresAt = new Date(year, month, 1);

  if (expiresAt.getTime() <= now.getTime()) {
    return { ok: false, message: 'Thẻ đã hết hạn.' };
  }

  return { ok: true };
}

export function evaluateCard(dto: CardInput, now: Date): CardEvaluation {
  const cardNumber = digitsOnly(dto.cardNumber ?? '');
  const cardHolder = (dto.cardHolder ?? '').trim();
  const expiry = dto.expiry ?? '';
  const cvv = (dto.cvv ?? '').trim();

  if (!/^\d{13,19}$/.test(cardNumber) || !isValidLuhn(cardNumber)) {
    return {
      kind: 'invalid_input',
      code: 'INVALID_CARD_NUMBER',
      message: 'Số thẻ không hợp lệ. Vui lòng kiểm tra lại.',
    };
  }

  if (cardHolder.length < 2 || !/[a-zA-ZÀ-ỹ]/.test(cardHolder)) {
    return {
      kind: 'invalid_input',
      code: 'INVALID_CARD_HOLDER',
      message: 'Tên chủ thẻ không hợp lệ.',
    };
  }

  const expiryCheck = parseExpiry(expiry, now);

  if (!expiryCheck.ok) {
    return {
      kind: 'invalid_input',
      code: 'INVALID_EXPIRY',
      message: expiryCheck.message,
    };
  }

  if (!/^\d{3,4}$/.test(cvv)) {
    return {
      kind: 'invalid_input',
      code: 'INVALID_CVV',
      message: 'CVV gồm 3 hoặc 4 chữ số.',
    };
  }

  const brand = detectBrand(cardNumber);
  const last4 = cardNumber.slice(-4);

  switch (cardNumber) {
    case '4242424242424242':
      return { kind: 'approved', brand: 'Visa', last4 };

    case '5555555555554444':
      return { kind: 'requires_otp', brand: 'Mastercard', last4 };

    case '9704000000000018':
      return { kind: 'requires_otp', brand: 'NAPAS', last4 };

    case '4000000000000002':
      return {
        kind: 'declined',
        code: 'CARD_DECLINED',
        message: 'Ngân hàng phát hành từ chối giao dịch.',
        brand,
        last4,
      };

    case '4000000000009995':
      return {
        kind: 'declined',
        code: 'INSUFFICIENT_FUNDS',
        message: 'Thẻ không đủ số dư để thanh toán.',
        brand,
        last4,
      };

    case '4000000000000069':
      return {
        kind: 'declined',
        code: 'EXPIRED_CARD',
        message: 'Thẻ đã hết hạn.',
        brand,
        last4,
      };

    case '4000000000000127':
      return {
        kind: 'declined',
        code: 'CARD_BLOCKED',
        message: 'Thẻ đang bị khóa. Vui lòng liên hệ ngân hàng.',
        brand,
        last4,
      };

    default:
      return {
        kind: 'invalid_input',
        code: 'UNKNOWN_CARD',
        message:
          'Thẻ không có trong danh sách thử nghiệm. Vui lòng dùng một thẻ thử nghiệm bên dưới.',
      };
  }
}
