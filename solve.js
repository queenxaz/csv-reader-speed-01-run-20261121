// A fast CSV reader that returns exactly what csv-reader 1.0.0 returns for the
// same input {text, header}: {columns, rows, errors}. Written from scratch.
//
// Reading policy (csv-reader's own): a U+FEFF at the very start is dropped; a
// record ends at LF or CRLF; a line left with no characters is no record;
// outside quotes a CR not followed by LF is dropped (stray_cr); a field that
// opens with a quote runs to the next quote that is not doubled ("" inside is
// one quote, each CRLF or lone CR inside reads as LF); what follows the
// closing quote up to the next comma or line break is appended as it stands
// (quote_junk, when the field ends); a quote that never closes is a literal
// character and the text after it is read again as unquoted
// (unterminated_quote); a quote inside an unquoted field is literal; fields
// stay strings, never trimmed or converted; columns is the first record when
// header is true else null; rows are the records after it, each padded with
// "" (short_row, with fields: its field count) or cut (long_row, with extra:
// the cut fields) to the first record's width; each error is {code, line,
// row} in the order met, a record's short_row/long_row when it ends: line is
// the 1-based line its record starts on, counting every LF, CRLF and lone CR
// inside quotes, row is its record's index in rows, null for the header.
//
// Speed: a record is read in runs. The unquoted fields before the next quote
// are taken whole with one slice and one split, a quoted field is taken with
// one indexOf for its closing quote, and only a record that holds a stray CR
// or a quote inside an unquoted field falls back to reading field by field.
// The field readers report through shared slots instead of allocating a
// result object per field.

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // What the last field read was: its value, how it ended (0 = comma,
  // 1 = line break, 2 = end of text), where the next field starts, and how
  // many characters the unquoted read kept (for quote_junk).
  let fValue = '';
  let fEnded = 0;
  let fPos = 0;
  let fAdded = 0;

  const err = (code) => {
    errors.push({ code, line: recordLine, row: recordRow });
  };

  // Append text[s..e) to value, turning each CRLF or lone CR into one LF and
  // counting the line breaks it holds. Most segments hold no line break.
  function norm(value, s, e) {
    const seg = text.slice(s, e);
    if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) return value + seg;
    return value + seg.replace(/\r\n?|\n/g, () => {
      line += 1;
      return '\n';
    });
  }

  // Read an unquoted field starting at p with `value` already in hand, and
  // report it through the shared slots.
  function readUnquoted(value, p) {
    const cm = text.indexOf(',', p);
    const nl = text.indexOf('\n', p);
    let end;
    let ended;
    if (cm !== -1 && (nl === -1 || cm < nl)) {
      end = cm;
      ended = 0;
    } else if (nl !== -1) {
      end = nl;
      ended = 1;
    } else {
      end = len;
      ended = 2;
    }
    const seg = text.slice(p, end);
    const cr = seg.indexOf('\r');
    if (cr === -1) {
      if (ended === 1) line += 1;
      fValue = value + seg;
      fEnded = ended;
      fPos = end + (ended === 2 ? 0 : 1);
      fAdded = seg.length;
      return;
    }
    if (ended === 1 && cr === seg.length - 1) {
      // CRLF: the CR is the line break's first half.
      line += 1;
      fValue = value + seg.slice(0, -1);
      fEnded = ended;
      fPos = end + 1;
      fAdded = seg.length - 1;
      return;
    }
    // A stray CR sits inside the field: drop it (and any more like it) one
    // at a time, keeping the field going. Rare enough to take slowly.
    let v = value;
    let q = p;
    let kept = 0;
    for (;;) {
      const c = text.indexOf('\r', q);
      if (c === -1 || c >= end) {
        v += text.slice(q, end);
        kept += end - q;
        if (ended === 1) line += 1;
        fValue = v;
        fEnded = ended;
        fPos = end + (ended === 2 ? 0 : 1);
        fAdded = kept;
        return;
      }
      if (ended === 1 && c + 1 === nl) {
        // This CR opens the CRLF that ends the field.
        v += text.slice(q, c);
        kept += c - q;
        line += 1;
        fValue = v;
        fEnded = ended;
        fPos = nl + 1;
        fAdded = kept;
        return;
      }
      v += text.slice(q, c);
      kept += c - q;
      err('stray_cr');
      q = c + 1;
    }
  }

  // Read a quoted field whose opening quote is at p, and report it through
  // the shared slots.
  function readQuoted(p) {
    const open = p;
    const openLine = line;
    let value = '';
    let cur = p + 1;
    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        line = openLine;
        err('unterminated_quote');
        readUnquoted('"', open + 1);
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one quote inside the field.
        value = norm(value, cur, q);
        value += '"';
        cur = q + 2;
        continue;
      }
      value = norm(value, cur, q);
      const after = q + 1;
      if (after >= len) {
        fValue = value;
        fEnded = 2;
        fPos = len;
        fAdded = 0;
        return;
      }
      const c = text.charCodeAt(after);
      if (c === 44) {
        fValue = value;
        fEnded = 0;
        fPos = after + 1;
        fAdded = 0;
        return;
      }
      if (c === 10) {
        line += 1;
        fValue = value;
        fEnded = 1;
        fPos = after + 1;
        fAdded = 0;
        return;
      }
      if (c === 13 && text.charCodeAt(after + 1) === 10) {
        line += 1;
        fValue = value;
        fEnded = 1;
        fPos = after + 2;
        fAdded = 0;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      readUnquoted(value, after);
      if (fAdded > 0) err('quote_junk');
      return;
    }
  }

  // Read the rest of a record field by field, from a field start at p.
  // Only used when a run of unquoted fields cannot be taken whole (a stray
  // CR, or a quote inside an unquoted field). Returns the fields it read, how
  // the record ended, whether its last field was quoted, and where it stopped.
  function readFieldsSlow(p) {
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(p) === 34;
      if (quoted) readQuoted(p);
      else readUnquoted('', p);
      fields.push(fValue);
      p = fPos;
    } while (fEnded === 0);
    return { fields, ended: fEnded, quoted, pos: p };
  }

  // Finish one record's fields: pad or cut to the first record's width, and
  // record short_row/long_row when the record ends. The header only sets the
  // width and becomes columns.
  function finish(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const fields = [];
    let quoted = false;
    for (;;) {
      // At a field start. The line up to its next break decides whether the
      // rest of the record is plain unquoted fields.
      const nl = text.indexOf('\n', pos);
      const end = nl === -1 ? len : nl;
      const seg = text.slice(pos, end);
      const q = seg.indexOf('"');
      if (q === -1) {
        // No quote before the line break: the rest of the record is
        // unquoted fields. Take it whole.
        const cr = seg.indexOf('\r');
        if (cr !== -1 && (nl === -1 || cr !== seg.length - 1)) {
          // A stray CR sits in the run: read it field by field instead.
          const slow = readFieldsSlow(pos);
          for (const f of slow.fields) fields.push(f);
          quoted = slow.quoted;
          pos = slow.pos;
          break;
        }
        const body = nl !== -1 && seg.length > 0 && seg.charCodeAt(seg.length - 1) === 13 ? seg.slice(0, -1) : seg;
        const parts = body.split(',');
        for (const f of parts) fields.push(f);
        quoted = false;
        if (nl !== -1) line += 1;
        pos = nl === -1 ? len : nl + 1;
        break;
      }
      const qAbs = pos + q;
      if (qAbs === pos || text.charCodeAt(qAbs - 1) === 44) {
        // The quote opens a field. The unquoted fields before it end at the
        // comma just before the quote; take them whole.
        if (qAbs > pos) {
          const pre = seg.slice(0, q - 1);
          if (pre.indexOf('\r') !== -1) {
            const slow = readFieldsSlow(pos);
            for (const f of slow.fields) fields.push(f);
            quoted = slow.quoted;
            pos = slow.pos;
            break;
          }
          const parts = pre.split(',');
          for (const f of parts) fields.push(f);
        }
        readQuoted(qAbs);
        fields.push(fValue);
        quoted = true;
        pos = fPos;
        if (fEnded !== 0) break;
        continue;
      }
      // A quote inside an unquoted field is a literal character: read the
      // rest of the record field by field.
      const slow = readFieldsSlow(pos);
      for (const f of slow.fields) fields.push(f);
      quoted = slow.quoted;
      pos = slow.pos;
      break;
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    finish(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
