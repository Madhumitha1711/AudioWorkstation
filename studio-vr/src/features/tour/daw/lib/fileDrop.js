export const NEW_TRACK_DROP = "__new-track__";

const AUDIO_EXT = /\.(wav|wave|mp3|ogg|oga|opus|flac|m4a|aac|aif|aiff|caf|webm)$/i;

export const isAudioFile = (file) => (file.type || "").startsWith("audio/") || AUDIO_EXT.test(file.name || "");

export const dragHasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
