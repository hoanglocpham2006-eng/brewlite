
import {
    Injectable,
    BadRequestException,
    NotFoundException,
  } from '@nestjs/common';
  import { Prisma } from '@prisma/client';
  import { PrismaService } from '../prisma/prisma.service';
  
  type Topping = {
    name: string;
    price: number;
  };
  
  @Injectable()
  export class CartService {
    constructor(private readonly prisma: PrismaService) {}
  
    // Giá topping do backend quản lý, không lấy giá từ frontend.
    private readonly toppingPrices: Record<string, number> = {
      'Trân châu': 7000,
      Pudding: 8000,
      'Kem cheese': 10000,
    };
  
    private readonly sizePrices: Record<string, number> = {
      S: 0,
      M: 5000,
      L: 10000,
    };
  
    private normalizeToppings(names: string[]): Topping[] {
      if (!Array.isArray(names)) {
        throw new BadRequestException('Danh sách topping không hợp lệ.');
      }
  
      const uniqueNames = [...new Set(names)];
  
      const result = uniqueNames.map((name) => {
        const price = this.toppingPrices[name];
  
        if (price === undefined) {
          throw new BadRequestException(`Topping không hợp lệ: ${name}`);
        }
  
        return { name, price };
      });
  
      // Sắp xếp để cùng một cấu hình topping được nhận diện giống nhau.
      return result.sort((a, b) => a.name.localeCompare(b.name));
    }
  
    private async getOrCreateCart(userId: number) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
  
      if (!user) {
        throw new NotFoundException('Không tìm thấy tài khoản.');
      }
  
      return this.prisma.carts.upsert({
        where: { user_id: userId },
        update: {},
        create: { user_id: userId },
      });
    }
  
    // Lấy giỏ hàng của một tài khoản.
    async getCart(userId: number) {
      if (!Number.isInteger(userId) || userId <= 0) {
        throw new BadRequestException('userId không hợp lệ.');
      }
  
      const cart = await this.getOrCreateCart(userId);
  
      const items = await this.prisma.cart_items.findMany({
        where: { cart_id: cart.id },
        include: { products: true },
        orderBy: { id: 'asc' },
      });
  
      const cartItems = items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        name: item.products.name,
        imageUrl: item.products.image_url ?? '',
        size: item.size,
        toppings: item.toppings,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        subtotal: Number(item.unit_price) * item.quantity,
      }));
  
      return {
        userId,
        items: cartItems,
        total: cartItems.reduce((sum, item) => sum + item.subtotal, 0),
      };
    }
  
    // Thêm đồ uống cùng size và topping vào giỏ.
    async addItem(
      userId: number,
      productId: number,
      size: string,
      toppingNames: string[],
    ) {
      if (
        !Number.isInteger(userId) ||
        userId <= 0 ||
        !Number.isInteger(productId) ||
        productId <= 0
      ) {
        throw new BadRequestException('userId hoặc productId không hợp lệ.');
      }
  
      if (this.sizePrices[size] === undefined) {
        throw new BadRequestException('Size không hợp lệ.');
      }
  
      const toppings = this.normalizeToppings(toppingNames);
  
      const product = await this.prisma.products.findUnique({
        where: { id: productId },
      });
  
      if (!product || !product.is_available) {
        throw new NotFoundException('Sản phẩm không tồn tại hoặc đã ngừng bán.');
      }
  
      const cart = await this.getOrCreateCart(userId);
  
      const toppingTotal = toppings.reduce(
        (sum, topping) => sum + topping.price,
        0,
      );
  
      const unitPrice =
        Number(product.price) + this.sizePrices[size] + toppingTotal;
  
      // Tìm các dòng có cùng sản phẩm và size.
      const existingItems = await this.prisma.cart_items.findMany({
        where: {
          cart_id: cart.id,
          product_id: productId,
          size,
        },
      });
  
      // Chỉ gộp khi danh sách topping cũng giống nhau.
      const existingItem = existingItems.find(
        (item) =>
          JSON.stringify(item.toppings) === JSON.stringify(toppings),
      );
  
      if (existingItem) {
        await this.prisma.cart_items.update({
          where: { id: existingItem.id },
          data: {
            quantity: { increment: 1 },
            updated_at: new Date(),
          },
        });
      } else {
        await this.prisma.cart_items.create({
          data: {
            cart_id: cart.id,
            product_id: productId,
            size,
            quantity: 1,
            unit_price: unitPrice,
            toppings: toppings as Prisma.InputJsonValue,
          },
        });
      }
  
      return this.getCart(userId);
    }
  
    // Cập nhật số lượng món.
    async updateQuantity(userId: number, itemId: number, quantity: number) {
      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        !Number.isInteger(itemId) ||
        itemId <= 0
      ) {
        throw new BadRequestException('Số lượng hoặc mã món không hợp lệ.');
      }
  
      const cart = await this.getOrCreateCart(userId);
  
      const item = await this.prisma.cart_items.findFirst({
        where: {
          id: itemId,
          cart_id: cart.id,
        },
      });
  
      if (!item) {
        throw new NotFoundException('Không tìm thấy món trong giỏ hàng.');
      }
  
      await this.prisma.cart_items.update({
        where: { id: itemId },
        data: {
          quantity,
          updated_at: new Date(),
        },
      });
  
      return this.getCart(userId);
    }
  
    // Xóa một món khỏi giỏ.
    async removeItem(userId: number, itemId: number) {
      const cart = await this.getOrCreateCart(userId);
  
      const item = await this.prisma.cart_items.findFirst({
        where: {
          id: itemId,
          cart_id: cart.id,
        },
      });
  
      if (!item) {
        throw new NotFoundException('Không tìm thấy món trong giỏ hàng.');
      }
  
      await this.prisma.cart_items.delete({
        where: { id: itemId },
      });
  
      return this.getCart(userId);
    }
  }
  