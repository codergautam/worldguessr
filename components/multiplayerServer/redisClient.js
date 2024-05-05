import { createClient } from 'redis';

console.log('Connecting to Redis');
const client = createClient({
  password: process.env.REDIS_PASSWORD,
  socket: {
      host: process.env.REDIS_HOST,
      port: 14367,
  },
});
await client.connect();

// check how many clients are connected
const clients = await client.clientList();
console.log('Connected clients:', clients.length);
// if its above 20 kick the oldest client
if(clients.length > 10) {
  console.log('Kicking oldest client');
  const oldestClient = clients.sort((a, b) => a.id - b.id)[0];
  await client.sendCommand(['CLIENT', 'KILL', 'ID', oldestClient.id.toString()]);
}

// check db size
const dbSize = await client.dbSize();
// if over 10mb, remove oldest key
console.log('DB size:', dbSize, 'keys');
if (dbSize > 500) {
  console.log('DB size over 500, trimming');
  const keys = await client.keys('*');
  let values = await Promise.all(keys.map(key => client.get(key)));
  values = values.filter(v => v !== null).map(v => JSON.parse(v));
  const oldestKeys = values.sort((a, b) => a.s - b.s).slice(0, values.length - 300);
  console.log('Deleting', oldestKeys.length, 'keys');
  await Promise.all(oldestKeys.map(key => client.del(key.id.toString())));
}


export default client;