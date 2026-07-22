import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Wires up TypeORM against the `studio-db` Postgres database. No entities
// live here yet — auth, enrollment, progress-tracking and other business
// logic (mentioned as "later" work) will register their own entities under
// their own feature modules, and `autoLoadEntities` picks those up
// automatically without this module needing to change.
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST', '127.0.0.1'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get<string>('DATABASE_USERNAME', 'postgres'),
        password: config.get<string>('DATABASE_PASSWORD', 'password'),
        database: config.get<string>('DATABASE_NAME', 'studio-db'),
        ssl: config.get<string>('DATABASE_SSL', 'false') === 'true',
        autoLoadEntities: true,
        // Convenient in development so new entities create their tables
        // automatically; switch to migrations before this touches
        // production data.
        synchronize:
          config.get<string>('NODE_ENV', 'development') !== 'production',
      }),
    }),
  ],
})
export class DatabaseModule {}
