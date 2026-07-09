import Table from 'cli-table3';
const t = new Table({ colWidths: [10] });
t.push(['hello']);
process.stdout.write(t.toString() + '\n');
console.log('end');
