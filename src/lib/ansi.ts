export type AnsiSegment = {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
};

export type AnsiScreen = {
  rows: AnsiSegment[][];
  cursor: { row: number; col: number };
};

type Style = Omit<AnsiSegment, "text">;

type Cell = { ch: string } & Style;

const ANSI_16 = [
  "#000000",
  "#cd3131",
  "#0dbc79",
  "#e5e510",
  "#2472c8",
  "#bc3fbc",
  "#11a8cd",
  "#e5e5e5",
  "#666666",
  "#f14c4c",
  "#23d18b",
  "#f5f543",
  "#3b8eea",
  "#d670d6",
  "#29b8db",
  "#ffffff",
];

const CUBE = [0, 95, 135, 175, 215, 255];

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

const MAX_ROWS = 5000;
const MAX_COLS = 500;

function color256(index: number): string {
  if (index < 16) return ANSI_16[index];
  if (index < 232) {
    const value = index - 16;
    return `rgb(${CUBE[Math.floor(value / 36)]},${CUBE[Math.floor(value / 6) % 6]},${CUBE[value % 6]})`;
  }
  const gray = 8 + (index - 232) * 10;
  return `rgb(${gray},${gray},${gray})`;
}

function applySgr(style: Style, params: number[]): Style {
  const next = { ...style };
  const codes = params.length === 0 ? [0] : params;

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code === 0) {
      for (const key of Object.keys(next) as (keyof Style)[]) delete next[key];
    } else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 4) next.underline = true;
    else if (code === 22) {
      delete next.bold;
      delete next.dim;
    } else if (code === 24) delete next.underline;
    else if (code === 39) delete next.fg;
    else if (code === 49) delete next.bg;
    else if (code >= 30 && code <= 37) next.fg = ANSI_16[code - 30];
    else if (code >= 90 && code <= 97) next.fg = ANSI_16[code - 90 + 8];
    else if (code >= 40 && code <= 47) next.bg = ANSI_16[code - 40];
    else if (code >= 100 && code <= 107) next.bg = ANSI_16[code - 100 + 8];
    else if ((code === 38 || code === 48) && codes[i + 1] === 5) {
      const color = color256(codes[i + 2] ?? 0);
      if (code === 38) next.fg = color;
      else next.bg = color;
      i += 2;
    } else if ((code === 38 || code === 48) && codes[i + 1] === 2) {
      const color = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`;
      if (code === 38) next.fg = color;
      else next.bg = color;
      i += 4;
    }
  }

  return next;
}

/**
 * Emula il sottoinsieme di terminale che serve a una shell readline:
 * scrittura, ritorno carrello, backspace, tab, cancellazione e movimento cursore.
 */
export function parseAnsi(input: string): AnsiScreen {
  const grid: Cell[][] = [[]];
  let row = 0;
  let col = 0;
  let style: Style = {};

  const line = (index: number): Cell[] => {
    while (grid.length <= index) grid.push([]);
    return grid[index];
  };

  const put = (ch: string) => {
    if (col > MAX_COLS) col = MAX_COLS;
    const target = line(row);
    while (target.length < col) target.push({ ch: " " });
    target[col] = { ch, ...style };
    col += 1;
  };

  const eraseLine = (mode: number) => {
    const target = line(row);
    if (mode === 2) {
      target.length = 0;
      col = 0;
    } else if (mode === 1) {
      for (let i = 0; i < Math.min(col, target.length); i++)
        target[i] = { ch: " " };
    } else {
      target.length = Math.min(target.length, col);
    }
  };

  const eraseDisplay = (mode: number) => {
    if (mode === 2) {
      grid.length = 0;
      grid.push([]);
      row = 0;
      col = 0;
      return;
    }
    eraseLine(0);
    if (mode === 0) grid.length = row + 1;
  };

  const insertChars = (count: number) => {
    const target = line(row);
    while (target.length < col) target.push({ ch: " " });
    target.splice(
      col,
      0,
      ...Array.from({ length: count }, () => ({ ch: " " })),
    );
  };

  const deleteChars = (count: number) => {
    const target = line(row);
    if (col < target.length) target.splice(col, count);
  };

  const params = (raw: string): number[] =>
    raw
      .split(";")
      .filter((part) => part !== "")
      .map((part) => Number.parseInt(part, 10))
      .filter((value) => Number.isFinite(value));

  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === ESC) {
      const next = input[i + 1];
      if (next === "[") {
        let end = i + 2;
        while (end < input.length && !/[@-~]/.test(input[end])) end++;
        const body = input.slice(i + 2, end);
        const final = input[end] ?? "";
        i = end + 1;

        if (final === "m") {
          style = applySgr(style, params(body));
          continue;
        }

        const raw = body.replace(/[?<>=!]/g, "");
        const values = params(raw);
        const amount = values[0] || 1;

        if (final === "A") row = Math.max(0, row - amount);
        else if (final === "B") row += amount;
        else if (final === "C") col += amount;
        else if (final === "D") col = Math.max(0, col - amount);
        else if (final === "E") {
          row += amount;
          col = 0;
        } else if (final === "F") {
          row = Math.max(0, row - amount);
          col = 0;
        } else if (final === "G") col = Math.max(0, amount - 1);
        else if (final === "H" || final === "f") {
          row = Math.max(0, (values[0] || 1) - 1);
          col = Math.max(0, (values[1] || 1) - 1);
        } else if (final === "K") eraseLine(values[0] ?? 0);
        else if (final === "J") eraseDisplay(values[0] ?? 0);
        else if (final === "P") deleteChars(amount);
        else if (final === "@") insertChars(amount);
        else if (final === "X") eraseLine(0);
        else if (final === "L") grid.splice(row, 0, []);
        else if (final === "M") grid.splice(row, 1);
        line(row);
        continue;
      }

      if (next === "]") {
        let end = i + 2;
        while (end < input.length && input[end] !== BEL) {
          if (input[end] === ESC && input[end + 1] === "\\") break;
          end++;
        }
        i = input[end] === BEL ? end + 1 : Math.min(input.length, end + 2);
        continue;
      }

      i += next === "(" || next === ")" || next === "#" ? 3 : 2;
      continue;
    }

    if (ch === "\r") {
      col = 0;
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row += 1;
      col = 0;
      line(row);
      i += 1;
      continue;
    }
    if (ch === "\b") {
      col = Math.max(0, col - 1);
      i += 1;
      continue;
    }
    if (ch === "\t") {
      col = Math.min(col, MAX_COLS);
      const stop = (Math.floor(col / 8) + 1) * 8;
      while (col < stop) put(" ");
      i += 1;
      continue;
    }
    if (ch === BEL || ch < " ") {
      i += 1;
      continue;
    }

    put(ch);
    i += 1;
  }

  const removed = Math.max(0, grid.length - MAX_ROWS);
  if (removed > 0) {
    grid.splice(0, removed);
    row = Math.max(0, row - removed);
  }

  return {
    rows: grid.map(toSegments),
    cursor: { row, col: Math.min(col, MAX_COLS) },
  };
}

function toSegments(cells: Cell[]): AnsiSegment[] {
  let end = cells.length;
  while (
    end > 0 &&
    cells[end - 1].ch === " " &&
    cells[end - 1].bg === undefined
  )
    end--;

  const segments: AnsiSegment[] = [];
  for (let i = 0; i < end; i++) {
    const cell = cells[i];
    const last = segments[segments.length - 1];
    if (last && sameStyle(last, cell)) last.text += cell.ch;
    else segments.push({ text: cell.ch, ...styleOf(cell) });
  }
  return segments;
}

function styleOf(cell: Cell): Style {
  const style: Style = {};
  if (cell.fg) style.fg = cell.fg;
  if (cell.bg) style.bg = cell.bg;
  if (cell.bold) style.bold = true;
  if (cell.dim) style.dim = true;
  if (cell.underline) style.underline = true;
  return style;
}

function sameStyle(segment: AnsiSegment, cell: Cell): boolean {
  return (
    segment.fg === cell.fg &&
    segment.bg === cell.bg &&
    segment.bold === cell.bold &&
    segment.dim === cell.dim &&
    segment.underline === cell.underline
  );
}
