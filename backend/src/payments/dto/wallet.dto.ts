import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

import { MAX_TOPUP_AMOUNT, MIN_TOPUP_AMOUNT } from '../payment.constants';

export class CreateWalletDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã PIN gồm đúng 6 chữ số.' })
  pin: string;
}

export class TopupWalletDto {
  @IsInt()
  @Min(MIN_TOPUP_AMOUNT, {
    message: `Số tiền nạp tối thiểu là ${MIN_TOPUP_AMOUNT}đ.`,
  })
  @Max(MAX_TOPUP_AMOUNT, {
    message: `Số tiền nạp tối đa là ${MAX_TOPUP_AMOUNT}đ.`,
  })
  amount: number;
}
