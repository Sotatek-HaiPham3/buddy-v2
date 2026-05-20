import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function makeSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`Page ${i + 1}: Hello buddy ${i + 1}`, {
      x: 50,
      y: 550,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawText('Sample body text used by mupdf tests.', {
      x: 50,
      y: 500,
      size: 12,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  return doc.save();
}
