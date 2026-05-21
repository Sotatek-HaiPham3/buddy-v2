import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const TINY_RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAF0lEQVR4nGP8z8DAwMDAxMDAwMAAAN0BAQCF0kQAAAAASUVORK5CYII=',
  'base64',
);

export async function makePdfWithEmbeddedImage(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const pageWithImage = pdf.addPage([200, 200]);
  const image = await pdf.embedPng(TINY_RED_PNG);
  pageWithImage.drawImage(image, { x: 20, y: 30, width: 40, height: 50 });
  pdf.addPage([200, 200]);
  return Buffer.from(await pdf.save());
}

export async function makeBlankPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  return Buffer.from(await pdf.save());
}

export async function makeTextPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 400]);
  page.drawText(text, {
    x: 40,
    y: 340,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });
  return Buffer.from(await pdf.save());
}
