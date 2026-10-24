/**
 * Saves the touch test's records (Settings → Advanced → Touch test) as CSV
 * next to the Integrity Check report in EXPORT/gtdpara/debug. Written only
 * when the user taps "Save log". Positions and classes only, no content.
 */
import {DEBUG_LOG_FOLDER_PATH, writeTextFile} from '../supernote/fileSystem';

/** Writes `csv` and returns the file name (timestamped, so runs never collide). */
export async function saveTouchLog(csv: string): Promise<string> {
  const fileName = `touch-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  await writeTextFile(`${DEBUG_LOG_FOLDER_PATH}/${fileName}`, csv);
  return fileName;
}
