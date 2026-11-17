/**
 * fileIO.ts — All browser FileReader I/O for the reader module.
 *
 * This is the ONLY file in src/reader/ that uses FileReader.
 * buildTxtBook and buildEpubBook receive plain string / ArrayBuffer inputs
 * and must never import from this module.
 */

const MAX_TXT_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Reads a File as plain text (UTF-8 or UTF-16 auto-detected by the browser).
 *
 * Enforces a 50 MB size cap for .txt use. Rejects with a human-readable
 * message on failure; messages are ≤200 chars and contain no stack traces or
 * file paths.
 */
export function readAsText(file: File): Promise<string> {
  if (file.size > MAX_TXT_BYTES) {
    return Promise.reject(new Error('This file is too large to load (max 50 MB).'));
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      if (result.trim().length === 0) {
        reject(new Error('Could not read the file: the file appears to be empty.'));
        return;
      }
      resolve(result);
    };

    reader.onerror = () => {
      const code = reader.error?.code;
      // DOMException.NOT_READABLE_ERR = 4, SECURITY_ERR = 18
      if (code === 18 /* SECURITY_ERR */ || code === 4 /* NOT_READABLE_ERR */) {
        reject(new Error('Could not read the file: permission was denied.'));
      } else {
        reject(new Error('Could not read the file: the encoding is not supported.'));
      }
    };

    reader.readAsText(file);
  });
}

/**
 * Reads a File as an ArrayBuffer (for EPUB processing).
 *
 * Rejects with a human-readable message on failure; messages are ≤200 chars
 * and contain no stack traces or file paths.
 */
export function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };

    reader.onerror = () => {
      const code = reader.error?.code;
      if (code === 18 /* SECURITY_ERR */ || code === 4 /* NOT_READABLE_ERR */) {
        reject(new Error('Could not read the file: permission was denied.'));
      } else {
        reject(new Error('Could not read the file: the encoding is not supported.'));
      }
    };

    reader.readAsArrayBuffer(file);
  });
}
