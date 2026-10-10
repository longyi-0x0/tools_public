/**
 * OLE2 复合文档的读取。
 *
 * `.xls`（Excel 97-2003）是一份复合文档：它像一个很小的文件系统，里面装着若干条
 * 「流」，我们要的那条叫 `Workbook`。这一层只做「把流读出来」这一件事，不认识 Excel。
 *
 * 结构：512 字节的头 + 一串等长的扇区。哪条流占哪些扇区由 FAT（扇区分配表）串起来。
 * 小于 4096 字节的流不走 FAT，而是塞在根条目那条「小流」里，由 miniFAT 串起来 ——
 * 小表落在小流里，所以这条分支必须走通。
 *
 * 这一层不碰 DOM，在 Node 里也能跑，便于用外部工具交叉验证。
 */

/** 复合文档的魔数。 */
const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const END_OF_CHAIN = 0xfffffffe;
const FREE_SECTOR = 0xffffffff;
/** 目录条目里 type 为 5 的是根条目。 */
const TYPE_ROOT = 5;

/** 看开头八个字节，判断是不是复合文档。 */
export function isCompoundFile(bytes) {
  if (bytes.length < 8) {
    return false;
  }
  for (let index = 0; index < 8; index += 1) {
    if (bytes[index] !== SIGNATURE[index]) {
      return false;
    }
  }
  return true;
}

/**
 * 读一份复合文档，返回 `名字 → 字节`。
 *
 * 名字按大小写不敏感匹配是调用方的事，这里原样给出。
 */
export function readCompoundFile(bytes) {
  if (!isCompoundFile(bytes)) {
    throw new Error('这不是 .xls（OLE2 复合文档）');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const sectorShift = view.getUint16(0x1e, true);
  if (sectorShift !== 9 && sectorShift !== 12) {
    throw new Error(`不认识的扇区大小（2 的 ${sectorShift} 次方）`);
  }
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << view.getUint16(0x20, true);
  const directoryStart = view.getUint32(0x30, true);
  const miniStreamCutoff = view.getUint32(0x38, true);
  const miniFatStart = view.getUint32(0x3c, true);
  const difatStart = view.getUint32(0x44, true);
  const difatCount = view.getUint32(0x48, true);

  /** 第 n 个扇区在文件里的偏移。扇区从 0 开始数，头占第 0 个扇区的位置。 */
  const sectorAt = (index) => 512 + index * sectorSize;

  // ---- FAT：先收 FAT 扇区号，再拼成一整条「下一个扇区」的链表 ----
  const fatSectors = [];
  for (let index = 0; index < 109; index += 1) {
    const sector = view.getUint32(0x4c + index * 4, true);
    if (sector === FREE_SECTOR) {
      break;
    }
    fatSectors.push(sector);
  }
  // 头里放不下 109 项之后的部分挂在 DIFAT 扇区链上
  let difatSector = difatStart;
  const perDifat = sectorSize / 4 - 1;
  for (let index = 0; index < difatCount && difatSector < FREE_SECTOR; index += 1) {
    const base = sectorAt(difatSector);
    for (let slot = 0; slot < perDifat; slot += 1) {
      const sector = view.getUint32(base + slot * 4, true);
      if (sector !== FREE_SECTOR) {
        fatSectors.push(sector);
      }
    }
    difatSector = view.getUint32(base + perDifat * 4, true);
  }

  const fat = [];
  for (const sector of fatSectors) {
    const base = sectorAt(sector);
    for (let slot = 0; slot < sectorSize / 4; slot += 1) {
      fat.push(view.getUint32(base + slot * 4, true));
    }
  }

  /** 沿 FAT 走出一条扇区链。链在文件里断了就停下，不无限转。 */
  const followFat = (start) => {
    const chain = [];
    let sector = start;
    while (sector < fat.length && sector !== END_OF_CHAIN && sector !== FREE_SECTOR) {
      chain.push(sector);
      sector = fat[sector];
    }
    return chain;
  };

  /** 从一组扇区里取出一条流，截到 `size`。 */
  const readSectors = (chain, size, bytesPerSector, readAt) => {
    const out = new Uint8Array(size);
    let written = 0;
    for (const sector of chain) {
      if (written >= size) {
        break;
      }
      const take = Math.min(bytesPerSector, size - written);
      out.set(readAt(sector, take), written);
      written += take;
    }
    if (written < size) {
      throw new Error('复合文档里的流比它声明的短，文件可能没下完整');
    }
    return out;
  };

  const readMainStream = (start, size) =>
    readSectors(followFat(start), size, sectorSize, (sector, take) =>
      bytes.subarray(sectorAt(sector), sectorAt(sector) + take),
    );

  // ---- 目录 ----
  const directoryChain = followFat(directoryStart);
  if (directoryChain.length === 0) {
    throw new Error('复合文档里没有目录');
  }
  const directory = readMainStream(directoryStart, directoryChain.length * sectorSize);
  const directoryView = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);

  const entries = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const type = directory[offset + 66];
    if (type === 0) {
      entries.push(null);
      continue;
    }
    // 名字是 UTF-16LE，末尾带一个 0 结束符，长度含那个结束符
    const nameLength = directoryView.getUint16(offset + 64, true);
    let name = '';
    for (let index = 0; index + 2 <= nameLength && index < 64; index += 2) {
      const code = directoryView.getUint16(offset + index, true);
      if (code === 0) {
        break;
      }
      name += String.fromCharCode(code);
    }
    entries.push({
      name,
      type,
      start: directoryView.getUint32(offset + 116, true),
      // 大小是 8 字节；这一层的规模远够不到 4GB，取低 4 字节
      size: directoryView.getUint32(offset + 120, true),
    });
  }

  // ---- 小流：小于阈值的流塞在根条目里 ----
  const root = entries[0];
  if (root === undefined || root === null || root.type !== TYPE_ROOT) {
    throw new Error('复合文档的根条目不对');
  }
  const miniStream =
    root.size === 0 ? new Uint8Array(0) : readMainStream(root.start, root.size);

  const miniFat = [];
  if (miniFatStart !== END_OF_CHAIN && miniFatStart !== FREE_SECTOR) {
    const miniFatBytes = readMainStream(miniFatStart, followFat(miniFatStart).length * sectorSize);
    const miniFatView = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
    for (let offset = 0; offset + 4 <= miniFatBytes.length; offset += 4) {
      miniFat.push(miniFatView.getUint32(offset, true));
    }
  }

  const readMiniStream = (start, size) => {
    const out = new Uint8Array(size);
    let written = 0;
    let sector = start;
    while (sector < miniFat.length && sector !== END_OF_CHAIN && sector !== FREE_SECTOR) {
      if (written >= size) {
        break;
      }
      const base = sector * miniSectorSize;
      const take = Math.min(miniSectorSize, size - written);
      if (base + take > miniStream.length) {
        throw new Error('复合文档的小流越界了');
      }
      out.set(miniStream.subarray(base, base + take), written);
      written += take;
      sector = miniFat[sector];
    }
    if (written < size) {
      throw new Error('复合文档里的小流比它声明的短');
    }
    return out;
  };

  const streams = new Map();
  for (const entry of entries) {
    if (entry === null || entry.type !== 2 || entry.size === 0) {
      continue;
    }
    streams.set(
      entry.name,
      entry.size < miniStreamCutoff
        ? readMiniStream(entry.start, entry.size)
        : readMainStream(entry.start, entry.size),
    );
  }
  return streams;
}

/** 按名字取一条流，大小写不敏感 —— 老写手有时写 `Workbook`，有时写 `WORKBOOK`。 */
export function takeStream(streams, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of streams) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }
  return null;
}
