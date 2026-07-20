import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
  // .glb/.gltf 3D gear scans (shared.model-asset component)
  'model/gltf-binary',
  'model/gltf+json',
];

const deniedExecutableTypes = [
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  // No end-user auth here on purpose — accounts/login/JWT are owned by the
  // separate NestJS service, not Strapi. Content-API access for that service
  // (or any other trusted backend) should go through a Strapi API token
  // (Settings -> API Tokens in the admin panel) sent as a Bearer token,
  // rather than the users-permissions Public/Authenticated role model.
  upload: {
    config: {
      // All Strapi-managed media (images, narration audio, .glb scans, docs)
      // goes through this provider into S3. Cloudflare Stream video is NOT
      // routed through here — it isn't a Strapi media-library asset. Upload
      // course/lesson video directly to Cloudflare Stream (dashboard or API)
      // and paste the resulting UID into the lesson's `video.videoUid`
      // field (see src/components/shared/cloudflare-video.json).
      provider: '@strapi/provider-upload-aws-s3',
      providerOptions: {
        s3Options: {
          credentials: {
            accessKeyId: env('AWS_ACCESS_KEY_ID'),
            secretAccessKey: env('AWS_ACCESS_SECRET'),
          },
          region: env('AWS_REGION'),
          params: {
            Bucket: env('AWS_BUCKET'),
          },
          // Only needed for S3-compatible endpoints (e.g. R2, MinIO, DO Spaces).
          ...(env('AWS_ENDPOINT') ? { endpoint: env('AWS_ENDPOINT'), forcePathStyle: env.bool('AWS_FORCE_PATH_STYLE', false) } : {}),
        },
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
      security: {
        allowedTypes: allowedMediaTypes,
        deniedTypes: deniedExecutableTypes,
      },
    },
  },
});

export default config;
