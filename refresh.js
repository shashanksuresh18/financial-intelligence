async function testAPI(company) {
  const { request } = await import('node:http');

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ company: company, forceRefresh: true });
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/analyze',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    const req = request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("Refreshing Apple...");
  await testAPI("Apple");
  console.log("Apple done. Refreshing SpaceX...");
  await testAPI("SpaceX");
  console.log("SpaceX done.");
}
run();
