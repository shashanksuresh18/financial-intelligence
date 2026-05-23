import fs from "node:fs";
import zlib from "node:zlib";

function decodePdfString(input) {
  let output = "";

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (char !== "\\") {
      output += char;
      continue;
    }

    index += 1;

    if (index >= input.length) {
      break;
    }

    const escaped = input[index];

    switch (escaped) {
      case "n":
        output += "\n";
        break;
      case "r":
        output += "\r";
        break;
      case "t":
        output += "\t";
        break;
      case "b":
        output += "\b";
        break;
      case "f":
        output += "\f";
        break;
      case "(":
      case ")":
      case "\\":
        output += escaped;
        break;
      default:
        if (/[0-7]/.test(escaped)) {
          let octal = escaped;

          while (
            index + 1 < input.length &&
            octal.length < 3 &&
            /[0-7]/.test(input[index + 1] ?? "")
          ) {
            index += 1;
            octal += input[index];
          }

          output += String.fromCharCode(parseInt(octal, 8));
        } else {
          output += escaped;
        }
        break;
    }
  }

  return output;
}

function normalizeText(value) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractTextFromContentStream(content) {
  const textChunks = [];
  const blockPattern = /BT([\s\S]*?)ET/g;
  let blockMatch;

  while ((blockMatch = blockPattern.exec(content)) !== null) {
    const block = blockMatch[1] ?? "";
    let blockText = "";
    let index = 0;

    while (index < block.length) {
      const char = block[index];

      if (char === "(") {
        let depth = 1;
        let value = "";
        index += 1;

        while (index < block.length && depth > 0) {
          const nextChar = block[index];

          if (nextChar === "\\" && index + 1 < block.length) {
            value += nextChar + block[index + 1];
            index += 2;
            continue;
          }

          if (nextChar === "(") {
            depth += 1;
            value += nextChar;
            index += 1;
            continue;
          }

          if (nextChar === ")") {
            depth -= 1;

            if (depth === 0) {
              index += 1;
              break;
            }

            value += nextChar;
            index += 1;
            continue;
          }

          value += nextChar;
          index += 1;
        }

        blockText += decodePdfString(value);
        continue;
      }

      if (char === "[") {
        let depth = 1;
        let value = "";
        index += 1;

        while (index < block.length && depth > 0) {
          const nextChar = block[index];

          if (nextChar === "\\") {
            value += nextChar;

            if (index + 1 < block.length) {
              value += block[index + 1];
              index += 2;
              continue;
            }
          }

          if (nextChar === "[") {
            depth += 1;
          } else if (nextChar === "]") {
            depth -= 1;

            if (depth === 0) {
              index += 1;
              break;
            }
          }

          value += nextChar;
          index += 1;
        }

        const strings = [...value.matchAll(/\((?:\\.|[^\\)])*\)/g)].map((match) =>
          decodePdfString((match[0] ?? "").slice(1, -1)),
        );
        blockText += strings.join("");
        continue;
      }

      if (char === "'" || char === "\"") {
        blockText += "\n";
      }

      index += 1;
    }

    const normalizedBlock = normalizeText(blockText);

    if (normalizedBlock.length > 0) {
      textChunks.push(normalizedBlock);
    }
  }

  return textChunks.join("\n\n");
}

function parseObjects(pdfBuffer) {
  const raw = pdfBuffer.toString("latin1");
  const objectPattern = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  const objects = new Map();
  let match;

  while ((match = objectPattern.exec(raw)) !== null) {
    const objectNumber = Number.parseInt(match[1] ?? "", 10);
    const body = match[3] ?? "";
    const streamIndex = body.indexOf("stream");
    let content = body;
    let stream = null;

    if (streamIndex >= 0) {
      const absoluteBodyStart = match.index + match[0].indexOf(body);
      const absoluteStreamStart = absoluteBodyStart + streamIndex + "stream".length;
      const absoluteEndStream = raw.indexOf("endstream", absoluteStreamStart);

      content = body.slice(0, streamIndex).trim();

      if (absoluteEndStream > absoluteStreamStart) {
        let buffer = pdfBuffer.slice(absoluteStreamStart, absoluteEndStream);

        if (buffer[0] === 0x0d && buffer[1] === 0x0a) {
          buffer = buffer.slice(2);
        } else if (buffer[0] === 0x0a) {
          buffer = buffer.slice(1);
        }

        if (buffer[buffer.length - 2] === 0x0d && buffer[buffer.length - 1] === 0x0a) {
          buffer = buffer.slice(0, -2);
        } else if (buffer[buffer.length - 1] === 0x0a) {
          buffer = buffer.slice(0, -1);
        }

        try {
          stream = content.includes("/Filter /FlateDecode")
            ? zlib.inflateSync(buffer).toString("latin1")
            : buffer.toString("latin1");
        } catch {
          stream = buffer.toString("latin1");
        }
      }
    }

    objects.set(objectNumber, {
      body: content,
      stream,
    });
  }

  return objects;
}

function extractPageText(pdfBuffer) {
  const objects = parseObjects(pdfBuffer);
  const pagePattern = /\/Type\s*\/Page\b/;
  const contentsPattern = /\/Contents\s+((?:\d+\s+\d+\s+R(?:\s+\d+\s+\d+\s+R)*)|\[[^\]]+\])/;
  const pages = [];

  for (const [objectNumber, objectValue] of objects.entries()) {
    if (!pagePattern.test(objectValue.body)) {
      continue;
    }

    const contentsMatch = objectValue.body.match(contentsPattern);
    if (contentsMatch === null) {
      continue;
    }

    const refs = [...contentsMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((match) =>
      Number.parseInt(match[1] ?? "", 10),
    );

    const pageText = refs
      .map((ref) => objects.get(ref)?.stream ?? "")
      .map((stream) => extractTextFromContentStream(stream))
      .filter((text) => text.length > 0)
      .join("\n\n");

    pages.push({
      objectNumber,
      text: normalizeText(pageText),
    });
  }

  return pages;
}

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error("Usage: node scripts/extract-pdf-text.mjs <pdf-path>");
  process.exit(1);
}

const buffer = fs.readFileSync(pdfPath);
const pages = extractPageText(buffer);

for (let index = 0; index < pages.length; index += 1) {
  const page = pages[index];
  console.log(`--- PAGE ${index + 1} (obj ${page.objectNumber}) ---`);
  console.log(page.text);
  console.log("");
}
