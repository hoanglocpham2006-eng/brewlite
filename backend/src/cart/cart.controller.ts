
import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Query,
    Body,
    ParseIntPipe,
  } from '@nestjs/common';
  import { CartService } from './cart.service';
  
  @Controller('cart')
  export class CartController {
    constructor(private readonly cartService: CartService) {}
  
    @Get(':userId')
    getCart(@Param('userId', ParseIntPipe) userId: number) {
      return this.cartService.getCart(userId);
    }
  
    @Post('items')
    addItem(
      @Body()
      body: {
        userId: number;
        productId: number;
        size: string;
        toppings: string[];
      },
    ) {
      return this.cartService.addItem(
        Number(body.userId),
        Number(body.productId),
        body.size,
        body.toppings ?? [],
      );
    }
  
    @Patch('items/:id')
    updateQuantity(
      @Param('id', ParseIntPipe) id: number,
      @Body() body: { userId: number; quantity: number },
    ) {
      return this.cartService.updateQuantity(
        Number(body.userId),
        id,
        Number(body.quantity),
      );
    }
  
    @Delete('items/:id')
    removeItem(
      @Param('id', ParseIntPipe) id: number,
      @Query('userId', ParseIntPipe) userId: number,
    ) {
      return this.cartService.removeItem(userId, id);
    }
  }
  