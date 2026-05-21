import { PDFDocument, StandardFonts } from 'pdf-lib';

export async function makeTinyPdf(pages: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([400, 600]);
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      page.drawText(line, { x: 40, y: 560 - i * 16, size: 12, font });
    });
  }
  return Buffer.from(await doc.save());
}
