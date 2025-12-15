# bsc-cycle-profit-checker
This repository contains a Node.js script that simulates multi-hop swap cycles on PancakeSwap (BSC mainnet) and reports profitability after accounting for slippage and estimated gas.

How it runs

A GitHub Actions workflow (.github/workflows/check.yml) runs the checker on a schedule (default every 10 minutes) and can also be dispatched manually. The workflow uploads the latest output and commits docs/latest.txt so you can view it on GitHub Pages.


Required repository secrets (Settings → Secrets and variables → Actions)

BSC_RPC

SLIPPAGE_PERCENT

BASE_GAS

PER_SWAP_GAS

GAS_PRICE_GWEI (optional)
