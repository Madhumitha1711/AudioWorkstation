import * as React from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

/**
 * Admin widget for the "video-upload" custom field (see ../../app.tsx and
 * ../../../index.ts for registration, and
 * src/components/shared/cloudflare-video.json for where it's attached).
 *
 * Renders in place of the default text input for `video.videoUid` on a
 * Lesson. Instead of pasting a Cloudflare Stream UID by hand, an editor
 * picks a file here and this component uploads it through the existing
 * custom route (src/api/lesson/routes/video-upload.ts +
 * src/api/lesson/controllers/lesson.ts), which pushes it to Cloudflare
 * Stream server-to-server and writes videoUid/status/durationSeconds onto
 * the lesson document directly.
 *
 * Important trade-off: that controller persists the whole `video` component
 * straight to the document the moment the upload finishes — it does not go
 * through the Content Manager's normal "edit form -> Save" flow. That means
 * `status` and `durationSeconds` (sibling fields in the same component, each
 * with their own input elsewhere on this form) get updated in the database
 * immediately, but the currently-open edit form's in-memory state for those
 * fields does NOT refresh automatically. If we left it at that and the
 * editor then clicked the page's own Save button, it could silently
 * overwrite the just-uploaded status/duration with whatever stale value was
 * sitting in the form. To avoid that, on a successful upload this component
 * reloads the page after a short delay so the whole form remounts with the
 * freshly persisted data, rather than trying to hand-sync sibling fields
 * from inside a single custom field.
 *
 * Getting the current entry's documentId: we read it straight from the URL
 * via react-router's useParams rather than
 * @strapi/strapi/admin's unstable_useContentManagerContext. That hook is
 * still marked "unstable_" for a reason — it's been reported not to work
 * reliably when called from deep inside a custom field's Input component
 * (as opposed to a top-level injected zone), which is exactly where this
 * component lives (see strapi/strapi#22162). The content-manager edit view
 * URL is always /content-manager/collection-types/<uid>/<id> (or
 * /content-manager/single-types/<uid>/<id>), with the literal segment
 * "create" in place of an id for a brand-new, unsaved entry — so reading
 * useParams().id and treating "create" as "no id yet" is a simpler, stable
 * substitute.
 */

type CloudflareVideoStatus = 'pending' | 'processing' | 'ready' | 'error';

interface IntlMessage {
  id: string;
  defaultMessage: string;
}

interface VideoUploadInputProps {
  name: string;
  value?: string | null;
  onChange: (event: { target: { name: string; value: string; type?: string } }) => void;
  intlLabel?: IntlMessage;
  description?: IntlMessage;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

interface LessonVideoComponentResponse {
  videoUid?: string;
  status?: CloudflareVideoStatus;
  durationSeconds?: number;
}

interface LessonResponse {
  data?: {
    video?: LessonVideoComponentResponse;
  };
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 1.2rem;
  font-weight: 600;
  color: #32324d;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const StatusBadge = styled.span<{ $status?: CloudflareVideoStatus }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 1.1rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #fff;
  background: ${({ $status }) => {
    switch ($status) {
      case 'ready':
        return '#5cb176';
      case 'processing':
        return '#f29d41';
      case 'error':
        return '#d02b20';
      default:
        return '#8e8ea9';
    }
  }};
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid #4945ff;
  font-size: 1.3rem;
  font-weight: 600;
  cursor: pointer;
  background: ${({ $variant }) => ($variant === 'ghost' ? 'transparent' : '#4945ff')};
  color: ${({ $variant }) => ($variant === 'ghost' ? '#4945ff' : '#fff')};

  &:disabled {
    background: ${({ $variant }) => ($variant === 'ghost' ? 'transparent' : '#dcdce4')};
    border-color: #dcdce4;
    color: #8e8ea9;
    cursor: not-allowed;
  }
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const HelpText = styled.p`
  font-size: 1.2rem;
  color: #666687;
  margin: 0;
`;

const ErrorText = styled.p`
  font-size: 1.2rem;
  color: #d02b20;
  margin: 0;
`;

const VideoUploadInput = ({
  name,
  value,
  onChange,
  intlLabel,
  description,
  disabled,
  required,
  error,
}: VideoUploadInputProps) => {
  const { id: routeId } = useParams<{ id?: string }>();
  // A brand-new, unsaved entry's edit view uses the literal URL segment
  // "create" instead of a real documentId.
  const documentId = routeId && routeId !== 'create' ? routeId : undefined;

  const { post, get } = useFetchClient();
  const { toggleNotification } = useNotification();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isChecking, setIsChecking] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<CloudflareVideoStatus | undefined>();

  const canUpload = Boolean(documentId) && !disabled && !isUploading;

  const handlePickFile = () => {
    if (!canUpload) return;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file again later (e.g. re-uploading after
    // fixing something) — without this, choosing the same filename twice in
    // a row wouldn't fire onChange the second time.
    event.target.value = '';
    if (!file || !documentId) return;

    setLocalError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await post<LessonResponse>(`/api/lessons/${documentId}/video`, formData);
      const video = data?.data?.video;

      if (video?.videoUid) {
        onChange({ target: { name, value: video.videoUid, type: 'text' } });
      }
      if (video?.status) {
        setStatus(video.status);
      }

      toggleNotification({
        type: 'success',
        message: 'Video uploaded to Cloudflare Stream. Reloading to sync status…',
      });

      // See the file-level comment: reload rather than trying to patch
      // sibling fields (status/durationSeconds) in-place.
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video upload failed. Please try again.';
      setLocalError(message);
      toggleNotification({ type: 'danger', message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!documentId) return;
    setIsChecking(true);
    setLocalError(null);
    try {
      const { data } = await get<LessonResponse>(`/api/lessons/${documentId}/video/status`);
      const video = data?.data?.video;
      if (video?.status) {
        setStatus(video.status);
      }
      toggleNotification({
        type: 'success',
        message: `Cloudflare Stream status: ${video?.status ?? 'unknown'}`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not check Cloudflare Stream status.';
      setLocalError(message);
      toggleNotification({ type: 'danger', message });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Wrapper>
      {intlLabel && (
        <Label htmlFor={name}>
          {intlLabel.defaultMessage}
          {required ? ' *' : ''}
        </Label>
      )}

      {!documentId ? (
        <HelpText>Save this lesson first, then come back here to upload its video.</HelpText>
      ) : (
        <>
          <Row>
            <ActionButton type="button" onClick={handlePickFile} disabled={!canUpload}>
              {isUploading ? 'Uploading…' : value ? 'Replace video' : 'Upload video'}
            </ActionButton>

            {value && (
              <>
                <StatusBadge $status={status}>{status ?? 'saved'}</StatusBadge>
                <ActionButton
                  type="button"
                  $variant="ghost"
                  onClick={handleCheckStatus}
                  disabled={isChecking}
                >
                  {isChecking ? 'Checking…' : 'Check status'}
                </ActionButton>
              </>
            )}
          </Row>

          <HiddenFileInput
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelected}
          />

          {value && <HelpText>Cloudflare Stream UID: {value}</HelpText>}
        </>
      )}

      {description && !localError && !error && <HelpText>{description.defaultMessage}</HelpText>}
      {(localError || error) && <ErrorText>{localError ?? error}</ErrorText>}
    </Wrapper>
  );
};

export default VideoUploadInput;
