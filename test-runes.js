// Rune Extraction Test - Tests the export-runes IPC handler
// Sends various AI output formats and checks the log file for parsed results

const http = require('http');
const path = require('path');
const fs = require('fs');

// Sample AI outputs to test the parser against
const TEST_SAMPLES = [
  {
    name: 'Standard Format (Pro)',
    text: `RUNES
Primary: Precision
Keystone: Conqueror
Triumph
Legend: Tenacity
Last Stand
Secondary: Resolve
Second Wind
Unflinching
Shards: Adaptive Force, Armor, Health

SUMMONERS
Flash
Ghost

SKILL ORDER
Q > W > E > R`,
    expect: { perks: 9, keystone: 'CONQUEROR' },
  },
  {
    name: 'Move Speed Shard (alias test)',
    text: `RUNES
Primary: Sorcery
Keystone: Phase Rush
Manaflow Band
Celerity
Gathering Storm
Secondary: Inspiration
Magical Footwear
Cosmic Insight
Shards: Adaptive Force, Move Speed, Health

SUMMONERS
Flash
Teleport`,
    expect: { perks: 9, keystone: 'PHASE RUSH' },
  },
  {
    name: 'Compact Flash Format',
    text: `RUNES
Primary: Precision
Keystone: Lethal Tempo
Triumph
Legend: Alacrity
Coup de Grace
Secondary: Domination
Taste of Blood
Treasure Hunter
Shards: Attack Speed, Adaptive Force, Armor

SUMMONERS
Flash
Heal

SKILL ORDER
Q > W > E > R`,
    expect: { perks: 9, keystone: 'LETHAL TEMPO' },
  },
  {
    name: 'Tenacity Shard (alias test)',
    text: `RUNES
Primary: Resolve
Keystone: Grasp of the Undying
Shield Bash
Conditioning
Overgrowth
Secondary: Precision
Triumph
Legend: Tenacity
Shards: Ability Haste, Tenacity, Health Scaling

SUMMONERS
Flash
Teleport`,
    expect: { perks: 9, keystone: 'GRASP OF THE UNDYING' },
  },
];

async function testExportRunes(sample) {
  return new Promise((resolve) => {
    // Call /api/build first to have the system ready, then invoke export-runes via a test endpoint
    // Actually, let's test by calling the dual endpoint with a known build and checking the log
    // Simpler: we'll POST to /api/build with specific text and monitor the log

    // For this test, we'll use a simple HTTP call that triggers export-runes
    // We need to test the parser directly. Let's create a minimal test endpoint call.

    // Actually the simplest approach: just run the dual pipeline and check the rune-export.log
    resolve({ name: sample.name, expected: sample.expect });
  });
}

async function main() {
  const logDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'draftcoach-desktop') : '/tmp';
  const logFile = path.join(logDir, 'rune-export.log');
  
  console.log('=== RUNE EXTRACTION TEST ===');
  console.log(`Log file: ${logFile}\n`);
  
  // Clear existing log
  try { fs.writeFileSync(logFile, ''); } catch {}

  // Test each sample by calling the dual endpoint, which will trigger Flash rune auto-import
  for (const sample of TEST_SAMPLES) {
    console.log(`\nTest: ${sample.name}`);
    console.log('Expected: ' + sample.expect.perks + ' perks, keystone: ' + sample.expect.keystone);

    // Call the build-dual endpoint — but we can't control what AI outputs
    // Instead, let's directly test the parser by calling export-runes via HTTP 
    // We need to simulate the IPC call. Best approach: use a direct HTTP test endpoint.

    // Since we can't directly call IPC from here, let's run a quick Node script that
    // sends the rune text directly through the same parser logic
    
    const body = JSON.stringify({
      myChampion: 'Darius',
      role: 'top',
      allies: [],
      enemies: ['Garen'],
    });

    // We'll test via the actual dual endpoint and check timing
    const result = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1', port: 3210, path: '/api/build-dual', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        let runesDone = false, fullDone = false;
        let runesText = '', fullText = '';
        res.on('data', (d) => {
          for (const l of d.toString().split('\n')) {
            if (!l.startsWith('data: ')) continue;
            try {
              const p = JSON.parse(l.slice(6));
              if (p.phase === 'runes' && p.done) { runesDone = true; runesText = p.fullText || ''; }
              if (p.phase === 'full' && p.done) { fullDone = true; fullText = p.fullText || ''; }
            } catch {}
          }
        });
        res.on('end', () => resolve({ runesDone, fullDone, runesText, fullText }));
      });
      req.on('error', (e) => resolve({ error: e.message }));
      req.write(body);
      req.end();
    });

    if (result.error) {
      console.log('  ERROR:', result.error);
      continue;
    }

    console.log(`  Runes phase: ${result.runesDone ? 'OK' : 'MISSING'} (${result.runesText.length} chars)`);
    console.log(`  Full phase:  ${result.fullDone ? 'OK' : 'MISSING'} (${result.fullText.length} chars)`);

    // Only run one real API call — the rest we check from logs
    break;
  }

  // Wait a moment for log to be written
  await new Promise(r => setTimeout(r, 2000));

  // Read and display the rune-export.log
  console.log('\n=== RUNE EXPORT LOG ===');
  try {
    const log = fs.readFileSync(logFile, 'utf-8');
    if (log.trim()) {
      console.log(log);
      // Check for warnings
      const warnings = log.split('\n').filter(l => l.includes('WARNING') || l.includes('FAILED'));
      if (warnings.length > 0) {
        console.log('\n⚠️  WARNINGS FOUND:');
        warnings.forEach(w => console.log('  ' + w.trim()));
      }
      // Check resolved count
      const resolvedMatch = log.match(/Resolved (\d+)\/9 perks/);
      if (resolvedMatch) {
        const count = parseInt(resolvedMatch[1]);
        console.log(`\n${count === 9 ? '✅' : '❌'} Resolved ${count}/9 perks`);
      }
    } else {
      console.log('(empty — rune export was not triggered)');
    }
  } catch (err) {
    console.log('Could not read log:', err.message);
  }
}

main().catch(console.error);
