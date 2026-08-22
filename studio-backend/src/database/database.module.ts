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
        // Amazon RDS's server certificate is signed by the Amazon RDS CA,
        // which isn't in Node's default trusted root store. `ssl: true`
        // alone makes node-postgres do full chain verification and reject
        // the handshake ("self signed certificate in certificate chain") —
        // that rejected connection promise was crashing the whole app on
        // boot, since main.ts's `void bootstrap()` has no .catch() to catch
        // it. studio-cms (Strapi) hits the exact same RDS cert and works
        // around it via DATABASE_SSL_REJECT_UNAUTHORIZED=false; mirror that
        // here instead of disabling SSL outright.
        ssl:
          config.get<string>('DATABASE_SSL', 'false') === 'true'
            ? {
                rejectUnauthorized:
                  config.get<string>(
                    'DATABASE_SSL_REJECT_UNAUTHORIZED',
                    'true',
                  ) !== 'false',
              }
            : false,
        autoLoadEntities: true,
        // Convenient so new entities create their tables automatically —
        // switch to real migrations before this ever touches production
        // data with users on it. This used to be tied to NODE_ENV !==
        // 'production', but the Dockerfile's runtime stage hardcodes
        // NODE_ENV=production unconditionally (that also governs Nest/
        // Express perf behavior, unrelated to schema sync), so synchronize
        // was silently false on every deploy and studio-db never got its
        // tables. DATABASE_SYNCHRONIZE is its own explicit flag now — set
        // it per-environment instead of overloading NODE_ENV.
        synchronize:
          config.get<string>('DATABASE_SYNCHRONIZE', 'false') === 'true',
      }),
    }),
  ],
})
export class DatabaseModule {}
