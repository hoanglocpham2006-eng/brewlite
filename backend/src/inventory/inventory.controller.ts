import {
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Query,
  } from '@nestjs/common';
  
  import { InventoryService } from './inventory.service';
  
  @Controller('inventory')
  export class InventoryController {
    constructor(
      private readonly inventoryService: InventoryService,
    ) {}
  
    @Get('products/:productId/availability')
    getAvailability(
      @Param('productId', ParseIntPipe) productId: number,
      @Query('size') size: string = 'M',
      @Query('toppings') toppings?: string,
    ) {
      const selectedToppings = toppings
        ? toppings.split(',').map((item) => item.trim())
        : [];
  
      return this.inventoryService.getAvailability(
        productId,
        size,
        selectedToppings,
      );
    }
  }