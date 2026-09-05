return (async () => {

    // A real .xlsx, written in the browser with no library.
    //
    //   const X = await exec('baja/io/xlsx-writer.js');
    //   X.download([['Name','Score'],['ASO-1',0.93]], 'designs.xlsx', 'Designs');
    //
    // An .xlsx is a ZIP of XML parts, and there is no zip writer in this app -- so this is
    // one, deliberately the smallest that is still VALID rather than a CSV wearing the
    // extension. A file Excel opens with a warning is worse than a file it opens cleanly,
    // and it is worse in the place people notice: sending it to someone else.
    //
    // Entries are STORED, not deflated. Compression would need a deflate implementation for
    // a file that is a few hundred rows of text, and the only cost of storing is size.
    // CRC-32 is still required -- it is what makes the archive well-formed.

    const enc = new TextEncoder();

    const crcTable = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        return t;
    })();

    const crc32 = (bytes) => {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    };

    const esc = (s) => ('' + s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        // Excel rejects most control characters outright; strip rather than emit a file that
        // opens as "unreadable content".
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // A1, B1 ... Z1, AA1 ...
    const cellRef = (col, row) => {
        let s = '', c = col + 1;
        while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = ((c - r) / 26) | 0; }
        return s + (row + 1);
    };

    const sheetXml = (rows) => {
        let out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            + '<sheetData>';
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r] || [];
            out += '<row r="' + (r + 1) + '">';
            for (let c = 0; c < row.length; c++) {
                const v = row[c];
                if (v === null || v === undefined || v === '') continue;
                const ref = cellRef(c, r);
                // Numbers as numbers, so a spreadsheet can sort and chart them. Everything
                // else goes out as an inline string: inline rather than a shared-strings
                // table because one fewer part is one fewer thing to get wrong, and the
                // duplication costs nothing at this size.
                if (typeof v === 'number' && isFinite(v)) {
                    out += '<c r="' + ref + '"><v>' + v + '</v></c>';
                } else {
                    out += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">'
                        + esc(v) + '</t></is></c>';
                }
            }
            out += '</row>';
        }
        return out + '</sheetData></worksheet>';
    };

    const PARTS = (rows, sheetName) => ([
        ['[Content_Types].xml',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            + '<Default Extension="xml" ContentType="application/xml"/>'
            + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            + '</Types>'],
        ['_rels/.rels',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            + '</Relationships>'],
        ['xl/workbook.xml',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            + '<sheets><sheet name="' + esc((sheetName || 'Sheet1').slice(0, 31)) + '" sheetId="1" r:id="rId1"/></sheets>'
            + '</workbook>'],
        ['xl/_rels/workbook.xml.rels',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            + '</Relationships>'],
        ['xl/worksheets/sheet1.xml', sheetXml(rows)]
    ]);

    const bytes = (rows, sheetName) => {
        const parts = PARTS(rows, sheetName);
        const chunks = [];
        const central = [];
        let offset = 0;

        const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
        const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

        for (const [name, xml] of parts) {
            const nameB = enc.encode(name);
            const data = enc.encode(xml);
            const crc = crc32(data);
            const local = [].concat(
                u32(0x04034b50), u16(20), u16(0), u16(0),
                u16(0), u16(0),                       // no meaningful mtime; readers do not care
                u32(crc), u32(data.length), u32(data.length),
                u16(nameB.length), u16(0)
            );
            chunks.push(new Uint8Array(local), nameB, data);
            central.push({ name: nameB, crc, size: data.length, offset });
            offset += local.length + nameB.length + data.length;
        }

        const dirStart = offset;
        for (const e of central) {
            const hdr = [].concat(
                u32(0x02014b50), u16(20), u16(20), u16(0), u16(0),
                u16(0), u16(0),
                u32(e.crc), u32(e.size), u32(e.size),
                u16(e.name.length), u16(0), u16(0), u16(0), u16(0),
                u32(0), u32(e.offset)
            );
            chunks.push(new Uint8Array(hdr), e.name);
            offset += hdr.length + e.name.length;
        }
        const end = [].concat(
            u32(0x06054b50), u16(0), u16(0),
            u16(central.length), u16(central.length),
            u32(offset - dirStart), u32(dirStart), u16(0)
        );
        chunks.push(new Uint8Array(end));

        let total = 0;
        for (const c of chunks) total += c.length;
        const out = new Uint8Array(total);
        let at = 0;
        for (const c of chunks) { out.set(c, at); at += c.length; }
        return out;
    };

    const download = (rows, filename, sheetName) => {
        const blob = new Blob([bytes(rows, sheetName)], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'export.xlsx';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            try { URL.revokeObjectURL(url); } catch (e) { }
            try { if (a.parentNode) a.parentNode.removeChild(a); } catch (e) { }
        }, 250);
    };

    // Text sibling, for BED and anything else line-oriented. lib/core.js has exportFile(),
    // but it builds its Blob as text/plain and never removes the anchor; this keeps the two
    // downloads on one code path.
    const downloadText = (text, filename, mime) => {
        const blob = new Blob([text], { type: mime || 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'export.txt';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            try { URL.revokeObjectURL(url); } catch (e) { }
            try { if (a.parentNode) a.parentNode.removeChild(a); } catch (e) { }
        }, 250);
    };

    return { bytes, download, downloadText };
})();
