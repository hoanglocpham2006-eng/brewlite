import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @IsInt()
  @Min(1)
  orderId: number;

  @IsOptional()
  @IsIn(['EWALLET', 'BANK_CARD'])
  paymentMethod?: 'EWALLET' | 'BANK_CARD';

  @IsOptional()
  @IsBoolean()
  simulateFailure?: boolean;

  @IsString()
  @MaxLength(255)
  idempotencyKey: string;
}

export class ConfirmPaymentDto {
  /** Ví BrewPay: PIN 6 số. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã PIN gồm đúng 6 chữ số.' })
  pin?: string;

  /** Thẻ ngân hàng. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cardNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cardHolder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  expiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  cvv?: string;
}

/** Xác thực OTP của thẻ 3-D Secure. */
export class VerifyOtpDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã OTP gồm đúng 6 chữ số.' })
  otp: string;
}