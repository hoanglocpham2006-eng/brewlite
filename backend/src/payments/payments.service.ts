import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreatePaymentInput {
  orderId: number;
  paymentMethod: 'EWALLET' | 'BANK_CARD';
  idempotencyKey: string;
  simulateFailure?: boolean;
}

export interface PaymentResult {
  success: boolean;
  message: string;
  orderId: number;
  status: string;
  paymentMethod?: string;
  totalAmount?: number;
  pointsEarned?: number;
  loyaltyPointsBalance?: number;
  cartPreserved: boolean;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Giữ lại nguyên liệu đã được hoàn sau lần thanh toán thất bại.
   * Lượng cần giữ đọc từ snapshot của đơn hàng, không đọc lại công thức
   * hiện tại vì công thức có thể đã được chỉnh sửa sau khi tạo đơn.
   */
  private async reserveReleasedIngredients(
    tx: Prisma.TransactionClient,
    orderId: number,
  ) {
    const reservations =
      await tx.orderIngredientReservation.findMany({
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
          stock: {
            gte: reservation.quantity,
          },
        },
        data: {
          stock: {
            decrement: reservation.quantity,
          },
          version: {
            increment: 1,
          },
        },
      });

      if (updated.count !== 1) {
        throw new BadRequestException(
          `Không đủ nguyên liệu "${ingredient.name}" để thử thanh toán lại.`,
        );
      }

      const markedReserved =
        await tx.orderIngredientReservation.updateMany({
          where: {
            id: reservation.id,
            status: 'RELEASED',
          },
          data: {
            status: 'RESERVED',
            updated_at: new Date(),
          },
        });

      if (markedReserved.count !== 1) {
        throw new BadRequestException(
          'Trạng thái giữ nguyên liệu vừa thay đổi. Vui lòng thử lại.',
        );
      }
    }
  }

  /**
   * Hoàn đúng lượng nguyên liệu đã giữ.
   * Chỉ hoàn các bản ghi RESERVED để tránh hoàn hai lần.
   */
  private async releaseReservedIngredients(
    tx: Prisma.TransactionClient,
    orderId: number,
  ) {
    const reservations =
      await tx.orderIngredientReservation.findMany({
        where: {
          order_id: orderId,
          status: 'RESERVED',
        },
        orderBy: { ingredient_id: 'asc' },
      });

    if (reservations.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy nguyên liệu đang được giữ cho đơn hàng.',
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
        },
        data: {
          stock: {
            increment: reservation.quantity,
          },
          version: {
            increment: 1,
          },
        },
      });

      if (updated.count !== 1) {
        throw new BadRequestException(
          `Không thể hoàn nguyên liệu "${ingredient.name}" do tồn kho vừa thay đổi.`,
        );
      }
    }

    const released =
      await tx.orderIngredientReservation.updateMany({
        where: {
          order_id: orderId,
          status: 'RESERVED',
        },
        data: {
          status: 'RELEASED',
          updated_at: new Date(),
        },
      });

    if (released.count !== reservations.length) {
      throw new BadRequestException(
        'Không thể cập nhật trạng thái hoàn nguyên liệu.',
      );
    }
  }

  async createPayment(
    input: CreatePaymentInput,
  ): Promise<PaymentResult> {
    const {
      orderId,
      paymentMethod,
      idempotencyKey,
      simulateFailure = false,
    } = input;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new BadRequestException('Mã đơn hàng không hợp lệ.');
    }

    if (!['EWALLET', 'BANK_CARD'].includes(paymentMethod)) {
      throw new BadRequestException(
        'Phương thức thanh toán không hợp lệ.',
      );
    }

    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.length > 255
    ) {
      throw new BadRequestException(
        'Idempotency-Key không hợp lệ.',
      );
    }

    const normalizedKey = idempotencyKey.trim();

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const payment = await tx.payments.create({
            data: {
              order_id: orderId,
              idempotency_key: normalizedKey,
              payment_method: paymentMethod,
              simulate_failure: simulateFailure,
              status: 'PROCESSING',
            },
          });

          const order = await tx.orders.findUnique({
            where: { id: orderId },
          });

          if (!order) {
            throw new NotFoundException(
              'Không tìm thấy đơn hàng.',
            );
          }

          if (order.payment_method !== paymentMethod) {
            throw new BadRequestException(
              'Phương thức thanh toán không khớp với đơn hàng.',
            );
          }

          if (
            order.status !== 'PENDING' &&
            order.status !== 'PAYMENT_FAILED'
          ) {
            throw new BadRequestException(
              'Đơn hàng không ở trạng thái có thể thanh toán.',
            );
          }

          // Đơn mới phải có reservation snapshot.
          const reservations =
            await tx.orderIngredientReservation.findMany({
              where: { order_id: orderId },
            });

          if (reservations.length === 0) {
            throw new BadRequestException(
              'Đơn hàng chưa có dữ liệu giữ nguyên liệu. ' +
              'Vui lòng tạo một đơn hàng mới.',
            );
          }

          if (order.status === 'PAYMENT_FAILED') {
            // Lần trước đã hoàn nguyên liệu; lần này phải giữ lại.
            await this.reserveReleasedIngredients(tx, orderId);
          } else if (
            !reservations.every(
              (reservation) => reservation.status === 'RESERVED',
            )
          ) {
            throw new BadRequestException(
              'Trạng thái nguyên liệu không khớp với trạng thái đơn hàng.',
            );
          }

          // Thanh toán thất bại: hoàn nguyên liệu ngay trong transaction.
          if (simulateFailure) {
            const failedOrder = await tx.orders.update({
              where: { id: orderId },
              data: {
                status: 'PAYMENT_FAILED',
                updated_at: new Date(),
              },
            });

            await this.releaseReservedIngredients(tx, orderId);

            const result: PaymentResult = {
              success: false,
              message:
                'Thanh toán thất bại. Nguyên liệu đã được hoàn lại và giỏ hàng được giữ nguyên.',
              orderId: failedOrder.id,
              status: failedOrder.status,
              pointsEarned: 0,
              cartPreserved: true,
            };

            await tx.payments.update({
              where: { id: payment.id },
              data: {
                status: 'FAILED',
                success: false,
                result: result as unknown as Prisma.InputJsonValue,
                updated_at: new Date(),
              },
            });

            return result;
          }

          // Thanh toán thành công: nguyên liệu đã được trừ khi tạo đơn
          // hoặc được giữ lại khi thanh toán lại. Không trừ thêm lần nữa.
          const paidOrder = await tx.orders.update({
            where: { id: orderId },
            data: {
              status: 'PAID',
              updated_at: new Date(),
            },
          });

          const reservedNow =
            await tx.orderIngredientReservation.findMany({
              where: {
                order_id: orderId,
                status: 'RESERVED',
              },
            });

          if (reservedNow.length !== reservations.length) {
            throw new BadRequestException(
              'Trạng thái giữ nguyên liệu không hợp lệ khi hoàn tất thanh toán.',
            );
          }

          const consumed =
            await tx.orderIngredientReservation.updateMany({
              where: {
                order_id: orderId,
                status: 'RESERVED',
              },
              data: {
                status: 'CONSUMED',
                updated_at: new Date(),
              },
            });

          if (consumed.count !== reservedNow.length) {
            throw new BadRequestException(
              'Không thể xác nhận nguyên liệu đã tiêu thụ.',
            );
          }

          // Điểm thưởng chỉ được cộng sau khi thanh toán thành công.
          const totalAmount = Number(paidOrder.total_amount);
          const pointsEarned = Math.floor(totalAmount / 10000);

          if (pointsEarned > 0) {
            await tx.loyalty_transactions.create({
              data: {
                user_id: order.user_id,
                order_id: paidOrder.id,
                points: pointsEarned,
                description: `Tích điểm từ đơn hàng #${paidOrder.id}`,
              },
            });

            await tx.user.update({
              where: { id: order.user_id },
              data: {
                loyalty_points: {
                  increment: pointsEarned,
                },
              },
            });
          }

          const updatedUser = await tx.user.findUnique({
            where: { id: order.user_id },
            select: {
              loyalty_points: true,
            },
          });

          if (!updatedUser) {
            throw new NotFoundException(
              'Không tìm thấy tài khoản khách hàng.',
            );
          }

          const cart = await tx.carts.findUnique({
            where: { user_id: order.user_id },
          });

          if (cart) {
            await tx.cart_items.deleteMany({
              where: { cart_id: cart.id },
            });
          }

          const result: PaymentResult = {
            success: true,
            message: 'Thanh toán thành công!',
            orderId: paidOrder.id,
            status: paidOrder.status,
            paymentMethod: paidOrder.payment_method,
            totalAmount,
            pointsEarned,
            loyaltyPointsBalance: updatedUser.loyalty_points,
            cartPreserved: false,
          };

          await tx.payments.update({
            where: { id: payment.id },
            data: {
              status: 'SUCCESS',
              success: true,
              result: result as unknown as Prisma.InputJsonValue,
              updated_at: new Date(),
            },
          });

          return result;
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existingPayment =
          await this.prisma.payments.findUnique({
            where: {
              idempotency_key: normalizedKey,
            },
          });

        if (existingPayment) {
          if (
            existingPayment.order_id !== orderId ||
            existingPayment.payment_method !== paymentMethod ||
            existingPayment.simulate_failure !== simulateFailure
          ) {
            throw new BadRequestException(
              'Idempotency-Key đã được sử dụng cho một yêu cầu khác.',
            );
          }

          if (existingPayment.result !== null) {
            return existingPayment.result as unknown as PaymentResult;
          }

          throw new BadRequestException(
            'Yêu cầu thanh toán đang được xử lý. Vui lòng thử lại.',
          );
        }
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new BadRequestException(
          'Tồn kho hoặc dữ liệu đơn hàng vừa thay đổi do thao tác đồng thời. Vui lòng thử lại.',
        );
      }

      throw error;
    }
  }
}