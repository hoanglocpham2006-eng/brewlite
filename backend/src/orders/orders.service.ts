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
  promotionCode?: string;
}

interface IngredientRequirement {
  ingredientId: number;
  name: string;
  unit: string;
  quantity: Prisma.Decimal;
  stock: Prisma.Decimal;
  version: number;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly sizePrices: Record<string, number> = {
    S: 0,
    M: 5000,
    L: 10000,
  };

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
      promotionCode,
    } = dto;

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

    if (
      promotionCode !== undefined &&
      typeof promotionCode !== 'string'
    ) {
      throw new BadRequestException('Mã khuyến mãi không hợp lệ.');
    }

    if (promotionCode !== undefined && promotionCode.trim().length > 50) {
      throw new BadRequestException(
        'Mã khuyến mãi không được vượt quá 50 ký tự.',
      );
    }

    const finalPaymentMethod = paymentMethod ?? 'COD';

    if (!['COD', 'EWALLET', 'BANK_CARD'].includes(finalPaymentMethod)) {
      throw new BadRequestException(
        'Phương thức thanh toán không hợp lệ.',
      );
    }

    const normalizedPromotionCode = promotionCode?.trim()
      ? promotionCode.trim().toUpperCase()
      : null;

    return this.prisma.$transaction(async (tx) => {
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

      const orderItems: {
        product_id: number;
        product_name: string;
        quantity: number;
        size: string;
        unit_price: Prisma.Decimal;
        subtotal: Prisma.Decimal;
        toppings: Prisma.InputJsonValue;
      }[] = [];

      // Gộp tổng nguyên liệu của toàn bộ đơn hàng.
      // Các món dùng chung nguyên liệu sẽ dùng chung một mục trong Map.
      const requirements = new Map<number, IngredientRequirement>();

      const addRequirement = (
        ingredient: {
          id: number;
          name: string;
          unit: string;
          stock: Prisma.Decimal;
          version: number;
        },
        quantityPerCup: Prisma.Decimal,
        cupCount: number,
      ) => {
        if (quantityPerCup.lte(0)) {
          throw new BadRequestException(
            `Định lượng không hợp lệ: ${ingredient.name}.`,
          );
        }

        const required = quantityPerCup.mul(cupCount);
        const current = requirements.get(ingredient.id);

        if (current) {
          current.quantity = current.quantity.add(required);
        } else {
          requirements.set(ingredient.id, {
            ingredientId: ingredient.id,
            name: ingredient.name,
            unit: ingredient.unit,
            quantity: required,
            stock: ingredient.stock,
            version: ingredient.version,
          });
        }
      };

      // Đọc công thức topping một lần trong transaction.
      const allToppingRecipes =
        await tx.toppingRecipe.findMany({
          include: {
            ingredient: true,
          },
        });

      for (const item of cart.cart_items) {
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

        const normalizedSize = String(item.size).trim().toUpperCase();
        const sizeExtra = this.sizePrices[normalizedSize];

        if (sizeExtra === undefined) {
          throw new BadRequestException(
            `Size của sản phẩm "${product.name}" không hợp lệ.`,
          );
        }

        const rawToppings: unknown = item.toppings;

        if (!Array.isArray(rawToppings)) {
          throw new BadRequestException(
            `Danh sách topping của "${product.name}" không hợp lệ.`,
          );
        }

        const normalizedToppings = [
          ...new Set(
            rawToppings.map((topping: unknown) => {
              if (
                typeof topping !== 'object' ||
                topping === null ||
                !('name' in topping) ||
                typeof topping.name !== 'string' ||
                !topping.name.trim()
              ) {
                throw new BadRequestException(
                  `Topping của "${product.name}" không hợp lệ.`,
                );
              }

              return topping.name.trim();
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

        // Lấy công thức của món theo size.
        const productRecipes = await tx.productRecipe.findMany({
          where: {
            product_id: product.id,
            size: normalizedSize,
          },
          include: {
            ingredient: true,
          },
        });

        if (productRecipes.length === 0) {
          throw new BadRequestException(
            `Chưa có công thức cho "${product.name}", size ${normalizedSize}.`,
          );
        }

        // Cộng định lượng nguyên liệu của món nhân với số ly.
        for (const recipe of productRecipes) {
          addRequirement(
            recipe.ingredient,
            recipe.quantity,
            item.quantity,
          );
        }

        // Cộng định lượng tất cả topping đã chọn.
        for (const toppingName of normalizedToppings) {
          const matchingRecipes = allToppingRecipes.filter(
            (recipe) => recipe.topping_name === toppingName,
          );

          if (matchingRecipes.length === 0) {
            throw new BadRequestException(
              `Chưa có công thức nguyên liệu cho topping "${toppingName}".`,
            );
          }

          for (const recipe of matchingRecipes) {
            addRequirement(
              recipe.ingredient,
              recipe.quantity,
              item.quantity,
            );
          }
        }

        const toppingTotal = toppings.reduce(
          (sum, topping) => sum + topping.price,
          0,
        );

        const unitPrice =
          Number(product.price) + sizeExtra + toppingTotal;

        const subtotal = unitPrice * item.quantity;

        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: item.quantity,
          size: normalizedSize,
          unit_price: new Prisma.Decimal(unitPrice),
          subtotal: new Prisma.Decimal(subtotal),
          toppings: toppings as Prisma.InputJsonValue,
        });
      }

      const subtotalAmount = orderItems.reduce(
        (sum, item) => sum + Number(item.subtotal),
        0,
      );

      // Kiểm tra khuyến mãi.
      let discountAmount = 0;

      if (normalizedPromotionCode !== null) {
        const promotion = await tx.promotion_codes.findUnique({
          where: { code: normalizedPromotionCode },
        });

        if (!promotion) {
          throw new BadRequestException(
            'Mã khuyến mãi không tồn tại.',
          );
        }

        const now = new Date();

        if (!promotion.is_active) {
          throw new BadRequestException(
            'Mã khuyến mãi hiện không hoạt động.',
          );
        }

        if (now < promotion.starts_at) {
          throw new BadRequestException(
            'Mã khuyến mãi chưa đến thời gian sử dụng.',
          );
        }

        if (
          promotion.expires_at !== null &&
          now >= promotion.expires_at
        ) {
          throw new BadRequestException(
            'Mã khuyến mãi đã hết hạn.',
          );
        }

        if (
          subtotalAmount < Number(promotion.minimum_order_amount)
        ) {
          throw new BadRequestException(
            `Đơn hàng phải đạt tối thiểu ${Number(
              promotion.minimum_order_amount,
            ).toLocaleString('vi-VN')}đ để sử dụng mã này.`,
          );
        }

        const discountValue = Number(promotion.discount_value);

        if (promotion.discount_type === 'PERCENTAGE') {
          discountAmount = Math.round(
            (subtotalAmount * discountValue) / 100,
          );
        } else if (promotion.discount_type === 'FIXED') {
          discountAmount = discountValue;
        } else {
          throw new BadRequestException(
            'Loại mã khuyến mãi không hợp lệ.',
          );
        }

        discountAmount = Math.min(
          subtotalAmount,
          Math.max(0, discountAmount),
        );
      }

      const totalAmount = subtotalAmount - discountAmount;

      // Giữ nguyên liệu bằng optimistic locking.
      // products.stock không còn là nguồn xác định số ly có thể bán.
      // Mỗi nguyên liệu chỉ được cập nhật một lần cho cả đơn.
      const orderedRequirements = [...requirements.values()].sort(
        (a, b) => a.ingredientId - b.ingredientId,
      );

      for (const requirement of orderedRequirements) {
        if (requirement.stock.lessThan(requirement.quantity)) {
          throw new BadRequestException(
            `Không đủ "${requirement.name}". ` +
            `Còn ${requirement.stock.toString()} ${requirement.unit}, ` +
            `cần ${requirement.quantity.toString()} ${requirement.unit}.`,
          );
        }

        const result = await tx.ingredient.updateMany({
          where: {
            id: requirement.ingredientId,
            version: requirement.version,
            stock: {
              gte: requirement.quantity,
            },
          },
          data: {
            stock: {
              decrement: requirement.quantity,
            },
            version: {
              increment: 1,
            },
          },
        });

        if (result.count !== 1) {
          throw new BadRequestException(
            `Tồn kho nguyên liệu "${requirement.name}" vừa thay đổi. ` +
            'Vui lòng thử đặt hàng lại.',
          );
        }
      }

      // Tạo đơn hàng.
      const order = await tx.orders.create({
        data: {
          user_id: userId,
          total_amount: new Prisma.Decimal(totalAmount),
          promotion_code: normalizedPromotionCode,
          discount_amount: new Prisma.Decimal(discountAmount),
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

      // Lưu snapshot lượng nguyên liệu đã giữ cho đơn.
      // Nếu tạo reservation lỗi, transaction rollback cả đơn và tồn kho.
      await tx.orderIngredientReservation.createMany({
        data: orderedRequirements.map((requirement) => ({
          order_id: order.id,
          ingredient_id: requirement.ingredientId,
          quantity: requirement.quantity,
          status: 'RESERVED',
        })),
      });

      // COD xóa giỏ ngay; thanh toán điện tử giữ giỏ đến lúc thành công.
      if (finalPaymentMethod === 'COD') {
        await tx.cart_items.deleteMany({
          where: {
            cart_id: cart.id,
          },
        });
      }

      return {
        message: 'Đặt hàng thành công!',
        order: {
          id: order.id,
          subtotalAmount,
          promotionCode: order.promotion_code,
          discountAmount: Number(order.discount_amount),
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
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: { order_items: true },
    });

    return {
      orders: orders.map((order) => ({
        id: order.id,
        subtotalAmount:
          Number(order.total_amount) +
          Number(order.discount_amount),
        promotionCode: order.promotion_code,
        discountAmount: Number(order.discount_amount),
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