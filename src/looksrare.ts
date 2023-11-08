import { LooksRare, ChainId, CollectionType, StrategyType } from "@looksrare/sdk-v2";
import { ethers } from "ethers";

const NETWORK = process.env.MAINNET_NETWORK;
const provider = new ethers.providers.JsonRpcProvider(NETWORK);

async function main() {
    const looksrare = new LooksRare(ChainId.MAINNET, provider);
}
main();
