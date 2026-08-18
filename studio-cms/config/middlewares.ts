import type { Core } from '@strapi/strapi';

// S3 domain the admin panel needs to load media from. Must match the actual
// object URL host: with AWS_FORCE_PATH_STYLE=false, S3 returns
// virtual-hosted-style URLs (<bucket>.s3.<region>.amazonaws.com), not
// s3.amazonaws.com/<bucket>.
const S3_MEDIA_DOMAIN = 'dualmono-images.s3.ap-south-1.amazonaws.com';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:'],
          'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', S3_MEDIA_DOMAIN],
          'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', S3_MEDIA_DOMAIN],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
