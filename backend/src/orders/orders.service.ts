import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreateOrderDto {
  userId: number;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  note?: string;
  paymentMethod?: string;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // Giá cộng thêm theo size
  private readonly sizePrices: Record<string, number> = {
    S: 0,
    M: 5000,
    L: 10000,
  };

  // Giá topping được xác định ở backend
  private readonly toppingPrices: Record<string, number> = {
    'Trân châu': 7000,
    Pudding: 8000,
    'Kem cheese': 10000,
  };

  async createOrder(dto: CreateOrderDto) {
    const {
      userId,
      recipientName,
      recipientPhone,
      deliveryAddress,
      note,
      paymentMethod,
    } = dto;

    // 1. Kiểm tra thông tin đầu vào
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Tài khoản không hợp lệ.');
    }

    if (
      typeof recipientName !== 'string' ||
      !recipientName.trim() ||
      typeof recipientPhone !== 'string' ||
      !recipientPhone.trim() ||
      typeof deliveryAddress !== 'string' ||
      !deliveryAddress.trim()
    ) {
      throw new BadRequestException(
        'Vui lòng nhập tên người nhận, số điện thoại và địa chỉ giao hàng.',
      );
    }

    if (note !== undefined && typeof note !== 'string') {
      throw new BadRequestException('Ghi chú không hợp lệ.');
    }

    const finalPaymentMethod = paymentMethod ?? 'COD';

    // Hỗ trợ các phương thức thanh toán của Task 8
    const supportedPaymentMethods = ['COD', 'EWALLET', 'BANK_CARD'];

    if (!supportedPaymentMethods.includes(finalPaymentMethod)) {
      throw new BadRequestException('Phương thức thanh toán không hợp lệ.');
    }

    // 2. Thực hiện tạo đơn trong transaction
    return this.prisma.$transaction(async (tx) => {
      // Tìm giỏ hàng và lấy các món bên trong
      const cart = await tx.carts.findUnique({
        where: { user_id: userId },
        include: {
          cart_items: {
            include: {
              products: true,
            },
          },
        },
      });

      if (!cart || cart.cart_items.length === 0) {
        throw new BadRequestException(
          'Giỏ hàng đang trống. Vui lòng thêm sản phẩm trước khi đặt hàng.',
        );
      }

      // 3. Tính lại đơn giá ở backend
      const orderItems = cart.cart_items.map((item) => {
        const product = item.products;

        if (!product.is_available) {
          throw new BadRequestException(
            `Sản phẩm "${product.name}" hiện đã ngừng bán.`,
          );
        }

        if (!Number.isInteger(item.quantity) || item.quantity < 1) {
          throw new BadRequestException(
            `Số lượng sản phẩm "${product.name}" không hợp lệ.`,
          );
        }

        const sizeExtra = this.sizePrices[item.size];

        if (sizeExtra === undefined) {
          throw new BadRequestException(
            `Size của sản phẩm "${product.name}" không hợp lệ.`,
          );
        }

        // Đọc danh sách topping đã lưu trong giỏ hàng
        const rawToppings: unknown = item.toppings;

        if (!Array.isArray(rawToppings)) {
          throw new BadRequestException(
            `Danh sách topping của "${product.name}" không hợp lệ.`,
          );
        }

        // Chỉ sử dụng tên topping và bảng giá ở backend
        const normalizedToppings = [
          ...new Set(
            rawToppings.map((topping: unknown) => {
              if (
                typeof topping !== 'object' ||
                topping === null ||
                !('name' in topping) ||
                typeof topping.name !== 'string'
              ) {
                throw new BadRequestException(
                  `Topping của "${product.name}" không hợp lệ.`,
                );
              }

              return topping.name;
            }),
          ),
        ];

        const toppings = normalizedToppings.map((name) => {
          const price = this.toppingPrices[name];

          if (price === undefined) {
            throw new BadRequestException(
              `Topping không hợp lệ: ${name}`,
            );
          }

          return { name, price };
        });

        const toppingTotal = toppings.reduce(
          (sum, topping) => sum + topping.price,
          0,
        );

        const unitPrice =
          Number(product.price) + sizeExtra + toppingTotal;

        const subtotal = unitPrice * item.quantity;

        return {
          product_id: product.id,
          product_name: product.name,
          quantity: item.quantity,
          size: item.size,
          unit_price: new Prisma.Decimal(unitPrice),
          subtotal: new Prisma.Decimal(subtotal),
          toppings: toppings as Prisma.InputJsonValue,
        };
      });

      // 4. Tính tổng tiền của toàn bộ đơn hàng
      const totalAmount = orderItems.reduce(
        (sum, item) => sum + Number(item.subtotal),
        0,
      );

      // 5. Tạo đơn hàng cùng các chi tiết món
      const order = await tx.orders.create({
        data: {
          user_id: userId,
          total_amount: new Prisma.Decimal(totalAmount),
          status: 'PENDING',
          recipient_name: recipientName.trim(),
          recipient_phone: recipientPhone.trim(),
          delivery_address: deliveryAddress.trim(),
          note: note?.trim() || null,
          payment_method: finalPaymentMethod,
          order_items: {
            create: orderItems,
          },
        },
        include: {
          order_items: true,
        },
      });

      // COD: xóa giỏ sau khi đặt hàng thành công.
      // EWALLET/BANK_CARD: giữ giỏ cho đến khi thanh toán thành công.
      if (finalPaymentMethod === 'COD') {
        await tx.cart_items.deleteMany({
          where: { cart_id: cart.id },
        });
      }

      // 6. Trả thông tin đơn hàng cho frontend
      return {
        message: 'Đặt hàng thành công!',
        order: {
          id: order.id,
          totalAmount: Number(order.total_amount),
          status: order.status,
          recipientName: order.recipient_name,
          recipientPhone: order.recipient_phone,
          deliveryAddress: order.delivery_address,
          paymentMethod: order.payment_method,
          createdAt: order.created_at,
          items: order.order_items.map((item) => ({
            id: item.id,
            productId: item.product_id,
            productName: item.product_name,
            quantity: item.quantity,
            size: item.size,
            unitPrice: Number(item.unit_price),
            subtotal: Number(item.subtotal),
            toppings: item.toppings,
          })),
        },
      };
    });
  }
  async getMyOrders(userId: number) {
    const orders = await this.prisma.orders.findMany({
      where: {
        user_id: userId,
      },
      orderBy: {
        created_at: 'desc',
      },
      include: {
        order_items: true,
      },
    });

    return {
      orders: orders.map((order) => ({
        id: order.id,
        totalAmount: Number(order.total_amount),
        status: order.status,
        recipientName: order.recipient_name,
        recipientPhone: order.recipient_phone,
        deliveryAddress: order.delivery_address,
        note: order.note,
        paymentMethod: order.payment_method,
        createdAt: order.created_at,
        items: order.order_items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          productName: item.product_name,
          quantity: item.quantity,
          size: item.size,
          unitPrice: Number(item.unit_price),
          subtotal: Number(item.subtotal),
          toppings: item.toppings,
        })),
      })),
    };
  }
}