// BSC cycle profit checker — accounts for slippage and gas (PancakeSwap, mainnet)
// Usage: node index.js
require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');

const PANCAKE_TOKENLIST = 'https://tokens.pancakeswap.finance/pancakeswap-extended.json';
const PANCAKE_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const BSC_RPC = process.env.BSC_RPC || 'https://bsc-dataseed.binance.org/';

const provider = new ethers.JsonRpcProvider(BSC_RPC);

// ABIs
const ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] memory path) view returns (uint256[] memory amounts)'
];
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

const router = new ethers.Contract(PANCAKE_ROUTER, ROUTER_ABI, provider);

// Config
const SLIPPAGE_PERCENT = parseFloat(process.env.SLIPPAGE_PERCENT || '0.5');
const GAS_PRICE_GWEI_OVERRIDE = process.env.GAS_PRICE_GWEI
  ? BigInt(Math.round(parseFloat(process.env.GAS_PRICE_GWEI) * 1e9))
  : null;
const BASE_GAS = BigInt(parseInt(process.env.BASE_GAS || '120000', 10));
const PER_SWAP_GAS = BigInt(parseInt(process.env.PER_SWAP_GAS || '60000', 10));

async function fetchTokenList() {
  const res = await axios.get(PANCAKE_TOKENLIST, { timeout: 10000 });
  return res.data.tokens || res.data;
}

function findTokenAddress(tokenList, symbol) {
  const matches = tokenList.filter(t => t.symbol?.toUpperCase() === symbol.toUpperCase());
  if (!matches.length) return null;
  const forBSC = matches.find(t => Number(t.chainId) === 56);
  if (forBSC) return forBSC.address;
  return matches[0].address;
}

async function getDecimals(address) {
  try {
    const token = new ethers.Contract(address, ERC20_ABI, provider);
    return Number(await token.decimals());
  } catch {
    return 18;
  }
}

function applySlippage(amount, slippagePercent) {
  const bp = Math.round(slippagePercent * 100);
  return (amount * BigInt(10000 - bp)) / BigInt(10000);
}

async function getGasPriceWei() {
  if (GAS_PRICE_GWEI_OVERRIDE) return GAS_PRICE_GWEI_OVERRIDE;
  try {
    return await provider.getGasPrice();
  } catch {
    return BigInt(5e9);
  }
}

async function convertGasWeiToStartToken(gasWei, wbnb, start) {
  try {
    if (start.toLowerCase() === wbnb.toLowerCase()) return gasWei;
    const amounts = await router.getAmountsOut(gasWei, [wbnb, start]);
    return amounts.at(-1);
  } catch {
    return null;
  }
}

async function checkPath(path, startAmount = '1', tokenList) {
  const addresses = path.map(sym =>
    ethers.getAddress(findTokenAddress(tokenList, sym))
  );

  const wbnb = findTokenAddress(tokenList, 'WBNB');
  const decimals = await getDecimals(addresses[0]);
  const amountIn = ethers.parseUnits(startAmount, decimals);

  const amounts = await router.getAmountsOut(amountIn, addresses);
  const finalAmount = applySlippage(amounts.at(-1), SLIPPAGE_PERCENT);

  const gasLimit = BASE_GAS + PER_SWAP_GAS * BigInt(addresses.length - 1);
  const gasWei = gasLimit * (await getGasPriceWei());
  const gasInStart = await convertGasWeiToStartToken(gasWei, wbnb, addresses[0]);

  const finalAfterGas = gasInStart ? finalAmount - gasInStart : finalAmount;
  const profit = finalAfterGas > amountIn ? finalAfterGas - amountIn : BigInt(0);

  return { path, profit, amountIn, finalAfterGas, decimals };
}

(async () => {
  const tokenList = await fetchTokenList();
  const paths = [
    ['WBNB', 'BUSD', 'USDT', 'WBNB'],
    ['WBNB', 'USDT', 'BTCB', 'WBNB'],
    ['WBNB', 'CAKE', 'BUSD', 'WBNB']
  ];

  for (const path of paths) {
    const r = await checkPath(path, '1', tokenList);
    console.log(
      `${path.join(' -> ')} | Profit: ${ethers.formatUnits(r.profit, r.decimals)}`
    );
  }
})();
