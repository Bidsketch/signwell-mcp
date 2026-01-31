import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
} from "docx";

interface MarkdownToken {
  type: "heading" | "paragraph" | "list" | "blockquote" | "code" | "horizontal_rule";
  level?: number;
  content: string;
  items?: string[];
  ordered?: boolean;
}

function parseMarkdown(text: string): MarkdownToken[] {
  const lines = text.split("\n");
  const tokens: MarkdownToken[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line - skip but may end a paragraph
    if (trimmed === "") {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      tokens.push({ type: "horizontal_rule", content: "" });
      i++;
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      tokens.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      tokens.push({
        type: "code",
        content: codeLines.join("\n"),
      });
      i++; // Skip closing ```
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().slice(1).trim());
        i++;
      }
      tokens.push({
        type: "blockquote",
        content: quoteLines.join(" "),
      });
      continue;
    }

    // Lists
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);

    if (unorderedMatch || orderedMatch) {
      const isOrdered = !!orderedMatch;
      const items: string[] = [];

      while (i < lines.length) {
        const currentLine = lines[i];
        const currentTrimmed = currentLine.trim();

        // Check for list item
        const uMatch = currentTrimmed.match(/^[-*+]\s+(.+)$/);
        const oMatch = currentTrimmed.match(/^\d+\.\s+(.+)$/);

        if ((isOrdered && oMatch) || (!isOrdered && uMatch)) {
          items.push(isOrdered ? oMatch![1] : uMatch![1]);
          i++;
        } else if (
          currentTrimmed === "" ||
          currentTrimmed.startsWith("- ") ||
          currentTrimmed.startsWith("* ") ||
          /^\d+\./.test(currentTrimmed)
        ) {
          // End of this list
          break;
        } else {
          // Continuation of previous item (indented content)
          items[items.length - 1] += " " + currentTrimmed;
          i++;
        }
      }

      tokens.push({
        type: "list",
        items,
        ordered: isOrdered,
        content: "",
      });
      continue;
    }

    // Paragraph (collect multiple lines until blank line or new block)
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("- ") &&
      !lines[i].trim().startsWith("* ") &&
      !/^\d+\./.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("```")
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    tokens.push({
      type: "paragraph",
      content: paraLines.join(" "),
    });
  }

  return tokens;
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const remaining = text;
  let currentText = "";
  let isBold = false;
  let isItalic = false;

  const flushCurrent = () => {
    if (currentText) {
      runs.push(
        new TextRun({
          text: currentText,
          bold: isBold,
          italics: isItalic,
        }),
      );
      currentText = "";
    }
  };

  let i = 0;
  while (i < remaining.length) {
    const char = remaining[i];
    const nextChar = remaining[i + 1];

    // Bold with **
    if (char === "*" && nextChar === "*") {
      flushCurrent();
      isBold = !isBold;
      i += 2;
      continue;
    }

    // Bold with __
    if (char === "_" && nextChar === "_") {
      flushCurrent();
      isBold = !isBold;
      i += 2;
      continue;
    }

    // Italic with *
    if (char === "*" && nextChar !== "*") {
      flushCurrent();
      isItalic = !isItalic;
      i += 1;
      continue;
    }

    // Italic with _
    if (char === "_" && nextChar !== "_") {
      flushCurrent();
      isItalic = !isItalic;
      i += 1;
      continue;
    }

    // Inline code with `
    if (char === "`") {
      flushCurrent();
      let code = "";
      i++;
      while (i < remaining.length && remaining[i] !== "`") {
        code += remaining[i];
        i++;
      }
      if (i < remaining.length) i++; // Skip closing `
      runs.push(
        new TextRun({
          text: code,
          font: "Courier New",
          italics: true,
        }),
      );
      continue;
    }

    currentText += char;
    i++;
  }

  flushCurrent();
  return runs;
}

export async function textToDocx(text: string): Promise<Buffer> {
  const tokens = parseMarkdown(text);
  const paragraphs: Paragraph[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const level = token.level || 1;
        const size = level === 1 ? 32 : level === 2 ? 28 : level === 3 ? 26 : level === 4 ? 24 : 22;
        paragraphs.push(
          new Paragraph({
            children: parseInlineFormatting(token.content),
            heading:
              level === 1
                ? HeadingLevel.HEADING_1
                : level === 2
                  ? HeadingLevel.HEADING_2
                  : level === 3
                    ? HeadingLevel.HEADING_3
                    : level === 4
                      ? HeadingLevel.HEADING_4
                      : level === 5
                        ? HeadingLevel.HEADING_5
                        : HeadingLevel.HEADING_6,
            spacing: { after: 200 },
          }),
        );
        break;
      }

      case "paragraph": {
        paragraphs.push(
          new Paragraph({
            children: parseInlineFormatting(token.content),
            spacing: { after: 120 },
          }),
        );
        break;
      }

      case "list": {
        if (token.items) {
          token.items.forEach((item, index) => {
            paragraphs.push(
              new Paragraph({
                children: parseInlineFormatting(item),
                bullet: token.ordered
                  ? {
                      level: 0,
                    }
                  : {
                      level: 0,
                    },
                spacing: { after: 80 },
              }),
            );
          });
        }
        break;
      }

      case "blockquote": {
        paragraphs.push(
          new Paragraph({
            children: parseInlineFormatting(token.content),
            indent: { left: 720 },
            spacing: { after: 120 },
          }),
        );
        break;
      }

      case "code": {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: token.content,
                font: "Courier New",
                size: 20,
              }),
            ],
            spacing: { after: 120 },
          }),
        );
        break;
      }

      case "horizontal_rule": {
        paragraphs.push(
          new Paragraph({
            border: {
              bottom: {
                color: "999999",
                space: 1,
                style: "single",
                size: 6,
              },
            },
            spacing: { before: 200, after: 200 },
          }),
        );
        break;
      }
    }
  }

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
