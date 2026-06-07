'use strict';

/**
 * cli-colors.js — Zero-dependency ANSI color helpers.
 * Auto-detects TTY; all colors are no-ops when piped.
 */

const isTTY = process.stdout.isTTY === true;

/**
 * Wrap text in ANSI codes, passthrough if not a TTY.
 * @param {string} open
 * @param {string} close
 * @returns {(text: string) => string}
 */
function ansi(open, close) {
  return (text) => (isTTY ? `\x1b[${open}m${text}\x1b[${close}m` : String(text));
}

const colors = {
  reset: ansi('0', '0'),
  bold: ansi('1', '22'),
  dim: ansi('2', '22'),
  red: ansi('31', '39'),
  green: ansi('32', '39'),
  yellow: ansi('33', '39'),
  blue: ansi('34', '39'),
  magenta: ansi('35', '39'),
  cyan: ansi('36', '39'),
  white: ansi('37', '39'),
  bgRed: ansi('41', '49'),
  bgGreen: ansi('42', '49'),
  bgYellow: ansi('43', '49'),
  bgBlue: ansi('44', '49'),
};

/**
 * Colorized priority badge.
 * @param {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'} level
 * @returns {string}
 */
function badge(level) {
  const map = {
    CRITICAL: colors.red,
    HIGH: colors.yellow,
    MEDIUM: colors.blue,
    LOW: colors.dim,
  };
  const fn = map[level] || colors.reset;
  return fn(`[${level}]`);
}

/**
 * Render a table with column alignment.
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {string}
 */
function table(headers, rows) {
  const cols = headers.length;
  // Strip ANSI codes for width measurement
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  const widths = headers.map((h, i) => {
    return Math.max(
      stripAnsi(h).length,
      ...rows.map((r) => stripAnsi(r[i] || '').length)
    );
  });

  const pad = (str, width) => {
    const visible = stripAnsi(str).length;
    return str + ' '.repeat(Math.max(0, width - visible));
  };

  const sep = '┼' + widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┼';
  const headerRow = '│ ' + headers.map((h, i) => pad(colors.bold(h), widths[i])).join(' │ ') + ' │';
  const dataRows = rows.map(
    (row) => '│ ' + row.map((cell, i) => pad(cell || '', widths[i])).join(' │ ') + ' │'
  );

  const top = '┌' + widths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐';
  const bot = '└' + widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘';

  return [top, headerRow, sep, ...dataRows, bot].join('\n');
}

module.exports = { colors, badge, table, isTTY };
