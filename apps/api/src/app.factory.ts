import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/** Shared by main.ts and the test suite so both run the same middleware. */
export function configureApp(app: INestApplication): void {
  (app as NestExpressApplication).set('trust proxy', true);
  (app as NestExpressApplication).disable('x-powered-by');
  app.use(cookieParser());
  app.enableShutdownHooks();
}
