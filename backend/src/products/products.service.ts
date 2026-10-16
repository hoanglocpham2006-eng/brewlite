import { Injectable } from '@nestjs/common';

export interface Product {
    id: number;
    name: string;
    price: number;
    imageUrl: string;
  }
  
  export class ProductsService {
    private products: Product[] = [
      {
        id: 1,
        name: 'Cà phê đen',
        price: 20000,
        imageUrl: 'https://placehold.co/300x200?text=Ca+phe+den',
      },
      {
        id: 2,
        name: 'Cà phê sữa',
        price: 25000,
        imageUrl: 'https://placehold.co/300x200?text=Ca+phe+sua',
      },
      {
        id: 3,
        name: 'Trà sữa',
        price: 30000,
        imageUrl: 'https://placehold.co/300x200?text=Tra+sua',
      },
      {
        id: 4,
        name: 'Matcha Latte',
        price: 35000,
        imageUrl: 'https://placehold.co/300x200?text=Matcha+Latte',
      },
    ];
  
    findAll(): Product[] {
      return this.products;
    }
  }
  