import { Document, Packer, Paragraph, TextRun } from "docx";

export async function textToDocx(text: string): Promise<Buffer> {
  const paragraphs = text.split("\n").map((line) => {
    if (line.trim().startsWith("# ")) {
      return new Paragraph({
        children: [new TextRun({ text: line.replace("# ", ""), bold: true, size: 32 })],
        spacing: { after: 200 },
      });
    }
    if (line.trim().startsWith("## ")) {
      return new Paragraph({
        children: [new TextRun({ text: line.replace("## ", ""), bold: true, size: 28 })],
        spacing: { after: 150 },
      });
    }
    if (line.trim().startsWith("### ")) {
      return new Paragraph({
        children: [new TextRun({ text: line.replace("### ", ""), bold: true, size: 24 })],
        spacing: { after: 100 },
      });
    }
    if (line.trim() === "") {
      return new Paragraph({ text: "" });
    }
    return new Paragraph({
      children: [new TextRun({ text: line })],
      spacing: { after: 100 },
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
