/* Native, uncompressed ZIP writer. No runtime dependency or network service. */
(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  const encoder = new TextEncoder();
  const table = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  E.bytes = value => typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  E.zip = files => {
    const local = [], central = [];
    let offset = 0, size = 0;
    for (const [path, value] of Object.entries(files)) {
      if (!/^[\w./-]+$/.test(path) || path.startsWith("/") || path.split("/").includes("..")) throw new Error("Unsafe archive path");
      const name = encoder.encode(path), data = E.bytes(value);
      let crc = 0xffffffff;
      for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
      crc = (crc ^ 0xffffffff) >>> 0;
      const h = new Uint8Array(30), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true);
      v.setUint16(12, 33, true); v.setUint32(14, crc, true);
      v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true);
      local.push(h, name, data);
      const c = new Uint8Array(46), cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x800, true); cv.setUint16(14, 33, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      central.push(c, name); offset += h.length + name.length + data.length; size += c.length + name.length;
    }
    if (local.length / 3 > 65535 || offset + size > 0xffffffff) throw new Error("Archive exceeds ZIP32 limits");
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, local.length / 3, true); ev.setUint16(10, local.length / 3, true);
    ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
    return new Blob([...local, ...central, end], { type: "application/zip" });
  };
  E.decodeData = data => {
    const [head, body] = data.split(",", 2);
    return head.endsWith(";base64") ? Uint8Array.from(atob(body), c => c.charCodeAt(0)) : encoder.encode(decodeURIComponent(body));
  };
  E.dataURL = (bytes, mime) => {
    let s = "";
    for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return `data:${mime};base64,${btoa(s)}`;
  };
})();
