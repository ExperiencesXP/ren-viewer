import { matchPlate, parseFilter, type PlateLike } from "./galleryFilter";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function plate(name: string, file: string): PlateLike {
  return { name, file };
}

const SAMPLE = plate("Character and or extra", "cg/ev/Character_and_or extra.PNG");
const CHAR2 = plate("char2 happy", "images/cg/char2_happy.png");
const ICO = plate("icon", "gui/icon.ico");
const WEBM = plate("event clip", "scene/ev/clip.webm");
const PATHY = plate("shot", "foo\\ex\\ah\\bar.png");
const PATHY2 = plate("shot", "packs/ah/ex/file.jpg");

function main() {
  const empty = parseFilter("");
  assert(empty.empty && matchPlate(empty, SAMPLE), "empty matches all");

  const orNames = parseFilter("char1 OR char2");
  assert(orNames.description.includes("char1") && orNames.description.includes("char2"), "or names described");
  assert(matchPlate(orNames, CHAR2), "char2 hits OR");
  assert(!matchPlate(orNames, SAMPLE), "Character does not hit char1 OR char2");

  const andNames = parseFilter("char2 and happy");
  assert(matchPlate(andNames, CHAR2), "and both tokens");
  assert(!matchPlate(andNames, plate("char2", "cg/char2.png")), "and misses without happy");

  const kinds = parseFilter("kind:png or webm");
  assert(matchPlate(kinds, CHAR2), "kind png");
  assert(matchPlate(kinds, WEBM), "kind webm");
  assert(!matchPlate(kinds, ICO), "kind rejects ico");

  for (const prefix of ["type", "ext", "extension", "file"]) {
    const q = parseFilter(`${prefix}:.png`);
    assert(matchPlate(q, CHAR2), `${prefix}: png`);
    assert(!matchPlate(q, WEBM), `${prefix}: not webm`);
  }

  const dotted = parseFilter(".ico");
  assert(matchPlate(dotted, ICO), "bare .ico is an extension");
  assert(!matchPlate(dotted, CHAR2), "bare .ico rejects png");

  const pathQ = parseFilter("path:ex/ah or ah\\ex");
  assert(matchPlate(pathQ, PATHY), "path slash matches backslash store");
  assert(matchPlate(pathQ, PATHY2), "path backslash alt");
  assert(!matchPlate(pathQ, CHAR2), "path misses unrelated");

  const cased = parseFilter("!C!haracter");
  assert(matchPlate(cased, SAMPLE), "sensitive C matches Character");
  assert(matchPlate(cased, plate("CHARACTER", "cg/x.png")), "insensitive tail allows CHARACTER");
  assert(!matchPlate(cased, plate("character", "cg/x.png")), "sensitive C rejects character");

  const ah = parseFilter("!AH!");
  assert(matchPlate(ah, plate("xxAHyy", "cg/a.png")), "!AH! hits");
  assert(!matchPlate(ah, plate("xxahyy", "cg/a.png")), "!AH! rejects ah");

  const literal = parseFilter("?and ?or?");
  assert(literal.ast?.type === "term", "escaped gates merge to a phrase");
  assert(matchPlate(literal, plate("and or", "cg/x.png")), "literal and or");
  const danglingAnd = parseFilter("and");
  assert(!danglingAnd.empty && danglingAnd.ast == null, "dangling and is incomplete");
  assert(!matchPlate(danglingAnd, SAMPLE), "dangling and matches none");
  assert(!matchPlate(parseFilter("or"), SAMPLE), "bare or matches none");
  assert(!matchPlate(parseFilter("kind:"), SAMPLE), "kind: with no term matches none");
  assert(!matchPlate(parseFilter("hero or"), SAMPLE), "dangling or matches none");
  assert(matchPlate(parseFilter("orange"), plate("orange", "cg/x.png")), "orange is a term");

  const example = parseFilter("file:.png or .ico, !C!haracter ?and ?or? and char2");
  assert(
    example.description ===
      "Filtering for file names including 'Character and or' and 'char2', while also having the file extension .png or .ico",
    `description was: ${example.description}`,
  );
  const hit = plate("Character and or char2", "ev/Character_and_or_char2.png");
  assert(matchPlate(example, hit), "example hits combined name + png");
  assert(!matchPlate(example, plate("Character and or char2", "ev/x.webm")), "example rejects webm");
  assert(!matchPlate(example, plate("character and or char2", "ev/x.png")), "example rejects wrong case C");
  assert(!matchPlate(example, plate("Character and or", "ev/x.png")), "example requires char2 as well");
  assert(matchPlate(example, plate("char2", "icons/Character and or.ico")), "ico allowed by file:");

  const xorQ = parseFilter("char2 xor happy");
  assert(matchPlate(xorQ, plate("char2", "cg/a.png")), "xor one side");
  assert(!matchPlate(xorQ, CHAR2), "xor both sides false");

  const nandQ = parseFilter("char2 nand happy");
  assert(matchPlate(nandQ, plate("char2", "cg/a.png")), "nand one side");
  assert(!matchPlate(nandQ, CHAR2), "nand both false");

  const norQ = parseFilter("char2 nor happy");
  assert(matchPlate(norQ, SAMPLE), "nor neither");
  assert(!matchPlate(norQ, CHAR2), "nor both false");

  const xnorQ = parseFilter("char2 xnor happy");
  assert(matchPlate(xnorQ, CHAR2), "xnor both");
  assert(matchPlate(xnorQ, SAMPLE), "xnor neither");
  assert(!matchPlate(xnorQ, plate("char2", "cg/a.png")), "xnor one side false");

  const notQ = parseFilter("not kind:png");
  assert(matchPlate(notQ, WEBM), "not png keeps webm");
  assert(!matchPlate(notQ, CHAR2), "not png drops png");

  const grouped = parseFilter("(char1 or char2) and kind:png");
  assert(matchPlate(grouped, CHAR2), "parens");
  assert(!matchPlate(grouped, WEBM), "parens still require png");

  const commaOr = parseFilter("char1 OR char2, kind:png or webm");
  assert(
    commaOr.description ===
      "Filtering for file names including 'char1' or 'char2', while also having the file extension png or webm",
    `or-clause description: ${commaOr.description}`,
  );

  console.log("ok", 20);
}

main();
