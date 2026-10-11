/**
 * Linking a file to a loop (docs/dev/history/technical-design-loops.md §4.7):
 * the clip on a loop row without a file - or "Link file" in the loop
 * overview, which comes here through ui/loopLinkStore.ts - arms the page's
 * Files pane like linking a file to a todo; the picked file becomes the
 * loop's linked file (storage/loops.ts's `setLoopLinkedFile`). Removing it
 * is the ✕ in the loop's Edit.
 */
import {useEffect, useState} from 'react';
import {ResolvedParaPaths} from '../../domain/settings';
import {findCachedItem} from '../../storage/dataCache';
import {linkRootPath, toLinkedFile} from '../../storage/linkedFiles';
import {setLoopLinkedFile} from '../../storage/loops';
import {LinkTarget} from '../../ui/FileBrowserPane';
import {takeLoopLink, useLoopLinkRequest} from '../../ui/loopLinkStore';
import {FolderEntry} from '../../supernote/fileSystem';
import {useActionError} from '../../ui/useActionError';

export function useLoopLinkArm(
  itemPath: string,
  paths: ResolvedParaPaths | null,
  area: string | null,
): {linkTarget: LinkTarget | null; arm: (tag: string) => void} {
  const [tag, setTag] = useState<string | null>(null);
  const {run} = useActionError('ItemDetail.loopLink', 'ItemDetail: linking a file to a loop failed');
  const request = useLoopLinkRequest();
  // Another page drops the arm; then a request for this page (from the loop overview) arms it.
  useEffect(() => setTag(null), [itemPath]);
  useEffect(() => {
    if (request && request.ownerPath === itemPath && paths) setTag(takeLoopLink()?.tag ?? null);
  }, [request, itemPath, paths]);

  const linkTarget: LinkTarget | null =
    tag && paths
      ? {
          mode: 'arming',
          label: `Pick a file for loop ${tag}`,
          onPick: (rootKey, relativePath) => {
            const linkedFile = toLinkedFile(paths, `${linkRootPath(rootKey, paths, itemPath, area).replace(/\/+$/, '')}/${relativePath}`);
            setTag(null);
            run(() => setLoopLinkedFile(itemPath, tag, linkedFile));
          },
          onCancel: () => setTag(null),
        }
      : null;
  return {linkTarget, arm: setTag};
}

/** App: a "Link file" request from the loop overview opens the loop's Area or Project, whose page then arms. */
export function useLoopLinkNavigation(openItem: (kind: 'project' | 'area', entry: FolderEntry) => void): void {
  const request = useLoopLinkRequest();
  const ownerPath = request?.ownerPath ?? null;
  useEffect(() => {
    const owner = ownerPath ? findCachedItem(ownerPath) : undefined;
    if (owner) openItem(owner.kind, {name: owner.name, path: owner.path, isFolder: true});
  }, [ownerPath, openItem]);
}
