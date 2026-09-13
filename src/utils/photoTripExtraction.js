/**
 * photoTripExtraction.js — trip-sheet photo intake for FileUploadTrips.
 *
 * Two entry points ("Scan photo" = device camera, "Upload from photos" =
 * gallery picker) share one pipeline:
 *
 *   image file → compressTripPhoto (1600px JPEG) → Gemini vision extract →
 *   parsePhotoTripJson → canonical row objects → existing mapColumns path →
 *   mandatory human review table → import.
 *
 * SAFETY CONTRACT (do not weaken):
 * - Photos are used for extraction ONLY. They are never persisted to
 *   Firestore, Storage, logs, or error messages.
 * - AI extraction NEVER auto-imports. Every extracted row must pass through
 *   the FileUploadTrips review step, flagged with _photoExtracted: true and
 *   _needsHumanReview: true, before onTripsCreated can run.
 * - Never invent data: the extraction prompt orders the model to emit ""
 *   for anything not legible, and parsePhotoTripJson drops rows with no
 *   client name AND no pickup/dropoff address instead of guessing.
 * - Fail closed: unparseable model output throws a precise error naming the
 *   photo; the photo stays on screen for retry and nothing is imported.
 */

// Cap: keeps callable payloads (~300-600KB base64) far under the 4MB guard
// in functions/index.js and secureAi.js. Anything larger is rejected there.
export const PHOTO_MAX_DIMENSION = 1600;
export const PHOTO_JPEG_QUALITY = 0.82;
// Bound per batch: vision calls are slow and rate-limited (drivers: 10/min).
// More than this must be split into multiple batches by the user.
export const PHOTO_MAX_COUNT = 5;

// Canonical header keys the extractor may emit. This whitelist is the only
// bridge into the CSV pipeline: mapColumns() matches these via COLUMN_ALIASES
// exactly as if they came from a spreadsheet header row. Unknown keys are
// stripped by parsePhotoTripJson so a misbehaving model cannot inject
// arbitrary fields into trip records.
export const PHOTO_ROW_KEYS = [
  'Booking Id',
  'Client Name',
  'Pickup Address',
  'Dropoff Address',
  'Phone Pickup',
  'Phone Dropoff',
  'Pickup Time',
  'Dropoff Time',
  'Date',
  'Notes',
];

export const PHOTO_EXTRACTION_PROMPT = `Transcribe the trip sheet in this photo into a JSON array. ` +
  `Output ONLY the JSON array, no markdown, no commentary. ` +
  `Each array element is one trip with EXACTLY these string keys (use "" when not legible, never invent values): ` +
  `"Booking Id", "Client Name", "Pickup Address", "Dropoff Address", "Phone Pickup", "Phone Dropoff", "Pickup Time", "Dropoff Time", "Date", "Notes". ` +
  `Rules: copy names, addresses, phone digits, and times verbatim as printed; ` +
  `if a field is blurry, cut off, or absent, emit "" for it; ` +
  `if no trips are legible at all, output []. ` +
  `Example: [{"Booking Id": "123", "Client Name": "Jane Doe", "Pickup Address": "1 Main St", "Dropoff Address": "2 Oak Ave", "Phone Pickup": "5551234567", "Phone Dropoff": "", "Pickup Time": "09:30", "Dropoff Time": "", "Date": "09/13/2026", "Notes": ""}]`;

/**
 * Downscale an image file to a JPEG data URL for vision upload.
 * Fail closed: rejects non-image files and canvas failures with a precise
 * reason; never returns a partial or placeholder image.
 */
export function compressTripPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Photo processor unavailable in this browser.');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY);
        if (!dataUrl || !dataUrl.startsWith('data:image/jpeg;base64,')) {
          throw new Error('Photo compression produced no output.');
        }
        resolve(dataUrl);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Photo compression failed.'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that photo. Try a different image.'));
    };
    img.src = url;
  });
}

/**
 * Parse raw model output into canonical row objects for the CSV pipeline.
 * Returns { rows, skipped } — skipped counts entries dropped for having no
 * client name and no addresses (never guessed). Throws a precise Error on
 * non-JSON or non-array output so the caller can fail the batch closed while
 * naming the offending photo.
 */
export function parsePhotoTripJson(rawText, photoLabel = 'photo') {
  const cleaned = String(rawText || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  if (!cleaned) {
    throw new Error(`No readable trips in ${photoLabel}. Retake or pick a clearer photo.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    throw new Error(`Could not read trips from ${photoLabel}. The scan returned unusable text — retake or pick a clearer photo.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Could not read trips from ${photoLabel}. Expected a trip list — retake or pick a clearer photo.`);
  }
  const rows = [];
  let skipped = 0;
  parsed.forEach((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      skipped += 1;
      return;
    }
    const row = {};
    PHOTO_ROW_KEYS.forEach((key) => {
      const value = entry[key];
      row[key] = value === undefined || value === null ? '' : String(value).trim();
    });
    // Fail closed per row: a trip with no client AND no addresses carries no
    // actionable data — drop it and count it rather than importing a stub.
    if (!row['Client Name'] && !row['Pickup Address'] && !row['Dropoff Address']) {
      skipped += 1;
      return;
    }
    rows.push(row);
  });
  return { rows, skipped };
}
