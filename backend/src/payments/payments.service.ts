import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, orders as OrderRow, payments as PaymentRow } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { assertTransition } from '../orders/order-state-machine';
import { ConfirmPaymentDto, CreatePaymentDto } from './dto/create-payment.dto';
import { evaluateCard } from './card-gateway';
import { deriveOtp, newTransactionRef, otpMatches } from './otp';
import {
  ACTIVE_PAYMENT_STATUSES,
  MAX_ATTEMPTS,
  ONLINE_METHODS,
  OTP_TTL_MS,
  PAYMENT_SESSION_TTL_MS,
  WALLET_LOCK_MS,
} from './payment.constants';

type Db = Prisma.TransactionClient;

export interface PaymentSessionView {
  paymentId: number;
  orderId: number;
  orderStatus: string;
  method: string;
  status: string;
  amount: number;
  transactionRef: string | null;
  expiresAt: string | null;
  attemptsLeft: number;
  card: { brand: string | null; last4: string | null } | null;
  wallet: { lockedUntil: string | null } | null;
  otpExpiresAt: string | null;
  /** Tin nhắn SMS mô phỏng. Hệ thống thật sẽ gửi OTP qua nhà mạng. */
  sandboxSms: { from: string; message: string } | null;
  failure: { code: string; message: string } | null;
  result: {
    authCode?: string;
    paidAt?: string;
    pointsEarned?: number;
    loyaltyPointsBalance?: number;
  } | null;
}

export interface CancelOrderResult {
  message: string;
  orderId: number;
  status: string;
  refundedAmount: number | null;
  refundMethod: string | null;
}

type StepOutcome =
  | { kind: 'view'; view: PaymentSessionView }
  | {
      kind: 'soft_error';
      code: string;
      message: string;
      attemptsLeft: number;
    };

interface FailureInfo {
  status: 'FAILED' | 'EXPIRED' | 'CANCELLED';
  code: string;
  message: string;
  cardBrand?: string;
  cardLast4?: string;
}

const isActive = (status: string) =>
  (ACTIVE_PAYMENT_STATUSES as readonly string[]).includes(status);

const formatVnd = (amount: number) =>
  `${Math.round(amount).toLocaleString('vi-VN')}đ`;

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  /** Cho phép test thay đồng hồ. */
  clock: () => Date = () => new Date();

  private sweepTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Dọn các phiên đã hết hạn để nguyên liệu không bị giữ mãi.
    this.sweepTimer = setInterval(() => {
      this.expireStaleSessions().catch(() => undefined);
    }, 30_000);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private get otpSecret(): string {
    return process.env.JWT_SECRET || 'brewlite-sandbox-otp-secret';
  }

  // ---------------------------------------------------------------------
  // Chuyển trạng thái đơn hàng theo đúng máy trạng thái
  // ---------------------------------------------------------------------

  private async transitionOrder(
    tx: Db,
    orderId: number,
    from: string,
    to: string,
  ) {
    try {
      assertTransition(from, to);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Chuyển trạng thái không hợp lệ.',
      );
    }

    const updated = await tx.orders.updateMany({
      where: { id: orderId, status: from },
      data: { status: to, updated_at: this.clock() },
    });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Trạng thái đơn hàng vừa thay đổi. Vui lòng tải lại trang.',
      );
    }
  }

  // ---------------------------------------------------------------------
  // Nguyên liệu
  // ---------------------------------------------------------------------

  /** PAYMENT_FAILED -> PENDING: giữ lại nguyên liệu đã hoàn trước đó. */
  private async reserveReleasedIngredients(tx: Db, orderId: number) {
    const reservations = await tx.orderIngredientReservation.findMany({
      where: { order_id: orderId },
      orderBy: { ingredient_id: 'asc' },
    });

    if (reservations.length === 0) {
      throw new BadRequestException(
        'Đơn hàng chưa có dữ liệu giữ nguyên liệu. Vui lòng tạo đơn mới.',
      );
    }

    if (!reservations.every((item) => item.status === 'RELEASED')) {
      throw new BadRequestException(
        'Trạng thái giữ nguyên liệu không hợp lệ để thử thanh toán lại.',
      );
    }

    for (const reservation of reservations) {
      const ingredient = await tx.ingredient.findUnique({
        where: { id: reservation.ingredient_id },
      });

      if (!ingredient) {
        throw new NotFoundException(
          `Không tìm thấy nguyên liệu ID ${reservation.ingredient_id}.`,
        );
      }

      const updated = await tx.ingredient.updateMany({
        where: {
          id: ingredient.id,
          version: ingredient.version,
          stock: { gte: reservation.quantity },
        },
        data: {
          stock: { decrement: reservation.quantity },
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new BadRequestException(
          `Không đủ nguyên liệu "${ingredient.name}" để thử thanh toán lại.`,
        );
      }

      const marked = await tx.orderIngredientReservation.updateMany({
        where: { id: reservation.id, status: 'RELEASED' },
        data: { status: 'RESERVED', updated_at: this.clock() },
      });

      if (marked.count !== 1) {
        throw new ConflictException(
          'Trạng thái giữ nguyên liệu vừa thay đổi. Vui lòng thử lại.',
        );
      }
    }
  }

  /**
   * Hoàn nguyên liệu về kho. `from` là trạng thái hiện tại của các bản ghi:
   * RESERVED (đơn chưa thanh toán) hoặc CONSUMED (đơn đã thanh toán bị hủy).
   */
  private async releaseIngredients(
    tx: Db,
    orderId: number,
    from: 'RESERVED' | 'CONSUMED',
  ) {
    const reservations = await tx.orderIngredientReservation.findMany({
      where: { order_id: orderId, status: from },
      orderBy: { ingredient_id: 'asc' },
    });

    if (reservations.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy nguyên liệu cần hoàn cho đơn hàng.',
      );
    }

    for (const reservation of reservations) {
      const ingredient = await tx.ingredient.findUnique({
        where: { id: reservation.ingredient_id },
      });

      if (!ingredient) {
        throw new NotFoundException(
          `Không tìm thấy nguyên liệu ID ${reservation.ingredient_id}.`,
        );
      }

      const updated = await tx.ingredient.updateMany({
        where: { id: ingredient.id, version: ingredient.version },
        data: {
          stock: { increment: reservation.quantity },
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          `Không thể hoàn nguyên liệu "${ingredient.name}" do tồn kho vừa thay đổi.`,
        );
      }
    }

    const released = await tx.orderIngredientReservation.updateMany({
      where: { order_id: orderId, status: from },
      data: { status: 'RELEASED', updated_at: this.clock() },
    });

    if (released.count !== reservations.length) {
      throw new ConflictException(
        'Không thể cập nhật trạng thái hoàn nguyên liệu.',
      );
    }
  }

  // ---------------------------------------------------------------------
  // Hoàn tất giao dịch: thành công hoặc thất bại
  // ---------------------------------------------------------------------

  /** PENDING -> PAID. */
  private async completeSuccess(
    tx: Db,
    payment: PaymentRow,
    order: OrderRow,
    extra: { cardBrand?: string; cardLast4?: string } = {},
  ): Promise<void> {
    await this.transitionOrder(tx, order.id, order.status, 'PAID');

    const reservations = await tx.orderIngredientReservation.findMany({
      where: { order_id: order.id },
    });

    if (
      reservations.length === 0 ||
      !reservations.every((item) => item.status === 'RESERVED')
    ) {
      throw new ConflictException(
        'Trạng thái giữ nguyên liệu không hợp lệ khi hoàn tất thanh toán.',
      );
    }

    const consumed = await tx.orderIngredientReservation.updateMany({
      where: { order_id: order.id, status: 'RESERVED' },
      data: { status: 'CONSUMED', updated_at: this.clock() },
    });

    if (consumed.count !== reservations.length) {
      throw new ConflictException('Không thể xác nhận nguyên liệu đã tiêu thụ.');
    }

    // Điểm thưởng chỉ được cộng sau khi thanh toán thành công.
    const totalAmount = Number(order.total_amount);
    const pointsEarned = Math.floor(totalAmount / 10000);

    if (pointsEarned > 0) {
      await tx.loyalty_transactions.create({
        data: {
          user_id: order.user_id,
          order_id: order.id,
          points: pointsEarned,
          description: `Tích điểm từ đơn hàng #${order.id}`,
        },
      });

      await tx.user.update({
        where: { id: order.user_id },
        data: { loyalty_points: { increment: pointsEarned } },
      });
    }

    const user = await tx.user.findUnique({
      where: { id: order.user_id },
      select: { loyalty_points: true },
    });

    // Giỏ hàng chỉ được xóa khi thanh toán thành công.
    const cart = await tx.carts.findUnique({
      where: { user_id: order.user_id },
    });

    if (cart) {
      await tx.cart_items.deleteMany({ where: { cart_id: cart.id } });
    }

    const now = this.clock();

    await tx.payments.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        success: true,
        otp_expires_at: null,
        failure_code: null,
        failure_message: null,
        card_brand: extra.cardBrand ?? payment.card_brand,
        card_last4: extra.cardLast4 ?? payment.card_last4,
        result: {
          authCode: payment.transaction_ref,
          paidAt: now.toISOString(),
          pointsEarned,
          loyaltyPointsBalance: user?.loyalty_points ?? 0,
        } as Prisma.InputJsonValue,
        updated_at: now,
      },
    });
  }

  /** PENDING -> PAYMENT_FAILED và hoàn nguyên liệu. */
  private async completeFailure(
    tx: Db,
    payment: PaymentRow,
    order: OrderRow,
    info: FailureInfo,
  ): Promise<void> {
    await this.transitionOrder(tx, order.id, order.status, 'PAYMENT_FAILED');
    await this.releaseIngredients(tx, order.id, 'RESERVED');

    await tx.payments.update({
      where: { id: payment.id },
      data: {
        status: info.status,
        success: false,
        otp_expires_at: null,
        failure_code: info.code,
        failure_message: info.message,
        card_brand: info.cardBrand ?? payment.card_brand,
        card_last4: info.cardLast4 ?? payment.card_last4,
        updated_at: this.clock(),
      },
    });
  }

  /** Nếu phiên đã quá hạn thì đóng phiên và trả về true. */
  private async expireIfNeeded(
    tx: Db,
    payment: PaymentRow,
    order: OrderRow,
  ): Promise<boolean> {
    if (
      !isActive(payment.status) ||
      !payment.expires_at ||
      payment.expires_at.getTime() >= this.clock().getTime()
    ) {
      return false;
    }

    if (order.status === 'PENDING') {
      await this.completeFailure(tx, payment, order, {
        status: 'EXPIRED',
        code: 'SESSION_EXPIRED',
        message: 'Phiên thanh toán đã hết hạn. Vui lòng thử lại.',
      });
    } else {
      await tx.payments.update({
        where: { id: payment.id },
        data: {
          status: 'CANCELLED',
          success: false,
          failure_code: 'SESSION_EXPIRED',
          failure_message: 'Phiên thanh toán đã hết hạn.',
          otp_expires_at: null,
          updated_at: this.clock(),
        },
      });
    }

    return true;
  }

  // ---------------------------------------------------------------------
  // Hiển thị phiên thanh toán
  // ---------------------------------------------------------------------

  private async buildView(
    db: Db,
    paymentId: number,
  ): Promise<PaymentSessionView> {
    const payment = await db.payments.findUnique({ where: { id: paymentId } });

    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch.');

    const order = await db.orders.findUnique({
      where: { id: payment.order_id },
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');

    let attemptsLeft = Math.max(0, MAX_ATTEMPTS - payment.attempts);
    let wallet: PaymentSessionView['wallet'] = null;

    if (payment.payment_method === 'EWALLET') {
      const row = await db.simWallet.findUnique({
        where: { user_id: order.user_id },
      });

      if (row) {
        attemptsLeft = Math.max(0, MAX_ATTEMPTS - row.failed_pin_attempts);
        wallet = { lockedUntil: row.locked_until?.toISOString() ?? null };
      }
    }

    let sandboxSms: PaymentSessionView['sandboxSms'] = null;

    if (
      payment.status === 'AWAITING_OTP' &&
      payment.otp_expires_at &&
      payment.transaction_ref
    ) {
      const otp = deriveOtp(
        this.otpSecret,
        payment.transaction_ref,
        payment.otp_expires_at,
      );

      sandboxSms = {
        from: 'BrewBank',
        message:
          `Mã OTP xác thực giao dịch ${formatVnd(Number(payment.amount))} tại BrewLite là ${otp}. ` +
          'Mã có hiệu lực 3 phút. Tuyệt đối không chia sẻ mã này.',
      };
    }

    const result =
      payment.result && typeof payment.result === 'object'
        ? (payment.result as PaymentSessionView['result'])
        : null;

    return {
      paymentId: payment.id,
      orderId: payment.order_id,
      orderStatus: order.status,
      method: payment.payment_method,
      status: payment.status,
      amount: Number(payment.amount),
      transactionRef: payment.transaction_ref,
      expiresAt: payment.expires_at?.toISOString() ?? null,
      attemptsLeft,
      card: payment.card_last4
        ? { brand: payment.card_brand, last4: payment.card_last4 }
        : null,
      wallet,
      otpExpiresAt: payment.otp_expires_at?.toISOString() ?? null,
      sandboxSms,
      failure: payment.failure_code
        ? {
            code: payment.failure_code,
            message: payment.failure_message ?? '',
          }
        : null,
      result,
    };
  }

  private async loadOwned(tx: Db, userId: number, paymentId: number) {
    const payment = await tx.payments.findUnique({ where: { id: paymentId } });

    const order = payment
      ? await tx.orders.findUnique({ where: { id: payment.order_id } })
      : null;

    if (!payment || !order || order.user_id !== userId) {
      throw new NotFoundException('Không tìm thấy giao dịch.');
    }

    return { payment, order };
  }

  /** Trả kết quả; lỗi nhập liệu có thể sửa được trả về HTTP 400. */
  private finish(outcome: StepOutcome): PaymentSessionView {
    if (outcome.kind === 'soft_error') {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: outcome.message,
        code: outcome.code,
        attemptsLeft: outcome.attemptsLeft,
      });
    }

    return outcome.view;
  }

  // ---------------------------------------------------------------------
  // Tạo phiên thanh toán
  // ---------------------------------------------------------------------

  async createSession(
    userId: number,
    dto: CreatePaymentDto,
  ): Promise<PaymentSessionView> {
    const key = dto.idempotencyKey.trim();

    if (!key) {
      throw new BadRequestException('Idempotency-Key không hợp lệ.');
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const replay = await tx.payments.findUnique({
            where: { idempotency_key: key },
          });

          if (replay) {
            const { payment, order } = await this.loadOwned(
              tx,
              userId,
              replay.id,
            );

            if (
              payment.order_id !== dto.orderId ||
              (dto.paymentMethod &&
                payment.payment_method !== dto.paymentMethod)
            ) {
              throw new BadRequestException(
                'Idempotency-Key đã được sử dụng cho một yêu cầu khác.',
              );
            }

            // Gửi lại cùng khóa: trả về phiên hiện có (đóng nếu đã quá hạn).
            await this.expireIfNeeded(tx, payment, order);

            return this.buildView(tx, payment.id);
          }

          let order = await tx.orders.findUnique({
            where: { id: dto.orderId },
          });

          if (!order || order.user_id !== userId) {
            throw new NotFoundException('Không tìm thấy đơn hàng.');
          }

          const method = dto.paymentMethod ?? order.payment_method;

          if (!(ONLINE_METHODS as readonly string[]).includes(method)) {
            throw new BadRequestException(
              'Đơn hàng này không thanh toán trực tuyến.',
            );
          }

          if (order.payment_method !== method) {
            throw new BadRequestException(
              'Phương thức thanh toán không khớp với đơn hàng.',
            );
          }

          // Đóng các phiên đã quá hạn (đơn có thể chuyển sang PAYMENT_FAILED).
          const activeSessions = await tx.payments.findMany({
            where: {
              order_id: order.id,
              status: { in: [...ACTIVE_PAYMENT_STATUSES] },
            },
          });

          for (const session of activeSessions) {
            const latest = await tx.orders.findUnique({
              where: { id: order.id },
            });

            if (latest) {
              await this.expireIfNeeded(tx, session, latest);
            }
          }

          order = await tx.orders.findUnique({ where: { id: order.id } });

          if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');

          if (order.status !== 'PENDING' && order.status !== 'PAYMENT_FAILED') {
            throw new BadRequestException(
              'Đơn hàng không ở trạng thái có thể thanh toán.',
            );
          }

          // Phiên cũ còn hiệu lực bị thay bằng phiên mới.
          await tx.payments.updateMany({
            where: {
              order_id: order.id,
              status: { in: [...ACTIVE_PAYMENT_STATUSES] },
            },
            data: {
              status: 'CANCELLED',
              success: false,
              failure_code: 'SUPERSEDED',
              failure_message: 'Phiên thanh toán đã được thay bằng phiên mới.',
              otp_expires_at: null,
              updated_at: this.clock(),
            },
          });

          if (order.status === 'PAYMENT_FAILED') {
            // PAYMENT_FAILED -> PENDING: thử lại, giữ lại nguyên liệu.
            await this.transitionOrder(
              tx,
              order.id,
              'PAYMENT_FAILED',
              'PENDING',
            );
            await this.reserveReleasedIngredients(tx, order.id);
          } else {
            const reservations = await tx.orderIngredientReservation.findMany({
              where: { order_id: order.id },
            });

            if (
              reservations.length === 0 ||
              !reservations.every((item) => item.status === 'RESERVED')
            ) {
              throw new BadRequestException(
                'Trạng thái nguyên liệu không khớp với trạng thái đơn hàng.',
              );
            }
          }

          const now = this.clock();

          const payment = await tx.payments.create({
            data: {
              order_id: order.id,
              idempotency_key: key,
              payment_method: method,
              amount: order.total_amount,
              status: 'AWAITING_PAYMENT',
              transaction_ref: newTransactionRef(),
              expires_at: new Date(now.getTime() + PAYMENT_SESSION_TTL_MS),
              created_at: now,
              updated_at: now,
            },
          });

          return this.buildView(tx, payment.id);
        },
        { maxWait: 5000, timeout: 15000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Hai yêu cầu cùng khóa chạy song song: trả về phiên đã tạo.
        const existing = await this.prisma.payments.findUnique({
          where: { idempotency_key: key },
        });

        if (existing) {
          const order = await this.prisma.orders.findUnique({
            where: { id: existing.order_id },
          });

          if (order?.user_id === userId && existing.order_id === dto.orderId) {
            return this.buildView(this.prisma, existing.id);
          }
        }
      }

      throw error;
    }
  }

  async getSession(
    userId: number,
    paymentId: number,
  ): Promise<PaymentSessionView> {
    return this.prisma.$transaction(async (tx) => {
      const { payment, order } = await this.loadOwned(tx, userId, paymentId);

      await this.expireIfNeeded(tx, payment, order);

      return this.buildView(tx, payment.id);
    });
  }

  // ---------------------------------------------------------------------
  // Bước 1: xác nhận bằng ví (PIN) hoặc thẻ
  // ---------------------------------------------------------------------

  async confirmPayment(
    userId: number,
    paymentId: number,
    dto: ConfirmPaymentDto,
  ): Promise<PaymentSessionView> {
    const outcome = await this.prisma.$transaction(
      async (tx): Promise<StepOutcome> => {
        const { payment, order } = await this.loadOwned(tx, userId, paymentId);

        if (payment.status === 'SUCCESS') {
          return { kind: 'view', view: await this.buildView(tx, payment.id) };
        }

        if (payment.status === 'AWAITING_OTP') {
          throw new BadRequestException(
            'Giao dịch đang chờ xác thực OTP. Vui lòng nhập mã OTP.',
          );
        }

        if (payment.status !== 'AWAITING_PAYMENT') {
          throw new BadRequestException(
            'Phiên thanh toán đã kết thúc. Vui lòng thử thanh toán lại.',
          );
        }

        if (await this.expireIfNeeded(tx, payment, order)) {
          return { kind: 'view', view: await this.buildView(tx, payment.id) };
        }

        // Khóa dòng thanh toán để các yêu cầu đồng thời xử lý tuần tự.
        const claimed = await tx.payments.updateMany({
          where: { id: payment.id, status: 'AWAITING_PAYMENT' },
          data: { updated_at: this.clock() },
        });

        if (claimed.count !== 1) {
          throw new ConflictException(
            'Giao dịch vừa được xử lý. Vui lòng tải lại trang.',
          );
        }

        if (order.status !== 'PENDING') {
          throw new BadRequestException(
            'Đơn hàng không ở trạng thái chờ thanh toán.',
          );
        }

        return payment.payment_method === 'EWALLET'
          ? this.payWithWallet(tx, payment, order, dto)
          : this.payWithCard(tx, payment, order, dto);
      },
      { maxWait: 5000, timeout: 15000 },
    );

    return this.finish(outcome);
  }

  private async payWithWallet(
    tx: Db,
    payment: PaymentRow,
    order: OrderRow,
    dto: ConfirmPaymentDto,
  ): Promise<StepOutcome> {
    const pin = dto.pin ?? '';

    if (!/^\d{6}$/.test(pin)) {
      return {
        kind: 'soft_error',
        code: 'INVALID_PIN_FORMAT',
        message: 'Mã PIN gồm đúng 6 chữ số.',
        attemptsLeft: MAX_ATTEMPTS,
      };
    }

    const wallet = await tx.simWallet.findUnique({
      where: { user_id: order.user_id },
    });

    if (!wallet) {
      return {
        kind: 'soft_error',
        code: 'WALLET_NOT_FOUND',
        message: 'Bạn chưa kích hoạt ví BrewPay. Vui lòng kích hoạt ví trước.',
        attemptsLeft: MAX_ATTEMPTS,
      };
    }

    const now = this.clock();

    if (wallet.locked_until && wallet.locked_until.getTime() > now.getTime()) {
      return {
        kind: 'soft_error',
        code: 'WALLET_LOCKED',
        message: `Ví đang bị khóa tạm thời do nhập sai PIN. Thử lại sau ${Math.ceil(
          (wallet.locked_until.getTime() - now.getTime()) / 60000,
        )} phút.`,
        attemptsLeft: 0,
      };
    }

    const pinOk = await bcrypt.compare(pin, wallet.pin_hash);

    if (!pinOk) {
      const failed = wallet.failed_pin_attempts + 1;

      if (failed >= MAX_ATTEMPTS) {
        await tx.simWallet.update({
          where: { id: wallet.id },
          data: {
            failed_pin_attempts: 0,
            locked_until: new Date(now.getTime() + WALLET_LOCK_MS),
          },
        });

        await this.completeFailure(tx, payment, order, {
          status: 'FAILED',
          code: 'WALLET_LOCKED',
          message: `Nhập sai PIN ${MAX_ATTEMPTS} lần. Ví bị khóa ${WALLET_LOCK_MS / 60000} phút.`,
        });

        return { kind: 'view', view: await this.buildView(tx, payment.id) };
      }

      await tx.simWallet.update({
        where: { id: wallet.id },
        data: { failed_pin_attempts: failed },
      });

      await tx.payments.update({
        where: { id: payment.id },
        data: { attempts: { increment: 1 } },
      });

      return {
        kind: 'soft_error',
        code: 'WRONG_PIN',
        message: `Mã PIN không đúng. Bạn còn ${MAX_ATTEMPTS - failed} lần thử.`,
        attemptsLeft: MAX_ATTEMPTS - failed,
      };
    }

    if (wallet.failed_pin_attempts > 0) {
      await tx.simWallet.update({
        where: { id: wallet.id },
        data: { failed_pin_attempts: 0 },
      });
    }

    const amount = Number(payment.amount);

    // Trừ tiền có điều kiện: chỉ trừ khi số dư đủ.
    const debited = await tx.simWallet.updateMany({
      where: { id: wallet.id, balance: { gte: amount } },
      data: { balance: { decrement: amount }, updated_at: now },
    });

    if (debited.count !== 1) {
      await this.completeFailure(tx, payment, order, {
        status: 'FAILED',
        code: 'INSUFFICIENT_FUNDS',
        message: `Số dư ví không đủ. Cần ${formatVnd(amount)}, ví hiện có ${formatVnd(
          Number(wallet.balance),
        )}.`,
      });

      return { kind: 'view', view: await this.buildView(tx, payment.id) };
    }

    const fresh = await tx.simWallet.findUnique({ where: { id: wallet.id } });

    await tx.walletTransaction.create({
      data: {
        wallet_id: wallet.id,
        payment_id: payment.id,
        type: 'PAYMENT',
        amount,
        balance_after: fresh?.balance ?? 0,
        description: `Thanh toán đơn hàng #${order.id}`,
        created_at: now,
      },
    });

    await this.completeSuccess(tx, payment, order);

    return { kind: 'view', view: await this.buildView(tx, payment.id) };
  }

  private async payWithCard(
    tx: Db,
    payment: PaymentRow,
    order: OrderRow,
    dto: ConfirmPaymentDto,
  ): Promise<StepOutcome> {
    const now = this.clock();
    const result = evaluateCard(dto, now);

    switch (result.kind) {
      case 'invalid_input': {
        const attempts = payment.attempts + 1;

        if (attempts >= MAX_ATTEMPTS) {
          await this.completeFailure(tx, payment, order, {
            status: 'FAILED',
            code: 'TOO_MANY_ATTEMPTS',
            message: `Bạn đã nhập sai thông tin thẻ ${MAX_ATTEMPTS} lần.`,
          });

          return { kind: 'view', view: await this.buildView(tx, payment.id) };
        }

        await tx.payments.update({
          where: { id: payment.id },
          data: { attempts },
        });

        return {
          kind: 'soft_error',
          code: result.code,
          message: result.message,
          attemptsLeft: MAX_ATTEMPTS - attempts,
        };
      }

      case 'declined':
        await this.completeFailure(tx, payment, order, {
          status: 'FAILED',
          code: result.code,
          message: result.message,
          cardBrand: result.brand,
          cardLast4: result.last4,
        });

        return { kind: 'view', view: await this.buildView(tx, payment.id) };

      case 'requires_otp': {
        const expires = new Date(
          Math.min(
            now.getTime() + OTP_TTL_MS,
            payment.expires_at?.getTime() ?? Number.MAX_SAFE_INTEGER,
          ),
        );

        await tx.payments.update({
          where: { id: payment.id },
          data: {
            status: 'AWAITING_OTP',
            otp_expires_at: expires,
            card_brand: result.brand,
            card_last4: result.last4,
            attempts: 0,
            updated_at: now,
          },
        });

        return { kind: 'view', view: await this.buildView(tx, payment.id) };
      }

      default:
        await this.completeSuccess(tx, payment, order, {
          cardBrand: result.brand,
          cardLast4: result.last4,
        });

        return { kind: 'view', view: await this.buildView(tx, payment.id) };
    }
  }

  // ---------------------------------------------------------------------
  // Bước 2 (chỉ thẻ 3-D Secure): xác thực OTP
  // ---------------------------------------------------------------------

  async verifyOtp(
    userId: number,
    paymentId: number,
    otp: string,
  ): Promise<PaymentSessionView> {
    const outcome = await this.prisma.$transaction(
      async (tx): Promise<StepOutcome> => {
        const { payment, order } = await this.loadOwned(tx, userId, paymentId);

        if (payment.status === 'SUCCESS') {
          return { kind: 'view', view: await this.buildView(tx, payment.id) };
        }

        if (payment.status !== 'AWAITING_OTP') {
          throw new BadRequestException(
            'Giao dịch không ở bước xác thực OTP.',
          );
        }

        if (await this.expireIfNeeded(tx, payment, order)) {
          return { kind: 'view', view: await this.buildView(tx, payment.id) };
        }

        const claimed = await tx.payments.updateMany({
          where: { id: payment.id, status: 'AWAITING_OTP' },
          data: { updated_at: this.clock() },
        });

        if (claimed.count !== 1) {
          throw new ConflictException(
            'Giao dịch vừa được xử lý. Vui lòng tải lại trang.',
          );
        }

        if (order.status !== 'PENDING') {
          throw new BadRequestException(
            'Đơn hàng không ở trạng thái chờ thanh toán.',
          );
        }

        const now = this.clock();

        if (
          !payment.otp_expires_at ||
          !payment.transaction_ref ||
          payment.otp_expires_at.getTime() < now.getTime()
        ) {
          await this.completeFailure(tx, payment, order, {
            status: 'FAILED',
            code: 'OTP_EXPIRED',
            message: 'Mã OTP đã hết hạn. Vui lòng thử thanh toán lại.',
          });

          return { kind: 'view', view: await this.buildView(tx, payment.id) };
        }

        const expected = deriveOtp(
          this.otpSecret,
          payment.transaction_ref,
          payment.otp_expires_at,
        );

        if (!otpMatches(expected, otp)) {
          const attempts = payment.attempts + 1;

          if (attempts >= MAX_ATTEMPTS) {
            await this.completeFailure(tx, payment, order, {
              status: 'FAILED',
              code: 'OTP_ATTEMPTS_EXCEEDED',
              message: `Bạn đã nhập sai OTP ${MAX_ATTEMPTS} lần.`,
            });

            return {
              kind: 'view',
              view: await this.buildView(tx, payment.id),
            };
          }

          await tx.payments.update({
            where: { id: payment.id },
            data: { attempts },
          });

          return {
            kind: 'soft_error',
            code: 'WRONG_OTP',
            message: `Mã OTP không đúng. Bạn còn ${MAX_ATTEMPTS - attempts} lần thử.`,
            attemptsLeft: MAX_ATTEMPTS - attempts,
          };
        }

        await this.completeSuccess(tx, payment, order);

        return { kind: 'view', view: await this.buildView(tx, payment.id) };
      },
      { maxWait: 5000, timeout: 15000 },
    );

    return this.finish(outcome);
  }

  // ---------------------------------------------------------------------
  // Khách bấm "Hủy thanh toán": PENDING -> PAYMENT_FAILED
  // ---------------------------------------------------------------------

  async cancelPayment(
    userId: number,
    paymentId: number,
  ): Promise<PaymentSessionView> {
    return this.prisma.$transaction(async (tx) => {
      const { payment, order } = await this.loadOwned(tx, userId, paymentId);

      if (payment.status === 'SUCCESS') {
        throw new BadRequestException(
          'Giao dịch đã thanh toán thành công. Hãy hủy đơn hàng để được hoàn tiền.',
        );
      }

      if (!isActive(payment.status)) {
        return this.buildView(tx, payment.id);
      }

      if (order.status !== 'PENDING') {
        throw new BadRequestException(
          'Đơn hàng không ở trạng thái chờ thanh toán.',
        );
      }

      await this.completeFailure(tx, payment, order, {
        status: 'CANCELLED',
        code: 'USER_CANCELLED',
        message: 'Bạn đã hủy giao dịch thanh toán.',
      });

      return this.buildView(tx, payment.id);
    });
  }

  // ---------------------------------------------------------------------
  // Hủy đơn hàng: PENDING | PAYMENT_FAILED | PAID -> CANCELLED
  // ---------------------------------------------------------------------

  async cancelOrder(
    userId: number,
    orderId: number,
  ): Promise<CancelOrderResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.orders.findUnique({ where: { id: orderId } });

        if (!order || order.user_id !== userId) {
          throw new NotFoundException('Không tìm thấy đơn hàng.');
        }

        const from = order.status;

        await this.transitionOrder(tx, order.id, from, 'CANCELLED');

        const now = this.clock();
        let refundedAmount: number | null = null;
        let refundMethod: string | null = null;

        if (from === 'PENDING') {
          // Đóng phiên thanh toán đang mở và trả nguyên liệu về kho.
          await tx.payments.updateMany({
            where: {
              order_id: order.id,
              status: { in: [...ACTIVE_PAYMENT_STATUSES] },
            },
            data: {
              status: 'CANCELLED',
              success: false,
              failure_code: 'ORDER_CANCELLED',
              failure_message: 'Đơn hàng đã bị hủy.',
              otp_expires_at: null,
              updated_at: now,
            },
          });

          await this.releaseIngredients(tx, order.id, 'RESERVED');
        }

        if (from === 'PAID') {
          const payment = await tx.payments.findFirst({
            where: { order_id: order.id, status: 'SUCCESS' },
          });

          if (!payment) {
            throw new ConflictException(
              'Không tìm thấy giao dịch thanh toán để hoàn tiền.',
            );
          }

          const amount = Number(payment.amount);

          if (payment.payment_method === 'EWALLET') {
            const wallet = await tx.simWallet.findUnique({
              where: { user_id: order.user_id },
            });

            if (!wallet) {
              throw new ConflictException('Không tìm thấy ví để hoàn tiền.');
            }

            await tx.simWallet.update({
              where: { id: wallet.id },
              data: { balance: { increment: amount }, updated_at: now },
            });

            const fresh = await tx.simWallet.findUnique({
              where: { id: wallet.id },
            });

            await tx.walletTransaction.create({
              data: {
                wallet_id: wallet.id,
                payment_id: payment.id,
                type: 'REFUND',
                amount,
                balance_after: fresh?.balance ?? 0,
                description: `Hoàn tiền đơn hàng #${order.id}`,
                created_at: now,
              },
            });
          }

          const previous =
            payment.result && typeof payment.result === 'object'
              ? (payment.result as Record<string, unknown>)
              : {};

          await tx.payments.update({
            where: { id: payment.id },
            data: {
              status: 'REFUNDED',
              result: {
                ...previous,
                refund: { amount, refundedAt: now.toISOString() },
              } as Prisma.InputJsonValue,
              updated_at: now,
            },
          });

          // Đơn chưa vào khâu pha chế nên nguyên liệu được trả về kho.
          await this.releaseIngredients(tx, order.id, 'CONSUMED');

          // Thu hồi điểm thưởng đã cộng cho đơn này.
          const earned = await tx.loyalty_transactions.findFirst({
            where: { order_id: order.id },
          });

          if (earned) {
            const user = await tx.user.findUnique({
              where: { id: order.user_id },
              select: { loyalty_points: true },
            });

            await tx.loyalty_transactions.delete({ where: { id: earned.id } });

            await tx.user.update({
              where: { id: order.user_id },
              data: {
                loyalty_points: Math.max(
                  0,
                  (user?.loyalty_points ?? 0) - earned.points,
                ),
              },
            });
          }

          refundedAmount = amount;
          refundMethod = payment.payment_method;
        }

        return {
          message:
            refundedAmount !== null
              ? 'Đã hủy đơn hàng và hoàn tiền.'
              : 'Đã hủy đơn hàng.',
          orderId: order.id,
          status: 'CANCELLED',
          refundedAmount,
          refundMethod,
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  // ---------------------------------------------------------------------
  // Dọn phiên hết hạn
  // ---------------------------------------------------------------------

  async expireStaleSessions(): Promise<number> {
    const now = this.clock();

    const stale = await this.prisma.payments.findMany({
      where: {
        status: { in: [...ACTIVE_PAYMENT_STATUSES] },
        expires_at: { lt: now },
      },
      select: { id: true },
      take: 50,
    });

    let expired = 0;

    for (const { id } of stale) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const payment = await tx.payments.findUnique({ where: { id } });

          if (!payment) return;

          const order = await tx.orders.findUnique({
            where: { id: payment.order_id },
          });

          if (order && (await this.expireIfNeeded(tx, payment, order))) {
            expired += 1;
          }
        });
      } catch {
        // Lần quét sau sẽ thử lại.
      }
    }

    return expired;
  }
}