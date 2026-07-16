/**
 * The asset player is deliberately opt-in until the backend worker and
 * Cloudinary delivery have been rolled out together.
 */
export const isTtsAssetPlayerEnabled =
  import.meta.env.VITE_TTS_ASSET_PLAYER_ENABLED?.trim().toLowerCase() === 'true';
