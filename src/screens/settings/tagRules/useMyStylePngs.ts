/**
 * The MyStyle `.png` backgrounds a Tag Rule can use, listed once when
 * Settings opens. `reload` lists them again (Settings → Advanced → Reload
 * all files).
 */
import {useCallback, useEffect, useState} from 'react';
import {listFolderEntries, MYSTYLE_FOLDER} from '../../../supernote/fileSystem';
import {errorMessage} from '../../../utils/errorMessage';

export interface MyStyleBackgrounds {
  /** File names; null while loading. */
  pngs: string[] | null;
  error: string | null;
  reload: () => Promise<void>;
}

export function useMyStylePngs(): MyStyleBackgrounds {
  const [pngs, setPngs] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (isCancelled: () => boolean = () => false): Promise<void> => {
      setError(null);
      return listFolderEntries(MYSTYLE_FOLDER)
        .then(entries => {
          if (!isCancelled()) setPngs(entries.filter(e => !e.isFolder && /\.png$/i.test(e.name)).map(e => e.name));
        })
        .catch(e => {
          if (!isCancelled()) setError(errorMessage(e));
        });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const reload = useCallback(() => load(), [load]);
  return {pngs, error, reload};
}
