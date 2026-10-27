import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsIn,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateOrderDto {
  @IsInt()
  @Min(1)
  userId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  recipientName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  recipientPhone: string;

  @IsString()
  @IsNotEmpty()
  deliveryAddress: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsIn(['COD', 'EWALLET', 'BANK_CARD'])
  paymentMethod?: string;
}