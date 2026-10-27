import {
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    Min,
  } from 'class-validator';
  
  export class CreatePaymentDto {
    @IsInt()
    @Min(1)
    orderId: number;
  
    @IsIn(['EWALLET', 'BANK_CARD'])
    paymentMethod: 'EWALLET' | 'BANK_CARD';
  
    @IsOptional()
    @IsBoolean()
    simulateFailure?: boolean;
  }