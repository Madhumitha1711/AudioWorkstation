import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import qs from 'qs';
import { firstValueFrom } from 'rxjs';

/**
 * Server-side client for the studio-cms Strapi instance. Strapi has no
 * Public role here (users-permissions was removed on purpose — see
 * studio-cms/STRAPI_SCHEMA_NOTES.md), so every request needs the API token
 * this service attaches via StrapiModule's HttpModule config. Never expose
 * that token to a browser client directly; go through a NestJS route that
 * uses this service instead.
 */
@Injectable()
export class StrapiService {
  private readonly logger = new Logger(StrapiService.name);

  constructor(private readonly http: HttpService) {}

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.get<T>(path, {
          params,
          // Strapi's query language (populate/filters/sort) relies on
          // bracket notation for nested keys, e.g. `populate[lessons][populate]=*`.
          // axios's default params serializer doesn't produce that for
          // nested objects, so this mirrors Strapi's own docs, which
          // recommend serializing with `qs`.
          paramsSerializer: (p) => qs.stringify(p, { encodeValuesOnly: true }),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError(error, path);
    }
  }

  private handleError(error: unknown, path: string): never {
    const axiosError = error as AxiosError<{ error?: { message?: string } }>;

    if (axiosError.isAxiosError) {
      const status = axiosError.response?.status;
      const message =
        axiosError.response?.data?.error?.message ?? axiosError.message;
      this.logger.error(
        `Strapi request to ${path} failed (${status ?? 'no response'}): ${message}`,
      );
      throw new BadGatewayException(`studio-cms request failed: ${message}`);
    }

    this.logger.error(
      `Unexpected error calling Strapi ${path}`,
      error as Error,
    );
    throw new InternalServerErrorException(
      'Unexpected error contacting studio-cms',
    );
  }
}
