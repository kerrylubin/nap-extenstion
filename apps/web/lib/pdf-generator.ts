import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const BLACK = rgb(0, 0, 0);

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

export async function generateLetterPDF(params: {
  letterText: string;
  company: string;
  filename: string;
}): Promise<Uint8Array> {
  const { letterText } = params;

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4

  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const margin = 60;
  const width = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;

  // Clean markdown artifacts before rendering
  const cleaned = letterText
    .replace(/\*\*(.*?)\*\*/g, "$1")   // **bold** → bold
    .replace(/\*(.*?)\*/g, "$1")        // *italic* → italic
    .replace(/^---+$/gm, "")            // horizontal rules
    .replace(/^#{1,6}\s*/gm, "")        // headings
    .replace(/\n{3,}/g, "\n\n")         // collapse excess blank lines
    .trim();

  // Render letter body — split on double newlines for paragraph gaps,
  // then on single newlines within each block to preserve address lines.
  const paragraphs = cleaned.split(/\n\n+/);
  const lineHeight = 14;
  const maxChars = Math.floor(width / 5.5); // ~85 chars per line at size 10

  for (const para of paragraphs) {
    if (!para.trim()) continue;
    const subLines = para.split("\n");
    for (const subLine of subLines) {
      if (!subLine.trim()) continue;
      const wrapped = wrapText(subLine.trim(), maxChars);
      for (const line of wrapped) {
        if (y < margin + 20) break;
        page.drawText(line, {
          x: margin,
          y,
          size: 10,
          font: regular,
          color: BLACK,
        });
        y -= lineHeight;
      }
    }
    y -= 8; // paragraph gap
  }

  return doc.save();
}
