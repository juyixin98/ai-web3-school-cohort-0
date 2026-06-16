// DeFi Scout — Entry point
// Run individual scanners or aggregate via: npm run scan:all

console.log("🦅 DeFi Scout — AI-Driven DeFi Analysis Assistant\n");
console.log("Available scanners:");
console.log("  npm run scan:dex      — DEX price arbitrage");
console.log("  npm run scan:lending  — Lending rate comparison");
console.log("  npm run scan:staking  — Staking yield comparison");
console.log("\nRun a specific scanner to see results.\n");

import("./dex/scanner.js").catch(() => {});
import("./lending/scanner.js").catch(() => {});
import("./staking/scanner.js").catch(() => {});
