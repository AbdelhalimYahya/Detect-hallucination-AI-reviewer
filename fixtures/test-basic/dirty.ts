import * as url from 'url';

const parsed = url.parse('https://example.com/path');
const resolved = url.resolve('https://example.com', '/api');
