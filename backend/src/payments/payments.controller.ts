import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TEST_CARDS } from './card-gateway';
import {
  ConfirmPaymentDto,
  CreatePaymentDto,
  VerifyOtpDto,
} from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

interface AuthenticatedRequest {
  user: { sub: number };
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('test-cards')
  getTestCards() {
    return TEST_CARDS;
  }

  @Post()
  createSession(
    @Body() body: CreatePaymentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.createSession(req.user.sub, body);
  }

  @Get(':id')
  getSession(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.getSession(req.user.sub, id);
  }

  @Post(':id/confirm')
  confirmPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ConfirmPaymentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.confirmPayment(req.user.sub, id, body);
  }

  @Post(':id/otp')
  verifyOtp(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: VerifyOtpDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.verifyOtp(req.user.sub, id, body.otp);
  }

  @Post(':id/cancel')
  cancelPayment(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.cancelPayment(req.user.sub, id);
  }
}
