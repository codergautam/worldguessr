// logged on first run
import colors from 'colors';
console.log('WorldGuessr'.rainbow.bold.underline+'\nA game by '+'Gautam\n'.italic+'https://github.com/codergautam/worldguessr'.cyan.underline+'\n');
const version = Number(process.version.substring(1).split('.')[0])
if(version < 20) {
  console.log('NodeJS version under v20 detected.\nIt is recommended to upgrade to avoid facing issues.\nWe do not test bugs for these versions.\n'.red);
}