// Handing the player a file: a photo of the station, or an exported save.

/** A data URL decoded to a Blob, synchronously, so a share sheet can still open inside the tap that asked for it. */
export function dataUrlToBlob(url: string): Blob {
  const [head = '', body = ''] = url.split(',', 2);
  const type = /data:([^;,]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Phones get the share sheet (Save Image, Files, Messages), which is where a picture is wanted; desktops get a
 * plain download. Falls back to the download if sharing isn't offered or is refused.
 */
export function deliverFile(blob: Blob, name: string): void {
  const file = new File([blob], name, { type: blob.type });
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] }).catch((err: unknown) => {
      // Cancelling the sheet is a choice, not a failure; anything else falls back to a download.
      if (!(err instanceof DOMException && err.name === 'AbortError')) download(blob, name);
    });
    return;
  }
  download(blob, name);
}

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
