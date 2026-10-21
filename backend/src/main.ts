
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cho phép frontend Next.js gọi API
  app.enableCors({
    origin: 'http://localhost:3000',
  });

  await app.listen(3001);

  console.log('Backend dang chay tai http://localhost:3001');
}

bootstrap();
