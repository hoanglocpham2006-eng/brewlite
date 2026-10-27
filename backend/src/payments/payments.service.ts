import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreatePaymentInput {
  orderId: number;
  paymentMethod: 'EWALLET' | 'BANK_CARD';
  simulateFailure?: boolean;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Thanh toán mô phỏng: không kết nối cổng thanh toán thật và không thu tiền thật.
   * Khi thành công, đánh dấu đơn PAID và xóa giỏ hàng trong cùng transaction.
   * Khi thất bại, đánh dấu PAYMENT_FAILED và giữ nguyên giỏ hàng.
   */
  async createPayment(input: CreatePaymentInput) {
    const { orderId, paymentMethod, simulateFailure = false } = input;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new BadRequestException('Mã đơn hàng không hợp lệ.');
    }

    if (!['EWALLET', 'BANK_CARD'].includes(paymentMethod)) {
      throw new BadRequestException(
        'Phương thức thanh toán điện tử không hợp lệ.',
      );
    }

    const order = await this.prisma.orders.findUnique({
      where: { id: orderId },
      include: { order_items: true },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    if (order.payment_method !== paymentMethod) {
      throw new BadRequestException(
        'Phương thức thanh toán không khớp với đơn hàng.',
      );
    }

    if (order.status !== 'PENDING' && order.status !== 'PAYMENT_FAILED') {
      throw new BadRequestException(
        'Đơn hàng không ở trạng thái có thể thanh toán.',
      );
    }

    if (simulateFailure) {
      const failedOrder = await this.prisma.orders.update({
        where: { id: orderId },
        data: { status: 'PAYMENT_FAILED', updated_at: new Date() },
      });

      return {
        success: false,
        message: 'Thanh toán thất bại. Giỏ hàng của bạn vẫn được giữ nguyên.',
        orderId: failedOrder.id,
        status: failedOrder.status,
        cartPreserved: true,
      };
    }

    const paidOrder = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.orders.update({
        where: { id: orderId },
        data: { status: 'PAID', updated_at: new Date() },
      });

      const cart = await tx.carts.findUnique({
        where: { user_id: order.user_id },
      });

      if (cart) {
        await tx.cart_items.deleteMany({
          where: { cart_id: cart.id },
        });
      }

      return updatedOrder;
    });

    return {
      success: true,
      message: 'Thanh toán thành công!',
      orderId: paidOrder.id,
      status: paidOrder.status,
      paymentMethod: paidOrder.payment_method,
      totalAmount: Number(paidOrder.total_amount),
      cartPreserved: false,
    };
  }
}
