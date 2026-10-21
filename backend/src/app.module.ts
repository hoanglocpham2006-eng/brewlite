import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductsModule } from './products/products.module';
import { PrismaModule } from './prisma/prisma.module';
import { CartModule } from './cart/cart.module';

@Module({
  imports: [ProductsModule, PrismaModule, CartModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
