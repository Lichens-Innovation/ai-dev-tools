/**
 * anonymize.mjs — the anonymiser behind `capture.mjs screen` (references/local-studio.md#sample-data).
 *
 *   createAnonymizer(faker, { keys, allow })   one per capture; holds the real -> fake memo
 *     .json(value)            JSON with its personal string fields (by key name) replaced
 *     .text(string)           a text from the page replaced by a fake of the same kind and length
 *     .findings(candidates)   what still looks personal in [{ value, where }] (email, phone, token)
 *
 * Fakes are deterministic: faker is seeded from a hash of the original value, so the same real value
 * always gives the same fake, in a JSON list and in a server-rendered header alike.
 */
import { createHash } from 'node:crypto';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)\s?|\d{2,4}[\s.-])\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{1,4})?|\+\d{8,15}/g;
const JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g;
const BEARER = /\bBearer\s+[\w.~+/=-]{8,}/gi;
const HEX = /\b[0-9a-f]{32,}\b/gi;
const BASE64 = /[A-Za-z0-9+/_-]{32,}={0,2}/g;
// "12 345 678", "1.234.567": a number grouped by thousands, not a phone.
const THOUSANDS = /^\d{1,3}(?:([\s.,])\d{3})(?:\1\d{3})*$/;
const DATA_URL = /data:[^,\s]*,[^\s"')]*/gi;
// A URL or path up to its query: "https://cdn/x/main.4f2a.js?sig=…" keeps "?sig=…".
const URL_PATH = /(?:[a-z][a-z0-9+.-]*:\/\/|\.{0,2}\/)[^\s?#"')]*/gi;
const IS_PHONE =new RegExp(`^(?:${PHONE.source})$`);
const IS_EMAIL = new RegExp(`^${EMAIL.source}$`);

// Attributes that carry no data of their own: styling and framework plumbing.
export const SKIP_ATTRS = new Set(['class', 'style', 'id', 'for', 'role', 'type', 'lang', 'dir']);

/** Key names (lower case, no `_`/`-`) -> the kind of fake. A compound key ("customerName") matches on its last word. */
const KINDS = {
  name: 'name', fullname: 'name', displayname: 'name', contactname: 'name', authorname: 'name', ownername: 'name',
  firstname: 'first', givenname: 'first', forename: 'first',
  lastname: 'last', surname: 'last', familyname: 'last',
  username: 'username', login: 'username', handle: 'username', nickname: 'username',
  email: 'email', emailaddress: 'email', mail: 'email',
  phone: 'phone', phonenumber: 'phone', mobile: 'phone', mobilenumber: 'phone', telephone: 'phone', tel: 'phone', fax: 'phone', cell: 'phone',
  address: 'address', address1: 'address', address2: 'address', addressline1: 'address', addressline2: 'address', street: 'address', streetaddress: 'address',
  city: 'city', town: 'city',
  zip: 'zip', zipcode: 'zip', postalcode: 'zip', postcode: 'zip',
  company: 'company', companyname: 'company', organization: 'company', organisation: 'company', employer: 'company',
  avatar: 'avatar', avatarurl: 'avatar', picture: 'avatar', pictureurl: 'avatar', photo: 'avatar', photourl: 'avatar', profileimage: 'avatar', profilepicture: 'avatar', profileimageurl: 'avatar', imageurl: 'avatar',
};
// "fileName", "hostName", "className": names of things, not of people.
const NOT_A_PERSON = new Set(['file', 'host', 'class', 'tag', 'type', 'key', 'field', 'column', 'event', 'route', 'table', 'schema', 'domain', 'sheet', 'folder', 'dir', 'path', 'package', 'script', 'font', 'theme', 'color']);

const normalize = (key) => key.toLowerCase().replace(/[_\-\s]/g, '');

/** The kind of fake for a JSON key, or null when the key is not personal. `extra` = the row's anonymize.keys. */
export function kindOfKey(key, extra = new Set()) {
  const flat = normalize(key);
  if (extra.has(flat)) return KINDS[flat] ?? 'auto';
  if (KINDS[flat]) return KINDS[flat];
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_\-.]+/).map((w) => w.toLowerCase()).filter(Boolean);
  if (words.length < 2) return null;
  const last = words[words.length - 1];
  const two = words.slice(-2).join('');
  if (NOT_A_PERSON.has(words[words.length - 2])) return null;
  return KINDS[two] ?? KINDS[last] ?? null;
}

const seedOf = (kind, value) => createHash('sha256').update(`${kind}\0${value}`).digest().readUInt32BE(0);

function avatar(faker) {
  const hue = faker.number.int({ min: 0, max: 359 });
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='hsl(${hue},45%,70%)'/><circle cx='32' cy='26' r='12' fill='white' opacity='.7'/><circle cx='32' cy='64' r='22' fill='white' opacity='.7'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const MAKE = {
  name: (f) => f.person.fullName(),
  first: (f) => f.person.firstName(),
  last: (f) => f.person.lastName(),
  username: (f) => f.internet.username().toLowerCase(),
  email: (f) => f.internet.email().toLowerCase(),
  phone: (f) => f.phone.number(),
  address: (f) => f.location.streetAddress(),
  city: (f) => f.location.city(),
  zip: (f) => f.location.zipCode(),
  company: (f) => f.company.name(),
  avatar,
  text: (f, len) => f.lorem.words(Math.max(1, Math.round(len / 6))),
};
// Kinds whose fake is a rigid format: never cut or padded to length.
const RIGID = new Set(['email', 'phone', 'zip', 'avatar', 'username']);
// Kinds that grow to the original's length (a street, a note) rather than staying short (a name).
const GROWS = new Set(['address', 'company', 'text']);

/** Cuts a fake that is much longer than the original; grows a free-text one that is much shorter. */
function fit(faker, kind, fake, len) {
  if (RIGID.has(kind) || len < 1) return fake;
  let out = fake;
  if (out.length > len + 3) {
    const cut = out.slice(0, len + 1);
    const space = cut.lastIndexOf(' ');
    out = (space > 0 ? cut.slice(0, space) : out.slice(0, len)).replace(/[\s,.-]+$/, '');
  }
  while (GROWS.has(kind) && out.length < len * 0.7) out += ` ${faker.lorem.word()}`;
  return out || fake.slice(0, Math.max(1, len));
}

/** Same digits count, same punctuation: "$12.50" -> "$47.31". */
function maskDigits(faker, text) {
  return text.replace(/\d/g, () => String(faker.number.int({ min: 0, max: 9 })));
}

export function createAnonymizer(faker, { keys = [], allow = [] } = {}) {
  const extra = new Set(keys.map(normalize));
  const memo = new Map(); // `${kind}\0${real}` -> fake
  const produced = new Set(); // every fake handed out: the final check does not flag these

  const fake = (kind, value) => {
    const id = `${kind}\0${value}`;
    if (memo.has(id)) return memo.get(id);
    faker.seed(seedOf(kind, value));
    const made = fit(faker, kind, MAKE[kind](faker, value.length), value.length);
    memo.set(id, made);
    produced.add(made);
    return made;
  };

  /** The kind of a free text from its shape. */
  const shapeOf = (text) => {
    if (IS_EMAIL.test(text)) return 'email';
    if (IS_PHONE.test(text)) return 'phone';
    if (/^[\p{Lu}][\p{L}'’.-]*(?:\s+[\p{Lu}][\p{L}'’.-]*){0,3}$/u.test(text)) return 'name';
    return 'text';
  };

  const known = () =>
    [...memo.keys()]
      .map((id) => id.split('\0'))
      .filter(([, real]) => real.length >= 3)
      .sort((a, b) => b[1].length - a[1].length || (a[1] < b[1] ? -1 : 1));

  const api = {
    /** Walks parsed JSON: a string under a personal key (or inside an array/object held by one) is faked. */
    json(value, kind = null) {
      if (typeof value === 'string') {
        if (!kind || !value.trim()) return value;
        const k = kind === 'auto' ? shapeOf(value.trim()) : kind;
        return fake(k === 'avatar' && !/^(https?:|data:|\/)/i.test(value) ? 'text' : k, value);
      }
      if (Array.isArray(value)) return value.map((v) => api.json(v, kind));
      if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = api.json(v, kindOfKey(k, extra));
        return out;
      }
      return value;
    },

    /** A text from the page: known real values first, then a fake of the text's own kind. Whitespace is kept. */
    text(raw) {
      const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
      if (!core) return raw;
      let out = core;
      let hit = false;
      for (const [kind, real] of known()) {
        if (out.includes(real)) {
          out = out.split(real).join(memo.get(`${kind}\0${real}`));
          hit = true;
        }
      }
      // An email or phone inside a longer text ("grace@navy.mil / 202-555-0188") is faked where it stands.
      const embedded = out.replace(EMAIL, (m) => fake('email', m)).replace(PHONE, (m) => fake('phone', m));
      if (embedded !== out) {
        out = embedded;
        hit = true;
      }
      if (!hit) {
        const kind = shapeOf(core);
        if (!/\p{L}/u.test(core) && /\d/.test(core)) {
          faker.seed(seedOf('digits', core));
          out = maskDigits(faker, core);
          produced.add(out);
        } else if (/\p{L}/u.test(core)) out = fake(kind, core);
      }
      return lead + out + trail;
    },

    /** What still looks personal. `candidates`: [{ value, where }]. Matches made by the anonymiser or allowed are skipped. */
    findings(candidates) {
      const fine = (match) => [...produced, ...allow].some((ok) => ok.includes(match));
      const out = [];
      for (const { value: raw, where } of candidates) {
        // An inline image's payload is not data about anyone.
        const value = raw.replace(DATA_URL, 'data:');
        // A URL's path holds bundle hashes ("main.4f2a…chunk.js"): tokens are only looked for in its query and fragment.
        const tokenScope = value.replace(URL_PATH, '');
        const seen = new Set();
        const scan = (kind, re, accept = () => true, text = value) => {
          for (const m of text.matchAll(re)) {
            const match = m[0].trim();
            if ([...seen].some((s) => s.includes(match)) || !accept(match) || fine(match)) continue;
            seen.add(match);
            out.push({ kind, match, where });
          }
        };
        scan('email', EMAIL);
        scan('phone', PHONE, (m) => m.replace(/\D/g, '').length >= 7 && !THOUSANDS.test(m));
        scan('token (JWT)', JWT);
        scan('token (Bearer)', BEARER);
        scan('token (hex)', HEX, undefined, tokenScope);
        scan('token (base64)', BASE64, (m) => /\d/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m), tokenScope);
      }
      return out;
    },
  };
  return api;
}
