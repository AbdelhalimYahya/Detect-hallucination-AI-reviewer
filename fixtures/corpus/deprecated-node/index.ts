import * as url from 'url';
import * as querystring from 'querystring';

const parsed = url.parse('https://example.com/path');

const buf = new Buffer('hello world');

const qs = require('querystring');

function legacyQueryParse(input: string) {
  return qs.parse(input);
}
