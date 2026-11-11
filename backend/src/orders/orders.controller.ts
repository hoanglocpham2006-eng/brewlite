import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';

import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from '../payments/payments.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  createOrder(@Body() body: CreateOrderDto) {
    return this.ordersService.createOrder(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMyOrders(@Request() req: { user: { sub: number } }) {
    return this.ordersService.getMyOrders(req.user.sub);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancelOrder(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: { sub: number } },
  ) {
    return this.paymentsService.cancelOrder(req.user.sub, id);
  }
}