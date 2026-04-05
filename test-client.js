const http = require('http');

const data = JSON.stringify({
    myChampion: 'LeeSin',
    role: 'jungle',
    allies: ['Ornn', 'Ahri', 'Jinx', 'Lulu'],
    enemies: ['Darius', 'KhaZix', 'Zed', 'Vayne', 'Nautilus'],
    patch: '26.5', // Inject override here
    model: 'gemini-3.1-pro-preview'
});

const options = {
    hostname: '127.0.0.1',
    port: 3210,
    path: '/api/build-stream',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('--- STARTING STREAM HTTP TEST ---');
console.log('Sending POST to http://127.0.0.1:3210/api/build-stream');

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    const startTime = Date.now();
    let firstChunkTime = 0;
    let fullText = '';

    let timeToFirstRune = 0;
    let timeToFullBuild = 0;
    let patchUsed = '';

    res.on('data', (d) => {
        if (firstChunkTime === 0) {
            firstChunkTime = Date.now() - startTime;
        }
        const chunkStr = d.toString();
        const lines = chunkStr.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const payloadStr = line.replace('data: ', '').trim();
                if (!payloadStr) continue;
                try {
                    const payload = JSON.parse(payloadStr);
                    if (payload.patchUsed) patchUsed = payload.patchUsed;

                    if (payload.chunk) {
                        fullText += payload.chunk;
                        process.stdout.write(payload.chunk);

                        if (timeToFirstRune === 0 && fullText.includes('Keystone:')) {
                            timeToFirstRune = Date.now() - startTime;
                            process.stdout.write(`\n\n>>> [METRIC: First useful rune output seen at ${(timeToFirstRune / 1000).toFixed(2)}s] <<<\n\n`);
                        }
                        if (timeToFullBuild === 0 && fullText.includes('WIN CONDITION')) {
                            timeToFullBuild = Date.now() - startTime;
                            process.stdout.write(`\n\n>>> [METRIC: Full core build seen at ${(timeToFullBuild / 1000).toFixed(2)}s] <<<\n\n`);
                        }
                    }
                } catch (e) {
                }
            }
        }
    });

    res.on('end', () => {
        const totalTime = Date.now() - startTime;
        console.log('\n\n--- USABILITY METRICS ---');
        console.log(`Server-returned patchUsed: ${patchUsed}`);
        console.log(`Time to first token (API Latency): ${(firstChunkTime / 1000).toFixed(2)}s`);
        console.log(`Time to first useful rune: ${(timeToFirstRune / 1000).toFixed(2)}s`);
        console.log(`Time to full core build: ${(timeToFullBuild / 1000).toFixed(2)}s`);
        console.log(`Total generation duration: ${(totalTime / 1000).toFixed(2)}s`);

        console.log('\n--- ANALYSIS CONSTRAINT CHECK ---');
        const winConMatch = fullText.match(/WIN CONDITION\n(.*?)\n\n/s);
        const winConLines = winConMatch ? winConMatch[1].trim().split('\n') : [];

        if (winConLines.length > 2) {
            console.log(`❌ WIN CONDITION failed constraint (Too long, ${winConLines.length} lines)`);
        } else {
            console.log(`✅ WIN CONDITION constraint passed.`);
        }
    });
});

req.on('error', (error) => {
    console.error('Request failing. Is backend running?', error.message);
});

req.write(data);
req.end();
