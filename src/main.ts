import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const configService = app.get(ConfigService);

  const config = new DocumentBuilder()
    .setTitle('Task 1')
    .setDescription('Task 1 API description')
    .setVersion('1.0')
    .addTag('task1')
    .addBearerAuth()
    .addServer(configService.get<string>('SWAGGER_URL_PREFIX'))
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, documentFactory);

  await app.listen(3000, '0.0.0.0');
}
bootstrap();
