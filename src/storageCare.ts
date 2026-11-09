// Asks the browser to keep this site's storage when the phone runs low on space; without this the browser may
// clear it all at once. Fails quietly where it isn't offered.

let asked = false;

function storageApi(): StorageManager | null {
  try {
    return typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function' ? navigator.storage : null;
  } catch {
    return null;
  }
}

/** True if the browser has promised to keep the storage, false if it may clear it, null if it can't say. */
export async function storageProtected(): Promise<boolean | null> {
  const api = storageApi();
  if (!api || typeof api.persisted !== 'function') return null;
  try {
    return await api.persisted();
  } catch {
    return null;
  }
}

/**
 * Ask once per page load, and only once there's something worth keeping (call it after a save is written). Firefox
 * shows the player a prompt; Chrome and Safari decide by themselves.
 */
export function askToKeepStorage(): void {
  if (asked) return;
  const api = storageApi();
  if (!api) return;
  asked = true;
  void (async () => {
    try {
      if (typeof api.persisted === 'function' && (await api.persisted())) return;
      await api.persist();
    } catch {
      // Not granted, or not allowed here: the backup file is the safety net.
    }
  })();
}
