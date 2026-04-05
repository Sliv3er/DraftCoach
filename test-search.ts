
// Verification script for the search logic
import { searchElitePlayers } from './apps/web/src/app/actions';

async function test() {
  console.log("--- Testing Full Riot ID Lookup ---");
  // This will try to hit the Riot API. It might fail if no API key is set in the shell,
  // but we can at least check if it handles the '#' logic correctly.
  try {
    const results = await searchElitePlayers("Hide on bush#KR1", "KR");
    console.log("Results for Hide on bush#KR1:", JSON.stringify(results, null, 2));
  } catch (e) {
    console.log("Search failed (likely due to missing API key in local shell):", e.message);
  }

  console.log("\n--- Testing Prefix Search ---");
  try {
    const results = await searchElitePlayers("T1", "KR");
    console.log("Results for 'T1':", JSON.stringify(results, null, 2));
  } catch (e) {
    console.log("Search failed:", e.message);
  }
}

test();
