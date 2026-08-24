import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      trustProxy: process.env.TRUST_PROXY === 'true',
    }),
  );
  const config = app.get(ConfigService);
  const prefix = config.getOrThrow<string>('API_PREFIX');
  const swaggerEnabled =
    config.get<boolean>('SWAGGER_ENABLED') ??
    config.getOrThrow<string>('NODE_ENV') !== 'production';

  await app.register(cookie);
  await app.register(
    helmet,
    swaggerEnabled ? { contentSecurityPolicy: false } : {},
  );
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      const provided = request.headers['x-request-id'];
      const requestId =
        typeof provided === 'string' && /^[a-zA-Z0-9._-]{8,100}$/.test(provided)
          ? provided
          : randomUUID();
      request.ihereRequestId = requestId;
      reply.header('x-request-id', requestId);
      done();
    });
  app.enableCors({
    origin: config.getOrThrow<string[]>('CORS_ORIGINS'),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix(prefix);
  app.enableShutdownHooks();

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('I HERE API')
      .setDescription(
        'Contrato interno para automatización editorial de I HERE',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      `${prefix}/docs`,
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
}

void bootstrap();
