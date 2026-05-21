import { PDFDocument, StandardFonts } from 'pdf-lib';
import { deflateSync } from 'node:zlib';

/**
 * Create a minimal valid PNG buffer (10x10 solid red) using only Node built-ins.
 * Avoids external pngjs dependency in the pipeline test context.
 */
function makeRedPng(): Buffer {
  const width = 10;
  const height = 10;

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type: string, data: Buffer): Buffer {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([typeBytes, data]);
    let crc = 0xffffffff;
    for (const b of crcBuf) {
      crc ^= b;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const crcOut = Buffer.alloc(4);
    crcOut.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBytes, data, crcOut]);
  }

  // IHDR: width, height, bit depth=8, color type=2 (RGB)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Image data: each row has a filter byte (0) + 3 bytes per pixel (RGB red = 255,0,0)
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(height * rowBytes, 0);
  for (let row = 0; row < height; row++) {
    const off = row * rowBytes;
    raw[off] = 0; // filter type None
    for (let col = 0; col < width; col++) {
      raw[off + 1 + col * 3] = 255; // R
      raw[off + 2 + col * 3] = 0;   // G
      raw[off + 3 + col * 3] = 0;   // B
    }
  }
  const compressed = deflateSync(raw);

  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', iend),
  ]);
}

export async function pdfWithTable(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 400]);
  const rows = [['Product', 'Price', 'Stock'], ['Widget A', '$10', '100'], ['Widget B', '$15', '50']];
  let y = 350;
  for (const row of rows) {
    let x = 50;
    for (const cell of row) {
      page.drawText(cell, { x, y, size: 12, font });
      x += 120;
    }
    y -= 20;
  }
  return Buffer.from(await pdf.save());
}

export async function blankPdfWithText(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 400]);
  page.drawText('This is a paragraph with lots of text content.', { x: 50, y: 200, size: 12, font });
  return Buffer.from(await pdf.save());
}

export async function blankPdfNoText(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 400]);
  return Buffer.from(await pdf.save());
}

export async function pdfWithEmbeddedImage(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 400]);
  const pngBuf = makeRedPng();
  const img = await pdf.embedPng(pngBuf);
  page.drawImage(img, { x: 50, y: 50, width: 100, height: 100 });
  return Buffer.from(await pdf.save());
}
