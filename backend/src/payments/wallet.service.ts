import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import {
  MAX_TOPUP_AMOUNT,
  MAX_WALLET_BALANCE,
  MIN_TOPUP_AMOUNT,
} from './payment.constants';

export interface WalletTransactionView {
  id: number;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export interface WalletView {
  exists: boolean;
  balance: number;
  lockedUntil: string | null;
  transactions: WalletTransactionView[];
}

const formatVnd = (amount: number) =>
  `${Math.round(amount).toLocaleString('vi-VN')}đ`;

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(userId: number): Promise<WalletView> {
    const wallet = await this.prisma.simWallet.findUnique({
      where: { user_id: userId },
    });

    if (!wallet) {
      return { exists: false, balance: 0, lockedUntil: null, transactions: [] };
    }

    const transactions = await this.prisma.walletTransaction.findMany({
      where: { wallet_id: wallet.id },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    return {
      exists: true,
      balance: Number(wallet.balance),
      lockedUntil: wallet.locked_until?.toISOString() ?? null,
      transactions: transactions.map((item) => ({
        id: item.id,
        type: item.type,
        amount: Number(item.amount),
        balanceAfter: Number(item.balance_after),
        description: item.description,
        createdAt: item.created_at.toISOString(),
      })),
    };
  }

  async createWallet(userId: number, pin: string): Promise<WalletView> {
    const existing = await this.prisma.simWallet.findUnique({
      where: { user_id: userId },
    });

    if (existing) {
      throw new ConflictException('Ví BrewPay đã được kích hoạt.');
    }

    const pin_hash = await bcrypt.hash(pin, 10);

    await this.prisma.simWallet.create({
      data: { user_id: userId, pin_hash },
    });

    return this.getWallet(userId);
  }

  async topUp(userId: number, amount: number): Promise<WalletView> {
    const wallet = await this.prisma.simWallet.findUnique({
      where: { user_id: userId },
    });

    if (!wallet) {
      throw new BadRequestException(
        'Bạn chưa kích hoạt ví BrewPay. Vui lòng kích hoạt ví trước.',
      );
    }

    const now = new Date();

    if (wallet.locked_until && wallet.locked_until.getTime() > now.getTime()) {
      throw new BadRequestException(
        `Ví đang bị khóa tạm thời. Vui lòng thử lại sau ${Math.ceil(
          (wallet.locked_until.getTime() - now.getTime()) / 60000,
        )} phút.`,
      );
    }

    if (
      !Number.isInteger(amount) ||
      amount < MIN_TOPUP_AMOUNT ||
      amount > MAX_TOPUP_AMOUNT
    ) {
      throw new BadRequestException(
        `Số tiền nạp phải từ ${formatVnd(MIN_TOPUP_AMOUNT)} đến ${formatVnd(
          MAX_TOPUP_AMOUNT,
        )} mỗi lần.`,
      );
    }

    if (Number(wallet.balance) + amount > MAX_WALLET_BALANCE) {
      throw new BadRequestException(
        `Số dư ví tối đa là ${formatVnd(MAX_WALLET_BALANCE)}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.simWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount }, updated_at: now },
      });

      await tx.walletTransaction.create({
        data: {
          wallet_id: wallet.id,
          type: 'TOPUP',
          amount,
          balance_after: updated.balance,
          description: 'Nạp tiền thử nghiệm vào ví BrewPay',
          created_at: now,
        },
      });
    });

    return this.getWallet(userId);
  }
}
