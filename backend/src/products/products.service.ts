
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface Product {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Product[]> {
    const products = await this.prisma.products.findMany({
      where: {
        is_available: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      imageUrl: product.image_url ?? '',
    }));
  }
}
