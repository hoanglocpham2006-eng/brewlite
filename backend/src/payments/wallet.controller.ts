import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateWalletDto, TopupWalletDto } from './dto/wallet.dto';
import { WalletService } from './wallet.service';

interface AuthenticatedRequest {
  user: { sub: number };
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getWallet(@Request() req: AuthenticatedRequest) {
    return this.walletService.getWallet(req.user.sub);
  }

  @Post()
  createWallet(
    @Body() body: CreateWalletDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.walletService.createWallet(req.user.sub, body.pin);
  }

  @Post('topup')
  topUp(@Body() body: TopupWalletDto, @Request() req: AuthenticatedRequest) {
    return this.walletService.topUp(req.user.sub, body.amount);
  }
}
