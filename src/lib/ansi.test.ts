import { describe, expect, it } from "vitest";
import { parseAnsi } from "./ansi";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

const text = (input: string) =>
  parseAnsi(input).rows.map((row) =>
    row.map((segment) => segment.text).join(""),
  );

const firstRow = (input: string) => parseAnsi(input).rows[0];

describe("parseAnsi", () => {
  it("rimuove le sequenze OSC del titolo senza lasciare artefatti", () => {
    expect(text(`${ESC}]0;user@host: ~${BEL}user@host:~$ ls`)).toEqual([
      "user@host:~$ ls",
    ]);
  });

  it("applica i colori base e li azzera con 0", () => {
    expect(firstRow(`${ESC}[32mok${ESC}[0m plain`)).toEqual([
      { text: "ok", fg: "#0dbc79" },
      { text: " plain" },
    ]);
  });

  it("interpreta 256 colori e truecolor", () => {
    expect(firstRow(`${ESC}[38;5;196mX`)[0].fg).toBe("rgb(255,0,0)");
    expect(firstRow(`${ESC}[38;2;1;2;3mY`)[0].fg).toBe("rgb(1,2,3)");
  });

  it("tiene lo stile bold e lo rimuove con 22", () => {
    expect(firstRow(`${ESC}[1mbold${ESC}[22mplain`)).toEqual([
      { text: "bold", bold: true },
      { text: "plain" },
    ]);
  });

  it("scarta i movimenti cursore e le sequenze non SGR", () => {
    expect(text(`${ESC}[2J${ESC}[?2004hciao`)).toEqual(["ciao"]);
  });

  it("sovrascrive la riga con il ritorno carrello", () => {
    expect(text("10%\r100%\nfine")).toEqual(["100%", "fine"]);
  });

  it("riscrive le righe di avanzamento docker senza residui", () => {
    const input = [
      "Pulling from library/debian\r\n\r\n",
      `${ESC}[1A${ESC}[2K\r41b: Pulling fs layer \r${ESC}[1B`,
      `${ESC}[1A${ESC}[2K\r41b: Already exists \r${ESC}[1B`,
      "\r\n",
      `${ESC}[1A${ESC}[2K\r33c: Downloading  1.049MB/2.36MB\r${ESC}[1B`,
      `${ESC}[1A${ESC}[2K\r33c: Download complete \r${ESC}[1B`,
      "Digest: sha256:x",
    ].join("");

    expect(text(input)).toEqual([
      "Pulling from library/debian",
      "41b: Already exists",
      "33c: Download complete",
      "Digest: sha256:x",
    ]);
  });

  it("conserva le righe con terminazione CRLF", () => {
    expect(text("prima\r\nseconda\r\n")).toEqual(["prima", "seconda", ""]);
  });

  it("rispetta il backspace con cancellazione di riga", () => {
    expect(text("echo BBBB\b\u001b[K\b\u001b[K\b\u001b[K\b\u001b[KX")).toEqual([
      "echo X",
    ]);
  });

  it("cancella caratteri con CSI P dopo aver spostato il cursore", () => {
    expect(text("QWERT\u001b[5D\u001b[1P")).toEqual(["WERT"]);
    expect(text("echo QWERT\u001b[5D\u001b[1PWERT")).toEqual(["echo WERT"]);
  });

  it("espone la posizione del cursore", () => {
    const screen = parseAnsi("abc\b");
    expect(screen.cursor).toEqual({ row: 0, col: 2 });
  });

  it("limita la colonna del cursore", () => {
    const screen = parseAnsi("x\u001b[90000Cy");
    expect(screen.cursor.col).toBe(500);
    expect(
      screen.rows[0].map((part) => part.text).join("").length,
    ).toBeLessThanOrEqual(501);
  });

  it("tiene il cursore dentro il buffer dopo il taglio delle righe", () => {
    const screen = parseAnsi("\n".repeat(5010));
    expect(screen.rows).toHaveLength(5000);
    expect(screen.cursor.row).toBe(4999);
  });
});
