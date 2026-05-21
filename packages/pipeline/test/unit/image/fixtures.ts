import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const TINY_RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAF0lEQVR4nGP8z8DAwMDAxMDAwMAAAN0BAQCF0kQAAAAASUVORK5CYII=',
  'base64',
);
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7V+C37O3wp1v4OeBNR1H4ZeDr/ULzQbC4ubu60C0klnle3Rnd3aMlmYkkknJJJNFFFf0xln+40P8ABH8keXiP40/V/mf/2Q==',
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

export async function makePdfWithEmbeddedJpeg(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 200]);
  const image = await pdf.embedJpg(Uint8Array.from(TINY_JPEG));
  page.drawImage(image, { x: 20, y: 30, width: 40, height: 50 });
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
