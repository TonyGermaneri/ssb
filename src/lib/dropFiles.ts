/** A dropped / picked / unzipped file with its path relative to what was dropped (for SFZ sample lookup). */
export interface PathFile {
  file: Blob
  path: string
}

export const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1)
export const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')

/**
 * Files from a drop, walking into dropped folders. Entries must be taken synchronously inside the drop handler
 * (DataTransfer items are cleared once it returns), so call this before any await.
 */
export function collectDropped(dt: DataTransfer): Promise<PathFile[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  const plain = [...dt.files].map((f) => ({ file: f, path: f.name }))
  if (!entries.length) return Promise.resolve(plain)

  const out: PathFile[] = []
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
      out.push({ file, path: prefix + entry.name })
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
        if (!batch.length) break
        for (const e of batch) await walk(e, `${prefix}${entry.name}/`)
      }
    }
  }
  return Promise.all(entries.map((e) => walk(e, ''))).then(() => out)
}

/** Files from an <input type="file"> (webkitdirectory pickers include each file's relative path). */
export const fromInput = (files: FileList | File[]): PathFile[] =>
  [...files].map((f) => ({ file: f, path: f.webkitRelativePath || f.name }))
