import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './app.factory';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  // rawBody is needed to verify WhatsApp webhook signatures.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  configureApp(app);
  await app.listen(config.port);
  console.log(`Shopistan API listening on :${config.port}`);
}

bootstrap();
